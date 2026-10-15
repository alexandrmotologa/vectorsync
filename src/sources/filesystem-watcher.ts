import path from 'node:path';
import { EventEmitter } from 'node:events';
import chokidar, { type FSWatcher } from 'chokidar';
import type { SyncPipeline } from '../core/sync/sync-pipeline.js';

export interface WatcherOptions {
  directory: string;
  globPattern?: string;
  debounceMs?: number;
  extensions?: string[];
}

export class FilesystemWatcher extends EventEmitter {
  private pipeline: SyncPipeline;
  private options: Required<WatcherOptions>;
  private watcher: FSWatcher | null = null;
  private debounceTimers = new Map<string, NodeJS.Timeout>();

  constructor(pipeline: SyncPipeline, options: WatcherOptions) {
    super();
    this.pipeline = pipeline;
    this.options = {
      directory: path.resolve(options.directory),
      globPattern: options.globPattern ?? '**/*',
      debounceMs: options.debounceMs ?? 250,
      extensions: options.extensions ?? ['.md', '.txt', '.json', '.markdown'],
    };
  }

  public start(): void {
    const watchTarget = path.join(this.options.directory, this.options.globPattern);

    this.watcher = chokidar.watch(watchTarget, {
      ignored: /(^|[\/\\])\..|node_modules|dist/,
      persistent: true,
      ignoreInitial: false,
    });

    this.watcher.on('add', (filePath) => this.handleFileEvent('add', filePath));
    this.watcher.on('change', (filePath) => this.handleFileEvent('change', filePath));
    this.watcher.on('unlink', (filePath) => this.handleFileDelete(filePath));
    this.watcher.on('error', (err) => this.emit('error', err));
  }

  public async stop(): Promise<void> {
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }

  private handleFileEvent(event: 'add' | 'change', filePath: string): void {
    const ext = path.extname(filePath).toLowerCase();
    if (this.options.extensions.length > 0 && !this.options.extensions.includes(ext)) {
      return;
    }

    // Debounce rapid writes
    const existingTimer = this.debounceTimers.get(filePath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(async () => {
      this.debounceTimers.delete(filePath);
      try {
        const result = await this.pipeline.syncFile(filePath);
        this.emit('synced', { event, filePath, result });
      } catch (err: any) {
        this.emit('error', { filePath, error: err.message });
      }
    }, this.options.debounceMs);

    this.debounceTimers.set(filePath, timer);
  }

  private async handleFileDelete(filePath: string): Promise<void> {
    const docId = path.basename(filePath);
    try {
      const result = await this.pipeline.syncDocument({
        documentId: docId,
        operation: 'DELETE',
        timestamp: Date.now(),
      });
      this.emit('deleted', { filePath, docId, result });
    } catch (err: any) {
      this.emit('error', { filePath, error: err.message });
    }
  }
}
