import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Layers, Plus, Trash2, ArrowRight, Play, CheckCircle, AlertCircle,
  Clock, RefreshCw, Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { TradingDisclaimerBanner, TradingDisclaimerModal } from "@/components/TradingDisclaimer";

type BrokerConnection = {
  id: string;
  broker: string;
  label: string | null;
  isPaper: number;
  isActive: number;
  accountId: string | null;
};

type StackFollower = {
  id: string;
  stackId: string;
  connectionId: string;
  sizeMultiplier: number;
  isActive: number;
};

type AccountStack = {
  id: string;
  name: string;
  leaderConnectionId: string;
  status: string;
  copyMode: string;
  sizeMultiplier: number;
  followers: StackFollower[];
};

type ExecutionLog = {
  id: string;
  stack_id: string;
  connection_id: string;
  symbol: string;
  side: string;
  quantity: number;
  price: number;
  status: string;
  executed_at: string;
};

export default function AccountStacksPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [leaderId, setLeaderId] = useState("");
  const [selectedFollowers, setSelectedFollowers] = useState<string[]>([]);
  const [activeStackId, setActiveStackId] = useState<string | null>(null);
  const [executeForm, setExecuteForm] = useState({ symbol: "AAPL", side: "buy", quantity: "100", price: "150" });

  const { data: stacks = [] } = useQuery<AccountStack[]>({ queryKey: ["/api/account-stacks"] });
  const { data: connections = [] } = useQuery<BrokerConnection[]>({ queryKey: ["/api/broker-connections"] });

  const { data: executionLogs = [] } = useQuery<ExecutionLog[]>({
    queryKey: ["/api/account-stacks/executions", activeStackId],
    queryFn: async () => {
      if (!activeStackId) return [];
      const res = await apiRequest("GET", `/api/account-stacks/${activeStackId}/executions`);
      return res.json();
    },
    enabled: !!activeStackId,
  });

  const createStack = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/account-stacks", {
        name,
        leaderConnectionId: leaderId,
        followerConnectionIds: selectedFollowers,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/account-stacks"] });
      setShowCreate(false);
      setName("");
      setLeaderId("");
      setSelectedFollowers([]);
    },
  });

  const deleteStack = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/account-stacks/${id}`); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/account-stacks"] }),
  });

  const addFollower = useMutation({
    mutationFn: async ({ stackId, connectionId }: { stackId: string; connectionId: string }) => {
      await apiRequest("POST", `/api/account-stacks/${stackId}/followers`, { connectionId });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/account-stacks"] }),
  });

  const removeFollower = useMutation({
    mutationFn: async ({ stackId, fid }: { stackId: string; fid: string }) => {
      await apiRequest("DELETE", `/api/account-stacks/${stackId}/followers/${fid}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/account-stacks"] }),
  });

  const executeCopy = useMutation({
    mutationFn: async (stackId: string) => {
      const res = await apiRequest("POST", `/api/account-stacks/${stackId}/execute`, {
        symbol: executeForm.symbol,
        side: executeForm.side,
        quantity: Number(executeForm.quantity),
        price: Number(executeForm.price),
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/account-stacks/executions", activeStackId] });
    },
  });

  const getLabel = (connId: string) => {
    const c = connections.find(x => x.id === connId);
    return c ? (c.label || `${c.broker} ${c.isPaper ? 'Paper' : 'Live'}`) : connId;
  };

  const getConnection = (connId: string) => connections.find(x => x.id === connId);

  function getSyncStatus(follower: StackFollower): { label: string; color: string; icon: React.ElementType } {
    if (!follower.isActive) return { label: "Inactive", color: "text-zinc-400 bg-zinc-500/10", icon: AlertCircle };
    // Check latest execution for this follower
    const latestLog = executionLogs.find(l => l.connection_id === follower.connectionId);
    if (!latestLog) return { label: "Synced", color: "text-emerald-400 bg-emerald-500/10", icon: CheckCircle };
    if (latestLog.status === "filled") return { label: "Synced", color: "text-emerald-400 bg-emerald-500/10", icon: CheckCircle };
    if (latestLog.status === "pending") return { label: "Pending", color: "text-yellow-400 bg-yellow-500/10", icon: Clock };
    return { label: "Error", color: "text-red-400 bg-red-500/10", icon: AlertCircle };
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <TradingDisclaimerModal />
      <TradingDisclaimerBanner />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Layers className="w-6 h-6 text-primary" /> Account Stacks
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Multi-account trade copier. Group accounts and designate a leader to copy trades to followers.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-1">
          <Plus className="w-4 h-4" /> New Stack
        </Button>
      </div>

      {showCreate && (
        <div className="bg-card border border-border rounded-lg p-5 space-y-4">
          <h2 className="font-semibold text-foreground">Create New Stack</h2>
          <div>
            <label className="text-sm text-muted-foreground">Stack Name</label>
            <input
              className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="My Trading Stack"
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Leader Account</label>
            <select
              className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground"
              value={leaderId}
              onChange={e => setLeaderId(e.target.value)}
            >
              <option value="">Select leader...</option>
              {connections.map(c => (
                <option key={c.id} value={c.id}>{c.label || `${c.broker} ${c.isPaper ? 'Paper' : 'Live'}`}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Follower Accounts</label>
            <div className="mt-1 space-y-1">
              {connections.filter(c => c.id !== leaderId).map(c => (
                <label key={c.id} className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={selectedFollowers.includes(c.id)}
                    onChange={e => {
                      if (e.target.checked) setSelectedFollowers([...selectedFollowers, c.id]);
                      else setSelectedFollowers(selectedFollowers.filter(f => f !== c.id));
                    }}
                  />
                  {c.label || `${c.broker} ${c.isPaper ? 'Paper' : 'Live'}`}
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => createStack.mutate()} disabled={!name || !leaderId}>Create Stack</Button>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {stacks.length === 0 && !showCreate && (
        <div className="text-center py-16 text-muted-foreground">
          <Layers className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p>No stacks yet. Create one to start copying trades.</p>
        </div>
      )}

      <div className="space-y-4">
        {stacks.map(stack => (
          <div key={stack.id} className="bg-card border border-border rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-foreground">{stack.name}</h3>
                <span className="text-xs text-muted-foreground">Mode: {stack.copyMode} &middot; Multiplier: {stack.sizeMultiplier}x</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${stack.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-500/10 text-zinc-400'}`}>
                  {stack.status}
                </span>
                <Button variant="ghost" size="sm" onClick={() => deleteStack.mutate(stack.id)}>
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            </div>

            {/* Copy Status Dashboard */}
            <div className="flex items-start gap-4 flex-wrap">
              <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 min-w-[160px]">
                <span className="text-[10px] uppercase tracking-wider text-primary font-medium">Leader</span>
                <p className="text-sm font-medium text-foreground mt-1">{getLabel(stack.leaderConnectionId)}</p>
                <div className="flex items-center gap-1 mt-1">
                  <Activity className="w-3 h-3 text-emerald-400" />
                  <span className="text-[10px] text-emerald-400">Active</span>
                </div>
              </div>

              {stack.followers.length > 0 && (
                <div className="flex items-center mt-4">
                  <ArrowRight className="w-5 h-5 text-muted-foreground" />
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {stack.followers.map(f => {
                  const syncStatus = getSyncStatus(f);
                  const SyncIcon = syncStatus.icon;
                  return (
                    <div key={f.id} className="bg-secondary/50 border border-border rounded-lg p-3 min-w-[160px] relative group">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Follower</span>
                      <p className="text-sm font-medium text-foreground mt-1">{getLabel(f.connectionId)}</p>
                      <span className="text-xs text-muted-foreground">{f.sizeMultiplier}x size</span>
                      <div className={`flex items-center gap-1 mt-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium w-fit ${syncStatus.color}`}>
                        <SyncIcon className="w-3 h-3" />
                        {syncStatus.label}
                      </div>
                      <button
                        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => removeFollower.mutate({ stackId: stack.id, fid: f.id })}
                      >
                        <Trash2 className="w-3 h-3 text-destructive" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Execute Trade Copy */}
            <div className="border-t border-border pt-4">
              <div className="flex items-end gap-2 flex-wrap">
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase">Symbol</label>
                  <input className="w-24 px-2 py-1.5 bg-background border border-border rounded text-xs text-foreground" value={executeForm.symbol} onChange={e => setExecuteForm({ ...executeForm, symbol: e.target.value })} />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase">Side</label>
                  <select className="w-20 px-2 py-1.5 bg-background border border-border rounded text-xs text-foreground" value={executeForm.side} onChange={e => setExecuteForm({ ...executeForm, side: e.target.value })}>
                    <option value="buy">Buy</option>
                    <option value="sell">Sell</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase">Qty</label>
                  <input type="number" className="w-20 px-2 py-1.5 bg-background border border-border rounded text-xs text-foreground" value={executeForm.quantity} onChange={e => setExecuteForm({ ...executeForm, quantity: e.target.value })} />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase">Price</label>
                  <input type="number" className="w-20 px-2 py-1.5 bg-background border border-border rounded text-xs text-foreground" value={executeForm.price} onChange={e => setExecuteForm({ ...executeForm, price: e.target.value })} />
                </div>
                <Button
                  size="sm"
                  className="h-8 text-xs gap-1"
                  onClick={() => { setActiveStackId(stack.id); executeCopy.mutate(stack.id); }}
                  disabled={executeCopy.isPending}
                >
                  <Play className="w-3 h-3" /> Execute Copy
                </Button>
              </div>
            </div>

            {/* Execution Log */}
            {activeStackId === stack.id && executionLogs.length > 0 && (
              <div className="border-t border-border pt-3">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase">Execution Log</h4>
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1" onClick={() => qc.invalidateQueries({ queryKey: ["/api/account-stacks/executions", activeStackId] })}>
                    <RefreshCw className="w-3 h-3" /> Refresh
                  </Button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted-foreground border-b border-border">
                        <th className="text-left py-1.5 pr-3 font-medium">Time</th>
                        <th className="text-left py-1.5 pr-3 font-medium">Account</th>
                        <th className="text-left py-1.5 pr-3 font-medium">Symbol</th>
                        <th className="text-left py-1.5 pr-3 font-medium">Side</th>
                        <th className="text-right py-1.5 pr-3 font-medium">Qty</th>
                        <th className="text-right py-1.5 pr-3 font-medium">Price</th>
                        <th className="text-left py-1.5 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {executionLogs.slice(0, 10).map(log => (
                        <tr key={log.id} className="border-b border-border/50">
                          <td className="py-1.5 pr-3 text-muted-foreground">{new Date(log.executed_at).toLocaleTimeString()}</td>
                          <td className="py-1.5 pr-3 text-foreground">{getLabel(log.connection_id)}</td>
                          <td className="py-1.5 pr-3 text-foreground font-medium">{log.symbol}</td>
                          <td className="py-1.5 pr-3">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${log.side === "buy" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                              {log.side.toUpperCase()}
                            </span>
                          </td>
                          <td className="py-1.5 pr-3 text-right text-foreground">{log.quantity}</td>
                          <td className="py-1.5 pr-3 text-right text-foreground">${log.price}</td>
                          <td className="py-1.5">
                            <span className={`flex items-center gap-1 text-[10px] font-medium ${
                              log.status === "filled" ? "text-emerald-400" : log.status === "skipped" ? "text-zinc-400" : "text-yellow-400"
                            }`}>
                              {log.status === "filled" ? <CheckCircle className="w-3 h-3" /> : log.status === "skipped" ? <AlertCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                              {log.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
