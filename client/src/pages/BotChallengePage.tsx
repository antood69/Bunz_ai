import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Play, Trophy, AlertTriangle, Activity, Target, Zap, Bot, Plus, Trash2, Sparkles, Code, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import ModelSelector from "@/components/ModelSelector";
import AIChatPanel from "@/components/AIChatPanel";
import { TradingDisclaimerBanner, TradingDisclaimerModal } from "@/components/TradingDisclaimer";
import SellOnMarketplace from "@/components/SellOnMarketplace";

type BotChallenge = {
  id: number;
  name: string;
  firm: string;
  accountSize: number;
  profitTarget: string;
  maxDrawdown: string;
  dailyDrawdown: string;
  consistencyRule?: string;
  status: string;
  currentPnl: string;
  peakBalance?: string;
  botConfig?: string;
  startedAt: string;
  endedAt?: string;
  createdAt: string;
};

type FirmPreset = {
  firm: string;
  accountSize: number;
  profitTarget: string;
  maxDrawdown: string;
  dailyDrawdown: string;
  consistencyRule?: string;
  description: string;
  color: string;
};

const FIRM_PRESETS: FirmPreset[] = [
  {
    firm: "FTMO",
    accountSize: 10000,
    profitTarget: "10",
    maxDrawdown: "10",
    dailyDrawdown: "5",
    consistencyRule: "No single day > 30% of profits",
    description: "$10K challenge · 10% profit target · 5% daily / 10% max DD",
    color: "from-blue-500/20 to-indigo-500/20 border-blue-500/30",
  },
  {
    firm: "Apex",
    accountSize: 50000,
    profitTarget: "9",
    maxDrawdown: "6",
    dailyDrawdown: "6",
    description: "$50K · 9% profit target · 6% trailing DD",
    color: "from-violet-500/20 to-purple-500/20 border-violet-500/30",
  },
  {
    firm: "Topstep",
    accountSize: 50000,
    profitTarget: "6",
    maxDrawdown: "5",
    dailyDrawdown: "5",
    description: "$50K · 6% profit target · 5% daily DD",
    color: "from-emerald-500/20 to-teal-500/20 border-emerald-500/30",
  },
  {
    firm: "TradeDay",
    accountSize: 50000,
    profitTarget: "6",
    maxDrawdown: "5",
    dailyDrawdown: "5",
    description: "$50K · 6% profit target · 5% daily DD",
    color: "from-amber-500/20 to-orange-500/20 border-amber-500/30",
  },
];

const ORDER_FLOW_PRESET = {
  name: "Order Flow Bot v1",
  firm: "Custom",
  accountSize: 50000,
  profitTarget: "8",
  maxDrawdown: "5",
  dailyDrawdown: "3",
  consistencyRule: "No single day > 25% of profits",
  botConfig: JSON.stringify({
    strategy: "order_flow",
    signals: ["CVD divergence", "delta imbalance", "VWAP levels"],
    sizing: "dynamic",
    hft: false,
    maxPositionSize: 2,
  }),
};

function PnlBar({
  current,
  target,
  label,
  danger = false,
}: {
  current: number;
  target: number;
  label: string;
  danger?: boolean;
}) {
  const pct = Math.min(Math.abs(current / target) * 100, 100);
  const isDanger = danger && pct > 70;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span className={isDanger ? "text-rose-400 font-medium" : ""}>{pct.toFixed(1)}%</span>
      </div>
      <div className="h-2 bg-secondary rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            isDanger
              ? "bg-rose-500"
              : danger
              ? "bg-amber-500"
              : "bg-gradient-to-r from-indigo-500 to-violet-500"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    running: "bg-amber-500/15 text-amber-400",
    passed: "bg-emerald-500/15 text-emerald-400",
    failed: "bg-rose-500/15 text-rose-400",
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium ${map[status] || "bg-secondary text-muted-foreground"}`}>
      {status === "running" && <Activity className="w-3 h-3 mr-1" />}
      {status === "passed" && <Trophy className="w-3 h-3 mr-1" />}
      {status === "failed" && <AlertTriangle className="w-3 h-3 mr-1" />}
      {status}
    </span>
  );
}

function ActiveChallengeCard({ challenge }: { challenge: BotChallenge }) {
  const currentPnl = parseFloat(challenge.currentPnl || "0");
  const profitTargetAmt = (challenge.accountSize * parseFloat(challenge.profitTarget)) / 100;
  const maxDrawAmt = (challenge.accountSize * parseFloat(challenge.maxDrawdown)) / 100;
  const dailyDrawAmt = (challenge.accountSize * parseFloat(challenge.dailyDrawdown)) / 100;
  const pnlPositive = currentPnl >= 0;

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-foreground text-sm">{challenge.name}</span>
            <span className="text-xs px-2 py-0.5 rounded-md bg-indigo-500/15 text-indigo-400 font-medium">{challenge.firm}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            ${challenge.accountSize.toLocaleString()} · Started {new Date(challenge.startedAt).toLocaleDateString()}
          </p>
        </div>
        <StatusBadge status={challenge.status} />
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">Current P&L:</span>
        <span className={`font-semibold text-sm ${pnlPositive ? "text-emerald-400" : "text-rose-400"}`}>
          {pnlPositive ? "+" : ""}${currentPnl.toFixed(2)}
        </span>
      </div>

      <div className="space-y-3">
        <PnlBar
          current={Math.max(currentPnl, 0)}
          target={profitTargetAmt}
          label={`Profit Target ($${profitTargetAmt.toLocaleString()})`}
        />
        <PnlBar
          current={Math.min(currentPnl, 0)}
          target={-maxDrawAmt}
          label={`Max Drawdown ($${maxDrawAmt.toLocaleString()})`}
          danger
        />
        <PnlBar
          current={Math.min(currentPnl, 0)}
          target={-dailyDrawAmt}
          label={`Daily Drawdown ($${dailyDrawAmt.toLocaleString()})`}
          danger
        />
      </div>

      {challenge.status !== "running" && (
        <div
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium ${
            challenge.status === "passed"
              ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400"
              : "bg-rose-500/10 border border-rose-500/30 text-rose-400"
          }`}
        >
          {challenge.status === "passed" ? (
            <><Trophy className="w-4 h-4" /> Challenge PASSED — well done!</>
          ) : (
            <><AlertTriangle className="w-4 h-4" /> Challenge FAILED — drawdown exceeded</>
          )}
        </div>
      )}
    </div>
  );
}

// ── Bot Builder Tab ──────────────────────────────────────────────────────────
type TradingBot = {
  id: string;
  name: string;
  description: string | null;
  strategyType: string;
  model: string;
  indicators: string | null;
  entryRules: string | null;
  exitRules: string | null;
  riskRules: string | null;
  timeframe: string;
  symbols: string;
  status: string;
  backtestResults: string | null;
  createdAt: string;
};

function BotBuilderTab() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [viewBot, setViewBot] = useState<TradingBot | null>(null);
  const [form, setForm] = useState({ name: "", description: "", timeframe: "5m", symbols: "ES,NQ" });

  const { data: bots = [] } = useQuery<TradingBot[]>({ queryKey: ["/api/trading-bots"] });

  const createBot = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/trading-bots", {
        name: form.name,
        description: form.description,
        timeframe: form.timeframe,
        symbols: JSON.stringify(form.symbols.split(",").map(s => s.trim())),
      });
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/trading-bots"] });
      setShowCreate(false);
      setForm({ name: "", description: "", timeframe: "5m", symbols: "ES,NQ" });
      setViewBot(data);
    },
  });

  const generateStrategy = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/trading-bots/${id}/generate`);
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/trading-bots"] });
      setViewBot(data);
    },
  });

  const deleteBot = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/trading-bots/${id}`); },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/trading-bots"] });
      setViewBot(null);
    },
  });

  const statusColor = (s: string) => {
    if (s === "generated") return "bg-emerald-500/10 text-emerald-400";
    if (s === "active") return "bg-blue-500/10 text-blue-400";
    return "bg-yellow-500/10 text-yellow-400";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Create AI-powered trading bots using plain English descriptions.</p>
        <Button size="sm" onClick={() => setShowCreate(true)} className="gap-1"><Plus className="w-3 h-3" /> Create Bot</Button>
      </div>

      {showCreate && (
        <div className="bg-card border border-border rounded-lg p-5 space-y-4">
          <h3 className="font-semibold text-foreground">Create Trading Bot</h3>
          <div>
            <label className="text-sm text-muted-foreground">Bot Name</label>
            <input className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground" placeholder="My Scalper Bot" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Strategy Description (plain English)</label>
            <textarea className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground min-h-[100px]" placeholder="Describe your strategy... e.g. 'Buy when RSI crosses above 30 on 5-min chart with volume confirmation, sell when RSI hits 70'" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-muted-foreground">Timeframe</label>
              <select className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground" value={form.timeframe} onChange={e => setForm({ ...form, timeframe: e.target.value })}>
                {["1m", "5m", "15m", "30m", "1h", "4h", "1d"].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Symbols (comma-separated)</label>
              <input className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground" placeholder="ES,NQ" value={form.symbols} onChange={e => setForm({ ...form, symbols: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => createBot.mutate()} disabled={!form.name || createBot.isPending}>Create</Button>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {bots.length === 0 && !showCreate && (
        <div className="text-center py-12 text-muted-foreground">
          <Bot className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No bots yet. Create one to get started.</p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {bots.map(bot => (
          <div key={bot.id} className="bg-card border border-border rounded-lg p-4 space-y-3 cursor-pointer hover:border-primary/30 transition-colors" onClick={() => setViewBot(bot)}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-foreground">{bot.name}</h3>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {bot.timeframe} &middot; {(() => { try { return JSON.parse(bot.symbols).join(", "); } catch { return bot.symbols; } })()}
                </span>
              </div>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColor(bot.status)}`}>{bot.status}</span>
            </div>
            {bot.description && <p className="text-sm text-muted-foreground line-clamp-2">{bot.description}</p>}
            <div className="flex gap-2">
              {bot.status === "draft" && (
                <Button size="sm" variant="outline" className="gap-1" onClick={e => { e.stopPropagation(); generateStrategy.mutate(bot.id); }}>
                  <Sparkles className="w-3 h-3" /> Generate Strategy
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={e => { e.stopPropagation(); deleteBot.mutate(bot.id); }}>
                <Trash2 className="w-3 h-3 text-destructive" />
              </Button>
              {bot.status === "generated" && (
                <div onClick={e => e.stopPropagation()}>
                  <SellOnMarketplace itemName={bot.name} itemDescription={bot.description} listingType="bot" attachedItemId={String(bot.id)} attachedItemData={{ name: bot.name, description: bot.description, strategy: bot.strategy, config: bot.config }} />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Bot Detail Modal */}
      {viewBot && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setViewBot(null)}>
          <div className="bg-card border border-border rounded-lg p-6 max-w-3xl w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-lg text-foreground">{viewBot.name}</h3>
                <span className="text-sm text-muted-foreground">{viewBot.timeframe} &middot; {(() => { try { return JSON.parse(viewBot.symbols).join(", "); } catch { return viewBot.symbols; } })()}</span>
              </div>
              <div className="flex gap-2">
                {viewBot.status === "draft" && (
                  <Button size="sm" className="gap-1" onClick={() => generateStrategy.mutate(viewBot.id)} disabled={generateStrategy.isPending}>
                    <Sparkles className="w-3 h-3" /> {generateStrategy.isPending ? "Generating..." : "Generate Strategy"}
                  </Button>
                )}
              </div>
            </div>
            {viewBot.description && <p className="text-sm text-muted-foreground mb-4">{viewBot.description}</p>}

            {(viewBot.indicators || viewBot.entryRules || viewBot.exitRules || viewBot.riskRules) ? (
              <div className="space-y-4">
                {viewBot.indicators && (
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-1">Indicators</h4>
                    <pre className="bg-background border border-border rounded-lg p-3 text-xs text-foreground whitespace-pre-wrap font-mono">{viewBot.indicators}</pre>
                  </div>
                )}
                {viewBot.entryRules && (
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-1">Entry Rules</h4>
                    <pre className="bg-background border border-border rounded-lg p-3 text-xs text-foreground whitespace-pre-wrap font-mono">{viewBot.entryRules}</pre>
                  </div>
                )}
                {viewBot.exitRules && (
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-1">Exit Rules</h4>
                    <pre className="bg-background border border-border rounded-lg p-3 text-xs text-foreground whitespace-pre-wrap font-mono">{viewBot.exitRules}</pre>
                  </div>
                )}
                {viewBot.riskRules && (
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-1">Risk Rules</h4>
                    <pre className="bg-background border border-border rounded-lg p-3 text-xs text-foreground whitespace-pre-wrap font-mono">{viewBot.riskRules}</pre>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Code className="w-12 h-12 mx-auto mb-3 opacity-40" />
                <p>Click "Generate Strategy" for AI to create indicators, entry, exit, and risk rules.</p>
              </div>
            )}

            <div className="flex justify-end mt-4">
              <Button variant="outline" onClick={() => setViewBot(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BotChallengePage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"challenges" | "builder">("challenges");
  const { data: challenges = [], isLoading } = useQuery<BotChallenge[]>({
    queryKey: ["/api/bot-challenges"],
    queryFn: () => fetch("/api/bot-challenges").then((r) => r.json()),
  });

  const startChallenge = useMutation({
    mutationFn: async (preset: Partial<BotChallenge> & { name: string }) => {
      const res = await fetch("/api/bot-challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...preset,
          status: "running",
          currentPnl: "0",
          startedAt: new Date().toISOString(),
        }),
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/bot-challenges"] });
    },
  });

  const loadOrderFlowPreset = () => {
    startChallenge.mutate({
      ...ORDER_FLOW_PRESET,
    } as any);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <TradingDisclaimerModal />
      <TradingDisclaimerBanner />
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Bot Challenge Simulator</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Test your bot against real prop firm rules before paying
          </p>
        </div>
        <ModelSelector />
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 mb-6 border-b border-border">
        <button
          onClick={() => setActiveTab("challenges")}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "challenges" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Target className="w-3.5 h-3.5" /> Challenges
        </button>
        <button
          onClick={() => setActiveTab("builder")}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "builder" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Bot className="w-3.5 h-3.5" /> Bot Builder
        </button>
      </div>

      {/* Bot Builder Tab */}
      {activeTab === "builder" && <BotBuilderTab />}

      {/* Challenges Tab */}
      {activeTab === "challenges" && <>

      {/* Your Order Flow Preset — featured card */}
      <div className="mb-8 bg-gradient-to-r from-indigo-500/10 via-violet-500/10 to-purple-500/10 border border-indigo-500/30 rounded-xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
                <Zap className="w-3.5 h-3.5 text-foreground" />
              </div>
              <span className="font-bold text-foreground">Your Order Flow Preset</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-medium">Recommended</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xl">
              Pre-configured order flow bot: CVD divergence + delta imbalance + VWAP levels. Prop-firm compliant, no HFT, dynamic position sizing.
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              {["CVD Divergence", "Delta Imbalance", "VWAP Levels", "Dynamic Sizing", "No HFT"].map((tag) => (
                <span key={tag} className="text-xs px-2 py-0.5 rounded-md bg-indigo-500/15 text-indigo-300">
                  {tag}
                </span>
              ))}
            </div>
          </div>
          <Button
            onClick={loadOrderFlowPreset}
            disabled={startChallenge.isPending}
            className="bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-foreground flex-shrink-0"
          >
            <Play className="w-4 h-4 mr-2" />
            Load Preset
          </Button>
        </div>
      </div>

      {/* Firm Presets Grid */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-foreground mb-3 uppercase tracking-wide">Firm Presets</h2>
        <div className="grid grid-cols-2 gap-4">
          {FIRM_PRESETS.map((preset) => (
            <div
              key={preset.firm}
              className={`bg-gradient-to-br ${preset.color} border rounded-xl p-4`}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-bold text-foreground">{preset.firm}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{preset.description}</p>
                </div>
                <Target className="w-5 h-5 text-muted-foreground/60 flex-shrink-0" />
              </div>

              <div className="grid grid-cols-3 gap-2 mb-4 text-center">
                <div className="bg-background/40 rounded-lg py-1.5">
                  <p className="text-xs text-muted-foreground">Profit</p>
                  <p className="text-sm font-bold text-emerald-400">{preset.profitTarget}%</p>
                </div>
                <div className="bg-background/40 rounded-lg py-1.5">
                  <p className="text-xs text-muted-foreground">Max DD</p>
                  <p className="text-sm font-bold text-rose-400">{preset.maxDrawdown}%</p>
                </div>
                <div className="bg-background/40 rounded-lg py-1.5">
                  <p className="text-xs text-muted-foreground">Daily DD</p>
                  <p className="text-sm font-bold text-amber-400">{preset.dailyDrawdown}%</p>
                </div>
              </div>

              <Button
                size="sm"
                variant="secondary"
                className="w-full text-xs"
                disabled={startChallenge.isPending}
                onClick={() =>
                  startChallenge.mutate({
                    name: `${preset.firm} ${preset.accountSize / 1000}K Challenge`,
                    firm: preset.firm,
                    accountSize: preset.accountSize,
                    profitTarget: preset.profitTarget,
                    maxDrawdown: preset.maxDrawdown,
                    dailyDrawdown: preset.dailyDrawdown,
                    consistencyRule: preset.consistencyRule,
                  })
                }
              >
                <Play className="w-3 h-3 mr-1.5" />
                Start Simulation
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* Active Challenges */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3 uppercase tracking-wide">Active Challenges</h2>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Loading challenges...</div>
        ) : challenges.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-border rounded-xl">
            <Target className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">No active challenges</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Click "Start Simulation" on a firm preset above</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {challenges.map((c) => (
              <ActiveChallengeCard key={c.id} challenge={c} />
            ))}
          </div>
        )}
      </div>
      </>}
      <AIChatPanel
        systemPrompt="You are an expert trading bot strategist. Help the user design their trading bot. Ask about their strategy, risk tolerance, preferred markets, and indicators. Provide structured bot configurations."
        placeholder="Describe your trading bot strategy..."
        pageContext="bot-challenge"
      />
    </div>
  );
}
