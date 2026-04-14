import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { ArrowLeft, Send, Bot, User } from "lucide-react";
import { Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { Agent, Message } from "@shared/schema";

export default function AgentChatPage() {
  const [, params] = useRoute("/agents/:id/chat");
  const agentId = Number(params?.id);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: agent } = useQuery<Agent>({
    queryKey: [`/api/agents/${agentId}`],
  });

  const { data: messages, isLoading } = useQuery<Message[]>({
    queryKey: [`/api/agents/${agentId}/messages`],
    refetchInterval: 3000,
  });

  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      // POST user message — backend calls Claude and saves assistant reply
      const res = await apiRequest("POST", `/api/agents/${agentId}/messages`, {
        role: "user",
        content,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/agents/${agentId}/messages`] });
      queryClient.invalidateQueries({ queryKey: [`/api/agents/${agentId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      setInput("");
    },
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sendMutation.isPending) return;
    sendMutation.mutate(input.trim());
  };

  const roleColors: Record<string, string> = {
    writer: "bg-blue-500/15 text-blue-400",
    coder: "bg-emerald-500/15 text-emerald-400",
    auditor: "bg-amber-500/15 text-amber-400",
    researcher: "bg-violet-500/15 text-violet-400",
    designer: "bg-pink-500/15 text-pink-400",
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 h-14 border-b border-border flex-shrink-0">
        <Link href="/agents">
          <button data-testid="button-back" className="p-1.5 rounded-md hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" />
          </button>
        </Link>
        {agent && (
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${roleColors[agent.role] || "bg-muted text-muted-foreground"}`}>
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-medium">{agent.name}</h2>
              <p className="text-[11px] text-muted-foreground capitalize">{agent.role} · {agent.model}</p>
            </div>
          </div>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain p-5 space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : !messages?.length ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Bot className="w-10 h-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">Start a conversation with {agent?.name || "this agent"}</p>
            <p className="text-xs text-muted-foreground mt-1">Messages are saved and persist across sessions</p>
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              data-testid={`message-${m.id}`}
              className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}
            >
              {m.role === "assistant" && (
                <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Bot className="w-3.5 h-3.5 text-primary" />
                </div>
              )}
              <div className={`max-w-[70%] rounded-lg px-3.5 py-2.5 text-sm ${
                m.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border border-border"
              }`}>
                <p className="whitespace-pre-wrap">{m.content}</p>
                <p className={`text-[10px] mt-1.5 ${m.role === "user" ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                  {m.createdAt ? new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ""}
                </p>
              </div>
              {m.role === "user" && (
                <div className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0 mt-0.5">
                  <User className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
              )}
            </div>
          ))
        )}
        {sendMutation.isPending && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center flex-shrink-0">
              <Bot className="w-3.5 h-3.5 text-primary" />
            </div>
            <div className="bg-card border border-border rounded-lg px-3.5 py-2.5">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2 px-5 py-3 border-t border-border flex-shrink-0">
        <Input
          data-testid="input-chat-message"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Message ${agent?.name || "agent"}...`}
          className="flex-1 bg-card border-border"
          disabled={sendMutation.isPending}
        />
        <Button
          data-testid="button-send-message"
          type="submit"
          size="icon"
          disabled={!input.trim() || sendMutation.isPending}
        >
          <Send className="w-4 h-4" />
        </Button>
      </form>
    </div>
  );
}
