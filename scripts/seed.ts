import { StateLedger } from '../src/core/delta/ledger.js';
import { SyncPipeline } from '../src/core/sync/sync-pipeline.js';
import { MemoryVectorSink } from '../src/sinks/memory-sink.js';
import { MockEmbeddingProvider } from '../src/core/embeddings/mock-provider.js';

async function seed() {
  const ledger = new StateLedger('.vectorsync/ledger.db');
  const sink = new MemoryVectorSink();
  const embeddingProvider = new MockEmbeddingProvider(128);

  const pipeline = new SyncPipeline({ ledger, sink, embeddingProvider });

  // Doc 1: API Reference
  await pipeline.syncDocument({
    documentId: 'api-reference.md',
    operation: 'INSERT',
    content: `# VectorSync API Specification\n\n## Webhook Receiver\nThe webhook endpoint accepts JSON mutations at /api/v1/cdc.\n\n## REST Query Engine\nVector searches use cosine distance metrics.\n\n## Rate Limiting\nRequests are throttled to 500 req/sec per tenant.`,
    metadata: { category: 'docs', service: 'core' },
  });

  // Doc 2: Production Runbook (v1 then v2)
  await pipeline.syncDocument({
    documentId: 'production-runbook.md',
    operation: 'INSERT',
    content: `# Production Operations Runbook\n\n## Severity 1 Incident Response\nPage the primary on-call engineer via PagerDuty.\n\n## Vector Drift Mitigation\nIf drift exceeds 0.5%, trigger a forced ledger reconciliation pass.\n\n## Rollback Protocol\nRevert to previous deployment tag within 3 minutes.`,
    metadata: { category: 'ops', priority: 'critical' },
  });

  // Update Runbook with minor edit (only drift section)
  await pipeline.syncDocument({
    documentId: 'production-runbook.md',
    operation: 'UPDATE',
    content: `# Production Operations Runbook\n\n## Severity 1 Incident Response\nPage the primary on-call engineer via PagerDuty.\n\n## Vector Drift Mitigation\nAutomated zero-downtime reconciliation is managed via VectorSync content-hash diffs.\n\n## Rollback Protocol\nRevert to previous deployment tag within 3 minutes.`,
    metadata: { category: 'ops', priority: 'critical' },
  });

  console.log('Seeded database with realistic CDC transactions!');
  ledger.close();
}

seed();
