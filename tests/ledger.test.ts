import { describe, expect, it, beforeEach } from 'vitest';
import { StateLedger } from '../src/core/delta/ledger.js';
import { HashChunker } from '../src/core/chunker/hash-chunker.js';
import { DiffCalculator } from '../src/core/delta/diff-calculator.js';

describe('StateLedger', () => {
  let ledger: StateLedger;
  let chunker: HashChunker;
  let diffCalculator: DiffCalculator;

  beforeEach(() => {
    ledger = new StateLedger(':memory:');
    chunker = new HashChunker({ minChunkSize: 10 });
    diffCalculator = new DiffCalculator();
  });

  it('should initialize empty and record stats', () => {
    const stats = ledger.getStats();
    expect(stats.totalDocuments).toBe(0);
    expect(stats.totalChunks).toBe(0);
    expect(stats.syncEventCount).toBe(0);
  });

  it('should commit new document and retrieve chunks', () => {
    const content = '# Title\n\nSection one content.\n\nSection two content.';
    const chunks = chunker.chunkDocument('doc-100', content);
    const plan = diffCalculator.computePlan(
      { documentId: 'doc-100', operation: 'INSERT', content },
      chunks,
      ledger
    );

    expect(plan.toInsertCount).toBe(chunks.length);
    expect(plan.skippedUnchangedCount).toBe(0);

    ledger.commitSync(plan, chunks, HashChunker.sha256(content));

    const doc = ledger.getDocument('doc-100');
    expect(doc).not.toBeNull();
    expect(doc?.totalChunks).toBe(chunks.length);

    const storedChunks = ledger.getChunksForDocument('doc-100');
    expect(storedChunks.length).toBe(chunks.length);
    expect(storedChunks[0].contentHash).toBe(chunks[0].contentHash);

    const stats = ledger.getStats();
    expect(stats.totalDocuments).toBe(1);
    expect(stats.totalChunks).toBe(chunks.length);
    expect(stats.syncEventCount).toBe(1);
  });

  it('should prune orphaned chunks when a document is shortened', () => {
    const v1 = '# Doc\n\nParagraph 1\n\nParagraph 2\n\nParagraph 3';
    const chunksV1 = chunker.chunkDocument('doc-shorten', v1);
    const planV1 = diffCalculator.computePlan(
      { documentId: 'doc-shorten', operation: 'INSERT', content: v1 },
      chunksV1,
      ledger
    );
    ledger.commitSync(planV1, chunksV1, HashChunker.sha256(v1));

    expect(ledger.getChunksForDocument('doc-shorten').length).toBe(3);

    // Shorten to 1 paragraph
    const v2 = '# Doc\n\nParagraph 1';
    const chunksV2 = chunker.chunkDocument('doc-shorten', v2);
    const planV2 = diffCalculator.computePlan(
      { documentId: 'doc-shorten', operation: 'UPDATE', content: v2 },
      chunksV2,
      ledger
    );

    expect(planV2.toDeleteChunkIds.length).toBe(2);
    expect(planV2.skippedUnchangedCount).toBe(1);

    ledger.commitSync(planV2, chunksV2, HashChunker.sha256(v2));

    const finalChunks = ledger.getChunksForDocument('doc-shorten');
    expect(finalChunks.length).toBe(1);
  });
});
