import pc from 'picocolors';
import ora from 'ora';
import { StateLedger } from '../../core/delta/ledger.js';
import { MemoryVectorSink } from '../../sinks/memory-sink.js';
import { QdrantVectorSink } from '../../sinks/qdrant-sink.js';
import { PineconeVectorSink } from '../../sinks/pinecone-sink.js';
import { MockEmbeddingProvider } from '../../core/embeddings/mock-provider.js';
import { OpenAIEmbeddingProvider } from '../../core/embeddings/openai-provider.js';
import { LedgerReconciler } from '../../core/sync/reconciler.js';

export async function reconcileCommand(options: {
  repair?: boolean;
  sink?: string;
  db?: string;
}): Promise<void> {
  const dbPath = options.db ?? process.env.VECTORSYNC_DB_PATH ?? '.vectorsync/ledger.db';
  const ledger = new StateLedger(dbPath);

  let sink =
    options.sink === 'qdrant'
      ? new QdrantVectorSink()
      : options.sink === 'pinecone'
      ? new PineconeVectorSink()
      : new MemoryVectorSink();

  let embeddingProvider = process.env.OPENAI_API_KEY
    ? new OpenAIEmbeddingProvider()
    : new MockEmbeddingProvider();

  const reconciler = new LedgerReconciler(ledger, sink, embeddingProvider);

  const spinner = ora(
    pc.cyan(
      options.repair
        ? 'Reconciling and repairing drift between ledger and vector sink...'
        : 'Auditing consistency between ledger and vector sink...'
    )
  ).start();

  try {
    const report = await reconciler.reconcile(Boolean(options.repair));

    if (report.isConsistent) {
      spinner.succeed(
        pc.green(`Ledger and vector sink are in 100% PARITY (${report.durationMs}ms)`)
      );
    } else if (options.repair) {
      spinner.succeed(
        pc.green(
          `Drift repaired: ${report.repairedCount} inconsistencies fixed (${report.durationMs}ms)`
        )
      );
    } else {
      spinner.warn(
        pc.yellow(
          `Drift detected: ${report.missingInSinkCount} missing, ${report.phantomInSinkCount} phantom vectors (${report.durationMs}ms)`
        )
      );
    }

    console.log('\n' + pc.bold(pc.cyan('=== Reconciliation Audit Report ===')));
    console.log(`State Ledger Chunks:  ${pc.bold(pc.white(report.totalLedgerChunks))}`);
    console.log(`Vector Sink Points:   ${pc.bold(pc.magenta(report.totalSinkVectors))}`);
    console.log(`Missing in Sink:      ${report.missingInSinkCount > 0 ? pc.red(report.missingInSinkCount) : pc.green(0)}`);
    console.log(`Phantom in Sink:      ${report.phantomInSinkCount > 0 ? pc.yellow(report.phantomInSinkCount) : pc.green(0)}`);
    console.log(`Repaired Mutated:     ${pc.bold(pc.green(report.repairedCount))}`);
    console.log(`Consistency Status:   ${report.isConsistent ? pc.bold(pc.green('CONSISTENT')) : pc.bold(pc.yellow('DRIFT DETECTED'))}\n`);

    if (!report.isConsistent && !options.repair) {
      console.log(pc.cyan('Tip: Run with --repair to automatically restore parity:\n  vectorsync reconcile --repair\n'));
    }
  } catch (err: any) {
    spinner.fail(pc.red(`Reconciliation failed: ${err.message}`));
  } finally {
    ledger.close();
  }
}
