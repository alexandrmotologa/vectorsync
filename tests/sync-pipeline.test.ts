import { describe, expect, it, beforeEach, vi } from 'vitest';
import { SyncPipeline } from '../src/core/sync/sync-pipeline.js';
import { StateLedger } from '../src/core/delta/ledger.js';
import { MemoryVectorSink } from '../src/sinks/memory-sink.js';
import { MockEmbeddingProvider } from '../src/core/embeddings/mock-provider.js';

describe('SyncPipeline', () => {
  let ledger: StateLedger;
  let sink: MemoryVectorSink;
  let embeddingProvider: MockEmbeddingProvider;
  let pipeline: SyncPipeline;

  beforeEach(() => {
    ledger = new StateLedger(':memory:');
    sink = new MemoryVectorSink();
    embeddingProvider = new MockEmbeddingProvider(64);
    pipeline = new SyncPipeline({
      ledger,
      sink,
      embeddingProvider,
    });
  });

  it('should execute end-to-end incremental sync avoiding redundant embeddings', async () => {
    const embedSpy = vi.spyOn(embeddingProvider, 'embed');

    const v1Content = `
# Engineering Handbook

Section 1: Onboarding procedures for new engineers.

Section 2: Code review guidelines and pull request checklists.

Section 3: Production deployment policies and rollback runbooks.
`;

    // Step 1: Initial Sync (INSERT)
    const result1 = await pipeline.syncDocument({
      documentId: 'handbook-doc',
      operation: 'INSERT',
      content: v1Content,
      metadata: { department: 'engineering', version: 1 },
    });

    expect(result1.success).toBe(true);
    expect(result1.plan.toInsertCount).toBeGreaterThan(0);
    expect(result1.plan.skippedUnchangedCount).toBe(0);

    const initialEmbedCalls = embedSpy.mock.calls.length;
    expect(initialEmbedCalls).toBe(1);
    const initialEmbeddedCount = embedSpy.mock.calls[0][0].length;
    expect(initialEmbeddedCount).toBe(result1.plan.toInsertCount);

    const sinkStats1 = await sink.getStats();
    expect(sinkStats1.totalVectors).toBe(result1.plan.toInsertCount);

    // Step 2: Incremental Update (UPDATE only Section 2, metadata unchanged)
    const v2Content = `
# Engineering Handbook

Section 1: Onboarding procedures for new engineers.

Section 2: REVISED code review guidelines with strict automated linting.

Section 3: Production deployment policies and rollback runbooks.
`;

    embedSpy.mockClear();

    const result2 = await pipeline.syncDocument({
      documentId: 'handbook-doc',
      operation: 'UPDATE',
      content: v2Content,
      metadata: { department: 'engineering', version: 1 },
    });

    expect(result2.success).toBe(true);
    expect(result2.plan.toUpdateTextCount).toBe(1);
    expect(result2.plan.skippedUnchangedCount).toBeGreaterThanOrEqual(2);
    expect(result2.plan.efficiencyPercentage).toBeGreaterThanOrEqual(60);

    // Verify embeddingProvider was called ONLY for the 1 changed section!
    expect(embedSpy.mock.calls.length).toBe(1);
    expect(embedSpy.mock.calls[0][0].length).toBe(1);
    expect(embedSpy.mock.calls[0][0][0]).toContain('REVISED code review guidelines');

    // Total vectors in sink should remain stable
    const sinkStats2 = await sink.getStats();
    expect(sinkStats2.totalVectors).toBe(result1.plan.toInsertCount);

    // Step 3: Metadata-only update (change version: 2 without text change)
    embedSpy.mockClear();
    const resultMeta = await pipeline.syncDocument({
      documentId: 'handbook-doc',
      operation: 'UPDATE',
      content: v2Content,
      metadata: { department: 'engineering', version: 2 },
    });

    expect(resultMeta.success).toBe(true);
    expect(resultMeta.plan.toUpdateMetadataOnlyCount).toBeGreaterThanOrEqual(3);
    expect(resultMeta.plan.toUpdateTextCount).toBe(0);
    expect(embedSpy.mock.calls.length).toBe(0); // ZERO embedding calls!

    // Step 3: Query the sink
    const searchVec = await embeddingProvider.embed(['linting']);
    const searchResults = await sink.query(searchVec[0], 2);
    expect(searchResults.length).toBeGreaterThan(0);

    // Step 4: Delete the document
    const deleteResult = await pipeline.syncDocument({
      documentId: 'handbook-doc',
      operation: 'DELETE',
    });

    expect(deleteResult.success).toBe(true);
    expect(deleteResult.plan.toDeleteChunkIds.length).toBe(sinkStats2.totalVectors);

    const sinkStats3 = await sink.getStats();
    expect(sinkStats3.totalVectors).toBe(0);
  });
});
