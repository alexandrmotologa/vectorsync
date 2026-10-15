import type { EmbeddingProvider } from './base.js';

export interface LocalEmbeddingOptions {
  modelName?: string;
  dimensions?: number;
}

export class LocalEmbeddingProvider implements EmbeddingProvider {
  public readonly name: string;
  public readonly dimensions: number;
  private modelName: string;
  private extractorPromise: Promise<any> | null = null;

  constructor(options?: LocalEmbeddingOptions) {
    this.modelName = options?.modelName ?? 'Xenova/all-MiniLM-L6-v2';
    this.dimensions = options?.dimensions ?? 384;
    this.name = `local-${this.modelName}`;
  }

  private async getExtractor(): Promise<any> {
    if (!this.extractorPromise) {
      this.extractorPromise = (async () => {
        try {
          const { pipeline, env } = await import('@xenova/transformers');
          // Allow local caching without warnings
          env.allowRemoteModels = true;
          return await pipeline('feature-extraction', this.modelName, {
            quantized: true,
          });
        } catch (err: any) {
          throw new Error(
            `Failed to load local ONNX transformer model (${this.modelName}): ${err.message}`
          );
        }
      })();
    }
    return this.extractorPromise;
  }

  public async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const extractor = await this.getExtractor();
    const results: number[][] = [];

    for (const text of texts) {
      const output = await extractor(text, {
        pooling: 'mean',
        normalize: true,
      });

      // Output tensor data
      const tensorData = Array.from(output.data) as number[];
      results.push(tensorData.slice(0, this.dimensions));
    }

    return results;
  }
}
