import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Bot, Plus, Play, Square, Trash2, Loader2,
  Pencil, X, Save, Clock, Activity, Zap, Send, ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

interface BotDef {
  id: string; user_id: number; name: string; description: string | null;
  brain_prompt: string; brain_model: string; category: string;
  memory: Record<string, any>; triggers: any[]; tools: any[]; rules: any[];
  status: string; last_active_at: number | null; total_runs: number; total_tokens: number;
  created_at: number; updated_at: number;
}

interface BotLog {
  id: number; bot_id: string; type: string; message: string; data: any; created_at: number;
}

function timeAgo(ts: number | null): string {
  if (!ts) return "never";
  const d = Date.now() - ts;
  if (d < 60000) return "just now";
  if (d < 3600000) return `${Math.floor(d / 60000)}m ago`;
  if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

const LOG_COLORS: Record<string, string> = {
  cycle: "text-muted-foreground", decision: "text-blue-400", action: "text-amber-400",
  result: "text-emerald-400", error: "text-red-400", notify: "text-purple-400",
  memory: "text-cyan-400", lifecycle: "text-primary",
};

// ── Bot Builder Dialog ───────────────────────────────────────────────
function BotBuilderDialog({ open, bot, onClose, onSave }: {
  open: boolean; bot: BotDef | null; onClose: () => void; onSave: (data: any) => void;
}) {
  const [name, setName] = useState(bot?.name || "");
  const [desc, setDesc] = useState(bot?.description || "");
  const [brain, setBrain] = useState(bot?.brain_prompt || "");
  const [model, setModel] = useState(bot?.brain_model || "gpt-5.4");
  const [category, setCategory] = useState(bot?.category || "general");
  const [rulesText, setRulesText] = useState((bot?.rules || []).join("\n"));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Bot className="w-5 h-5 text-primary" /> {bot ? "Edit Bot" : "New Bot"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Trading Bot" className="mt-1" /></div>
            <div><Label className="text-xs">Category</Label><Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="trading, content, monitor" className="mt-1" /></div>
          </div>
          <div><Label className="text-xs">Description</Label><Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What does this bot do?" className="mt-1" /></div>
          <div><Label className="text-xs">Brain (System Prompt)</Label>
            <textarea value={brain} onChange={(e) => setBrain(e.target.value)} rows={6}
              className="w-full mt-1 bg-background border border-border rounded-md px-3 py-2 text-sm resize-y min-h-[100px]"
              placeholder="You are a trading bot specializing in..." /></div>
          <div><Label className="text-xs">Model</Label>
            <select value={model} onChange={(e) => setModel(e.target.value)} className="w-full mt-1 bg-background border border-border rounded-md px-2 py-1.5 text-sm">
              <option value="gpt-5.4-mini">GPT-5.4 Mini (fast)</option><option value="gpt-5.4">GPT-5.4 (balanced)</option>
              <option value="claude-sonnet-4-6">Claude Sonnet</option><option value="claude-opus-4-6">Claude Opus</option>
            </select></div>
          <div><Label className="text-xs">Rules (one per line)</Label>
            <textarea value={rulesText} onChange={(e) => setRulesText(e.target.value)} rows={3}
              className="w-full mt-1 bg-background border border-border rounded-md px-3 py-2 text-sm resize-y"
              placeholder="Max 2% drawdown per day&#10;Confirm trades over $1000" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!name.trim() || !brain.trim()} onClick={() => onSave({
            name, description: desc, brainPrompt: brain, brainModel: model, category,
            rules: rulesText.split("\n").filter((r: string) => r.trim()),
          })}><Save className="w-4 h-4 mr-1" /> {bot ? "Update" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Full-Page AI Assistant ───────────────────────────────────────────
function BotAssistant({ onClose, onCreate }: { onClose: () => void; onCreate: (data: any) => void }) {
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [botConfig, setBotConfig] = useState<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const send = async () => {
    if (!input.trim() || loading) return;
    const msg = { role: "user" as const, content: input.trim() };
    const newMsgs = [...messages, msg];
    setMessages(newMsgs); setInput(""); setLoading(true);
    setTimeout(() => scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight), 50);

    try {
      const res = await fetch("/api/bots/assist", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ messages: newMsgs }),
      });
      const data = await res.json();
      if (data.reply) setMessages(p => [...p, { role: "assistant", content: data.reply }]);
      if (data.botConfig) setBotConfig(data.botConfig);
    } catch { setMessages(p => [...p, { role: "assistant", content: "Something went wrong. Try again." }]); }
    finally { setLoading(false); setTimeout(() => { scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight); inputRef.current?.focus(); }, 50); }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0"><ArrowLeft className="w-4 h-4" /></Button>
        <Bot className="w-5 h-5 text-primary" />
        <div>
          <h2 className="text-sm font-semibold text-foreground">Bot Architect</h2>
          <p className="text-[11px] text-muted-foreground">Describe what you want your bot to do — I'll ask clarifying questions and build it</p>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Bot className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm font-medium">What kind of bot do you want to build?</p>
            <p className="text-xs mt-2 max-w-md mx-auto">Describe your idea and I'll ask about data sources, triggers, decision logic, constraints, and anything else I need to design it properly.</p>
            <div className="flex flex-wrap gap-2 justify-center mt-4">
              {["Trading bot for futures", "Content pipeline for Fiverr", "GitHub issue monitor", "Daily research digest"].map(s => (
                <button key={s} onClick={() => { setInput(s); }} className="text-xs px-3 py-1.5 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors">{s}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${
              m.role === "user" ? "bg-primary text-primary-foreground" : "bg-card border border-border text-foreground"
            }`}>{m.content}</div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-card border border-border rounded-2xl px-4 py-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Thinking...
            </div>
          </div>
        )}
      </div>

      {/* Bot ready banner */}
      {botConfig && (
        <div className="mx-4 mb-2 border border-emerald-500/30 bg-emerald-500/10 rounded-xl px-4 py-3 flex items-center justify-between">
          <div>
            <span className="text-sm font-medium text-emerald-400">Bot ready: {botConfig.name}</span>
            <p className="text-[11px] text-muted-foreground mt-0.5">{botConfig.category} · {botConfig.rules?.length || 0} rules · {botConfig.tools?.length || 0} tools</p>
          </div>
          <Button size="sm" className="gap-1" onClick={() => { onCreate(botConfig); }}>
            <Save className="w-3.5 h-3.5" /> Create Bot
          </Button>
        </div>
      )}

      {/* Input */}
      <div className="px-4 py-3 border-t border-border">
        <div className="flex items-end gap-2">
          <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            disabled={loading} rows={1} placeholder="Describe your bot idea..."
            className="flex-1 bg-secondary border border-border rounded-xl px-4 py-3 text-sm resize-none min-h-[44px] max-h-[120px] focus:outline-none focus:ring-1 focus:ring-primary"
            style={{ height: "auto", overflow: "hidden" }}
            onInput={(e) => { const t = e.currentTarget; t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 120) + "px"; }} />
          <Button className="h-11 w-11 rounded-xl p-0" onClick={send} disabled={loading || !input.trim()}>
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────
export default function BotsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editBot, setEditBot] = useState<BotDef | null>(null);
  const [logsOpen, setLogsOpen] = useState<string | null>(null);
  const [assistMode, setAssistMode] = useState(false);

  const { data: bots = [], isLoading } = useQuery<BotDef[]>({ queryKey: ["/api/bots"], refetchInterval: 5000 });

  const { data: logs = [] } = useQuery<BotLog[]>({
    queryKey: ["/api/bots/logs", logsOpen],
    queryFn: async () => { if (!logsOpen) return []; const r = await fetch(`/api/bots/${logsOpen}/logs`, { credentials: "include" }); return r.ok ? r.json() : []; },
    enabled: !!logsOpen, refetchInterval: logsOpen ? 3000 : false,
  });

  const createMut = useMutation({
    mutationFn: async (data: any) => (await apiRequest("POST", "/api/bots", data)).json(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/bots"] }); setBuilderOpen(false); setAssistMode(false); toast({ title: "Bot created" }); },
  });
  const updateMut = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => (await apiRequest("PUT", `/api/bots/${id}`, data)).json(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/bots"] }); setBuilderOpen(false); setEditBot(null); toast({ title: "Bot updated" }); },
  });
  const deleteMut = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/bots/${id}`); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/bots"] }); toast({ title: "Bot deleted" }); },
  });
  const startMut = useMutation({
    mutationFn: async (id: string) => (await apiRequest("POST", `/api/bots/${id}/start`, { intervalMs: 60000 })).json(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/bots"] }); toast({ title: "Bot started" }); },
  });
  const stopMut = useMutation({
    mutationFn: async (id: string) => (await apiRequest("POST", `/api/bots/${id}/stop`)).json(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/bots"] }); toast({ title: "Bot stopped" }); },
  });
  const runOnceMut = useMutation({
    mutationFn: async (id: string) => (await apiRequest("POST", `/api/bots/${id}/run-once`)).json(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/bots"] }); toast({ title: "Cycle completed" }); },
  });

  // Full-page AI assistant mode
  if (assistMode) {
    return (
      <div className="h-[calc(100vh-48px)]">
        <BotAssistant onClose={() => setAssistMode(false)} onCreate={(data) => createMut.mutate(data)} />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2"><Bot className="w-5 h-5 text-primary" /> Bots</h1>
          <p className="text-sm text-muted-foreground mt-1">Persistent autonomous agents that run continuously</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={async () => {
            try {
              const res = await fetch("/api/bots/create-reflection-bot", { method: "POST", credentials: "include" });
              const bot = await res.json();
              qc.invalidateQueries({ queryKey: ["/api/bots"] });
              toast({ title: bot.name ? `${bot.name} ready` : "Vault Thinker created" });
            } catch { toast({ title: "Failed", variant: "destructive" }); }
          }} className="gap-1.5 text-purple-400 border-purple-500/30 hover:bg-purple-500/10">
            <Zap className="w-4 h-4" /> Vault Thinker
          </Button>
          <Button variant="outline" onClick={() => setAssistMode(true)} className="gap-1.5"><Bot className="w-4 h-4" /> AI Assist</Button>
          <Button onClick={() => { setEditBot(null); setBuilderOpen(true); }} className="gap-1.5"><Plus className="w-4 h-4" /> New Bot</Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : bots.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-xl text-muted-foreground">
          <Bot className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No bots yet</p>
          <p className="text-xs mt-1 mb-4">Create an autonomous agent or use AI Assist to design one</p>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" onClick={() => setAssistMode(true)}><Bot className="w-4 h-4 mr-1" /> AI Assist</Button>
            <Button onClick={() => setBuilderOpen(true)}><Plus className="w-4 h-4 mr-1" /> Manual</Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {bots.map((b) => (
            <div key={b.id} className="border border-border rounded-xl bg-card p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${b.status === "running" ? "bg-emerald-500/15" : "bg-secondary"}`}>
                    <Bot className={`w-4 h-4 ${b.status === "running" ? "text-emerald-400" : "text-muted-foreground"}`} />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-foreground">{b.name}</h3>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Badge variant={b.status === "running" ? "default" : "secondary"} className="text-[10px]">{b.status === "running" ? "Running" : "Stopped"}</Badge>
                      <span className="text-[10px] text-muted-foreground">{b.category}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => { setEditBot(b); setBuilderOpen(true); }} className="p-1 text-muted-foreground hover:text-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => deleteMut.mutate(b.id)} className="p-1 text-muted-foreground hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              {b.description && <p className="text-xs text-muted-foreground">{b.description}</p>}
              <div className="grid grid-cols-3 gap-2 text-[10px] text-muted-foreground">
                <div><Clock className="w-3 h-3 inline mr-0.5" /> {timeAgo(b.last_active_at)}</div>
                <div><Zap className="w-3 h-3 inline mr-0.5" /> {b.total_runs} runs</div>
                <div><Activity className="w-3 h-3 inline mr-0.5" /> {b.total_tokens >= 1000 ? `${(b.total_tokens / 1000).toFixed(1)}K` : b.total_tokens} tok</div>
              </div>
              <div className="flex items-center gap-2 pt-1 border-t border-border">
                {b.status === "running" ? (
                  <Button size="sm" variant="outline" className="flex-1 h-7 text-xs text-red-400" onClick={() => stopMut.mutate(b.id)}><Square className="w-3 h-3 mr-1" /> Stop</Button>
                ) : (
                  <Button size="sm" variant="outline" className="flex-1 h-7 text-xs text-emerald-400" onClick={() => startMut.mutate(b.id)}><Play className="w-3 h-3 mr-1" /> Start</Button>
                )}
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => runOnceMut.mutate(b.id)} disabled={runOnceMut.isPending}>
                  {runOnceMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setLogsOpen(logsOpen === b.id ? null : b.id)}>
                  <Activity className="w-3 h-3" />
                </Button>
              </div>
              {logsOpen === b.id && logs.length > 0 && (
                <div className="border border-border rounded-lg bg-secondary/30 p-2 max-h-48 overflow-y-auto space-y-1">
                  {logs.map((l) => (
                    <div key={l.id} className="text-[10px] flex items-start gap-1.5">
                      <span className="text-muted-foreground/50 flex-shrink-0">{new Date(l.created_at).toLocaleTimeString()}</span>
                      <span className={`font-medium flex-shrink-0 ${LOG_COLORS[l.type] || "text-foreground"}`}>{l.type}</span>
                      <span className="text-muted-foreground truncate">{l.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <BotBuilderDialog open={builderOpen} bot={editBot} onClose={() => { setBuilderOpen(false); setEditBot(null); }}
        onSave={(data) => editBot ? updateMut.mutate({ id: editBot.id, data }) : createMut.mutate(data)} />
    </div>
  );
}
