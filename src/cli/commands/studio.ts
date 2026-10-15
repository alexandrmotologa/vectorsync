import pc from 'picocolors';
import { StateLedger } from '../../core/delta/ledger.js';
import { SyncPipeline } from '../../core/sync/sync-pipeline.js';
import { MemoryVectorSink } from '../../sinks/memory-sink.js';
import { MockEmbeddingProvider } from '../../core/embeddings/mock-provider.js';
import { LocalServer } from '../../server/local-server.js';

export async function studioCommand(options: {
  port?: number;
  db?: string;
}): Promise<void> {
  const port = Number(options.port) || 50092;
  const dbPath = options.db ?? process.env.VECTORSYNC_DB_PATH ?? '.vectorsync/ledger.db';

  const ledger = new StateLedger(dbPath);
  const sink = new MemoryVectorSink();
  const embeddingProvider = new MockEmbeddingProvider();

  const pipeline = new SyncPipeline({
    ledger,
    sink,
    embeddingProvider,
  });

  const server = new LocalServer(pipeline, { port });
  await server.start();

  console.log('\n' + pc.bold(pc.cyan('╔══════════════════════════════════════════════════════╗')));
  console.log(pc.bold(pc.cyan('║               VectorSync Visual Studio               ║')));
  console.log(pc.bold(pc.cyan('╚══════════════════════════════════════════════════════╝')) + '\n');
  console.log(`  ${pc.bold('Studio Web UI:')}      ${pc.underline(pc.cyan(`http://localhost:${port}`))}`);
  console.log(`  ${pc.bold('REST API Endpoint:')}  ${pc.dim(`http://localhost:${port}/api/stats`)}`);
  console.log(`  ${pc.bold('Live SSE Stream:')}    ${pc.dim(`http://localhost:${port}/api/events`)}`);
  console.log(`  ${pc.bold('State Ledger DB:')}    ${pc.dim(dbPath)}\n`);
  console.log(pc.dim('Press Ctrl+C to stop the studio server.\n'));

  process.on('SIGINT', async () => {
    console.log(pc.yellow('\nClosing studio server...'));
    await server.stop();
    ledger.close();
    process.exit(0);
  });
}
