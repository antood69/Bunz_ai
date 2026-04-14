import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { TradingDisclaimerBanner, TradingDisclaimerModal } from "@/components/TradingDisclaimer";
import {
  Plus,
  TrendingUp,
  TrendingDown,
  BarChart2,
  ChevronDown,
  ChevronUp,
  X,
  Trash2,
  Edit2,
  CheckCircle,
  Upload,
  Link2,
  RefreshCw,
  Unlink,
  Wifi,
  ArrowUpRight,
  ArrowDownLeft,
  DollarSign,
  Activity,
  Calendar,
  Tag,
  Bot,
  Copy,
  Clock,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

// ── Types ──────────────────────────────────────────────────────────────────────
type Trade = {
  id: string;
  userId: number;
  symbol: string;
  direction: string;
  entryPrice: number;
  exitPrice: number | null;
  quantity: number;
  entryTime: string;
  exitTime: string | null;
  grossPnl: number | null;
  fees: number;
  netPnl: number | null;
  strategyTag: string | null;
  notes: string | null;
  screenshotUrl: string | null;
  importSource: string;
  createdAt: string;
};

type TradingStats = {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  grossPnl: number;
  netPnl: number;
  bestTrade: number;
  worstTrade: number;
  avgRR: number;
  currentWinStreak: number;
  currentLossStreak: number;
  bestWinStreak: number;
};

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmt = (n: number | null | undefined, prefix = true): string => {
  if (n == null) return "—";
  const s = Math.abs(n).toFixed(2);
  if (!prefix) return s;
  return n >= 0 ? `+$${s}` : `-$${s}`;
};

const fmtPct = (n: number) => `${n.toFixed(1)}%`;
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

// ── Sub-components ─────────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: "green" | "red" | "neutral";
}) {
  const valueColor =
    color === "green"
      ? "text-emerald-400"
      : color === "red"
      ? "text-rose-400"
      : "text-foreground";
  return (
    <div className="bg-card border border-border rounded-xl px-5 py-4">
      <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${valueColor}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function DirectionBadge({ direction }: { direction: string }) {
  const isLong = direction === "long";
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
        isLong ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"
      }`}
    >
      {isLong ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {isLong ? "Long" : "Short"}
    </span>
  );
}

// ── Close Trade Modal ──────────────────────────────────────────────────────────
function CloseTradeModal({
  trade,
  onClose,
}: {
  trade: Trade;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [exitPrice, setExitPrice] = useState("");
  const [fees, setFees] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/trades/${trade.id}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exitPrice: parseFloat(exitPrice),
          exitTime: new Date().toISOString(),
          fees: parseFloat(fees) || 0,
        }),
      });
      if (!res.ok) throw new Error("Failed to close trade");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/trades"] });
      qc.invalidateQueries({ queryKey: ["/api/trades/stats"] });
      qc.invalidateQueries({ queryKey: ["/api/trades/equity-curve"] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-foreground">Close {trade.symbol}</h3>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground font-medium block mb-1.5">Exit Price</label>
            <input
              type="number"
              step="0.01"
              placeholder="Exit price"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/60"
              value={exitPrice}
              onChange={(e) => setExitPrice(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-medium block mb-1.5">
              Fees <span className="text-muted-foreground/60">(optional)</span>
            </label>
            <input
              type="number"
              step="0.01"
              placeholder="0.00"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/60"
              value={fees}
              onChange={(e) => setFees(e.target.value)}
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white"
            onClick={() => mutation.mutate()}
            disabled={!exitPrice || mutation.isPending}
          >
            {mutation.isPending ? "Closing..." : "Close Trade"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Add/Edit Trade Form ────────────────────────────────────────────────────────
type TradeFormData = {
  symbol: string;
  direction: string;
  entryPrice: string;
  exitPrice: string;
  quantity: string;
  fees: string;
  entryTime: string;
  strategyTag: string;
  notes: string;
};

function TradeForm({
  initial,
  tradeId,
  onClose,
}: {
  initial?: Partial<TradeFormData>;
  tradeId?: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const isEdit = !!tradeId;
  const [form, setForm] = useState<TradeFormData>({
    symbol: initial?.symbol ?? "",
    direction: initial?.direction ?? "long",
    entryPrice: initial?.entryPrice ?? "",
    exitPrice: initial?.exitPrice ?? "",
    quantity: initial?.quantity ?? "1",
    fees: initial?.fees ?? "0",
    entryTime: initial?.entryTime ?? new Date().toISOString().slice(0, 16),
    strategyTag: initial?.strategyTag ?? "",
    notes: initial?.notes ?? "",
  });

  const set = (k: keyof TradeFormData, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const mutation = useMutation({
    mutationFn: async (data: TradeFormData) => {
      const payload = {
        symbol: data.symbol.toUpperCase().trim(),
        direction: data.direction,
        entryPrice: parseFloat(data.entryPrice),
        exitPrice: data.exitPrice ? parseFloat(data.exitPrice) : null,
        quantity: parseFloat(data.quantity) || 1,
        fees: parseFloat(data.fees) || 0,
        entryTime: new Date(data.entryTime).toISOString(),
        strategyTag: data.strategyTag || null,
        notes: data.notes || null,
      };
      const url = isEdit ? `/api/trades/${tradeId}` : "/api/trades";
      const method = isEdit ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to save trade");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/trades"] });
      qc.invalidateQueries({ queryKey: ["/api/trades/stats"] });
      qc.invalidateQueries({ queryKey: ["/api/trades/equity-curve"] });
      onClose();
    },
  });

  return (
    <div className="bg-card border border-border rounded-xl p-6 mb-6">
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-semibold text-foreground">{isEdit ? "Edit Trade" : "Log New Trade"}</h3>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Symbol */}
        <div>
          <label className="text-xs text-muted-foreground font-medium block mb-1.5">Symbol</label>
          <input
            type="text"
            placeholder="ES, NQ, AAPL..."
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/60 uppercase"
            value={form.symbol}
            onChange={(e) => set("symbol", e.target.value)}
          />
        </div>

        {/* Strategy Tag */}
        <div>
          <label className="text-xs text-muted-foreground font-medium block mb-1.5">
            Strategy Tag <span className="text-muted-foreground/60">(optional)</span>
          </label>
          <input
            type="text"
            placeholder="breakout, VWAP..."
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/60"
            value={form.strategyTag}
            onChange={(e) => set("strategyTag", e.target.value)}
          />
        </div>

        {/* Direction */}
        <div>
          <label className="text-xs text-muted-foreground font-medium block mb-1.5">Direction</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => set("direction", "long")}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors border ${
                form.direction === "long"
                  ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
                  : "bg-background border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              Long
            </button>
            <button
              type="button"
              onClick={() => set("direction", "short")}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors border ${
                form.direction === "short"
                  ? "bg-rose-500/20 border-rose-500/40 text-rose-400"
                  : "bg-background border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              Short
            </button>
          </div>
        </div>

        {/* Entry Time */}
        <div>
          <label className="text-xs text-muted-foreground font-medium block mb-1.5">Entry Time</label>
          <input
            type="datetime-local"
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/60"
            value={form.entryTime}
            onChange={(e) => set("entryTime", e.target.value)}
          />
        </div>

        {/* Entry Price */}
        <div>
          <label className="text-xs text-muted-foreground font-medium block mb-1.5">Entry Price</label>
          <input
            type="number"
            step="0.01"
            placeholder="4500.25"
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/60"
            value={form.entryPrice}
            onChange={(e) => set("entryPrice", e.target.value)}
          />
        </div>

        {/* Exit Price */}
        <div>
          <label className="text-xs text-muted-foreground font-medium block mb-1.5">
            Exit Price <span className="text-muted-foreground/60">(optional)</span>
          </label>
          <input
            type="number"
            step="0.01"
            placeholder="4510.00"
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/60"
            value={form.exitPrice}
            onChange={(e) => set("exitPrice", e.target.value)}
          />
        </div>

        {/* Quantity */}
        <div>
          <label className="text-xs text-muted-foreground font-medium block mb-1.5">Quantity</label>
          <input
            type="number"
            step="0.01"
            placeholder="1"
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/60"
            value={form.quantity}
            onChange={(e) => set("quantity", e.target.value)}
          />
        </div>

        {/* Fees */}
        <div>
          <label className="text-xs text-muted-foreground font-medium block mb-1.5">
            Fees <span className="text-muted-foreground/60">(optional)</span>
          </label>
          <input
            type="number"
            step="0.01"
            placeholder="0.00"
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/60"
            value={form.fees}
            onChange={(e) => set("fees", e.target.value)}
          />
        </div>

        {/* Notes */}
        <div className="col-span-2">
          <label className="text-xs text-muted-foreground font-medium block mb-1.5">
            Notes <span className="text-muted-foreground/60">(optional)</span>
          </label>
          <textarea
            rows={2}
            placeholder="Setup description, confluence, post-trade thoughts..."
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/60 resize-none"
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-4">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          className="bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white"
          onClick={() => mutation.mutate(form)}
          disabled={!form.symbol || !form.entryPrice || mutation.isPending}
        >
          {mutation.isPending ? "Saving..." : isEdit ? "Update Trade" : "Log Trade"}
        </Button>
      </div>
    </div>
  );
}

// ── Trade Row ──────────────────────────────────────────────────────────────────
function TradeRow({ trade }: { trade: Trade }) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  const isOpen = trade.exitPrice === null;
  const pnl = trade.netPnl;
  const pnlPositive = (pnl ?? 0) >= 0;

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/trades/${trade.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/trades"] });
      qc.invalidateQueries({ queryKey: ["/api/trades/stats"] });
      qc.invalidateQueries({ queryKey: ["/api/trades/equity-curve"] });
    },
  });

  return (
    <>
      {showClose && <CloseTradeModal trade={trade} onClose={() => setShowClose(false)} />}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {showEdit && (
          <div className="border-b border-border">
            <TradeForm
              tradeId={trade.id}
              initial={{
                symbol: trade.symbol,
                direction: trade.direction,
                entryPrice: String(trade.entryPrice),
                exitPrice: trade.exitPrice != null ? String(trade.exitPrice) : "",
                quantity: String(trade.quantity),
                fees: String(trade.fees),
                entryTime: trade.entryTime.slice(0, 16),
                strategyTag: trade.strategyTag ?? "",
                notes: trade.notes ?? "",
              }}
              onClose={() => setShowEdit(false)}
            />
          </div>
        )}

        <div className="flex items-center gap-3 px-5 py-3.5 flex-wrap">
          {/* Symbol + direction */}
          <span className="font-bold text-foreground text-sm min-w-[60px]">{trade.symbol}</span>
          <DirectionBadge direction={trade.direction} />

          {/* Prices */}
          <div className="flex-1 flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
            <span>
              Entry: <span className="text-foreground font-medium">{trade.entryPrice}</span>
            </span>
            {trade.exitPrice != null && (
              <span>
                Exit: <span className="text-foreground font-medium">{trade.exitPrice}</span>
              </span>
            )}
            <span>
              Qty: <span className="text-foreground font-medium">{trade.quantity}</span>
            </span>
            {trade.strategyTag && (
              <span className="px-2 py-0.5 bg-secondary text-muted-foreground text-xs rounded-md">
                {trade.strategyTag}
              </span>
            )}
          </div>

          {/* P&L */}
          {pnl != null ? (
            <span
              className={`font-bold text-sm min-w-[80px] text-right ${
                pnlPositive ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {fmt(pnl)}
            </span>
          ) : (
            <span className="text-xs text-amber-400 font-medium min-w-[60px] text-right">Open</span>
          )}

          {/* Date */}
          <span className="text-xs text-muted-foreground">{fmtDate(trade.entryTime)}</span>

          {/* Actions */}
          <div className="flex items-center gap-1">
            {isOpen && (
              <button
                onClick={() => setShowClose(true)}
                title="Close trade"
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                Close
              </button>
            )}
            <button
              onClick={() => setShowEdit((p) => !p)}
              title="Edit"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                if (confirm("Delete this trade?")) deleteMutation.mutate();
              }}
              title="Delete"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setExpanded((p) => !p)}
              className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {expanded && (
          <div className="px-5 pb-4 pt-3 border-t border-border space-y-2">
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <span className="text-xs text-muted-foreground">Gross P&L</span>
                <p
                  className={`font-medium ${
                    (trade.grossPnl ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {fmt(trade.grossPnl)}
                </p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Fees</span>
                <p className="text-foreground font-medium">${trade.fees.toFixed(2)}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Net P&L</span>
                <p
                  className={`font-medium ${
                    (trade.netPnl ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {fmt(trade.netPnl)}
                </p>
              </div>
            </div>
            {trade.notes && (
              <div>
                <p className="text-xs text-muted-foreground font-medium mb-1">Notes</p>
                <p className="text-sm text-foreground">{trade.notes}</p>
              </div>
            )}
            <div className="text-xs text-muted-foreground">
              Import: <span className="text-foreground">{trade.importSource}</span>
              {trade.exitTime && (
                <>
                  {" "}· Closed: <span className="text-foreground">{fmtDate(trade.exitTime)}</span>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ── Equity Curve Chart ─────────────────────────────────────────────────────────
function EquityCurveChart() {
  const { data = [] } = useQuery<{ date: string; cumulativePnl: number }[]>({
    queryKey: ["/api/trades/equity-curve"],
    queryFn: () => fetch("/api/trades/equity-curve").then((r) => r.json()),
  });

  if (data.length < 2) return null;

  const positive = (data[data.length - 1]?.cumulativePnl ?? 0) >= 0;

  return (
    <div className="bg-card border border-border rounded-xl p-5 mb-6">
      <h3 className="text-sm font-semibold text-foreground mb-4">Equity Curve</h3>
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="5%"
                stopColor={positive ? "#10b981" : "#f43f5e"}
                stopOpacity={0.25}
              />
              <stop
                offset="95%"
                stopColor={positive ? "#10b981" : "#f43f5e"}
                stopOpacity={0}
              />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "rgba(255,255,255,0.4)" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "rgba(255,255,255,0.4)" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `$${v}`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
              fontSize: "12px",
            }}
            formatter={(v: number) => [`$${v.toFixed(2)}`, "Cumulative P&L"]}
          />
          <Area
            type="monotone"
            dataKey="cumulativePnl"
            stroke={positive ? "#10b981" : "#f43f5e"}
            strokeWidth={2}
            fill="url(#pnlGrad)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Broker Types ───────────────────────────────────────────────────────────────
type BrokerConnection = {
  id: string;
  userId: number;
  broker: string;
  label: string | null;
  apiKey: string | null;
  apiSecret: string | null;
  isPaper: number;
  isActive: number;
  lastSyncAt: string | null;
  accountId: string | null;
  accountInfo: string | null;
  createdAt: string;
};

type BrokerPosition = {
  symbol: string;
  qty: number;
  side: string;
  avgEntryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  marketValue: number;
};

type BrokerAccount = {
  id: string;
  cash: number;
  portfolioValue: number;
  buyingPower: number;
  equity: number;
};

// ── Connect Broker Modal ────────────────────────────────────────────────────────
function ConnectBrokerModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    broker: "alpaca",
    label: "",
    apiKey: "",
    apiSecret: "",
    isPaper: true,
  });
  const [error, setError] = useState<string | null>(null);

  const set = (k: string, v: any) => setForm((p) => ({ ...p, [k]: v }));

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/broker-connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to connect");
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/broker-connections"] });
      onClose();
    },
    onError: (err: any) => setError(err.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-indigo-400" />
            <h3 className="font-semibold text-foreground">Connect Broker</h3>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="space-y-4">
          {/* Broker */}
          <div>
            <label className="text-xs text-muted-foreground font-medium block mb-1.5">Broker</label>
            <select
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/60"
              value={form.broker}
              onChange={(e) => set("broker", e.target.value)}
            >
              <option value="alpaca">Alpaca</option>
            </select>
          </div>

          {/* Label */}
          <div>
            <label className="text-xs text-muted-foreground font-medium block mb-1.5">
              Label <span className="text-muted-foreground/60">(optional)</span>
            </label>
            <input
              type="text"
              placeholder="My Alpaca Paper Account"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/60"
              value={form.label}
              onChange={(e) => set("label", e.target.value)}
            />
          </div>

          {/* API Key */}
          <div>
            <label className="text-xs text-muted-foreground font-medium block mb-1.5">API Key</label>
            <input
              type="text"
              placeholder="PKXXXXXXXXXXXXXXXX"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/60 font-mono"
              value={form.apiKey}
              onChange={(e) => set("apiKey", e.target.value)}
            />
          </div>

          {/* API Secret */}
          <div>
            <label className="text-xs text-muted-foreground font-medium block mb-1.5">API Secret</label>
            <input
              type="password"
              placeholder="••••••••••••••••••••"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/60 font-mono"
              value={form.apiSecret}
              onChange={(e) => set("apiSecret", e.target.value)}
            />
          </div>

          {/* Paper / Live toggle */}
          <div>
            <label className="text-xs text-muted-foreground font-medium block mb-1.5">Mode</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => set("isPaper", true)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors border ${
                  form.isPaper
                    ? "bg-indigo-500/20 border-indigo-500/40 text-indigo-400"
                    : "bg-background border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                Paper Trading
              </button>
              <button
                type="button"
                onClick={() => set("isPaper", false)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors border ${
                  !form.isPaper
                    ? "bg-amber-500/20 border-amber-500/40 text-amber-400"
                    : "bg-background border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                Live Trading
              </button>
            </div>
            {!form.isPaper && (
              <p className="text-xs text-amber-400 mt-1.5">
                Warning: Live trading uses real money. Orders will execute immediately.
              </p>
            )}
          </div>

          {error && (
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2 text-xs text-rose-400">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 mt-5">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white"
            onClick={() => mutation.mutate()}
            disabled={!form.apiKey || !form.apiSecret || mutation.isPending}
          >
            {mutation.isPending ? "Connecting..." : "Connect"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Live Positions Panel ────────────────────────────────────────────────────────
function LivePositionsPanel({ connectionId }: { connectionId: string }) {
  const qc = useQueryClient();

  const { data: positions = [], isLoading, error } = useQuery<BrokerPosition[]>({
    queryKey: ["/api/broker-connections", connectionId, "positions"],
    queryFn: () =>
      fetch(`/api/broker-connections/${connectionId}/positions`).then((r) => r.json()),
    refetchInterval: 30000,
  });

  const closeMutation = useMutation({
    mutationFn: async (symbol: string) => {
      const res = await fetch(
        `/api/broker-connections/${connectionId}/positions/${symbol}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Failed to close position");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/broker-connections", connectionId, "positions"] });
    },
  });

  if (isLoading) {
    return (
      <div className="text-xs text-muted-foreground text-center py-3">
        Loading positions...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-xs text-rose-400 py-2">
        Could not load positions.
      </div>
    );
  }

  if (positions.length === 0) {
    return (
      <div className="text-xs text-muted-foreground py-2 text-center">
        No open positions.
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-1.5">
      {positions.map((p) => {
        const pnlPositive = p.unrealizedPnl >= 0;
        return (
          <div
            key={p.symbol}
            className="flex items-center gap-3 bg-background/60 border border-border rounded-lg px-3 py-2 text-sm"
          >
            <span className="font-bold text-foreground min-w-[60px]">{p.symbol}</span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                p.side === "long"
                  ? "bg-emerald-500/15 text-emerald-400"
                  : "bg-rose-500/15 text-rose-400"
              }`}
            >
              {p.side}
            </span>
            <div className="flex-1 flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
              <span>
                Qty: <span className="text-foreground font-medium">{p.qty}</span>
              </span>
              <span>
                Avg: <span className="text-foreground font-medium">${p.avgEntryPrice.toFixed(2)}</span>
              </span>
              <span>
                Last: <span className="text-foreground font-medium">${p.currentPrice.toFixed(2)}</span>
              </span>
            </div>
            <span
              className={`text-sm font-bold min-w-[80px] text-right ${
                pnlPositive ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {pnlPositive ? "+" : ""}{fmt(p.unrealizedPnl)}
            </span>
            <button
              onClick={() => {
                if (confirm(`Close ${p.symbol} position?`)) closeMutation.mutate(p.symbol);
              }}
              title="Close position"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ── Broker Connection Card ──────────────────────────────────────────────────────
function BrokerConnectionCard({ connection }: { connection: BrokerConnection }) {
  const qc = useQueryClient();
  const [showPositions, setShowPositions] = useState(false);

  const { data: account } = useQuery<BrokerAccount>({
    queryKey: ["/api/broker-connections", connection.id, "account"],
    queryFn: () =>
      fetch(`/api/broker-connections/${connection.id}/account`).then((r) => r.json()),
    refetchInterval: 60000,
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/broker-connections/${connection.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/broker-connections"] });
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/broker-connections/${connection.id}/sync`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/broker-connections"] });
      qc.invalidateQueries({ queryKey: ["/api/trades"] });
      qc.invalidateQueries({ queryKey: ["/api/trades/stats"] });
      qc.invalidateQueries({ queryKey: ["/api/trades/equity-curve"] });
      alert(`Synced ${data.imported} new trade(s).`);
    },
  });

  const label = connection.label || `${connection.broker} account`;

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/15 flex items-center justify-center">
            <Wifi className="w-4 h-4 text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground text-sm">{label}</span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  connection.isPaper
                    ? "bg-indigo-500/15 text-indigo-400"
                    : "bg-amber-500/15 text-amber-400"
                }`}
              >
                {connection.isPaper ? "Paper" : "Live"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 capitalize">{connection.broker}</p>
          </div>
        </div>

        {/* Account stats */}
        {account && (
          <div className="flex items-center gap-4 text-xs">
            <div className="text-center">
              <p className="text-muted-foreground">Equity</p>
              <p className="font-semibold text-foreground">${account.equity.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            <div className="text-center">
              <p className="text-muted-foreground">Cash</p>
              <p className="font-semibold text-foreground">${account.cash.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            <div className="text-center">
              <p className="text-muted-foreground">Buying Power</p>
              <p className="font-semibold text-foreground">${account.buyingPower.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowPositions((p) => !p)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          >
            <Activity className="w-3.5 h-3.5" />
            Positions
          </button>
          <button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            title="Sync trades"
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncMutation.isPending ? "animate-spin" : ""}`} />
            Sync
          </button>
          <button
            onClick={() => {
              if (confirm("Disconnect this broker account?")) deleteMutation.mutate();
            }}
            title="Disconnect"
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
          >
            <Unlink className="w-3.5 h-3.5" />
            Disconnect
          </button>
        </div>
      </div>

      {connection.lastSyncAt && (
        <p className="text-xs text-muted-foreground mt-2">
          Last sync: {new Date(connection.lastSyncAt).toLocaleString()}
        </p>
      )}

      {showPositions && <LivePositionsPanel connectionId={connection.id} />}
    </div>
  );
}

// ── Broker Connections Panel ────────────────────────────────────────────────────
function BrokerConnectionsPanel() {
  const [showModal, setShowModal] = useState(false);

  const { data: connections = [], isLoading } = useQuery<BrokerConnection[]>({
    queryKey: ["/api/broker-connections"],
    queryFn: () => fetch("/api/broker-connections").then((r) => r.json()),
  });

  return (
    <div className="bg-card border border-border rounded-xl p-5 mb-6">
      {showModal && <ConnectBrokerModal onClose={() => setShowModal(false)} />}

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Link2 className="w-4 h-4 text-indigo-400" />
          <h3 className="text-sm font-semibold text-foreground">Broker Connections</h3>
          {connections.length > 0 && (
            <span className="text-xs bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded-full font-medium">
              {connections.length} connected
            </span>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowModal(true)}
          className="text-xs h-7 gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          Connect Broker
        </Button>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading connections...</p>
      ) : connections.length === 0 ? (
        <div className="text-center py-6 border border-dashed border-border rounded-xl">
          <Wifi className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No brokers connected</p>
          <p className="text-xs text-muted-foreground/60 mt-0.5">
            Connect Alpaca to auto-log trades and trade live
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {connections.map((c) => (
            <BrokerConnectionCard key={c.id} connection={c} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Quick Trade Panel ───────────────────────────────────────────────────────────
function QuickTradePanel({ connections }: { connections: BrokerConnection[] }) {
  const [selectedId, setSelectedId] = useState<string>(connections[0]?.id || "");
  const [form, setForm] = useState({
    symbol: "",
    side: "buy" as "buy" | "sell",
    qty: "1",
    type: "market" as "market" | "limit",
    limitPrice: "",
  });
  const [result, setResult] = useState<{ ok?: boolean; error?: string; message?: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const set = (k: string, v: any) => setForm((p) => ({ ...p, [k]: v }));

  const selectedConn = connections.find((c) => c.id === selectedId);

  const handleOrder = async () => {
    if (!selectedId || !form.symbol || !form.qty) return;
    setLoading(true);
    setResult(null);
    try {
      const payload: any = {
        symbol: form.symbol.toUpperCase().trim(),
        side: form.side,
        qty: parseFloat(form.qty),
        type: form.type,
        timeInForce: "day",
      };
      if (form.type === "limit" && form.limitPrice) {
        payload.limitPrice = parseFloat(form.limitPrice);
      }
      const res = await fetch(`/api/broker-connections/${selectedId}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ error: data.error || "Order failed" });
      } else {
        setResult({ ok: true, message: `Order submitted: ${data.id || "success"}` });
        setForm((p) => ({ ...p, symbol: "", qty: "1", limitPrice: "" }));
      }
    } catch (e: any) {
      setResult({ error: e.message });
    } finally {
      setLoading(false);
    }
  };

  if (connections.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-xl p-5 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <DollarSign className="w-4 h-4 text-emerald-400" />
        <h3 className="text-sm font-semibold text-foreground">Quick Trade</h3>
        {selectedConn && (
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              selectedConn.isPaper
                ? "bg-indigo-500/15 text-indigo-400"
                : "bg-amber-500/15 text-amber-400"
            }`}
          >
            {selectedConn.isPaper ? "Paper" : "LIVE"}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* Account selector */}
        {connections.length > 1 && (
          <div className="col-span-2 sm:col-span-4">
            <label className="text-xs text-muted-foreground font-medium block mb-1.5">Account</label>
            <select
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/60"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              {connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label || c.broker} ({c.isPaper ? "Paper" : "Live"})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Symbol */}
        <div>
          <label className="text-xs text-muted-foreground font-medium block mb-1.5">Symbol</label>
          <input
            type="text"
            placeholder="AAPL"
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/60 uppercase"
            value={form.symbol}
            onChange={(e) => set("symbol", e.target.value)}
          />
        </div>

        {/* Qty */}
        <div>
          <label className="text-xs text-muted-foreground font-medium block mb-1.5">Quantity</label>
          <input
            type="number"
            min="1"
            step="1"
            placeholder="1"
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/60"
            value={form.qty}
            onChange={(e) => set("qty", e.target.value)}
          />
        </div>

        {/* Order type */}
        <div>
          <label className="text-xs text-muted-foreground font-medium block mb-1.5">Order Type</label>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => set("type", "market")}
              className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors border ${
                form.type === "market"
                  ? "bg-primary/20 border-primary/40 text-primary"
                  : "bg-background border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              Market
            </button>
            <button
              type="button"
              onClick={() => set("type", "limit")}
              className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors border ${
                form.type === "limit"
                  ? "bg-primary/20 border-primary/40 text-primary"
                  : "bg-background border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              Limit
            </button>
          </div>
        </div>

        {/* Limit price (conditonal) */}
        {form.type === "limit" ? (
          <div>
            <label className="text-xs text-muted-foreground font-medium block mb-1.5">Limit Price</label>
            <input
              type="number"
              step="0.01"
              placeholder="0.00"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/60"
              value={form.limitPrice}
              onChange={(e) => set("limitPrice", e.target.value)}
            />
          </div>
        ) : (
          <div /> // spacer
        )}

        {/* Buy / Sell + Place Order */}
        <div className="col-span-2 sm:col-span-4 flex gap-3 mt-1">
          <button
            type="button"
            onClick={() => set("side", "buy")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
              form.side === "buy"
                ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
                : "bg-background border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            <ArrowUpRight className="w-4 h-4" />
            Buy
          </button>
          <button
            type="button"
            onClick={() => set("side", "sell")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
              form.side === "sell"
                ? "bg-rose-500/20 border-rose-500/40 text-rose-400"
                : "bg-background border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            <ArrowDownLeft className="w-4 h-4" />
            Sell
          </button>
          <div className="flex-1" />
          <Button
            onClick={handleOrder}
            disabled={loading || !form.symbol || !form.qty || (form.type === "limit" && !form.limitPrice)}
            className={`${
              form.side === "buy"
                ? "bg-emerald-600 hover:bg-emerald-700"
                : "bg-rose-600 hover:bg-rose-700"
            } text-white`}
          >
            {loading
              ? "Placing..."
              : `Place ${form.type === "market" ? "Market" : "Limit"} ${form.side === "buy" ? "Buy" : "Sell"}`}
          </Button>
        </div>
      </div>

      {result && (
        <div
          className={`mt-3 text-xs rounded-lg px-3 py-2 border ${
            result.ok
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
              : "bg-rose-500/10 border-rose-500/30 text-rose-400"
          }`}
        >
          {result.ok ? result.message : result.error}
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
// ── Economic Calendar Tab ─────────────────────────────────────────────────────
type CalendarEvent = {
  title: string;
  country: string;
  date: string;
  time: string;
  impact: string;
  forecast: string;
  previous: string;
  actual: string;
};

function EconomicCalendarTab() {
  const { data: events = [], isLoading } = useQuery<CalendarEvent[]>({
    queryKey: ["/api/forex-calendar"],
  });
  const [impactFilter, setImpactFilter] = useState<string>("");
  const [countryFilter, setCountryFilter] = useState<string>("");

  const filtered = events.filter(e => {
    if (impactFilter && e.impact?.toLowerCase() !== impactFilter) return false;
    if (countryFilter && e.country !== countryFilter) return false;
    return true;
  });

  const countries = Array.from(new Set(events.map(e => e.country).filter(Boolean)));

  const impactColor = (impact: string) => {
    const l = impact?.toLowerCase() || "";
    if (l === "high" || l === "holiday") return "bg-red-500/15 text-red-400";
    if (l === "medium") return "bg-orange-500/15 text-orange-400";
    if (l === "low") return "bg-yellow-500/15 text-yellow-400";
    return "bg-zinc-500/15 text-zinc-400";
  };

  // Find next major event
  const now = new Date();
  const upcoming = events
    .filter(e => e.impact?.toLowerCase() === "high" && e.date)
    .map(e => ({ ...e, dt: new Date(e.date + (e.time ? " " + e.time : "")) }))
    .filter(e => e.dt > now)
    .sort((a, b) => a.dt.getTime() - b.dt.getTime());
  const nextMajor = upcoming[0];

  const [countdown, setCountdown] = useState("");
  useEffect(() => {
    if (!nextMajor) return;
    const tick = () => {
      const diff = nextMajor.dt.getTime() - Date.now();
      if (diff <= 0) { setCountdown("NOW"); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setCountdown(`${h}h ${m}m ${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [nextMajor?.dt?.getTime()]);

  if (isLoading) return <div className="text-center py-12 text-muted-foreground">Loading calendar...</div>;

  return (
    <div className="space-y-4">
      {nextMajor && (
        <div className="bg-gradient-to-r from-red-500/10 to-orange-500/10 border border-red-500/20 rounded-lg p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Next Major Event</p>
            <p className="text-xs text-muted-foreground">{nextMajor.title} ({nextMajor.country})</p>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-red-400" />
            <span className="text-lg font-bold text-red-400 font-mono">{countdown}</span>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <div className="flex gap-1.5">
          {["", "high", "medium", "low"].map(i => (
            <button key={i} onClick={() => setImpactFilter(i)} className={`px-3 py-1 rounded text-xs font-medium border ${impactFilter === i ? "bg-primary/20 border-primary/40 text-primary" : "bg-background border-border text-muted-foreground"}`}>
              {i || "All"}
            </button>
          ))}
        </div>
        <select className="px-2 py-1 bg-background border border-border rounded text-xs text-foreground" value={countryFilter} onChange={e => setCountryFilter(e.target.value)}>
          <option value="">All Countries</option>
          {countries.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="text-left p-3">Event</th>
              <th className="text-left p-3">Country</th>
              <th className="text-left p-3">Date</th>
              <th className="text-left p-3">Time</th>
              <th className="text-center p-3">Impact</th>
              <th className="text-right p-3">Forecast</th>
              <th className="text-right p-3">Previous</th>
              <th className="text-right p-3">Actual</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e, i) => (
              <tr key={i} className="border-b border-border/50 hover:bg-secondary/30">
                <td className="p-3 text-foreground font-medium">{e.title}</td>
                <td className="p-3 text-muted-foreground">{e.country}</td>
                <td className="p-3 text-muted-foreground">{e.date}</td>
                <td className="p-3 text-muted-foreground">{e.time || "—"}</td>
                <td className="p-3 text-center">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${impactColor(e.impact)}`}>
                    {e.impact || "—"}
                  </span>
                </td>
                <td className="p-3 text-right text-muted-foreground">{e.forecast || "—"}</td>
                <td className="p-3 text-right text-muted-foreground">{e.previous || "—"}</td>
                <td className="p-3 text-right text-foreground font-medium">{e.actual || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm">No events match filters.</div>
        )}
      </div>
    </div>
  );
}

// ── Prop Deals Tab ────────────────────────────────────────────────────────────
type PropDeal = {
  firm: string;
  accountSize: string;
  originalPrice: number;
  salePrice: number;
  discount: number;
  promoCode: string;
  expiry: string;
};

const PROP_DEALS: PropDeal[] = [
  { firm: "Apex", accountSize: "$50K", originalPrice: 167, salePrice: 84, discount: 50, promoCode: "BUNZ50", expiry: "2026-05-01" },
  { firm: "FTMO", accountSize: "$100K", originalPrice: 540, salePrice: 432, discount: 20, promoCode: "BUNZ20", expiry: "2026-04-30" },
  { firm: "Topstep", accountSize: "$50K", originalPrice: 165, salePrice: 99, discount: 40, promoCode: "BUNZ40", expiry: "2026-05-15" },
  { firm: "MyForexFunds", accountSize: "$100K", originalPrice: 499, salePrice: 349, discount: 30, promoCode: "BUNZ30", expiry: "2026-04-28" },
  { firm: "The5%ers", accountSize: "$100K", originalPrice: 275, salePrice: 220, discount: 20, promoCode: "BUNZ20", expiry: "2026-05-10" },
  { firm: "TradeDay", accountSize: "$50K", originalPrice: 125, salePrice: 75, discount: 40, promoCode: "BUNZ40", expiry: "2026-05-05" },
  { firm: "Funded Next", accountSize: "$100K", originalPrice: 549, salePrice: 384, discount: 30, promoCode: "BUNZ30", expiry: "2026-04-25" },
  { firm: "Bulenox", accountSize: "$50K", originalPrice: 155, salePrice: 93, discount: 40, promoCode: "BUNZ40", expiry: "2026-05-20" },
];

function PropDealsTab() {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const sorted = [...PROP_DEALS].sort((a, b) => b.discount - a.discount);

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Curated prop firm deals sorted by best discount.</p>
      <div className="grid gap-4 md:grid-cols-2">
        {sorted.map((deal, i) => (
          <div key={i} className="bg-card border border-border rounded-lg p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                  {deal.firm[0]}
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">{deal.firm}</h3>
                  <span className="text-xs text-muted-foreground">{deal.accountSize}</span>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 text-xs font-bold">{deal.discount}% OFF</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold text-foreground">${deal.salePrice}</span>
              <span className="text-sm line-through text-muted-foreground">${deal.originalPrice}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <code className="bg-background border border-border px-2 py-1 rounded text-xs font-mono text-foreground">{deal.promoCode}</code>
                <button onClick={() => copyCode(deal.promoCode)} className="text-xs text-primary hover:underline flex items-center gap-1">
                  <Copy className="w-3 h-3" />
                  {copiedCode === deal.promoCode ? "Copied!" : "Copy"}
                </button>
              </div>
              <span className="text-[10px] text-muted-foreground">Exp: {deal.expiry}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Bot Deploy Tab ────────────────────────────────────────────────────────────
type TradingBotSummary = {
  id: string;
  name: string;
  status: string;
  timeframe: string;
};

type BotDeploymentType = {
  id: string;
  botId: string;
  connectionId: string;
  status: string;
  maxPositionSize: number;
  maxDailyLoss: number;
  maxTradesPerDay: number;
  totalTrades: number;
  totalPnl: number;
};

function BotDeployTab() {
  const qc = useQueryClient();
  const [showDeploy, setShowDeploy] = useState(false);
  const [selectedBot, setSelectedBot] = useState("");
  const [selectedConn, setSelectedConn] = useState("");
  const [maxPos, setMaxPos] = useState("1");
  const [maxLoss, setMaxLoss] = useState("500");
  const [maxTrades, setMaxTrades] = useState("10");

  const { data: bots = [] } = useQuery<TradingBotSummary[]>({ queryKey: ["/api/trading-bots"] });
  const { data: connections = [] } = useQuery<BrokerConnection[]>({ queryKey: ["/api/broker-connections"] });
  const { data: deployments = [] } = useQuery<BotDeploymentType[]>({ queryKey: ["/api/bot-deployments"] });

  const createDeploy = useMutation({
    mutationFn: async () => {
      const { apiRequest } = await import("@/lib/queryClient");
      await apiRequest("POST", "/api/bot-deployments", {
        botId: selectedBot,
        connectionId: selectedConn,
        maxPositionSize: Number(maxPos),
        maxDailyLoss: Number(maxLoss),
        maxTradesPerDay: Number(maxTrades),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/bot-deployments"] });
      setShowDeploy(false);
    },
  });

  const toggleDeploy = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { apiRequest } = await import("@/lib/queryClient");
      await apiRequest("PUT", `/api/bot-deployments/${id}`, { status: status === "running" ? "stopped" : "running" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/bot-deployments"] }),
  });

  const deleteDeploy = useMutation({
    mutationFn: async (id: string) => {
      const { apiRequest } = await import("@/lib/queryClient");
      await apiRequest("DELETE", `/api/bot-deployments/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/bot-deployments"] }),
  });

  const getBotName = (botId: string) => bots.find(b => b.id === botId)?.name || botId;
  const getConnLabel = (connId: string) => {
    const c = connections.find(x => x.id === connId);
    return c ? (c.label || `${c.broker}`) : connId;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Deploy AI bots to broker connections for automated trading.</p>
        <Button size="sm" onClick={() => setShowDeploy(true)} className="gap-1"><Bot className="w-3 h-3" /> Deploy Bot</Button>
      </div>

      {showDeploy && (
        <div className="bg-card border border-border rounded-lg p-4 space-y-3">
          <h3 className="font-semibold text-foreground text-sm">New Deployment</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Bot</label>
              <select className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground" value={selectedBot} onChange={e => setSelectedBot(e.target.value)}>
                <option value="">Select bot...</option>
                {bots.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Broker Connection</label>
              <select className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground" value={selectedConn} onChange={e => setSelectedConn(e.target.value)}>
                <option value="">Select connection...</option>
                {connections.map(c => <option key={c.id} value={c.id}>{c.label || c.broker}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Max Position Size</label>
              <input type="number" className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground" value={maxPos} onChange={e => setMaxPos(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Max Daily Loss ($)</label>
              <input type="number" className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground" value={maxLoss} onChange={e => setMaxLoss(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => createDeploy.mutate()} disabled={!selectedBot || !selectedConn}>Deploy</Button>
            <Button size="sm" variant="outline" onClick={() => setShowDeploy(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {deployments.length === 0 && !showDeploy && (
        <div className="text-center py-12 text-muted-foreground">
          <Bot className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No bot deployments yet.</p>
        </div>
      )}

      <div className="space-y-3">
        {deployments.map(dep => (
          <div key={dep.id} className="bg-card border border-border rounded-lg p-4 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground">{getBotName(dep.botId)}</span>
                <span className="text-xs text-muted-foreground">→ {getConnLabel(dep.connectionId)}</span>
              </div>
              <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                <span>Trades: {dep.totalTrades}</span>
                <span className={dep.totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}>P&L: {dep.totalPnl >= 0 ? "+" : ""}${dep.totalPnl.toFixed(2)}</span>
                <span>Max Pos: {dep.maxPositionSize}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${dep.status === "running" ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-500/10 text-zinc-400"}`}>
                {dep.status}
              </span>
              <Button size="sm" variant="outline" onClick={() => toggleDeploy.mutate({ id: dep.id, status: dep.status })}>
                {dep.status === "running" ? "Stop" : "Start"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => deleteDeploy.mutate(dep.id)}>
                <Trash2 className="w-3.5 h-3.5 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TradingJournalPage() {
  const [showForm, setShowForm] = useState(false);
  const [filterDirection, setFilterDirection] = useState<string>("");
  const [filterSymbol, setFilterSymbol] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"journal" | "calendar" | "deals" | "deploy">("journal");

  const params = new URLSearchParams();
  if (filterDirection) params.set("direction", filterDirection);
  if (filterSymbol) params.set("symbol", filterSymbol.toUpperCase());

  const { data: trades = [], isLoading: tradesLoading } = useQuery<Trade[]>({
    queryKey: ["/api/trades", filterDirection, filterSymbol],
    queryFn: () =>
      fetch(`/api/trades?${params.toString()}`).then((r) => r.json()),
  });

  const { data: stats } = useQuery<TradingStats>({
    queryKey: ["/api/trades/stats"],
    queryFn: () => fetch("/api/trades/stats").then((r) => r.json()),
  });

  const { data: brokerConnections = [] } = useQuery<BrokerConnection[]>({
    queryKey: ["/api/broker-connections"],
    queryFn: () => fetch("/api/broker-connections").then((r) => r.json()),
  });

  const netPnl = stats?.netPnl ?? 0;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <TradingDisclaimerModal />
      <TradingDisclaimerBanner />
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Trading Journal</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Track, analyze, and improve your trading performance</p>
        </div>
        {activeTab === "journal" && (
          <Button
            onClick={() => setShowForm((p) => !p)}
            className="bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Trade
          </Button>
        )}
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {([
          { key: "journal", label: "Journal", icon: BarChart2 },
          { key: "calendar", label: "Calendar", icon: Calendar },
          { key: "deals", label: "Prop Deals", icon: Tag },
          { key: "deploy", label: "Bot Deploy", icon: Bot },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Calendar Tab */}
      {activeTab === "calendar" && <EconomicCalendarTab />}

      {/* Prop Deals Tab */}
      {activeTab === "deals" && <PropDealsTab />}

      {/* Bot Deploy Tab */}
      {activeTab === "deploy" && <BotDeployTab />}

      {/* Journal Tab Content */}
      {activeTab === "journal" && <>

      {/* Broker Connections Panel */}
      <BrokerConnectionsPanel />

      {/* Quick Trade Panel (only when broker is connected) */}
      {brokerConnections.length > 0 && (
        <QuickTradePanel connections={brokerConnections} />
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-4 mb-4 sm:grid-cols-6">
        <StatCard
          label="Total Trades"
          value={stats?.totalTrades ?? 0}
          sub={`${stats?.winningTrades ?? 0}W / ${stats?.losingTrades ?? 0}L`}
        />
        <StatCard
          label="Win Rate"
          value={stats ? fmtPct(stats.winRate) : "—"}
          sub={`${stats?.winningTrades ?? 0} winners`}
          color={stats && stats.winRate >= 50 ? "green" : "red"}
        />
        <StatCard
          label="Profit Factor"
          value={stats ? stats.profitFactor.toFixed(2) : "—"}
          sub="gross / loss"
          color={stats && stats.profitFactor >= 1 ? "green" : "red"}
        />
        <StatCard
          label="Net P&L"
          value={stats ? fmt(stats.netPnl) : "—"}
          sub="closed trades"
          color={netPnl >= 0 ? "green" : "red"}
        />
        <StatCard
          label="Best Trade"
          value={stats ? fmt(stats.bestTrade) : "—"}
          color="green"
        />
        <StatCard
          label="Worst Trade"
          value={stats ? fmt(stats.worstTrade) : "—"}
          color="red"
        />
      </div>

      {/* Secondary stats */}
      {stats && (
        <div className="grid grid-cols-4 gap-3 mb-6 text-xs">
          <div className="bg-card border border-border rounded-lg px-4 py-3">
            <p className="text-muted-foreground">Avg Win</p>
            <p className="font-semibold text-emerald-400 mt-0.5">{fmt(stats.avgWin)}</p>
          </div>
          <div className="bg-card border border-border rounded-lg px-4 py-3">
            <p className="text-muted-foreground">Avg Loss</p>
            <p className="font-semibold text-rose-400 mt-0.5">-{fmt(stats.avgLoss, false)}</p>
          </div>
          <div className="bg-card border border-border rounded-lg px-4 py-3">
            <p className="text-muted-foreground">Win Streak</p>
            <p className="font-semibold text-foreground mt-0.5">
              {stats.currentWinStreak} <span className="text-muted-foreground">(best: {stats.bestWinStreak})</span>
            </p>
          </div>
          <div className="bg-card border border-border rounded-lg px-4 py-3">
            <p className="text-muted-foreground">Loss Streak</p>
            <p className="font-semibold text-foreground mt-0.5">{stats.currentLossStreak}</p>
          </div>
        </div>
      )}

      {/* Equity Curve */}
      <EquityCurveChart />

      {/* Add Trade Form */}
      {showForm && <TradeForm onClose={() => setShowForm(false)} />}

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <input
          type="text"
          placeholder="Filter by symbol..."
          className="bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/60 w-40"
          value={filterSymbol}
          onChange={(e) => setFilterSymbol(e.target.value)}
        />
        <div className="flex gap-1.5">
          {["", "long", "short"].map((d) => (
            <button
              key={d}
              onClick={() => setFilterDirection(d)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                filterDirection === d
                  ? "bg-primary/20 border-primary/40 text-primary"
                  : "bg-background border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {d === "" ? "All" : d.charAt(0).toUpperCase() + d.slice(1)}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground ml-auto">{trades.length} trades</span>
      </div>

      {/* Trade List */}
      {tradesLoading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Loading trades...</div>
      ) : trades.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-xl">
          <BarChart2 className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground font-medium">No trades logged yet</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Click "Add Trade" to start tracking your performance
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {trades.map((trade) => (
            <TradeRow key={trade.id} trade={trade} />
          ))}
        </div>
      )}

      </>}
    </div>
  );
}
