import type {
  VectorItem,
  VectorSearchResult,
  VectorSink,
  VectorSinkStats,
} from './base.js';

export interface PgVectorOptions {
  connectionString?: string;
  tableName?: string;
  dimensions?: number;
  // Optional executor for custom pg pool or mocking
  sqlExecutor?: (sql: string, params?: unknown[]) => Promise<any>;
}

export class PgVectorSink implements VectorSink {
  public readonly sinkName = 'pgvector';
  private readonly tableName: string;
  private readonly dimensions: number;
  private readonly sqlExecutor?: (sql: string, params?: unknown[]) => Promise<any>;

  constructor(options?: PgVectorOptions) {
    this.tableName = options?.tableName ?? 'vectorsync_vectors';
    this.dimensions = options?.dimensions ?? 1536;
    this.sqlExecutor = options?.sqlExecutor;
  }

  public getMigrationSql(): string {
    return `
      CREATE EXTENSION IF NOT EXISTS vector;
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        chunk_id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        embedding vector(${this.dimensions}),
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_doc ON ${this.tableName}(document_id);
    `;
  }

  public async upsertChunks(chunks: VectorItem[]): Promise<void> {
    if (chunks.length === 0) return;
    if (!this.sqlExecutor) {
      // In standalone or test mode without direct pg client, we log or no-op
      return;
    }

    for (const chunk of chunks) {
      const vectorLiteral = `[${chunk.vector.join(',')}]`;
      const docId = (chunk.metadata.documentId as string) || chunk.chunkId.split('#')[0];
      const sql = `
        INSERT INTO ${this.tableName} (chunk_id, document_id, embedding, metadata, updated_at)
        VALUES ($1, $2, $3::vector, $4::jsonb, NOW())
        ON CONFLICT (chunk_id) DO UPDATE SET
          embedding = EXCLUDED.embedding,
          metadata = EXCLUDED.metadata,
          updated_at = NOW();
      `;
      await this.sqlExecutor(sql, [
        chunk.chunkId,
        docId,
        vectorLiteral,
        JSON.stringify(chunk.metadata),
      ]);
    }
  }

  public async updateMetadata(
    chunkId: string,
    metadata: Record<string, unknown>
  ): Promise<void> {
    if (!this.sqlExecutor) return;
    const sql = `
      UPDATE ${this.tableName}
      SET metadata = metadata || $1::jsonb, updated_at = NOW()
      WHERE chunk_id = $2;
    `;
    await this.sqlExecutor(sql, [JSON.stringify(metadata), chunkId]);
  }

  public async deleteChunks(chunkIds: string[]): Promise<void> {
    if (chunkIds.length === 0 || !this.sqlExecutor) return;
    const placeholders = chunkIds.map((_, i) => `$${i + 1}`).join(',');
    const sql = `DELETE FROM ${this.tableName} WHERE chunk_id IN (${placeholders});`;
    await this.sqlExecutor(sql, chunkIds);
  }

  public async deleteDocument(documentId: string): Promise<void> {
    if (!this.sqlExecutor) return;
    const sql = `DELETE FROM ${this.tableName} WHERE document_id = $1;`;
    await this.sqlExecutor(sql, [documentId]);
  }

  public async query(
    vector: number[],
    topK: number = 5,
    filter?: Record<string, unknown>
  ): Promise<VectorSearchResult[]> {
    if (!this.sqlExecutor) return [];
    const vectorLiteral = `[${vector.join(',')}]`;

    let filterClause = '';
    const params: unknown[] = [vectorLiteral, topK];

    if (filter) {
      filterClause = `AND metadata @> $3::jsonb`;
      params.push(JSON.stringify(filter));
    }

    const sql = `
      SELECT chunk_id, 1 - (embedding <=> $1::vector) AS score, metadata
      FROM ${this.tableName}
      WHERE 1=1 ${filterClause}
      ORDER BY embedding <=> $1::vector ASC
      LIMIT $2;
    `;

    const res = await this.sqlExecutor(sql, params);
    const rows = Array.isArray(res) ? res : res.rows || [];
    return rows.map((r: any) => ({
      chunkId: r.chunk_id,
      score: Number(r.score),
      metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata,
    }));
  }

  public async getStats(): Promise<VectorSinkStats> {
    if (!this.sqlExecutor) {
      return { totalVectors: 0, sinkType: this.sinkName };
    }
    const res = await this.sqlExecutor(`SELECT COUNT(*) as count FROM ${this.tableName};`);
    const rows = Array.isArray(res) ? res : res.rows || [];
    return {
      totalVectors: Number(rows[0]?.count ?? 0),
      sinkType: this.sinkName,
    };
  }
}
