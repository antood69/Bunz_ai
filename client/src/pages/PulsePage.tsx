/**
 * The Pulse — the soul of Cortal.
 *
 * Not a dashboard of stats. A living conversation with your AI.
 * Shows what happened while you were away, surfaces connections,
 * makes proactive suggestions, and learns your patterns.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Sparkles, Bot, Zap, GitBranch, AlertTriangle,
  CheckCircle2, Brain, Clock, TrendingUp, MessageSquare,
  ChevronRight, Activity, Eye, Loader2, Send, Coffee,
  Search, FileText, BarChart3, Layout, CheckSquare, Play, ArrowRight,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";

interface PulseItem {
  id: string;
  type: "greeting" | "insight" | "alert" | "suggestion" | "stat" | "memory" | "accomplishment";
  icon: string;
  title: string;
  content: string;
  action?: { label: string; href: string };
  timestamp?: number;
}

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return "Burning the midnight oil";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Night owl mode";
}

function getMotivation(): string {
  const quotes = [
    "What should we build today?",
    "I've been thinking about your projects overnight.",
    "Ready when you are. What's the mission?",
    "Your AI workforce is standing by.",
    "Let's make something happen.",
    "I remembered something interesting from last week...",
    "Your agents handled things while you were away.",
    "The best time to automate was yesterday. The second best is now.",
  ];
  // Change every 30 minutes instead of every render
  const halfHourSlot = Math.floor(Date.now() / (30 * 60 * 1000));
  return quotes[halfHourSlot % quotes.length];
}

const ICON_MAP: Record<string, any> = {
  sparkles: Sparkles, bot: Bot, zap: Zap, git: GitBranch,
  alert: AlertTriangle, check: CheckCircle2, brain: Brain,
  clock: Clock, trend: TrendingUp, chat: MessageSquare,
  activity: Activity, eye: Eye, coffee: Coffee,
};

function PulseCard({ item, index }: { item: PulseItem; index: number }) {
  const [, navigate] = useLocation();
  const Icon = ICON_MAP[item.icon] || Sparkles;

  const typeStyles: Record<string, string> = {
    greeting: "border-primary/20 bg-primary/[0.03]",
    insight: "border-violet-500/20 bg-violet-500/[0.03]",
    alert: "border-amber-500/20 bg-amber-500/[0.03]",
    suggestion: "border-blue-500/20 bg-blue-500/[0.03]",
    stat: "border-emerald-500/20 bg-emerald-500/[0.03]",
    memory: "border-pink-500/20 bg-pink-500/[0.03]",
    accomplishment: "border-emerald-500/20 bg-emerald-500/[0.03]",
  };

  const iconColors: Record<string, string> = {
    greeting: "text-primary", insight: "text-violet-400", alert: "text-amber-400",
    suggestion: "text-blue-400", stat: "text-emerald-400", memory: "text-pink-400",
    accomplishment: "text-emerald-400",
  };

  return (
    <div
      className={`rounded-2xl border p-4 transition-all hover:shadow-lg hover:shadow-black/10 cursor-default ${typeStyles[item.type] || "border-border/30 bg-card/30"}`}
      style={{ animationDelay: `${index * 80}ms`, animation: "fadeSlideUp 0.4s ease-out forwards", opacity: 0 }}
    >
      <div className="flex items-start gap-3">
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${iconColors[item.type] || "text-muted-foreground"} bg-white/[0.05]`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">{item.title}</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{item.content}</p>
          {item.action && (
            <button
              onClick={() => navigate(item.action!.href)}
              className="flex items-center gap-1 mt-2 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
            >
              {item.action.label}
              <ChevronRight className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const TEMPLATE_ICONS: Record<string, typeof Search> = {
  search: Search, "file-text": FileText, "bar-chart": BarChart3,
  layout: Layout, "check-square": CheckSquare, "git-branch": GitBranch,
};

interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  variables: Array<{ key: string; label: string; placeholder?: string }>;
  steps: Array<{ department: string; label: string; prompt: string }>;
  use_count: number;
  avg_tokens: number;
}

function WorkflowTemplatesSection({ navigate }: { navigate: (path: string) => void }) {
  const [selected, setSelected] = useState<WorkflowTemplate | null>(null);
  const [vars, setVars] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);

  const { data: templates = [] } = useQuery<WorkflowTemplate[]>({
    queryKey: ["/api/workflow-templates"],
    staleTime: 60000,
  });

  const run = async () => {
    if (!selected) return;
    setRunning(true);
    try {
      const r = await fetch(`/api/workflow-templates/${selected.id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ variables: vars, level: "medium" }),
      });
      const data = await r.json();
      if (data.jobId) {
        try { sessionStorage.setItem("cortal-active-job", data.jobId); } catch {}
        try { sessionStorage.setItem("bunz-active-conv", data.conversationId); } catch {}
      }
      setSelected(null);
      setVars({});
      navigate("/boss");
    } catch {
      setRunning(false);
    }
  };

  if (templates.length === 0) return null;

  return (
    <div className="w-full mb-6">
      <div className="flex items-center gap-2 mb-3">
        <GitBranch className="w-3.5 h-3.5 text-primary" />
        <span className="text-xs font-semibold text-foreground">Workflow Templates</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {templates.slice(0, 6).map(t => {
          const Icon = TEMPLATE_ICONS[t.icon] || Zap;
          return (
            <button
              key={t.id}
              onClick={() => { setSelected(t); setVars({}); }}
              className="flex flex-col gap-1.5 p-3 rounded-xl border border-border/50 bg-card/50 hover:bg-card hover:border-primary/30 transition-all text-left group"
            >
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Icon className="w-3 h-3 text-primary" />
                </div>
                <span className="text-[11px] font-medium text-foreground truncate">{t.name}</span>
              </div>
              <p className="text-[10px] text-muted-foreground/70 line-clamp-2 leading-relaxed">{t.description}</p>
              <div className="flex items-center gap-2 mt-auto">
                <span className="text-[9px] text-muted-foreground/50">{t.steps.length} steps</span>
                {t.use_count > 0 && <span className="text-[9px] text-muted-foreground/50">{t.use_count} runs</span>}
              </div>
            </button>
          );
        })}
      </div>

      {/* Run dialog */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => !running && setSelected(null)}>
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md mx-4 p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
                {(() => { const Icon = TEMPLATE_ICONS[selected.icon] || Zap; return <Icon className="w-5 h-5 text-primary" />; })()}
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">{selected.name}</h3>
                <p className="text-[11px] text-muted-foreground">{selected.steps.length} steps</p>
              </div>
            </div>

            {/* Steps preview */}
            <div className="space-y-1">
              {selected.steps.map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="w-4 h-4 rounded-full bg-secondary flex items-center justify-center text-[9px] font-medium flex-shrink-0">{i + 1}</span>
                  <span className="text-foreground font-medium">{s.label || s.department}</span>
                  <ArrowRight className="w-2.5 h-2.5 opacity-40" />
                  <span className="truncate">{s.department}</span>
                </div>
              ))}
            </div>

            {/* Variable inputs */}
            {selected.variables.length > 0 && (
              <div className="space-y-2.5">
                {selected.variables.map(v => (
                  <div key={v.key}>
                    <label className="text-[11px] font-medium text-foreground mb-1 block">{v.label}</label>
                    <textarea
                      value={vars[v.key] || ""}
                      onChange={e => setVars(prev => ({ ...prev, [v.key]: e.target.value }))}
                      placeholder={v.placeholder}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 resize-none"
                      rows={v.key === "notes" ? 5 : 2}
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setSelected(null)}
                disabled={running}
                className="flex-1 px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-secondary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={run}
                disabled={running || selected.variables.some(v => !vars[v.key]?.trim())}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-40 transition-colors"
              >
                {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                {running ? "Running..." : "Run"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PulsePage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [quickInput, setQuickInput] = useState("");
  const displayName = user?.displayName || user?.email?.split("@")[0] || "there";

  // Fetch pulse data from server
  const { data: pulseData, isLoading } = useQuery<{
    items: PulseItem[];
    stats: { totalConversations: number; totalWorkflows: number; totalBots: number; tokensToday: number; memoryCount: number };
  }>({
    queryKey: ["/api/pulse"],
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const items = pulseData?.items || [];
  const stats = pulseData?.stats;

  // Quick action — send to Boss chat
  const handleQuickSend = async () => {
    if (!quickInput.trim()) return;
    const msg = quickInput.trim();
    setQuickInput("");
    // Store message FIRST, then navigate
    try { sessionStorage.setItem("bunz-quick-message", msg); } catch {}
    navigate("/boss");
  };

  return (
    <div className="flex flex-col items-center px-4 py-8 page-enter max-w-3xl mx-auto">

      {/* Breathing logo */}
      <div className="relative mb-6">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center shadow-lg shadow-blue-500/20"
          style={{ animation: "breathe 4s ease-in-out infinite" }}>
          <span className="text-white font-bold text-2xl">C</span>
        </div>
        <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-400 border-2 border-background"
          style={{ animation: "pulse 2s ease-in-out infinite" }} />
      </div>

      {/* Greeting */}
      <h1 className="text-2xl font-bold text-foreground text-center">
        {getTimeGreeting()}, {displayName}
      </h1>
      <p className="text-sm text-muted-foreground mt-2 text-center max-w-md">
        {getMotivation()}
      </p>

      {/* Quick stats ribbon */}
      {stats && (
        <div className="flex items-center gap-4 mt-5 mb-6">
          {[
            { label: "Conversations", value: stats.totalConversations, icon: MessageSquare },
            { label: "Workflows", value: stats.totalWorkflows, icon: GitBranch },
            { label: "Bots", value: stats.totalBots, icon: Bot },
            { label: "Memories", value: stats.memoryCount, icon: Brain },
          ].map(s => (
            <div key={s.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <s.icon className="w-3 h-3" />
              <span className="font-medium text-foreground">{s.value}</span>
              <span>{s.label.toLowerCase()}</span>
            </div>
          ))}
        </div>
      )}

      {/* Quick command input */}
      <div className="w-full max-w-xl mb-8">
        <div className="flex items-center gap-2 bg-card border border-border/50 rounded-2xl px-4 py-3 shadow-sm focus-within:border-primary/50 focus-within:shadow-md transition-all">
          <Sparkles className="w-4 h-4 text-primary/50 flex-shrink-0" />
          <input
            value={quickInput}
            onChange={(e) => setQuickInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleQuickSend(); }}
            placeholder="Ask anything, run a command, or describe what you need..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 outline-none"
          />
          {quickInput.trim() && (
            <button
              onClick={handleQuickSend}
              className="flex-shrink-0 w-8 h-8 rounded-xl bg-primary flex items-center justify-center text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center justify-center gap-3 mt-2">
          {[
            { label: "/research", desc: "Deep research" },
            { label: "/build", desc: "Build a project" },
            { label: "/swarm", desc: "Agent swarm" },
            { label: "/chart", desc: "Data viz" },
          ].map(cmd => (
            <button
              key={cmd.label}
              onClick={() => { setQuickInput(cmd.label + " "); }}
              className="text-[10px] text-muted-foreground/60 hover:text-primary px-2 py-1 rounded-lg hover:bg-primary/5 transition-colors"
              title={cmd.desc}
            >
              {cmd.label}
            </button>
          ))}
        </div>
      </div>

      {/* Workflow Templates */}
      <WorkflowTemplatesSection navigate={navigate} />

      {/* Pulse cards */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-8">
          <Loader2 className="w-4 h-4 animate-spin" />
          Gathering your pulse...
        </div>
      ) : items.length > 0 ? (
        <div className="w-full space-y-3">
          {items.map((item, i) => (
            <PulseCard key={item.id} item={item} index={i} />
          ))}
        </div>
      ) : (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground">
            Your Pulse will fill up as you use Cortal.
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Start a conversation, create a workflow, or deploy a bot.
          </p>
        </div>
      )}

      {/* CSS Animations */}
      <style>{`
        @keyframes breathe {
          0%, 100% { transform: scale(1); box-shadow: 0 8px 30px rgba(59,130,246,0.15); }
          50% { transform: scale(1.05); box-shadow: 0 12px 40px rgba(59,130,246,0.25); }
        }
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
