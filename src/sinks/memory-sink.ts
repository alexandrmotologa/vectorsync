import type {
  VectorItem,
  VectorSearchResult,
  VectorSink,
  VectorSinkStats,
} from './base.js';

export class MemoryVectorSink implements VectorSink {
  public readonly sinkName = 'in-memory';
  private items = new Map<string, VectorItem>();

  public async upsertChunks(chunks: VectorItem[]): Promise<void> {
    for (const chunk of chunks) {
      this.items.set(chunk.chunkId, {
        chunkId: chunk.chunkId,
        vector: [...chunk.vector],
        metadata: { ...chunk.metadata },
      });
    }
  }

  public async updateMetadata(
    chunkId: string,
    metadata: Record<string, unknown>
  ): Promise<void> {
    const existing = this.items.get(chunkId);
    if (existing) {
      existing.metadata = {
        ...existing.metadata,
        ...metadata,
      };
    }
  }

  public async deleteChunks(chunkIds: string[]): Promise<void> {
    for (const id of chunkIds) {
      this.items.delete(id);
    }
  }

  public async deleteDocument(documentId: string): Promise<void> {
    const prefix = `${documentId}#`;
    for (const key of Array.from(this.items.keys())) {
      if (key.startsWith(prefix) || key === documentId) {
        this.items.delete(key);
      }
    }
  }

  public async query(
    queryVector: number[],
    topK: number = 5,
    filter?: Record<string, unknown>
  ): Promise<VectorSearchResult[]> {
    const results: VectorSearchResult[] = [];

    for (const item of this.items.values()) {
      if (filter && !this.matchesFilter(item.metadata, filter)) {
        continue;
      }

      const score = this.cosineSimilarity(queryVector, item.vector);
      results.push({
        chunkId: item.chunkId,
        score,
        metadata: item.metadata,
      });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  public async getStats(): Promise<VectorSinkStats> {
    return {
      totalVectors: this.items.size,
      sinkType: this.sinkName,
      details: {
        keys: Array.from(this.items.keys()),
      },
    };
  }

  public getItem(chunkId: string): VectorItem | undefined {
    return this.items.get(chunkId);
  }

  public clear(): void {
    this.items.clear();
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : Number((dot / denominator).toFixed(6));
  }

  private matchesFilter(
    metadata: Record<string, unknown>,
    filter: Record<string, unknown>
  ): boolean {
    for (const [key, value] of Object.entries(filter)) {
      if (metadata[key] !== value) return false;
    }
    return true;
  }
}
