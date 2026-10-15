import React, { useState } from 'react';
import { Search, Sparkles, Filter, Database, Hash, ArrowUpRight } from 'lucide-react';

export const SearchPlayground: React.FC = () => {
  const [query, setQuery] = useState('cache invalidation strategies');
  const [topK, setTopK] = useState(4);
  const [filterKey, setFilterKey] = useState('');
  const [filterVal, setFilterVal] = useState('');
  const [loading, setLoading] = useState(false);
  const [resultsData, setResultsData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const payload: any = {
        query,
        topK: Number(topK),
      };

      if (filterKey.trim() && filterVal.trim()) {
        payload.filter = { [filterKey.trim()]: filterVal.trim() };
      }

      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(err);
      }

      const json = await res.json();
      setResultsData(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Search Input Box */}
      <div className="bg-[#131c2e] border border-slate-800 rounded-xl p-5 shadow-lg shadow-black/20">
        <div className="flex items-center gap-2 mb-3">
          <Search className="w-5 h-5 text-cyan-400" />
          <h3 className="text-lg font-bold text-white">Semantic Search Test Bench</h3>
          <span className="px-2 py-0.5 text-xs font-mono rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
            Live Vector Retrieval
          </span>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          Test semantic vector similarity against the active vector sink with real-time cosine scoring.
        </p>

        <form onSubmit={handleSearch} className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Enter semantic query (e.g. 'incident response', 'postgres logical replication')..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-100 font-medium focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs transition shadow-lg shadow-cyan-900/30 disabled:opacity-50"
            >
              {loading ? (
                <Sparkles className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              Execute Query
            </button>
          </div>

          {/* Controls & Filter */}
          <div className="flex flex-wrap items-center gap-4 pt-2 text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <span>Top-K:</span>
              <input
                type="number"
                min={1}
                max={20}
                value={topK}
                onChange={(e) => setTopK(Number(e.target.value))}
                className="w-16 px-2 py-1 bg-slate-900 border border-slate-800 rounded text-center text-slate-200 font-mono"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-slate-500" />
              <span>Metadata Filter:</span>
              <input
                type="text"
                placeholder="key (e.g. category)"
                value={filterKey}
                onChange={(e) => setFilterKey(e.target.value)}
                className="w-28 px-2 py-1 bg-slate-900 border border-slate-800 rounded text-slate-200 font-mono"
              />
              <span>=</span>
              <input
                type="text"
                placeholder="value (e.g. ops)"
                value={filterVal}
                onChange={(e) => setFilterVal(e.target.value)}
                className="w-28 px-2 py-1 bg-slate-900 border border-slate-800 rounded text-slate-200 font-mono"
              />
            </div>
          </div>
        </form>

        {error && (
          <div className="mt-4 p-3 rounded-lg bg-rose-950/40 border border-rose-800 text-rose-300 text-xs">
            {error}
          </div>
        )}
      </div>

      {/* Results List */}
      {resultsData && (
        <div className="bg-[#131c2e] border border-slate-800 rounded-xl p-5 shadow-lg shadow-black/20 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <h4 className="text-base font-bold text-white">Retrieved Vector Matches</h4>
              <span className="px-2 py-0.5 text-xs font-mono rounded bg-slate-800 text-slate-300">
                {resultsData.count} matches
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-400 font-mono">
              <span>Sink: <strong className="text-cyan-400">{resultsData.sink}</strong></span>
              <span>Model: <strong className="text-purple-400">{resultsData.model}</strong></span>
            </div>
          </div>

          <div className="space-y-3">
            {resultsData.results.length === 0 ? (
              <div className="text-slate-500 py-6 text-center text-xs">
                No matching vectors returned for this query.
              </div>
            ) : (
              resultsData.results.map((res: any, idx: number) => {
                const scorePct = Math.max(0, Math.min(100, Math.round(res.score * 100)));
                const text = res.metadata?.text as string | undefined;
                const sectionPath = res.metadata?.sectionPath as string[] | undefined;

                return (
                  <div
                    key={res.chunkId || idx}
                    className="p-4 bg-slate-900/60 rounded-xl border border-slate-800 hover:border-slate-700 transition space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-white flex items-center gap-1">
                          #{idx + 1} {res.chunkId}
                        </span>
                        {sectionPath && sectionPath.length > 0 && (
                          <span className="text-[11px] text-slate-400 font-mono">
                            ({sectionPath.join(' > ')})
                          </span>
                        )}
                      </div>

                      {/* Similarity Meter */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-slate-400">Cosine:</span>
                        <div className="w-24 bg-slate-800 h-2.5 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              scorePct > 75
                                ? 'bg-emerald-400'
                                : scorePct > 50
                                ? 'bg-cyan-400'
                                : 'bg-amber-400'
                            }`}
                            style={{ width: `${scorePct}%` }}
                          />
                        </div>
                        <span className="text-xs font-mono font-bold text-cyan-300">
                          {Number(res.score).toFixed(4)}
                        </span>
                      </div>
                    </div>

                    {text && (
                      <div className="text-xs text-slate-200 bg-slate-950/70 p-3 rounded-lg border border-slate-800/80 leading-relaxed font-mono whitespace-pre-wrap">
                        {text}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {Object.entries(res.metadata || {}).map(([k, v]) => {
                        if (k === 'text') return null;
                        return (
                          <span
                            key={k}
                            className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300"
                          >
                            {k}: {String(v)}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
