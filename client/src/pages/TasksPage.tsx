import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ListChecks, Search, Filter, Loader2, CheckCircle2, XCircle, Clock,
  Trash2, Square, ChevronDown, ChevronRight, Bot, Code, Palette,
  PenTool, Globe, Cpu, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

// Agent type icon mapping
const TYPE_ICONS: Record<string, React.ElementType> = {
  boss: Bot, coder: Code, artist: Palette, writer: PenTool,
  researcher: Globe, autonomous: Zap, browser: Globe,
  analyst: Cpu, reviewer: ListChecks, artgen: Palette,
  workflow: Zap,
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  running: { label: "Running", color: "bg-blue-500/15 text-blue-500 border-blue-500/30", icon: Loader2 },
  pending: { label: "Pending", color: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30", icon: Clock },
  complete: { label: "Complete", color: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30", icon: CheckCircle2 },
  failed: { label: "Failed", color: "bg-red-500/15 text-red-500 border-red-500/30", icon: XCircle },
};

interface AgentJob {
  id: string;
  conversationId: string;
  userId: number;
  type: string;
  status: string;
  input: string | null;
  output: string | null;
  tokenCount: number | null;
  durationMs: number | null;
  parentJobId: string | null;
  createdAt: number;
  completedAt: number | null;
}

function formatDuration(ms: number | null): string {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatTokens(n: number | null): string {
  if (!n) return "—";
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

function parseTaskDescription(input: string | null): string {
  if (!input) return "No description";
  try {
    const parsed = JSON.parse(input);
    return parsed.message || parsed.task || parsed.goal || JSON.stringify(parsed).slice(0, 120);
  } catch {
    return input.slice(0, 120);
  }
}

function JobRow({ job, onStop, onDelete }: { job: AgentJob; onStop: (id: string) => void; onDelete: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const status = STATUS_CONFIG[job.status] || STATUS_CONFIG.pending;
  const StatusIcon = status.icon;
  const TypeIcon = TYPE_ICONS[job.type] || Cpu;

  let outputPreview = "";
  if (expanded && job.output) {
    try {
      const parsed = JSON.parse(job.output);
      outputPreview = parsed.synthesis || parsed.error || JSON.stringify(parsed, null, 2);
    } catch {
      outputPreview = job.output;
    }
  }

  return (
    <div className="glass-card rounded-2xl">
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Expand toggle */}
        <div className="text-muted-foreground">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </div>

        {/* Type icon */}
        <div className="w-8 h-8 rounded-xl bg-primary/12 flex items-center justify-center flex-shrink-0">
          <TypeIcon className="w-4 h-4 text-primary" />
        </div>

        {/* Description */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground capitalize">{job.type}</span>
            {job.parentJobId && (
              <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">sub-task</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {parseTaskDescription(job.input)}
          </p>
        </div>

        {/* Status badge */}
        <Badge variant="outline" className={`text-[10px] px-2 py-0.5 gap-1 ${status.color}`}>
          <StatusIcon className={`w-3 h-3 ${job.status === "running" ? "animate-spin" : ""}`} />
          {status.label}
        </Badge>

        {/* Metrics */}
        <div className="hidden sm:flex items-center gap-4 text-xs text-muted-foreground flex-shrink-0">
          <span title="Tokens">{formatTokens(job.tokenCount)}</span>
          <span title="Duration">{formatDuration(job.durationMs)}</span>
          <span title="Time">{timeAgo(job.createdAt)}</span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          {job.status === "running" && (
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-yellow-500 hover:text-yellow-400" onClick={() => onStop(job.id)} title="Stop">
              <Square className="w-3.5 h-3.5" />
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-500" onClick={() => onDelete(job.id)} title="Delete">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-border pt-3 space-y-3">
          {/* Mobile metrics */}
          <div className="flex sm:hidden items-center gap-4 text-xs text-muted-foreground">
            <span>Tokens: {formatTokens(job.tokenCount)}</span>
            <span>Duration: {formatDuration(job.durationMs)}</span>
            <span>{timeAgo(job.createdAt)}</span>
          </div>

          {/* Meta */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div><span className="text-muted-foreground">Job ID:</span> <span className="text-foreground font-mono">{job.id.slice(0, 8)}</span></div>
            <div><span className="text-muted-foreground">Conv:</span> <span className="text-foreground font-mono">{job.conversationId.slice(0, 8)}</span></div>
            <div><span className="text-muted-foreground">Created:</span> <span className="text-foreground">{new Date(job.createdAt).toLocaleString()}</span></div>
            {job.completedAt && <div><span className="text-muted-foreground">Completed:</span> <span className="text-foreground">{new Date(job.completedAt).toLocaleString()}</span></div>}
          </div>

          {/* Output */}
          {outputPreview && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Output</p>
              <pre className="text-xs bg-secondary/50 border border-border rounded-xl p-4 overflow-x-auto max-h-60 whitespace-pre-wrap text-foreground">
                {outputPreview.slice(0, 2000)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function TasksPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  // Fetch all jobs + pipeline runs
  const { data: jobs = [], isLoading } = useQuery<AgentJob[]>({
    queryKey: ["/api/dashboard/active-agents", "all"],
    queryFn: async () => {
      const [agentRes, pipeRes] = await Promise.all([
        fetch("/api/dashboard/active-agents?status=all", { credentials: "include" }),
        fetch("/api/pipelines", { credentials: "include" }),
      ]);
      const agentJobs: AgentJob[] = agentRes.ok ? await agentRes.json() : [];
      const pipelines: any[] = pipeRes.ok ? await pipeRes.json() : [];

      // Convert pipeline runs to AgentJob-like format
      for (const p of pipelines) {
        if (!p.last_run_at) continue;
        agentJobs.push({
          id: p.id,
          conversationId: p.id,
          userId: p.user_id,
          type: "workflow",
          status: "complete",
          input: JSON.stringify({ name: p.name, steps: p.steps?.length }),
          output: null,
          tokenCount: null,
          durationMs: null,
          parentJobId: null,
          createdAt: p.last_run_at,
          completedAt: p.last_run_at,
        });
      }

      return agentJobs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    },
    refetchInterval: 5000,
  });

  const stopJob = useMutation({
    mutationFn: async (jobId: string) => {
      await fetch(`/api/dashboard/active-agents/${jobId}/stop`, { method: "POST", credentials: "include" });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/dashboard/active-agents"] }),
  });

  const deleteJob = useMutation({
    mutationFn: async (jobId: string) => {
      await fetch(`/api/dashboard/active-agents/${jobId}/clear`, { method: "POST", credentials: "include" });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/dashboard/active-agents"] }),
  });

  // Compute stats
  const totalJobs = jobs.length;
  const runningJobs = jobs.filter((j) => j.status === "running").length;
  const completedJobs = jobs.filter((j) => j.status === "complete").length;
  const failedJobs = jobs.filter((j) => j.status === "failed").length;
  const successRate = totalJobs > 0 ? Math.round((completedJobs / totalJobs) * 100) : 0;
  const totalTokens = jobs.reduce((sum, j) => sum + (j.tokenCount || 0), 0);

  // Apply filters
  const filtered = jobs.filter((j) => {
    if (statusFilter !== "all" && j.status !== statusFilter) return false;
    if (typeFilter !== "all" && j.type !== typeFilter) return false;
    if (search) {
      const desc = parseTaskDescription(j.input).toLowerCase();
      const type = j.type.toLowerCase();
      const q = search.toLowerCase();
      if (!desc.includes(q) && !type.includes(q)) return false;
    }
    return true;
  });

  // Unique job types for filter
  const jobTypes = Array.from(new Set(jobs.map((j) => j.type))).sort();

  return (
    <div className="p-3 sm:p-4 space-y-4 max-w-[1400px] mx-auto page-enter">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <ListChecks className="w-5 h-5 text-primary" />
            Task Manager
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Monitor and manage all agent tasks</p>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Total", value: totalJobs, color: "text-foreground" },
          { label: "Running", value: runningJobs, color: "text-blue-500" },
          { label: "Completed", value: completedJobs, color: "text-emerald-500" },
          { label: "Failed", value: failedJobs, color: "text-red-500" },
          { label: "Success Rate", value: `${successRate}%`, color: "text-primary" },
        ].map((stat) => (
          <div key={stat.label} className="glass-card rounded-2xl px-5 py-4">
            <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
            <p className={`text-lg font-semibold ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search tasks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <Filter className="w-4 h-4 text-muted-foreground" />
          {["all", "running", "complete", "failed"].map((s) => (
            <Button
              key={s}
              size="sm"
              variant={statusFilter === s ? "default" : "outline"}
              className="h-8 text-xs capitalize"
              onClick={() => setStatusFilter(s)}
            >
              {s === "all" ? "All" : s}
            </Button>
          ))}
        </div>

        {jobTypes.length > 1 && (
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="h-8 bg-secondary border border-border rounded-xl px-2 text-xs text-foreground"
          >
            <option value="all">All types</option>
            {jobTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        )}

        <span className="text-xs text-muted-foreground ml-auto">
          {formatTokens(totalTokens)} tokens total
        </span>
      </div>

      {/* Job list */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Loading tasks...
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <ListChecks className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No tasks found</p>
            <p className="text-xs mt-1">
              {totalJobs === 0
                ? "Send a message in Boss Chat to create your first task."
                : "Try adjusting your filters."}
            </p>
          </div>
        ) : (
          filtered.map((job) => (
            <JobRow
              key={job.id}
              job={job}
              onStop={(id) => stopJob.mutate(id)}
              onDelete={(id) => deleteJob.mutate(id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
