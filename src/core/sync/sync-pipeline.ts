import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import type {
  ChunkWithHash,
  DocumentMutation,
  LedgerStats,
  SyncPlan,
} from '../../types/index.js';
import { HashChunker } from '../chunker/hash-chunker.js';
import { DiffCalculator } from '../delta/diff-calculator.js';
import type { StateLedger } from '../delta/ledger.js';
import type { EmbeddingProvider } from '../embeddings/base.js';
import { MockEmbeddingProvider } from '../embeddings/mock-provider.js';
import type { VectorSink } from '../../sinks/base.js';
import { MemoryVectorSink } from '../../sinks/memory-sink.js';

export interface SyncPipelineOptions {
  ledger: StateLedger;
  sink?: VectorSink;
  embeddingProvider?: EmbeddingProvider;
  chunker?: HashChunker;
  diffCalculator?: DiffCalculator;
}

export interface SyncResult {
  documentId: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  plan: SyncPlan;
  durationMs: number;
  success: boolean;
  error?: string;
}

export class SyncPipeline extends EventEmitter {
  public readonly ledger: StateLedger;
  public readonly sink: VectorSink;
  public readonly embeddingProvider: EmbeddingProvider;
  public readonly chunker: HashChunker;
  public readonly diffCalculator: DiffCalculator;

  constructor(options: SyncPipelineOptions) {
    super();
    this.ledger = options.ledger;
    this.sink = options.sink ?? new MemoryVectorSink();
    this.embeddingProvider = options.embeddingProvider ?? new MockEmbeddingProvider();
    this.chunker = options.chunker ?? new HashChunker();
    this.diffCalculator = options.diffCalculator ?? new DiffCalculator();
  }

  /**
   * Synchronizes an incremental document mutation through CDC pipeline.
   */
  public async syncDocument(mutation: DocumentMutation, dryRun = false): Promise<SyncResult> {
    const startTime = performance.now();
    try {
      let chunks: ChunkWithHash[] = [];
      let overallContentHash = '';

      if (mutation.operation !== 'DELETE') {
        const content = mutation.content ?? '';
        overallContentHash = HashChunker.sha256(content);
        chunks = this.chunker.chunkDocument(
          mutation.documentId,
          content,
          mutation.metadata ?? {}
        );
      }

      // Compute exact diff plan against ledger
      const plan = this.diffCalculator.computePlan(mutation, chunks, this.ledger);

      if (!dryRun) {
        // Step 1: Prune removed/orphaned chunks from vector index
        if (plan.toDeleteChunkIds.length > 0) {
          await this.sink.deleteChunks(plan.toDeleteChunkIds);
        }

        // Step 2: Handle document deletion
        if (mutation.operation === 'DELETE') {
          await this.sink.deleteDocument(mutation.documentId);
        }

        // Step 3: Handle metadata-only updates
        const metaOnlyActions = plan.actions.filter(
          (a) => a.type === 'UPDATE_METADATA_ONLY' && a.metadata
        );
        for (const action of metaOnlyActions) {
          await this.sink.updateMetadata(action.chunkId, action.metadata!);
        }

        // Step 4: Re-embed and upsert ONLY text-changed / newly-inserted chunks
        const changedActions = plan.actions.filter(
          (a) => a.type === 'UPSERT_TEXT_CHANGED' && a.content
        );

        if (changedActions.length > 0) {
          const textsToEmbed = changedActions.map((a) => a.content!);
          const vectors = await this.embeddingProvider.embed(textsToEmbed);

          const vectorItems = changedActions.map((action, i) => ({
            chunkId: action.chunkId,
            vector: vectors[i],
            metadata: {
              ...(action.metadata ?? {}),
              chunkIndex: action.chunkIndex,
              documentId: mutation.documentId,
              contentHash: action.contentHash,
              text: action.content,
            },
          }));

          await this.sink.upsertChunks(vectorItems);
        }

        // Step 5: Atomic Ledger Commit
        this.ledger.commitSync(
          plan,
          chunks,
          overallContentHash,
          mutation.metadata ?? {}
        );
      }

      const durationMs = Number((performance.now() - startTime).toFixed(2));
      const result: SyncResult = {
        documentId: mutation.documentId,
        operation: mutation.operation,
        plan,
        durationMs,
        success: true,
      };

      this.emit('sync', result);
      return result;
    } catch (err: any) {
      const durationMs = Number((performance.now() - startTime).toFixed(2));
      const errorResult: SyncResult = {
        documentId: mutation.documentId,
        operation: mutation.operation,
        plan: {
          documentId: mutation.documentId,
          operation: mutation.operation,
          actions: [],
          totalChunks: 0,
          toInsertCount: 0,
          toUpdateTextCount: 0,
          toUpdateMetadataOnlyCount: 0,
          toDeleteChunkIds: [],
          skippedUnchangedCount: 0,
          tokensSaved: 0,
          tokensRequired: 0,
          estimatedCostSavingsUsd: 0,
          efficiencyPercentage: 0,
          timestamp: Date.now(),
        },
        durationMs,
        success: false,
        error: err.message,
      };

      this.emit('error', errorResult);
      return errorResult;
    }
  }

  /**
   * Synchronizes a local file into the vector pipeline.
   */
  public async syncFile(
    filePath: string,
    documentId?: string,
    dryRun = false
  ): Promise<SyncResult> {
    const resolvedPath = path.resolve(filePath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`File not found: ${resolvedPath}`);
    }

    const docId = documentId ?? path.basename(resolvedPath);
    const content = fs.readFileSync(resolvedPath, 'utf8');

    const metadata: Record<string, unknown> = {
      filePath: resolvedPath,
      fileName: documentId ? `${documentId}.md` : path.basename(resolvedPath),
    };

    const existingDoc = this.ledger.getDocument(docId);
    const operation = existingDoc ? 'UPDATE' : 'INSERT';

    return this.syncDocument(
      {
        documentId: docId,
        operation,
        content,
        metadata,
        timestamp: Date.now(),
      },
      dryRun
    );
  }

  public getStats(): LedgerStats {
    return this.ledger.getStats();
  }
}
