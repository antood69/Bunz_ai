import { useState, useRef, useEffect, useCallback } from "react";
import { MessageSquare, Send, X, Sparkles, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  type?: "text" | "image";
  imageUrl?: string;
}

interface AIChatPanelProps {
  systemPrompt: string;
  placeholder?: string;
  onSuggestion?: (suggestion: string) => void;
  pageContext?: string;
}

export default function AIChatPanel({ systemPrompt, placeholder, onSuggestion, pageContext }: AIChatPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 100);
  }, [isOpen]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;
    const userMsg: ChatMessage = { id: Date.now().toString(), role: "user", content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await apiRequest("POST", "/api/boss/chat", {
        message: text,
        systemPrompt,
        context: { page: pageContext, timestamp: new Date().toISOString() },
      });
      const data = await res.json();
      const reply = data.reply || data.message || "I couldn't process that.";
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: reply,
        type: data.type || "text",
        imageUrl: data.imageUrl,
      }]);
    } catch {
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: "assistant", content: "Connection error. Please try again." }]);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, systemPrompt, pageContext]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  if (!isOpen) {
    return (
      <>
        {/* Desktop toggle */}
        <button
          onClick={() => setIsOpen(true)}
          className="hidden md:flex fixed right-0 top-1/2 -translate-y-1/2 z-40 items-center gap-1 px-2 py-3 rounded-l-lg bg-primary/15 border border-r-0 border-primary/30 text-primary hover:bg-primary/25 transition-colors"
          title="Open AI Assistant"
        >
          <MessageSquare className="w-4 h-4" />
          <span className="text-xs font-medium [writing-mode:vertical-lr] rotate-180">AI Chat</span>
        </button>
        {/* Mobile toggle removed — AI chat accessible via Boss chat only */}
      </>
    );
  }

  return (
    <>
      {/* Mobile: bottom sheet overlay */}
      <div className="md:hidden fixed inset-0 bg-black/40 z-50" onClick={() => setIsOpen(false)} />

      {/* Panel */}
      <div className="fixed md:right-0 md:top-0 md:bottom-0 md:w-[320px] bottom-0 left-0 right-0 md:left-auto z-50 bg-card border-l border-t md:border-t-0 border-border flex flex-col max-h-[70vh] md:max-h-full shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">AI Assistant</span>
          </div>
          <button onClick={() => setIsOpen(false)} className="p-1 rounded hover:bg-secondary text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
          {messages.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-xs">Ask me anything about this page.</p>
            </div>
          )}
          {messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] px-4 py-3 rounded-lg text-sm ${
                msg.role === "user"
                  ? "bg-primary/15 text-foreground"
                  : "bg-secondary text-foreground"
              }`}>
                {msg.type === "image" && msg.imageUrl ? (
                  <div>
                    <img
                      src={msg.imageUrl}
                      alt={msg.content || "Generated image"}
                      className="rounded-md max-w-full h-auto mb-2"
                      loading="lazy"
                    />
                    <p className="text-xs text-muted-foreground">{msg.content}</p>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                )}
                {msg.role === "assistant" && onSuggestion && msg.type !== "image" && (
                  <button
                    onClick={() => onSuggestion(msg.content)}
                    className="mt-2 flex items-center gap-1 text-xs text-primary hover:text-primary/80"
                  >
                    <ChevronRight className="w-3 h-3" />
                    Apply Suggestion
                  </button>
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-secondary px-3 py-2 rounded-lg">
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "0ms" }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "150ms" }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-3 border-t border-border flex-shrink-0">
          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={placeholder || "Ask AI for help..."}
              className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/50 transition-colors"
              disabled={isLoading}
            />
            <Button type="submit" size="sm" variant="ghost" disabled={!input.trim() || isLoading} className="px-2">
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </div>
      </div>
    </>
  );
}
