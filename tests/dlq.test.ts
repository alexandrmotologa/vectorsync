import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { MutationDlq } from '../src/core/sync/dlq.js';
import { SyncPipeline } from '../src/core/sync/sync-pipeline.js';
import { StateLedger } from '../src/core/delta/ledger.js';
import { MemoryVectorSink } from '../src/sinks/memory-sink.js';
import { MockEmbeddingProvider } from '../src/core/embeddings/mock-provider.js';
import type { DocumentMutation } from '../src/types/index.js';

describe('MutationDlq', () => {
  it('should enqueue failed mutations and report stats correctly', () => {
    const db = new Database(':memory:');
    const dlq = new MutationDlq(db);

    const mutation: DocumentMutation = {
      documentId: 'doc-failed-1',
      operation: 'UPSERT',
      content: 'Hello World failure test',
      metadata: { env: 'test' },
      timestamp: Date.now(),
    };

    const id = dlq.enqueue(mutation, new Error('Network timeout'), 3);
    expect(id).toMatch(/^dlq_/);

    const pending = dlq.listPending();
    expect(pending.length).toBe(1);
    expect(pending[0].documentId).toBe('doc-failed-1');
    expect(pending[0].errorMessage).toBe('Network timeout');
    expect(pending[0].retryCount).toBe(0);
    expect(pending[0].maxRetries).toBe(3);

    const stats = dlq.getStats();
    expect(stats.totalPending).toBe(1);
    expect(stats.totalResolved).toBe(0);
    expect(stats.totalFailed).toBe(0);
  });

  it('should process pending mutations and mark them resolved upon success', async () => {
    const db = new Database(':memory:');
    const dlq = new MutationDlq(db);
    const ledger = new StateLedger(':memory:');
    const sink = new MemoryVectorSink();
    const provider = new MockEmbeddingProvider();
    const pipeline = new SyncPipeline({ ledger, sink, embeddingProvider: provider });

    const mutation: DocumentMutation = {
      documentId: 'doc-retry-success',
      operation: 'UPSERT',
      content: 'Paragraph that will succeed on retry.',
      metadata: { retried: true },
      timestamp: Date.now(),
    };

    // Enqueue
    dlq.enqueue(mutation, new Error('Temporary 503 error'), 3);

    // Force next_retry_at to past so it qualifies immediately
    db.prepare("UPDATE mutation_dlq SET next_retry_at = 0 WHERE document_id = 'doc-retry-success'").run();

    const result = await dlq.processPending(pipeline);
    expect(result.processed).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);

    const stats = dlq.getStats();
    expect(stats.totalPending).toBe(0);
    expect(stats.totalResolved).toBe(1);

    const purged = dlq.purgeResolved();
    expect(purged).toBe(1);
    expect(dlq.getStats().totalResolved).toBe(0);
  });

  it('should advance retry count and mark as FAILED after max retries', async () => {
    const db = new Database(':memory:');
    const dlq = new MutationDlq(db);

    // Mock failing pipeline
    const mockFailingPipeline = {
      syncDocument: async () => ({
        success: false,
        documentId: 'doc-fail',
        error: 'Permanent vector rejection',
        plan: null,
        durationMs: 1,
      }),
    } as unknown as SyncPipeline;

    const mutation: DocumentMutation = {
      documentId: 'doc-permanently-failing',
      operation: 'UPSERT',
      content: 'This will exceed retries',
      metadata: {},
      timestamp: Date.now(),
    };

    dlq.enqueue(mutation, new Error('First failure'), 2);

    // Iteration 1: retryCount becomes 1
    db.prepare('UPDATE mutation_dlq SET next_retry_at = 0').run();
    let res = await dlq.processPending(mockFailingPipeline);
    expect(res.failed).toBe(1);

    let items = dlq.listPending();
    expect(items.length).toBe(1);
    expect(items[0].retryCount).toBe(1);

    // Iteration 2: retryCount becomes 2, reaching maxRetries (2) -> marks FAILED
    db.prepare('UPDATE mutation_dlq SET next_retry_at = 0').run();
    res = await dlq.processPending(mockFailingPipeline);
    expect(res.failed).toBe(1);

    const stats = dlq.getStats();
    expect(stats.totalPending).toBe(0);
    expect(stats.totalFailed).toBe(1);
  });
});
