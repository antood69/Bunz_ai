import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Bot, Plus, Play, Square, Trash2, Loader2, CheckCircle2,
  Pencil, X, Save, Clock, Activity, Zap, Send, ArrowLeft,
  MessageSquare, Shield, Brain, Sparkles, TrendingUp,
  Mail, Code, PenTool, BarChart3, Users, Eye,
  ChevronDown, ChevronRight, Coins, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
  cycle: "text-muted-foreground", decision: "text-blue-500", action: "text-amber-500",
  result: "text-emerald-500", error: "text-red-500", notify: "text-purple-500",
  memory: "text-cyan-500", lifecycle: "text-primary",
};

// ── Bot Templates ───────────────────────────────────────────────────
const BOT_TEMPLATES = [
  { name: "Content Writer", desc: "Generates blog posts, social media content, and marketing copy on schedule", icon: PenTool, color: "#8b5cf6", category: "content",
    brain: "You are a professional content writer. When triggered, research trending topics in the user's niche and write engaging, SEO-optimized content. Focus on value, clarity, and audience engagement.",
    rules: ["Keep content between 800-2000 words", "Include 3-5 relevant keywords naturally", "End with a call-to-action"] },
  { name: "Research Assistant", desc: "Monitors topics and compiles research reports with key findings", icon: BarChart3, color: "#3b82f6", category: "research",
    brain: "You are a research analyst. Monitor the specified topics, gather data from available sources, and compile concise research briefs with key findings, trends, and actionable insights.",
    rules: ["Cite sources when possible", "Focus on actionable insights", "Flag urgent findings immediately"] },
  { name: "Code Reviewer", desc: "Reviews code changes, suggests improvements, and catches bugs", icon: Code, color: "#10b981", category: "development",
    brain: "You are a senior code reviewer. Analyze code for bugs, security issues, performance problems, and style inconsistencies. Provide specific, actionable feedback with code examples.",
    rules: ["Check for security vulnerabilities first", "Suggest performance optimizations", "Follow project coding standards"] },
  { name: "Email Responder", desc: "Drafts professional email responses based on incoming messages", icon: Mail, color: "#ef4444", category: "communication",
    brain: "You are a professional email assistant. Draft clear, concise, and professional email responses. Match the tone of the original message and ensure all questions are addressed.",
    rules: ["Keep responses under 200 words", "Always be professional and courteous", "Include a clear next step or question"] },
  { name: "Social Media Manager", desc: "Creates and schedules posts across platforms with trending content", icon: Users, color: "#f59e0b", category: "marketing",
    brain: "You are a social media manager. Create engaging posts optimized for each platform (Twitter/X, LinkedIn, Instagram). Research trends, write compelling copy, and suggest optimal posting times.",
    rules: ["Adapt tone for each platform", "Include relevant hashtags", "Focus on engagement-driving content"] },
  { name: "Market Monitor", desc: "Tracks market trends, competitors, and industry news", icon: TrendingUp, color: "#06b6d4", category: "monitoring",
    brain: "You are a market intelligence analyst. Monitor industry trends, competitor activities, and market shifts. Provide timely alerts on significant changes and weekly summary reports.",
    rules: ["Prioritize time-sensitive information", "Compare against historical trends", "Flag competitive threats"] },
  { name: "Daily Briefing", desc: "Morning summary of emails, notifications, tasks, and workflow results", icon: Sparkles, color: "#f97316", category: "monitoring",
    brain: "You are a personal executive assistant. Every cycle, compile a concise morning briefing: 1) Summarize any unread notifications or alerts. 2) List active workflows and their status. 3) Check for any bot errors or completed tasks. 4) Provide a motivational insight or productivity tip. Format as a clean, scannable briefing with sections and bullet points.",
    rules: ["Keep the briefing under 500 words", "Highlight urgent items at the top", "Include a quick win suggestion for the day", "End with today's focus recommendation"] },
  { name: "Email Triager", desc: "Reads inbox, categorizes emails, and drafts smart replies", icon: Mail, color: "#ec4899", category: "communication",
    brain: "You are an email triage specialist. When triggered, check the connected Gmail inbox for unread messages. Categorize each as: Urgent, Action Required, FYI, or Archive. For Action Required emails, draft a professional reply matching the sender's tone. Summarize everything in a concise report.",
    rules: ["Never auto-send replies without approval", "Flag anything from VIPs as urgent", "Group similar emails together", "Keep draft replies under 100 words"] },
  { name: "Competitor Tracker", desc: "Monitors competitor websites and alerts on changes", icon: Eye, color: "#8b5cf6", category: "research",
    brain: "You are a competitive intelligence agent. Research the specified competitor companies. Track their product launches, pricing changes, hiring patterns, and marketing campaigns. Compare against our positioning and flag opportunities or threats.",
    rules: ["Check each competitor weekly", "Score threat level 1-5", "Suggest counter-strategies", "Track pricing changes specifically"] },
  { name: "Learning Coach", desc: "Creates personalized study plans and tracks skill progress", icon: Brain, color: "#14b8a6", category: "general",
    brain: "You are a personalized learning coach. Based on the user's goals and current skill level, create structured learning plans with daily micro-tasks. Track progress, adjust difficulty, and provide encouragement. Recommend resources and practice exercises.",
    rules: ["Break goals into 15-minute daily tasks", "Adjust based on completion rates", "Mix theory with practice", "Celebrate milestones"] },
];

const PERSONALITY_PRESETS = [
  { name: "Professional", desc: "Formal, precise, business-appropriate", prompt: "Maintain a professional, formal tone. Be precise and data-driven. Use industry terminology appropriately." },
  { name: "Casual", desc: "Friendly, approachable, conversational", prompt: "Be friendly and conversational. Use simple language. Add personality while staying helpful." },
  { name: "Aggressive", desc: "Bold, decisive, action-oriented", prompt: "Be bold and decisive. Push for action. Challenge assumptions. Don't sugarcoat findings." },
  { name: "Analytical", desc: "Data-focused, methodical, thorough", prompt: "Focus on data and evidence. Be methodical and thorough. Present findings with supporting analysis." },
];

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
  const [personality, setPersonality] = useState("");

  useEffect(() => {
    if (open) {
      setName(bot?.name || ""); setDesc(bot?.description || "");
      setBrain(bot?.brain_prompt || ""); setModel(bot?.brain_model || "gpt-5.4");
      setCategory(bot?.category || "general");
      setRulesText((bot?.rules || []).join("\n")); setPersonality("");
    }
  }, [bot, open]);

  const applyPersonality = (preset: typeof PERSONALITY_PRESETS[0]) => {
    setPersonality(preset.name);
    setBrain(prev => prev ? `${prev}\n\n${preset.prompt}` : preset.prompt);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Bot className="w-6 h-6 text-primary" />
            {bot ? "Edit Bot" : "Create New Bot"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-5 py-3">
          {/* Basic info */}
          <div>
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Identity</h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Label className="text-xs">Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Content Writer" className="mt-1 h-10" />
              </div>
              <div>
                <Label className="text-xs">Category</Label>
                <select value={category} onChange={(e) => setCategory(e.target.value)}
                  className="w-full mt-1 bg-background border border-border rounded-xl px-2 py-2 text-sm h-10">
                  <option value="general">General</option>
                  <option value="content">Content</option>
                  <option value="research">Research</option>
                  <option value="development">Development</option>
                  <option value="communication">Communication</option>
                  <option value="marketing">Marketing</option>
                  <option value="monitoring">Monitoring</option>
                  <option value="trading">Trading</option>
                </select>
              </div>
            </div>
            <div className="mt-3">
              <Label className="text-xs">Description</Label>
              <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What does this bot do?" className="mt-1" />
            </div>
          </div>

          {/* Personality presets */}
          <div>
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Personality</h3>
            <div className="grid grid-cols-4 gap-2">
              {PERSONALITY_PRESETS.map(p => (
                <button key={p.name} onClick={() => applyPersonality(p)}
                  className={`rounded-xl border p-2.5 text-left transition-all ${
                    personality === p.name ? "border-primary bg-primary/5" : "border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.02]"
                  }`}>
                  <p className="text-[11px] font-semibold text-foreground">{p.name}</p>
                  <p className="text-[9px] text-muted-foreground mt-0.5">{p.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Brain */}
          <div>
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <Brain className="w-3.5 h-3.5" /> Brain (System Prompt)
            </h3>
            <Textarea value={brain} onChange={(e) => setBrain(e.target.value)} rows={6}
              className="resize-y min-h-[120px]"
              placeholder="You are a... Define the bot's expertise, behavior, goals, and constraints." />
          </div>

          {/* Model + Rules */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Model</h3>
              <select value={model} onChange={(e) => setModel(e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm">
                <option value="gpt-5.4-mini">GPT-5.4 Mini (fast, cheap)</option>
                <option value="gpt-5.4">GPT-5.4 (balanced)</option>
                <option value="claude-sonnet-4-6">Claude Sonnet 4.6</option>
                <option value="claude-opus-4-6">Claude Opus 4.6 (powerful)</option>
              </select>
            </div>
            <div>
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5" /> Rules & Guardrails
              </h3>
              <Textarea value={rulesText} onChange={(e) => setRulesText(e.target.value)} rows={4}
                className="resize-y"
                placeholder="One rule per line:&#10;Max 2% drawdown per day&#10;Always cite sources&#10;Never use profanity" />
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} size="lg">Cancel</Button>
          <Button disabled={!name.trim() || !brain.trim()} size="lg" className="px-8" onClick={() => onSave({
            name, description: desc, brainPrompt: brain, brainModel: model, category,
            rules: rulesText.split("\n").filter((r: string) => r.trim()),
          })}><Save className="w-4 h-4 mr-1.5" /> {bot ? "Save Changes" : "Create Bot"}</Button>
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
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06]">
        <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0"><ArrowLeft className="w-4 h-4" /></Button>
        <Bot className="w-5 h-5 text-primary" />
        <div>
          <h2 className="text-sm font-semibold text-foreground">Bot Architect</h2>
          <p className="text-[11px] text-muted-foreground">Describe what you want — I'll design the bot</p>
        </div>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Bot className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm font-medium">What kind of bot do you want?</p>
            <p className="text-xs mt-2 max-w-md mx-auto">Describe your idea and I'll design the brain, rules, and behavior.</p>
            <div className="flex flex-wrap gap-2 justify-center mt-4">
              {["Content pipeline for Fiverr", "GitHub issue monitor", "Daily research digest", "Email auto-responder"].map(s => (
                <button key={s} onClick={() => setInput(s)} className="text-xs px-3 py-1.5 rounded-full border border-white/[0.06] text-muted-foreground hover:text-foreground hover:border-primary/50 transition-all">{s}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${
              m.role === "user" ? "bg-primary text-primary-foreground" : "glass-card text-foreground"
            }`}>{m.content}</div>
          </div>
        ))}
        {loading && <div className="flex justify-start"><div className="glass-card rounded-2xl px-4 py-3 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Thinking...</div></div>}
      </div>
      {botConfig && (
        <div className="mx-4 mb-2 border border-emerald-500/30 bg-emerald-500/10 rounded-xl px-4 py-3 flex items-center justify-between">
          <div>
            <span className="text-sm font-medium text-emerald-500">Bot ready: {botConfig.name}</span>
            <p className="text-[11px] text-muted-foreground mt-0.5">{botConfig.category} · {botConfig.rules?.length || 0} rules</p>
          </div>
          <Button size="sm" className="gap-1" onClick={() => onCreate(botConfig)}><Save className="w-3.5 h-3.5" /> Create Bot</Button>
        </div>
      )}
      <div className="px-4 py-3 border-t border-white/[0.06]">
        <div className="flex items-end gap-2">
          <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            disabled={loading} rows={1} placeholder="Describe your bot..."
            className="flex-1 bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3 text-sm resize-none min-h-[44px] max-h-[120px] focus:outline-none focus:ring-1 focus:ring-primary/50"
            onInput={(e) => { const t = e.currentTarget; t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 120) + "px"; }} />
          <Button className="h-11 w-11 rounded-xl p-0" onClick={send} disabled={loading || !input.trim()}><Send className="w-4 h-4" /></Button>
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
  const [runInputBot, setRunInputBot] = useState<BotDef | null>(null);
  const [runInput, setRunInput] = useState("");
  const [runOutput, setRunOutput] = useState("");
  const [runLoading, setRunLoading] = useState(false);

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

  if (assistMode) {
    return (
      <div className="h-[calc(100vh-48px)]">
        <BotAssistant onClose={() => setAssistMode(false)} onCreate={(data) => createMut.mutate(data)} />
      </div>
    );
  }

  const totalRuns = bots.reduce((s, b) => s + (b.total_runs || 0), 0);
  const totalTokens = bots.reduce((s, b) => s + (b.total_tokens || 0), 0);
  const runningCount = bots.filter(b => b.status === "running").length;

  return (
    <div className="p-3 sm:p-4 page-enter">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground flex items-center gap-2"><Bot className="w-5 h-5 text-primary" /> Bots</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Autonomous AI agents that run continuously</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setAssistMode(true)} className="gap-1.5 text-xs"><Bot className="w-3.5 h-3.5" /> AI Assist</Button>
          <Button size="sm" onClick={() => { setEditBot(null); setBuilderOpen(true); }} className="gap-1.5 text-xs"><Plus className="w-3.5 h-3.5" /> New Bot</Button>
        </div>
      </div>

      {/* Stats */}
      {bots.length > 0 && (
        <div className="grid grid-cols-4 gap-2 mb-3">
          {[
            { label: "Total Bots", value: bots.length, color: "text-blue-400" },
            { label: "Running", value: runningCount, color: "text-emerald-400" },
            { label: "Total Runs", value: totalRuns, color: "text-violet-400" },
            { label: "Tokens Used", value: totalTokens >= 1000 ? `${(totalTokens / 1000).toFixed(1)}K` : totalTokens, color: "text-amber-400" },
          ].map(s => (
            <div key={s.label} className="glass-card rounded-xl px-3 py-2.5">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</span>
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Templates — show when empty */}
      {!isLoading && (
        <div className="mb-4">
          {bots.length === 0 && (
            <div className="glass-card rounded-2xl p-5 mb-3">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Get Started with Templates</h2>
                  <p className="text-[10px] text-muted-foreground">Pick a pre-built bot or create your own from scratch</p>
                </div>
              </div>
            </div>
          )}

          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Templates</h3>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 mb-4">
            {BOT_TEMPLATES.map((tpl) => {
              const Icon = tpl.icon;
              return (
                <button key={tpl.name} onClick={() => createMut.mutate({
                  name: tpl.name, description: tpl.desc, brainPrompt: tpl.brain, brainModel: "gpt-5.4",
                  category: tpl.category, rules: tpl.rules,
                })}
                  className="glass-card rounded-xl p-4 text-left group">
                  <div className="flex items-center gap-2.5 mb-2">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${tpl.color}15` }}>
                      <Icon className="w-4 h-4" style={{ color: tpl.color }} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-foreground group-hover:text-primary transition-colors">{tpl.name}</p>
                      <Badge variant="outline" className="text-[8px] h-3.5 mt-0.5">{tpl.category}</Badge>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground line-clamp-2">{tpl.desc}</p>
                  <p className="text-[9px] text-muted-foreground/50 mt-1.5">{tpl.rules.length} rules</p>
                </button>
              );
            })}
          </div>

        </div>
      )}

      {isLoading && <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}

      {/* Bot Cards */}
      {bots.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
          {bots.map((b) => {
            const isRunning = b.status === "running";
            const showLogs = logsOpen === b.id;
            return (
              <div key={b.id} className="glass-card rounded-2xl overflow-hidden">
                {/* Color accent bar */}
                <div className={`h-1 ${isRunning ? "bg-gradient-to-r from-emerald-500 to-emerald-400" : "bg-gradient-to-r from-white/[0.05] to-white/[0.02]"}`} />

                <div className="p-4">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isRunning ? "bg-emerald-500/15" : "bg-white/[0.04]"}`}>
                        <Bot className={`w-5 h-5 ${isRunning ? "text-emerald-400" : "text-muted-foreground"}`} />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-foreground">{b.name}</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <div className={`w-2 h-2 rounded-full ${isRunning ? "bg-emerald-400 animate-pulse" : "bg-muted-foreground/30"}`} />
                          <span className={`text-[10px] font-medium ${isRunning ? "text-emerald-400" : "text-muted-foreground"}`}>{isRunning ? "Running" : "Stopped"}</span>
                          <Badge variant="outline" className="text-[8px] h-3.5">{b.category}</Badge>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => { setEditBot(b); setBuilderOpen(true); }} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => deleteMut.mutate(b.id)} className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/5"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>

                  {b.description && <p className="text-xs text-muted-foreground mb-3">{b.description}</p>}

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="bg-white/[0.02] rounded-lg px-2.5 py-1.5 text-center">
                      <p className="text-[9px] text-muted-foreground">Last Active</p>
                      <p className="text-[11px] font-semibold text-foreground">{timeAgo(b.last_active_at)}</p>
                    </div>
                    <div className="bg-white/[0.02] rounded-lg px-2.5 py-1.5 text-center">
                      <p className="text-[9px] text-muted-foreground">Runs</p>
                      <p className="text-[11px] font-semibold text-foreground">{b.total_runs}</p>
                    </div>
                    <div className="bg-white/[0.02] rounded-lg px-2.5 py-1.5 text-center">
                      <p className="text-[9px] text-muted-foreground">Tokens</p>
                      <p className="text-[11px] font-semibold text-foreground">{b.total_tokens >= 1000 ? `${(b.total_tokens / 1000).toFixed(1)}K` : b.total_tokens}</p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {isRunning ? (
                      <Button size="sm" variant="outline" className="flex-1 h-8 text-xs text-red-400 border-red-500/20 hover:bg-red-500/5" onClick={() => stopMut.mutate(b.id)}>
                        <Square className="w-3 h-3 mr-1.5" /> Stop
                      </Button>
                    ) : (
                      <Button size="sm" className="flex-1 h-8 text-xs bg-emerald-600 hover:bg-emerald-700 border-0" onClick={() => startMut.mutate(b.id)}>
                        <Play className="w-3 h-3 mr-1.5" /> Start
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => { setRunInputBot(b); setRunInput(""); setRunOutput(""); }} title="Run with input">
                      <MessageSquare className="w-3 h-3" />
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => runOnceMut.mutate(b.id)} disabled={runOnceMut.isPending} title="Auto cycle">
                      {runOnceMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setLogsOpen(showLogs ? null : b.id)} title="Activity log">
                      <Activity className={`w-3 h-3 ${showLogs ? "text-primary" : ""}`} />
                    </Button>
                  </div>
                </div>

                {/* Activity Log */}
                {showLogs && (
                  <div className="border-t border-white/[0.04] bg-white/[0.01] p-3 max-h-52 overflow-y-auto">
                    <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Activity Log</p>
                    {logs.length === 0 ? (
                      <p className="text-[10px] text-muted-foreground/50 text-center py-4">No activity yet — start or run the bot</p>
                    ) : (
                      <div className="space-y-1">
                        {logs.map((l) => (
                          <div key={l.id} className="text-[10px] flex items-start gap-2 py-0.5">
                            <span className="text-muted-foreground/40 flex-shrink-0 w-14">{new Date(l.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                            <span className={`font-semibold flex-shrink-0 w-14 ${LOG_COLORS[l.type] || "text-foreground"}`}>{l.type}</span>
                            <span className="text-muted-foreground">{l.message}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Run with Input Dialog */}
      {runInputBot && (
        <Dialog open onOpenChange={(o) => !o && setRunInputBot(null)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-primary" /> Run: {runInputBot.name}
              </DialogTitle>
            </DialogHeader>
            <div className="py-3 space-y-3">
              <div>
                <Label className="text-xs">Give the bot a task or input</Label>
                <Textarea value={runInput} onChange={(e) => setRunInput(e.target.value)}
                  rows={3} className="mt-1.5 resize-y"
                  placeholder="e.g. Write a blog post about AI automation trends..."
                  autoFocus disabled={runLoading} />
              </div>
              {runOutput && (
                <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/20 p-4 max-h-80 overflow-y-auto">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold text-emerald-400">Output</span>
                    <button className="ml-auto text-[9px] text-muted-foreground hover:text-foreground px-2 py-0.5 rounded border border-white/[0.06]"
                      onClick={() => navigator.clipboard.writeText(runOutput)}>Copy</button>
                  </div>
                  <pre className="text-xs text-foreground whitespace-pre-wrap break-words leading-relaxed">{runOutput}</pre>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRunInputBot(null)}>Close</Button>
              <Button disabled={!runInput.trim() || runLoading} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 border-0"
                onClick={async () => {
                  setRunLoading(true); setRunOutput("");
                  try {
                    const res = await fetch(`/api/bots/${runInputBot.id}/run-with-input`, {
                      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
                      body: JSON.stringify({ input: runInput }),
                    });
                    const data = await res.json();
                    if (data.ok) {
                      setRunOutput(data.output);
                      qc.invalidateQueries({ queryKey: ["/api/bots"] });
                    } else {
                      toast({ title: "Error", description: data.error, variant: "destructive" });
                    }
                  } catch (e: any) {
                    toast({ title: "Error", description: e.message, variant: "destructive" });
                  } finally { setRunLoading(false); }
                }}>
                {runLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                {runLoading ? "Running..." : "Run"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <BotBuilderDialog open={builderOpen} bot={editBot} onClose={() => { setBuilderOpen(false); setEditBot(null); }}
        onSave={(data) => editBot ? updateMut.mutate({ id: editBot.id, data }) : createMut.mutate(data)} />
    </div>
  );
}
