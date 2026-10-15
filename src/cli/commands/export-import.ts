import path from 'node:path';
import pc from 'picocolors';
import { StateLedger } from '../../core/delta/ledger.js';
import { MemoryVectorSink } from '../../sinks/memory-sink.js';
import { MockEmbeddingProvider } from '../../core/embeddings/mock-provider.js';
import { LedgerReconciler } from '../../core/sync/reconciler.js';

export function exportCommand(
  outputPath: string,
  options: { db?: string }
): void {
  const dbPath = options.db ?? process.env.VECTORSYNC_DB_PATH ?? '.vectorsync/ledger.db';
  const resolvedOut = path.resolve(outputPath);

  const ledger = new StateLedger(dbPath);
  const sink = new MemoryVectorSink();
  const embeddingProvider = new MockEmbeddingProvider();
  const reconciler = new LedgerReconciler(ledger, sink, embeddingProvider);

  try {
    const payload = reconciler.exportState(resolvedOut);
    console.log('\n' + pc.green(`✔ Ledger exported successfully to ${pc.bold(resolvedOut)}`));
    console.log(`  Exported ${pc.bold(payload.documents.length)} documents and ${pc.bold(payload.chunks.length)} chunks.\n`);
  } catch (err: any) {
    console.error(pc.red(`Export error: ${err.message}`));
  } finally {
    ledger.close();
  }
}

export function importCommand(
  inputPath: string,
  options: { db?: string }
): void {
  const dbPath = options.db ?? process.env.VECTORSYNC_DB_PATH ?? '.vectorsync/ledger.db';
  const resolvedIn = path.resolve(inputPath);

  const ledger = new StateLedger(dbPath);
  const sink = new MemoryVectorSink();
  const embeddingProvider = new MockEmbeddingProvider();
  const reconciler = new LedgerReconciler(ledger, sink, embeddingProvider);

  try {
    const res = reconciler.importState(resolvedIn);
    console.log('\n' + pc.green(`✔ Ledger imported successfully from ${pc.bold(resolvedIn)}`));
    console.log(`  Restored ${pc.bold(res.importedDocs)} documents and ${pc.bold(res.importedChunks)} chunks.\n`);
  } catch (err: any) {
    console.error(pc.red(`Import error: ${err.message}`));
  } finally {
    ledger.close();
  }
}
