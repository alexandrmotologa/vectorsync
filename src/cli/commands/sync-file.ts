import fs from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import ora from 'ora';
import { StateLedger } from '../../core/delta/ledger.js';
import { SyncPipeline } from '../../core/sync/sync-pipeline.js';
import { MemoryVectorSink } from '../../sinks/memory-sink.js';
import { QdrantVectorSink } from '../../sinks/qdrant-sink.js';
import { MockEmbeddingProvider } from '../../core/embeddings/mock-provider.js';
import { OpenAIEmbeddingProvider } from '../../core/embeddings/openai-provider.js';
import { DiffCalculator } from '../../core/delta/diff-calculator.js';

export async function syncFileCommand(
  filePath: string,
  options: {
    sink?: string;
    dryRun?: boolean;
    db?: string;
    model?: string;
    id?: string;
  }
): Promise<void> {
  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(pc.red(`Error: File not found at ${resolvedPath}`));
    process.exit(1);
  }

  // Ensure DB folder exists
  const dbPath = options.db ?? process.env.VECTORSYNC_DB_PATH ?? '.vectorsync/ledger.db';
  if (dbPath !== ':memory:') {
    const dir = path.dirname(path.resolve(dbPath));
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const spinner = ora(pc.cyan(`Parsing and hashing ${path.basename(resolvedPath)}...`)).start();

  const ledger = new StateLedger(dbPath);
  const diffCalculator = new DiffCalculator(options.model ?? 'text-embedding-3-small');

  let sink = options.sink === 'qdrant' ? new QdrantVectorSink() : new MemoryVectorSink();
  let embeddingProvider = process.env.OPENAI_API_KEY
    ? new OpenAIEmbeddingProvider()
    : new MockEmbeddingProvider();

  const pipeline = new SyncPipeline({
    ledger,
    sink,
    embeddingProvider,
    diffCalculator,
  });

  const result = await pipeline.syncFile(resolvedPath, options.id, options.dryRun);

  if (!result.success) {
    spinner.fail(pc.red(`Synchronization failed: ${result.error}`));
    ledger.close();
    process.exit(1);
  }

  const plan = result.plan;
  spinner.succeed(
    pc.green(
      `Synchronized ${pc.bold(result.documentId)} [${result.operation}] in ${result.durationMs}ms`
    )
  );

  console.log('\n' + pc.bold(pc.cyan('=== Synchronization Plan & Delta Summary ===')));
  console.log(`Document ID:         ${pc.bold(result.documentId)}`);
  console.log(`Operation:           ${pc.yellow(result.operation)} ${options.dryRun ? pc.dim('(DRY RUN)') : ''}`);
  console.log(`Total Chunks:        ${pc.white(plan.totalChunks)}`);
  console.log(`Unmodified (Skipped):${pc.green(plan.skippedUnchangedCount)} (${pc.dim('$0 spent, 0 tokens')})`);
  console.log(`Re-embedded Chunks:  ${pc.yellow(plan.toUpdateTextCount + plan.toInsertCount)}`);
  console.log(`Metadata Only Chunks:${pc.cyan(plan.toUpdateMetadataOnlyCount)}`);
  console.log(`Pruned Orphans:      ${pc.red(plan.toDeleteChunkIds.length)}`);
  console.log(`Tokens Saved:        ${pc.bold(pc.green(plan.tokensSaved.toLocaleString()))}`);
  console.log(`Tokens Required:     ${pc.bold(pc.yellow(plan.tokensRequired.toLocaleString()))}`);
  console.log(`Cost Retained:       ${pc.bold(pc.green(`$${plan.estimatedCostSavingsUsd.toFixed(6)} USD`))}`);
  console.log(`Efficiency Score:    ${pc.bold(pc.magenta(`${plan.efficiencyPercentage}%`))}\n`);

  if (plan.actions.length > 0) {
    console.log(pc.bold(pc.dim('Chunk Details:')));
    for (const act of plan.actions.slice(0, 8)) {
      const icon =
        act.type === 'SKIP'
          ? pc.green('✔ SKIP')
          : act.type === 'UPSERT_TEXT_CHANGED'
          ? pc.yellow('⚡ RE-EMBED')
          : act.type === 'UPDATE_METADATA_ONLY'
          ? pc.cyan('🏷  META')
          : pc.red('✖ PRUNE');
      console.log(`  ${icon} ${pc.bold(act.chunkId)}: ${pc.dim(act.reason)}`);
    }
    if (plan.actions.length > 8) {
      console.log(pc.dim(`  ... and ${plan.actions.length - 8} more chunks`));
    }
  }

  console.log('');
  ledger.close();
}
