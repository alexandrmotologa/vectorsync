import pc from 'picocolors';
import ora from 'ora';
import { StateLedger } from '../../core/delta/ledger.js';
import { SyncPipeline } from '../../core/sync/sync-pipeline.js';
import { MemoryVectorSink } from '../../sinks/memory-sink.js';
import { MockEmbeddingProvider } from '../../core/embeddings/mock-provider.js';
import { MutationDlq } from '../../core/sync/dlq.js';

export async function dlqCommand(
  action: 'list' | 'process' | 'purge' = 'list',
  options: { db?: string }
): Promise<void> {
  const dbPath = options.db ?? process.env.VECTORSYNC_DB_PATH ?? '.vectorsync/ledger.db';
  const dlq = new MutationDlq(dbPath);

  if (action === 'list') {
    const stats = dlq.getStats();
    const items = dlq.listPending(20);

    console.log('\n' + pc.bold(pc.cyan('=== Dead-Letter Queue (DLQ) Status ===')) + '\n');
    console.log(`Pending Mutations: ${pc.yellow(stats.totalPending)}`);
    console.log(`Failed (Max Retries): ${pc.red(stats.totalFailed)}`);
    console.log(`Resolved: ${pc.green(stats.totalResolved)}\n`);

    if (items.length > 0) {
      console.log(pc.bold('Pending DLQ Items:'));
      for (const item of items) {
        console.log(
          `  ${pc.bold(item.id)} · ${pc.cyan(item.documentId)} [${item.operation}] · retries: ${item.retryCount}/${item.maxRetries} · next: ${new Date(item.nextRetryAt).toLocaleTimeString()}`
        );
        console.log(`    ${pc.red('Error:')} ${pc.dim(item.errorMessage)}`);
      }
      console.log('');
    }
  } else if (action === 'process') {
    const ledger = new StateLedger(dbPath);
    const pipeline = new SyncPipeline({
      ledger,
      sink: new MemoryVectorSink(),
      embeddingProvider: new MockEmbeddingProvider(),
    });

    const spinner = ora('Processing pending DLQ mutations...').start();
    const res = await dlq.processPending(pipeline);

    spinner.succeed(
      pc.green(
        `DLQ processed: ${res.succeeded} succeeded, ${res.failed} failed/re-queued out of ${res.processed} items.`
      )
    );
    ledger.close();
  } else if (action === 'purge') {
    const count = dlq.purgeResolved();
    console.log('\n' + pc.green(`Purged ${count} resolved entries from DLQ.\n`));
  }
}
