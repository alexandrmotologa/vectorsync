import React, { useState } from 'react';
import { Play, Sparkles, RefreshCw } from 'lucide-react';
import { DocumentDiffViewer } from './DocumentDiffViewer';

export const InteractiveSandbox: React.FC<{ onSyncCompleted?: () => void }> = ({ onSyncCompleted }) => {
  const [docId, setDocId] = useState('getting-started.md');
  const [operation, setOperation] = useState<'INSERT' | 'UPDATE' | 'DELETE'>('UPDATE');
  const [isDryRun, setIsDryRun] = useState(false);
  const [content, setContent] = useState(`# VectorSync Getting Started

VectorSync is an incremental Change Data Capture (CDC) synchronization pipeline between operational data stores and vector indices.

## Core Architectural Invariants

1. Paragraph-level deterministic SHA-256 chunk hashing.
2. Re-embed only modified chunks, bypassing identical text.
3. Metadata-only mutations are updated in-place with zero embedding calls.

## Production Sinks

Supported vector sinks include Qdrant, PostgreSQL pgvector, Pinecone, and embedded In-Memory storage.
`);
  const [metadataJson, setMetadataJson] = useState('{\n  "category": "documentation",\n  "author": "Engineering Team",\n  "status": "published"\n}');
  const [loading, setLoading] = useState(false);
  const [simulatedResult, setSimulatedResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSimulate = async () => {
    setLoading(true);
    setError(null);
    try {
      let parsedMeta = {};
      try {
        parsedMeta = JSON.parse(metadataJson);
      } catch {
        setError('Invalid JSON in metadata editor');
        setLoading(false);
        return;
      }

      const res = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: docId,
          operation,
          content,
          metadata: parsedMeta,
          dryRun: isDryRun,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText);
      }

      const json = await res.json();
      setSimulatedResult(json);
      onSyncCompleted?.();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadExampleMutation = (type: 'minor_edit' | 'metadata_only' | 'delete') => {
    if (type === 'minor_edit') {
      setOperation('UPDATE');
      setContent((prev) =>
        prev.replace(
          '1. Paragraph-level deterministic SHA-256 chunk hashing.',
          '1. Paragraph-level deterministic SHA-256 chunk hashing with SIMD acceleration.'
        )
      );
    } else if (type === 'metadata_only') {
      setOperation('UPDATE');
      setMetadataJson('{\n  "category": "documentation",\n  "author": "Engineering Team",\n  "status": "archived",\n  "permission": "admin-only"\n}');
    } else if (type === 'delete') {
      setOperation('DELETE');
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#131c2e] border border-slate-800 rounded-xl p-5 shadow-lg shadow-black/20">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-cyan-400" />
              Incremental CDC Sandbox Simulator
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Test document updates in real time to observe chunk hashing, diff generation, and token savings.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Preset Scenarios:</span>
            <button
              onClick={() => loadExampleMutation('minor_edit')}
              className="px-2.5 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
            >
              1-Line Text Edit
            </button>
            <button
              onClick={() => loadExampleMutation('metadata_only')}
              className="px-2.5 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
            >
              Metadata Only
            </button>
            <button
              onClick={() => loadExampleMutation('delete')}
              className="px-2.5 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
            >
              Prune Document
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-rose-950/40 border border-rose-800 text-rose-300 text-xs">
            {error}
          </div>
        )}

        {/* Inputs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">
              Document ID
            </label>
            <input
              type="text"
              value={docId}
              onChange={(e) => setDocId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">
              CDC Operation
            </label>
            <select
              value={operation}
              onChange={(e) => setOperation(e.target.value as any)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
            >
              <option value="INSERT">INSERT (Initial Ingestion)</option>
              <option value="UPDATE">UPDATE (Incremental Mutation)</option>
              <option value="DELETE">DELETE (Prune Vectors)</option>
            </select>
          </div>

          <div className="flex items-center gap-4 pt-5">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
              <input
                type="checkbox"
                checked={isDryRun}
                onChange={(e) => setIsDryRun(e.target.checked)}
                className="rounded border-slate-700 text-cyan-500 focus:ring-cyan-500 bg-slate-900"
              />
              Dry Run (Preview Only, No Commit)
            </label>

            <button
              onClick={handleSimulate}
              disabled={loading}
              className="ml-auto flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-sm transition shadow-lg shadow-cyan-900/30 disabled:opacity-50"
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              {isDryRun ? 'Preview Plan' : 'Execute CDC Sync'}
            </button>
          </div>
        </div>

        {/* Editors */}
        {operation !== 'DELETE' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">
                Markdown / Plaintext Content
              </label>
              <textarea
                rows={9}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full p-3 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 font-mono leading-relaxed focus:outline-none focus:border-cyan-500"
                placeholder="Enter markdown content..."
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">
                Document Metadata (JSON)
              </label>
              <textarea
                rows={9}
                value={metadataJson}
                onChange={(e) => setMetadataJson(e.target.value)}
                className="w-full p-3 bg-slate-900 border border-slate-800 rounded-lg text-xs text-cyan-300 font-mono leading-relaxed focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>
        )}
      </div>

      {/* Results View */}
      {simulatedResult?.plan && (
        <div>
          <DocumentDiffViewer plan={simulatedResult.plan} />
        </div>
      )}
    </div>
  );
};
