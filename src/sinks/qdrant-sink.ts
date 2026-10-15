import crypto from 'node:crypto';
import type {
  VectorItem,
  VectorSearchResult,
  VectorSink,
  VectorSinkStats,
} from './base.js';

export interface QdrantOptions {
  url?: string;
  apiKey?: string;
  collectionName?: string;
}

export class QdrantVectorSink implements VectorSink {
  public readonly sinkName = 'qdrant';
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly collectionName: string;

  constructor(options?: QdrantOptions) {
    this.baseUrl = (options?.url ?? process.env.QDRANT_URL ?? 'http://localhost:6333').replace(/\/+$/, '');
    this.apiKey = options?.apiKey ?? process.env.QDRANT_API_KEY;
    this.collectionName = options?.collectionName ?? process.env.QDRANT_COLLECTION ?? 'vectorsync_chunks';
  }

  /**
   * Deterministically converts a string chunk ID into a valid UUID string for Qdrant.
   */
  public static toUuid(chunkId: string): string {
    const hash = crypto.createHash('md5').update(chunkId).digest('hex');
    return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['api-key'] = this.apiKey;
    }
    return headers;
  }

  public async upsertChunks(chunks: VectorItem[]): Promise<void> {
    if (chunks.length === 0) return;

    const points = chunks.map((c) => ({
      id: QdrantVectorSink.toUuid(c.chunkId),
      vector: c.vector,
      payload: {
        ...c.metadata,
        _chunkId: c.chunkId,
      },
    }));

    const res = await fetch(`${this.baseUrl}/collections/${this.collectionName}/points?wait=true`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify({ points }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Qdrant upsert error (${res.status}): ${err}`);
    }
  }

  public async updateMetadata(
    chunkId: string,
    metadata: Record<string, unknown>
  ): Promise<void> {
    const pointId = QdrantVectorSink.toUuid(chunkId);

    const res = await fetch(`${this.baseUrl}/collections/${this.collectionName}/points/payload?wait=true`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        points: [pointId],
        payload: {
          ...metadata,
          _chunkId: chunkId,
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Qdrant updateMetadata error (${res.status}): ${err}`);
    }
  }

  public async deleteChunks(chunkIds: string[]): Promise<void> {
    if (chunkIds.length === 0) return;
    const pointIds = chunkIds.map((id) => QdrantVectorSink.toUuid(id));

    const res = await fetch(`${this.baseUrl}/collections/${this.collectionName}/points/delete?wait=true`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ points: pointIds }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Qdrant deleteChunks error (${res.status}): ${err}`);
    }
  }

  public async deleteDocument(documentId: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/collections/${this.collectionName}/points/delete?wait=true`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        filter: {
          must: [
            {
              key: 'documentId',
              match: { value: documentId },
            },
          ],
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Qdrant deleteDocument error (${res.status}): ${err}`);
    }
  }

  public async query(
    vector: number[],
    topK: number = 5,
    filter?: Record<string, unknown>
  ): Promise<VectorSearchResult[]> {
    const queryBody: Record<string, unknown> = {
      vector,
      limit: topK,
      with_payload: true,
    };

    if (filter) {
      const mustClauses = Object.entries(filter).map(([k, v]) => ({
        key: k,
        match: { value: v },
      }));
      queryBody.filter = { must: mustClauses };
    }

    const res = await fetch(`${this.baseUrl}/collections/${this.collectionName}/points/search`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(queryBody),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Qdrant search error (${res.status}): ${err}`);
    }

    const json = (await res.json()) as {
      result: Array<{
        id: string;
        score: number;
        payload?: Record<string, unknown>;
      }>;
    };

    return (json.result ?? []).map((r) => ({
      chunkId: (r.payload?._chunkId as string) || r.id,
      score: r.score,
      metadata: r.payload || {},
    }));
  }

  public async getStats(): Promise<VectorSinkStats> {
    try {
      const res = await fetch(`${this.baseUrl}/collections/${this.collectionName}`, {
        method: 'GET',
        headers: this.getHeaders(),
      });
      if (!res.ok) {
        return { totalVectors: 0, sinkType: this.sinkName };
      }
      const data = (await res.json()) as any;
      return {
        totalVectors: data.result?.points_count ?? 0,
        sinkType: this.sinkName,
        details: data.result,
      };
    } catch {
      return { totalVectors: 0, sinkType: this.sinkName };
    }
  }
}
