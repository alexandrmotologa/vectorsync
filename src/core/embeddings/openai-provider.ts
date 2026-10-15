import type { EmbeddingProvider } from './base.js';

export interface OpenAIOptions {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  dimensions?: number;
  batchSize?: number;
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  public readonly name: string;
  public readonly dimensions: number;
  private readonly apiKey: string;
  private readonly baseURL: string;
  private readonly model: string;
  private readonly batchSize: number;

  constructor(options?: OpenAIOptions) {
    this.apiKey = options?.apiKey ?? process.env.OPENAI_API_KEY ?? '';
    this.baseURL = (options?.baseURL ?? process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/+$/, '');
    this.model = options?.model ?? 'text-embedding-3-small';
    this.dimensions = options?.dimensions ?? (this.model === 'text-embedding-3-large' ? 3072 : 1536);
    this.batchSize = options?.batchSize ?? 100;
    this.name = `openai-${this.model}`;
  }

  public async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    if (!this.apiKey && !this.baseURL.includes('localhost') && !this.baseURL.includes('127.0.0.1')) {
      throw new Error('OPENAI_API_KEY is required for OpenAIEmbeddingProvider unless pointing to local endpoint.');
    }

    const results: number[][] = [];

    // Process in batches
    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);
      const batchVectors = await this.embedBatchWithRetry(batch);
      results.push(...batchVectors);
    }

    return results;
  }

  private async embedBatchWithRetry(batch: string[], retries = 3): Promise<number[][]> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await fetch(`${this.baseURL}/embeddings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.model,
            input: batch,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
        }

        const data = (await response.json()) as {
          data: Array<{ index: number; embedding: number[] }>;
        };

        // Sort by original index
        const sorted = data.data.sort((a, b) => a.index - b.index);
        return sorted.map((item) => item.embedding);
      } catch (err: any) {
        lastError = err;
        if (attempt < retries) {
          // Exponential backoff
          await new Promise((res) => setTimeout(res, Math.pow(2, attempt) * 200));
        }
      }
    }

    throw lastError ?? new Error('Failed to embed batch with OpenAI');
  }
}
