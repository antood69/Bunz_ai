import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Puzzle, Search, Download, Trash2, Loader2, CheckCircle2,
  ToggleLeft, ToggleRight, Code, Mail, Globe, BarChart3,
  FileText, MessageSquare, Palette, TrendingUp, Share2, Cloud,
  Database, GitBranch, Plug, Zap, Shield, Plus, X, Eye,
  Link2, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

const ICON_MAP: Record<string, React.ElementType> = {
  Search, FileText, Code, BarChart3, Mail, TrendingUp, Share2, Globe,
  GitBranch, MessageSquare, Palette, Database, Cloud, Plug, Zap,
};

const SECTION_COLORS: Record<string, string> = {
  skill: "text-blue-400 bg-blue-500/10",
  connector: "text-emerald-400 bg-emerald-500/10",
  plugin: "text-violet-400 bg-violet-500/10",
};

export default function PluginsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [section, setSection] = useState<"skills" | "connectors" | "installed">("skills");
  const [search, setSearch] = useState("");
  const [connectDialog, setConnectDialog] = useState<any>(null);
  const [apiKey, setApiKey] = useState("");
  const [extraFields, setExtraFields] = useState<Record<string, string>>({});

  // Skills directory
  const { data: directory = [], isLoading: dirLoading } = useQuery<any[]>({
    queryKey: ["/api/plugins/directory"],
    queryFn: async () => { const r = await fetch("/api/plugins/directory", { credentials: "include" }); if (!r.ok) return []; return r.json(); },
    retry: 1,
  });

  // Installed plugins
  const { data: installed = [] } = useQuery<any[]>({
    queryKey: ["/api/plugins/installed"],
    queryFn: async () => { const r = await fetch("/api/plugins/installed", { credentials: "include" }); if (!r.ok) return []; return r.json(); },
    retry: 1,
  });

  // Connected services
  const { data: connectors = [], isLoading: connLoading } = useQuery<any[]>({
    queryKey: ["/api/connectors"],
    queryFn: async () => { const r = await fetch("/api/connectors", { credentials: "include" }); if (!r.ok) return []; return r.json(); },
    retry: 1,
  });

  const installedSlugs = new Set(installed.map((p: any) => p.slug));
  const skills = directory.filter((p: any) => p.category === "skill");
  const connectorPlugins = directory.filter((p: any) => p.category === "connector");

  // Available connectors to add
  const AVAILABLE_CONNECTORS = [
    { provider: "openai", name: "OpenAI", description: "GPT-4, DALL-E, Whisper", icon: "Zap", fields: [{ key: "apiKey", label: "API Key", placeholder: "sk-..." }] },
    { provider: "anthropic", name: "Anthropic", description: "Claude models", icon: "Zap", fields: [{ key: "apiKey", label: "API Key", placeholder: "sk-ant-..." }] },
    { provider: "github", name: "GitHub", description: "Repos, issues, PRs", icon: "GitBranch", fields: [{ key: "apiKey", label: "Personal Access Token", placeholder: "ghp_..." }] },
    { provider: "slack", name: "Slack", description: "Messages and channels", icon: "MessageSquare", fields: [{ key: "apiKey", label: "Bot Token", placeholder: "xoxb-..." }] },
    { provider: "stripe", name: "Stripe", description: "Payments and invoices", icon: "Zap", fields: [{ key: "apiKey", label: "Secret Key", placeholder: "sk_..." }] },
    { provider: "linkedin", name: "LinkedIn", description: "Publish posts", icon: "Globe", fields: [{ key: "apiKey", label: "Access Token", placeholder: "Token..." }] },
    { provider: "shopify", name: "Shopify", description: "Products and orders", icon: "Zap", fields: [{ key: "shop", label: "Shop Domain", placeholder: "store.myshopify.com" }, { key: "apiKey", label: "Admin Token", placeholder: "shpat_..." }] },
    { provider: "gumroad", name: "Gumroad", description: "Digital products", icon: "Zap", fields: [{ key: "apiKey", label: "Access Token", placeholder: "Token..." }] },
    { provider: "supabase", name: "Supabase", description: "Database and auth", icon: "Database", fields: [{ key: "url", label: "Project URL", placeholder: "https://xxx.supabase.co" }, { key: "apiKey", label: "Service Key", placeholder: "eyJ..." }] },
    { provider: "vercel", name: "Vercel", description: "Deployments and domains", icon: "Cloud", fields: [{ key: "apiKey", label: "API Token", placeholder: "Token..." }] },
    { provider: "figma", name: "Figma", description: "Design files", icon: "Palette", fields: [{ key: "apiKey", label: "Personal Access Token", placeholder: "figd_..." }] },
    { provider: "discord", name: "Discord Bot", description: "Send messages", icon: "MessageSquare", fields: [{ key: "apiKey", label: "Bot Token", placeholder: "Token..." }] },
  ];

  const connectedProviders = new Set(connectors.map((c: any) => c.provider));

  const installPlugin = async (slug: string) => {
    const res = await fetch("/api/plugins/install", {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
      body: JSON.stringify({ slug }),
    });
    if (res.ok) { toast({ title: "Installed!" }); queryClient.invalidateQueries({ queryKey: ["/api/plugins/installed"] }); }
  };

  const uninstallPlugin = async (id: string) => {
    await fetch(`/api/plugins/${id}`, { method: "DELETE", credentials: "include" });
    toast({ title: "Removed" }); queryClient.invalidateQueries({ queryKey: ["/api/plugins/installed"] });
  };

  const togglePlugin = async (id: string) => {
    await fetch(`/api/plugins/${id}/toggle`, { method: "POST", credentials: "include" });
    queryClient.invalidateQueries({ queryKey: ["/api/plugins/installed"] });
  };

  const connectService = async () => {
    if (!connectDialog) return;
    const config: Record<string, string> = { apiKey, ...extraFields };
    const res = await fetch("/api/connectors", {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
      body: JSON.stringify({ type: "api_key", provider: connectDialog.provider, name: connectDialog.name, config }),
    });
    if (res.ok) {
      toast({ title: `${connectDialog.name} connected!` });
      queryClient.invalidateQueries({ queryKey: ["/api/connectors"] });
      setConnectDialog(null); setApiKey(""); setExtraFields({});
    } else {
      const d = await res.json();
      toast({ title: "Failed", description: d.error, variant: "destructive" });
    }
  };

  const disconnectService = async (id: number) => {
    await fetch(`/api/connectors/${id}`, { method: "DELETE", credentials: "include" });
    toast({ title: "Disconnected" }); queryClient.invalidateQueries({ queryKey: ["/api/connectors"] });
  };

  const testService = async (id: number) => {
    const res = await fetch(`/api/connectors/${id}/test`, { method: "POST", credentials: "include" });
    const data = await res.json();
    toast({ title: data.ok ? "Connection OK" : "Test failed", description: data.error, variant: data.ok ? "default" : "destructive" });
    queryClient.invalidateQueries({ queryKey: ["/api/connectors"] });
  };

  return (
    <div className="flex h-[calc(100vh-48px)] page-enter">
      {/* Sidebar */}
      <div className="w-48 border-r border-white/[0.06] bg-background/50 flex flex-col flex-shrink-0">
        <div className="p-3 border-b border-white/[0.04]">
          <h1 className="text-sm font-bold text-foreground flex items-center gap-1.5">
            <Puzzle className="w-4 h-4 text-primary" /> Directory
          </h1>
        </div>
        <nav className="p-2 space-y-0.5 flex-1">
          {([
            { key: "skills", label: "Skills", icon: Zap, count: skills.length },
            { key: "connectors", label: "Connectors", icon: Plug, count: AVAILABLE_CONNECTORS.length },
            { key: "installed", label: "Installed", icon: CheckCircle2, count: installed.length + connectors.length },
          ] as const).map(item => {
            const Icon = item.icon;
            return (
              <button key={item.key} onClick={() => setSection(item.key)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  section === item.key ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-white/[0.03]"
                }`}>
                <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                {item.label}
                <span className="ml-auto text-[9px] opacity-60">{item.count}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Search */}
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${section}...`} className="pl-9" />
          </div>
        </div>

        {/* ── Skills Section ────────────────────────────────────────── */}
        {section === "skills" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {skills.filter((p: any) => !search || p.name.toLowerCase().includes(search.toLowerCase())).map((plugin: any) => {
              const Icon = ICON_MAP[plugin.icon] || Puzzle;
              const isInstalled = installedSlugs.has(plugin.slug);
              return (
                <div key={plugin.slug} className="glass-card rounded-xl p-4">
                  <div className="flex items-start gap-3 mb-2">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-blue-500/10">
                      <Icon className="w-4 h-4 text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-xs font-bold text-foreground">{plugin.name}</h3>
                      <span className="text-[9px] text-muted-foreground">{plugin.author}</span>
                    </div>
                    {isInstalled && <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />}
                  </div>
                  <p className="text-[10px] text-muted-foreground mb-2 line-clamp-2">{plugin.description}</p>
                  <div className="flex gap-1 mb-2 flex-wrap">
                    {plugin.tools.slice(0, 3).map((t: any) => (
                      <span key={t.name} className="text-[8px] px-1.5 py-0.5 rounded bg-white/[0.04] text-muted-foreground">{t.name}</span>
                    ))}
                  </div>
                  <Button size="sm" className="w-full text-xs" variant={isInstalled ? "outline" : "default"}
                    disabled={isInstalled} onClick={() => installPlugin(plugin.slug)}>
                    {isInstalled ? "Installed" : <><Download className="w-3 h-3 mr-1" /> Install</>}
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Connectors Section ────────────────────────────────────── */}
        {section === "connectors" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {AVAILABLE_CONNECTORS.filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase())).map((conn) => {
              const Icon = ICON_MAP[conn.icon] || Plug;
              const isConnected = connectedProviders.has(conn.provider);
              const existing = connectors.find((c: any) => c.provider === conn.provider);
              return (
                <div key={conn.provider} className="glass-card rounded-xl p-4">
                  <div className="flex items-start gap-3 mb-2">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-emerald-500/10">
                      <Icon className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-xs font-bold text-foreground">{conn.name}</h3>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Badge variant="outline" className="text-[8px] h-3.5">API Key</Badge>
                        {isConnected && (
                          <span className="flex items-center gap-1 text-[9px] text-emerald-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Connected
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground mb-3">{conn.description}</p>
                  {isConnected ? (
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => testService(existing.id)}>Test</Button>
                      <Button size="sm" variant="outline" className="text-xs text-red-400" onClick={() => disconnectService(existing.id)}>Disconnect</Button>
                    </div>
                  ) : (
                    <Button size="sm" className="w-full text-xs bg-emerald-600 hover:bg-emerald-700 border-0"
                      onClick={() => { setConnectDialog(conn); setApiKey(""); setExtraFields({}); }}>
                      <Link2 className="w-3 h-3 mr-1" /> Connect
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Installed Section ─────────────────────────────────────── */}
        {section === "installed" && (
          <div className="space-y-2">
            {/* Connected services */}
            {connectors.length > 0 && (
              <>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Connected Services</p>
                {connectors.filter((c: any) => !search || c.name?.toLowerCase().includes(search.toLowerCase()) || c.provider?.toLowerCase().includes(search.toLowerCase())).map((conn: any) => (
                  <div key={conn.id} className="glass-card rounded-xl p-3 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-emerald-500/10">
                      <Plug className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-foreground">{conn.name || conn.provider}</span>
                        <Badge className={`text-[8px] h-3.5 border-0 ${conn.status === "connected" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                          {conn.status}
                        </Badge>
                      </div>
                      <span className="text-[9px] text-muted-foreground">{conn.provider} · {conn.type}</span>
                    </div>
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => testService(conn.id)}>Test</Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs text-red-400" onClick={() => disconnectService(conn.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </>
            )}

            {/* Installed plugins */}
            {installed.length > 0 && (
              <>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2 mt-4">Installed Skills</p>
                {installed.filter((p: any) => !search || p.name?.toLowerCase().includes(search.toLowerCase())).map((plugin: any) => {
                  const Icon = ICON_MAP[plugin.icon] || Puzzle;
                  const isActive = plugin.is_active;
                  return (
                    <div key={plugin.id} className="glass-card rounded-xl p-3 flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${SECTION_COLORS[plugin.category] || SECTION_COLORS.skill}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-foreground">{plugin.name}</span>
                          <Badge className={`text-[8px] h-3.5 border-0 ${isActive ? "bg-emerald-500/10 text-emerald-400" : "bg-white/5 text-muted-foreground"}`}>
                            {isActive ? "Active" : "Disabled"}
                          </Badge>
                        </div>
                        <span className="text-[9px] text-muted-foreground">{plugin.author || "Cortal"}</span>
                      </div>
                      <div className="flex gap-1.5">
                        <button onClick={() => togglePlugin(plugin.id)} className="p-1.5 rounded-lg hover:bg-white/[0.04]">
                          {isActive ? <ToggleRight className="w-4 h-4 text-emerald-400" /> : <ToggleLeft className="w-4 h-4 text-muted-foreground" />}
                        </button>
                        <button onClick={() => uninstallPlugin(plugin.id)} className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {connectors.length === 0 && installed.length === 0 && (
              <div className="text-center py-16 glass-card rounded-2xl">
                <Puzzle className="w-10 h-10 mx-auto mb-3 opacity-20 text-muted-foreground" />
                <p className="text-sm font-medium text-muted-foreground">Nothing installed yet</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Browse Skills and Connectors to get started</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Connect Dialog */}
      {connectDialog && (
        <Dialog open onOpenChange={(o) => !o && setConnectDialog(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Link2 className="w-5 h-5 text-primary" /> Connect {connectDialog.name}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              {connectDialog.fields.map((f: any) => (
                <div key={f.key}>
                  <Label className="text-xs">{f.label}</Label>
                  {f.key === "apiKey" ? (
                    <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={f.placeholder} className="mt-1" autoFocus />
                  ) : (
                    <Input value={extraFields[f.key] || ""} onChange={(e) => setExtraFields({ ...extraFields, [f.key]: e.target.value })} placeholder={f.placeholder} className="mt-1" />
                  )}
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConnectDialog(null)}>Cancel</Button>
              <Button disabled={!apiKey.trim()} onClick={connectService} className="bg-emerald-600 hover:bg-emerald-700 border-0">
                <Link2 className="w-4 h-4 mr-1" /> Connect
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
