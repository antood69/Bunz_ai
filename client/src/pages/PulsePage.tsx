/**
 * The Pulse — the soul of Cortal.
 *
 * Not a dashboard of stats. A living conversation with your AI.
 * Shows what happened while you were away, surfaces connections,
 * makes proactive suggestions, and learns your patterns.
 */

import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Sparkles, ArrowRight, Bot, Zap, GitBranch, AlertTriangle,
  CheckCircle2, Brain, Clock, TrendingUp, MessageSquare,
  ChevronRight, Activity, Eye, Loader2, Send, Coffee,
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
  return quotes[Math.floor(Math.random() * quotes.length)];
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

export default function PulsePage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [quickInput, setQuickInput] = useState("");
  const [aiThinking, setAiThinking] = useState(false);
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
    navigate(`/boss`);
    // Store the message so BossPage picks it up
    try { sessionStorage.setItem("bunz-quick-message", msg); } catch {}
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
