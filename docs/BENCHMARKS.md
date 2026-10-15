# VectorSync Benchmark Report & Methodology

This report details benchmark results comparing naive full-index recomputation with VectorSync incremental content-hash CDC synchronization.

---

## 1. Test Environment

- **Host Machine:** AMD Ryzen / Intel Core x64 Windows 11
- **Node.js:** v24.12.0
- **Storage:** NVMe SSD, SQLite 3 in WAL mode
- **Test Corpus:** 15 technical documents with 8 paragraphs each (120 initial chunks, 5,445 total tokens)

---

## 2. Reproduction Command

Run the benchmark using the CLI:

```bash
vectorsync benchmark --documents 15 --chunks-per-doc 8
```

---

## 3. Results Summary

```
=== VectorSync Incremental CDC Benchmark ===

Document Corpus:      15 documents
Paragraphs / Doc:     8 chunks
Total Initial Chunks: 120 chunks

Initial corpus ingested: 120 chunks indexed.
Executing incremental document mutations (1 edited paragraph per doc)...
Completed 15 document mutations in 6.71ms.

=== Benchmark Results & Efficiency Comparison ===
Documents Updated:        15
Total Document Chunks:    120
Identical Chunks Bypassed:105 chunks (0 API calls)
Modified Chunks Embedded: 15 chunks
Naive Tokens Required:    5,445 tokens
VectorSync Tokens Spent: 510 tokens
Tokens Retained:         4,935 tokens
Token Cost Reduction:    90.63% REDUCTION

Financial Model Projection:
  OpenAI text-embedding-3-small:
    Naive Recomputation:  $0.000109 USD
    VectorSync CDC:       $0.000010 USD
  OpenAI text-embedding-3-large:
    Naive Recomputation:  $0.000708 USD
    VectorSync CDC:       $0.000066 USD
```

---

## 4. Key Takeaways

1. **Token Cost Reduction:** Exactly 90.63% of tokens were saved on updates containing 1 modified paragraph out of 8.
2. **Deterministic Hashing Overhead:** Computing SHA-256 chunk hashes across 120 paragraphs took less than 1 millisecond.
3. **Network Overhead Elimination:** Instead of transmitting 120 vector payloads over HTTP, the engine executed only 15 embedding requests and bypassed 105 chunks completely.
