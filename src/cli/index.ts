import { Command } from 'commander';
import { syncFileCommand } from './commands/sync-file.js';
import { listenCommand } from './commands/listen.js';
import { statusCommand } from './commands/status.js';
import { studioCommand } from './commands/studio.js';
import { benchmarkCommand } from './commands/benchmark.js';

export function createCli(): Command {
  const program = new Command();

  program
    .name('vectorsync')
    .description('Incremental Vector CDC & Content-Hash Synchronization Pipeline for Production RAG')
    .version('0.1.0');

  program
    .command('sync-file')
    .description('Incrementally synchronize a local document into vector sink')
    .argument('<file>', 'Path to file (.md, .txt, .json)')
    .option('--id <docId>', 'Custom document ID (defaults to file basename)')
    .option('--sink <type>', 'Vector sink adapter: memory, qdrant, pgvector', 'memory')
    .option('--model <name>', 'Embedding pricing model for cost estimation', 'text-embedding-3-small')
    .option('--db <path>', 'SQLite state ledger path', '.vectorsync/ledger.db')
    .option('--dry-run', 'Preview synchronization plan and token savings without committing')
    .action(async (file, options) => {
      await syncFileCommand(file, options);
    });

  program
    .command('listen')
    .description('Run background CDC ingestion listener (filesystem watcher or webhook server)')
    .option('--source <source>', 'Source type: filesystem or webhook', 'filesystem')
    .option('--dir <path>', 'Directory to watch when source=filesystem', './docs')
    .option('--port <number>', 'Port to bind when source=webhook', '50091')
    .option('--sink <type>', 'Vector sink adapter: memory, qdrant, pgvector', 'memory')
    .option('--db <path>', 'SQLite state ledger path', '.vectorsync/ledger.db')
    .action(async (options) => {
      await listenCommand(options);
    });

  program
    .command('status')
    .description('Report state ledger statistics, indexed documents, and cumulative token savings')
    .option('--db <path>', 'SQLite state ledger path', '.vectorsync/ledger.db')
    .action((options) => {
      statusCommand(options);
    });

  program
    .command('studio')
    .description('Launch the embedded React 19 visual studio & telemetry server')
    .option('--port <number>', 'Studio HTTP server port', '50092')
    .option('--db <path>', 'SQLite state ledger path', '.vectorsync/ledger.db')
    .action(async (options) => {
      await studioCommand(options);
    });

  program
    .command('benchmark')
    .description('Run synthetic CDC workload comparing naive re-indexing vs VectorSync savings')
    .option('--documents <number>', 'Number of documents in corpus', '20')
    .option('--chunks-per-doc <number>', 'Paragraph chunks per document', '10')
    .action(async (options) => {
      await benchmarkCommand(options);
    });

  return program;
}

if (process.argv[1]?.endsWith('src/cli/index.ts') || process.argv[1]?.endsWith('bin/vectorsync.js')) {
  createCli().parse(process.argv);
}
