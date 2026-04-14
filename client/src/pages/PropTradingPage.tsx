import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Trophy, Plus, Trash2, AlertTriangle, TrendingUp, TrendingDown,
  DollarSign, CheckCircle, Clock, Target, ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { TradingDisclaimerBanner, TradingDisclaimerModal } from "@/components/TradingDisclaimer";

type PropAccount = {
  id: string;
  firm: string;
  accountNumber: string | null;
  accountSize: number | null;
  phase: string;
  profitTarget: number | null;
  maxDrawdown: number | null;
  dailyDrawdown: number | null;
  currentBalance: number | null;
  currentPnl: number;
  status: string;
  credentials: string | null;
  createdAt: string;
};

const FIRMS = ["FTMO", "Apex", "Topstep", "MyForexFunds", "The5%ers", "TradeDay", "Funded Next", "Bulenox"];

function DrawdownBar({ label, current, max, invert }: { label: string; current: number; max: number; invert?: boolean }) {
  const pct = max > 0 ? Math.min(100, (Math.abs(current) / max) * 100) : 0;
  const isWarning = pct >= 70;
  const isDanger = pct >= 90;
  const barColor = invert
    ? (pct < 30 ? "bg-red-500" : pct < 70 ? "bg-yellow-500" : "bg-emerald-500")
    : (isDanger ? "bg-red-500" : isWarning ? "bg-yellow-500" : "bg-emerald-500");
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={isDanger && !invert ? "text-red-400" : isWarning && !invert ? "text-yellow-400" : "text-muted-foreground"}>
          {pct.toFixed(1)}% {invert ? "complete" : "used"}
        </span>
      </div>
      <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function PhaseProgress({ phase }: { phase: string }) {
  const phases = ["evaluation", "verification", "funded"];
  const currentIdx = phases.indexOf(phase);
  return (
    <div className="flex items-center gap-1">
      {phases.map((p, i) => (
        <div key={p} className="flex items-center gap-1">
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ${
            i <= currentIdx
              ? i === currentIdx ? "bg-primary/15 text-primary" : "bg-emerald-500/10 text-emerald-400"
              : "bg-secondary text-muted-foreground"
          }`}>
            {i < currentIdx ? <CheckCircle className="w-3 h-3" /> : i === currentIdx ? <Clock className="w-3 h-3" /> : <Circle className="w-3 h-3" />}
            {p.charAt(0).toUpperCase() + p.slice(1)}
          </div>
          {i < phases.length - 1 && <ArrowRight className="w-3 h-3 text-muted-foreground" />}
        </div>
      ))}
    </div>
  );
}

function Circle({ className }: { className?: string }) {
  return <div className={`rounded-full border border-current ${className}`} style={{ width: 12, height: 12 }} />;
}

export default function PropTradingPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    firm: "FTMO", accountNumber: "", accountSize: "100000", phase: "evaluation",
    profitTarget: "10000", maxDrawdown: "10000", dailyDrawdown: "5000",
    currentBalance: "100000",
  });

  const { data: accounts = [] } = useQuery<PropAccount[]>({ queryKey: ["/api/prop-accounts"] });

  const createAccount = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/prop-accounts", {
        firm: form.firm,
        accountNumber: form.accountNumber || undefined,
        accountSize: Number(form.accountSize),
        phase: form.phase,
        profitTarget: Number(form.profitTarget),
        maxDrawdown: Number(form.maxDrawdown),
        dailyDrawdown: Number(form.dailyDrawdown),
        currentBalance: Number(form.currentBalance),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/prop-accounts"] });
      setShowCreate(false);
      setForm({ firm: "FTMO", accountNumber: "", accountSize: "100000", phase: "evaluation", profitTarget: "10000", maxDrawdown: "10000", dailyDrawdown: "5000", currentBalance: "100000" });
    },
  });

  const deleteAccount = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/prop-accounts/${id}`); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/prop-accounts"] }),
  });

  const totalBalance = accounts.reduce((s, a) => s + (a.currentBalance || 0), 0);
  const totalPnl = accounts.reduce((s, a) => s + a.currentPnl, 0);
  const activeAccounts = accounts.filter(a => a.status === "active").length;
  const fundedAccounts = accounts.filter(a => a.phase === "funded").length;
  const evaluationAccounts = accounts.filter(a => a.phase === "evaluation").length;
  const totalSize = accounts.reduce((s, a) => s + (a.accountSize || 0), 0);

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <TradingDisclaimerModal />
      <TradingDisclaimerBanner />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Trophy className="w-6 h-6 text-primary" /> Prop Trading
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Track all your prop firm accounts in one place.</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-1">
          <Plus className="w-4 h-4" /> Add Account
        </Button>
      </div>

      {/* Aggregate Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground">Total Balance</p>
          <p className="text-xl font-bold text-foreground">${totalBalance.toLocaleString()}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground">Total P&L</p>
          <p className={`text-xl font-bold ${totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {totalPnl >= 0 ? "+" : ""}${totalPnl.toLocaleString()}
          </p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground">Active</p>
          <p className="text-xl font-bold text-foreground">{activeAccounts}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground">Funded</p>
          <p className="text-xl font-bold text-emerald-400">{fundedAccounts}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground">In Evaluation</p>
          <p className="text-xl font-bold text-yellow-400">{evaluationAccounts}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground">Total Size</p>
          <p className="text-xl font-bold text-foreground">${totalSize.toLocaleString()}</p>
        </div>
      </div>

      {/* Payout Tracker for Funded Accounts */}
      {fundedAccounts > 0 && (
        <div className="bg-gradient-to-r from-emerald-500/10 to-emerald-500/5 border border-emerald-500/20 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-emerald-400 flex items-center gap-2 mb-3">
            <DollarSign className="w-4 h-4" /> Payout Tracker — Funded Accounts
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {accounts.filter(a => a.phase === "funded").map(acc => {
              const profit = Math.max(0, acc.currentPnl);
              const payoutEst = profit * 0.8; // 80% payout split estimate
              return (
                <div key={acc.id} className="bg-card/50 rounded-lg p-3 border border-border">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-foreground">{acc.firm}</span>
                    <span className="text-xs text-emerald-400 font-semibold">Est. Payout: ${payoutEst.toLocaleString()}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div><p className="text-muted-foreground">Profit</p><p className="text-foreground font-medium">${profit.toLocaleString()}</p></div>
                    <div><p className="text-muted-foreground">Split</p><p className="text-foreground font-medium">80/20</p></div>
                    <div><p className="text-muted-foreground">Status</p><p className="text-emerald-400 font-medium">Active</p></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showCreate && (
        <div className="bg-card border border-border rounded-lg p-5 space-y-4">
          <h2 className="font-semibold text-foreground">Add Prop Account</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-muted-foreground">Firm</label>
              <select className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground" value={form.firm} onChange={e => setForm({ ...form, firm: e.target.value })}>
                {FIRMS.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Account Number</label>
              <input className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground" placeholder="Optional" value={form.accountNumber} onChange={e => setForm({ ...form, accountNumber: e.target.value })} />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Account Size ($)</label>
              <input type="number" className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground" value={form.accountSize} onChange={e => setForm({ ...form, accountSize: e.target.value })} />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Phase</label>
              <select className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground" value={form.phase} onChange={e => setForm({ ...form, phase: e.target.value })}>
                <option value="evaluation">Evaluation</option>
                <option value="verification">Verification</option>
                <option value="funded">Funded</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Profit Target ($)</label>
              <input type="number" className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground" value={form.profitTarget} onChange={e => setForm({ ...form, profitTarget: e.target.value })} />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Max Drawdown ($)</label>
              <input type="number" className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground" value={form.maxDrawdown} onChange={e => setForm({ ...form, maxDrawdown: e.target.value })} />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Daily Drawdown ($)</label>
              <input type="number" className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground" value={form.dailyDrawdown} onChange={e => setForm({ ...form, dailyDrawdown: e.target.value })} />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Current Balance ($)</label>
              <input type="number" className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground" value={form.currentBalance} onChange={e => setForm({ ...form, currentBalance: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => createAccount.mutate()} disabled={!form.firm}>Add Account</Button>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {accounts.length === 0 && !showCreate && (
        <div className="text-center py-16 text-muted-foreground">
          <Trophy className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p>No prop accounts. Add one to start tracking.</p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {accounts.map(acc => (
          <div key={acc.id} className="bg-card border border-border rounded-lg p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-foreground">{acc.firm}</h3>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    acc.phase === 'funded' ? 'bg-emerald-500/10 text-emerald-400' :
                    acc.phase === 'verification' ? 'bg-blue-500/10 text-blue-400' :
                    'bg-yellow-500/10 text-yellow-400'
                  }`}>
                    {acc.phase}
                  </span>
                </div>
                {acc.accountNumber && <p className="text-xs text-muted-foreground mt-0.5">#{acc.accountNumber}</p>}
              </div>
              <div className="flex items-center gap-1">
                <span className={`px-2 py-0.5 rounded text-xs ${acc.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : acc.status === 'breached' ? 'bg-red-500/10 text-red-400' : 'bg-zinc-500/10 text-zinc-400'}`}>
                  {acc.status}
                </span>
                <Button variant="ghost" size="sm" onClick={() => deleteAccount.mutate(acc.id)}>
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </Button>
              </div>
            </div>

            {/* Phase Progress */}
            <PhaseProgress phase={acc.phase} />

            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-[10px] uppercase text-muted-foreground">Balance</p>
                <p className="text-sm font-semibold text-foreground">${(acc.currentBalance || 0).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-muted-foreground">P&L</p>
                <p className={`text-sm font-semibold flex items-center gap-0.5 ${acc.currentPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {acc.currentPnl >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {acc.currentPnl >= 0 ? '+' : ''}${acc.currentPnl.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-muted-foreground">Size</p>
                <p className="text-sm font-semibold text-foreground">${(acc.accountSize || 0).toLocaleString()}</p>
              </div>
            </div>

            {acc.profitTarget && (
              <DrawdownBar
                label="Profit Target"
                current={acc.currentPnl}
                max={acc.profitTarget}
                invert
              />
            )}
            {acc.maxDrawdown && (
              <DrawdownBar
                label="Max Drawdown"
                current={Math.min(0, acc.currentPnl)}
                max={acc.maxDrawdown}
              />
            )}
            {acc.dailyDrawdown && (
              <DrawdownBar
                label="Daily Drawdown"
                current={Math.min(0, acc.currentPnl)}
                max={acc.dailyDrawdown}
              />
            )}

            {/* Drawdown Alert */}
            {acc.maxDrawdown && Math.abs(Math.min(0, acc.currentPnl)) / acc.maxDrawdown >= 0.9 && (
              <div className="flex items-center gap-2 p-2.5 bg-red-500/15 border border-red-500/20 rounded-md text-xs text-red-400 font-medium animate-pulse">
                <AlertTriangle className="w-4 h-4" />
                CRITICAL: Max drawdown at {((Math.abs(Math.min(0, acc.currentPnl)) / acc.maxDrawdown) * 100).toFixed(1)}%! Close positions immediately.
              </div>
            )}
            {acc.maxDrawdown && Math.abs(Math.min(0, acc.currentPnl)) / acc.maxDrawdown >= 0.7 && Math.abs(Math.min(0, acc.currentPnl)) / acc.maxDrawdown < 0.9 && (
              <div className="flex items-center gap-2 p-2 bg-yellow-500/10 border border-yellow-500/20 rounded-md text-xs text-yellow-400">
                <AlertTriangle className="w-3.5 h-3.5" />
                Warning: Approaching max drawdown limit — reduce risk.
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
