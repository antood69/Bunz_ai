import { useState, useRef, useEffect, useCallback } from "react";
import {
  Bot, Send, Plus, MessageSquare, Copy, Check, ChevronLeft, ChevronRight,
  Search, Code2, FileText, BarChart3, ShieldCheck, Palette, Globe,
  Loader2, CheckCircle, AlertCircle, Zap, Square,
  Paperclip, Download, X, Brain, Mic, MicOff, Volume2, VolumeX,
} from "lucide-react";
import IntelligencePicker, { type IntelligenceLevel } from "@/components/IntelligencePicker";
import { useAgentStream, type WorkerStatus } from "@/hooks/useAgentStream";
import Artifact from "@/components/Artifact";

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
    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs transition-all ${statusColors[worker.status]}`}>
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
    <div className="space-y-2 p-4 glass-card rounded-2xl">
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
                className="rounded-lg max-w-full h-auto max-h-[80vh] border border-border cursor-pointer hover:opacity-90 transition-opacity"
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
    <div className="flex items-center gap-3 px-4 py-2 bg-muted/30 border border-border rounded-xl text-[10px] text-muted-foreground">
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
    <div className="relative group my-3 rounded-xl overflow-hidden border border-border">
      <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-b border-border">
        <span className="text-[11px] text-muted-foreground font-mono">{lang || "code"}</span>
        <button
          onClick={copy}
          className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="bg-muted/30 p-4 overflow-x-auto text-sm font-mono text-foreground leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function renderMarkdown(text: string): JSX.Element {
  const parts: JSX.Element[] = [];
  let key = 0;

  // Extract artifacts first — replace with placeholders before any other processing
  let processedText = text;
  const artifacts: Array<{ type: string; title?: string; content: string }> = [];

  // Handle <artifact ...>...</artifact> patterns (greedy fallback if no closing tag)
  // Also unescape HTML entities first in case content was escaped
  let unescaped = processedText
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"');

  const hasArtifacts = unescaped.includes("<artifact ");
  if (hasArtifacts) {
    processedText = unescaped.replace(
      /<artifact\s+type=["']([^"']+)["'](?:\s+title=["']([^"']*)["'])?\s*>([\s\S]*?)(?:<\/artifact>|$)/g,
      (_, type, title, content) => {
        const idx = artifacts.length;
        artifacts.push({ type, title, content: content.trim() });
        return `\n__ARTIFACT_${idx}__\n`;
      }
    );
  }

  const segments = processedText.split(/(```[\s\S]*?```)/g);

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

        // Unordered list
        if (/^[-*]\s+/.test(line)) {
          const items: string[] = [];
          while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
            items.push(lines[i].replace(/^[-*]\s+/, ""));
            i++;
          }
          parts.push(
            <ul key={key++} className="space-y-1.5 my-3 ml-1">
              {items.map((item, idx) => (
                <li key={idx} className="flex gap-2.5 text-[15px] leading-relaxed text-foreground">
                  <span className="text-muted-foreground mt-2 flex-shrink-0">•</span>
                  <span>{inlineMarkdown(item)}</span>
                </li>
              ))}
            </ul>
          );
          continue;
        }

        // Ordered list
        if (/^\d+\.\s+/.test(line)) {
          const items: string[] = [];
          while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
            items.push(lines[i].replace(/^\d+\.\s+/, ""));
            i++;
          }
          parts.push(
            <ol key={key++} className="space-y-1.5 my-3 ml-1">
              {items.map((item, idx) => (
                <li key={idx} className="flex gap-2.5 text-[15px] leading-relaxed text-foreground">
                  <span className="text-muted-foreground flex-shrink-0 font-medium min-w-[1.2em]">{idx + 1}.</span>
                  <span>{inlineMarkdown(item)}</span>
                </li>
              ))}
            </ol>
          );
          continue;
        }

        // Headers
        if (/^#{1,3}\s/.test(line)) {
          const level = line.match(/^(#{1,3})/)?.[1].length || 1;
          const content = line.replace(/^#{1,3}\s+/, "");
          const Tag = level === 1 ? "h2" : level === 2 ? "h3" : "h4";
          const cls = level === 1
            ? "text-lg font-semibold text-foreground mt-6 mb-2"
            : level === 2 ? "text-base font-semibold text-foreground mt-5 mb-2"
            : "text-[15px] font-semibold text-foreground mt-4 mb-1.5";
          parts.push(<Tag key={key++} className={cls}>{inlineMarkdown(content)}</Tag>);
          i++;
          continue;
        }

        // Horizontal rule
        if (/^---+$/.test(line.trim())) {
          parts.push(<hr key={key++} className="border-border my-4" />);
          i++;
          continue;
        }

        // Image markdown: ![alt](url)
        const imgMatch = line.match(/!\[([^\]]*)\]\(([^)]+)\)/);
        if (imgMatch) {
          const [, alt, url] = imgMatch;
          parts.push(
            <div key={key++} className="my-4 group relative inline-block">
              <img src={url} alt={alt} className="max-w-full max-h-[80vh] rounded-xl border border-border cursor-pointer hover:opacity-90 transition-opacity" onClick={() => window.open(url, '_blank')} />
              <a href={url} download className="absolute top-2 right-2 p-1.5 rounded-xl bg-background/80 backdrop-blur border border-border opacity-0 group-hover:opacity-100 transition-opacity hover:bg-background">
                <Download className="w-4 h-4 text-foreground" />
              </a>
            </div>
          );
          i++;
          continue;
        }

        // Inline /api/files/ URLs (AI-generated images)
        const fileUrlMatch = line.match(/\/api\/files\/([a-f0-9-]+)/);
        if (fileUrlMatch && (line.includes('.png') || line.includes('.jpg') || line.includes('.webp') || line.includes('image'))) {
          const fileUrl = `/api/files/${fileUrlMatch[1]}`;
          parts.push(
            <div key={key++} className="my-4 group relative inline-block">
              <img src={fileUrl} alt="Generated image" className="max-w-full max-h-[80vh] rounded-xl border border-border cursor-pointer hover:opacity-90 transition-opacity" onClick={() => window.open(fileUrl, '_blank')} />
              <a href={fileUrl} download className="absolute top-2 right-2 p-1.5 rounded-xl bg-background/80 backdrop-blur border border-border opacity-0 group-hover:opacity-100 transition-opacity hover:bg-background">
                <Download className="w-4 h-4 text-foreground" />
              </a>
            </div>
          );
          i++;
          continue;
        }

        // Blockquote
        if (/^>\s/.test(line)) {
          const quoteLines: string[] = [];
          while (i < lines.length && /^>\s?/.test(lines[i])) {
            quoteLines.push(lines[i].replace(/^>\s?/, ""));
            i++;
          }
          parts.push(
            <blockquote key={key++} className="border-l-3 border-primary/40 pl-4 my-3 text-muted-foreground italic text-[15px] leading-relaxed">
              {quoteLines.map((ql, qi) => <p key={qi}>{inlineMarkdown(ql)}</p>)}
            </blockquote>
          );
          continue;
        }

        // Artifact placeholder
        const artifactMatch = line.match(/__ARTIFACT_(\d+)__/);
        if (artifactMatch) {
          const art = artifacts[parseInt(artifactMatch[1])];
          if (art) {
            parts.push(<Artifact key={key++} type={art.type} title={art.title} content={art.content} />);
          }
          i++;
          continue;
        }

        // Empty line = paragraph break
        if (line.trim() === "") {
          parts.push(<div key={key++} className="h-3" />);
          i++;
          continue;
        }

        // Regular paragraph
        parts.push(
          <p key={key++} className="text-[15px] leading-[1.75] text-foreground">{inlineMarkdown(line)}</p>
        );
        i++;
      }
    }
  }
  return <>{parts}</>;
}

function inlineMarkdown(text: string): (string | JSX.Element)[] {
  const result: (string | JSX.Element)[] = [];
  // Match: **bold**, *italic*, `inline code`, [link](url)
  const pattern = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g;
  let last = 0;
  let match;
  let key = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) result.push(text.slice(last, match.index));
    if (match[2]) result.push(<strong key={key++} className="font-semibold text-foreground">{match[2]}</strong>);
    else if (match[3]) result.push(<em key={key++} className="italic">{match[3]}</em>);
    else if (match[4]) result.push(
      <code key={key++} className="bg-muted/60 rounded-md px-1.5 py-0.5 font-mono text-[13px] text-foreground">{match[4]}</code>
    );
    else if (match[5] && match[6]) result.push(
      <a key={key++} href={match[6]} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{match[5]}</a>
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
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Bot className="w-4 h-4 text-white" />
          </div>
        )}
        <div
          className={`rounded-2xl ${
            isUser
              ? "max-w-[75%] bg-primary/10 text-foreground ml-auto px-5 py-3.5"
              : "text-foreground w-full max-w-none flex-1 py-1"
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
              <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
            </>
          ) : msg.type === "image" && msg.imageUrl ? (
            <div>
              <img
                src={msg.imageUrl}
                alt={msg.content || "Generated image"}
                className="rounded-lg max-w-full h-auto max-h-[80vh] mb-2"
                loading="lazy"
              />
              <p className="text-xs text-muted-foreground">{msg.content}</p>
            </div>
          ) : (
            <div className="space-y-0.5">{renderMarkdown(msg.content)}</div>
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
            <div className="glass-card rounded-2xl px-5 py-4">
              <div className="flex items-center gap-2 mb-3 text-xs text-primary">
                <Bot className="w-3.5 h-3.5" />
                <span className="font-medium">Boss — Final Response</span>
              </div>
              <div className="space-y-0.5">
                {renderMarkdown(streamState.synthesisText.replace(/<!--agent-image:[^>]+-->/g, ""))}
              </div>
              {/* Render any agent-generated images from the synthesis */}
              {streamState.agentImages.length > 0 && (
                <div className="mt-3 space-y-2">
                  {streamState.agentImages.map((img, i) => (
                    <div key={i} className="group relative">
                      <img
                        src={img.imageUrl}
                        alt={img.prompt || "Generated image"}
                        className="rounded-lg max-w-full h-auto max-h-[80vh] border border-border"
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
    const res = await fetch("/api/conversations?source=boss");
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
            type: string | null;
            imageUrl: string | null;
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
              type: (m.type as "text" | "image") || undefined,
              imageUrl: m.imageUrl || undefined,
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
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

  // When stream completes, add synthesis as a message and re-sync from server
  useEffect(() => {
    if (streamState.isComplete && streamState.synthesisText && activeJobId) {
      const firstImage = streamState.agentImages.length > 0 ? streamState.agentImages[0] : null;
      const synthesisMsg: Message = {
        id: genId(),
        role: "assistant",
        content: streamState.synthesisText,
        timestamp: new Date(),
        tokenCount: streamState.totalTokens,
        type: firstImage ? "image" : undefined,
        imageUrl: firstImage?.imageUrl,
      };
      setMessages((prev) => [...prev, synthesisMsg]);
      setActiveJobId(null);
      setIsLoading(false);

      // Re-fetch messages from server so local state matches DB
      // This ensures messages persist across navigation / page reload
      if (serverConvId) {
        fetch(`/api/conversations/${serverConvId}/messages`)
          .then((r) => (r.ok ? r.json() : []))
          .then((rawMsgs: Array<{ id: string; role: string; content: string; tokenCount: number | null; model: string | null; type: string | null; imageUrl: string | null; createdAt: number }>) => {
            if (rawMsgs.length === 0) return;
            const serverMessages: Message[] = rawMsgs
              .filter((m) => m.role === "user" || m.role === "assistant")
              .map((m) => ({
                id: m.id,
                role: m.role as "user" | "assistant",
                content: m.content,
                timestamp: new Date(m.createdAt),
                tokenCount: m.tokenCount ?? undefined,
                type: (m.type as "text" | "image") || undefined,
                imageUrl: m.imageUrl || undefined,
              }));
            setMessages(serverMessages);
          })
          .catch(() => {});
      }
    }
  }, [streamState.isComplete, streamState.synthesisText, activeJobId, streamState.totalTokens, serverConvId]);

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
    // Load local messages immediately for responsiveness
    setMessages(conv.messages.map((m) => ({ ...m, timestamp: new Date(m.timestamp) })));
    setError(null);
    setActiveJobId(null);
    setServerConvId(conv.serverId || null);
    if (isMobile) setSidebarOpen(false);
    setTimeout(() => textareaRef.current?.focus(), 50);

    // Then refresh from server to pick up any messages missing from local state
    if (conv.serverId) {
      fetch(`/api/conversations/${conv.serverId}/messages`)
        .then((r) => (r.ok ? r.json() : []))
        .then((rawMsgs: Array<{ id: string; role: string; content: string; tokenCount: number | null; model: string | null; type: string | null; imageUrl: string | null; createdAt: number }>) => {
          if (rawMsgs.length === 0) return;
          const serverMessages: Message[] = rawMsgs
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({
              id: m.id,
              role: m.role as "user" | "assistant",
              content: m.content,
              timestamp: new Date(m.createdAt),
              tokenCount: m.tokenCount ?? undefined,
              type: (m.type as "text" | "image") || undefined,
              imageUrl: m.imageUrl || undefined,
            }));
          setMessages(serverMessages);
        })
        .catch(() => {});
    }
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
          attachments: currentAttachments?.map(a => ({ id: a.id, url: a.url, mimeType: a.mimeType, name: a.name })),
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

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;
        const formData = new FormData();
        formData.append("file", file, `screenshot-${Date.now()}.png`);
        if (serverConvId) formData.append("conversationId", serverConvId);
        try {
          const res = await fetch("/api/chat/upload", { method: "POST", body: formData });
          if (res.ok) {
            const data = await res.json();
            setAttachedFiles(prev => [...prev, {
              id: data.id,
              name: data.originalName || "Screenshot",
              url: data.url,
              thumbnailUrl: data.thumbnailUrl,
              mimeType: data.mimeType,
            }]);
          }
        } catch {}
        break;
      }
    }
  };

  // ── Voice Input (Speech-to-Text) ─────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const recognitionRef = useRef<any>(null);

  const toggleRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser. Try Chrome or Edge.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setInput(transcript);
    };

    recognition.onerror = () => { setIsRecording(false); };
    recognition.onend = () => { setIsRecording(false); };

    recognition.start();
    recognitionRef.current = recognition;
    setIsRecording(true);
  };

  // Text-to-Speech — read AI responses aloud
  const speakText = useCallback((text: string) => {
    if (!ttsEnabled || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    // Strip markdown/HTML for clean speech
    const clean = text.replace(/```[\s\S]*?```/g, "code block").replace(/[#*_`>\[\]()]/g, "").replace(/<[^>]*>/g, "").trim();
    if (!clean) return;
    const utterance = new SpeechSynthesisUtterance(clean.slice(0, 3000));
    utterance.rate = 1.05;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  }, [ttsEnabled]);

  // Auto-speak new assistant messages
  useEffect(() => {
    if (!ttsEnabled || messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last.role === "assistant" && !last.isDelegating) {
      speakText(last.content);
    }
  }, [messages.length, ttsEnabled, speakText]);

  const isEmpty = messages.length === 0;
  const charCount = input.length;

  return (
    <div className="flex h-full overflow-hidden bg-background">
      {/* ── Chat Sidebar ── */}
      <div
        className={`flex-shrink-0 border-r border-border bg-sidebar flex flex-col transition-all duration-200 ${
          sidebarOpen ? "w-60" : "w-0"
        } overflow-hidden`}
      >
        <div className="p-3">
          <button
            onClick={startNewChat}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-primary/10 hover:bg-primary/15 text-primary text-sm font-medium transition-all"
          >
            <Plus className="w-4 h-4 flex-shrink-0" />
            New Chat
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto overscroll-contain px-2 py-1 space-y-0.5">
          {conversations.length === 0 ? (
            <p className="text-xs text-muted-foreground px-3 py-3">No conversations yet.</p>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                className={`group w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-left text-sm transition-all cursor-pointer ${
                  activeId === conv.id
                    ? "bg-primary/12 text-primary font-medium"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
                onClick={() => loadConversation(conv)}
              >
                <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 opacity-60" />
                <span className="truncate text-xs leading-relaxed flex-1">{conv.title}</span>
                <button
                  className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition-opacity flex-shrink-0 rounded-lg hover:bg-destructive/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (conv.serverId) {
                      fetch(`/api/conversations/${conv.serverId}`, { method: "DELETE", credentials: "include" }).catch(() => {});
                    }
                    setConversations((prev) => {
                      const updated = prev.filter((c) => c.id !== conv.id);
                      saveConversations(updated);
                      return updated;
                    });
                    if (activeId === conv.id) startNewChat();
                  }}
                  title="Delete"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))
          )}
        </nav>
      </div>

      {/* Sidebar toggle */}
      <div className="flex-shrink-0 flex items-center">
        <button
          onClick={() => setSidebarOpen((v) => !v)}
          className="w-5 h-12 flex items-center justify-center hover:bg-secondary text-muted-foreground hover:text-foreground rounded-r-lg transition-colors self-center"
        >
          {sidebarOpen ? <ChevronLeft className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </button>
      </div>

      {/* ── Main chat area ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {isEmpty ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-8 px-6 overflow-y-auto">
            <div className="relative">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center">
                <Bot className="w-7 h-7 text-white" />
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-green-400 border-2 border-background" />
            </div>
            <div className="text-center space-y-2">
              <h1 className="text-2xl font-semibold text-foreground tracking-tight">What can I help with?</h1>
              <p className="text-muted-foreground text-[15px]">Research, write, code, create art, or run workflows.</p>
            </div>
            <div className="flex flex-wrap gap-2.5 justify-center max-w-xl">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="px-5 py-2.5 rounded-full bg-card border border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 hover:shadow-sm transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto overscroll-contain px-4 md:px-8 py-8 space-y-4">
            <div className="max-w-3xl mx-auto space-y-4">
              {messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  msg={msg}
                  streamState={msg.jobId === activeJobId ? streamState : undefined}
                />
              ))}
              {isLoading && !activeJobId && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                  <div className="bg-card border border-border rounded-2xl px-5 py-3.5">
                    <TypingDots />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>
        )}

        {/* ── Input area ── */}
        <div className="bg-background px-4 md:px-8 py-4">
          <div className="max-w-3xl mx-auto">
            {/* Attached files preview */}
            {attachedFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {attachedFiles.map(f => (
                  <div key={f.id} className="relative group flex items-center gap-2 bg-secondary border border-border rounded-xl px-3 py-2">
                    {f.mimeType.startsWith("image/") ? (
                      <img src={f.url} alt={f.name} className="w-8 h-8 rounded-lg object-cover" />
                    ) : (
                      <FileText className="w-4 h-4 text-muted-foreground" />
                    )}
                    <span className="text-xs text-foreground truncate max-w-[120px]">{f.name}</span>
                    <button
                      onClick={() => removeAttachment(f.id)}
                      className="w-5 h-5 rounded-full bg-destructive/80 text-white flex items-center justify-center hover:bg-destructive transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2 bg-card border border-border rounded-2xl px-4 py-2 shadow-sm focus-within:border-primary/50 focus-within:shadow-md transition-all">
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
                className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                title="Attach file"
                disabled={isLoading}
              >
                <Paperclip className="w-[18px] h-[18px]" />
              </button>
              <button
                onClick={toggleRecording}
                className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
                  isRecording
                    ? "bg-red-500/20 text-red-400 animate-pulse"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
                title={isRecording ? "Stop recording" : "Voice input"}
                disabled={isLoading}
              >
                {isRecording ? <MicOff className="w-[18px] h-[18px]" /> : <Mic className="w-[18px] h-[18px]" />}
              </button>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder={isRecording ? "Listening... speak now" : "Ask me anything... (Ctrl+V to paste screenshots)"}
                rows={1}
                className="flex-1 bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground resize-none outline-none leading-6 min-h-[24px] max-h-[144px] py-1.5"
                disabled={isLoading}
              />
              {isLoading ? (
                <button
                  onClick={cancelJobs}
                  className="flex-shrink-0 w-9 h-9 rounded-xl bg-destructive flex items-center justify-center text-destructive-foreground hover:bg-destructive/90 transition-colors"
                  title="Stop all running jobs"
                >
                  <Square className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim() && attachedFiles.length === 0 || isLoading}
                  className="flex-shrink-0 w-9 h-9 rounded-xl bg-primary flex items-center justify-center text-primary-foreground disabled:opacity-30 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="flex items-center justify-between mt-2 px-1">
              <p className="text-[11px] text-muted-foreground">Enter to send · Shift+Enter for newline</p>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { setTtsEnabled(!ttsEnabled); if (ttsEnabled) window.speechSynthesis?.cancel(); }}
                  className={`flex items-center gap-1 text-[11px] transition-colors ${ttsEnabled ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                  title={ttsEnabled ? "Disable voice responses" : "Enable voice responses"}
                >
                  {ttsEnabled ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
                  {ttsEnabled ? "Voice on" : "Voice off"}
                </button>
                <IntelligencePicker value={selectedLevel} onChange={setSelectedLevel} compact />
                {charCount > 0 && (
                  <p className={`text-[11px] ${charCount > 2000 ? "text-destructive" : "text-muted-foreground"}`}>
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
