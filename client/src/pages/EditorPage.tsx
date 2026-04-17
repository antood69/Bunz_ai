import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import MonacoEditor from "@monaco-editor/react";
import {
  FolderOpen, File, ChevronRight, ChevronDown, Save, Loader2,
  Bot, Send, GitBranch, RefreshCw, X, HardDrive, FolderSearch,
  PanelRightOpen, PanelRightClose, History, MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface TreeNode { path: string; name: string; type: "file" | "dir"; children?: TreeNode[] }

function getLang(f: string): string {
  const ext = f.split(".").pop()?.toLowerCase() || "";
  const m: Record<string, string> = {
    ts:"typescript",tsx:"typescript",js:"javascript",jsx:"javascript",
    py:"python",rs:"rust",go:"go",java:"java",json:"json",md:"markdown",
    css:"css",scss:"scss",html:"html",sql:"sql",yaml:"yaml",yml:"yaml",
    sh:"shell",toml:"toml",xml:"xml",env:"ini",
  };
  return m[ext] || "plaintext";
}

function TreeItem({ node, depth, onSelect, selected }: {
  node: TreeNode; depth: number; onSelect: (p: string) => void; selected: string | null;
}) {
  const [open, setOpen] = useState(depth < 1);
  if (node.type === "dir") {
    return (<div>
      <div className="flex items-center gap-1 px-1 py-0.5 cursor-pointer hover:bg-secondary/50 text-xs"
        style={{ paddingLeft: depth * 12 + 4 }} onClick={() => setOpen(!open)}>
        {open ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
        <FolderOpen className="w-3.5 h-3.5 text-yellow-400/70" />
        <span className="text-muted-foreground truncate">{node.name}</span>
      </div>
      {open && node.children?.map(c => <TreeItem key={c.path} node={c} depth={depth + 1} onSelect={onSelect} selected={selected} />)}
    </div>);
  }
  return (
    <div className={`flex items-center gap-1 px-1 py-0.5 cursor-pointer text-xs ${selected === node.path ? "bg-primary/15 text-primary" : "text-foreground hover:bg-secondary/50"}`}
      style={{ paddingLeft: depth * 12 + 16 }} onClick={() => onSelect(node.path)}>
      <File className="w-3.5 h-3.5 text-muted-foreground/40" />
      <span className="truncate">{node.name}</span>
    </div>
  );
}

function buildTree(paths: string[]): TreeNode[] {
  const root: Record<string, any> = {};
  for (const p of paths) {
    const parts = p.split("/"); let cur = root;
    for (let i = 0; i < parts.length; i++) {
      if (!cur[parts[i]]) cur[parts[i]] = i === parts.length - 1 ? { __f: true, __p: p } : {};
      cur = cur[parts[i]];
    }
  }
  const toN = (o: Record<string, any>, pfx = ""): TreeNode[] => {
    const n: TreeNode[] = [];
    for (const [k, v] of Object.entries(o)) {
      if (k.startsWith("__")) continue;
      const p = pfx ? `${pfx}/${k}` : k;
      n.push(v.__f ? { path: v.__p, name: k, type: "file" } : { path: p, name: k, type: "dir", children: toN(v, p) });
    }
    return n.sort((a, b) => a.type !== b.type ? (a.type === "dir" ? -1 : 1) : a.name.localeCompare(b.name));
  };
  return toN(root);
}

// ── Conversation History Panel ──────────────────────────────────────
function ConversationHistory({ onSelect }: { onSelect: (msgs: Array<{ role: "user" | "assistant"; content: string }>) => void }) {
  const { data: conversations = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/conversations"],
    queryFn: async () => {
      const res = await fetch("/api/conversations", { credentials: "include" });
      return res.ok ? res.json() : [];
    },
  });

  const loadConversation = async (convId: string) => {
    try {
      const res = await fetch(`/api/conversations/${convId}/messages`, { credentials: "include" });
      if (!res.ok) return;
      const messages = await res.json();
      const mapped = messages.map((m: any) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));
      onSelect(mapped);
    } catch {}
  };

  return (
    <div className="flex-1 overflow-y-auto border-b border-border">
      <div className="px-3 py-2 border-b border-white/[0.04]">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Past Conversations</p>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
      ) : conversations.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-8">No past conversations</p>
      ) : (
        <div className="p-1.5 space-y-0.5">
          {conversations.slice(0, 20).map((conv: any) => (
            <button key={conv.id} onClick={() => loadConversation(conv.id)}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/[0.04] transition-all group">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                <span className="text-xs font-medium text-foreground truncate flex-1">
                  {conv.title || conv.lastMessage?.slice(0, 40) || "Untitled"}
                </span>
              </div>
              <p className="text-[9px] text-muted-foreground truncate mt-0.5 ml-5">
                {conv.lastMessage?.slice(0, 60) || "No messages"}
              </p>
              <span className="text-[8px] text-muted-foreground/50 ml-5">
                {conv.updatedAt ? new Date(conv.updatedAt).toLocaleDateString() : ""}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function EditorPage() {
  const { toast } = useToast();
  const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  const [mode, setMode] = useState<"github" | "local">(isLocal ? "local" : "github");
  const [selectedRepo, setSelectedRepo] = useState("");
  const [localRoot, setLocalRoot] = useState("");
  const [localInput, setLocalInput] = useState("");
  const [selFile, setSelFile] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [origContent, setOrigContent] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [aiMsgs, setAiMsgs] = useState<Array<{ role: "user" | "assistant"; content: string; imageUrl?: string; isDelegating?: boolean }>>([]);
  const [aiIn, setAiIn] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const editorRef = useRef<any>(null);
  const aiRef = useRef<HTMLDivElement>(null);

  // GitHub repos
  const { data: repos = [] } = useQuery<any[]>({
    queryKey: ["/api/github/repos"],
    queryFn: async () => { const r = await fetch("/api/github/repos", { credentials: "include" }); return r.ok ? r.json() : []; },
    enabled: mode === "github",
  });

  // GitHub tree — response is flat array [{path, type:"blob"}]
  const { data: ghTree = [], isLoading: ghLoad, refetch: refetchGh } = useQuery<TreeNode[]>({
    queryKey: ["gh-tree", selectedRepo],
    queryFn: async () => {
      if (!selectedRepo) return [];
      const [o, r] = selectedRepo.split("/");
      const res = await fetch(`/api/github/repos/${o}/${r}/tree`, { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      // data is array of {path, type, size} — already filtered to blobs
      const paths = Array.isArray(data) ? data.map((f: any) => f.path) : [];
      return buildTree(paths);
    },
    enabled: mode === "github" && !!selectedRepo,
  });

  // Local tree
  const { data: localTree = [], isLoading: localLoad, refetch: refetchLocal } = useQuery<TreeNode[]>({
    queryKey: ["local-tree", localRoot],
    queryFn: async () => {
      if (!localRoot) return [];
      const res = await fetch(`/api/local/tree?root=${encodeURIComponent(localRoot)}`, { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      const paths = (data.tree || []).filter((f: any) => f.type === "blob").map((f: any) => f.path);
      return buildTree(paths);
    },
    enabled: mode === "local" && !!localRoot,
  });

  const tree = mode === "github" ? ghTree : localTree;
  const loading = mode === "github" ? ghLoad : localLoad;
  const hasSrc = mode === "github" ? !!selectedRepo : !!localRoot;

  const loadFile = useCallback(async (path: string) => {
    setSelFile(path);
    try {
      let c = "";
      if (mode === "github") {
        const [o, r] = selectedRepo.split("/");
        const res = await fetch(`/api/github/repos/${o}/${r}/file/${path}`, { credentials: "include" });
        if (!res.ok) throw new Error("Failed");
        c = (await res.json()).content || "";
      } else {
        const full = localRoot.replace(/\\/g, "/") + "/" + path;
        const res = await fetch(`/api/local/file?path=${encodeURIComponent(full)}`, { credentials: "include" });
        if (!res.ok) throw new Error("Failed");
        c = (await res.json()).content || "";
      }
      setContent(c); setOrigContent(c);
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }, [mode, selectedRepo, localRoot, toast]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!selFile) throw new Error("No file");
      if (mode === "github") {
        const [o, r] = selectedRepo.split("/");
        await apiRequest("PUT", `/api/github/repos/${o}/${r}/file/${selFile}`, { content, message: `Update ${selFile} via Bunz` });
      } else {
        const full = localRoot.replace(/\\/g, "/") + "/" + selFile;
        await apiRequest("PUT", "/api/local/file", { path: full, content });
      }
    },
    onSuccess: () => { setOrigContent(content); toast({ title: mode === "github" ? "Committed" : "Saved" }); },
    onError: (e: Error) => { toast({ title: "Failed", description: e.message, variant: "destructive" }); },
  });

  const sendAI = async () => {
    if (!aiIn.trim()) return;
    const userMsg = aiIn.trim();
    const msg = { role: "user" as const, content: userMsg };
    const msgs = [...aiMsgs, msg];
    setAiMsgs(msgs); setAiIn(""); setAiLoading(true); setAiStatus("Thinking...");
    setTimeout(() => aiRef.current?.scrollTo(0, aiRef.current.scrollHeight), 50);
    try {
      // Build context from editor
      const sel = editorRef.current?.getModel()?.getValueInRange(editorRef.current.getSelection()) || "";
      const ctx = sel || content.slice(0, 3000);
      const fileCtx = selFile ? `\nCurrently editing: ${selFile}\n\`\`\`\n${ctx}\n\`\`\`` : "";
      const repoCtx = selectedRepo ? `\nGitHub repo: ${selectedRepo}` : "";

      // Send to Boss — it will dispatch to departments as needed
      const res = await fetch("/api/boss/chat", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({
          message: userMsg + fileCtx + repoCtx,
          level: "medium",
          history: msgs.slice(-10),
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setAiMsgs(p => [...p, { role: "assistant", content: `Error: ${data.error || `HTTP ${res.status}`}` }]);
        setAiLoading(false); setAiStatus("");
        return;
      }

      if (data.isDelegating && data.jobId) {
        // Stream department results via SSE
        setAiStatus("Departments working...");
        setAiMsgs(p => [...p, { role: "assistant", content: data.reply || "Dispatching to departments...", isDelegating: true }]);

        const es = new EventSource(`/api/agent/stream/${data.jobId}`);
        let finalContent = "";
        let imageUrl = "";

        es.addEventListener("token", (e) => {
          const d = JSON.parse(e.data);
          if (d.isSynthesis) {
            finalContent += d.text;
            setAiMsgs(p => {
              const updated = [...p];
              const last = updated[updated.length - 1];
              if (last?.isDelegating) {
                updated[updated.length - 1] = { ...last, content: finalContent };
              }
              return updated;
            });
            setTimeout(() => aiRef.current?.scrollTo(0, aiRef.current.scrollHeight), 50);
          }
        });

        es.addEventListener("agent_image", (e) => {
          const d = JSON.parse(e.data);
          imageUrl = d.imageUrl;
          setAiMsgs(p => {
            const updated = [...p];
            const last = updated[updated.length - 1];
            if (last?.isDelegating) {
              updated[updated.length - 1] = { ...last, imageUrl };
            }
            return updated;
          });
        });

        es.addEventListener("progress", (e) => {
          const d = JSON.parse(e.data);
          setAiStatus(`${d.workerType || "Working"}${d.subAgent ? ` — ${d.subAgent}` : ""}...`);
        });

        es.addEventListener("step_complete", (e) => {
          const d = JSON.parse(e.data);
          setAiStatus(`${d.workerType} complete`);
        });

        es.addEventListener("complete", () => {
          es.close();
          setAiLoading(false);
          setAiStatus("");
          // Make sure we have the final content
          if (finalContent) {
            setAiMsgs(p => {
              const updated = [...p];
              const last = updated[updated.length - 1];
              if (last?.isDelegating) {
                updated[updated.length - 1] = { ...last, content: finalContent, imageUrl: imageUrl || last.imageUrl, isDelegating: false };
              }
              return updated;
            });
          }
          setTimeout(() => aiRef.current?.scrollTo(0, aiRef.current.scrollHeight), 50);
        });

        es.addEventListener("error", () => { es.close(); setAiLoading(false); setAiStatus(""); });
      } else {
        // Direct response
        setAiMsgs(p => [...p, { role: "assistant", content: data.reply || "No response", imageUrl: data.imageUrl }]);
        setAiLoading(false); setAiStatus("");
      }
    } catch (e: any) {
      const errMsg = e?.message || "Unknown error";
      setAiMsgs(p => [...p, { role: "assistant", content: `Error: ${errMsg}. Check that your AI API keys are configured and you have tokens remaining.` }]);
      setAiLoading(false); setAiStatus("");
    }
    finally { setTimeout(() => aiRef.current?.scrollTo(0, aiRef.current.scrollHeight), 50); }
  };

  const dirty = content !== origContent;

  return (
    <div className="flex flex-col h-[calc(100vh-48px)]">
      {/* Top Bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-card/50 flex-shrink-0">
        <div className="flex items-center border border-border rounded-xl overflow-hidden">
          {isLocal && (
            <button className={`px-2 py-1 text-[11px] flex items-center gap-1 ${mode === "local" ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}
              onClick={() => { setMode("local"); setSelFile(null); setContent(""); }}>
              <HardDrive className="w-3 h-3" /> Local
            </button>
          )}
          <button className={`px-2 py-1 text-[11px] flex items-center gap-1 ${mode === "github" ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}
            onClick={() => { setMode("github"); setSelFile(null); setContent(""); }}>
            <GitBranch className="w-3 h-3" /> GitHub
          </button>
        </div>

        {mode === "github" ? (
          <select value={selectedRepo} onChange={(e) => { setSelectedRepo(e.target.value); setSelFile(null); }}
            className="bg-secondary border border-border rounded-xl px-2 py-1 text-xs text-foreground min-w-[160px]">
            <option value="">Select repo...</option>
            {repos.map((r: any) => <option key={r.full_name} value={r.full_name}>{r.full_name}</option>)}
          </select>
        ) : (
          <div className="flex items-center gap-1">
            <Input value={localInput} onChange={(e) => setLocalInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") setLocalRoot(localInput.replace(/\\/g, "/")); }}
              placeholder="C:\Users\you\project" className="h-7 text-xs w-52" />
            <Button size="sm" variant="secondary" className="h-7 w-7 p-0" onClick={() => setLocalRoot(localInput.replace(/\\/g, "/"))}>
              <FolderSearch className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}

        {selFile && (<>
          <span className="text-[10px] text-muted-foreground">/</span>
          <span className="text-[10px] font-mono text-foreground truncate max-w-[250px]">{selFile}</span>
          {dirty && <Badge variant="secondary" className="text-[9px] h-4">Modified</Badge>}
        </>)}

        <div className="ml-auto flex items-center gap-1.5">
          {hasSrc && <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => mode === "github" ? refetchGh() : refetchLocal()}>
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>}
          {dirty && <Button size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending} className="h-7 gap-1 text-xs">
            {saveMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            {mode === "github" ? "Commit" : "Save"}
          </Button>}
          <Button size="sm" variant={aiOpen ? "default" : "outline"} className="h-7 gap-1 text-xs" onClick={() => setAiOpen(!aiOpen)}>
            <Bot className="w-3.5 h-3.5" /> AI
          </Button>
        </div>
      </div>

      {/* Body: tree + editor + AI side panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* File Tree */}
        <div className="w-48 border-r border-border bg-card/30 overflow-y-auto flex-shrink-0">
          {!hasSrc ? (
            <div className="p-3 text-xs text-muted-foreground text-center">
              {mode === "github" ? <><GitBranch className="w-6 h-6 mx-auto mb-2 opacity-20" /><p>Select a repo</p></> :
                <><HardDrive className="w-6 h-6 mx-auto mb-2 opacity-20" /><p>Enter a local folder path</p></>}
            </div>
          ) : loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
          ) : tree.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground text-center">No files found</div>
          ) : (
            <div className="py-0.5">{tree.map(n => <TreeItem key={n.path} node={n} depth={0} onSelect={loadFile} selected={selFile} />)}</div>
          )}
        </div>

        {/* Editor */}
        <div className="flex-1 min-w-0">
          {selFile ? (
            <MonacoEditor height="100%" language={getLang(selFile)} value={content} onChange={(v) => setContent(v || "")}
              onMount={(e) => { editorRef.current = e; }} theme="vs-dark"
              options={{ fontSize: 13, minimap: { enabled: true }, wordWrap: "on", padding: { top: 8 },
                scrollBeyondLastLine: false, bracketPairColorization: { enabled: true } }} />
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              <div className="text-center"><File className="w-10 h-10 mx-auto mb-2 opacity-15" />
                <p className="text-sm">{hasSrc ? "Select a file" : "Choose a source"}</p></div>
            </div>
          )}
        </div>

        {/* Resize handle + AI Side Panel (right) */}
        {aiOpen && (<>
          <div className="w-1.5 border-l border-border bg-transparent hover:bg-primary/20 cursor-col-resize flex-shrink-0"
            onMouseDown={(e) => {
              e.preventDefault();
              const startX = e.clientX;
              const panel = (e.currentTarget.nextElementSibling as HTMLElement);
              const startW = panel.offsetWidth;
              const onMove = (ev: MouseEvent) => { const diff = startX - ev.clientX; panel.style.width = Math.max(280, Math.min(700, startW + diff)) + "px"; };
              const onUp = () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
              document.addEventListener("mousemove", onMove);
              document.addEventListener("mouseup", onUp);
            }} />
          <div className="border-l border-border bg-card/50 flex flex-col flex-shrink-0" style={{ width: 400 }}>
            <div className="flex items-center justify-between px-3 py-2 border-b border-border">
              <div className="flex items-center gap-1.5">
                <Bot className="w-4 h-4 text-primary" />
                <span className="text-xs font-medium">Boss AI</span>
              </div>
              <div className="flex items-center gap-1.5">
                {aiMsgs.length > 0 && <button onClick={() => setAiMsgs([])} className="text-[10px] text-muted-foreground hover:text-foreground">Clear</button>}
                <button onClick={() => setAiOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
              </div>
            </div>
            <div ref={aiRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
              {aiMsgs.length === 0 && (
                <div className="text-center py-6">
                  <Bot className="w-8 h-8 mx-auto mb-2 opacity-20 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Ask anything — I can research, write, code, and generate images.</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1">Select code in the editor for targeted help.</p>
                  <div className="flex flex-wrap gap-1 justify-center mt-3">
                    {["Design a UI for this", "Write tests", "Explain this code", "Create a logo"].map(s => (
                      <button key={s} onClick={() => setAiIn(s)} className="text-[9px] px-2 py-1 rounded-full border border-white/[0.06] text-muted-foreground hover:text-foreground hover:border-primary/50">{s}</button>
                    ))}
                  </div>
                </div>
              )}
              {aiMsgs.map((m, i) => (
                <div key={i} className={`text-sm rounded-xl ${m.role === "user" ? "bg-primary/12 ml-6 px-3 py-2.5" : "mr-1"}`}>
                  {m.role === "user" ? (
                    <span className="whitespace-pre-wrap">{m.content}</span>
                  ) : (
                    <div className="space-y-2">
                      {/* Render artifact tags inline */}
                      {(() => {
                        let text = m.content;
                        const artifacts: Array<{ type: string; title: string; content: string }> = [];
                        text = text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
                        text = text.replace(/<artifact\s+type=["']([^"']+)["'](?:\s+title=["']([^"']*)["'])?\s*>([\s\S]*?)(?:<\/artifact>|$)/g,
                          (_, type, title, content) => { artifacts.push({ type, title: title || "Preview", content: content.trim() }); return `\n[ARTIFACT_${artifacts.length - 1}]\n`; });

                        return text.split(/\[ARTIFACT_(\d+)\]/).map((part, j) => {
                          if (j % 2 === 1) {
                            const art = artifacts[parseInt(part)];
                            if (!art) return null;
                            const isHtml = art.type === "html" || art.type === "svg";
                            const src = isHtml ? `data:text/html;charset=utf-8,${encodeURIComponent(art.content.includes("<!") ? art.content : `<!DOCTYPE html><html><head><meta charset="utf-8"><style>*{margin:0;box-sizing:border-box}body{font-family:system-ui;background:#0a0a12;color:#e5e7eb;padding:12px}</style></head><body>${art.content}</body></html>`)}` : undefined;
                            return (
                              <div key={j} className="rounded-xl border border-white/[0.08] overflow-hidden my-2">
                                <div className="flex items-center justify-between px-2.5 py-1.5 bg-white/[0.02] border-b border-white/[0.04]">
                                  <span className="text-[9px] font-semibold text-foreground">{art.title}</span>
                                  <div className="flex gap-1">
                                    <button className="text-[8px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded border border-white/[0.06]"
                                      onClick={() => navigator.clipboard.writeText(art.content)}>Copy</button>
                                    {isHtml && <button className="text-[8px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded border border-white/[0.06]"
                                      onClick={() => { const w = window.open("", "_blank"); if (w) { w.document.write(art.content); w.document.close(); } }}>Open</button>}
                                  </div>
                                </div>
                                {isHtml ? (
                                  <iframe src={src} className="w-full border-0 bg-[#0a0a12]" style={{ height: "280px" }}
                                    sandbox="allow-scripts allow-same-origin" />
                                ) : (
                                  <pre className="text-[10px] text-foreground/80 p-2.5 max-h-48 overflow-auto whitespace-pre-wrap">{art.content}</pre>
                                )}
                              </div>
                            );
                          }
                          return part ? <div key={j} className="bg-secondary/80 rounded-xl px-3 py-2.5 whitespace-pre-wrap text-[13px] leading-relaxed">{part}</div> : null;
                        });
                      })()}
                      {/* Image from Artist department */}
                      {m.imageUrl && (
                        <div className="rounded-xl overflow-hidden border border-white/[0.08]">
                          <img src={m.imageUrl} alt="Generated" className="w-full max-h-64 object-contain bg-black/20" />
                          <div className="flex gap-1 p-1.5 bg-white/[0.02]">
                            <button className="text-[8px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded border border-white/[0.06]"
                              onClick={() => window.open(m.imageUrl, "_blank")}>Full Size</button>
                            <button className="text-[8px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded border border-white/[0.06]"
                              onClick={() => setAiIn(`Build this UI design in code using the image above as reference`)}>Use as Reference</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {aiLoading && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground px-3 py-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{aiStatus || "Thinking..."}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 px-3 py-3 border-t border-border">
              <Input placeholder="Ask anything — code, design, research..." value={aiIn} onChange={(e) => setAiIn(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendAI(); } }}
                disabled={aiLoading} className="flex-1 h-9 text-sm" />
              <Button size="sm" className="h-9 w-9 p-0" onClick={sendAI} disabled={aiLoading || !aiIn.trim()}>
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </>)}
      </div>
    </div>
  );
}
