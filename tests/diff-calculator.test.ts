import { describe, expect, it, beforeEach } from 'vitest';
import { StateLedger } from '../src/core/delta/ledger.js';
import { HashChunker } from '../src/core/chunker/hash-chunker.js';
import { DiffCalculator } from '../src/core/delta/diff-calculator.js';

describe('DiffCalculator', () => {
  let ledger: StateLedger;
  let chunker: HashChunker;
  let diffCalculator: DiffCalculator;

  beforeEach(() => {
    ledger = new StateLedger(':memory:');
    chunker = new HashChunker({ minChunkSize: 10 });
    diffCalculator = new DiffCalculator();
  });

  it('should skip 90% of chunks when only 1 out of 10 chunks is updated', () => {
    // Generate a 10 paragraph document
    const paragraphsV1: string[] = [];
    for (let i = 1; i <= 10; i++) {
      paragraphsV1.push(`Paragraph ${i} contains technical details about section number ${i}.`);
    }
    const contentV1 = paragraphsV1.join('\n\n');

    const chunksV1 = chunker.chunkDocument('doc-10-para', contentV1);
    expect(chunksV1.length).toBe(10);

    // Initial commit
    const planV1 = diffCalculator.computePlan(
      { documentId: 'doc-10-para', operation: 'INSERT', content: contentV1 },
      chunksV1,
      ledger
    );
    ledger.commitSync(planV1, chunksV1, HashChunker.sha256(contentV1));

    // Modify ONLY paragraph 5
    const paragraphsV2 = [...paragraphsV1];
    paragraphsV2[4] = 'Paragraph 5 was UPDATED with new pricing parameters and constraints.';
    const contentV2 = paragraphsV2.join('\n\n');

    const chunksV2 = chunker.chunkDocument('doc-10-para', contentV2);
    expect(chunksV2.length).toBe(10);

    const planV2 = diffCalculator.computePlan(
      { documentId: 'doc-10-para', operation: 'UPDATE', content: contentV2 },
      chunksV2,
      ledger
    );

    // Verification of 90% savings
    expect(planV2.skippedUnchangedCount).toBe(9);
    expect(planV2.toUpdateTextCount).toBe(1);
    expect(planV2.toInsertCount).toBe(0);
    expect(planV2.toDeleteChunkIds.length).toBe(0);
    expect(planV2.efficiencyPercentage).toBeGreaterThanOrEqual(85);
  });

  it('should handle metadata-only updates with zero token re-embedding', () => {
    const content = '# Title\n\nSome important static documentation.';
    const metaV1 = { accessGroup: 'public', department: 'eng' };
    const chunksV1 = chunker.chunkDocument('doc-meta', content, metaV1);

    const planV1 = diffCalculator.computePlan(
      { documentId: 'doc-meta', operation: 'INSERT', content, metadata: metaV1 },
      chunksV1,
      ledger
    );
    ledger.commitSync(planV1, chunksV1, HashChunker.sha256(content), metaV1);

    // Update metadata only: change accessGroup to 'internal'
    const metaV2 = { accessGroup: 'internal', department: 'eng' };
    const chunksV2 = chunker.chunkDocument('doc-meta', content, metaV2);

    const planV2 = diffCalculator.computePlan(
      { documentId: 'doc-meta', operation: 'UPDATE', content, metadata: metaV2 },
      chunksV2,
      ledger
    );

    expect(planV2.toUpdateMetadataOnlyCount).toBe(chunksV2.length);
    expect(planV2.toUpdateTextCount).toBe(0);
    expect(planV2.tokensRequired).toBe(0);
    expect(planV2.tokensSaved).toBeGreaterThan(0);
    expect(planV2.efficiencyPercentage).toBe(100);
  });
});
