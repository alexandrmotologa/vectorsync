import React, { useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Tag,
  Trash2,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  Hash,
} from 'lucide-react';

export interface ChunkAction {
  type: 'SKIP' | 'UPDATE_METADATA_ONLY' | 'UPSERT_TEXT_CHANGED' | 'DELETE_ORPHAN';
  chunkId: string;
  chunkIndex?: number;
  content?: string;
  contentHash?: string;
  metadata?: Record<string, unknown>;
  reason: string;
  tokenCount?: number;
}

export interface SyncPlanViewProps {
  plan: {
    documentId: string;
    operation: string;
    actions: ChunkAction[];
    totalChunks: number;
    toInsertCount: number;
    toUpdateTextCount: number;
    toUpdateMetadataOnlyCount: number;
    toDeleteChunkIds: string[];
    skippedUnchangedCount: number;
    tokensSaved: number;
    tokensRequired: number;
    estimatedCostSavingsUsd: number;
    efficiencyPercentage: number;
    timestamp: number;
  };
}

export const DocumentDiffViewer: React.FC<SyncPlanViewProps> = ({ plan }) => {
  const [expandedChunks, setExpandedChunks] = useState<Record<string, boolean>>({});

  const toggleChunk = (id: string) => {
    setExpandedChunks((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const getActionBadge = (type: ChunkAction['type']) => {
    switch (type) {
      case 'SKIP':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700">
            <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" />
            SKIP (UNMODIFIED)
          </span>
        );
      case 'UPSERT_TEXT_CHANGED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-amber-500/10 text-amber-300 border border-amber-500/30">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            RE-EMBED & UPSERT
          </span>
        );
      case 'UPDATE_METADATA_ONLY':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
            <Tag className="w-3.5 h-3.5 text-cyan-400" />
            METADATA ONLY ($0)
          </span>
        );
      case 'DELETE_ORPHAN':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-rose-500/10 text-rose-300 border border-rose-500/30">
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            PRUNE ORPHAN
          </span>
        );
    }
  };

  return (
    <div className="bg-[#131c2e] border border-slate-800 rounded-xl p-5 shadow-lg shadow-black/20">
      {/* Plan Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold text-white">CDC Sync Plan</h3>
            <span className="px-2 py-0.5 text-xs font-mono rounded bg-slate-800 text-slate-300 border border-slate-700">
              {plan.documentId}
            </span>
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
              {plan.operation}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Processed at {new Date(plan.timestamp).toLocaleTimeString()} · Efficiency: {plan.efficiencyPercentage}%
          </p>
        </div>

        {/* Efficiency Meter */}
        <div className="flex items-center gap-3 bg-slate-900/60 px-4 py-2 rounded-lg border border-slate-800">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          <div>
            <div className="text-xs text-slate-400">Embedding Cost Efficiency</div>
            <div className="text-sm font-bold font-mono text-emerald-400">
              {plan.efficiencyPercentage}% Saved ({plan.tokensSaved} tokens avoided)
            </div>
          </div>
        </div>
      </div>

      {/* Summary Pills */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 my-4">
        <div className="bg-slate-900/50 p-2.5 rounded-lg border border-slate-800/80 text-center">
          <div className="text-xs text-slate-400">Skipped (Identical)</div>
          <div className="text-lg font-bold text-slate-300 font-mono">{plan.skippedUnchangedCount}</div>
        </div>
        <div className="bg-slate-900/50 p-2.5 rounded-lg border border-slate-800/80 text-center">
          <div className="text-xs text-slate-400">Re-embedded Chunks</div>
          <div className="text-lg font-bold text-amber-400 font-mono">
            {plan.toUpdateTextCount + plan.toInsertCount}
          </div>
        </div>
        <div className="bg-slate-900/50 p-2.5 rounded-lg border border-slate-800/80 text-center">
          <div className="text-xs text-slate-400">Metadata Only</div>
          <div className="text-lg font-bold text-cyan-400 font-mono">{plan.toUpdateMetadataOnlyCount}</div>
        </div>
        <div className="bg-slate-900/50 p-2.5 rounded-lg border border-slate-800/80 text-center">
          <div className="text-xs text-slate-400">Pruned Orphans</div>
          <div className="text-lg font-bold text-rose-400 font-mono">{plan.toDeleteChunkIds.length}</div>
        </div>
      </div>

      {/* Chunk Breakdown List */}
      <div className="mt-4 space-y-2">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
          Chunk Mutation Breakdown ({plan.actions.length} chunks)
        </div>

        {plan.actions.map((action) => {
          const isExpanded = Boolean(expandedChunks[action.chunkId]);
          const sectionBreadcrumb = action.metadata?.sectionPath as string[] | undefined;

          return (
            <div
              key={action.chunkId}
              className={`border rounded-lg transition-colors overflow-hidden ${
                action.type === 'SKIP'
                  ? 'bg-slate-900/40 border-slate-800/60'
                  : action.type === 'UPSERT_TEXT_CHANGED'
                  ? 'bg-amber-950/20 border-amber-900/40'
                  : action.type === 'UPDATE_METADATA_ONLY'
                  ? 'bg-cyan-950/20 border-cyan-900/40'
                  : 'bg-rose-950/20 border-rose-900/40'
              }`}
            >
              <div
                onClick={() => toggleChunk(action.chunkId)}
                className="p-3 flex items-center justify-between cursor-pointer hover:bg-slate-800/40 select-none"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <button className="text-slate-500 hover:text-slate-300">
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </button>

                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-slate-300">
                        {action.chunkId}
                      </span>
                      {sectionBreadcrumb && sectionBreadcrumb.length > 0 && (
                        <span className="text-xs text-slate-400 truncate max-w-xs">
                          {sectionBreadcrumb.join(' > ')}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-slate-500 truncate mt-0.5">
                      {action.reason}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {action.tokenCount !== undefined && (
                    <span className="text-xs font-mono text-slate-400">
                      {action.tokenCount} tokens
                    </span>
                  )}
                  {getActionBadge(action.type)}
                </div>
              </div>

              {isExpanded && (
                <div className="px-4 py-3 border-t border-slate-800/80 bg-slate-950/50 space-y-2">
                  {action.contentHash && (
                    <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
                      <Hash className="w-3.5 h-3.5 text-cyan-400" />
                      <span>SHA-256: {action.contentHash}</span>
                    </div>
                  )}

                  {action.content && (
                    <div>
                      <div className="text-xs font-semibold text-slate-400 mb-1">Content Preview:</div>
                      <pre className="text-xs text-slate-200 bg-slate-900 p-2.5 rounded border border-slate-800 overflow-x-auto whitespace-pre-wrap font-mono">
                        {action.content}
                      </pre>
                    </div>
                  )}

                  {action.metadata && (
                    <div>
                      <div className="text-xs font-semibold text-slate-400 mb-1">Metadata:</div>
                      <pre className="text-xs text-cyan-300 bg-slate-900 p-2.5 rounded border border-slate-800 overflow-x-auto font-mono">
                        {JSON.stringify(action.metadata, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
