import React, { useState } from 'react';
import { Database, Search, ChevronRight, FileCode, Clock } from 'lucide-react';

export interface LedgerDoc {
  id: string;
  contentHash: string;
  totalChunks: number;
  lastSyncedAt: number;
  metadata: string;
}

export const LedgerTable: React.FC<{
  documents: LedgerDoc[];
  onSelectDoc: (id: string) => void;
  selectedDocId?: string;
}> = ({ documents, onSelectDoc, selectedDocId }) => {
  const [filter, setFilter] = useState('');

  const filtered = documents.filter((d) =>
    d.id.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="bg-[#131c2e] border border-slate-800 rounded-xl p-5 shadow-lg shadow-black/20">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-2">
          <Database className="w-5 h-5 text-indigo-400" />
          <h3 className="text-lg font-bold text-white">SQLite State Ledger</h3>
          <span className="px-2 py-0.5 text-xs font-mono rounded bg-slate-800 text-slate-300">
            {documents.length} documents indexed
          </span>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Filter documents..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500 w-56 font-mono"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="bg-slate-900/80 uppercase tracking-wider text-slate-400 border-b border-slate-800 font-mono">
            <tr>
              <th className="py-2.5 px-3">Document ID</th>
              <th className="py-2.5 px-3">Active Chunks</th>
              <th className="py-2.5 px-3">Content SHA-256</th>
              <th className="py-2.5 px-3">Last Synced</th>
              <th className="py-2.5 px-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-mono">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-slate-500">
                  No documents found in ledger. Use sync-file or sandbox to index your first document.
                </td>
              </tr>
            ) : (
              filtered.map((doc) => {
                const isSelected = doc.id === selectedDocId;
                return (
                  <tr
                    key={doc.id}
                    onClick={() => onSelectDoc(doc.id)}
                    className={`cursor-pointer hover:bg-slate-800/40 transition-colors ${
                      isSelected ? 'bg-indigo-950/30 border-l-2 border-indigo-500' : ''
                    }`}
                  >
                    <td className="py-3 px-3 font-semibold text-slate-200 flex items-center gap-2">
                      <FileCode className="w-4 h-4 text-slate-400" />
                      {doc.id}
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 font-bold">
                        {doc.totalChunks}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-400 truncate max-w-xs">
                      {doc.contentHash.slice(0, 16)}...
                    </td>
                    <td className="py-3 px-3 text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        {new Date(doc.lastSyncedAt).toLocaleString()}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button className="text-slate-400 hover:text-indigo-400 inline-flex items-center">
                        Inspect
                        <ChevronRight className="w-3.5 h-3.5 ml-1" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
