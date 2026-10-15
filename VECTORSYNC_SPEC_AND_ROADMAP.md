# Engineering Specification & Implementation Blueprint: VectorSync
> Incremental Vector CDC & Metadata-Driven Ingestion Pipeline for Production RAG

---

## 1. Executive Summary & Problem Space

### 1.1 The Re-Indexing Tax in Enterprise RAG
Production RAG systems rely on keeping vector databases (Pinecone, Qdrant, OpenSearch, pgvector) in sync with primary operational data stores (PostgreSQL, MongoDB, Azure Cosmos DB, S3).

In practice, data changes continuously: documents are edited, product prices update, user permissions shift, and old records are deleted. However, current ingestion pipelines face two severe architectural bottlenecks:

1. **Full-Index Recomputation:** When a 50-page technical manual or product catalog changes a single paragraph, naive pipelines re-chunk, re-embed, and re-insert all 50 pages. In an enterprise system with 50,000 documents, this wastes thousands of dollars per week in unnecessary embedding API calls.
2. **Orphaned Vector Drift:** When a document is deleted or restructured in the primary database, corresponding vector chunks remain stranded in the vector index. RAG systems continue retrieving stale, hallucinated, or unauthorized data.
3. **Absence of Change Data Capture (CDC) for AI:** Data engineering tools (Debezium, Kafka) are designed for relational replication, not vector operations. There is no lightweight, developer-first engine that translates database row mutations into atomic chunk-level vector upserts and deletes.

### 1.2 The Solution: VectorSync
**VectorSync** is a developer CLI and embedded Web Studio built in **TypeScript and Node.js** that provides change data capture (CDC) and incremental synchronization between operational databases and vector indices.

* **Content-Hash Delta Engine:** Computes deterministic SHA-256 hashes for each text chunk. When a document is updated, VectorSync compares new chunk hashes against existing hashes, re-embedding only the exact chunks that were modified and bypassing identical text.
* **Atomic Deletion & Garbage Collection:** Automatically prunes orphaned vector IDs when sections are removed, guaranteeing that the vector index mirrors the primary source of truth.
* **Metadata-Only Fast Path:** If an update only modifies metadata (such as access control lists, timestamps, or category tags) without altering text, VectorSync updates vector metadata in place without calling embedding APIs.
* **Database & Vector Adapters:** Native support for PostgreSQL WAL changes, Azure Cosmos DB Change Feed events, and Webhook ingest, with sinks for Qdrant, Pinecone, and local pgvector.
* **Embedded Sync Studio:** A React 19 Web Studio visualizing synchronization lag, document change deltas, chunk hash diffs, and exact token cost savings in real time.

---

## 2. System Architecture & Tech Stack

```
┌────────────────────────────────────────────────────────────────────────┐
│                        VectorSync Architecture                         │
└────────────────────────────────────────────────────────────────────────┘

[ Source: PostgreSQL / Cosmos DB / S3 ] ---> [ CDC Event Stream / Webhook ]
                                                    │
                                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      VectorSync Core Engine                            │
├────────────────────────────────────────────────────────────────────────┤
│  Change Ingestion & Normalizer                                         │
│    ├── Change Event Parser (INSERT / UPDATE / DELETE)                  │
│    └── Document Extractors (Markdown, JSON, Plaintext)                 │
├────────────────────────────────────────────────────────────────────────┤
│  Chunk Hashing & Delta Calculator                                      │
│    ├── Deterministic Chunker (Separator-aware)                         │
│    ├── SHA-256 Content-Addressable Chunk Hasher                        │
│    └── State Ledger (Tracks Chunk ID <-> Content Hash mapping)         │
├────────────────────────────────────────────────────────────────────────┤
│  Sync Orchestrator & Batch Optimizer                                   │
│    ├── Delta Filter: Identical Hashes -> SKIP (Cost: $0)               │
│    ├── Text Changed -> RE-EMBED & UPSERT                               │
│    ├── Metadata Only Changed -> UPDATE METADATA (Cost: $0)             │
│    └── Removed Chunks -> DELETE FROM VECTOR INDEX                      │
├────────────────────────────────────────────────────────────────────────┤
│  Vector Index Adapters                                                 │
│    ├── In-Memory Local Vector Sink (for development & tests)           │
│    ├── Qdrant REST Adapter                                             │
│    ├── Pinecone REST Adapter                                           │
│    └── pgvector SQL Adapter                                            │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
[ Sinks: Qdrant / Pinecone / pgvector ] + [ React 19 Sync Studio (Port 50092) ]
```

### Technology Stack Choices
* **Runtime:** Node.js 22 LTS / TypeScript 5.6+
* **State Ledger:** Embedded SQLite (`better-sqlite3`) to track chunk hashes and sync state locally
* **Hashing:** Node.js native `crypto` (SHA-256)
* **Web Studio:** React 19 + Vite 6 + Tailwind CSS (bundled statically)
* **CLI Engine:** Commander.js + Picocolors + Ora + Table

---

## 3. Directory & File Structure

```
vectorsync/
├── bin/
│   └── vectorsync.js               # CLI executable entry point
├── src/
│   ├── cli/
│   │   ├── commands/
│   │   │   ├── listen.ts           # vectorsync listen --source <postgres|webhook> --sink <qdrant>
│   │   │   ├── status.ts           # vectorsync status (Reports sync lag and ledger stats)
│   │   │   ├── studio.ts           # vectorsync studio (Launches embedded visual dashboard)
│   │   │   └── sync-file.ts        # vectorsync sync-file <path> --dry-run
│   │   └── index.ts
│   ├── core/
│   │   ├── chunker/
│   │   │   ├── hash-chunker.ts     # Generates chunks with content-addressable SHA-256 hashes
│   │   │   └── options.ts
│   │   ├── delta/
│   │   │   ├── diff-calculator.ts  # Compares incoming chunks against ledger state
│   │   │   └── ledger.ts           # SQLite-backed state ledger for document-to-chunk mappings
│   │   ├── embeddings/
│   │   │   ├── base.ts             # EmbeddingProvider interface
│   │   │   ├── mock-provider.ts    # Deterministic vector mock for offline tests
│   │   │   └── openai-provider.ts  # OpenAI REST adapter
│   │   └── sync/
│   │       ├── batch-executor.ts   # Batches vector mutations for atomic network requests
│   │       └── sync-pipeline.ts    # End-to-end orchestration pipeline
│   ├── sources/
│   │   ├── base.ts                 # SourceAdapter interface
│   │   ├── filesystem-watcher.ts   # Local file change watcher (chokidar)
│   │   └── webhook-receiver.ts     # HTTP endpoint receiving JSON mutation payloads
│   ├── sinks/
│   │   ├── base.ts                 # VectorSink interface
│   │   ├── memory-sink.ts          # In-memory vector store for testing
│   │   ├── pgvector-sink.ts        # PostgreSQL pgvector sink
│   │   └── qdrant-sink.ts          # Qdrant vector database sink
│   ├── server/
│   │   ├── api-router.ts           # REST endpoints for embedded Studio
│   │   └── local-server.ts         # Embedded HTTP server
│   └── studio/                     # React 19 Frontend Web Studio
│       ├── index.html
│       ├── src/
│       │   ├── App.tsx
│       │   ├── components/
│       │   │   ├── CostSavingsCard.tsx     # Tokens and dollars saved counter
│       │   │   ├── DocumentDiffViewer.tsx  # Highlights modified vs unchanged chunks
│       │   │   ├── LedgerTable.tsx         # Active document mappings
│       │   │   └── SyncLagIndicator.tsx    # Pipeline latency and backlog queue
│       │   ├── styles/
│       │   │   └── index.css
│       │   └── main.tsx
│       └── vite.config.ts
├── tests/
│   ├── delta/
│   │   ├── diff-calculator.test.ts
│   │   └── ledger.test.ts
│   └── sync/
│       └── sync-pipeline.test.ts
├── fixtures/
│   ├── sample-doc-v1.md
│   └── sample-doc-v2.md
├── package.json
├── tsconfig.json
└── README.md
```

---

## 4. Core Data Contracts & Interfaces

```typescript
// src/core/delta/diff-calculator.ts
export interface ChunkWithHash {
  chunkIndex: number;
  content: string;
  contentHash: string; // SHA-256 of normalized text
  metadata: Record<string, unknown>;
}

export interface DocumentMutation {
  documentId: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  content?: string;
  metadata: Record<string, unknown>;
  timestamp: number;
}

export interface SyncPlan {
  documentId: string;
  toInsert: ChunkWithHash[];
  toUpdateText: ChunkWithHash[];
  toUpdateMetadataOnly: Array<{ chunkId: string; metadata: Record<string, unknown> }>;
  toDeleteChunkIds: string[];
  skippedUnchangedCount: number;
  estimatedTokensSaved: number;
}

// src/sinks/base.ts
export interface VectorSink {
  readonly sinkName: string;
  upsertChunks(documentId: string, chunks: Array<{ id: string; vector: number[]; metadata: Record<string, unknown> }>): Promise<void>;
  updateMetadata(chunkId: string, metadata: Record<string, unknown>): Promise<void>;
  deleteChunks(chunkIds: string[]): Promise<void>;
  deleteDocument(documentId: string): Promise<void>;
}
```

---

## 5. Implementation Roadmap (Phases 1-5)

### Phase 1: Content Hashing & SQLite Ledger
* Implement `hash-chunker.ts` taking text input, chunking it cleanly, and computing SHA-256 hashes per chunk.
* Implement SQLite `ledger.ts` schema:
  * `documents(id, total_chunks, last_synced_at)`
  * `chunks(id, document_id, chunk_index, content_hash, metadata_hash, vector_id)`
* Write unit tests verifying that editing 1 line in a 10-chunk document produces exactly 1 changed hash and 9 identical hashes.

### Phase 2: Diff Calculator & Delta Engine
* Build `diff-calculator.ts` that compares incoming document chunks against ledger state and outputs an executable `SyncPlan`.
* Categorize operations:
  1. `UNMODIFIED`: Content hash and metadata match -> Skip.
  2. `METADATA_ONLY`: Content matches, metadata changed -> No embedding required.
  3. `CONTENT_CHANGED`: Re-embed and update vector.
  4. `ORPHANED`: Chunks that existed in v1 but are gone in v2 -> Delete from index.

### Phase 3: Sinks & Batch Execution
* Implement `MemorySink` for unit tests and local CLI dry-runs.
* Implement `QdrantSink` and `PgVectorSink` with batching.
* Implement atomic commit: the local ledger only updates if the vector sink successfully confirms the mutation.

### Phase 4: Embedded Sync Studio (React 19)
* Build Document Diff Viewer: displays document text with chunks color-coded:
  * Green: newly added chunk
  * Yellow: modified chunk
  * Gray: skipped chunk (re-embedding avoided)
* Add Cost Savings Calculator: displays exact embedding tokens saved and dollars retained.
* Provide manual trigger sandbox: paste document v1, sync, paste document v2, inspect the generated diff plan.

### Phase 5: Production Ingestion Adapters & Documentation
* Add filesystem watcher (`chokidar`) to sync local markdown/document folders in real time.
* Add Webhook receiver endpoint for easy integration with PostgreSQL or CMS webhooks.
* Write humanized `README.md` with benchmark proof (e.g. "92% embedding cost reduction on incremental document updates").
