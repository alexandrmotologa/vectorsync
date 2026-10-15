# VectorSync Architecture & Engineering Specifications

This document outlines the internal mechanics, algorithmic invariants, and data contracts of VectorSync.

---

## 1. Problem Space: The Re-Indexing Bottleneck in Production RAG

Retrieval-augmented generation (RAG) applications depend on low-latency semantic search over continuously updating knowledge bases. In enterprise production systems, underlying documents mutate frequently:
- Software engineers update specific functions in technical documentation.
- Compliance teams amend individual regulatory clauses in policy manuals.
- Operational product managers adjust prices and metadata attributes in catalog items.

Traditional ingestion pipelines treat document indexing as an idempotent batch job: the entire file is re-parsed, re-chunked, embedded via external API calls, and re-inserted into the vector store.

When a 20,000-word document receives a 10-word update, naive pipelines incur 100% of the embedding cost and vector index write I/O. For high-volume production deployments with tens of thousands of active documents, this causes significant API expenditure and vector drift.

---

## 2. Core Delta Engine Mechanics

VectorSync introduces a four-stage content-addressable pipeline:

### 2.1 Deterministic Canonicalization & Hashing

Before calculating hashes, text is normalized:
1. Unicode NFC normalization ensures identical glyph representations across operating systems.
2. Line breaks are standardized to `\n`.
3. Trailing and leading line whitespace is stripped.

Each chunk receives a deterministic SHA-256 hash:

$$\text{ChunkHash} = \text{SHA256}(\text{CanonicalText})$$

For metadata attributes, keys are lexicographically sorted prior to serialization:

$$\text{MetadataHash} = \text{SHA256}(\text{CanonicalJSON}(\text{SortedMetadata}))$$

### 2.2 Header-Aware Chunker

The chunker parses Markdown heading levels (`#`, `##`, `###`) to preserve hierarchical breadcrumbs (such as `["Architecture", "Storage Layer"]`). Section headers buffer alongside initial section content so that headings are not isolated into single-word chunks.

### 2.3 SQLite State Ledger

VectorSync maintains an embedded SQLite state ledger using Write-Ahead Logging (`WAL` mode). The ledger maintains the mapping between primary document IDs, chunk indices, content hashes, and vector IDs.

```
documents
├── id (PK, TEXT)
├── content_hash (TEXT)
├── total_chunks (INTEGER)
├── last_synced_at (INTEGER)
└── metadata (TEXT)

chunks
├── id (PK, TEXT: docId#chunk-index)
├── document_id (FK -> documents.id)
├── chunk_index (INTEGER)
├── content_hash (TEXT)
├── metadata_hash (TEXT)
├── vector_id (TEXT)
├── token_count (INTEGER)
├── section_path (TEXT)
├── created_at (INTEGER)
└── updated_at (INTEGER)
```

### 2.4 Mutation Decision Matrix

When an incoming mutation arrives with new chunks $C_{new} = \{c_1, c_2, \dots, c_m\}$ and the ledger contains previous chunks $C_{old} = \{e_1, e_2, \dots, e_n\}$:

| Condition | Action | Embedding API Call? | Vector Sink Operation |
| :--- | :--- | :--- | :--- |
| $\text{hash}(c_i) = \text{hash}(e_i) \land \text{meta}(c_i) = \text{meta}(e_i)$ | `SKIP` | **No ($0)** | None |
| $\text{hash}(c_i) = \text{hash}(e_i) \land \text{meta}(c_i) \neq \text{meta}(e_i)$ | `UPDATE_METADATA_ONLY` | **No ($0)** | Update payload in place |
| $\text{hash}(c_i) \neq \text{hash}(e_i)$ | `UPSERT_TEXT_CHANGED` | **Yes** | Re-embed & upsert point |
| $c_i \notin C_{old}$ | `UPSERT_TEXT_CHANGED` | **Yes** | Embed new chunk & insert |
| $e_k \notin C_{new}$ | `DELETE_ORPHAN` | **No ($0)** | Delete point from index |

---

## 3. Mathematical Cost Savings Model

Let a document corpus contain $D$ documents with average $K$ chunks per document.
Let $T$ be the average token count per chunk, and $P$ be the embedding price per token.

Under naive full-reindexing, an update to $U$ documents costs:

$$\text{Cost}_{\text{naive}} = U \times K \times T \times P$$

Under VectorSync, if only $M$ chunks are modified per updated document ($M \ll K$):

$$\text{Cost}_{\text{VectorSync}} = U \times M \times T \times P$$

The total dollar savings is:

$$\Delta \text{Cost} = U \times (K - M) \times T \times P$$

The efficiency ratio:

$$\text{Efficiency} = \left( 1 - \frac{M}{K} \right) \times 100\%$$

When 1 paragraph out of a 10-paragraph document is updated ($M = 1, K = 10$), the efficiency is exactly:

$$\text{Efficiency} = \left( 1 - \frac{1}{10} \right) \times 100\% = 90.0\%$$

---

## 4. Vector Sink Adapters

VectorSync provides an extensible adapter interface:

```typescript
export interface VectorSink {
  readonly sinkName: string;
  upsertChunks(chunks: VectorItem[]): Promise<void>;
  updateMetadata(chunkId: string, metadata: Record<string, unknown>): Promise<void>;
  deleteChunks(chunkIds: string[]): Promise<void>;
  deleteDocument(documentId: string): Promise<void>;
  query(vector: number[], topK?: number, filter?: Record<string, unknown>): Promise<VectorSearchResult[]>;
  getStats(): Promise<VectorSinkStats>;
}
```

1. **In-Memory Sink:** Computes exact cosine similarity in memory, ideal for unit testing and local offline CLI dry runs.
2. **Qdrant REST Adapter:** Maps string chunk IDs to deterministic UUIDs and utilizes points upsert, payload update, and batch deletion endpoints.
3. **pgvector SQL Adapter:** Connects to PostgreSQL, maintains vector tables with IVFFlat / HNSW indexing, and executes UPSERT queries using `ON CONFLICT (chunk_id) DO UPDATE`.
