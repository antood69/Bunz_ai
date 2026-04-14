import { useState, useRef, useEffect, useCallback } from "react";
import {
  Bot, Send, Plus, MessageSquare, Copy, Check, ChevronLeft, ChevronRight,
  Search, Code2, FileText, BarChart3, ShieldCheck, Palette, Globe,
  Loader2, CheckCircle, AlertCircle, Zap, Square, Layers,
  Paperclip, Download, Image as ImageIcon, X, Brain,
} from "lucide-react";
import IntelligencePicker, { type IntelligenceLevel } from "@/components/IntelligencePicker";
import { useAgentStream, type WorkerStatus } from "@/hooks/useAgentStream";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MessageAttachment {
  id: string;
  name: string;
  url: string;
  thumbnailUrl: string | null;
  mimeType: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  tokenCount?: number;
  /** If this message triggered delegation, the parent jobId */
  jobId?: string;
  /** Workers involved in this delegation (legacy) */
  workers?: Array<{ type: string; task: string }>;
  /** Agent dispatches (new system) */
  agentDispatches?: Array<{ agent: string; task: string }>;
  isDelegating?: boolean;
  attachments?: MessageAttachment[];
  /** For image generation responses */
  type?: "text" | "image";
  imageUrl?: string;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: string;
  /** Server-side conversation UUID */
  serverId?: string;
}

// ─── Worker icon map ──────────────────────────────────────────────────────────

const WORKER_ICONS: Record<string, React.ElementType> = {
  research: Search,
  researcher: Search,
  coder: Code2,
  writer: FileText,
  artist: Palette,
  analyst: BarChart3,
  reviewer: ShieldCheck,
  artgen: Palette,
  art: Palette,
  reasoning: Brain,
  browser: Globe,
  boss: Bot,
};

const WORKER_LABELS: Record<string, string> = {
  research: "Research Dept",
  researcher: "Researcher",
  coder: "Coder Dept",
  writer: "Writer Dept",
  artist: "Artist Dept",
  analyst: "Analyst",
  reviewer: "Reviewer",
  artgen: "Art Gen",
  art: "Art Agent",
  reasoning: "Reasoning",
  browser: "Browser",
  boss: "Boss",
};

// ─── AgentStatusCard ──────────────────────────────────────────────────────────

function AgentStatusCard({ worker }: { worker: WorkerStatus }) {
  const Icon = WORKER_ICONS[worker.type] || Bot;
  const label = WORKER_LABELS[worker.type] || worker.type;

  const statusColors = {
    pending: "text-muted-foreground border-border",
    running: "text-blue-400 border-blue-400/40 bg-blue-400/5",
    complete: "text-green-400 border-green-400/40 bg-green-400/5",
    error: "text-red-400 border-red-400/40 bg-red-400/5",
  };

  const statusLabels = {
    pending: "",
    running: worker.type === "art" ? "Generating..." : "Working...",
    complete: "",
    error: worker.error || "Failed",
  };

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${statusColors[worker.status]}`}>
      <Icon className="w-3.5 h-3.5 flex-shrink-0" />
      <span className="font-medium">{label}</span>
      {worker.status === "running" && <Loader2 className="w-3 h-3 animate-spin" />}
      {worker.status === "complete" && <CheckCircle className="w-3 h-3" />}
      {worker.status === "error" && <AlertCircle className="w-3 h-3" />}
      {statusLabels[worker.status] && (
        <span className="text-[10px] opacity-75">{statusLabels[worker.status]}</span>
      )}
      {worker.tokens ? (
        <span className="ml-auto text-[10px] text-muted-foreground">{worker.tokens.toLocaleString()} tok</span>
      ) : null}
    </div>
  );
}

// ─── WorkflowProgress ─────────────────────────────────────────────────────────

function WorkflowProgress({
  workers,
  isSynthesizing,
  agentImages,
}: {
  workers: WorkerStatus[];
  isSynthesizing: boolean;
  agentImages?: Array<{ agent: string; imageUrl: string; prompt?: string }>;
}) {
  if (workers.length === 0) return null;

  const isDeptDispatch = workers.some(w => ["research", "coder", "artist", "writer"].includes(w.type));
  const pipelineLabel = isDeptDispatch ? "Department Pipeline" : "Agent Pipeline";

  return (
    <div className="space-y-2 p-3 bg-card/50 border border-border rounded-xl">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
        <Zap className="w-3 h-3" />
        <span className="font-medium">{pipelineLabel}</span>
        <span className="ml-auto">
          {workers.filter((w) => w.status === "complete").length}/{workers.length} done
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {workers.map((w, i) => (
          <AgentStatusCard key={`${w.type}-${i}`} worker={w} />
        ))}
      </div>

      {/* Render agent-generated images inline */}
      {agentImages && agentImages.length > 0 && (
        <div className="space-y-2 pt-2">
          {agentImages.map((img, i) => (
            <div key={i} className="relative group">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <Palette className="w-3 h-3" />
                <span>Art Agent generated:</span>
              </div>
              <img
                src={img.imageUrl}
                alt={img.prompt || "Generated image"}
                className="rounded-lg max-w-full h-auto max-h-[400px] border border-border cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => window.open(img.imageUrl, '_blank')}
                loading="lazy"
              />
              <a
                href={img.imageUrl}
                download
                className="absolute top-8 right-2 p-1.5 rounded-lg bg-background/80 backdrop-blur border border-border opacity-0 group-hover:opacity-100 transition-opacity hover:bg-background"
              >
                <Download className="w-4 h-4 text-foreground" />
              </a>
            </div>
          ))}
        </div>
      )}

      {isSynthesizing && (
        <div className="flex items-center gap-2 text-xs text-blue-400 pt-1">
          <Loader2 className="w-3 h-3 animate-spin" />
          Boss is synthesizing results...
        </div>
      )}
    </div>
  );
}

// ─── Streaming status bar ─────────────────────────────────────────────────────

function StreamingStatusBar({
  isStreaming,
  currentStep,
  workerCount,
  totalTokens,
}: {
  isStreaming: boolean;
  currentStep: string;
  workerCount: number;
  totalTokens: number;
}) {
  if (!isStreaming && totalTokens === 0) return null;

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 bg-muted/30 border border-border rounded-lg text-[10px] text-muted-foreground">
      {isStreaming ? (
        <>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Streaming
          </span>
          <span className="truncate max-w-[200px]">{currentStep}</span>
        </>
      ) : (
        <span className="flex items-center gap-1">
          <CheckCircle className="w-3 h-3 text-green-400" />
          Complete
        </span>
      )}
      {workerCount > 0 && <span>{workerCount} workers</span>}
      {totalTokens > 0 && <span className="ml-auto">{totalTokens.toLocaleString()} tokens</span>}
    </div>
  );
}

// ─── Markdown renderer (minimal, no deps) ─────────────────────────────────────

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <div className="relative group my-3 rounded-lg overflow-hidden border border-border">
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/60 border-b border-border">
        <span className="text-[11px] text-muted-foreground font-mono">{lang || "code"}</span>
        <button
          onClick={copy}
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="bg-muted/40 p-3 overflow-x-auto text-sm font-mono text-foreground leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function renderMarkdown(text: string): JSX.Element {
  const parts: JSX.Element[] = [];
  let key = 0;
  const segments = text.split(/(```[\s\S]*?```)/g);

  for (const seg of segments) {
    if (seg.startsWith("```")) {
      const lines = seg.slice(3, -3).split("\n");
      const lang = lines[0].trim();
      const code = lines.slice(lang ? 1 : 0).join("\n").trimEnd();
      parts.push(<CodeBlock key={key++} code={code} lang={lang || undefined} />);
    } else {
      const lines = seg.split("\n");
      let i = 0;
      while (i < lines.length) {
        const line = lines[i];
        if (/^[-*]\s+/.test(line)) {
          const items: string[] = [];
          while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
            items.push(lines[i].replace(/^[-*]\s+/, ""));
            i++;
          }
          parts.push(
            <ul key={key++} className="list-disc list-inside space-y-1 my-2 text-foreground">
              {items.map((item, idx) => (
                <li key={idx} className="text-sm leading-relaxed">{inlineMarkdown(item)}</li>
              ))}
            </ul>
          );
          continue;
        }
        if (/^\d+\.\s+/.test(line)) {
          const items: string[] = [];
          while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
            items.push(lines[i].replace(/^\d+\.\s+/, ""));
            i++;
          }
          parts.push(
            <ol key={key++} className="list-decimal list-inside space-y-1 my-2 text-foreground">
              {items.map((item, idx) => (
                <li key={idx} className="text-sm leading-relaxed">{inlineMarkdown(item)}</li>
              ))}
            </ol>
          );
          continue;
        }
        if (/^#{1,3}\s/.test(line)) {
          const level = line.match(/^(#{1,3})/)?.[1].length || 1;
          const content = line.replace(/^#{1,3}\s+/, "");
          const Tag = level === 1 ? "h2" : level === 2 ? "h3" : "h4";
          const cls = level === 1
            ? "text-base font-semibold text-foreground mt-4 mb-1"
            : level === 2 ? "text-sm font-semibold text-foreground mt-3 mb-1"
            : "text-sm font-medium text-foreground mt-2 mb-1";
          parts.push(<Tag key={key++} className={cls}>{inlineMarkdown(content)}</Tag>);
          i++;
          continue;
        }
        if (/^---+$/.test(line.trim())) {
          parts.push(<hr key={key++} className="border-border my-3" />);
          i++;
          continue;
        }
        // Image markdown: ![alt](url)
        const imgMatch = line.match(/!\[([^\]]*)\]\(([^)]+)\)/);
        if (imgMatch) {
          const [, alt, url] = imgMatch;
          parts.push(
            <div key={key++} className="my-3 group relative inline-block">
              <img src={url} alt={alt} className="max-w-full max-h-[400px] rounded-lg border border-border cursor-pointer hover:opacity-90 transition-opacity" onClick={() => window.open(url, '_blank')} />
              <a href={url} download className="absolute top-2 right-2 p-1.5 rounded-lg bg-background/80 backdrop-blur border border-border opacity-0 group-hover:opacity-100 transition-opacity hover:bg-background">
                <Download className="w-4 h-4 text-foreground" />
              </a>
            </div>
          );
          i++;
          continue;
        }
        // Detect inline /api/files/ URLs (AI-generated images)
        const fileUrlMatch = line.match(/\/api\/files\/([a-f0-9-]+)/);
        if (fileUrlMatch && (line.includes('.png') || line.includes('.jpg') || line.includes('.webp') || line.includes('image'))) {
          const fileUrl = `/api/files/${fileUrlMatch[1]}`;
          parts.push(
            <div key={key++} className="my-3 group relative inline-block">
              <img src={fileUrl} alt="Generated image" className="max-w-full max-h-[400px] rounded-lg border border-border cursor-pointer hover:opacity-90 transition-opacity" onClick={() => window.open(fileUrl, '_blank')} />
              <a href={fileUrl} download className="absolute top-2 right-2 p-1.5 rounded-lg bg-background/80 backdrop-blur border border-border opacity-0 group-hover:opacity-100 transition-opacity hover:bg-background">
                <Download className="w-4 h-4 text-foreground" />
              </a>
            </div>
          );
          i++;
          continue;
        }
        if (line.trim() === "") {
          parts.push(<div key={key++} className="h-2" />);
          i++;
          continue;
        }
        parts.push(
          <p key={key++} className="text-sm leading-relaxed text-foreground">{inlineMarkdown(line)}</p>
        );
        i++;
      }
    }
  }
  return <>{parts}</>;
}

function inlineMarkdown(text: string): (string | JSX.Element)[] {
  const result: (string | JSX.Element)[] = [];
  const pattern = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/g;
  let last = 0;
  let match;
  let key = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) result.push(text.slice(last, match.index));
    if (match[2]) result.push(<strong key={key++} className="font-semibold">{match[2]}</strong>);
    else if (match[3]) result.push(<em key={key++} className="italic">{match[3]}</em>);
    else if (match[4]) result.push(
      <code key={key++} className="bg-muted rounded px-1 py-0.5 font-mono text-xs text-foreground">{match[4]}</code>
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) result.push(text.slice(last));
  return result.length ? result : [text];
}

// ─── Typing indicator ─────────────────────────────────────────────────────────

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-1 py-0.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce"
          style={{ animationDelay: `${i * 120}ms`, animationDuration: "800ms" }}
        />
      ))}
    </div>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({
  msg,
  streamState,
}: {
  msg: Message;
  streamState?: ReturnType<typeof useAgentStream>;
}) {
  const isUser = msg.role === "user";
  const [showTime, setShowTime] = useState(false);
  const timeStr = msg.timestamp instanceof Date
    ? msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const showDelegationUI = msg.isDelegating && streamState;
  const isAgentDispatch = msg.agentDispatches && msg.agentDispatches.length > 0;

  return (
    <div className="space-y-2">
      <div
        className={`flex gap-3 group ${isUser ? "flex-row-reverse" : "flex-row"}`}
        onMouseEnter={() => setShowTime(true)}
        onMouseLeave={() => setShowTime(false)}
      >
        {!isUser && (
          <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Bot className="w-3.5 h-3.5 text-primary" />
          </div>
        )}
        <div
          className={`max-w-[75%] rounded-2xl px-4 py-3 ${
            isUser
              ? "bg-primary/20 border border-primary/30 text-foreground ml-auto"
              : "bg-card border border-border text-foreground w-full max-w-none flex-1"
          }`}
        >
          {isUser ? (
            <>
              {msg.attachments && msg.attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {msg.attachments.map(a => (
                    <div key={a.id} className="relative group">
                      {a.mimeType.startsWith("image/") ? (
                        <img src={a.url} alt={a.name} className="max-w-[200px] max-h-[150px] rounded-lg border border-border cursor-pointer hover:opacity-90" onClick={() => window.open(a.url, '_blank')} />
                      ) : (
                        <div className="flex items-center gap-2 bg-muted/30 rounded-lg px-3 py-2 border border-border">
                          <FileText className="w-4 h-4 text-muted-foreground" />
                          <span className="text-xs truncate max-w-[120px]">{a.name}</span>
                        </div>
                      )}
                      <a href={a.url} download className="absolute top-1 right-1 p-1 rounded bg-background/80 backdrop-blur border border-border opacity-0 group-hover:opacity-100 transition-opacity">
                        <Download className="w-3 h-3 text-foreground" />
                      </a>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
            </>
          ) : msg.type === "image" && msg.imageUrl ? (
            <div>
              <img
                src={msg.imageUrl}
                alt={msg.content || "Generated image"}
                className="rounded-lg max-w-full h-auto max-h-[512px] mb-2"
                loading="lazy"
              />
              <p className="text-xs text-muted-foreground">{msg.content}</p>
            </div>
          ) : (
            <div className="prose-sm">{renderMarkdown(msg.content)}</div>
          )}
          {msg.tokenCount ? (
            <div className="text-[10px] text-muted-foreground mt-1">{msg.tokenCount.toLocaleString()} tokens</div>
          ) : null}
        </div>
        <div
          className={`self-end mb-1 text-[10px] text-muted-foreground transition-opacity duration-150 ${
            showTime ? "opacity-100" : "opacity-0"
          }`}
        >
          {timeStr}
        </div>
      </div>

      {/* Delegation UI: agent/worker cards + streaming progress */}
      {showDelegationUI && streamState && (
        <div className="ml-10 space-y-2">
          <WorkflowProgress
            workers={streamState.workers}
            isSynthesizing={streamState.isSynthesizing}
            agentImages={streamState.agentImages}
          />

          <StreamingStatusBar
            isStreaming={streamState.isStreaming}
            currentStep={streamState.currentStep}
            workerCount={streamState.workers.length}
            totalTokens={streamState.totalTokens}
          />

          {/* Show synthesis output when complete — render images from hidden markers */}
          {streamState.synthesisText && (
            <div className="bg-card border border-border rounded-2xl px-4 py-3">
              <div className="flex items-center gap-2 mb-2 text-xs text-primary">
                <Bot className="w-3.5 h-3.5" />
                <span className="font-medium">Boss — Final Response</span>
              </div>
              <div className="prose-sm">
                {renderMarkdown(streamState.synthesisText.replace(/<!--agent-image:[^>]+-->/g, ""))}
              </div>
              {/* Render any agent-generated images from the synthesis */}
              {streamState.agentImages.length > 0 && streamState.isComplete && (
                <div className="mt-3 space-y-2">
                  {streamState.agentImages.map((img, i) => (
                    <div key={i} className="group relative">
                      <img
                        src={img.imageUrl}
                        alt={img.prompt || "Generated image"}
                        className="rounded-lg max-w-full h-auto max-h-[512px] border border-border"
                        loading="lazy"
                      />
                      <a
                        href={img.imageUrl}
                        download
                        className="absolute top-2 right-2 p-1.5 rounded-lg bg-background/80 backdrop-blur border border-border opacity-0 group-hover:opacity-100 transition-opacity hover:bg-background"
                      >
                        <Download className="w-4 h-4 text-foreground" />
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {streamState.error && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
              <AlertCircle className="w-3.5 h-3.5" />
              {streamState.error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Suggestion chips ─────────────────────────────────────────────────────────

const SUGGESTIONS = [
  "Write a Python script to sort a CSV by date",
  "Generate a logo for a tech startup",
  "Analyze the pros and cons of microservices vs monolith",
  "Research the latest AI tools",
];

// ─── localStorage helpers ─────────────────────────────────────────────────────

const STORAGE_KEY = "boss_conversations";

function loadConversationsFromLocal(): Conversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveConversations(convs: Conversation[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(convs.slice(0, 50)));
  } catch {}
}

function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Fetch conversations + messages from the server and merge with localStorage cache */
async function loadConversationsFromServer(): Promise<Conversation[]> {
  try {
    const res = await fetch("/api/conversations");
    if (!res.ok) return [];
    const serverConvs: Array<{
      id: string;
      title: string;
      model: string | null;
      createdAt: number;
      updatedAt: number;
    }> = await res.json();

    if (!serverConvs.length) return [];

    // Load messages for each conversation (limit to most recent 20)
    const hydrated: Conversation[] = await Promise.all(
      serverConvs.slice(0, 20).map(async (sc) => {
        try {
          const msgRes = await fetch(`/api/conversations/${sc.id}/messages`);
          const rawMsgs: Array<{
            id: string;
            role: string;
            content: string;
            tokenCount: number | null;
            model: string | null;
            createdAt: number;
          }> = msgRes.ok ? await msgRes.json() : [];

          const messages: Message[] = rawMsgs
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({
              id: m.id,
              role: m.role as "user" | "assistant",
              content: m.content,
              timestamp: new Date(m.createdAt),
              tokenCount: m.tokenCount ?? undefined,
            }));

          return {
            id: sc.id,
            title: sc.title || "New conversation",
            messages,
            createdAt: new Date(sc.createdAt).toISOString(),
            serverId: sc.id,
          };
        } catch {
          return {
            id: sc.id,
            title: sc.title || "New conversation",
            messages: [],
            createdAt: new Date(sc.createdAt).toISOString(),
            serverId: sc.id,
          };
        }
      })
    );

    return hydrated.filter((c) => c.messages.length > 0);
  } catch {
    return [];
  }
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function BossPage() {
  const [conversations, setConversations] = useState<Conversation[]>(() => loadConversationsFromLocal());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState<IntelligenceLevel>("medium");
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [serverConvId, setServerConvId] = useState<string | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<{ id: string; name: string; url: string; thumbnailUrl: string | null; mimeType: string }[]>([]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // On mount: fetch conversation history from server and merge with localStorage
  useEffect(() => {
    loadConversationsFromServer().then((serverConvs) => {
      if (serverConvs.length === 0) return;
      setConversations((prev) => {
        // Merge: server conversations take precedence over local ones with same serverId
        const merged = [...serverConvs];
        // Add local-only conversations (no serverId or serverId not in server list)
        const serverIds = new Set(serverConvs.map(c => c.serverId));
        for (const local of prev) {
          if (!local.serverId || !serverIds.has(local.serverId)) {
            merged.push(local);
          }
        }
        // Sort by most recent first
        merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        saveConversations(merged);
        return merged;
      });
    });
  }, []);

  // Agent stream hook
  const streamState = useAgentStream(activeJobId);

  // When stream completes, add synthesis as a message
  useEffect(() => {
    if (streamState.isComplete && streamState.synthesisText && activeJobId) {
      const synthesisMsg: Message = {
        id: genId(),
        role: "assistant",
        content: streamState.synthesisText,
        timestamp: new Date(),
        tokenCount: streamState.totalTokens,
      };
      setMessages((prev) => [...prev, synthesisMsg]);
      setActiveJobId(null);
      setIsLoading(false);
    }
  }, [streamState.isComplete, streamState.synthesisText, activeJobId, streamState.totalTokens]);

  // Handle stream errors
  useEffect(() => {
    if (streamState.error && activeJobId) {
      setError(streamState.error);
      setIsLoading(false);
    }
  }, [streamState.error, activeJobId]);

  // Detect mobile
  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) setSidebarOpen(false);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading, streamState.text, streamState.synthesisText]);

  // Sync messages to conversations
  useEffect(() => {
    if (!activeId || messages.length === 0) return;
    setConversations((prev) => {
      const updated = prev.map((c) =>
        c.id === activeId ? { ...c, messages } : c
      );
      if (!updated.find((c) => c.id === activeId)) {
        const title = messages[0]?.content?.slice(0, 50) || "New conversation";
        const newConv: Conversation = { id: activeId, title, messages, createdAt: new Date().toISOString() };
        const withNew = [newConv, ...prev];
        saveConversations(withNew);
        return withNew;
      }
      saveConversations(updated);
      return updated;
    });
  }, [messages, activeId]);

  // Auto-grow textarea
  const adjustTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 24 * 6 + 16) + "px";
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    adjustTextarea();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append("file", file);
      if (serverConvId) formData.append("conversationId", serverConvId);
      try {
        const res = await fetch("/api/chat/upload", { method: "POST", body: formData });
        if (res.ok) {
          const data = await res.json();
          setAttachedFiles(prev => [...prev, {
            id: data.id,
            name: data.originalName,
            url: data.url,
            thumbnailUrl: data.thumbnailUrl,
            mimeType: data.mimeType,
          }]);
        }
      } catch (_) {}
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeAttachment = (id: string) => {
    setAttachedFiles(prev => prev.filter(f => f.id !== id));
  };

  const startNewChat = () => {
    setActiveId(null);
    setMessages([]);
    setInput("");
    setError(null);
    setActiveJobId(null);
    setServerConvId(null);
    if (isMobile) setSidebarOpen(false);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const loadConversation = (conv: Conversation) => {
    setActiveId(conv.id);
    setMessages(conv.messages.map((m) => ({ ...m, timestamp: new Date(m.timestamp) })));
    setError(null);
    setActiveJobId(null);
    setServerConvId(conv.serverId || null);
    if (isMobile) setSidebarOpen(false);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  // Check for running jobs on page load / conversation switch
  useEffect(() => {
    if (!serverConvId) return;
    fetch(`/api/jobs?conversationId=${serverConvId}&status=running`)
      .then((r) => r.json())
      .then((jobs) => {
        if (Array.isArray(jobs) && jobs.length > 0) {
          const parentJob = jobs.find((j: any) => j.type === "boss") || jobs[0];
          setActiveJobId(parentJob.id);
          setIsLoading(true);
        }
      })
      .catch(() => {});
  }, [serverConvId]);

  const sendMessage = async (text: string) => {
    if ((!text.trim() && attachedFiles.length === 0) || isLoading) return;

    const trimmed = text.trim();
    setInput("");
    setError(null);

    let convId = activeId;
    if (!convId) {
      convId = genId();
      setActiveId(convId);
      const newConv: Conversation = {
        id: convId,
        title: trimmed.slice(0, 50),
        messages: [],
        createdAt: new Date().toISOString(),
      };
      setConversations((prev) => {
        const updated = [newConv, ...prev];
        saveConversations(updated);
        return updated;
      });
    }

    if (textareaRef.current) textareaRef.current.style.height = "auto";

    // Capture and clear attached files
    const currentAttachments = attachedFiles.length > 0 ? [...attachedFiles] : undefined;
    setAttachedFiles([]);

    const userMsg: Message = {
      id: genId(),
      role: "user",
      content: trimmed || (currentAttachments ? `[Attached ${currentAttachments.length} file(s)]` : ""),
      attachments: currentAttachments,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch("/api/boss/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          conversationId: serverConvId || undefined,
          history,
          level: selectedLevel,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server error ${res.status}`);
      }

      const data = await res.json();
      setServerConvId(data.conversationId);

      // Update local conversation with serverId
      setConversations((prev) =>
        prev.map((c) => c.id === convId ? { ...c, serverId: data.conversationId } : c)
      );

      // Prepend tier info if auto routing was used
      const tierPrefix = data.tierInfo
        ? `*[Auto: ${data.tierInfo.label} tier — ${data.tierInfo.reason}]*\n\n`
        : "";

      if (data.isDelegating) {
        const planMsg: Message = {
          id: genId(),
          role: "assistant",
          content: data.reply,
          timestamp: new Date(),
          jobId: data.jobId,
          agentDispatches: data.departments?.map((d: any) => ({ agent: d.id, task: d.task })),
          isDelegating: true,
          tokenCount: data.tokenCount,
        };
        setMessages((prev) => [...prev, planMsg]);
        setActiveJobId(data.jobId);
        // isLoading stays true until stream completes
      } else {
        // Direct answer
        const assistantMsg: Message = {
          id: genId(),
          role: "assistant",
          content: data.reply,
          timestamp: new Date(),
          tokenCount: data.tokenCount,
          type: data.type || "text",
          imageUrl: data.imageUrl,
        };
        setMessages((prev) => [...prev, assistantMsg]);
        setIsLoading(false);
      }
    } catch (err: any) {
      const errMsg: Message = {
        id: genId(),
        role: "assistant",
        content: `Something went wrong: ${err.message || "Unknown error"}. Try again.`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errMsg]);
      setError(err.message);
      setIsLoading(false);
    } finally {
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  };

  // ── Kill switch: cancel all running jobs ──
  const cancelJobs = async () => {
    if (!serverConvId) return;
    try {
      await fetch("/api/jobs/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: serverConvId }),
      });
      setActiveJobId(null);
      setIsLoading(false);
      setError(null);
      const cancelMsg: Message = {
        id: genId(),
        role: "assistant",
        content: "Cancelled all running jobs.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, cancelMsg]);
    } catch (err: any) {
      setError("Failed to cancel: " + (err.message || "unknown"));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const isEmpty = messages.length === 0;
  const charCount = input.length;

  return (
    <div className="flex h-full overflow-hidden bg-background">
      {/* ── Sidebar ────────────────────────────────────────────────────────── */}
      <div
        className={`flex-shrink-0 border-r border-border bg-sidebar flex flex-col transition-all duration-200 ${
          sidebarOpen ? "w-56" : "w-0"
        } overflow-hidden`}
      >
        <div className="p-3 border-b border-border">
          <button
            onClick={startNewChat}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4 flex-shrink-0" />
            New Chat
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto overscroll-contain px-2 py-2 space-y-0.5">
          {conversations.length === 0 ? (
            <p className="text-[11px] text-muted-foreground px-3 py-2">No conversations yet.</p>
          ) : (
            conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => loadConversation(conv)}
                className={`w-full flex items-start gap-2 px-3 py-2 rounded-md text-left text-sm transition-colors ${
                  activeId === conv.id
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 opacity-60" />
                <span className="truncate text-xs leading-relaxed">{conv.title}</span>
              </button>
            ))
          )}
        </nav>
      </div>

      {/* Sidebar toggle */}
      <div className="flex-shrink-0 flex items-center">
        <button
          onClick={() => setSidebarOpen((v) => !v)}
          className="w-4 h-10 flex items-center justify-center bg-border hover:bg-primary/20 text-muted-foreground hover:text-primary rounded-r transition-colors self-center"
        >
          {sidebarOpen ? <ChevronLeft className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </button>
      </div>

      {/* ── Main chat area ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {isEmpty ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 overflow-y-auto">
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center shadow-lg shadow-primary/10">
                <Bot className="w-8 h-8 text-primary" />
              </div>
              <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-green-500 border-2 border-background" />
            </div>
            <div className="text-center space-y-2">
              <h1 className="text-2xl font-bold text-foreground tracking-tight">Hey, I'm The Boss.</h1>
              <p className="text-muted-foreground text-sm">What are we building today?</p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center max-w-lg">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="px-4 py-2 rounded-xl bg-card border border-border text-sm text-foreground hover:border-primary/50 hover:bg-primary/5 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto overscroll-contain px-4 md:px-8 py-6 space-y-2">
            <div className="max-w-5xl mx-auto space-y-2">
              {messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  msg={msg}
                  streamState={msg.jobId === activeJobId ? streamState : undefined}
                />
              ))}
              {isLoading && !activeJobId && (
                <div className="flex gap-3">
                  <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Bot className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <div className="bg-card border border-border rounded-2xl px-4 py-3">
                    <TypingDots />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>
        )}

        {/* ── Input area ── */}
        <div className="border-t border-border bg-background px-4 md:px-8 py-4">
          <div className="max-w-5xl mx-auto">
            {/* Attached files preview */}
            {attachedFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {attachedFiles.map(f => (
                  <div key={f.id} className="relative group flex items-center gap-2 bg-muted/50 border border-border rounded-lg px-3 py-1.5">
                    {f.mimeType.startsWith("image/") ? (
                      <img src={f.url} alt={f.name} className="w-8 h-8 rounded object-cover" />
                    ) : (
                      <FileText className="w-4 h-4 text-muted-foreground" />
                    )}
                    <span className="text-xs text-foreground truncate max-w-[120px]">{f.name}</span>
                    <button
                      onClick={() => removeAttachment(f.id)}
                      className="w-4 h-4 rounded-full bg-destructive/80 text-white flex items-center justify-center hover:bg-destructive transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-end gap-3 bg-card border border-border rounded-xl px-4 py-3 shadow-sm focus-within:border-primary/50 transition-colors">
              {/* File upload button */}
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                multiple
                accept="image/*,.pdf,.txt,.md,.js,.ts,.py,.html,.css,.json,.csv"
                onChange={handleFileUpload}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                title="Attach file"
                disabled={isLoading}
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Message The Boss..."
                rows={1}
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none leading-6 min-h-[24px] max-h-[144px]"
                disabled={isLoading}
              />
              {isLoading ? (
                <button
                  onClick={cancelJobs}
                  className="flex-shrink-0 w-8 h-8 rounded-lg bg-destructive flex items-center justify-center text-destructive-foreground hover:bg-destructive/90 transition-colors"
                  title="Stop all running jobs"
                >
                  <Square className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim() && attachedFiles.length === 0 || isLoading}
                  className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground disabled:opacity-30 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="flex items-center justify-between mt-1.5 px-1">
              <p className="text-[10px] text-muted-foreground">Enter to send &middot; Shift+Enter for newline</p>
              <div className="flex items-center gap-2">
                <IntelligencePicker value={selectedLevel} onChange={setSelectedLevel} compact />
                {charCount > 0 && (
                  <p className={`text-[10px] ${charCount > 2000 ? "text-destructive" : "text-muted-foreground"}`}>
                    {charCount.toLocaleString()}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
