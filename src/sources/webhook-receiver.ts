import crypto from 'node:crypto';
import express, { type Request, type Response } from 'express';
import cors from 'cors';
import type { SyncPipeline } from '../core/sync/sync-pipeline.js';
import type { DocumentMutation } from '../types/index.js';

export interface WebhookOptions {
  port?: number;
  secret?: string;
  path?: string;
}

export class WebhookReceiver {
  private app: express.Express;
  private pipeline: SyncPipeline;
  private server: any = null;
  private port: number;
  private secret?: string;

  constructor(pipeline: SyncPipeline, options?: WebhookOptions) {
    this.pipeline = pipeline;
    this.port = options?.port ?? 50091;
    this.secret = options?.secret ?? process.env.VECTORSYNC_WEBHOOK_SECRET;
    this.app = express();

    this.setupMiddleware();
    this.setupRoutes(options?.path ?? '/webhook');
  }

  private setupMiddleware(): void {
    this.app.use(cors());
    // Parse raw buffer for HMAC verification if secret is provided
    this.app.use(
      express.json({
        verify: (req: any, _res, buf) => {
          req.rawBody = buf;
        },
      })
    );
  }

  private verifySignature(req: Request): boolean {
    if (!this.secret) return true; // No secret configured, allow

    const signature =
      (req.headers['x-vectorsync-signature'] as string) ||
      (req.headers['x-hub-signature-256'] as string);

    if (!signature) return false;

    const rawBody = (req as any).rawBody || Buffer.from(JSON.stringify(req.body));
    const hmac = crypto.createHmac('sha256', this.secret).update(rawBody).digest('hex');
    const expected = signature.startsWith('sha256=') ? signature.slice(7) : signature;

    return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expected));
  }

  private setupRoutes(webhookPath: string): void {
    this.app.get('/health', (_req: Request, res: Response) => {
      res.json({ status: 'ok', service: 'vectorsync-webhook-receiver' });
    });

    const handler = async (req: Request, res: Response) => {
      if (!this.verifySignature(req)) {
        res.status(401).json({ error: 'Invalid or missing HMAC signature' });
        return;
      }

      const body = req.body as Partial<DocumentMutation>;

      if (!body.documentId || !body.operation) {
        res.status(400).json({
          error: 'Missing required fields: documentId and operation (INSERT | UPDATE | DELETE)',
        });
        return;
      }

      const mutation: DocumentMutation = {
        documentId: String(body.documentId),
        operation: body.operation as any,
        content: body.content,
        metadata: body.metadata || {},
        timestamp: body.timestamp || Date.now(),
      };

      try {
        const result = await this.pipeline.syncDocument(mutation);
        res.status(result.success ? 200 : 500).json(result);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    };

    this.app.post(webhookPath, handler);
    this.app.post('/api/v1/cdc', handler);
  }

  public async start(): Promise<number> {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, () => {
        resolve(this.port);
      });
    });
  }

  public async stop(): Promise<void> {
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
