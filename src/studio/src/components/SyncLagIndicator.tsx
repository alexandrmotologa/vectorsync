import React from 'react';
import { Activity, Radio, Cpu, HardDrive } from 'lucide-react';

interface SyncLagIndicatorProps {
  isConnected: boolean;
  sinkType: string;
  embeddingModel: string;
  recentAuditLogs: Array<{
    id: string;
    timestamp: number;
    documentId: string;
    operation: string;
    tokensSaved: number;
    costSavedUsd: number;
  }>;
}

export const SyncLagIndicator: React.FC<SyncLagIndicatorProps> = ({
  isConnected,
  sinkType,
  embeddingModel,
  recentAuditLogs,
}) => {
  return (
    <div className="bg-[#131c2e] border border-slate-800 rounded-xl p-5 shadow-lg shadow-black/20">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-emerald-400" />
          <h3 className="text-lg font-bold text-white">CDC Engine Status & Stream</h3>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs">
            <Radio
              className={`w-3.5 h-3.5 ${
                isConnected ? 'text-emerald-400 animate-pulse' : 'text-slate-500'
              }`}
            />
            <span className={isConnected ? 'text-emerald-400 font-semibold' : 'text-slate-400'}>
              {isConnected ? 'SSE STREAM ACTIVE' : 'DISCONNECTED'}
            </span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs text-slate-300">
            <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
            <span>Sink: <strong className="text-cyan-400">{sinkType}</strong></span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs text-slate-300">
            <Cpu className="w-3.5 h-3.5 text-purple-400" />
            <span>Model: <strong className="text-purple-400">{embeddingModel}</strong></span>
          </div>
        </div>
      </div>

      {/* Recent audit feed */}
      <div className="mt-4">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 font-mono">
          Recent Sync Transactions ({recentAuditLogs.length})
        </div>
        <div className="space-y-1.5 max-h-56 overflow-y-auto font-mono text-xs">
          {recentAuditLogs.length === 0 ? (
            <div className="text-slate-500 py-4 text-center">
              No CDC transactions recorded yet.
            </div>
          ) : (
            recentAuditLogs.map((log) => (
              <div
                key={log.id}
                className="flex items-center justify-between p-2 rounded bg-slate-900/60 border border-slate-800/80 hover:bg-slate-800/40 transition"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      log.operation === 'INSERT'
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        : log.operation === 'UPDATE'
                        ? 'bg-amber-950 text-amber-300 border border-amber-800'
                        : 'bg-rose-950 text-rose-300 border border-rose-800'
                    }`}
                  >
                    {log.operation}
                  </span>
                  <span className="text-slate-300 font-semibold">{log.documentId}</span>
                </div>

                <div className="flex items-center gap-4 text-slate-400">
                  <span className="text-emerald-400 font-bold">
                    +{log.tokensSaved} tokens saved
                  </span>
                  <span className="text-slate-500 text-[11px]">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
