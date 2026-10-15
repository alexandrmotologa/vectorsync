import React, { useEffect, useState } from 'react';
import {
  Layers,
  Sparkles,
  Database,
  Activity,
  ArrowRightLeft,
  X,
  RefreshCw,
  Search,
} from 'lucide-react';
import { CostSavingsCard } from './components/CostSavingsCard';
import { SyncLagIndicator } from './components/SyncLagIndicator';
import { LedgerTable, type LedgerDoc } from './components/LedgerTable';
import { InteractiveSandbox } from './components/InteractiveSandbox';
import { DocumentDiffViewer } from './components/DocumentDiffViewer';
import { SearchPlayground } from './components/SearchPlayground';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'sandbox' | 'search' | 'ledger'>('overview');
  const [stats, setStats] = useState({
    ledger: {
      totalDocuments: 0,
      totalChunks: 0,
      totalTokensSaved: 0,
      totalCostSavedUsd: 0,
      syncEventCount: 0,
    },
    sink: {
      sinkType: 'in-memory',
      totalVectors: 0,
    },
    embeddingModel: 'mock-deterministic',
  });
  const [documents, setDocuments] = useState<LedgerDoc[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [latestPlan, setLatestPlan] = useState<any>(null);
  const [selectedDocDetails, setSelectedDocDetails] = useState<any>(null);
  const [isConnected, setIsConnected] = useState(false);

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch {}
  };

  const fetchDocuments = async () => {
    try {
      const res = await fetch('/api/documents');
      if (res.ok) {
        const data = await res.json();
        setDocuments(data);
      }
    } catch {}
  };

  const fetchAuditLogs = async () => {
    try {
      const res = await fetch('/api/audit-logs?limit=25');
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data);
      }
    } catch {}
  };

  const inspectDocument = async (id: string) => {
    try {
      const res = await fetch(`/api/documents/${id}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedDocDetails(data);
      }
    } catch {}
  };

  const reloadAll = () => {
    fetchStats();
    fetchDocuments();
    fetchAuditLogs();
  };

  useEffect(() => {
    reloadAll();

    // Setup SSE live stream
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource('/api/events');
      eventSource.onopen = () => setIsConnected(true);
      eventSource.onerror = () => setIsConnected(false);
      eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'SYNC_EVENT') {
            setLatestPlan(payload.payload.plan);
            reloadAll();
          }
        } catch {}
      };
    } catch {
      setIsConnected(false);
    }

    return () => {
      eventSource?.close();
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col">
      {/* Top Navigation Bar */}
      <header className="border-b border-slate-800 bg-[#0c1220]/80 backdrop-blur sticky top-0 z-50 px-4 md:px-6 py-3 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="flex items-center justify-between md:justify-start gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-600 via-indigo-600 to-purple-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 shrink-0">
              <ArrowRightLeft className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-extrabold tracking-tight text-white font-mono">
                  VectorSync Studio
                </h1>
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold tracking-wide rounded-md bg-cyan-950 text-cyan-400 border border-cyan-800">
                  v0.1.0 CDC
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                Incremental Vector CDC & Content-Hash Ingestion Engine
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 md:hidden">
            <button
              onClick={reloadAll}
              title="Refresh Ledger and Stats"
              className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-emerald-400 animate-ping' : 'bg-rose-500'
              }`}
            />
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800 overflow-x-auto no-scrollbar shrink-0">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
              activeTab === 'overview'
                ? 'bg-cyan-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            Telemetry & Diff
          </button>
          <button
            onClick={() => setActiveTab('sandbox')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
              activeTab === 'sandbox'
                ? 'bg-cyan-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Interactive Sandbox
          </button>
          <button
            onClick={() => setActiveTab('search')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
              activeTab === 'search'
                ? 'bg-cyan-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            Search Test Bench
          </button>
          <button
            onClick={() => setActiveTab('ledger')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
              activeTab === 'ledger'
                ? 'bg-cyan-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            State Ledger ({documents.length})
          </button>
        </div>

        <div className="hidden md:flex items-center gap-3">
          <button
            onClick={reloadAll}
            title="Refresh Ledger and Stats"
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-emerald-400 animate-ping' : 'bg-rose-500'
              }`}
            />
            <span>{isConnected ? 'LIVE ENGINE' : 'OFFLINE'}</span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {/* Metric Cards */}
        <CostSavingsCard
          tokensSaved={stats.ledger.totalTokensSaved}
          costSavedUsd={stats.ledger.totalCostSavedUsd}
          totalDocuments={stats.ledger.totalDocuments}
          totalChunks={stats.ledger.totalChunks}
          syncEventCount={stats.ledger.syncEventCount}
          activeModel={stats.embeddingModel}
        />

        {/* Tab 1: Overview & Telemetry */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <SyncLagIndicator
              isConnected={isConnected}
              sinkType={stats.sink.sinkType}
              embeddingModel={stats.embeddingModel}
              recentAuditLogs={auditLogs}
            />

            {latestPlan ? (
              <DocumentDiffViewer plan={latestPlan} />
            ) : (
              <div className="bg-[#131c2e] border border-slate-800 rounded-xl p-8 text-center">
                <Layers className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                <h4 className="text-base font-bold text-slate-300">No Recent Diff Ingested</h4>
                <p className="text-xs text-slate-400 max-w-md mx-auto mt-1 mb-4">
                  Run a document synchronization using the CLI, trigger the webhook receiver, or open the Interactive Sandbox.
                </p>
                <button
                  onClick={() => setActiveTab('sandbox')}
                  className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs transition"
                >
                  Open Sandbox Simulator
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Interactive Sandbox */}
        {activeTab === 'sandbox' && (
          <InteractiveSandbox onSyncCompleted={reloadAll} />
        )}

        {/* Tab 3: Semantic Search Test Bench */}
        {activeTab === 'search' && (
          <SearchPlayground />
        )}

        {/* Tab 4: State Ledger */}
        {activeTab === 'ledger' && (
          <div className="space-y-6">
            <LedgerTable
              documents={documents}
              onSelectDoc={inspectDocument}
              selectedDocId={selectedDocDetails?.document?.id}
            />

            {selectedDocDetails && (
              <div className="bg-[#131c2e] border border-indigo-900/50 rounded-xl p-5 shadow-lg">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
                  <div className="flex items-center gap-2">
                    <Database className="w-5 h-5 text-indigo-400" />
                    <h3 className="text-base font-bold text-white font-mono">
                      {selectedDocDetails.document.id}
                    </h3>
                    <span className="px-2 py-0.5 text-xs rounded bg-purple-500/10 text-purple-300 font-mono">
                      {selectedDocDetails.chunks.length} chunks
                    </span>
                  </div>
                  <button
                    onClick={() => setSelectedDocDetails(null)}
                    className="text-slate-400 hover:text-white"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-3 font-mono text-xs">
                  {selectedDocDetails.chunks.map((c: any) => (
                    <div
                      key={c.id}
                      className="p-3 bg-slate-900/60 rounded-lg border border-slate-800 space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-200">{c.id}</span>
                        <span className="text-slate-400">{c.tokenCount} tokens</span>
                      </div>
                      <div className="text-[11px] text-cyan-400 truncate">
                        Content SHA-256: {c.contentHash}
                      </div>
                      {c.sectionPath && c.sectionPath !== '[]' && (
                        <div className="text-[11px] text-slate-400">
                          Section: {c.sectionPath}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="border-t border-slate-900 bg-[#060910] px-6 py-4 text-center text-xs text-slate-500 font-mono">
        VectorSync · Incremental Vector CDC & Content-Hash Pipeline · MIT License · Alexandr Motologa
      </footer>
    </div>
  );
};
