import { useState, useEffect, useRef, useCallback } from "react";
import { Search, MessageSquare, GitBranch, Bot, FileText, X, ArrowRight } from "lucide-react";
import { useLocation } from "wouter";

interface SearchResult {
  type: "conversation" | "workflow" | "bot" | "page";
  id: string;
  title: string;
  subtitle?: string;
  href: string;
}

const PAGES: SearchResult[] = [
  { type: "page", id: "dashboard", title: "Dashboard", subtitle: "Overview and stats", href: "/" },
  { type: "page", id: "chat", title: "Chat", subtitle: "Talk to Boss AI", href: "/boss" },
  { type: "page", id: "editor", title: "Editor", subtitle: "Code editor", href: "/editor" },
  { type: "page", id: "tasks", title: "Tasks", subtitle: "Task manager", href: "/tasks" },
  { type: "page", id: "workflows", title: "Workflows", subtitle: "Automation pipelines", href: "/workflows" },
  { type: "page", id: "bots", title: "Bots", subtitle: "Autonomous agents", href: "/bots" },
  { type: "page", id: "wallet", title: "Wallet", subtitle: "Stripe balance", href: "/wallet" },
  { type: "page", id: "workshop", title: "Workshop", subtitle: "Community marketplace", href: "/workshop" },
  { type: "page", id: "plugins", title: "Plugins", subtitle: "Skills & connectors", href: "/plugins" },
  { type: "page", id: "settings", title: "Settings", subtitle: "Preferences & account", href: "/settings" },
];

const ICONS: Record<string, React.ElementType> = {
  conversation: MessageSquare, workflow: GitBranch, bot: Bot, page: FileText,
};

export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const [, navigate] = useLocation();

  // Ctrl+K to open
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
        setQuery("");
        setResults([]);
        setSelected(0);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 50); }, [open]);

  // Search
  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    const lower = q.toLowerCase();

    // Search pages
    const pageResults = PAGES.filter(p => p.title.toLowerCase().includes(lower) || p.subtitle?.toLowerCase().includes(lower));

    // Search API
    let apiResults: SearchResult[] = [];
    try {
      const [convRes, pipeRes, botRes] = await Promise.all([
        fetch("/api/conversations", { credentials: "include" }).then(r => r.ok ? r.json() : []),
        fetch("/api/pipelines", { credentials: "include" }).then(r => r.ok ? r.json() : []),
        fetch("/api/bots", { credentials: "include" }).then(r => r.ok ? r.json() : []),
      ]);

      apiResults = [
        ...(convRes || []).filter((c: any) => c.title?.toLowerCase().includes(lower) || c.lastMessage?.toLowerCase().includes(lower))
          .slice(0, 5).map((c: any) => ({ type: "conversation" as const, id: c.id, title: c.title || "Chat", subtitle: c.lastMessage?.slice(0, 60), href: `/boss` })),
        ...(pipeRes || []).filter((p: any) => p.name?.toLowerCase().includes(lower) || p.description?.toLowerCase().includes(lower))
          .slice(0, 5).map((p: any) => ({ type: "workflow" as const, id: p.id, title: p.name, subtitle: p.description?.slice(0, 60), href: `/workflows` })),
        ...(botRes || []).filter((b: any) => b.name?.toLowerCase().includes(lower) || b.description?.toLowerCase().includes(lower))
          .slice(0, 5).map((b: any) => ({ type: "bot" as const, id: b.id, title: b.name, subtitle: b.description?.slice(0, 60), href: `/bots` })),
      ];
    } catch {}

    setResults([...pageResults, ...apiResults]);
    setSelected(0);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => search(query), 200);
    return () => clearTimeout(timer);
  }, [query, search]);

  const go = (result: SearchResult) => {
    navigate(result.href);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelected(s => Math.min(s + 1, results.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
    if (e.key === "Enter" && results[selected]) { go(results[selected]); }
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="fixed top-[15%] left-1/2 -translate-x-1/2 w-[520px] z-[301] glass-card rounded-2xl shadow-2xl overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06]">
          <Search className="w-5 h-5 text-muted-foreground flex-shrink-0" />
          <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={handleKeyDown}
            placeholder="Search pages, conversations, workflows, bots..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none" />
          <kbd className="text-[9px] text-muted-foreground bg-white/[0.05] px-1.5 py-0.5 rounded border border-white/[0.08]">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-[360px] overflow-y-auto p-2">
          {results.length === 0 && query && (
            <p className="text-xs text-muted-foreground text-center py-8">No results for "{query}"</p>
          )}
          {results.length === 0 && !query && (
            <p className="text-xs text-muted-foreground text-center py-8">Start typing to search...</p>
          )}
          {results.map((r, i) => {
            const Icon = ICONS[r.type] || FileText;
            return (
              <button key={`${r.type}-${r.id}`} onClick={() => go(r)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
                  i === selected ? "bg-primary/10 text-primary" : "text-foreground hover:bg-white/[0.04]"
                }`}>
                <Icon className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{r.title}</p>
                  {r.subtitle && <p className="text-[10px] text-muted-foreground truncate">{r.subtitle}</p>}
                </div>
                <span className="text-[8px] text-muted-foreground uppercase">{r.type}</span>
                <ArrowRight className="w-3 h-3 text-muted-foreground/30" />
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-4 py-2 border-t border-white/[0.06] text-[9px] text-muted-foreground/50">
          <span><kbd className="bg-white/[0.05] px-1 rounded">↑↓</kbd> navigate</span>
          <span><kbd className="bg-white/[0.05] px-1 rounded">↵</kbd> open</span>
          <span><kbd className="bg-white/[0.05] px-1 rounded">esc</kbd> close</span>
        </div>
      </div>
    </>
  );
}
