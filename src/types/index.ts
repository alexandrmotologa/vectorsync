export interface ChunkWithHash {
  chunkId: string;
  chunkIndex: number;
  content: string;
  contentHash: string;
  metadata: Record<string, unknown>;
  metadataHash: string;
  sectionPath?: string[];
  tokenCount: number;
}

export type MutationOperation = 'INSERT' | 'UPDATE' | 'DELETE';

export interface DocumentMutation {
  documentId: string;
  operation: MutationOperation;
  content?: string;
  metadata?: Record<string, unknown>;
  timestamp?: number;
}

export type SyncActionType = 
  | 'SKIP' 
  | 'UPDATE_METADATA_ONLY' 
  | 'UPSERT_TEXT_CHANGED' 
  | 'DELETE_ORPHAN';

export interface ChunkAction {
  type: SyncActionType;
  chunkId: string;
  chunkIndex?: number;
  content?: string;
  contentHash?: string;
  metadata?: Record<string, unknown>;
  reason: string;
  tokenCount?: number;
}

export interface SyncPlan {
  documentId: string;
  operation: MutationOperation;
  actions: ChunkAction[];
  totalChunks: number;
  toInsertCount: number;
  toUpdateTextCount: number;
  toUpdateMetadataOnlyCount: number;
  toDeleteChunkIds: string[];
  skippedUnchangedCount: number;
  tokensSaved: number;
  tokensRequired: number;
  estimatedCostSavingsUsd: number;
  efficiencyPercentage: number;
  timestamp: number;
}

export interface LedgerDocumentRecord {
  id: string;
  contentHash: string;
  totalChunks: number;
  lastSyncedAt: number;
  metadata: string; // JSON serialized
}

export interface LedgerChunkRecord {
  id: string;
  documentId: string;
  chunkIndex: number;
  contentHash: string;
  metadataHash: string;
  vectorId: string;
  tokenCount: number;
  sectionPath: string; // JSON serialized
  createdAt: number;
  updatedAt: number;
}

export interface SyncAuditRecord {
  id: string;
  timestamp: number;
  documentId: string;
  operation: MutationOperation;
  addedChunks: number;
  modifiedChunks: number;
  metadataOnlyChunks: number;
  deletedChunks: number;
  skippedChunks: number;
  tokensSaved: number;
  tokensRequired: number;
  costSavedUsd: number;
}

export interface LedgerStats {
  totalDocuments: number;
  totalChunks: number;
  totalTokensSaved: number;
  totalCostSavedUsd: number;
  syncEventCount: number;
}

export interface ChunkerOptions {
  maxChunkSize?: number; // approx chars or tokens
  minChunkSize?: number;
  overlap?: number;
  headerAware?: boolean;
  strategy?: 'paragraph' | 'sentence' | 'fixed';
}
