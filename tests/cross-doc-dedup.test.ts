import { describe, expect, it, beforeEach, vi } from 'vitest';
import { SyncPipeline } from '../src/core/sync/sync-pipeline.js';
import { StateLedger } from '../src/core/delta/ledger.js';
import { MemoryVectorSink } from '../src/sinks/memory-sink.js';
import { MockEmbeddingProvider } from '../src/core/embeddings/mock-provider.js';

describe('Cross-Document Content Deduplication', () => {
  let ledger: StateLedger;
  let sink: MemoryVectorSink;
  let embeddingProvider: MockEmbeddingProvider;
  let pipeline: SyncPipeline;

  beforeEach(() => {
    ledger = new StateLedger(':memory:');
    sink = new MemoryVectorSink();
    embeddingProvider = new MockEmbeddingProvider(64);
    pipeline = new SyncPipeline({
      ledger,
      sink,
      embeddingProvider,
    });
  });

  it('should detect identical chunks across distinct documents and reuse vectors with 0 tokens spent', async () => {
    const embedSpy = vi.spyOn(embeddingProvider, 'embed');

    const commonBoilerplate = 'Notice: This software is provided under standard corporate confidentiality agreements. Unauthorized distribution is strictly prohibited.';

    const docAContent = `
# Customer Data Privacy Policy

This policy outlines data retention and customer privacy safeguards.

${commonBoilerplate}

Section 1: Data retention policies for user telemetry records.
`;

    // Step 1: Ingest Document A
    const resA = await pipeline.syncDocument({
      documentId: 'doc-privacy-policy',
      operation: 'INSERT',
      content: docAContent,
    });

    expect(resA.success).toBe(true);
    expect(resA.plan.crossDocReusedCount).toBe(0);
    expect(embedSpy.mock.calls.length).toBe(1);

    // Step 2: Ingest Document B which shares the exact same commonBoilerplate paragraph
    const docBContent = `
# Vendor Security Compliance Policy

This policy defines vendor security validation and audits.

${commonBoilerplate}

Section 1: Third-party vendor penetration testing requirements.
`;

    embedSpy.mockClear();

    const resB = await pipeline.syncDocument({
      documentId: 'doc-vendor-compliance',
      operation: 'INSERT',
      content: docBContent,
    });

    expect(resB.success).toBe(true);
    expect(resB.plan.crossDocReusedCount).toBe(1);

    const reusedAction = resB.plan.actions.find((a) => a.type === 'REUSE_CROSS_DOC');
    expect(reusedAction).toBeDefined();
    expect(reusedAction?.canonicalVectorId).toContain('doc-privacy-policy');
    expect(reusedAction?.reason).toContain('doc-privacy-policy');

    // Embedding provider should ONLY be called for the new unique vendor paragraph, NOT the shared boilerplate!
    expect(embedSpy.mock.calls.length).toBe(1);
    const embeddedTexts = embedSpy.mock.calls[0][0];
    expect(embeddedTexts.length).toBe(2); // 2 unique paragraphs embedded, 1 shared boilerplate avoided
    expect(embeddedTexts.some((t) => t.includes('Third-party vendor penetration testing'))).toBe(true);
    expect(embeddedTexts.some((t) => t.includes('standard corporate confidentiality agreements'))).toBe(false);
  });
});
