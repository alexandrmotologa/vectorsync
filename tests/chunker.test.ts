import { describe, expect, it } from 'vitest';
import { HashChunker } from '../src/core/chunker/hash-chunker.js';

describe('HashChunker', () => {
  it('should canonicalize text and produce consistent SHA-256 hashes', () => {
    const textA = 'Hello World! \r\n This is a test.  ';
    const textB = 'Hello World!\n This is a test.';

    const canonA = HashChunker.canonicalize(textA);
    const canonB = HashChunker.canonicalize(textB);

    expect(canonA).toBe(canonB);
    expect(HashChunker.sha256(canonA)).toBe(HashChunker.sha256(canonB));
  });

  it('should sort metadata keys deterministically', () => {
    const meta1 = { author: 'Alice', version: 2, tags: ['rag', 'vector'] };
    const meta2 = { tags: ['rag', 'vector'], version: 2, author: 'Alice' };

    const hash1 = HashChunker.hashMetadata(meta1);
    const hash2 = HashChunker.hashMetadata(meta2);

    expect(hash1).toBe(hash2);
  });

  it('should parse markdown headers and preserve section hierarchy', () => {
    const doc = `
# System Architecture

This is the system architecture overview.

## Storage Layer

The storage layer uses PostgreSQL with WAL replication.

## Vector Layer

Vectors are stored in Qdrant and pgvector.
`;

    const chunker = new HashChunker({ headerAware: true, minChunkSize: 20 });
    const chunks = chunker.chunkDocument('doc-1', doc);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].sectionPath).toEqual(['System Architecture']);
    expect(chunks[1].sectionPath).toEqual(['System Architecture', 'Storage Layer']);
    expect(chunks[2].sectionPath).toEqual(['System Architecture', 'Vector Layer']);
  });

  it('should produce identical hashes for unchanged paragraphs when one paragraph is edited', () => {
    const v1 = `
# Doc 1

Paragraph one is intro.

Paragraph two has original text.

Paragraph three is unchanged conclusion.
`;

    const v2 = `
# Doc 1

Paragraph one is intro.

Paragraph two has MODIFIED text.

Paragraph three is unchanged conclusion.
`;

    const chunker = new HashChunker({ headerAware: true, minChunkSize: 10 });
    const chunksV1 = chunker.chunkDocument('doc-1', v1);
    const chunksV2 = chunker.chunkDocument('doc-1', v2);

    expect(chunksV1.length).toBe(chunksV2.length);

    // Chunk 0 (intro) should have identical contentHash
    expect(chunksV1[0].contentHash).toBe(chunksV2[0].contentHash);

    // Chunk 1 (modified) should differ
    expect(chunksV1[1].contentHash).not.toBe(chunksV2[1].contentHash);

    // Chunk 2 (conclusion) should have identical contentHash
    expect(chunksV1[2].contentHash).toBe(chunksV2[2].contentHash);
  });
});
