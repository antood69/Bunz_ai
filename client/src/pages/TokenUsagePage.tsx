import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Coins, Zap, Calendar, TrendingUp, Package, Loader2, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface TokenStatus {
  plan: {
    tier: string;
    monthlyTokens: number;
    tokensUsed: number;
    tokensRemaining: number;
    bonusTokens: number;
    periodEnd: string;
  };
  tierLimits: Record<string, number>;
}

interface UsageRecord {
  id: number;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  endpoint: string;
  createdAt: string;
}

interface UsageSummary {
  total: number;
  byModel: Record<string, number>;
}

const MODEL_COLORS: Record<string, string> = {
  "claude-sonnet-4-6": "bg-violet-500",
  "claude-opus-4-6": "bg-purple-500",
  "claude-haiku-4-5": "bg-fuchsia-500",
  "gpt-5.4": "bg-emerald-500",
  "gpt-5.4-mini": "bg-green-500",
  "gpt-5.4-nano": "bg-teal-500",
  "gemini-3.1-pro": "bg-blue-500",
  "gemini-3-flash": "bg-cyan-500",
  "sonar-pro": "bg-sky-500",
  "sonar": "bg-sky-400",
  // Legacy names (may appear in historical data)
  "claude-sonnet": "bg-violet-500",
  "claude-opus": "bg-purple-500",
  "gpt-4o": "bg-emerald-500",
  "perplexity": "bg-sky-500",
};

const MODEL_LABELS: Record<string, string> = {
  "claude-sonnet-4-6": "Claude Sonnet 4.6",
  "claude-opus-4-6": "Claude Opus 4.6",
  "claude-haiku-4-5": "Claude Haiku 4.5",
  "gpt-5.4": "GPT-5.4",
  "gpt-5.4-mini": "GPT-5.4 Mini",
  "gpt-5.4-nano": "GPT-5.4 Nano",
  "gemini-3.1-pro": "Gemini 3.1 Pro",
  "gemini-3-flash": "Gemini 3 Flash",
  "sonar-pro": "Sonar Pro",
  "sonar": "Sonar",
  // Legacy names (may appear in historical data)
  "claude-sonnet": "Claude Sonnet",
  "claude-opus": "Claude Opus",
  "gpt-4o": "GPT-4o",
  "perplexity": "Perplexity Sonar",
};

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatTime(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const TOKEN_PACKS = [
  { id: "5k", tokens: "5K", price: "$5", description: "Starter overage pack" },
  { id: "10k", tokens: "10K", price: "$5", description: "Pro overage pack — best value" },
  { id: "20k", tokens: "20K", price: "$5", description: "Agency overage pack" },
];

export default function TokenUsagePage() {
  const { toast } = useToast();
  const [buyingPack, setBuyingPack] = useState<string | null>(null);

  const { data: status } = useQuery<TokenStatus>({
    queryKey: ["token-status"],
    queryFn: async () => {
      const res = await fetch("/api/tokens/status");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: usage = [] } = useQuery<UsageRecord[]>({
    queryKey: ["token-usage"],
    queryFn: async () => {
      const res = await fetch("/api/tokens/usage");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: summary } = useQuery<UsageSummary>({
    queryKey: ["token-summary"],
    queryFn: async () => {
      const res = await fetch("/api/tokens/summary");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  async function handleBuyPack(packId: string) {
    setBuyingPack(packId);
    try {
      const res = await fetch("/api/tokens/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packSize: packId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      window.location.href = data.url;
    } catch (err: any) {
      toast({ title: "Purchase error", description: err.message, variant: "destructive" });
      setBuyingPack(null);
    }
  }

  const plan = status?.plan;
  const pct = plan ? Math.min((plan.tokensUsed / plan.monthlyTokens) * 100, 100) : 0;
  const isLow = pct >= 80;

  return (
    <div className="min-h-full px-6 py-10 pb-20 max-w-5xl mx-auto" data-testid="usage-page">
      {/* Header */}
      <div className="mb-8">
        <Badge variant="outline" className="mb-3 text-primary border-primary/40 bg-primary/5">
          Token Economy
        </Badge>
        <h1 className="text-xl font-bold text-foreground mb-1">Token Usage</h1>
        <p className="text-sm text-muted-foreground">Monitor your AI token consumption and buy more when you need them</p>
      </div>

      {/* Stats Cards */}
      {plan && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card className="bg-card border border-border">
            <CardContent className="pt-5 pb-4 px-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Used This Period</p>
                  <p className="text-2xl font-bold text-foreground">{formatTokens(plan.tokensUsed)}</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">of {formatTokens(plan.monthlyTokens)}</p>
                </div>
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                  <TrendingUp size={18} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border border-border">
            <CardContent className="pt-5 pb-4 px-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Remaining</p>
                  <p className={`text-2xl font-bold ${isLow ? "text-orange-400" : "text-foreground"}`}>
                    {formatTokens(plan.tokensRemaining)}
                  </p>
                  {plan.bonusTokens > 0 && (
                    <p className="text-xs text-emerald-400 mt-1">incl. {formatTokens(plan.bonusTokens)} bonus</p>
                  )}
                </div>
                <div className={`p-2 rounded-lg ${isLow ? "bg-orange-400/10 text-orange-400" : "bg-emerald-500/10 text-emerald-400"}`}>
                  <Coins size={18} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border border-border">
            <CardContent className="pt-5 pb-4 px-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Current Plan</p>
                  <p className="text-2xl font-bold text-foreground capitalize">{plan.tier}</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">{formatTokens(plan.monthlyTokens)}/mo</p>
                </div>
                <div className="p-2 rounded-lg bg-violet-500/10 text-violet-400">
                  <Zap size={18} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border border-border">
            <CardContent className="pt-5 pb-4 px-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Period Resets</p>
                  <p className="text-2xl font-bold text-foreground">{formatDate(plan.periodEnd)}</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">tokens reset monthly</p>
                </div>
                <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400">
                  <Calendar size={18} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Usage Progress Bar */}
      {plan && (
        <Card className="bg-card border border-border mb-8">
          <CardContent className="pt-5 pb-5 px-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-foreground">Monthly Token Budget</span>
              <span className={`text-sm font-medium tabular-nums ${isLow ? "text-orange-400" : "text-foreground"}`}>
                {pct.toFixed(1)}% used
              </span>
            </div>
            <div className="h-3 rounded-full bg-secondary overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  pct >= 95 ? "bg-red-500" : isLow ? "bg-orange-400" : "bg-primary"
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex justify-between mt-2 text-[11px] text-muted-foreground">
              <span>{formatTokens(plan.tokensUsed)} used</span>
              <span>{formatTokens(Math.max(0, plan.monthlyTokens - plan.tokensUsed))} remaining from plan</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Model Breakdown */}
      {summary && summary.total > 0 && (
        <Card className="bg-card border border-border mb-8">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-foreground">Usage by Model</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pb-5">
            {Object.entries(summary.byModel).sort(([, a], [, b]) => b - a).map(([model, tokens]) => {
              const modelPct = summary.total > 0 ? (tokens / summary.total) * 100 : 0;
              return (
                <div key={model}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-foreground">{MODEL_LABELS[model] || model}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{formatTokens(tokens)} ({modelPct.toFixed(0)}%)</span>
                  </div>
                  <div className="h-2 rounded-full bg-secondary overflow-hidden">
                    <div
                      className={`h-full rounded-full ${MODEL_COLORS[model] || "bg-primary"}`}
                      style={{ width: `${modelPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Buy More Tokens */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <Package className="w-4 h-4 text-primary" />
          Buy More Tokens
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {TOKEN_PACKS.map((pack) => (
            <Card key={pack.id} className="bg-card border border-border hover:border-primary/40 transition-colors">
              <CardContent className="pt-5 pb-5 px-5">
                <div className="flex items-center gap-2 mb-2">
                  <Coins className="w-4 h-4 text-primary" />
                  <span className="text-lg font-bold text-foreground">{pack.tokens}</span>
                  <span className="text-xs text-muted-foreground">tokens</span>
                </div>
                <p className="text-2xl font-bold text-foreground mb-1">{pack.price}</p>
                <p className="text-xs text-muted-foreground mb-4">{pack.description}</p>
                <Button
                  variant="default"
                  size="sm"
                  className="w-full text-xs"
                  disabled={buyingPack === pack.id}
                  onClick={() => handleBuyPack(pack.id)}
                >
                  {buyingPack === pack.id ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      Redirecting...
                    </>
                  ) : (
                    <>
                      Buy Now <ArrowRight className="w-3 h-3 ml-1" />
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Recent Usage Log */}
      {usage.length > 0 && (
        <Card className="bg-card border border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-foreground">Recent Usage</CardTitle>
          </CardHeader>
          <CardContent className="pb-5">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left py-2 px-2 font-medium">Time</th>
                    <th className="text-left py-2 px-2 font-medium">Model</th>
                    <th className="text-left py-2 px-2 font-medium">Endpoint</th>
                    <th className="text-right py-2 px-2 font-medium">Input</th>
                    <th className="text-right py-2 px-2 font-medium">Output</th>
                    <th className="text-right py-2 px-2 font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.slice(0, 50).map((row) => (
                    <tr key={row.id} className="border-b border-border/50 hover:bg-secondary/30">
                      <td className="py-2 px-2 text-muted-foreground">{formatTime(row.createdAt)}</td>
                      <td className="py-2 px-2">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {MODEL_LABELS[row.model] || row.model}
                        </Badge>
                      </td>
                      <td className="py-2 px-2 text-muted-foreground">{row.endpoint || "—"}</td>
                      <td className="py-2 px-2 text-right tabular-nums text-foreground">{row.inputTokens.toLocaleString()}</td>
                      <td className="py-2 px-2 text-right tabular-nums text-foreground">{row.outputTokens.toLocaleString()}</td>
                      <td className="py-2 px-2 text-right tabular-nums font-medium text-foreground">{row.totalTokens.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
