import pc from 'picocolors';
import { StateLedger } from '../../core/delta/ledger.js';
import { SyncPipeline } from '../../core/sync/sync-pipeline.js';
import { MemoryVectorSink } from '../../sinks/memory-sink.js';
import { QdrantVectorSink } from '../../sinks/qdrant-sink.js';
import { MockEmbeddingProvider } from '../../core/embeddings/mock-provider.js';
import { OpenAIEmbeddingProvider } from '../../core/embeddings/openai-provider.js';
import { FilesystemWatcher } from '../../sources/filesystem-watcher.js';
import { WebhookReceiver } from '../../sources/webhook-receiver.js';

export async function listenCommand(options: {
  source?: 'filesystem' | 'webhook';
  dir?: string;
  port?: number;
  db?: string;
  sink?: string;
}): Promise<void> {
  const source = options.source ?? 'filesystem';
  const dbPath = options.db ?? process.env.VECTORSYNC_DB_PATH ?? '.vectorsync/ledger.db';

  const ledger = new StateLedger(dbPath);
  const sink = options.sink === 'qdrant' ? new QdrantVectorSink() : new MemoryVectorSink();
  const embeddingProvider = process.env.OPENAI_API_KEY
    ? new OpenAIEmbeddingProvider()
    : new MockEmbeddingProvider();

  const pipeline = new SyncPipeline({
    ledger,
    sink,
    embeddingProvider,
  });

  console.log('\n' + pc.bold(pc.cyan('=== VectorSync Ingestion Listener Active ===')) + '\n');
  console.log(`State Ledger: ${pc.dim(dbPath)}`);
  console.log(`Vector Sink:  ${pc.bold(sink.sinkName)}`);
  console.log(`Embeddings:   ${pc.bold(embeddingProvider.name)}\n`);

  if (source === 'filesystem') {
    const watchDir = options.dir ?? './docs';
    const watcher = new FilesystemWatcher(pipeline, { directory: watchDir });

    console.log(pc.green(`Watching directory for file mutations: ${pc.bold(watchDir)}`));
    console.log(pc.dim('Press Ctrl+C to terminate listener.\n'));

    watcher.on('synced', ({ filePath, result }) => {
      console.log(
        `${pc.green('✔')} Synced ${pc.bold(filePath)} [${result.operation}] · ${pc.green(result.plan.skippedUnchangedCount + ' skipped')} · ${pc.yellow(result.plan.toUpdateTextCount + ' re-embedded')} · ${result.durationMs}ms`
      );
    });

    watcher.on('deleted', ({ filePath }) => {
      console.log(`${pc.red('✖')} Pruned vectors for deleted file: ${pc.bold(filePath)}`);
    });

    watcher.on('error', (err) => {
      console.error(pc.red(`Watcher error: ${err.message}`));
    });

    watcher.start();
  } else {
    const port = Number(options.port) || 50091;
    const webhook = new WebhookReceiver(pipeline, { port });
    await webhook.start();

    console.log(pc.green(`Webhook CDC receiver listening on http://localhost:${port}/webhook`));
    console.log(pc.dim('POST JSON payloads with: { documentId, operation, content, metadata }\n'));

    pipeline.on('sync', (result) => {
      console.log(
        `${pc.cyan('⚡')} Webhook event: ${pc.bold(result.documentId)} [${result.operation}] · ${pc.green(result.plan.tokensSaved + ' tokens saved')} · ${result.durationMs}ms`
      );
    });
  }

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log(pc.yellow('\nShutting down listener...'));
    ledger.close();
    process.exit(0);
  });
}
