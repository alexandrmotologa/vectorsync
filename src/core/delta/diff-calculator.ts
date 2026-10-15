import type {
  ChunkAction,
  ChunkWithHash,
  DocumentMutation,
  SyncPlan,
} from '../../types/index.js';
import type { StateLedger } from './ledger.js';
import { CostCalculator } from '../telemetry/cost-calculator.js';

export class DiffCalculator {
  private costCalculator: CostCalculator;

  constructor(embeddingModel: string = 'text-embedding-3-small') {
    this.costCalculator = new CostCalculator(embeddingModel);
  }

  /**
   * Computes a deterministic SyncPlan comparing new chunks against ledger state.
   */
  public computePlan(
    mutation: DocumentMutation,
    newChunks: ChunkWithHash[],
    ledger: StateLedger
  ): SyncPlan {
    const now = Date.now();
    const existingChunks = ledger.getChunksForDocument(mutation.documentId);
    const existingMap = new Map<string, (typeof existingChunks)[0]>();

    for (const ec of existingChunks) {
      existingMap.set(ec.id, ec);
    }

    if (mutation.operation === 'DELETE') {
      const actions: ChunkAction[] = existingChunks.map((ec) => ({
        type: 'DELETE_ORPHAN',
        chunkId: ec.id,
        chunkIndex: ec.chunkIndex,
        contentHash: ec.contentHash,
        reason: 'Document deleted from primary store',
        tokenCount: ec.tokenCount,
      }));

      return {
        documentId: mutation.documentId,
        operation: 'DELETE',
        actions,
        totalChunks: 0,
        toInsertCount: 0,
        toUpdateTextCount: 0,
        toUpdateMetadataOnlyCount: 0,
        toDeleteChunkIds: existingChunks.map((c) => c.id),
        skippedUnchangedCount: 0,
        crossDocReusedCount: 0,
        tokensSaved: 0,
        tokensRequired: 0,
        estimatedCostSavingsUsd: 0,
        efficiencyPercentage: 0,
        timestamp: now,
      };
    }

    const actions: ChunkAction[] = [];
    const activeChunkIdSet = new Set<string>();

    let toInsertCount = 0;
    let toUpdateTextCount = 0;
    let toUpdateMetadataOnlyCount = 0;
    let skippedUnchangedCount = 0;
    let crossDocReusedCount = 0;
    let tokensSaved = 0;
    let tokensRequired = 0;

    for (const chunk of newChunks) {
      activeChunkIdSet.add(chunk.chunkId);
      const existing = existingMap.get(chunk.chunkId);

      if (!existing) {
        // Check for cross-document deduplication
        const globalMatch = ledger.findGlobalChunk(chunk.contentHash);
        if (globalMatch) {
          actions.push({
            type: 'REUSE_CROSS_DOC',
            chunkId: chunk.chunkId,
            chunkIndex: chunk.chunkIndex,
            content: chunk.content,
            contentHash: chunk.contentHash,
            canonicalVectorId: globalMatch.canonicalChunkId,
            metadata: chunk.metadata,
            reason: `Identical text found in '${globalMatch.documentId}', vector reused ($0 spent)`,
            tokenCount: chunk.tokenCount,
          });
          crossDocReusedCount++;
          tokensSaved += chunk.tokenCount;
        } else {
          // Chunk is newly added
          actions.push({
            type: 'UPSERT_TEXT_CHANGED',
            chunkId: chunk.chunkId,
            chunkIndex: chunk.chunkIndex,
            content: chunk.content,
            contentHash: chunk.contentHash,
            metadata: chunk.metadata,
            reason: 'New chunk created',
            tokenCount: chunk.tokenCount,
          });
          toInsertCount++;
          tokensRequired += chunk.tokenCount;
        }
      } else {
        // Chunk existed previously
        if (existing.contentHash === chunk.contentHash) {
          if (existing.metadataHash === chunk.metadataHash) {
            // Unchanged text and metadata
            actions.push({
              type: 'SKIP',
              chunkId: chunk.chunkId,
              chunkIndex: chunk.chunkIndex,
              contentHash: chunk.contentHash,
              reason: 'Content and metadata identical to ledger',
              tokenCount: chunk.tokenCount,
            });
            skippedUnchangedCount++;
            tokensSaved += chunk.tokenCount;
          } else {
            // Content identical, metadata changed
            actions.push({
              type: 'UPDATE_METADATA_ONLY',
              chunkId: chunk.chunkId,
              chunkIndex: chunk.chunkIndex,
              metadata: chunk.metadata,
              reason: 'Content matches, only metadata modified',
              tokenCount: chunk.tokenCount,
            });
            toUpdateMetadataOnlyCount++;
            // Re-embedding avoided!
            tokensSaved += chunk.tokenCount;
          }
        } else {
          // Content has changed
          actions.push({
            type: 'UPSERT_TEXT_CHANGED',
            chunkId: chunk.chunkId,
            chunkIndex: chunk.chunkIndex,
            content: chunk.content,
            contentHash: chunk.contentHash,
            metadata: chunk.metadata,
            reason: 'Content hash mismatch (text updated)',
            tokenCount: chunk.tokenCount,
          });
          toUpdateTextCount++;
          tokensRequired += chunk.tokenCount;
        }
      }
    }

    // Detect orphaned chunks (chunks in ledger not present in new document)
    const toDeleteChunkIds: string[] = [];
    for (const [id, ec] of existingMap.entries()) {
      if (!activeChunkIdSet.has(id)) {
        toDeleteChunkIds.push(id);
        actions.push({
          type: 'DELETE_ORPHAN',
          chunkId: id,
          chunkIndex: ec.chunkIndex,
          contentHash: ec.contentHash,
          reason: 'Chunk removed from document (pruned orphan)',
          tokenCount: ec.tokenCount,
        });
      }
    }

    const savings = this.costCalculator.calculateSavings(tokensSaved, tokensRequired);

    return {
      documentId: mutation.documentId,
      operation: mutation.operation,
      actions,
      totalChunks: newChunks.length,
      toInsertCount,
      toUpdateTextCount,
      toUpdateMetadataOnlyCount,
      toDeleteChunkIds,
      skippedUnchangedCount,
      crossDocReusedCount,
      tokensSaved,
      tokensRequired,
      estimatedCostSavingsUsd: savings.costSavedUsd,
      efficiencyPercentage: savings.efficiencyPercentage,
      timestamp: now,
    };
  }
}
