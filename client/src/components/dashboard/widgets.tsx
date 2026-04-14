import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  Bot, Coins, GitBranch, DollarSign, Activity, Zap, Server,
  ArrowUp, ArrowDown, Minus, Briefcase, PieChart, Clock,
  CheckCircle, XCircle, Loader2, AlertTriangle, Cpu, Wifi, Database,
  BarChart3, TrendingUp, MessageSquare, Eye, Pencil, Play, X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart as RePieChart, Pie, Cell,
} from "recharts";

// ── Types ────────────────────────────────────────────────────────────────
export interface DashboardStats {
  activeAgents: number;
  tokensUsed7d: number;
  workflowsRun30d: number;
  revenueThisMonth: number;
  deltas: {
    activeAgentsDelta: number;
    tokensDelta: number;
    workflowsDelta: number;
    revenueDelta: number;
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────
function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function formatCurrency(n: number): string {
  if (n >= 100) return `$${(n / 100).toFixed(0)}`;
  return `$${(n / 100).toFixed(2)}`;
}

function DeltaBadge({ delta }: { delta: number }) {
  if (delta === 0) return <span className="text-xs text-muted-foreground flex items-center gap-0.5"><Minus className="w-3 h-3" /> 0%</span>;
  if (delta > 0) return <span className="text-xs text-emerald-400 flex items-center gap-0.5"><ArrowUp className="w-3 h-3" /> +{delta}%</span>;
  return <span className="text-xs text-red-400 flex items-center gap-0.5"><ArrowDown className="w-3 h-3" /> {delta}%</span>;
}

function WidgetSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-4 bg-muted rounded w-1/3" />
      <div className="h-8 bg-muted rounded w-1/2" />
      <div className="h-3 bg-muted rounded w-2/3" />
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[80px] text-muted-foreground">
      <p className="text-xs text-center">{message}</p>
    </div>
  );
}

// ── 1. KPI Card Widget ───────────────────────────────────────────────────
export function KPICardWidget({ variant, onClick }: { variant: "agents" | "tokens" | "workflows" | "revenue"; onClick?: () => void }) {
  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
    refetchInterval: variant === "tokens" ? 5000 : 30000,
  });

  if (isLoading) return <WidgetSkeleton />;

  const configs = {
    agents: { icon: Bot, label: "Active Agents", value: stats?.activeAgents ?? 0, delta: stats?.deltas.activeAgentsDelta ?? 0, sub: "currently running", color: "text-indigo-400", bg: "bg-indigo-500/10" },
    tokens: { icon: Coins, label: "Tokens Used (7d)", value: formatTokens(stats?.tokensUsed7d ?? 0), delta: stats?.deltas.tokensDelta ?? 0, sub: "live — last 7 days", color: "text-amber-400", bg: "bg-amber-500/10" },
    workflows: { icon: Zap, label: "Tasks Run (30d)", value: stats?.workflowsRun30d ?? 0, delta: stats?.deltas.workflowsDelta ?? 0, sub: "department tasks", color: "text-violet-400", bg: "bg-violet-500/10" },
    revenue: { icon: MessageSquare, label: "Conversations", value: stats?.revenueThisMonth ?? 0, delta: stats?.deltas.revenueDelta ?? 0, sub: "this month", color: "text-emerald-400", bg: "bg-emerald-500/10", format: "number" },
  };

  const c = configs[variant];
  const Icon = c.icon;

  return (
    <div className={`h-full flex flex-col justify-center ${onClick ? "cursor-pointer" : ""}`} onClick={onClick}>
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{c.label}</p>
          <p className="text-2xl font-bold text-foreground">{c.value}</p>
          <div className="flex items-center gap-2">
            <DeltaBadge delta={c.delta} />
            <span className="text-[10px] text-muted-foreground">{c.sub}</span>
          </div>
        </div>
        <div className={`p-2 rounded-lg ${c.bg} ${c.color}`}>
          <Icon size={18} />
        </div>
      </div>
    </div>
  );
}

// ── 1b. Clickable Active Agents KPI ─────────────────────────────────────
import { ActiveAgentsPanel } from "./ActiveAgentsPanel";

export function ClickableAgentsKPI() {
  const [panelOpen, setPanelOpen] = useState(false);
  return (
    <>
      <KPICardWidget variant="agents" onClick={() => setPanelOpen(true)} />
      <ActiveAgentsPanel open={panelOpen} onClose={() => setPanelOpen(false)} />
    </>
  );
}

// ── 2. Agent Status List ─────────────────────────────────────────────────
export function AgentStatusListWidget() {
  const { data: jobs = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/jobs"],
    refetchInterval: 15000,
  });

  if (isLoading) return <WidgetSkeleton />;

  const agentTypes = ["boss", "researcher", "coder", "writer", "analyst", "reviewer", "artgen"];
  const runningTypes = new Set(jobs.filter((j: any) => j.status === "running").map((j: any) => j.type));

  return (
    <div className="h-full">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Agent Status</p>
      <ScrollArea className="h-[calc(100%-24px)]">
        <div className="space-y-1.5">
          {agentTypes.map(type => {
            const isRunning = runningTypes.has(type);
            return (
              <div key={type} className="flex items-center justify-between px-2 py-1.5 rounded-md bg-muted/30">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${isRunning ? "bg-emerald-400 animate-pulse" : "bg-muted-foreground/30"}`} />
                  <span className="text-sm capitalize text-foreground">{type}</span>
                </div>
                <Badge variant={isRunning ? "default" : "secondary"} className="text-[10px]">
                  {isRunning ? "busy" : "idle"}
                </Badge>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

// ── 3. Token Usage Chart (live-updating) ─────────────────────────────────
export function TokenUsageChartWidget() {
  const { data = [], isLoading } = useQuery<{ date: string; tokens: number }[]>({
    queryKey: ["/api/dashboard/token-usage"],
    refetchInterval: 10000,
  });

  if (isLoading) return <WidgetSkeleton />;
  if (!data.length) return <EmptyState message="No token usage data yet" />;

  return (
    <div className="h-full">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Token Usage (7d)</p>
        <span className="text-[10px] text-emerald-400 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Live
        </span>
      </div>
      <ResponsiveContainer width="100%" height="85%">
        <BarChart data={data}>
          <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} stroke="hsl(var(--muted-foreground))" />
          <YAxis tick={{ fontSize: 10 }} tickFormatter={v => formatTokens(v)} stroke="hsl(var(--muted-foreground))" />
          <Tooltip
            contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
            formatter={(v: number) => [formatTokens(v), "Tokens"]}
            labelFormatter={l => l}
          />
          <Bar dataKey="tokens" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── 4. Workflow Run Chart ────────────────────────────────────────────────
export function WorkflowRunChartWidget() {
  const { data = [], isLoading } = useQuery<{ date: string; runs: number }[]>({
    queryKey: ["/api/dashboard/workflow-runs"],
    refetchInterval: 60000,
  });

  if (isLoading) return <WidgetSkeleton />;
  if (!data.length) return <EmptyState message="No workflow data yet" />;

  return (
    <div className="h-full">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Workflow Runs (30d)</p>
      <ResponsiveContainer width="100%" height="85%">
        <LineChart data={data}>
          <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} stroke="hsl(var(--muted-foreground))" />
          <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
          <Tooltip
            contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
          />
          <Line type="monotone" dataKey="runs" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── 5. Recent Activity Feed ──────────────────────────────────────────────
export function RecentActivityWidget() {
  const { data: events = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/activity"],
    refetchInterval: 15000,
  });

  if (isLoading) return <WidgetSkeleton />;
  if (!events.length) return <EmptyState message="No activity yet. Run workflows or chat with Boss to see events here." />;

  const iconMap: Record<string, React.ElementType> = {
    job_complete: CheckCircle,
    job_failed: XCircle,
    workflow_run: GitBranch,
    workflow_complete: CheckCircle,
    workflow_failed: XCircle,
    chat: MessageSquare,
  };

  const colorMap: Record<string, string> = {
    job_complete: "text-emerald-400",
    job_failed: "text-red-400",
    workflow_run: "text-violet-400",
    workflow_complete: "text-emerald-400",
    workflow_failed: "text-red-400",
    chat: "text-sky-400",
  };

  return (
    <div className="h-full">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Recent Activity</p>
      <ScrollArea className="h-[calc(100%-24px)]">
        <div className="space-y-2">
          {events.slice(0, 15).map((e: any) => {
            const Icon = iconMap[e.type] || Activity;
            const color = colorMap[e.type] || "text-muted-foreground";
            const ago = formatTimeAgo(e.createdAt);
            return (
              <div key={e.id} className="flex items-start gap-2 px-1">
                <Icon className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${color}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-foreground truncate">{e.title}</p>
                  {e.description && <p className="text-[10px] text-muted-foreground truncate">{e.description}</p>}
                </div>
                <span className="text-[10px] text-muted-foreground flex-shrink-0">{ago}</span>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60000) return "now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return `${Math.floor(diff / 86400000)}d`;
}

// ── 6. Quick Actions ─────────────────────────────────────────────────────
export function QuickActionsWidget() {
  return (
    <div className="h-full flex flex-col">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Quick Actions</p>
      <div className="grid grid-cols-1 gap-2 flex-1">
        <Link href="/boss">
          <Button variant="outline" size="sm" className="w-full justify-start gap-2 bg-indigo-500/5 hover:bg-indigo-500/10 border-indigo-500/20 text-indigo-400">
            <Bot className="w-4 h-4" /> New Chat
          </Button>
        </Link>
        <Link href="/boss">
          <Button variant="outline" size="sm" className="w-full justify-start gap-2 bg-violet-500/5 hover:bg-violet-500/10 border-violet-500/20 text-violet-400">
            <Zap className="w-4 h-4" /> Autonomous Task
          </Button>
        </Link>
        <Link href="/settings?tab=ai-preferences">
          <Button variant="outline" size="sm" className="w-full justify-start gap-2 bg-emerald-500/5 hover:bg-emerald-500/10 border-emerald-500/20 text-emerald-400">
            <Eye className="w-4 h-4" /> AI Settings & Keys
          </Button>
        </Link>
      </div>
    </div>
  );
}

// ── 7. Fiverr Revenue Widget ─────────────────────────────────────────────
export function FiverrRevenueWidget() {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/fiverr/revenue"],
    refetchInterval: 60000,
  });

  if (isLoading) return <WidgetSkeleton />;
  if (!data || !data.daily?.length) return <EmptyState message="No Fiverr revenue data yet. Deliver orders to track earnings." />;

  return (
    <div className="h-full">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fiverr Revenue</p>
        <span className="text-sm font-bold text-emerald-400">${((data.totalRevenue ?? 0) / 100).toFixed(0)}</span>
      </div>
      <ResponsiveContainer width="100%" height="80%">
        <BarChart data={data.daily.slice(-14)}>
          <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={d => d.slice(8)} stroke="hsl(var(--muted-foreground))" />
          <Tooltip
            contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
            formatter={(v: number) => [`$${v}`, "Revenue"]}
          />
          <Bar dataKey="revenue" fill="hsl(var(--chart-3))" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── 8. Active Jobs Monitor ───────────────────────────────────────────────
export function ActiveJobsMonitorWidget() {
  const { data: jobs = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/jobs"],
    refetchInterval: 5000,
  });

  if (isLoading) return <WidgetSkeleton />;

  const runningJobs = jobs.filter((j: any) => j.status === "running" || j.status === "pending");
  if (!runningJobs.length) return <EmptyState message="No active jobs. Start a chat or workflow to see live progress." />;

  return (
    <div className="h-full">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Active Jobs</p>
      <ScrollArea className="h-[calc(100%-24px)]">
        <div className="space-y-1.5">
          {runningJobs.slice(0, 8).map((job: any) => (
            <div key={job.id} className="flex items-center justify-between px-2 py-1.5 rounded-md bg-muted/30">
              <div className="flex items-center gap-2 min-w-0">
                <Loader2 className="w-3 h-3 text-indigo-400 animate-spin flex-shrink-0" />
                <span className="text-xs text-foreground capitalize truncate">{job.type}</span>
              </div>
              <Badge variant={job.status === "running" ? "default" : "secondary"} className="text-[10px] flex-shrink-0">
                {job.status}
              </Badge>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

// ── 9. Model Usage Breakdown ─────────────────────────────────────────────
const PIE_COLORS = ["#6366f1", "#8b5cf6", "#a78bfa", "#c4b5fd", "#10b981", "#f59e0b", "#ef4444", "#06b6d4"];

export function ModelUsageBreakdownWidget() {
  const { data = [], isLoading } = useQuery<{ model: string; tokens: number }[]>({
    queryKey: ["/api/dashboard/model-usage"],
    refetchInterval: 60000,
  });

  if (isLoading) return <WidgetSkeleton />;
  if (!data.length || data.every(d => d.tokens === 0)) return <EmptyState message="No model usage data yet. Use AI models to see a breakdown here." />;

  return (
    <div className="h-full">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Model Usage</p>
      <div className="flex items-center h-[calc(100%-20px)]">
        <ResponsiveContainer width="55%" height="100%">
          <RePieChart>
            <Pie data={data} dataKey="tokens" nameKey="model" cx="50%" cy="50%" innerRadius="40%" outerRadius="80%" paddingAngle={2}>
              {data.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
            </Pie>
            <Tooltip
              contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
              formatter={(v: number) => [formatTokens(v), "Tokens"]}
            />
          </RePieChart>
        </ResponsiveContainer>
        <div className="space-y-1 flex-1">
          {data.slice(0, 5).map((d, i) => (
            <div key={d.model} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
              <span className="text-[10px] text-foreground truncate capitalize">{d.model}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── 10. System Health ────────────────────────────────────────────────────
export function SystemHealthWidget() {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/dashboard/health"],
    refetchInterval: 30000,
  });

  if (isLoading) return <WidgetSkeleton />;

  const items = [
    { label: "Redis", status: data?.redis === "connected", icon: Wifi },
    { label: "Database", status: data?.database === "connected", icon: Database },
    { label: "Node", status: true, icon: Server, value: data?.nodeVersion },
  ];

  const formatUptime = (s: number) => {
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
    return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
  };

  const formatBytes = (b: number) => {
    if (b > 1_073_741_824) return `${(b / 1_073_741_824).toFixed(1)} GB`;
    return `${(b / 1_048_576).toFixed(1)} MB`;
  };

  return (
    <div className="h-full">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">System Health</p>
      <div className="space-y-2">
        {items.map(item => (
          <div key={item.label} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <item.icon className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs text-foreground">{item.label}</span>
            </div>
            <div className="flex items-center gap-1">
              {item.value && <span className="text-[10px] text-muted-foreground">{item.value}</span>}
              <div className={`w-2 h-2 rounded-full ${item.status ? "bg-emerald-400" : "bg-red-400"}`} />
            </div>
          </div>
        ))}
        <div className="pt-1 border-t border-border space-y-1">
          <div className="flex justify-between text-[10px]">
            <span className="text-muted-foreground">Uptime</span>
            <span className="text-foreground">{data ? formatUptime(data.uptimeSeconds) : "\u2014"}</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-muted-foreground">DB Size</span>
            <span className="text-foreground">{data ? formatBytes(data.dbSizeBytes) : "\u2014"}</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-muted-foreground">Memory</span>
            <span className="text-foreground">{data ? `${data.memoryUsageMb} MB` : "\u2014"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 11. Notification Feed ────────────────────────────────────────────────
export function NotificationFeedWidget() {
  const { data: notifications = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/notifications"],
    refetchInterval: 30000,
  });

  if (isLoading) return <WidgetSkeleton />;
  if (!notifications.length) return <EmptyState message="No notifications yet" />;

  return (
    <div className="h-full">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Notifications</p>
      <ScrollArea className="h-[calc(100%-24px)]">
        <div className="space-y-2">
          {notifications.slice(0, 10).map((n: any) => (
            <div key={n.id} className={`px-2 py-1.5 rounded-md text-xs ${n.read ? "opacity-50" : "bg-muted/30"}`}>
              <p className="font-medium text-foreground truncate">{n.title}</p>
              <p className="text-[10px] text-muted-foreground truncate">{n.message}</p>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

// ── 12. Upcoming Scheduled ───────────────────────────────────────────────
export function UpcomingScheduledWidget() {
  return (
    <div className="h-full">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Upcoming Scheduled</p>
      <EmptyState message="No scheduled workflows. Create a workflow with a cron trigger to see upcoming runs." />
    </div>
  );
}

// ── 13. Active Workflows Widget (NEW) ────────────────────────────────────
export function ActiveWorkflowsWidget() {
  const [, setLocation] = useLocation();
  const [inspectId, setInspectId] = useState<number | null>(null);

  const { data: workflows = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/workflows"],
    refetchInterval: 5000,
  });

  const { data: stats } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
    refetchInterval: 5000,
  });

  const { data: jobs = [] } = useQuery<any[]>({
    queryKey: ["/api/jobs"],
    refetchInterval: 5000,
  });

  if (isLoading) return <WidgetSkeleton />;

  const activeWorkflows = workflows.filter((w: any) => w.status === "active");
  if (!activeWorkflows.length) return <EmptyState message="No active workflows. Start a workflow to see it here." />;

  // Build a map of running agent types from jobs
  const runningAgentsByWorkflow = new Map<number, string[]>();
  for (const job of jobs) {
    if (job.status === "running" && job.workflowId) {
      const agents = runningAgentsByWorkflow.get(job.workflowId) || [];
      agents.push(job.type);
      runningAgentsByWorkflow.set(job.workflowId, agents);
    }
  }

  return (
    <div className="h-full">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Active Workflows</p>
        <span className="text-[10px] text-emerald-400 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Live
        </span>
      </div>
      <ScrollArea className="h-[calc(100%-28px)]">
        <div className="space-y-2">
          {activeWorkflows.map((w: any) => {
            const agents = runningAgentsByWorkflow.get(w.id) || [];
            return (
              <div key={w.id} className="rounded-md border border-border bg-muted/20 p-2.5">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
                    <span className="text-xs font-medium text-foreground truncate">{w.name}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px] gap-1"
                    onClick={() => setInspectId(w.id)}
                  >
                    <Eye className="w-3 h-3" />
                    Inspect
                  </Button>
                </div>
                <div className="flex items-center gap-2 text-[10px]">
                  {agents.length > 0 ? (
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-muted-foreground">Agents:</span>
                      {agents.map((a, i) => (
                        <Badge key={i} variant="secondary" className="text-[9px] px-1.5 py-0 capitalize">{a}</Badge>
                      ))}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">Running</span>
                  )}
                  <span className="text-muted-foreground ml-auto flex items-center gap-1">
                    <Coins className="w-3 h-3" />
                    {formatTokens(stats?.tokensUsed7d ?? 0)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Inspect Dialog */}
      <WorkflowInspectDialog
        workflowId={inspectId}
        open={!!inspectId}
        onClose={() => setInspectId(null)}
        onOpenEditor={(id) => { setInspectId(null); setLocation(`/workflows/${id}`); }}
      />
    </div>
  );
}

// ── 14. Inactive Workflows Widget (NEW) ──────────────────────────────────
export function InactiveWorkflowsWidget() {
  const [, setLocation] = useLocation();

  const { data: workflows = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/workflows"],
    refetchInterval: 15000,
  });

  if (isLoading) return <WidgetSkeleton />;

  const inactiveWorkflows = workflows.filter((w: any) => w.status !== "active");
  if (!inactiveWorkflows.length) return <EmptyState message="All workflows are active." />;

  return (
    <div className="h-full">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Inactive Workflows</p>
      <ScrollArea className="h-[calc(100%-28px)]">
        <div className="space-y-2">
          {inactiveWorkflows.map((w: any) => (
            <div key={w.id} className="rounded-md border border-border bg-muted/20 p-2.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-foreground truncate">{w.name}</span>
                <Badge variant="secondary" className="text-[9px] capitalize">{w.status}</Badge>
              </div>
              {w.updatedAt && (
                <p className="text-[10px] text-muted-foreground mb-2">
                  Last updated: {new Date(w.updatedAt).toLocaleDateString()}
                </p>
              )}
              <div className="flex items-center gap-1.5">
                <Link href={`/workflows/${w.id}`}>
                  <Button variant="outline" size="sm" className="h-6 px-2 text-[10px] gap-1">
                    <Play className="w-3 h-3" />
                    Run
                  </Button>
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[10px] gap-1"
                  onClick={() => setLocation(`/workflows/${w.id}`)}
                >
                  <Pencil className="w-3 h-3" />
                  Edit
                </Button>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

// ── Workflow Inspect Dialog ──────────────────────────────────────────────
function WorkflowInspectDialog({
  workflowId,
  open,
  onClose,
  onOpenEditor,
}: {
  workflowId: number | null;
  open: boolean;
  onClose: () => void;
  onOpenEditor: (id: number) => void;
}) {
  const { data: workflow } = useQuery<any>({
    queryKey: [`/api/workflows/${workflowId}`],
    enabled: !!workflowId,
  });

  const { data: jobs = [] } = useQuery<any[]>({
    queryKey: ["/api/jobs"],
    refetchInterval: 3000,
    enabled: open,
  });

  const { data: executions = [] } = useQuery<any[]>({
    queryKey: workflowId ? [`/api/workflows/${workflowId}/jobs`] : ["noop"],
    enabled: !!workflowId && open,
    refetchInterval: 3000,
  });

  if (!workflowId) return null;

  const workflowJobs = jobs.filter((j: any) => j.workflowId === workflowId);
  const runningJobs = workflowJobs.filter((j: any) => j.status === "running");
  const failedJobs = workflowJobs.filter((j: any) => j.status === "failed");
  const totalTokens = workflowJobs.reduce((sum: number, j: any) => sum + (j.tokenCount || 0), 0);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-card border-border max-w-lg">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-sm">{workflow?.name || "Workflow"}</DialogTitle>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={() => onOpenEditor(workflowId)}
            >
              <GitBranch className="w-3 h-3" />
              Open in Visual Editor
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Status summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-md bg-muted/30 p-2 text-center">
              <p className="text-[10px] text-muted-foreground">Running</p>
              <p className="text-lg font-bold text-foreground">{runningJobs.length}</p>
            </div>
            <div className="rounded-md bg-muted/30 p-2 text-center">
              <p className="text-[10px] text-muted-foreground">Tokens</p>
              <p className="text-lg font-bold text-foreground">{formatTokens(totalTokens)}</p>
            </div>
            <div className="rounded-md bg-muted/30 p-2 text-center">
              <p className="text-[10px] text-muted-foreground">Errors</p>
              <p className={`text-lg font-bold ${failedJobs.length > 0 ? "text-red-400" : "text-foreground"}`}>{failedJobs.length}</p>
            </div>
          </div>

          {/* Agent outputs */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Agent Activity</p>
            <ScrollArea className="max-h-48">
              {workflowJobs.length === 0 ? (
                <p className="text-[10px] text-muted-foreground py-4 text-center">No agent activity recorded yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {workflowJobs.slice(0, 10).map((job: any) => (
                    <div key={job.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/20">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        {job.status === "running" && <Loader2 className="w-3 h-3 text-blue-400 animate-spin flex-shrink-0" />}
                        {job.status === "completed" && <CheckCircle className="w-3 h-3 text-emerald-400 flex-shrink-0" />}
                        {job.status === "failed" && <XCircle className="w-3 h-3 text-red-400 flex-shrink-0" />}
                        {!["running", "completed", "failed"].includes(job.status) && <Clock className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
                        <span className="text-xs text-foreground capitalize truncate">{job.type}</span>
                      </div>
                      <Badge variant={job.status === "running" ? "default" : "secondary"} className="text-[9px]">
                        {job.status}
                      </Badge>
                      {job.tokenCount > 0 && (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                          <Coins className="w-2.5 h-2.5" />
                          {formatTokens(job.tokenCount)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Errors */}
          {failedJobs.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-2">Errors</p>
              <div className="space-y-1">
                {failedJobs.map((j: any) => (
                  <div key={j.id} className="text-[10px] text-red-400 bg-red-500/10 rounded-md px-2 py-1.5 border border-red-500/20">
                    <span className="font-medium capitalize">{j.type}</span>: {j.error || "Unknown error"}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Widget Registry ──────────────────────────────────────────────────────
export interface WidgetDefinition {
  id: string;
  name: string;
  description: string;
  category: "stats" | "charts" | "activity" | "actions" | "workflows";
  icon: React.ElementType;
  defaultW: number;
  defaultH: number;
  minW?: number;
  minH?: number;
  component: React.ComponentType<any>;
  props?: Record<string, any>;
}

export const WIDGET_REGISTRY: WidgetDefinition[] = [
  { id: "kpi-agents", name: "Active Agents", description: "Shows count of currently running agents with period delta \u2014 click to manage", category: "stats", icon: Bot, defaultW: 3, defaultH: 2, minW: 2, minH: 2, component: ClickableAgentsKPI },
  { id: "kpi-tokens", name: "Tokens Used (Live)", description: "7-day token consumption with real-time updates", category: "stats", icon: Coins, defaultW: 3, defaultH: 2, minW: 2, minH: 2, component: KPICardWidget, props: { variant: "tokens" } },
  { id: "kpi-workflows", name: "Tasks Run", description: "Department tasks executed (30d)", category: "stats", icon: GitBranch, defaultW: 3, defaultH: 2, minW: 2, minH: 2, component: KPICardWidget, props: { variant: "workflows" } },
  { id: "kpi-revenue", name: "Conversations", description: "Boss conversations this month", category: "stats", icon: DollarSign, defaultW: 3, defaultH: 2, minW: 2, minH: 2, component: KPICardWidget, props: { variant: "revenue" } },
  { id: "active-workflows", name: "Active Workflows", description: "Live view of running workflows with inspect button", category: "workflows", icon: Play, defaultW: 6, defaultH: 5, minW: 4, minH: 3, component: ActiveWorkflowsWidget },
  { id: "inactive-workflows", name: "Inactive Workflows", description: "Stopped workflows with run and edit buttons", category: "workflows", icon: Clock, defaultW: 6, defaultH: 5, minW: 4, minH: 3, component: InactiveWorkflowsWidget },
  { id: "agent-status", name: "Agent Status", description: "Live status of all 7 agent types", category: "activity", icon: Cpu, defaultW: 3, defaultH: 4, minW: 2, minH: 3, component: AgentStatusListWidget },
  { id: "token-chart", name: "Token Usage Chart", description: "Daily token usage bar chart (7d) \u2014 live", category: "charts", icon: BarChart3, defaultW: 6, defaultH: 4, minW: 4, minH: 3, component: TokenUsageChartWidget },
  { id: "workflow-chart", name: "Workflow Run Chart", description: "Workflow execution trend line (30d)", category: "charts", icon: TrendingUp, defaultW: 6, defaultH: 4, minW: 4, minH: 3, component: WorkflowRunChartWidget },
  { id: "recent-activity", name: "Recent Activity", description: "Live feed of jobs, workflows, and events", category: "activity", icon: Activity, defaultW: 4, defaultH: 5, minW: 3, minH: 3, component: RecentActivityWidget },
  { id: "quick-actions", name: "Quick Actions", description: "Shortcut buttons for common tasks", category: "actions", icon: Zap, defaultW: 3, defaultH: 3, minW: 2, minH: 2, component: QuickActionsWidget },
  { id: "fiverr-revenue", name: "Fiverr Revenue", description: "Revenue chart from Fiverr deliveries", category: "charts", icon: DollarSign, defaultW: 6, defaultH: 4, minW: 4, minH: 3, component: FiverrRevenueWidget },
  { id: "active-jobs", name: "Active Jobs", description: "Monitor currently running BullMQ jobs", category: "activity", icon: Loader2, defaultW: 3, defaultH: 4, minW: 2, minH: 3, component: ActiveJobsMonitorWidget },
  { id: "model-usage", name: "Model Usage", description: "Pie chart of token usage by agent type", category: "charts", icon: PieChart, defaultW: 4, defaultH: 4, minW: 3, minH: 3, component: ModelUsageBreakdownWidget },
  { id: "notifications", name: "Notifications", description: "Recent in-app notifications", category: "activity", icon: MessageSquare, defaultW: 3, defaultH: 4, minW: 2, minH: 3, component: NotificationFeedWidget },
  { id: "system-health", name: "System Health", description: "Redis, DB, and uptime status", category: "stats", icon: Server, defaultW: 3, defaultH: 4, minW: 2, minH: 3, component: SystemHealthWidget },
  { id: "upcoming-scheduled", name: "Upcoming Scheduled", description: "Upcoming cron and scheduled workflows", category: "activity", icon: Clock, defaultW: 3, defaultH: 3, minW: 2, minH: 2, component: UpcomingScheduledWidget },
];

// ── Default Layout (updated: no revenue KPI, includes active/inactive workflows) ──
export const DEFAULT_LAYOUT = [
  { i: "kpi-agents", x: 0, y: 0, w: 4, h: 2 },
  { i: "kpi-tokens", x: 4, y: 0, w: 4, h: 2 },
  { i: "kpi-revenue", x: 8, y: 0, w: 4, h: 2 },
  { i: "recent-activity", x: 0, y: 2, w: 6, h: 5 },
  { i: "token-chart", x: 6, y: 2, w: 6, h: 4 },
  { i: "quick-actions", x: 0, y: 7, w: 4, h: 3 },
  { i: "model-usage", x: 4, y: 7, w: 4, h: 4 },
  { i: "system-health", x: 8, y: 7, w: 4, h: 4 },
];
