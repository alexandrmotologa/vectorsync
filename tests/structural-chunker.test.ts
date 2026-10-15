import { describe, expect, it } from 'vitest';
import { StructuralChunker } from '../src/core/chunker/structural-chunker.js';

describe('StructuralChunker', () => {
  it('should chunk JSON array into distinct item chunks', () => {
    const jsonArray = JSON.stringify([
      { id: 'u1', name: 'Alice', role: 'admin' },
      { id: 'u2', name: 'Bob', role: 'engineer' },
      { id: 'u3', name: 'Charlie', role: 'designer' },
    ]);

    const chunker = new StructuralChunker();
    const chunks = chunker.chunkDocument('users-doc', jsonArray, { source: 'db_export' });

    expect(chunks.length).toBe(3);
    expect(chunks[0].chunkId).toBe('users-doc#json-0');
    expect(chunks[0].sectionPath).toEqual(['Array[0]']);
    expect(chunks[0].content).toContain('"name": "Alice"');
    expect(chunks[1].chunkId).toBe('users-doc#json-1');
    expect(chunks[2].chunkId).toBe('users-doc#json-2');
  });

  it('should chunk JSON object by top-level keys', () => {
    const jsonObject = JSON.stringify({
      generalSettings: { theme: 'dark', language: 'en' },
      databaseConfig: { host: 'localhost', port: 5432, pool: 10 },
      securityRules: { mfaRequired: true, sessionTimeoutHours: 24 },
    });

    const chunker = new StructuralChunker();
    const chunks = chunker.chunkDocument('config-doc', jsonObject);

    expect(chunks.length).toBe(3);
    expect(chunks.map((c) => c.chunkId)).toEqual([
      'config-doc#json-generalSettings',
      'config-doc#json-databaseConfig',
      'config-doc#json-securityRules',
    ]);
    expect(chunks[0].sectionPath).toEqual(['generalSettings']);
    expect(chunks[1].sectionPath).toEqual(['databaseConfig']);
  });

  it('should preserve Markdown tables as unbroken atomic units', () => {
    const docWithTable = `
# Benchmarks

Here is the latency benchmark table:

| Model | Batch Size | Latency (ms) | P99 (ms) |
| :--- | :--- | :--- | :--- |
| MiniLM-L6 | 32 | 14.2 | 21.0 |
| text-3-small | 64 | 45.8 | 62.1 |
| voyage-3 | 32 | 38.4 | 54.0 |

After the table, we summarize the findings.
`;

    const chunker = new StructuralChunker({ preserveTables: true });
    const chunks = chunker.chunkDocument('benchmark-doc', docWithTable);

    // Look for the chunk containing the table
    const tableChunk = chunks.find((c) => c.content.includes('| Model | Batch Size |'));
    expect(tableChunk).toBeDefined();
    expect(tableChunk?.content).toContain('| MiniLM-L6 | 32 | 14.2 | 21.0 |');
    expect(tableChunk?.content).toContain('| voyage-3 | 32 | 38.4 | 54.0 |');
  });

  it('should fall back to standard text chunking for non-JSON non-table content', () => {
    const plainMarkdown = `
# Introduction

Standard documentation text paragraph.

## Next Section

Another paragraph explaining details.
`;

    const chunker = new StructuralChunker();
    const chunks = chunker.chunkDocument('plain-doc', plainMarkdown);

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].sectionPath[0]).toBe('Introduction');
  });
});
