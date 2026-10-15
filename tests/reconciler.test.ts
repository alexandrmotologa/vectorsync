import { describe, expect, it, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { StateLedger } from '../src/core/delta/ledger.js';
import { MemoryVectorSink } from '../src/sinks/memory-sink.js';
import { MockEmbeddingProvider } from '../src/core/embeddings/mock-provider.js';
import { SyncPipeline } from '../src/core/sync/sync-pipeline.js';
import { LedgerReconciler } from '../src/core/sync/reconciler.js';
import { HashChunker } from '../src/core/chunker/hash-chunker.js';

describe('LedgerReconciler', () => {
  const tempFiles: string[] = [];

  afterEach(() => {
    for (const f of tempFiles) {
      if (fs.existsSync(f)) {
        try {
          fs.unlinkSync(f);
        } catch {}
      }
    }
  });

  it('should detect when ledger and sink are in perfect sync', async () => {
    const ledger = new StateLedger(':memory:');
    const sink = new MemoryVectorSink();
    const provider = new MockEmbeddingProvider();
    const chunker = new HashChunker({ minChunkSize: 10 });
    const pipeline = new SyncPipeline({ ledger, sink, embeddingProvider: provider, chunker });

    await pipeline.syncDocument({
      documentId: 'doc-sync',
      operation: 'UPSERT',
      content: 'Paragraph 1 has enough words.\n\nParagraph 2 also has enough words.',
      metadata: { author: 'Alice' },
      timestamp: Date.now(),
    });

    const reconciler = new LedgerReconciler(ledger, sink, provider);
    const report = await reconciler.reconcile(false);

    expect(report.isConsistent).toBe(true);
    expect(report.missingInSinkCount).toBe(0);
    expect(report.phantomInSinkCount).toBe(0);
    expect(report.totalLedgerChunks).toBe(2);
    expect(report.totalSinkVectors).toBe(2);
  });

  it('should detect and repair missing chunks in vector sink', async () => {
    const ledger = new StateLedger(':memory:');
    const sink = new MemoryVectorSink();
    const provider = new MockEmbeddingProvider();
    const chunker = new HashChunker({ minChunkSize: 10 });
    const pipeline = new SyncPipeline({ ledger, sink, embeddingProvider: provider, chunker });

    await pipeline.syncDocument({
      documentId: 'doc-drift',
      operation: 'UPSERT',
      content: 'Chunk A has enough words.\n\nChunk B also has enough words.',
      metadata: {},
      timestamp: Date.now(),
    });

    // Artificially delete one chunk from sink to create drift
    await sink.deleteChunks(['doc-drift#chunk-0']);

    const reconciler = new LedgerReconciler(ledger, sink, provider);
    const dryReport = await reconciler.reconcile(false);

    expect(dryReport.isConsistent).toBe(false);
    expect(dryReport.missingInSinkCount).toBe(1);
    expect(dryReport.details.missingChunkIds).toContain('doc-drift#chunk-0');

    // Now repair
    const repairReport = await reconciler.reconcile(true);
    expect(repairReport.repairedCount).toBe(1);

    // Verify consistency restored
    const finalReport = await reconciler.reconcile(false);
    expect(finalReport.isConsistent).toBe(true);
  });

  it('should detect and repair phantom vectors in sink', async () => {
    const ledger = new StateLedger(':memory:');
    const sink = new MemoryVectorSink();
    const provider = new MockEmbeddingProvider();

    // Directly insert phantom vector into sink
    await sink.upsertChunks([
      {
        chunkId: 'phantom-orphan-chunk',
        vector: [0.1, 0.2, 0.3],
        metadata: { orphan: true },
      },
    ]);

    const reconciler = new LedgerReconciler(ledger, sink, provider);
    const dryReport = await reconciler.reconcile(false);

    expect(dryReport.isConsistent).toBe(false);
    expect(dryReport.phantomInSinkCount).toBe(1);
    expect(dryReport.details.phantomChunkIds).toContain('phantom-orphan-chunk');

    // Repair phantom vectors
    const repairReport = await reconciler.reconcile(true);
    expect(repairReport.repairedCount).toBe(1);

    const afterStats = await sink.getStats();
    expect(afterStats.totalVectors).toBe(0);
  });

  it('should export ledger state to JSON and import into a new ledger', async () => {
    const originalLedger = new StateLedger(':memory:');
    const sink = new MemoryVectorSink();
    const provider = new MockEmbeddingProvider();
    const pipeline = new SyncPipeline({
      ledger: originalLedger,
      sink,
      embeddingProvider: provider,
    });

    await pipeline.syncDocument({
      documentId: 'backup-doc',
      operation: 'UPSERT',
      content: 'Important documentation text that will be exported.',
      metadata: { tag: 'archive' },
      timestamp: Date.now(),
    });

    const exportPath = path.join(os.tmpdir(), `vectorsync-test-export-${Date.now()}.json`);
    tempFiles.push(exportPath);

    const reconciler = new LedgerReconciler(originalLedger, sink, provider);
    const exportData = reconciler.exportState(exportPath);

    expect(fs.existsSync(exportPath)).toBe(true);
    expect(exportData.documents.length).toBe(1);
    expect(exportData.chunks.length).toBe(1);

    // Create fresh target ledger
    const targetLedger = new StateLedger(':memory:');
    const targetReconciler = new LedgerReconciler(targetLedger, sink, provider);

    const importRes = targetReconciler.importState(exportPath);
    expect(importRes.importedDocs).toBe(1);
    expect(importRes.importedChunks).toBe(1);

    const restoredDocs = targetLedger.getAllDocuments();
    expect(restoredDocs.length).toBe(1);
    expect(restoredDocs[0].id).toBe('backup-doc');

    const restoredChunks = targetLedger.getChunksForDocument('backup-doc');
    expect(restoredChunks.length).toBe(1);
    expect(restoredChunks[0].contentHash).toBe(exportData.chunks[0].contentHash);
  });
});
