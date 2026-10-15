import pc from 'picocolors';
import ora from 'ora';
import { StateLedger } from '../../core/delta/ledger.js';
import { SyncPipeline } from '../../core/sync/sync-pipeline.js';
import { MemoryVectorSink } from '../../sinks/memory-sink.js';
import { MockEmbeddingProvider } from '../../core/embeddings/mock-provider.js';

export async function benchmarkCommand(options: {
  documents?: number;
  chunksPerDoc?: number;
}): Promise<void> {
  const docCount = Number(options.documents) || 20;
  const chunksPerDoc = Number(options.chunksPerDoc) || 10;

  console.log('\n' + pc.bold(pc.cyan('=== VectorSync Incremental CDC Benchmark ===')) + '\n');
  console.log(`Document Corpus:      ${pc.bold(docCount)} documents`);
  console.log(`Paragraphs / Doc:     ${pc.bold(chunksPerDoc)} chunks`);
  console.log(`Total Initial Chunks: ${pc.bold(docCount * chunksPerDoc)} chunks\n`);

  const spinner = ora('Generating synthetic corpus and running initial ingestion...').start();

  const ledger = new StateLedger(':memory:');
  const sink = new MemoryVectorSink();
  const embeddingProvider = new MockEmbeddingProvider(128);

  const pipeline = new SyncPipeline({
    ledger,
    sink,
    embeddingProvider,
  });

  // Step 1: Initial Ingestion of all documents
  const corpus: Array<{ id: string; paragraphs: string[] }> = [];

  for (let d = 0; d < docCount; d++) {
    const docId = `doc-bench-${d.toString().padStart(3, '0')}`;
    const paragraphs: string[] = [];
    for (let c = 0; c < chunksPerDoc; c++) {
      paragraphs.push(
        `Section ${c + 1}: Detailed engineering documentation for module ${d}-${c}. Implements enterprise reliability patterns, exponential backoff, and distributed locking mechanisms for production stability.`
      );
    }
    corpus.push({ id: docId, paragraphs });

    const content = paragraphs.join('\n\n');
    await pipeline.syncDocument({
      documentId: docId,
      operation: 'INSERT',
      content,
      metadata: { corpus: 'benchmark', docIndex: d },
    });
  }

  spinner.succeed(pc.green(`Initial corpus ingested: ${docCount * chunksPerDoc} chunks indexed.`));

  // Step 2: Incremental Mutation Phase
  const mutationSpinner = ora('Executing incremental document mutations (1 edited paragraph per doc)...').start();

  const startTime = performance.now();
  let totalNaiveTokens = 0;
  let totalVectorSyncTokens = 0;
  let totalSkippedChunks = 0;
  let totalReEmbeddedChunks = 0;

  for (let d = 0; d < docCount; d++) {
    const doc = corpus[d];
    // Modify ONLY paragraph 3
    const modifiedParagraphs = [...doc.paragraphs];
    modifiedParagraphs[2] = `Section 3: REVISED updated specification with SIMD vectorized operations and accelerated delta computation for benchmark iteration ${d}.`;
    const updatedContent = modifiedParagraphs.join('\n\n');
    const result = await pipeline.syncDocument({
      documentId: doc.id,
      operation: 'UPDATE',
      content: updatedContent,
      metadata: { corpus: 'benchmark', docIndex: d },
    });

    const naiveDocTokens = result.plan.tokensSaved + result.plan.tokensRequired;
    totalNaiveTokens += naiveDocTokens;
    totalVectorSyncTokens += result.plan.tokensRequired;
    totalSkippedChunks += result.plan.skippedUnchangedCount;
    totalReEmbeddedChunks += result.plan.toUpdateTextCount;
  }

  const durationMs = Number((performance.now() - startTime).toFixed(2));
  mutationSpinner.succeed(pc.green(`Completed ${docCount} document mutations in ${durationMs}ms.`));

  // Step 3: Analysis & Financial Metrics
  const tokensSaved = totalNaiveTokens - totalVectorSyncTokens;
  const costReductionPct = ((tokensSaved / totalNaiveTokens) * 100).toFixed(2);

  // Pricing models
  const naiveCostSmall = (totalNaiveTokens * (0.02 / 1_000_000)).toFixed(6);
  const vsCostSmall = (totalVectorSyncTokens * (0.02 / 1_000_000)).toFixed(6);

  const naiveCostLarge = (totalNaiveTokens * (0.13 / 1_000_000)).toFixed(6);
  const vsCostLarge = (totalVectorSyncTokens * (0.13 / 1_000_000)).toFixed(6);

  console.log('\n' + pc.bold(pc.cyan('=== Benchmark Results & Efficiency Comparison ===')));
  console.log(`Documents Updated:        ${pc.bold(docCount)}`);
  console.log(`Total Document Chunks:    ${pc.bold(docCount * chunksPerDoc)}`);
  console.log(`Identical Chunks Bypassed:${pc.green(totalSkippedChunks)} chunks (${pc.dim('0 API calls')})`);
  console.log(`Modified Chunks Embedded: ${pc.yellow(totalReEmbeddedChunks)} chunks`);
  console.log(`Naive Tokens Required:    ${pc.dim(totalNaiveTokens.toLocaleString())} tokens`);
  console.log(`VectorSync Tokens Spent: ${pc.bold(pc.yellow(totalVectorSyncTokens.toLocaleString()))} tokens`);
  console.log(`Tokens Retained:         ${pc.bold(pc.green(tokensSaved.toLocaleString()))} tokens`);
  console.log(`Token Cost Reduction:    ${pc.bold(pc.magenta(`${costReductionPct}% REDUCTION`))}\n`);

  console.log(pc.bold('Financial Model Projection:'));
  console.log(`  OpenAI text-embedding-3-small:`);
  console.log(`    Naive Recomputation:  ${pc.red(`$${naiveCostSmall} USD`)}`);
  console.log(`    VectorSync CDC:       ${pc.green(`$${vsCostSmall} USD`)}`);
  console.log(`  OpenAI text-embedding-3-large:`);
  console.log(`    Naive Recomputation:  ${pc.red(`$${naiveCostLarge} USD`)}`);
  console.log(`    VectorSync CDC:       ${pc.green(`$${vsCostLarge} USD`)}\n`);

  ledger.close();
}
