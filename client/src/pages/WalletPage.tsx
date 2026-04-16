import { useQuery } from "@tanstack/react-query";
import {
  Wallet, TrendingUp, Clock, CreditCard, ArrowDownLeft, ArrowUpRight,
  CheckCircle2, XCircle, Loader2, DollarSign, ExternalLink, RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const CHARGE_STATUS: Record<string, { color: string; bg: string; label: string }> = {
  succeeded: { color: "text-emerald-500", bg: "bg-emerald-500/10", label: "Succeeded" },
  pending: { color: "text-yellow-500", bg: "bg-yellow-500/10", label: "Pending" },
  failed: { color: "text-red-500", bg: "bg-red-500/10", label: "Failed" },
};

const PAYOUT_STATUS: Record<string, { color: string; bg: string; label: string }> = {
  paid: { color: "text-emerald-500", bg: "bg-emerald-500/10", label: "Paid" },
  pending: { color: "text-yellow-500", bg: "bg-yellow-500/10", label: "Pending" },
  in_transit: { color: "text-blue-500", bg: "bg-blue-500/10", label: "In Transit" },
  canceled: { color: "text-red-500", bg: "bg-red-500/10", label: "Canceled" },
  failed: { color: "text-red-500", bg: "bg-red-500/10", label: "Failed" },
};

export default function WalletPage() {
  const { data: wallet, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/stripe/wallet"],
    queryFn: async () => {
      const res = await fetch("/api/stripe/wallet", { credentials: "include" });
      return res.ok ? res.json() : null;
    },
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh] text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading wallet...
      </div>
    );
  }

  if (!wallet) {
    return (
      <div className="p-6 text-center py-20 text-muted-foreground">
        <Wallet className="w-12 h-12 mx-auto mb-4 opacity-20" />
        <p className="text-base font-medium">Stripe not connected</p>
        <p className="text-sm mt-1">Make sure STRIPE_SECRET_KEY is set in your environment</p>
      </div>
    );
  }

  const { balance, transactions = [], payouts = [] } = wallet;
  const totalReceived = transactions.filter((t: any) => t.status === "succeeded" && !t.refunded).reduce((s: number, t: any) => s + t.amount, 0);

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Wallet className="w-5 h-5 text-primary" /> Wallet
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Your Stripe balance, payments, and payouts</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => refetch()}>
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.open("https://dashboard.stripe.com", "_blank")}>
            <ExternalLink className="w-3.5 h-3.5" /> Stripe Dashboard
          </Button>
        </div>
      </div>

      {/* Balance Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="border border-emerald-500/30 rounded-2xl bg-emerald-500/5 p-6">
          <div className="flex items-center gap-2 text-sm text-emerald-500 mb-2">
            <DollarSign className="w-4 h-4" /> Available
          </div>
          <p className="text-3xl font-bold text-emerald-500">${(balance.available || 0).toFixed(2)}</p>
          <p className="text-xs text-muted-foreground mt-1 uppercase">{balance.currency}</p>
        </div>
        <div className="border border-border rounded-2xl bg-card p-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Clock className="w-4 h-4" /> Pending
          </div>
          <p className="text-3xl font-bold text-orange-500">${(balance.pending || 0).toFixed(2)}</p>
          <p className="text-xs text-muted-foreground mt-1">Processing by Stripe</p>
        </div>
        <div className="border border-border rounded-2xl bg-card p-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <TrendingUp className="w-4 h-4" /> Total Received
          </div>
          <p className="text-3xl font-bold text-foreground">${totalReceived.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground mt-1">{transactions.filter((t: any) => t.status === "succeeded").length} successful payments</p>
        </div>
      </div>

      {/* Two columns: Transactions + Payouts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Transactions */}
        <div className="lg:col-span-2 border border-border rounded-2xl bg-card">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <ArrowDownLeft className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Recent Payments</h2>
            <span className="text-xs text-muted-foreground ml-auto">{transactions.length} transactions</span>
          </div>
          {transactions.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <CreditCard className="w-8 h-8 mx-auto mb-2 opacity-20" />
              <p className="text-sm">No payments yet</p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {transactions.map((tx: any) => {
                const cfg = CHARGE_STATUS[tx.status] || CHARGE_STATUS.pending;
                return (
                  <div key={tx.id} className="px-5 py-3 flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
                      {tx.status === "succeeded" ? <ArrowDownLeft className={`w-4 h-4 ${cfg.color}`} /> :
                       tx.status === "failed" ? <XCircle className={`w-4 h-4 ${cfg.color}`} /> :
                       <Clock className={`w-4 h-4 ${cfg.color}`} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{tx.description}</span>
                        {tx.refunded && <Badge variant="destructive" className="text-[9px] h-4">Refunded</Badge>}
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-0.5">
                        {tx.customerEmail && <span>{tx.customerEmail}</span>}
                        <span>{new Date(tx.created).toLocaleDateString()}</span>
                        <span>{new Date(tx.created).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                    </div>
                    <Badge className={`text-[9px] h-5 border-0 ${cfg.bg} ${cfg.color}`}>{cfg.label}</Badge>
                    <span className={`text-sm font-bold tabular-nums ${tx.status === "succeeded" && !tx.refunded ? "text-emerald-500" : "text-muted-foreground"}`}>
                      {tx.status === "succeeded" && !tx.refunded ? "+" : ""}${tx.amount.toFixed(2)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Payouts */}
        <div className="lg:col-span-1 border border-border rounded-2xl bg-card">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <ArrowUpRight className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Payouts</h2>
          </div>
          {payouts.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <ArrowUpRight className="w-8 h-8 mx-auto mb-2 opacity-20" />
              <p className="text-sm">No payouts yet</p>
              <p className="text-xs mt-1">Stripe sends payouts to your bank automatically</p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {payouts.map((p: any) => {
                const cfg = PAYOUT_STATUS[p.status] || PAYOUT_STATUS.pending;
                return (
                  <div key={p.id} className="px-5 py-3">
                    <div className="flex items-center justify-between mb-1">
                      <Badge className={`text-[9px] h-5 border-0 ${cfg.bg} ${cfg.color}`}>{cfg.label}</Badge>
                      <span className="text-sm font-bold text-foreground">${p.amount.toFixed(2)}</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {p.status === "paid" || p.status === "in_transit"
                        ? `Arrives ${new Date(p.arrival).toLocaleDateString()}`
                        : `Created ${new Date(p.created).toLocaleDateString()}`}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
