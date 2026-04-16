import { useQuery } from "@tanstack/react-query";
import {
  Bot, Coins, Zap, MessageSquare, BarChart3, DollarSign,
  CheckCircle2, XCircle, Activity, TrendingUp,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";

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

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function DeltaBadge({ value }: { value: number }) {
  if (value === 0) return null;
  const positive = value > 0;
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${positive ? "text-emerald-400 bg-emerald-400/10" : "text-red-400 bg-red-400/10"}`}>
      {positive ? "+" : ""}{value}%
    </span>
  );
}

const PIE_COLORS = ["#4ade80", "#818cf8", "#a78bfa", "#fbbf24", "#f87171", "#22d3ee", "#c084fc", "#fb923c"];

const CHART_TOOLTIP_STYLE = {
  backgroundColor: "rgba(15, 17, 25, 0.95)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 12,
  fontSize: 11,
  backdropFilter: "blur(12px)",
};

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
    { label: "Active Agents", value: stats?.activeAgents ?? 0, delta: stats?.deltas?.activeAgentsDelta ?? 0, icon: Bot, accent: "text-blue-400", dot: "status-dot-blue" },
    { label: "Tokens (7d)", value: formatTokens(stats?.tokensUsed7d ?? 0), delta: stats?.deltas?.tokensDelta ?? 0, icon: Coins, accent: "text-violet-400", dot: "status-dot-green" },
    { label: "Tasks (30d)", value: stats?.workflowsRun30d ?? 0, delta: stats?.deltas?.workflowsDelta ?? 0, icon: Zap, accent: "text-amber-400", dot: "status-dot-orange" },
    { label: "Conversations", value: stats?.revenueThisMonth ?? 0, delta: stats?.deltas?.revenueDelta ?? 0, icon: MessageSquare, accent: "text-emerald-400", dot: "status-dot-green" },
  ];

  return (
    <div className="p-3 sm:p-4 page-enter">
      {/* KPIs — tight row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="glass-card rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className={kpi.dot} style={{ width: 6, height: 6 }} />
                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{kpi.label}</span>
              </div>
              <DeltaBadge value={kpi.delta} />
            </div>
            <div className="flex items-end justify-between">
              <span className="text-2xl font-bold text-foreground tracking-tight">{kpi.value}</span>
              <kpi.icon className={`w-5 h-5 ${kpi.accent} opacity-50`} />
            </div>
          </div>
        ))}
      </div>

      {/* Main grid — 2 cols, tight gaps like the reference */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 mb-3">
        {/* Token Usage — area chart */}
        <div className="glass-card rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-foreground flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-muted-foreground" />
              Token Usage
            </p>
            <span className="text-[10px] text-muted-foreground">Last 7 days</span>
          </div>
          <div className="h-48">
            {tokenChart.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={tokenChart}>
                  <defs>
                    <linearGradient id="tokenGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#4ade80" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#4ade80" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(d) => d.slice(5)} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => formatTokens(v)} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} labelStyle={{ color: "hsl(var(--muted-foreground))" }} formatter={(v: number) => [formatTokens(v), "Tokens"]} />
                  <Area type="monotone" dataKey="tokens" stroke="#4ade80" strokeWidth={2} fill="url(#tokenGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground text-xs">No token data yet</div>
            )}
          </div>
        </div>

        {/* Model Usage — pie + legend */}
        <div className="glass-card rounded-2xl p-4">
          <p className="text-sm font-semibold text-foreground mb-3">Model Usage</p>
          <div className="h-48 flex items-center">
            {modelUsage.length > 0 ? (
              <>
                <ResponsiveContainer width="55%" height="100%">
                  <PieChart>
                    <Pie data={modelUsage} dataKey="tokens" nameKey="model" cx="50%" cy="50%" outerRadius={70} innerRadius={42} paddingAngle={2} strokeWidth={0}>
                      {modelUsage.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v: number) => [formatTokens(v), "Tokens"]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5 flex-1">
                  {modelUsage.slice(0, 6).map((m, i) => (
                    <div key={m.model} className="flex items-center gap-2 text-[10px]">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-muted-foreground truncate flex-1">{m.model}</span>
                      <span className="text-foreground font-medium">{formatTokens(m.tokens)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="w-full text-center text-muted-foreground text-xs">No model data yet</div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom row — 3 cols, tight */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
        {/* Department Performance */}
        <div className="glass-card rounded-2xl p-4">
          <p className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
            Departments
          </p>
          {deptStats.length > 0 ? (
            <div className="space-y-3">
              {deptStats.map((d) => {
                const rate = d.total > 0 ? Math.round((d.complete / d.total) * 100) : 0;
                return (
                  <div key={d.department}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-foreground capitalize">{d.department}</span>
                      <span className="text-[10px] text-muted-foreground">{d.total} · {rate}%</span>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${rate}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No department data yet</p>
          )}
        </div>

        {/* Cost Estimate */}
        <div className="glass-card rounded-2xl p-4">
          <p className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-muted-foreground" />
            Cost Estimate
          </p>
          <p className="text-2xl font-bold text-foreground mb-3 tracking-tight">${costData?.totalCostUsd?.toFixed(2) ?? "0.00"}</p>
          {costData?.breakdown && costData.breakdown.filter(b => b.costUsd > 0).length > 0 ? (
            <div className="space-y-2">
              {costData.breakdown.filter(b => b.costUsd > 0).slice(0, 5).map((b) => (
                <div key={b.model} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground truncate mr-2">{b.model}</span>
                  <span className="text-foreground font-medium">${b.costUsd.toFixed(3)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No cost data yet</p>
          )}
        </div>

        {/* Recent Activity */}
        <div className="glass-card rounded-2xl p-4">
          <p className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4 text-muted-foreground" />
            Activity
          </p>
          {activityData.length > 0 ? (
            <div className="space-y-2">
              {activityData.slice(0, 6).map((evt) => {
                const isComplete = evt.type.includes("complete");
                const isFailed = evt.type.includes("failed");
                const Icon = isComplete ? CheckCircle2 : isFailed ? XCircle : Zap;
                const color = isComplete ? "text-emerald-500" : isFailed ? "text-red-500" : "text-blue-500";
                const ago = Date.now() - evt.createdAt;
                const timeStr = ago < 60000 ? "now" : ago < 3600000 ? `${Math.floor(ago / 60000)}m` : `${Math.floor(ago / 3600000)}h`;
                return (
                  <div key={evt.id} className="flex items-start gap-2">
                    <Icon className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${color}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-foreground truncate">{evt.title}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{evt.description}</p>
                    </div>
                    <span className="text-[10px] text-muted-foreground flex-shrink-0">{timeStr}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No activity yet</p>
          )}
        </div>
      </div>

      {/* Usage Insights */}
      {stats && (
        <div className="glass-card-glow rounded-2xl p-4 mt-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Zap className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">Your AI Activity</p>
              <p className="text-[10px] text-muted-foreground">
                {stats.workflowsRun30d > 0
                  ? `You've run ${stats.workflowsRun30d} tasks this month using ${formatTokens(stats.tokensUsed7d)} tokens. ${
                      stats.workflowsRun30d >= 10 ? "You're on a roll!" : "Keep building automations to save more time."
                    }`
                  : "Start running workflows and chatting with Boss to see your AI productivity stats here."
                }
              </p>
            </div>
            {stats.workflowsRun30d >= 5 && (
              <div className="flex-shrink-0 text-right">
                <p className="text-lg font-bold text-emerald-400">~{Math.round(stats.workflowsRun30d * 0.3)}h</p>
                <p className="text-[9px] text-muted-foreground">estimated saved</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
