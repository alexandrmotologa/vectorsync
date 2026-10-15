import crypto from 'node:crypto';
import type { ChunkWithHash, ChunkerOptions } from '../../types/index.js';

export class HashChunker {
  private readonly maxChunkSize: number;
  private readonly minChunkSize: number;
  private readonly headerAware: boolean;

  constructor(options?: ChunkerOptions) {
    this.maxChunkSize = options?.maxChunkSize ?? 1200;
    this.minChunkSize = options?.minChunkSize ?? 60;
    this.headerAware = options?.headerAware ?? true;
  }

  /**
   * Deterministically canonicalizes text for hashing:
   * Normalizes unicode (NFC), unifies newlines, trims edge whitespace.
   */
  public static canonicalize(text: string): string {
    return text
      .normalize('NFC')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')
      .map((line) => line.trim())
      .join('\n')
      .trim();
  }

  /**
   * Computes SHA-256 hash of a string.
   */
  public static sha256(content: string): string {
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
  }

  /**
   * Deterministically hashes a metadata dictionary by sorting keys.
   */
  public static hashMetadata(metadata: Record<string, unknown>): string {
    const keys = Object.keys(metadata).sort();
    const sortedObj: Record<string, unknown> = {};
    for (const key of keys) {
      sortedObj[key] = metadata[key];
    }
    const json = JSON.stringify(sortedObj);
    return crypto.createHash('sha256').update(json, 'utf8').digest('hex');
  }

  /**
   * Estimates token count (approx. 4 characters per token for typical Latin text/code).
   */
  public static estimateTokens(text: string): number {
    if (!text || text.length === 0) return 0;
    const words = text.trim().split(/\s+/).length;
    const charEstimate = Math.ceil(text.length / 4);
    return Math.max(Math.ceil(words * 1.3), charEstimate);
  }

  /**
   * Chunks a document into deterministic chunks with SHA-256 hashes and metadata.
   */
  public chunkDocument(
    documentId: string,
    content: string,
    documentMetadata: Record<string, unknown> = {}
  ): ChunkWithHash[] {
    const canonical = HashChunker.canonicalize(content);
    if (!canonical) {
      return [];
    }

    const lines = canonical.split('\n');
    const chunks: ChunkWithHash[] = [];

    let currentSectionStack: string[] = [];
    let currentBuffer: string[] = [];
    let chunkIndex = 0;

    const flushBuffer = () => {
      if (currentBuffer.length === 0) return;
      const rawText = currentBuffer.join('\n').trim();
      currentBuffer = [];
      if (!rawText) return;

      const subChunks = this.splitLongChunk(rawText);
      for (const piece of subChunks) {
        const canonicalPiece = HashChunker.canonicalize(piece);
        if (!canonicalPiece) continue;

        const contentHash = HashChunker.sha256(canonicalPiece);
        const chunkMeta: Record<string, unknown> = {
          ...documentMetadata,
          sectionPath: [...currentSectionStack],
          chunkIndex,
        };
        const metadataHash = HashChunker.hashMetadata(chunkMeta);
        const tokenCount = HashChunker.estimateTokens(canonicalPiece);

        chunks.push({
          chunkId: `${documentId}#chunk-${chunkIndex}`,
          chunkIndex,
          content: canonicalPiece,
          contentHash,
          metadata: chunkMeta,
          metadataHash,
          sectionPath: [...currentSectionStack],
          tokenCount,
        });

        chunkIndex++;
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Check for Markdown headers (e.g. # Header, ## Subheader)
      const headerMatch = this.headerAware ? trimmed.match(/^(#{1,6})\s+(.*)$/) : null;

      if (headerMatch) {
        flushBuffer();
        const level = headerMatch[1].length;
        const title = headerMatch[2].trim();

        // Adjust stack based on header level
        currentSectionStack = currentSectionStack.slice(0, level - 1);
        currentSectionStack.push(title);

        currentBuffer.push(line);
      } else if (trimmed === '') {
        // Blank line marks paragraph boundary
        if (currentBuffer.length > 0) {
          // If buffer only contains the header line, don't flush yet so following content stays with header
          const hasNonHeaderContent = currentBuffer.some((l) => !l.trim().startsWith('#'));
          if (hasNonHeaderContent) {
            const currentLength = currentBuffer.join('\n').length;
            if (currentLength >= this.minChunkSize) {
              flushBuffer();
            } else {
              currentBuffer.push('');
            }
          } else {
            currentBuffer.push('');
          }
        }
      } else {
        currentBuffer.push(line);
        const currentLength = currentBuffer.join('\n').length;
        if (currentLength >= this.maxChunkSize) {
          flushBuffer();
        }
      }
    }

    flushBuffer();
    return chunks;
  }

  /**
   * Splits a long block of text into smaller chunks along sentence boundaries.
   */
  private splitLongChunk(text: string): string[] {
    if (text.length <= this.maxChunkSize) {
      return [text];
    }

    const sentences = text.match(/[^.!?]+[.!?]+(\s+|$)|[^.!?]+$/g) || [text];
    const result: string[] = [];
    let accumulated = '';

    for (const sentence of sentences) {
      if ((accumulated + sentence).length > this.maxChunkSize && accumulated.length > 0) {
        result.push(accumulated.trim());
        accumulated = sentence;
      } else {
        accumulated += sentence;
      }
    }

    if (accumulated.trim().length > 0) {
      result.push(accumulated.trim());
    }

    return result;
  }
}
