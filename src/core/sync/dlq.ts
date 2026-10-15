import Database from 'better-sqlite3';
import type { DocumentMutation } from '../../types/index.js';
import type { SyncPipeline } from './sync-pipeline.js';

export interface DlqItem {
  id: string;
  documentId: string;
  operation: string;
  content?: string;
  metadata: Record<string, unknown>;
  errorMessage: string;
  retryCount: number;
  maxRetries: number;
  nextRetryAt: number;
  status: 'PENDING' | 'RESOLVED' | 'FAILED';
  createdAt: number;
}

export class MutationDlq {
  private db: Database.Database;

  constructor(dbOrPath: Database.Database | string = '.vectorsync/ledger.db') {
    if (typeof dbOrPath === 'string') {
      this.db = new Database(dbOrPath);
    } else {
      this.db = dbOrPath;
    }
    this.initTable();
  }

  private initTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS mutation_dlq (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        content TEXT,
        metadata TEXT NOT NULL,
        error_message TEXT NOT NULL,
        retry_count INTEGER NOT NULL DEFAULT 0,
        max_retries INTEGER NOT NULL DEFAULT 5,
        next_retry_at INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_dlq_status ON mutation_dlq(status, next_retry_at);
    `);
  }

  public enqueue(
    mutation: DocumentMutation,
    error: Error,
    maxRetries: number = 5
  ): string {
    const now = Date.now();
    const id = `dlq_${now}_${Math.random().toString(36).slice(2, 8)}`;
    // Initial backoff: 2 seconds
    const nextRetryAt = now + 2000;

    const stmt = this.db.prepare(`
      INSERT INTO mutation_dlq (
        id, document_id, operation, content, metadata, error_message,
        retry_count, max_retries, next_retry_at, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, 'PENDING', ?)
    `);

    stmt.run(
      id,
      mutation.documentId,
      mutation.operation,
      mutation.content ?? null,
      JSON.stringify(mutation.metadata ?? {}),
      error.message,
      maxRetries,
      nextRetryAt,
      now
    );

    return id;
  }

  public listPending(limit: number = 50): DlqItem[] {
    const stmt = this.db.prepare(`
      SELECT * FROM mutation_dlq 
      WHERE status = 'PENDING' 
      ORDER BY next_retry_at ASC 
      LIMIT ?
    `);
    const rows = stmt.all(limit) as any[];

    return rows.map((r) => ({
      id: r.id,
      documentId: r.document_id,
      operation: r.operation,
      content: r.content,
      metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata,
      errorMessage: r.error_message,
      retryCount: r.retry_count,
      maxRetries: r.max_retries,
      nextRetryAt: r.next_retry_at,
      status: r.status,
      createdAt: r.created_at,
    }));
  }

  public async processPending(
    pipeline: SyncPipeline
  ): Promise<{ processed: number; succeeded: number; failed: number }> {
    const now = Date.now();
    const stmt = this.db.prepare(`
      SELECT * FROM mutation_dlq 
      WHERE status = 'PENDING' AND next_retry_at <= ? 
      ORDER BY next_retry_at ASC 
      LIMIT 25
    `);
    const readyItems = stmt.all(now) as any[];

    let succeeded = 0;
    let failed = 0;

    for (const item of readyItems) {
      const mutation: DocumentMutation = {
        documentId: item.document_id,
        operation: item.operation,
        content: item.content,
        metadata: JSON.parse(item.metadata),
        timestamp: Date.now(),
      };

      const result = await pipeline.syncDocument(mutation);

      if (result.success) {
        // Mark as resolved
        const updateStmt = this.db.prepare(`
          UPDATE mutation_dlq 
          SET status = 'RESOLVED' 
          WHERE id = ?
        `);
        updateStmt.run(item.id);
        succeeded++;
      } else {
        const nextRetryCount = item.retry_count + 1;
        if (nextRetryCount >= item.max_retries) {
          // Permanently failed
          const failStmt = this.db.prepare(`
            UPDATE mutation_dlq 
            SET status = 'FAILED', retry_count = ?, error_message = ? 
            WHERE id = ?
          `);
          failStmt.run(nextRetryCount, result.error || 'Max retries exceeded', item.id);
          failed++;
        } else {
          // Exponential backoff: base 2s * 2^retryCount + jitter
          const backoffMs = Math.pow(2, nextRetryCount) * 2000 + Math.floor(Math.random() * 500);
          const nextRetryTime = now + backoffMs;
          const retryStmt = this.db.prepare(`
            UPDATE mutation_dlq 
            SET retry_count = ?, next_retry_at = ?, error_message = ? 
            WHERE id = ?
          `);
          retryStmt.run(nextRetryCount, nextRetryTime, result.error || item.error_message, item.id);
          failed++;
        }
      }
    }

    return { processed: readyItems.length, succeeded, failed };
  }

  public purgeResolved(): number {
    const res = this.db.prepare("DELETE FROM mutation_dlq WHERE status = 'RESOLVED'").run();
    return res.changes;
  }

  public getStats(): { totalPending: number; totalFailed: number; totalResolved: number } {
    const pending = (
      this.db.prepare("SELECT COUNT(*) as c FROM mutation_dlq WHERE status = 'PENDING'").get() as any
    ).c;
    const failed = (
      this.db.prepare("SELECT COUNT(*) as c FROM mutation_dlq WHERE status = 'FAILED'").get() as any
    ).c;
    const resolved = (
      this.db.prepare("SELECT COUNT(*) as c FROM mutation_dlq WHERE status = 'RESOLVED'").get() as any
    ).c;

    return {
      totalPending: pending,
      totalFailed: failed,
      totalResolved: resolved,
    };
  }
}
