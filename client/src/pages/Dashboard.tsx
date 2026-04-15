import { useQuery } from "@tanstack/react-query";
import {
  Bot, Coins, Zap, MessageSquare, BarChart3, DollarSign,
  CheckCircle2, XCircle, Loader2, Activity,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";

// ── Types ──────────────────────────────────────────────────────────────
interface DashboardStats {
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

// ── Helpers ────────────────────────────────────────────────────────────
function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function DeltaBadge({ value }: { value: number }) {
  if (value === 0) return <span className="text-[11px] text-muted-foreground">—</span>;
  const positive = value > 0;
  return (
    <span className={`text-[11px] font-medium ${positive ? "text-emerald-500" : "text-red-500"}`}>
      {positive ? "+" : ""}{value}%
    </span>
  );
}

const PIE_COLORS = ["#4285f4", "#8b5cf6", "#a78bfa", "#c4b5fd", "#818cf8", "#6ee7b7", "#fbbf24", "#f87171"];

// ── Component ──────────────────────────────────────────────────────────
export default function Dashboard() {
  const { data: stats } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
    refetchInterval: 5000,
  });

  const { data: tokenChart = [] } = useQuery<{ date: string; tokens: number }[]>({
    queryKey: ["/api/dashboard/token-usage"],
    refetchInterval: 10000,
  });

  const { data: modelUsage = [] } = useQuery<{ model: string; tokens: number }[]>({
    queryKey: ["/api/dashboard/model-usage"],
    refetchInterval: 30000,
  });

  const { data: deptStats = [] } = useQuery<Array<{ department: string; total: number; complete: number; failed: number; avgDurationMs: number; totalTokens: number }>>({
    queryKey: ["/api/dashboard/department-stats"],
    refetchInterval: 10000,
  });

  const { data: costData } = useQuery<{ totalCostUsd: number; breakdown: Array<{ model: string; tokens: number; costUsd: number }> }>({
    queryKey: ["/api/dashboard/cost-estimate"],
    refetchInterval: 30000,
  });

  const { data: activityData = [] } = useQuery<Array<{ id: string; type: string; title: string; description: string; createdAt: number }>>({
    queryKey: ["/api/activity"],
    refetchInterval: 10000,
  });

  const kpis = [
    { label: "Active Agents", value: stats?.activeAgents ?? 0, delta: stats?.deltas?.activeAgentsDelta ?? 0, icon: Bot, color: "text-blue-500" },
    { label: "Tokens (7d)", value: formatTokens(stats?.tokensUsed7d ?? 0), delta: stats?.deltas?.tokensDelta ?? 0, icon: Coins, color: "text-violet-500" },
    { label: "Tasks (30d)", value: stats?.workflowsRun30d ?? 0, delta: stats?.deltas?.workflowsDelta ?? 0, icon: Zap, color: "text-amber-500" },
    { label: "Conversations", value: stats?.revenueThisMonth ?? 0, delta: stats?.deltas?.revenueDelta ?? 0, icon: MessageSquare, color: "text-emerald-500" },
  ];

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">Dashboard</h1>
        <p className="text-[15px] text-muted-foreground mt-1">Real-time metrics & controls</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="bg-card border border-border rounded-2xl p-5 gemini-card">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{kpi.label}</span>
              <div className={`w-9 h-9 rounded-xl bg-secondary flex items-center justify-center ${kpi.color}`}>
                <kpi.icon className="w-[18px] h-[18px]" />
              </div>
            </div>
            <div className="flex items-end justify-between">
              <span className="text-3xl font-semibold text-foreground tracking-tight">{kpi.value}</span>
              <DeltaBadge value={kpi.delta} />
            </div>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Token Usage Chart */}
        <div className="bg-card border border-border rounded-2xl p-6">
          <p className="text-sm font-medium text-foreground mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-muted-foreground" />
            Token Usage (7d)
          </p>
          <div className="h-52">
            {tokenChart.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={tokenChart}>
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(d) => d.slice(5)} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => formatTokens(v)} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }}
                    labelStyle={{ color: "hsl(var(--muted-foreground))" }}
                    formatter={(v: number) => [formatTokens(v), "Tokens"]}
                  />
                  <Bar dataKey="tokens" fill="hsl(217 91% 60%)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">No token data yet</div>
            )}
          </div>
        </div>

        {/* Model Usage Pie */}
        <div className="bg-card border border-border rounded-2xl p-6">
          <p className="text-sm font-medium text-foreground mb-4">Model Usage</p>
          <div className="h-52 flex items-center">
            {modelUsage.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={modelUsage} dataKey="tokens" nameKey="model" cx="50%" cy="50%" outerRadius={75} innerRadius={45} paddingAngle={2}>
                    {modelUsage.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }}
                    formatter={(v: number) => [formatTokens(v), "Tokens"]}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full text-center text-muted-foreground text-sm">No model data yet</div>
            )}
            {modelUsage.length > 0 && (
              <div className="space-y-2 ml-3 min-w-[100px]">
                {modelUsage.slice(0, 5).map((m, i) => (
                  <div key={m.model} className="flex items-center gap-2 text-xs">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="text-muted-foreground truncate">{m.model}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Department Performance */}
        <div className="bg-card border border-border rounded-2xl p-6">
          <p className="text-sm font-medium text-foreground mb-4">Department Performance</p>
          {deptStats.length > 0 ? (
            <div className="space-y-4">
              {deptStats.map((d) => {
                const rate = d.total > 0 ? Math.round((d.complete / d.total) * 100) : 0;
                return (
                  <div key={d.department}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium text-foreground capitalize">{d.department}</span>
                      <span className="text-xs text-muted-foreground">{d.total} runs · {rate}%</span>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${rate}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No department data yet. Run tasks to see stats.</p>
          )}
        </div>

        {/* Cost Estimate */}
        <div className="bg-card border border-border rounded-2xl p-6">
          <p className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-muted-foreground" />
            Estimated Cost
          </p>
          <p className="text-3xl font-semibold text-foreground mb-4 tracking-tight">${costData?.totalCostUsd?.toFixed(2) ?? "0.00"}</p>
          {costData?.breakdown && costData.breakdown.filter(b => b.costUsd > 0).length > 0 ? (
            <div className="space-y-2.5">
              {costData.breakdown.filter(b => b.costUsd > 0).map((b) => (
                <div key={b.model} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground truncate mr-2">{b.model}</span>
                  <span className="text-foreground font-medium">${b.costUsd.toFixed(2)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No cost data yet</p>
          )}
        </div>

        {/* Recent Activity */}
        <div className="bg-card border border-border rounded-2xl p-6">
          <p className="text-sm font-medium text-foreground mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-muted-foreground" />
            Recent Activity
          </p>
          {activityData.length > 0 ? (
            <div className="space-y-3">
              {activityData.slice(0, 8).map((evt) => {
                const isComplete = evt.type.includes("complete");
                const isFailed = evt.type.includes("failed");
                const Icon = isComplete ? CheckCircle2 : isFailed ? XCircle : Zap;
                const color = isComplete ? "text-emerald-500" : isFailed ? "text-red-500" : "text-blue-500";
                const ago = Date.now() - evt.createdAt;
                const timeStr = ago < 60000 ? "now" : ago < 3600000 ? `${Math.floor(ago / 60000)}m` : `${Math.floor(ago / 3600000)}h`;
                return (
                  <div key={evt.id} className="flex items-start gap-3">
                    <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${color}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">{evt.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{evt.description}</p>
                    </div>
                    <span className="text-xs text-muted-foreground flex-shrink-0">{timeStr}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No activity yet. Use Chat to get started.</p>
          )}
        </div>
      </div>
    </div>
  );
}
