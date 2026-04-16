import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Puzzle, Search, Download, Trash2, Loader2, CheckCircle2,
  ToggleLeft, ToggleRight, Code, Mail, Globe, BarChart3,
  FileText, MessageSquare, Palette, TrendingUp, Share2, Cloud,
  Database, GitBranch,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const ICON_MAP: Record<string, React.ElementType> = {
  Search: Search, FileText: FileText, Code: Code, BarChart3: BarChart3,
  Mail: Mail, TrendingUp: TrendingUp, Share2: Share2, Globe: Globe,
  GitBranch: GitBranch, MessageSquare: MessageSquare, Palette: Palette,
  Database: Database, Cloud: Cloud,
};

const CATEGORY_COLORS: Record<string, string> = {
  skill: "text-blue-400 bg-blue-500/10",
  connector: "text-emerald-400 bg-emerald-500/10",
  plugin: "text-violet-400 bg-violet-500/10",
};

export default function PluginsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"directory" | "installed">("directory");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  const { data: directory = [], isLoading: dirLoading } = useQuery<any[]>({
    queryKey: ["/api/plugins/directory"],
    queryFn: async () => { const r = await fetch("/api/plugins/directory", { credentials: "include" }); return r.ok ? r.json() : []; },
  });

  const { data: installed = [], isLoading: instLoading } = useQuery<any[]>({
    queryKey: ["/api/plugins/installed"],
    queryFn: async () => { const r = await fetch("/api/plugins/installed", { credentials: "include" }); return r.ok ? r.json() : []; },
  });

  const installedSlugs = new Set(installed.map((p: any) => p.slug));

  const installPlugin = async (slug: string) => {
    const res = await fetch("/api/plugins/install", {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
      body: JSON.stringify({ slug }),
    });
    if (res.ok) {
      toast({ title: "Plugin installed!" });
      queryClient.invalidateQueries({ queryKey: ["/api/plugins/installed"] });
    }
  };

  const uninstallPlugin = async (id: string) => {
    await fetch(`/api/plugins/${id}`, { method: "DELETE", credentials: "include" });
    toast({ title: "Plugin removed" });
    queryClient.invalidateQueries({ queryKey: ["/api/plugins/installed"] });
  };

  const togglePlugin = async (id: string) => {
    await fetch(`/api/plugins/${id}/toggle`, { method: "POST", credentials: "include" });
    queryClient.invalidateQueries({ queryKey: ["/api/plugins/installed"] });
  };

  const filteredDirectory = directory.filter((p: any) => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.description?.toLowerCase().includes(search.toLowerCase())) return false;
    if (categoryFilter && p.category !== categoryFilter) return false;
    return true;
  });

  return (
    <div className="p-3 sm:p-4 page-enter">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Puzzle className="w-5 h-5 text-primary" /> Skills & Plugins
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">Extend your AI with skills, connectors, and plugins</p>
        </div>
        <div className="flex items-center gap-1 border border-white/[0.06] rounded-xl p-1">
          {(["directory", "installed"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all capitalize ${
                tab === t ? "bg-white/[0.06] text-foreground" : "text-muted-foreground"
              }`}>{t === "directory" ? "Directory" : `Installed (${installed.length})`}</button>
          ))}
        </div>
      </div>

      {/* Search + Filter */}
      {tab === "directory" && (
        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search skills and plugins..." className="pl-9" />
          </div>
          <div className="flex gap-1">
            {["", "skill", "connector"].map(c => (
              <button key={c} onClick={() => setCategoryFilter(c)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                  categoryFilter === c ? "border-primary bg-primary/10 text-primary" : "border-white/[0.06] text-muted-foreground"
                }`}>{c || "All"}</button>
            ))}
          </div>
        </div>
      )}

      {/* Directory */}
      {tab === "directory" && (
        dirLoading ? <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div> :
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {filteredDirectory.map((plugin: any) => {
            const Icon = ICON_MAP[plugin.icon] || Puzzle;
            const isInstalled = installedSlugs.has(plugin.slug);
            const catColor = CATEGORY_COLORS[plugin.category] || CATEGORY_COLORS.skill;
            return (
              <div key={plugin.slug} className="glass-card rounded-2xl p-4">
                <div className="flex items-start gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${catColor}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-foreground">{plugin.name}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[9px] text-muted-foreground">{plugin.author}</span>
                      <Badge variant="outline" className="text-[8px] h-3.5 capitalize">{plugin.category}</Badge>
                    </div>
                  </div>
                  {isInstalled && <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />}
                </div>

                <p className="text-[10px] text-muted-foreground mb-3 line-clamp-2">{plugin.description}</p>

                <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                  {plugin.tools.slice(0, 3).map((t: any) => (
                    <span key={t.name} className="text-[8px] px-1.5 py-0.5 rounded bg-white/[0.04] text-muted-foreground">{t.name}</span>
                  ))}
                  {plugin.tools.length > 3 && <span className="text-[8px] text-muted-foreground/50">+{plugin.tools.length - 3}</span>}
                </div>

                <Button size="sm" className="w-full text-xs" variant={isInstalled ? "outline" : "default"}
                  disabled={isInstalled} onClick={() => installPlugin(plugin.slug)}>
                  {isInstalled ? <><CheckCircle2 className="w-3 h-3 mr-1" /> Installed</> :
                    <><Download className="w-3 h-3 mr-1" /> Install</>}
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Installed */}
      {tab === "installed" && (
        instLoading ? <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div> :
        installed.length === 0 ? (
          <div className="text-center py-16 glass-card rounded-2xl">
            <Puzzle className="w-10 h-10 mx-auto mb-3 opacity-20 text-muted-foreground" />
            <p className="text-sm font-medium text-muted-foreground">No plugins installed</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Browse the directory to add skills and connectors</p>
            <Button variant="outline" className="mt-4" onClick={() => setTab("directory")}>Browse Directory</Button>
          </div>
        ) : (
          <div className="space-y-2">
            {installed.map((plugin: any) => {
              const Icon = ICON_MAP[plugin.icon] || Puzzle;
              const isActive = plugin.is_active;
              const tools = typeof plugin.tools === "string" ? JSON.parse(plugin.tools) : (plugin.tools || []);
              return (
                <div key={plugin.id} className="glass-card rounded-xl p-4 flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${CATEGORY_COLORS[plugin.category] || CATEGORY_COLORS.skill}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-foreground">{plugin.name}</h3>
                      <Badge variant="outline" className="text-[8px] h-3.5 capitalize">{plugin.category}</Badge>
                      <Badge className={`text-[8px] h-3.5 border-0 ${isActive ? "bg-emerald-500/10 text-emerald-400" : "bg-white/5 text-muted-foreground"}`}>
                        {isActive ? "Active" : "Disabled"}
                      </Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{tools.length} tools · {plugin.author || "Bunz"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => togglePlugin(plugin.id)} className="p-1.5 rounded-lg hover:bg-white/[0.04]" title={isActive ? "Disable" : "Enable"}>
                      {isActive ? <ToggleRight className="w-5 h-5 text-emerald-400" /> : <ToggleLeft className="w-5 h-5 text-muted-foreground" />}
                    </button>
                    <button onClick={() => uninstallPlugin(plugin.id)} className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/5">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
