import type { VectorSink } from '../sinks/base.js';
import { MemoryVectorSink } from '../sinks/memory-sink.js';
import { QdrantVectorSink } from '../sinks/qdrant-sink.js';
import { PgVectorSink } from '../sinks/pgvector-sink.js';
import { PineconeVectorSink } from '../sinks/pinecone-sink.js';
import type { EmbeddingProvider } from '../core/embeddings/base.js';
import { OpenAIEmbeddingProvider } from '../core/embeddings/openai-provider.js';
import { LocalEmbeddingProvider } from '../core/embeddings/local-provider.js';
import { MockEmbeddingProvider } from '../core/embeddings/mock-provider.js';

export function createVectorSink(sinkType?: string): VectorSink {
  switch (sinkType?.toLowerCase()) {
    case 'qdrant':
      return new QdrantVectorSink();
    case 'pgvector':
    case 'postgres':
    case 'postgresql':
      return new PgVectorSink();
    case 'pinecone':
      return new PineconeVectorSink();
    case 'memory':
    default:
      return new MemoryVectorSink();
  }
}

export function createEmbeddingProvider(providerType?: string): EmbeddingProvider {
  switch (providerType?.toLowerCase()) {
    case 'local':
    case 'onnx':
    case 'transformers':
      return new LocalEmbeddingProvider();
    case 'openai':
      return new OpenAIEmbeddingProvider();
    case 'mock':
      return new MockEmbeddingProvider();
    default:
      if (process.env.OPENAI_API_KEY) {
        return new OpenAIEmbeddingProvider();
      }
      return new MockEmbeddingProvider();
  }
}
