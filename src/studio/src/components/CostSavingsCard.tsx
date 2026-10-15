import React from 'react';
import { DollarSign, Zap, FileText, Layers, TrendingUp } from 'lucide-react';

interface CostSavingsCardProps {
  tokensSaved: number;
  costSavedUsd: number;
  totalDocuments: number;
  totalChunks: number;
  syncEventCount: number;
  activeModel?: string;
}

export const CostSavingsCard: React.FC<CostSavingsCardProps> = ({
  tokensSaved,
  costSavedUsd,
  totalDocuments,
  totalChunks,
  syncEventCount,
  activeModel = 'text-embedding-3-small',
}) => {
  // Estimate large model cost if using text-embedding-3-large ($0.13 / 1M)
  const largeModelSaved = (tokensSaved * (0.13 / 1_000_000)).toFixed(4);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Tokens Saved */}
      <div className="bg-[#131c2e] border border-slate-800 rounded-xl p-5 relative overflow-hidden shadow-lg shadow-black/20">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold tracking-wider text-slate-400 uppercase">
            Tokens Saved
          </span>
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
            <Zap className="w-5 h-5" />
          </div>
        </div>
        <div className="mt-4">
          <div className="text-3xl font-extrabold text-emerald-400 font-mono">
            {tokensSaved.toLocaleString()}
          </div>
          <div className="mt-1 flex items-center text-xs text-slate-400">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400 mr-1" />
            <span>Avoided redundant embedding calls</span>
          </div>
        </div>
      </div>

      {/* Cost Saved */}
      <div className="bg-[#131c2e] border border-slate-800 rounded-xl p-5 relative overflow-hidden shadow-lg shadow-black/20">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold tracking-wider text-slate-400 uppercase">
            Cost Retained (USD)
          </span>
          <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>
        <div className="mt-4">
          <div className="text-3xl font-extrabold text-cyan-400 font-mono">
            ${costSavedUsd.toFixed(4)}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            <span>Model: {activeModel} (${largeModelSaved} on large)</span>
          </div>
        </div>
      </div>

      {/* Total Documents */}
      <div className="bg-[#131c2e] border border-slate-800 rounded-xl p-5 relative overflow-hidden shadow-lg shadow-black/20">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold tracking-wider text-slate-400 uppercase">
            Indexed Documents
          </span>
          <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
            <FileText className="w-5 h-5" />
          </div>
        </div>
        <div className="mt-4">
          <div className="text-3xl font-extrabold text-indigo-300 font-mono">
            {totalDocuments}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            <span>{syncEventCount} CDC transactions processed</span>
          </div>
        </div>
      </div>

      {/* Active Chunks */}
      <div className="bg-[#131c2e] border border-slate-800 rounded-xl p-5 relative overflow-hidden shadow-lg shadow-black/20">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold tracking-wider text-slate-400 uppercase">
            Active Vector Chunks
          </span>
          <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
            <Layers className="w-5 h-5" />
          </div>
        </div>
        <div className="mt-4">
          <div className="text-3xl font-extrabold text-purple-300 font-mono">
            {totalChunks}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            <span>Content-addressable SHA-256 mapped</span>
          </div>
        </div>
      </div>
    </div>
  );
};
