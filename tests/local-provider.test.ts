import { describe, expect, it } from 'vitest';
import { LocalEmbeddingProvider } from '../src/core/embeddings/local-provider.js';

describe('LocalEmbeddingProvider', () => {
  it('should initialize with default model and dimensions', () => {
    const provider = new LocalEmbeddingProvider();
    expect(provider.name).toBe('local-Xenova/all-MiniLM-L6-v2');
    expect(provider.dimensions).toBe(384);
  });

  it('should accept custom model name and dimensions', () => {
    const provider = new LocalEmbeddingProvider({
      modelName: 'Xenova/bge-small-en-v1.5',
      dimensions: 384,
    });
    expect(provider.name).toBe('local-Xenova/bge-small-en-v1.5');
    expect(provider.dimensions).toBe(384);
  });

  it('should return empty array for empty inputs', async () => {
    const provider = new LocalEmbeddingProvider();
    const res = await provider.embed([]);
    expect(res).toEqual([]);
  });
});
