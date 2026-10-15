export interface VectorItem {
  chunkId: string;
  vector: number[];
  metadata: Record<string, unknown>;
}

export interface VectorSearchResult {
  chunkId: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface VectorSinkStats {
  totalVectors: number;
  sinkType: string;
  details?: Record<string, unknown>;
}

export interface VectorSink {
  readonly sinkName: string;
  upsertChunks(chunks: VectorItem[]): Promise<void>;
  updateMetadata(chunkId: string, metadata: Record<string, unknown>): Promise<void>;
  deleteChunks(chunkIds: string[]): Promise<void>;
  deleteDocument(documentId: string): Promise<void>;
  query(vector: number[], topK?: number, filter?: Record<string, unknown>): Promise<VectorSearchResult[]>;
  getStats(): Promise<VectorSinkStats>;
}
