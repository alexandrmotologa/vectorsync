import type {
  VectorItem,
  VectorSearchResult,
  VectorSink,
  VectorSinkStats,
} from './base.js';

export interface PineconeOptions {
  apiKey?: string;
  host?: string;
  namespace?: string;
}

export class PineconeVectorSink implements VectorSink {
  public readonly sinkName = 'pinecone';
  private readonly apiKey: string;
  private readonly host: string;
  private readonly namespace?: string;

  constructor(options?: PineconeOptions) {
    this.apiKey = options?.apiKey ?? process.env.PINECONE_API_KEY ?? '';
    this.host = (options?.host ?? process.env.PINECONE_HOST ?? 'https://controller.pinecone.io').replace(/\/+$/, '');
    this.namespace = options?.namespace ?? process.env.PINECONE_NAMESPACE;
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Api-Key': this.apiKey,
      'X-Pinecone-API-Version': '2024-07',
    };
  }

  public async upsertChunks(chunks: VectorItem[]): Promise<void> {
    if (chunks.length === 0) return;
    if (!this.apiKey && !this.host.includes('localhost') && !this.host.includes('127.0.0.1')) {
      throw new Error('PINECONE_API_KEY is required for PineconeVectorSink operations.');
    }

    const vectors = chunks.map((c) => ({
      id: c.chunkId,
      values: c.vector,
      metadata: {
        ...c.metadata,
        _chunkId: c.chunkId,
      },
    }));

    const body: Record<string, unknown> = { vectors };
    if (this.namespace) {
      body.namespace = this.namespace;
    }

    const res = await fetch(`${this.host}/vectors/upsert`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Pinecone upsert error (${res.status}): ${err}`);
    }
  }

  public async updateMetadata(
    chunkId: string,
    metadata: Record<string, unknown>
  ): Promise<void> {
    if (!this.apiKey && !this.host.includes('localhost') && !this.host.includes('127.0.0.1')) {
      throw new Error('PINECONE_API_KEY is required for PineconeVectorSink operations.');
    }

    const body: Record<string, unknown> = {
      id: chunkId,
      setMetadata: {
        ...metadata,
        _chunkId: chunkId,
      },
    };
    if (this.namespace) {
      body.namespace = this.namespace;
    }

    const res = await fetch(`${this.host}/vectors/update`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Pinecone updateMetadata error (${res.status}): ${err}`);
    }
  }

  public async deleteChunks(chunkIds: string[]): Promise<void> {
    if (chunkIds.length === 0) return;
    if (!this.apiKey && !this.host.includes('localhost') && !this.host.includes('127.0.0.1')) {
      throw new Error('PINECONE_API_KEY is required for PineconeVectorSink operations.');
    }

    const body: Record<string, unknown> = { ids: chunkIds };
    if (this.namespace) {
      body.namespace = this.namespace;
    }

    const res = await fetch(`${this.host}/vectors/delete`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Pinecone deleteChunks error (${res.status}): ${err}`);
    }
  }

  public async deleteDocument(documentId: string): Promise<void> {
    if (!this.apiKey && !this.host.includes('localhost') && !this.host.includes('127.0.0.1')) {
      throw new Error('PINECONE_API_KEY is required for PineconeVectorSink operations.');
    }

    const body: Record<string, unknown> = {
      filter: {
        documentId: { $eq: documentId },
      },
    };
    if (this.namespace) {
      body.namespace = this.namespace;
    }

    const res = await fetch(`${this.host}/vectors/delete`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Pinecone deleteDocument error (${res.status}): ${err}`);
    }
  }

  public async query(
    vector: number[],
    topK: number = 5,
    filter?: Record<string, unknown>
  ): Promise<VectorSearchResult[]> {
    if (!this.apiKey && !this.host.includes('localhost') && !this.host.includes('127.0.0.1')) {
      throw new Error('PINECONE_API_KEY is required for PineconeVectorSink operations.');
    }

    const body: Record<string, unknown> = {
      vector,
      topK,
      includeMetadata: true,
      includeValues: false,
    };
    if (this.namespace) {
      body.namespace = this.namespace;
    }
    if (filter) {
      body.filter = filter;
    }

    const res = await fetch(`${this.host}/query`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Pinecone query error (${res.status}): ${err}`);
    }

    const json = (await res.json()) as {
      matches: Array<{
        id: string;
        score: number;
        metadata?: Record<string, unknown>;
      }>;
    };

    return (json.matches ?? []).map((m) => ({
      chunkId: m.id,
      score: m.score,
      metadata: m.metadata || {},
    }));
  }

  public async getStats(): Promise<VectorSinkStats> {
    try {
      const res = await fetch(`${this.host}/describe_index_stats`, {
        method: 'POST',
        headers: this.getHeaders(),
      });
      if (!res.ok) {
        return { totalVectors: 0, sinkType: this.sinkName };
      }
      const data = (await res.json()) as any;
      return {
        totalVectors: data.totalVectorCount ?? 0,
        sinkType: this.sinkName,
        details: data,
      };
    } catch {
      return { totalVectors: 0, sinkType: this.sinkName };
    }
  }
}
