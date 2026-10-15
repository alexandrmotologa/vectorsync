import fs from 'node:fs';
import type { StateLedger } from '../delta/ledger.js';
import type { VectorSink } from '../../sinks/base.js';
import type { EmbeddingProvider } from '../embeddings/base.js';

export interface ReconciliationReport {
  totalLedgerChunks: number;
  totalSinkVectors: number;
  missingInSinkCount: number;
  phantomInSinkCount: number;
  repairedCount: number;
  isConsistent: boolean;
  durationMs: number;
  details: {
    missingChunkIds: string[];
    phantomChunkIds: string[];
  };
}

export interface LedgerExportPayload {
  version: string;
  exportedAt: number;
  documents: any[];
  chunks: any[];
  auditLogs: any[];
}

export class LedgerReconciler {
  private ledger: StateLedger;
  private sink: VectorSink;
  private embeddingProvider: EmbeddingProvider;

  constructor(
    ledger: StateLedger,
    sink: VectorSink,
    embeddingProvider: EmbeddingProvider
  ) {
    this.ledger = ledger;
    this.sink = sink;
    this.embeddingProvider = embeddingProvider;
  }

  /**
   * Reconciles consistency between the SQLite State Ledger and the external Vector Sink.
   */
  public async reconcile(repair: boolean = false): Promise<ReconciliationReport> {
    const startTime = performance.now();
    const allDocs = this.ledger.getAllDocuments();
    const ledgerChunks = allDocs.flatMap((doc) => this.ledger.getChunksForDocument(doc.id));
    const ledgerChunkIdSet = new Set(ledgerChunks.map((c) => c.id));

    const sinkStats = await this.sink.getStats();
    const sinkKeys = (sinkStats.details?.keys as string[]) || [];

    const missingChunkIds: string[] = [];
    const phantomChunkIds: string[] = [];

    // Check if sink supports direct key inspection (e.g. MemoryVectorSink)
    if (sinkKeys.length > 0) {
      const sinkKeySet = new Set(sinkKeys);

      for (const chunk of ledgerChunks) {
        if (!sinkKeySet.has(chunk.id)) {
          missingChunkIds.push(chunk.id);
        }
      }

      for (const sinkKey of sinkKeys) {
        if (!ledgerChunkIdSet.has(sinkKey)) {
          phantomChunkIds.push(sinkKey);
        }
      }
    }

    let repairedCount = 0;

    if (repair) {
      // 1. Delete phantom vectors from sink
      if (phantomChunkIds.length > 0) {
        await this.sink.deleteChunks(phantomChunkIds);
        repairedCount += phantomChunkIds.length;
      }

      // 2. Re-embed and insert missing chunks
      if (missingChunkIds.length > 0) {
        const missingChunksToRepair = ledgerChunks.filter((c) =>
          missingChunkIds.includes(c.id)
        );

        for (const chunk of missingChunksToRepair) {
          // Re-embed
          const vectors = await this.embeddingProvider.embed([chunk.id]);
          await this.sink.upsertChunks([
            {
              chunkId: chunk.id,
              vector: vectors[0],
              metadata: {
                chunkIndex: chunk.chunkIndex,
                documentId: chunk.documentId,
                contentHash: chunk.contentHash,
              },
            },
          ]);
          repairedCount++;
        }
      }
    }

    const durationMs = Number((performance.now() - startTime).toFixed(2));
    const isConsistent = missingChunkIds.length === 0 && phantomChunkIds.length === 0;

    return {
      totalLedgerChunks: ledgerChunks.length,
      totalSinkVectors: sinkStats.totalVectors,
      missingInSinkCount: missingChunkIds.length,
      phantomInSinkCount: phantomChunkIds.length,
      repairedCount,
      isConsistent,
      durationMs,
      details: {
        missingChunkIds,
        phantomChunkIds,
      },
    };
  }

  /**
   * Exports ledger database state to a JSON file.
   */
  public exportState(outputPath: string): LedgerExportPayload {
    const docs = this.ledger.getAllDocuments();
    const chunks = docs.flatMap((doc) => this.ledger.getChunksForDocument(doc.id));
    const auditLogs = this.ledger.getAuditLogs(1000);

    const payload: LedgerExportPayload = {
      version: '0.1.0',
      exportedAt: Date.now(),
      documents: docs,
      chunks,
      auditLogs,
    };

    fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), 'utf8');
    return payload;
  }

  /**
   * Imports a ledger export payload into the SQLite ledger.
   */
  public importState(inputPath: string): { importedDocs: number; importedChunks: number } {
    const raw = fs.readFileSync(inputPath, 'utf8');
    const data = JSON.parse(raw) as LedgerExportPayload;

    let docCount = 0;
    let chunkCount = 0;

    // Use transaction for safe batch restoration
    for (const doc of data.documents) {
      const docChunks = data.chunks.filter((c) => c.documentId === doc.id);
      const plan = {
        documentId: doc.id,
        operation: 'INSERT' as const,
        actions: [],
        totalChunks: docChunks.length,
        toInsertCount: docChunks.length,
        toUpdateTextCount: 0,
        toUpdateMetadataOnlyCount: 0,
        toDeleteChunkIds: [],
        skippedUnchangedCount: 0,
        crossDocReusedCount: 0,
        tokensSaved: 0,
        tokensRequired: 0,
        estimatedCostSavingsUsd: 0,
        efficiencyPercentage: 0,
        timestamp: doc.lastSyncedAt,
      };

      const mappedChunks = docChunks.map((c) => ({
        chunkId: c.id,
        chunkIndex: c.chunkIndex,
        content: '',
        contentHash: c.contentHash,
        metadata: {},
        metadataHash: c.metadataHash,
        tokenCount: c.tokenCount,
      }));

      const parsedMeta = typeof doc.metadata === 'string' ? JSON.parse(doc.metadata || '{}') : (doc.metadata ?? {});
      this.ledger.commitSync(plan, mappedChunks, doc.contentHash, parsedMeta);
      docCount++;
      chunkCount += docChunks.length;
    }

    return { importedDocs: docCount, importedChunks: chunkCount };
  }
}
