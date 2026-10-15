import { HashChunker } from './hash-chunker.js';
import type { ChunkWithHash, ChunkerOptions } from '../../types/index.js';

export interface StructuralChunkerOptions extends ChunkerOptions {
  preserveTables?: boolean;
  codeBoundaryAware?: boolean;
}

export class StructuralChunker extends HashChunker {
  public readonly preserveTables: boolean;
  public readonly codeBoundaryAware: boolean;

  constructor(options?: StructuralChunkerOptions) {
    super(options);
    this.preserveTables = options?.preserveTables ?? true;
    this.codeBoundaryAware = options?.codeBoundaryAware ?? true;
  }

  /**
   * Chunks structured content (Code, Markdown Tables, JSON) respecting semantic boundaries.
   */
  public override chunkDocument(
    documentId: string,
    content: string,
    documentMetadata: Record<string, unknown> = {}
  ): ChunkWithHash[] {
    const trimmed = content.trim();

    // Check if entire content is a JSON document
    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
      try {
        const parsed = JSON.parse(trimmed);
        return this.chunkJsonDocument(documentId, parsed, documentMetadata);
      } catch {
        // Fall back to text parsing if invalid JSON
      }
    }

    if (this.preserveTables && this.containsMarkdownTable(content)) {
      return this.chunkTableAwareDocument(documentId, content, documentMetadata);
    }

    // Default to parent HashChunker
    return super.chunkDocument(documentId, content, documentMetadata);
  }

  /**
   * Chunks JSON structures: if array, chunks per record or batch of records.
   * If object, chunks by top-level keys.
   */
  private chunkJsonDocument(
    documentId: string,
    jsonData: any,
    documentMetadata: Record<string, unknown>
  ): ChunkWithHash[] {
    const chunks: ChunkWithHash[] = [];

    if (Array.isArray(jsonData)) {
      for (let i = 0; i < jsonData.length; i++) {
        const item = jsonData[i];
        const canonical = JSON.stringify(item, Object.keys(item || {}).sort(), 2);
        const contentHash = HashChunker.sha256(canonical);
        const meta = {
          ...documentMetadata,
          jsonIndex: i,
          itemType: 'json_array_element',
        };

        chunks.push({
          chunkId: `${documentId}#json-${i}`,
          chunkIndex: i,
          content: canonical,
          contentHash,
          metadata: meta,
          metadataHash: HashChunker.hashMetadata(meta),
          sectionPath: [`Array[${i}]`],
          tokenCount: HashChunker.estimateTokens(canonical),
        });
      }
      return chunks;
    }

    // JSON Object
    const keys = Object.keys(jsonData);
    let chunkIndex = 0;

    for (const key of keys) {
      const value = jsonData[key];
      const slice = { [key]: value };
      const canonical = JSON.stringify(slice, null, 2);
      const contentHash = HashChunker.sha256(canonical);
      const meta = {
        ...documentMetadata,
        jsonKey: key,
        chunkIndex,
      };

      chunks.push({
        chunkId: `${documentId}#json-${key}`,
        chunkIndex,
        content: canonical,
        contentHash,
        metadata: meta,
        metadataHash: HashChunker.hashMetadata(meta),
        sectionPath: [key],
        tokenCount: HashChunker.estimateTokens(canonical),
      });
      chunkIndex++;
    }

    return chunks;
  }

  private containsMarkdownTable(text: string): boolean {
    return /\|.+\|\n\|[-:\s|]+\|\n\|.+\|/.test(text);
  }

  /**
   * Markdown table-aware chunking: keeps entire tables together or prepends
   * table headers to segmented rows so query retrieval maintains column schemas.
   */
  private chunkTableAwareDocument(
    documentId: string,
    content: string,
    documentMetadata: Record<string, unknown>
  ): ChunkWithHash[] {
    const lines = HashChunker.canonicalize(content).split('\n');
    const chunks: ChunkWithHash[] = [];
    let chunkIndex = 0;

    let textBuffer: string[] = [];
    let inTable = false;
    let tableHeaderLines: string[] = [];
    let tableRowBuffer: string[] = [];

    const flushTextBuffer = () => {
      if (textBuffer.length === 0) return;
      const text = textBuffer.join('\n').trim();
      textBuffer = [];
      if (!text) return;

      const subChunks = super.chunkDocument(documentId, text, documentMetadata);
      for (const sc of subChunks) {
        chunks.push({
          ...sc,
          chunkId: `${documentId}#chunk-${chunkIndex}`,
          chunkIndex,
        });
        chunkIndex++;
      }
    };

    const flushTable = () => {
      if (tableRowBuffer.length === 0) return;
      const fullTable = [...tableHeaderLines, ...tableRowBuffer].join('\n').trim();
      tableRowBuffer = [];
      inTable = false;
      if (!fullTable) return;

      const canonical = HashChunker.canonicalize(fullTable);
      const contentHash = HashChunker.sha256(canonical);
      const meta = {
        ...documentMetadata,
        contentType: 'markdown_table',
        chunkIndex,
      };

      chunks.push({
        chunkId: `${documentId}#chunk-${chunkIndex}`,
        chunkIndex,
        content: canonical,
        contentHash,
        metadata: meta,
        metadataHash: HashChunker.hashMetadata(meta),
        sectionPath: ['Table'],
        tokenCount: HashChunker.estimateTokens(canonical),
      });
      chunkIndex++;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const isTableRow = line.trim().startsWith('|') && line.trim().endsWith('|');

      if (isTableRow) {
        if (!inTable) {
          flushTextBuffer();
          inTable = true;
          // Look ahead to check if next line is a table delimiter (| --- | --- |)
          const nextLine = lines[i + 1]?.trim() ?? '';
          if (nextLine.startsWith('|') && /\|[-:\s|]+\|/.test(nextLine)) {
            tableHeaderLines = [line, nextLine];
            i++; // skip delimiter row
            continue;
          } else {
            tableHeaderLines = [line];
          }
        } else {
          tableRowBuffer.push(line);
        }
      } else {
        if (inTable) {
          flushTable();
        }
        textBuffer.push(line);
      }
    }

    if (inTable) {
      flushTable();
    }
    flushTextBuffer();

    return chunks;
  }
}
