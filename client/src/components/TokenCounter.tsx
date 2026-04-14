import { useQuery } from "@tanstack/react-query";
import { Coins, AlertTriangle } from "lucide-react";
import { Link } from "wouter";

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

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

export default function TokenCounter() {
  const { data } = useQuery<TokenStatus>({
    queryKey: ["token-status"],
    queryFn: async () => {
      const res = await fetch("/api/tokens/status");
      if (!res.ok) throw new Error("Failed to fetch token status");
      return res.json();
    },
    refetchInterval: 30000, // refresh every 30s
  });

  if (!data) return null;

  const { plan } = data;
  const pct = Math.min((plan.tokensUsed / plan.monthlyTokens) * 100, 100);
  const isLow = pct >= 80;
  const isDepleted = plan.tokensRemaining <= 0;

  return (
    <div className="px-3 py-2">
      <Link href="/usage">
        <div className="group cursor-pointer rounded-lg border border-border bg-card/50 px-3 py-2.5 hover:bg-secondary/50 transition-colors">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              {isDepleted ? (
                <AlertTriangle className="w-3.5 h-3.5 text-orange-400" />
              ) : (
                <Coins className="w-3.5 h-3.5 text-primary" />
              )}
              <span className="text-[11px] font-medium text-foreground">Tokens</span>
            </div>
            <span className={`text-[11px] font-medium tabular-nums ${isLow ? "text-orange-400" : "text-muted-foreground"}`}>
              {formatTokens(plan.tokensUsed)} / {formatTokens(plan.monthlyTokens)}
            </span>
          </div>

          {/* Progress bar */}
          <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                isDepleted ? "bg-red-500" : isLow ? "bg-orange-400" : "bg-primary"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>

          {plan.bonusTokens > 0 && (
            <p className="text-[10px] text-emerald-400 mt-1">+{formatTokens(plan.bonusTokens)} bonus</p>
          )}

          {isDepleted && (
            <p className="text-[10px] text-orange-400 mt-1 font-medium">Buy more tokens →</p>
          )}
        </div>
      </Link>
    </div>
  );
}
