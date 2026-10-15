import crypto from 'node:crypto';
import type { EmbeddingProvider } from './base.js';

export class MockEmbeddingProvider implements EmbeddingProvider {
  public readonly name = 'mock-deterministic';
  public readonly dimensions: number;

  constructor(dimensions: number = 128) {
    this.dimensions = dimensions;
  }

  public async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => this.generateVector(text));
  }

  /**
   * Deterministically maps any text to a unit vector using SHA-512 byte stream.
   */
  private generateVector(text: string): number[] {
    const rawVector: number[] = [];
    let seed = text;

    while (rawVector.length < this.dimensions) {
      const hash = crypto.createHash('sha512').update(seed).digest();
      for (let i = 0; i < hash.length && rawVector.length < this.dimensions; i += 2) {
        // Read 16-bit signed integer and normalize to [-1, 1]
        const int16 = hash.readInt16LE(i);
        rawVector.push(int16 / 32768.0);
      }
      seed = hash.toString('hex');
    }

    // L2 normalize
    const sumSquares = rawVector.reduce((acc, val) => acc + val * val, 0);
    const norm = Math.sqrt(sumSquares) || 1.0;

    return rawVector.map((val) => Number((val / norm).toFixed(6)));
  }
}
