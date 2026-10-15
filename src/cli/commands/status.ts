import pc from 'picocolors';
import { StateLedger } from '../../core/delta/ledger.js';

export function statusCommand(options: { db?: string }): void {
  const dbPath = options.db ?? process.env.VECTORSYNC_DB_PATH ?? '.vectorsync/ledger.db';
  const ledger = new StateLedger(dbPath);
  const stats = ledger.getStats();
  const docs = ledger.getAllDocuments();

  console.log('\n' + pc.bold(pc.cyan('=== VectorSync Ledger Status ===')) + '\n');
  console.log(`Database Location:   ${pc.dim(dbPath)}`);
  console.log(`Indexed Documents:   ${pc.bold(pc.white(stats.totalDocuments))}`);
  console.log(`Active Vector Chunks:${pc.bold(pc.magenta(stats.totalChunks))}`);
  console.log(`CDC Events Processed:${pc.bold(pc.yellow(stats.syncEventCount))}`);
  console.log(`Total Tokens Saved:  ${pc.bold(pc.green(stats.totalTokensSaved.toLocaleString()))}`);
  console.log(`Total Cost Saved:    ${pc.bold(pc.green(`$${stats.totalCostSavedUsd.toFixed(4)} USD`))}\n`);

  if (docs.length > 0) {
    console.log(pc.bold(pc.cyan('Recent Indexed Documents:')));
    for (const doc of docs.slice(0, 5)) {
      console.log(
        `  ${pc.bold(doc.id)} · ${pc.yellow(doc.totalChunks + ' chunks')} · hash: ${pc.dim(doc.contentHash.slice(0, 12))} · synced: ${pc.dim(new Date(doc.lastSyncedAt).toLocaleString())}`
      );
    }
    console.log('');
  }

  ledger.close();
}
