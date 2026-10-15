import path from 'node:path';
import fs from 'node:fs';
import express, { type Request, type Response } from 'express';
import cors from 'cors';
import type { SyncPipeline, SyncResult } from '../core/sync/sync-pipeline.js';

export interface ServerOptions {
  port?: number;
  staticDir?: string;
}

export class LocalServer {
  private app: express.Express;
  private pipeline: SyncPipeline;
  private port: number;
  private server: any = null;
  private sseClients: Set<Response> = new Set();

  constructor(pipeline: SyncPipeline, options?: ServerOptions) {
    this.pipeline = pipeline;
    this.port = options?.port ?? 50092;
    this.app = express();

    this.setupMiddleware();
    this.setupApiRoutes();
    this.setupStaticRoutes(options?.staticDir);
    this.bindPipelineEvents();
  }

  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json({ limit: '10mb' }));
  }

  private setupApiRoutes(): void {
    // Health check
    this.app.get('/api/health', (_req, res) => {
      res.json({ status: 'ok', service: 'vectorsync-studio-server' });
    });

    // Pipeline & Ledger Stats
    this.app.get('/api/stats', async (_req, res) => {
      try {
        const ledgerStats = this.pipeline.getStats();
        const sinkStats = await this.pipeline.sink.getStats();
        res.json({
          ledger: ledgerStats,
          sink: sinkStats,
          embeddingModel: this.pipeline.embeddingProvider.name,
        });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // List all documents in ledger
    this.app.get('/api/documents', (_req, res) => {
      try {
        const docs = this.pipeline.ledger.getAllDocuments();
        res.json(docs);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // Get specific document chunks
    this.app.get('/api/documents/:id', (req, res) => {
      try {
        const doc = this.pipeline.ledger.getDocument(req.params.id);
        if (!doc) {
          res.status(404).json({ error: 'Document not found in ledger' });
          return;
        }
        const chunks = this.pipeline.ledger.getChunksForDocument(req.params.id);
        res.json({ document: doc, chunks });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // Get recent audit logs
    this.app.get('/api/audit-logs', (req, res) => {
      try {
        const limit = Number(req.query.limit) || 50;
        const logs = this.pipeline.ledger.getAuditLogs(limit);
        res.json(logs);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // Sandbox simulation endpoint (dry-run or real commit)
    this.app.post('/api/simulate', async (req, res) => {
      try {
        const { documentId, operation = 'UPDATE', content = '', metadata = {}, dryRun = true } = req.body;
        if (!documentId) {
          res.status(400).json({ error: 'documentId is required' });
          return;
        }

        const result = await this.pipeline.syncDocument(
          {
            documentId,
            operation,
            content,
            metadata,
            timestamp: Date.now(),
          },
          Boolean(dryRun)
        );

        res.json(result);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // Semantic Vector Search endpoint
    this.app.post('/api/search', async (req, res) => {
      try {
        const { query, topK = 5, filter } = req.body;
        if (!query) {
          res.status(400).json({ error: 'query string is required' });
          return;
        }

        const vectors = await this.pipeline.embeddingProvider.embed([String(query)]);
        const results = await this.pipeline.sink.query(vectors[0], Number(topK), filter);

        res.json({
          query,
          count: results.length,
          sink: this.pipeline.sink.sinkName,
          model: this.pipeline.embeddingProvider.name,
          results,
        });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // Real-time Server-Sent Events (SSE)
    this.app.get('/api/events', (req: Request, res: Response) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      this.sseClients.add(res);

      // Send initial connection event
      res.write(`data: ${JSON.stringify({ type: 'CONNECTED', timestamp: Date.now() })}\n\n`);

      req.on('close', () => {
        this.sseClients.delete(res);
      });
    });
  }

  private bindPipelineEvents(): void {
    this.pipeline.on('sync', (result: SyncResult) => {
      this.broadcastSse('SYNC_EVENT', result);
    });

    this.pipeline.on('error', (err: any) => {
      this.broadcastSse('ERROR_EVENT', err);
    });
  }

  private broadcastSse(type: string, payload: any): void {
    const data = JSON.stringify({ type, payload, timestamp: Date.now() });
    for (const client of this.sseClients) {
      try {
        client.write(`data: ${data}\n\n`);
      } catch {
        this.sseClients.delete(client);
      }
    }
  }

  private setupStaticRoutes(staticDir?: string): void {
    const studioDist = staticDir ?? path.resolve(process.cwd(), 'dist', 'studio');

    if (fs.existsSync(studioDist)) {
      this.app.use(express.static(studioDist));
      this.app.use((_req, res) => {
        res.sendFile(path.join(studioDist, 'index.html'));
      });
    } else {
      // Fallback HTML page if Studio bundle is not yet built
      this.app.use((_req, res) => {
        res.send(this.renderFallbackHtml());
      });
    }
  }

  private renderFallbackHtml(): string {
    const stats = this.pipeline.getStats();
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VectorSync Studio</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #090d16; color: #f1f5f9; padding: 2rem; margin: 0; }
    .card { background: #131c2e; border: 1px solid #1e293b; border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem; max-width: 900px; }
    h1 { color: #38bdf8; margin-top: 0; }
    .metric { font-size: 2rem; font-weight: bold; color: #10b981; }
    .label { color: #94a3b8; font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.05em; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-top: 1rem; }
    pre { background: #0f172a; padding: 1rem; border-radius: 8px; overflow-x: auto; color: #e2e8f0; }
    .badge { background: #0369a1; color: #e0f2fe; padding: 4px 8px; border-radius: 6px; font-size: 0.75rem; }
  </style>
</head>
<body>
  <div class="card">
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <h1>VectorSync Studio</h1>
      <span class="badge">LIVE ENGINE</span>
    </div>
    <p>Incremental Vector CDC & Content-Hash Synchronization Engine</p>
    <div class="grid">
      <div>
        <div class="label">Tokens Saved</div>
        <div class="metric">${stats.totalTokensSaved.toLocaleString()}</div>
      </div>
      <div>
        <div class="label">Cost Saved (USD)</div>
        <div class="metric">$${stats.totalCostSavedUsd.toFixed(4)}</div>
      </div>
      <div>
        <div class="label">Total Documents</div>
        <div class="metric" style="color: #38bdf8;">${stats.totalDocuments}</div>
      </div>
      <div>
        <div class="label">Total Chunks</div>
        <div class="metric" style="color: #a855f7;">${stats.totalChunks}</div>
      </div>
    </div>
  </div>
  <div class="card">
    <h3>Active Vector Sink</h3>
    <p><strong>Sink Adapter:</strong> ${this.pipeline.sink.sinkName}</p>
    <p><strong>Embedding Model:</strong> ${this.pipeline.embeddingProvider.name}</p>
    <p><strong>API Endpoint:</strong> <code>http://localhost:${this.port}/api/stats</code></p>
    <p><strong>SSE Live Stream:</strong> <code>http://localhost:${this.port}/api/events</code></p>
  </div>
</body>
</html>`;
  }

  public async primeMemorySink(): Promise<void> {
    if (this.pipeline.sink.sinkName === 'in-memory') {
      const docs = this.pipeline.ledger.getAllDocuments();
      const chunks = docs.flatMap((d) => this.pipeline.ledger.getChunksForDocument(d.id));
      if (chunks.length > 0) {
        const vectorItems = [];
        for (const chunk of chunks) {
          const vectors = await this.pipeline.embeddingProvider.embed([chunk.id]);
          let sectionArr: string[] = [];
          try {
            sectionArr = JSON.parse(chunk.sectionPath);
          } catch {}
          vectorItems.push({
            chunkId: chunk.id,
            vector: vectors[0],
            metadata: {
              documentId: chunk.documentId,
              chunkIndex: chunk.chunkIndex,
              contentHash: chunk.contentHash,
              section: sectionArr.join(' > ') || chunk.id,
            },
          });
        }
        await this.pipeline.sink.upsertChunks(vectorItems);
      }
    }
  }

  public async start(): Promise<number> {
    await this.primeMemorySink();
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, () => {
        resolve(this.port);
      });
    });
  }

  public async stop(): Promise<void> {
    for (const client of this.sseClients) {
      try {
        client.end();
      } catch {}
    }
    this.sseClients.clear();

    if (this.server) {
      await new Promise<void>((resolve, reject) => {
        this.server.close((err?: Error) => {
          if (err) reject(err);
          else resolve();
        });
      });
      this.server = null;
    }
  }

  public getApp(): express.Express {
    return this.app;
  }
}
