import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSyncChannel } from "@/hooks/useSync";
import {
  Activity, Clock, Cpu, DollarSign, AlertTriangle,
  ChevronDown, ChevronRight, BarChart3,
  Zap, Search, Eye
} from "lucide-react";

interface Trace {
  id: string;
  user_id: number;
  source: string;
  source_id: string | null;
  source_name: string | null;
  department: string | null;
  model: string | null;
  provider: string | null;
  input_prompt: string | null;
  output_preview: string | null;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost_usd: string | null;
  duration_ms: number;
  status: string;
  error: string | null;
  metadata: string | null;
  parent_trace_id: string | null;
  created_at: number;
  children?: Trace[];
}

interface TraceSummary {
  totals: {
    totalTraces: number;
    totalTokens: number;
    totalCost: string;
    avgDuration: number;
    errorCount: number;
  };
  byDepartment: Array<{ department: string; count: number; tokens: number; cost: string; avgDuration: number; errors?: number; successRate?: number }>;
  byModel: Array<{ model: string; count: number; tokens: number; cost: string }>;
  bySource: Array<{ source: string; count: number; tokens: number }>;
  timeline: Array<{ hour: number; count: number; tokens: number; cost: string }>;
}

const DEPT_COLORS: Record<string, string> = {
  research: "text-blue-400 bg-blue-500/10",
  writer: "text-purple-400 bg-purple-500/10",
  coder: "text-emerald-400 bg-emerald-500/10",
  artist: "text-pink-400 bg-pink-500/10",
  reader: "text-orange-400 bg-orange-500/10",
  boss: "text-amber-400 bg-amber-500/10",
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatCost(cost: string | null): string {
  if (!cost) return "$0.00";
  const n = parseFloat(cost);
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function TraceRow({ trace, isChild = false }: { trace: Trace; isChild?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  let meta: any = null;
  if (trace.metadata) {
    try { meta = JSON.parse(trace.metadata); } catch {}
  }
  const hasChildren = trace.children && trace.children.length > 0;
  const time = new Date(trace.created_at);

  return (
    <>
      <div
        className={`flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors border-b border-border/30 cursor-pointer ${
          isChild ? "pl-10 bg-white/[0.01]" : ""
        }`}
        onClick={() => setShowDetail(!showDetail)}
      >
        {/* Expand toggle */}
        <div className="w-5 flex-shrink-0">
          {hasChildren ? (
            <button
              onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
              className="text-muted-foreground hover:text-foreground"
            >
              {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          ) : (
            <div className="w-4 h-4" />
          )}
        </div>

        {/* Status dot */}
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
          trace.status === "success" ? "bg-emerald-400" : trace.status === "error" ? "bg-red-400" : "bg-amber-400"
        }`} />

        {/* Time */}
        <span className="text-xs text-muted-foreground w-20 flex-shrink-0 font-mono">
          {time.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: false })}
        </span>

        {/* Source badge */}
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-secondary text-muted-foreground flex-shrink-0 w-16 text-center uppercase">
          {trace.source}
        </span>

        {/* Department */}
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 w-20 text-center ${
          trace.department ? DEPT_COLORS[trace.department] || "text-gray-400 bg-gray-500/10" : "text-gray-400"
        }`}>
          {trace.department || "-"}
        </span>

        {/* Model */}
        <span className="text-xs text-muted-foreground flex-shrink-0 w-32 truncate font-mono">
          {trace.model || "-"}
        </span>

        {/* Input preview */}
        <span className="text-xs text-foreground/70 flex-1 truncate min-w-0">
          {trace.input_prompt?.slice(0, 80) || "-"}
        </span>

        {/* Duration */}
        <span className="text-xs text-muted-foreground flex-shrink-0 w-16 text-right font-mono">
          {formatDuration(trace.duration_ms)}
        </span>

        {/* Tokens */}
        <span className="text-xs text-muted-foreground flex-shrink-0 w-16 text-right font-mono">
          {formatTokens(trace.total_tokens)}
        </span>

        {/* Cost */}
        <span className="text-xs text-emerald-400 flex-shrink-0 w-16 text-right font-mono">
          {formatCost(trace.cost_usd)}
        </span>
      </div>

      {/* Detail panel */}
      {showDetail && (
        <div className="px-6 py-4 bg-white/[0.02] border-b border-border/30 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-muted-foreground">Trace ID</span>
              <p className="font-mono text-foreground/70 truncate">{trace.id}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Provider</span>
              <p className="text-foreground/70">{trace.provider || "-"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Input Tokens</span>
              <p className="text-foreground/70">{formatTokens(trace.input_tokens)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Output Tokens</span>
              <p className="text-foreground/70">{formatTokens(trace.output_tokens)}</p>
            </div>
          </div>

          {trace.input_prompt && (
            <div>
              <span className="text-xs text-muted-foreground">Input</span>
              <p className="text-xs text-foreground/70 mt-1 whitespace-pre-wrap bg-black/20 rounded p-2 max-h-32 overflow-y-auto font-mono">
                {trace.input_prompt}
              </p>
            </div>
          )}

          {trace.output_preview && (
            <div>
              <span className="text-xs text-muted-foreground">Output Preview</span>
              <p className="text-xs text-foreground/70 mt-1 whitespace-pre-wrap bg-black/20 rounded p-2 max-h-32 overflow-y-auto font-mono">
                {trace.output_preview}
              </p>
            </div>
          )}

          {trace.error && (
            <div>
              <span className="text-xs text-red-400">Error</span>
              <p className="text-xs text-red-300 mt-1 bg-red-500/10 rounded p-2">{trace.error}</p>
            </div>
          )}

          {meta?.subAgents && (
            <div>
              <span className="text-xs text-muted-foreground">Sub-Agents</span>
              <div className="mt-1 space-y-1">
                {meta.subAgents.map((sa: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 text-xs bg-black/20 rounded px-2 py-1">
                    <span className="text-foreground/70 font-medium">{sa.label}</span>
                    <span className="text-muted-foreground">{formatTokens(sa.tokens)} tokens</span>
                    <span className="text-muted-foreground">{formatDuration(sa.durationMs)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Children */}
      {expanded && hasChildren && trace.children?.map(child => (
        <TraceRow key={child.id} trace={child} isChild />
      ))}
    </>
  );
}

export default function TracesPage() {
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [view, setView] = useState<"list" | "stats">("list");

  // Auto-refresh on new traces
  useSyncChannel("traces");

  const { data: traces = [], isLoading } = useQuery<Trace[]>({
    queryKey: ["/api/traces", sourceFilter, deptFilter, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (sourceFilter !== "all") params.set("source", sourceFilter);
      if (deptFilter !== "all") params.set("department", deptFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      params.set("limit", "200");
      const res = await fetch(`/api/traces?${params}`);
      return res.json();
    },
    refetchInterval: 10000,
  });

  const { data: stats } = useQuery<TraceSummary>({
    queryKey: ["/api/traces/stats/summary"],
    refetchInterval: 30000,
  });

  const filteredTraces = searchQuery
    ? traces.filter(t =>
        t.input_prompt?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.model?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.department?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : traces;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-6 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary" />
            Agent Traces
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Full observability into every AI operation — departments, models, tokens, cost, latency
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView("list")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              view === "list" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Eye className="w-4 h-4 inline mr-1" />
            Traces
          </button>
          <button
            onClick={() => setView("stats")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              view === "stats" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <BarChart3 className="w-4 h-4 inline mr-1" />
            Analytics
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {stats?.totals && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 px-6 pb-4">
          <StatCard icon={Zap} label="Total Traces" value={String(stats.totals.totalTraces || 0)} />
          <StatCard icon={Cpu} label="Tokens Used" value={formatTokens(stats.totals.totalTokens || 0)} />
          <StatCard icon={DollarSign} label="Total Cost" value={formatCost(stats.totals.totalCost)} color="text-emerald-400" />
          <StatCard icon={Clock} label="Avg Duration" value={formatDuration(stats.totals.avgDuration || 0)} />
          <StatCard icon={AlertTriangle} label="Errors" value={String(stats.totals.errorCount || 0)} color="text-red-400" />
        </div>
      )}

      {view === "stats" ? (
        <StatsView stats={stats} />
      ) : (
        <>
          {/* Filters */}
          <div className="flex items-center gap-3 px-6 pb-3 flex-wrap">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search traces..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-secondary/50 border border-border/50 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
            </div>

            <FilterSelect label="Source" value={sourceFilter} onChange={setSourceFilter}
              options={["all", "boss", "editor", "pipeline", "bot", "agent"]} />
            <FilterSelect label="Dept" value={deptFilter} onChange={setDeptFilter}
              options={["all", "research", "writer", "coder", "artist", "reader"]} />
            <FilterSelect label="Status" value={statusFilter} onChange={setStatusFilter}
              options={["all", "success", "error", "timeout"]} />

            <span className="text-xs text-muted-foreground ml-auto">
              {filteredTraces.length} traces
            </span>
          </div>

          {/* Trace list */}
          <div className="flex-1 overflow-y-auto mx-6 rounded-xl border border-border/30 bg-card/50">
            {/* Header row */}
            <div className="flex items-center gap-3 px-4 py-2 border-b border-border/50 bg-secondary/30 text-[10px] font-medium text-muted-foreground uppercase tracking-wider sticky top-0 z-10">
              <div className="w-5" />
              <div className="w-2" />
              <div className="w-20">Time</div>
              <div className="w-16 text-center">Source</div>
              <div className="w-20 text-center">Dept</div>
              <div className="w-32">Model</div>
              <div className="flex-1">Input</div>
              <div className="w-16 text-right">Duration</div>
              <div className="w-16 text-right">Tokens</div>
              <div className="w-16 text-right">Cost</div>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filteredTraces.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <Activity className="w-10 h-10 mb-3 opacity-30" />
                <p className="text-sm">No traces yet</p>
                <p className="text-xs mt-1">AI operations will appear here as they run</p>
              </div>
            ) : (
              filteredTraces.map(trace => (
                <TraceRow key={trace.id} trace={trace} />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color = "text-foreground" }: {
  icon: any; label: string; value: string; color?: string;
}) {
  return (
    <div className="rounded-xl border border-border/30 bg-card/50 p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: string[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-2 py-1.5 rounded-lg bg-secondary/50 border border-border/50 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
    >
      {options.map(opt => (
        <option key={opt} value={opt}>
          {label}: {opt === "all" ? "All" : opt}
        </option>
      ))}
    </select>
  );
}

function StatsView({ stats }: { stats: TraceSummary | undefined }) {
  if (!stats) return <div className="p-6 text-muted-foreground text-sm">Loading analytics...</div>;

  return (
    <div className="p-6 space-y-6 overflow-y-auto">
      {/* Department Health — success rates + performance */}
      <div className="rounded-xl border border-border/30 bg-card/50 p-4">
        <h3 className="text-sm font-medium text-foreground mb-3">Department Health</h3>
        <div className="space-y-3">
          {stats.byDepartment.map(d => {
            const maxTokens = Math.max(...stats.byDepartment.map(x => x.tokens || 1));
            const successRate = d.successRate ?? 100;
            const errors = d.errors ?? 0;
            return (
              <div key={d.department} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    DEPT_COLORS[d.department] || "text-gray-400 bg-gray-500/10"
                  }`}>{d.department}</span>
                  <div className="flex items-center gap-3 text-[10px]">
                    <span className={successRate >= 90 ? "text-emerald-400" : successRate >= 70 ? "text-amber-400" : "text-red-400"}>
                      {successRate}% success
                    </span>
                    {errors > 0 && <span className="text-red-400">{errors} errors</span>}
                    <span className="text-muted-foreground">{formatDuration(d.avgDuration)} avg</span>
                    <span className="text-muted-foreground">{formatCost(d.cost)}</span>
                  </div>
                </div>
                <div className="flex gap-1 h-2">
                  <div className="bg-primary/30 rounded-full" style={{ width: `${(d.tokens / maxTokens) * 100}%` }} />
                </div>
                <div className="text-[9px] text-muted-foreground/60">
                  {d.count} calls · {formatTokens(d.tokens)} tokens
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Workflow Health Summary */}
      {stats.totals && (
        <div className="rounded-xl border border-border/30 bg-card/50 p-4">
          <h3 className="text-sm font-medium text-foreground mb-3">Overall Health</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="text-center p-3 rounded-lg bg-secondary/20">
              <p className="text-xs text-muted-foreground">Success Rate</p>
              <p className={`text-lg font-bold ${
                stats.totals.totalTraces > 0
                  ? (((stats.totals.totalTraces - stats.totals.errorCount) / stats.totals.totalTraces) * 100 >= 90 ? "text-emerald-400" : "text-amber-400")
                  : "text-foreground"
              }`}>
                {stats.totals.totalTraces > 0
                  ? `${(((stats.totals.totalTraces - stats.totals.errorCount) / stats.totals.totalTraces) * 100).toFixed(1)}%`
                  : "N/A"}
              </p>
            </div>
            <div className="text-center p-3 rounded-lg bg-secondary/20">
              <p className="text-xs text-muted-foreground">Error Rate</p>
              <p className={`text-lg font-bold ${stats.totals.errorCount > 0 ? "text-red-400" : "text-emerald-400"}`}>
                {stats.totals.totalTraces > 0
                  ? `${((stats.totals.errorCount / stats.totals.totalTraces) * 100).toFixed(1)}%`
                  : "0%"}
              </p>
            </div>
            <div className="text-center p-3 rounded-lg bg-secondary/20">
              <p className="text-xs text-muted-foreground">Avg Latency</p>
              <p className="text-lg font-bold text-foreground">{formatDuration(stats.totals.avgDuration || 0)}</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-secondary/20">
              <p className="text-xs text-muted-foreground">Cost / Call</p>
              <p className="text-lg font-bold text-emerald-400">
                {stats.totals.totalTraces > 0
                  ? formatCost(String(parseFloat(stats.totals.totalCost || "0") / stats.totals.totalTraces))
                  : "$0.00"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* By Model */}
      <div className="rounded-xl border border-border/30 bg-card/50 p-4">
        <h3 className="text-sm font-medium text-foreground mb-3">Usage by Model</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {stats.byModel.map(m => (
            <div key={m.model} className="flex items-center justify-between px-3 py-2 rounded-lg bg-secondary/20">
              <span className="text-xs font-mono text-foreground/70">{m.model}</span>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>{m.count} calls</span>
                <span>{formatTokens(m.tokens)}</span>
                <span className="text-emerald-400">{formatCost(m.cost)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* By Source */}
      <div className="rounded-xl border border-border/30 bg-card/50 p-4">
        <h3 className="text-sm font-medium text-foreground mb-3">Usage by Source</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {stats.bySource.map(s => (
            <div key={s.source} className="text-center p-3 rounded-lg bg-secondary/20">
              <p className="text-xs text-muted-foreground uppercase">{s.source}</p>
              <p className="text-lg font-bold text-foreground">{s.count}</p>
              <p className="text-xs text-muted-foreground">{formatTokens(s.tokens)} tokens</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
