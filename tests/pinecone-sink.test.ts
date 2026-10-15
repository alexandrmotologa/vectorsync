import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { PineconeVectorSink } from '../src/sinks/pinecone-sink.js';

describe('PineconeVectorSink', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should format and POST upsert requests to Pinecone host', async () => {
    let capturedUrl = '';
    let capturedBody: any = null;

    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init: any) => {
      capturedUrl = url;
      capturedBody = JSON.parse(init.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({ upsertedCount: 1 }),
      } as Response;
    });

    const sink = new PineconeVectorSink({
      apiKey: 'test-pinecone-key',
      host: 'https://test-index.pinecone.io',
      namespace: 'test-ns',
    });

    await sink.upsertChunks([
      {
        chunkId: 'doc1#chunk0',
        vector: [0.1, 0.2, 0.3],
        metadata: { title: 'Test' },
      },
    ]);

    expect(capturedUrl).toBe('https://test-index.pinecone.io/vectors/upsert');
    expect(capturedBody.namespace).toBe('test-ns');
    expect(capturedBody.vectors).toHaveLength(1);
    expect(capturedBody.vectors[0].id).toBe('doc1#chunk0');
    expect(capturedBody.vectors[0].values).toEqual([0.1, 0.2, 0.3]);
    expect(capturedBody.vectors[0].metadata._chunkId).toBe('doc1#chunk0');
  });

  it('should execute vector query and map matches into VectorSearchResult', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          matches: [
            {
              id: 'doc1#chunk-0',
              score: 0.92,
              metadata: { title: 'Test Document' },
            },
          ],
        }),
      } as Response;
    });

    const sink = new PineconeVectorSink({
      apiKey: 'test-key',
      host: 'https://test-index.pinecone.io',
    });

    const results = await sink.query([0.1, 0.2, 0.3], 5);
    expect(results).toHaveLength(1);
    expect(results[0].chunkId).toBe('doc1#chunk-0');
    expect(results[0].score).toBe(0.92);
    expect(results[0].metadata.title).toBe('Test Document');
  });

  it('should fetch index stats and return totalVectors', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          totalVectorCount: 42,
          namespaces: { default: { vectorCount: 42 } },
        }),
      } as Response;
    });

    const sink = new PineconeVectorSink({
      apiKey: 'test-key',
      host: 'https://test-index.pinecone.io',
    });

    const stats = await sink.getStats();
    expect(stats.totalVectors).toBe(42);
    expect(stats.sinkType).toBe('pinecone');
  });

  it('should throw when apiKey is missing on non-localhost hosts', async () => {
    const sink = new PineconeVectorSink({
      apiKey: '',
      host: 'https://prod-index.pinecone.io',
    });

    await expect(
      sink.upsertChunks([
        {
          chunkId: 'chunk1',
          vector: [0.1],
          metadata: {},
        },
      ])
    ).rejects.toThrow('PINECONE_API_KEY is required');
  });
});
