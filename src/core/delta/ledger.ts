import Database from 'better-sqlite3';
import type {
  ChunkWithHash,
  LedgerChunkRecord,
  LedgerDocumentRecord,
  LedgerStats,
  SyncAuditRecord,
  SyncPlan,
} from '../../types/index.js';

export class StateLedger {
  private db: Database.Database;

  constructor(dbPath: string = ':memory:') {
    this.db = new Database(dbPath);
    this.initDatabase();
  }

  private initDatabase(): void {
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        content_hash TEXT NOT NULL,
        total_chunks INTEGER NOT NULL,
        last_synced_at INTEGER NOT NULL,
        metadata TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        content_hash TEXT NOT NULL,
        metadata_hash TEXT NOT NULL,
        vector_id TEXT NOT NULL,
        token_count INTEGER NOT NULL,
        section_path TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks(document_id);
      CREATE INDEX IF NOT EXISTS idx_chunks_hash ON chunks(content_hash);

      CREATE TABLE IF NOT EXISTS global_chunk_hashes (
        content_hash TEXT PRIMARY KEY,
        canonical_chunk_id TEXT NOT NULL,
        document_id TEXT NOT NULL,
        token_count INTEGER NOT NULL,
        reference_count INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sync_audit_log (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        document_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        added_chunks INTEGER NOT NULL,
        modified_chunks INTEGER NOT NULL,
        metadata_only_chunks INTEGER NOT NULL,
        deleted_chunks INTEGER NOT NULL,
        skipped_chunks INTEGER NOT NULL,
        tokens_saved INTEGER NOT NULL,
        tokens_required INTEGER NOT NULL,
        cost_saved_usd REAL NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_audit_time ON sync_audit_log(timestamp DESC);
    `);
  }

  public getDocument(id: string): LedgerDocumentRecord | null {
    const stmt = this.db.prepare('SELECT * FROM documents WHERE id = ?');
    const row = stmt.get(id) as
      | {
          id: string;
          content_hash: string;
          total_chunks: number;
          last_synced_at: number;
          metadata: string;
        }
      | undefined;

    if (!row) return null;
    return {
      id: row.id,
      contentHash: row.content_hash,
      totalChunks: row.total_chunks,
      lastSyncedAt: row.last_synced_at,
      metadata: row.metadata,
    };
  }

  public getAllDocuments(): LedgerDocumentRecord[] {
    const stmt = this.db.prepare('SELECT * FROM documents ORDER BY last_synced_at DESC');
    const rows = stmt.all() as Array<{
      id: string;
      content_hash: string;
      total_chunks: number;
      last_synced_at: number;
      metadata: string;
    }>;

    return rows.map((r) => ({
      id: r.id,
      contentHash: r.content_hash,
      totalChunks: r.total_chunks,
      lastSyncedAt: r.last_synced_at,
      metadata: r.metadata,
    }));
  }

  public getChunksForDocument(documentId: string): LedgerChunkRecord[] {
    const stmt = this.db.prepare(
      'SELECT * FROM chunks WHERE document_id = ? ORDER BY chunk_index ASC'
    );
    const rows = stmt.all(documentId) as Array<{
      id: string;
      document_id: string;
      chunk_index: number;
      content_hash: string;
      metadata_hash: string;
      vector_id: string;
      token_count: number;
      section_path: string;
      created_at: number;
      updated_at: number;
    }>;

    return rows.map((r) => ({
      id: r.id,
      documentId: r.document_id,
      chunkIndex: r.chunk_index,
      contentHash: r.content_hash,
      metadataHash: r.metadata_hash,
      vectorId: r.vector_id,
      tokenCount: r.token_count,
      sectionPath: r.section_path,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  public findGlobalChunk(contentHash: string): {
    contentHash: string;
    canonicalChunkId: string;
    documentId: string;
    tokenCount: number;
  } | null {
    const stmt = this.db.prepare(
      'SELECT content_hash, canonical_chunk_id, document_id, token_count FROM global_chunk_hashes WHERE content_hash = ?'
    );
    const row = stmt.get(contentHash) as any;
    if (!row) return null;
    return {
      contentHash: row.content_hash,
      canonicalChunkId: row.canonical_chunk_id,
      documentId: row.document_id,
      tokenCount: row.token_count,
    };
  }

  /**
   * Atomically commits a completed SyncPlan and the associated chunks to the ledger.
   */
  public commitSync(
    plan: SyncPlan,
    chunks: ChunkWithHash[],
    overallContentHash: string,
    docMetadata: Record<string, unknown> = {}
  ): void {
    const now = Date.now();

    const runTransaction = this.db.transaction(() => {
      if (plan.operation === 'DELETE') {
        this.deleteDocumentInternal(plan.documentId);
      } else {
        // Upsert Document record
        const upsertDocStmt = this.db.prepare(`
          INSERT INTO documents (id, content_hash, total_chunks, last_synced_at, metadata)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            content_hash = excluded.content_hash,
            total_chunks = excluded.total_chunks,
            last_synced_at = excluded.last_synced_at,
            metadata = excluded.metadata
        `);
        upsertDocStmt.run(
          plan.documentId,
          overallContentHash,
          chunks.length,
          now,
          JSON.stringify(docMetadata)
        );

        // Delete orphaned chunks
        if (plan.toDeleteChunkIds.length > 0) {
          const deleteChunkStmt = this.db.prepare('DELETE FROM chunks WHERE id = ?');
          for (const chunkId of plan.toDeleteChunkIds) {
            deleteChunkStmt.run(chunkId);
          }
        }

        // Upsert active chunks
        const upsertChunkStmt = this.db.prepare(`
          INSERT INTO chunks (
            id, document_id, chunk_index, content_hash, metadata_hash,
            vector_id, token_count, section_path, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            chunk_index = excluded.chunk_index,
            content_hash = excluded.content_hash,
            metadata_hash = excluded.metadata_hash,
            token_count = excluded.token_count,
            section_path = excluded.section_path,
            updated_at = excluded.updated_at
        `);

        const upsertGlobalStmt = this.db.prepare(`
          INSERT INTO global_chunk_hashes (
            content_hash, canonical_chunk_id, document_id, token_count, reference_count, created_at
          ) VALUES (?, ?, ?, ?, 1, ?)
          ON CONFLICT(content_hash) DO UPDATE SET
            reference_count = reference_count + 1
        `);

        for (const chunk of chunks) {
          upsertChunkStmt.run(
            chunk.chunkId,
            plan.documentId,
            chunk.chunkIndex,
            chunk.contentHash,
            chunk.metadataHash,
            chunk.chunkId, // Default vector ID is chunkId
            chunk.tokenCount,
            JSON.stringify(chunk.sectionPath ?? []),
            now,
            now
          );

          upsertGlobalStmt.run(
            chunk.contentHash,
            chunk.chunkId,
            plan.documentId,
            chunk.tokenCount,
            now
          );
        }
      }

      // Record audit entry
      const auditStmt = this.db.prepare(`
        INSERT INTO sync_audit_log (
          id, timestamp, document_id, operation, added_chunks, modified_chunks,
          metadata_only_chunks, deleted_chunks, skipped_chunks, tokens_saved,
          tokens_required, cost_saved_usd
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const auditId = `audit_${now}_${Math.random().toString(36).slice(2, 8)}`;
      auditStmt.run(
        auditId,
        now,
        plan.documentId,
        plan.operation,
        plan.toInsertCount,
        plan.toUpdateTextCount,
        plan.toUpdateMetadataOnlyCount,
        plan.toDeleteChunkIds.length,
        plan.skippedUnchangedCount,
        plan.tokensSaved,
        plan.tokensRequired,
        plan.estimatedCostSavingsUsd
      );
    });

    runTransaction();
  }

  private deleteDocumentInternal(documentId: string): void {
    const stmt = this.db.prepare('DELETE FROM documents WHERE id = ?');
    stmt.run(documentId);
  }

  public deleteDocument(documentId: string): void {
    this.deleteDocumentInternal(documentId);
  }

  public getAuditLogs(limit: number = 50): SyncAuditRecord[] {
    const stmt = this.db.prepare(
      'SELECT * FROM sync_audit_log ORDER BY timestamp DESC LIMIT ?'
    );
    const rows = stmt.all(limit) as Array<{
      id: string;
      timestamp: number;
      document_id: string;
      operation: string;
      added_chunks: number;
      modified_chunks: number;
      metadata_only_chunks: number;
      deleted_chunks: number;
      skipped_chunks: number;
      tokens_saved: number;
      tokens_required: number;
      cost_saved_usd: number;
    }>;

    return rows.map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      documentId: r.document_id,
      operation: r.operation as any,
      addedChunks: r.added_chunks,
      modifiedChunks: r.modified_chunks,
      metadataOnlyChunks: r.metadata_only_chunks,
      deletedChunks: r.deleted_chunks,
      skippedChunks: r.skipped_chunks,
      tokensSaved: r.tokens_saved,
      tokensRequired: r.tokens_required,
      costSavedUsd: r.cost_saved_usd,
    }));
  }

  public getStats(): LedgerStats {
    const docCount = (
      this.db.prepare('SELECT COUNT(*) as count FROM documents').get() as { count: number }
    ).count;
    const chunkCount = (
      this.db.prepare('SELECT COUNT(*) as count FROM chunks').get() as { count: number }
    ).count;
    const auditAgg = this.db
      .prepare(`
      SELECT 
        COUNT(*) as eventCount,
        COALESCE(SUM(tokens_saved), 0) as totalTokensSaved,
        COALESCE(SUM(cost_saved_usd), 0.0) as totalCostSaved
      FROM sync_audit_log
    `)
      .get() as {
      eventCount: number;
      totalTokensSaved: number;
      totalCostSaved: number;
    };

    return {
      totalDocuments: docCount,
      totalChunks: chunkCount,
      totalTokensSaved: auditAgg.totalTokensSaved,
      totalCostSavedUsd: Number(auditAgg.totalCostSaved.toFixed(4)),
      syncEventCount: auditAgg.eventCount,
    };
  }

  public close(): void {
    this.db.close();
  }
}
