import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Building2, Plus, Trash2, Eye, Globe, Users, Palette, Download,
  CheckCircle, Circle, Layout, Sidebar, Monitor,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import AIChatPanel from "@/components/AIChatPanel";

type WhiteLabelConfig = {
  id: string;
  brandName: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  customDomain: string | null;
  features: string | null;
  maxUsers: number;
  status: string;
  createdAt: string;
};

const AVAILABLE_FEATURES = [
  { id: "Dashboard", icon: Layout },
  { id: "Boss", icon: Monitor },
  { id: "Workflows", icon: Layout },
  { id: "Agents", icon: Monitor },
  { id: "Marketplace", icon: Layout },
  { id: "Trade Journal", icon: Layout },
  { id: "Bot Challenge", icon: Monitor },
  { id: "Tools", icon: Monitor },
  { id: "Fiverr", icon: Layout },
  { id: "App Generator", icon: Monitor },
  { id: "The Boss", icon: Monitor },
  { id: "Prop Trading", icon: Layout },
];

const DEPLOY_CHECKLIST = [
  { key: "brand", label: "Brand name configured" },
  { key: "colors", label: "Theme colors set" },
  { key: "features", label: "Features selected (3+)" },
  { key: "domain", label: "Custom domain configured" },
  { key: "users", label: "User limits defined" },
];

export default function WhiteLabelPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [previewConfig, setPreviewConfig] = useState<WhiteLabelConfig | null>(null);
  const [form, setForm] = useState({
    brandName: "", logoUrl: "", primaryColor: "#6366f1", secondaryColor: "#8b5cf6",
    customDomain: "", maxUsers: 10, features: AVAILABLE_FEATURES.map(f => f.id),
  });

  const { data: configs = [] } = useQuery<WhiteLabelConfig[]>({ queryKey: ["/api/white-label-configs"] });

  const createConfig = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/white-label-configs", {
        ...form,
        features: JSON.stringify(form.features),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/white-label-configs"] });
      setShowCreate(false);
      setForm({ brandName: "", logoUrl: "", primaryColor: "#6366f1", secondaryColor: "#8b5cf6", customDomain: "", maxUsers: 10, features: AVAILABLE_FEATURES.map(f => f.id) });
    },
  });

  const deleteConfig = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/white-label-configs/${id}`); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/white-label-configs"] }),
  });

  const parseFeatures = (json: string | null): string[] => {
    try { return json ? JSON.parse(json) : []; } catch { return []; }
  };

  function exportConfig(config: WhiteLabelConfig) {
    const exportData = {
      brandName: config.brandName,
      primaryColor: config.primaryColor,
      secondaryColor: config.secondaryColor,
      customDomain: config.customDomain,
      features: parseFeatures(config.features),
      maxUsers: config.maxUsers,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${config.brandName.toLowerCase().replace(/\s+/g, "-")}-config.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function getDeployProgress(config: WhiteLabelConfig): { done: number; total: number; items: { key: string; label: string; ok: boolean }[] } {
    const features = parseFeatures(config.features);
    const items = DEPLOY_CHECKLIST.map(c => {
      let ok = false;
      if (c.key === "brand") ok = !!config.brandName;
      if (c.key === "colors") ok = !!config.primaryColor && !!config.secondaryColor;
      if (c.key === "features") ok = features.length >= 3;
      if (c.key === "domain") ok = !!config.customDomain;
      if (c.key === "users") ok = config.maxUsers > 0;
      return { ...c, ok };
    });
    return { done: items.filter(i => i.ok).length, total: items.length, items };
  }

  // Currently editing form colors for live preview
  const livePreview = form;

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Building2 className="w-6 h-6 text-primary" /> White Label
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Create branded instances of the platform for your clients.</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-1">
          <Plus className="w-4 h-4" /> New Config
        </Button>
      </div>

      {/* Enterprise notice */}
      <div className="bg-gradient-to-r from-primary/10 to-purple-500/10 border border-primary/20 rounded-lg p-4">
        <p className="text-sm text-foreground font-medium">Enterprise Feature</p>
        <p className="text-xs text-muted-foreground mt-1">White-label requires an Enterprise tier subscription. Configs created in draft mode can be activated after upgrade.</p>
      </div>

      {showCreate && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Config Form */}
          <div className="bg-card border border-border rounded-lg p-5 space-y-4">
            <h2 className="font-semibold text-foreground">Configuration Wizard</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-muted-foreground">Brand Name</label>
                <input className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground" placeholder="Your Brand" value={form.brandName} onChange={e => setForm({ ...form, brandName: e.target.value })} />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Logo URL</label>
                <input className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground" placeholder="https://..." value={form.logoUrl} onChange={e => setForm({ ...form, logoUrl: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-muted-foreground flex items-center gap-1"><Palette className="w-3 h-3" /> Primary Color</label>
                <div className="flex items-center gap-2 mt-1">
                  <input type="color" value={form.primaryColor} onChange={e => setForm({ ...form, primaryColor: e.target.value })} className="w-10 h-10 rounded border border-border cursor-pointer" />
                  <input className="flex-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground" value={form.primaryColor} onChange={e => setForm({ ...form, primaryColor: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="text-sm text-muted-foreground flex items-center gap-1"><Palette className="w-3 h-3" /> Secondary Color</label>
                <div className="flex items-center gap-2 mt-1">
                  <input type="color" value={form.secondaryColor} onChange={e => setForm({ ...form, secondaryColor: e.target.value })} className="w-10 h-10 rounded border border-border cursor-pointer" />
                  <input className="flex-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground" value={form.secondaryColor} onChange={e => setForm({ ...form, secondaryColor: e.target.value })} />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-muted-foreground flex items-center gap-1"><Globe className="w-3 h-3" /> Custom Domain</label>
                <input className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground" placeholder="app.yourbrand.com" value={form.customDomain} onChange={e => setForm({ ...form, customDomain: e.target.value })} />
              </div>
              <div>
                <label className="text-sm text-muted-foreground flex items-center gap-1"><Users className="w-3 h-3" /> Max Users</label>
                <input type="range" min={1} max={100} value={form.maxUsers} onChange={e => setForm({ ...form, maxUsers: Number(e.target.value) })} className="w-full mt-3" />
                <span className="text-xs text-muted-foreground">{form.maxUsers} users</span>
              </div>
            </div>

            {/* Feature Toggle Grid */}
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">Features to Include</label>
              <div className="grid grid-cols-3 gap-2">
                {AVAILABLE_FEATURES.map(f => {
                  const enabled = form.features.includes(f.id);
                  return (
                    <button
                      key={f.id}
                      onClick={() => {
                        if (enabled) setForm({ ...form, features: form.features.filter(x => x !== f.id) });
                        else setForm({ ...form, features: [...form.features, f.id] });
                      }}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs border transition-colors ${
                        enabled ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-secondary"
                      }`}
                    >
                      {enabled ? <CheckCircle className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
                      {f.id}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={() => createConfig.mutate()} disabled={!form.brandName}>Create Config</Button>
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            </div>
          </div>

          {/* Live Theme Preview */}
          <div className="bg-card border border-border rounded-lg p-5 space-y-4">
            <h2 className="font-semibold text-foreground flex items-center gap-2"><Eye className="w-4 h-4" /> Live Preview</h2>

            <div className="bg-background rounded-lg overflow-hidden border border-border">
              {/* Mini sidebar */}
              <div className="flex h-64">
                <div className="w-48 flex-shrink-0 p-3 space-y-2" style={{ backgroundColor: livePreview.primaryColor + "15", borderRight: `1px solid ${livePreview.primaryColor}30` }}>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-7 h-7 rounded-md flex items-center justify-center text-white font-bold text-xs" style={{ backgroundColor: livePreview.primaryColor }}>
                      {(livePreview.brandName || "B")[0].toUpperCase()}
                    </div>
                    <span className="text-sm font-semibold text-foreground">{livePreview.brandName || "Your Brand"}</span>
                  </div>
                  {form.features.slice(0, 6).map(f => (
                    <div key={f} className="flex items-center gap-2 px-2 py-1.5 rounded text-xs text-foreground/80 hover:bg-white/5 cursor-default" style={{ color: livePreview.primaryColor }}>
                      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: livePreview.secondaryColor }} />
                      {f}
                    </div>
                  ))}
                </div>

                {/* Mini header + content */}
                <div className="flex-1 flex flex-col">
                  <div className="h-10 px-4 flex items-center border-b border-border" style={{ backgroundColor: livePreview.primaryColor + "08" }}>
                    <span className="text-xs font-medium text-foreground">Dashboard</span>
                  </div>
                  <div className="flex-1 p-4 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      {[1, 2, 3, 4].map(i => (
                        <div key={i} className="h-12 rounded-md border border-border" style={{ backgroundColor: i === 1 ? livePreview.primaryColor + "10" : undefined }} />
                      ))}
                    </div>
                    <div className="h-16 rounded-md border border-border" style={{ borderColor: livePreview.secondaryColor + "40" }} />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-4 rounded border border-border" style={{ backgroundColor: livePreview.primaryColor }} />
                Primary
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-4 rounded border border-border" style={{ backgroundColor: livePreview.secondaryColor }} />
                Secondary
              </div>
              <span className="ml-auto">{form.features.length} features enabled</span>
            </div>
          </div>
        </div>
      )}

      {configs.length === 0 && !showCreate && (
        <div className="text-center py-16 text-muted-foreground">
          <Building2 className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p>No white-label configs. Create one to get started.</p>
        </div>
      )}

      {/* Config Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {configs.map(config => {
          const features = parseFeatures(config.features);
          const deploy = getDeployProgress(config);
          const isReady = deploy.done === deploy.total;

          return (
            <div key={config.id} className="bg-card border border-border rounded-lg p-5 space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-md flex items-center justify-center text-white font-bold" style={{ backgroundColor: config.primaryColor }}>
                    {config.brandName[0].toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">{config.brandName}</h3>
                    {config.customDomain && <span className="text-xs text-muted-foreground">{config.customDomain}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <span className={`px-2 py-0.5 rounded text-xs ${isReady ? 'bg-emerald-500/10 text-emerald-400' : 'bg-yellow-500/10 text-yellow-400'}`}>
                    {isReady ? "Ready to Deploy" : "Draft"}
                  </span>
                </div>
              </div>

              {/* Colors */}
              <div className="flex gap-2">
                <div className="w-5 h-5 rounded border border-border" style={{ backgroundColor: config.primaryColor }} title="Primary" />
                <div className="w-5 h-5 rounded border border-border" style={{ backgroundColor: config.secondaryColor }} title="Secondary" />
                <span className="text-xs text-muted-foreground ml-2">{config.maxUsers} max users</span>
              </div>

              {/* Features */}
              {features.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {features.map(f => (
                    <span key={f} className="px-2 py-0.5 rounded-full text-[10px] bg-secondary text-muted-foreground">{f}</span>
                  ))}
                </div>
              )}

              {/* Deploy Checklist */}
              <div className="space-y-1">
                <p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wider">Deploy Checklist ({deploy.done}/{deploy.total})</p>
                <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(deploy.done / deploy.total) * 100}%` }} />
                </div>
                <div className="grid grid-cols-2 gap-1 mt-2">
                  {deploy.items.map(item => (
                    <div key={item.key} className="flex items-center gap-1.5 text-[10px]">
                      {item.ok ? <CheckCircle className="w-3 h-3 text-emerald-400" /> : <Circle className="w-3 h-3 text-muted-foreground" />}
                      <span className={item.ok ? "text-foreground" : "text-muted-foreground"}>{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2 border-t border-border">
                <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={() => setPreviewConfig(config)}>
                  <Eye className="w-3 h-3" /> Preview
                </Button>
                <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={() => exportConfig(config)}>
                  <Download className="w-3 h-3" /> Export
                </Button>
                <Button variant="ghost" size="sm" className="h-7 ml-auto" onClick={() => deleteConfig.mutate(config.id)}>
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Preview Modal */}
      {previewConfig && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setPreviewConfig(null)}>
          <div className="bg-card border border-border rounded-xl max-w-2xl w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-foreground">Preview: {previewConfig.brandName}</h2>
              <Button variant="ghost" size="sm" onClick={() => setPreviewConfig(null)}>Close</Button>
            </div>
            <div className="bg-background rounded-lg overflow-hidden border border-border">
              <div className="flex h-72">
                <div className="w-52 flex-shrink-0 p-3 space-y-2" style={{ backgroundColor: previewConfig.primaryColor + "15", borderRight: `1px solid ${previewConfig.primaryColor}30` }}>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 rounded-md flex items-center justify-center text-white font-bold text-sm" style={{ backgroundColor: previewConfig.primaryColor }}>
                      {previewConfig.brandName[0].toUpperCase()}
                    </div>
                    <span className="text-sm font-semibold" style={{ color: previewConfig.primaryColor }}>{previewConfig.brandName}</span>
                  </div>
                  {parseFeatures(previewConfig.features).map(f => (
                    <div key={f} className="flex items-center gap-2 px-2 py-1.5 rounded text-xs text-foreground/80">
                      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: previewConfig.secondaryColor }} />
                      {f}
                    </div>
                  ))}
                </div>
                <div className="flex-1 flex flex-col">
                  <div className="h-11 px-4 flex items-center border-b border-border" style={{ backgroundColor: previewConfig.primaryColor + "08" }}>
                    <span className="text-sm font-medium text-foreground">Dashboard</span>
                  </div>
                  <div className="flex-1 p-4 grid grid-cols-2 gap-3">
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} className="rounded-lg border border-border p-3" style={{ backgroundColor: i === 1 ? previewConfig.primaryColor + "10" : undefined }}>
                        <div className="h-2 w-12 rounded bg-muted mb-2" />
                        <div className="h-5 w-16 rounded" style={{ backgroundColor: previewConfig.primaryColor + "20" }} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      <AIChatPanel
        systemPrompt="You are a brand consultant. Help the user design their white-label platform. Ask about their brand identity, target audience, color preferences, and which features they want to enable."
        placeholder="Describe your brand vision..."
        pageContext="white-label"
      />
    </div>
  );
}
