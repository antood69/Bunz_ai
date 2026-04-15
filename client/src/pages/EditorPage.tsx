import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import MonacoEditor from "@monaco-editor/react";
import {
  FolderOpen, File, ChevronRight, ChevronDown, Save, Loader2,
  Bot, Send, GitBranch, RefreshCw, X, HardDrive, FolderSearch,
  PanelRightOpen, PanelRightClose,
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
  const [aiMsgs, setAiMsgs] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [aiIn, setAiIn] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
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
    const msg = { role: "user" as const, content: aiIn.trim() };
    const msgs = [...aiMsgs, msg];
    setAiMsgs(msgs); setAiIn(""); setAiLoading(true);
    setTimeout(() => aiRef.current?.scrollTo(0, aiRef.current.scrollHeight), 50);
    try {
      const sel = editorRef.current?.getModel()?.getValueInRange(editorRef.current.getSelection()) || "";
      const ctx = sel || content.slice(0, 3000);
      const fileCtx = selFile ? `\nFile: ${selFile}\n\`\`\`\n${ctx}\n\`\`\`` : "";
      const res = await fetch("/api/boss/chat", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ message: aiIn.trim() + fileCtx, level: "medium", history: msgs.slice(-10) }),
      });
      const data = await res.json();
      setAiMsgs(p => [...p, { role: "assistant", content: data.reply || "No response" }]);
    } catch { setAiMsgs(p => [...p, { role: "assistant", content: "Error occurred." }]); }
    finally { setAiLoading(false); setTimeout(() => aiRef.current?.scrollTo(0, aiRef.current.scrollHeight), 50); }
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
              {aiMsgs.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Ask about your code. Select text in the editor for targeted help.</p>}
              {aiMsgs.map((m, i) => (
                <div key={i} className={`text-sm px-3 py-2.5 rounded-xl whitespace-pre-wrap ${m.role === "user" ? "bg-primary/12 ml-6" : "bg-secondary mr-2"}`}>{m.content}</div>
              ))}
              {aiLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground px-3"><Loader2 className="w-4 h-4 animate-spin" /> Thinking...</div>}
            </div>
            <div className="flex items-center gap-2 px-3 py-3 border-t border-border">
              <Input placeholder="Ask about this code..." value={aiIn} onChange={(e) => setAiIn(e.target.value)}
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
