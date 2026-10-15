import { describe, expect, it } from 'vitest';
import { PgVectorSink } from '../src/sinks/pgvector-sink.js';

describe('PgVectorSink', () => {
  it('should generate valid PostgreSQL vector extension migration SQL', () => {
    const sink = new PgVectorSink({
      tableName: 'custom_vectors',
      dimensions: 1536,
    });

    const sql = sink.getMigrationSql();
    expect(sql).toContain('CREATE EXTENSION IF NOT EXISTS vector;');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS custom_vectors');
    expect(sql).toContain('embedding vector(1536)');
  });

  it('should execute upsert with vector literal and JSON metadata', async () => {
    const executedQueries: Array<{ sql: string; params?: unknown[] }> = [];

    const mockExecutor = async (sql: string, params?: unknown[]) => {
      executedQueries.push({ sql, params });
      return { rowCount: 1 };
    };

    const sink = new PgVectorSink({
      tableName: 'kb_vectors',
      dimensions: 3,
      sqlExecutor: mockExecutor,
    });

    await sink.upsertChunks([
      {
        chunkId: 'doc1#chunk-0',
        vector: [0.1, 0.2, 0.3],
        metadata: { documentId: 'doc1', section: 'intro' },
      },
    ]);

    expect(executedQueries).toHaveLength(1);
    expect(executedQueries[0].sql).toContain('INSERT INTO kb_vectors');
    expect(executedQueries[0].params?.[0]).toBe('doc1#chunk-0');
    expect(executedQueries[0].params?.[1]).toBe('doc1');
    expect(executedQueries[0].params?.[2]).toBe('[0.1,0.2,0.3]');
  });

  it('should query cosine similarity using pgvector distance operator', async () => {
    let capturedSql = '';
    let capturedParams: unknown[] = [];

    const mockExecutor = async (sql: string, params?: unknown[]) => {
      capturedSql = sql;
      capturedParams = params || [];
      return [
        {
          chunk_id: 'doc1#chunk-0',
          score: 0.95,
          metadata: JSON.stringify({ section: 'intro' }),
        },
      ];
    };

    const sink = new PgVectorSink({
      tableName: 'kb_vectors',
      sqlExecutor: mockExecutor,
    });

    const results = await sink.query([0.1, 0.2, 0.3], 5, { category: 'faq' });
    expect(results).toHaveLength(1);
    expect(results[0].chunkId).toBe('doc1#chunk-0');
    expect(results[0].score).toBe(0.95);
    expect(results[0].metadata).toEqual({ section: 'intro' });
    expect(capturedSql).toContain('ORDER BY embedding <=> $1::vector ASC');
    expect(capturedParams[0]).toBe('[0.1,0.2,0.3]');
  });

  it('should throw an error when attempting operations without connectionString or executor', async () => {
    const sink = new PgVectorSink({
      connectionString: '',
    });

    await expect(
      sink.upsertChunks([
        {
          chunkId: 'c1',
          vector: [0.1],
          metadata: {},
        },
      ])
    ).rejects.toThrow('PostgreSQL connectionString or DATABASE_URL environment variable is required');
  });
});
