import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Cpu, ChevronDown, Zap, Key, Search, Sparkles, Globe, Palette } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import {
  AI_PROVIDERS,
  FEATURED_MODELS,
  BADGE_CONFIG,
  COST_TIER_CONFIG,
  getProvider,
  findModel,
  isImageModel,
  type AIModel,
  type AIProvider,
  type ModelBadge,
  type CostTier,
} from "@/lib/ai-providers";

interface UserApiKey {
  id: string;
  provider: string;
  apiKey: string | null;
  endpointUrl: string | null;
  defaultModel: string | null;
  isDefault: number;
  isActive: number;
}

interface ModelSelectorProps {
  value?: { provider: string; model: string } | null;
  onChange?: (val: { provider: string; model: string } | null) => void;
  compact?: boolean;
}

function BadgePill({ badge }: { badge: ModelBadge }) {
  const config = BADGE_CONFIG[badge];
  if (!config) return null;
  return (
    <span className={`inline-flex items-center px-1.5 py-0 rounded text-[8px] font-medium border ${config.color}`}>
      {config.label}
    </span>
  );
}

function CostIndicator({ tier }: { tier?: CostTier }) {
  if (!tier) return null;
  const config = COST_TIER_CONFIG[tier];
  return <span className={`text-[9px] font-mono ${config.color}`}>{config.label}</span>;
}

export default function ModelSelector({ value, onChange, compact }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: apiKeys = [] } = useQuery<UserApiKey[]>({
    queryKey: ["/api/user-api-keys"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/user-api-keys");
      return res.json();
    },
  });

  const activeProviders = apiKeys.filter(k => k.isActive);
  const defaultKey = apiKeys.find(k => k.isDefault);

  useEffect(() => {
    if (!value && defaultKey && onChange) {
      const provInfo = getProvider(defaultKey.provider);
      onChange({
        provider: defaultKey.provider,
        model: defaultKey.defaultModel || provInfo?.models[0]?.id || "",
      });
    }
  }, [defaultKey]);

  // Determine display label
  const displayInfo = useMemo(() => {
    if (!value) return { icon: "⚡", label: "Auto", sublabel: "Smart Routing" };
    if (value.model === "auto") return { icon: "✨", label: "Auto", sublabel: "Smart Routing" };
    const found = findModel(value.model);
    if (found) {
      return {
        icon: found.provider.icon,
        label: found.model.name,
        sublabel: found.provider.name,
      };
    }
    const prov = getProvider(value.provider);
    return {
      icon: prov?.icon || "🤖",
      label: value.model,
      sublabel: prov?.name || value.provider,
    };
  }, [value]);

  // Filter models by search — separate chat models from image models
  const filteredProviders = useMemo(() => {
    const providers = search.trim()
      ? AI_PROVIDERS.map(p => ({
          ...p,
          models: p.models.filter(m =>
            m.name.toLowerCase().includes(search.toLowerCase()) ||
            m.id.toLowerCase().includes(search.toLowerCase()) ||
            p.name.toLowerCase().includes(search.toLowerCase()) ||
            (m.badges || []).some(b => b.includes(search.toLowerCase()))
          ),
        })).filter(p => p.models.length > 0)
      : AI_PROVIDERS;

    // Split into chat and image for each provider
    return providers.map(p => ({
      ...p,
      models: p.models.filter(m => !isImageModel(m)),
    })).filter(p => p.models.length > 0);
  }, [search]);

  // Collect all image models across providers for the dedicated section
  const imageModels = useMemo(() => {
    const q = search.toLowerCase();
    const results: Array<{ model: AIModel; provider: AIProvider }> = [];
    for (const p of AI_PROVIDERS) {
      for (const m of p.models) {
        if (!isImageModel(m)) continue;
        if (search.trim() && !(
          m.name.toLowerCase().includes(q) ||
          m.id.toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q) ||
          (m.badges || []).some(b => b.includes(q))
        )) continue;
        results.push({ model: m, provider: p });
      }
    }
    return results;
  }, [search]);

  const featuredFiltered = useMemo(() => {
    if (!search.trim()) return FEATURED_MODELS;
    const q = search.toLowerCase();
    return FEATURED_MODELS.filter(m =>
      m.name.toLowerCase().includes(q) ||
      m.id.toLowerCase().includes(q) ||
      (m.badges || []).some(b => b.includes(q))
    );
  }, [search]);

  return (
    <div className="relative">
      <button
        onClick={() => { setOpen(!open); setSearch(""); }}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-md border border-border bg-background hover:bg-secondary transition-colors ${
          compact ? "text-[10px]" : "text-xs"
        } text-foreground`}
      >
        <span>{displayInfo.icon}</span>
        <span className="truncate max-w-[140px]">{displayInfo.label}</span>
        <ChevronDown className={`w-3 h-3 transition-transform flex-shrink-0 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 w-80 bg-card border border-border rounded-lg shadow-lg overflow-hidden">
            {/* Search */}
            <div className="p-2 border-b border-border">
              <div className="flex items-center gap-2 px-2 py-1 bg-secondary rounded-md">
                <Search className="w-3 h-3 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search models..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
                  autoFocus
                />
              </div>
            </div>

            <div className="max-h-[420px] overflow-y-auto">
              {/* Featured Models */}
              {featuredFiltered.length > 0 && (
                <div>
                  <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground flex items-center gap-1.5 bg-muted/30 sticky top-0 z-10">
                    <Sparkles className="w-3 h-3" />
                    Featured Models
                  </div>
                  {featuredFiltered.map(model => (
                    <ModelRow
                      key={model.id}
                      model={model}
                      isSelected={value?.model === model.id || (!value && model.id === "auto")}
                      onClick={() => {
                        if (model.id === "auto") {
                          onChange?.({ provider: "auto", model: "auto" });
                        } else {
                          const found = findModel(model.id);
                          if (found) onChange?.({ provider: found.provider.id, model: model.id });
                        }
                        setOpen(false);
                      }}
                    />
                  ))}
                </div>
              )}

              {/* Bunz Default */}
              <div className="border-t border-border">
                <button
                  onClick={() => { onChange?.(null); setOpen(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-secondary transition-colors ${
                    !value ? "bg-primary/10 text-primary" : "text-foreground"
                  }`}
                >
                  <Zap className="w-3 h-3" />
                  <span>Bunz Default (uses tokens)</span>
                </button>
              </div>

              {/* BYOK providers */}
              {activeProviders.length > 0 && (
                <div className="border-t border-border">
                  <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground flex items-center gap-1.5 bg-muted/30 sticky top-0 z-10">
                    <Key className="w-3 h-3" />
                    Your API Keys
                  </div>
                  {activeProviders.map(key => {
                    const provInfo = getProvider(key.provider);
                    if (!provInfo) return null;
                    const filtered = provInfo.models.filter(m => {
                      if (!search.trim()) return true;
                      const q = search.toLowerCase();
                      return m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q);
                    });
                    if (filtered.length === 0) return null;
                    return (
                      <div key={key.id}>
                        <div className="px-3 py-1 text-[9px] font-semibold text-muted-foreground/70 flex items-center gap-1.5 pl-5">
                          {provInfo.icon} {provInfo.name}
                          {key.isDefault && <span className="text-primary">(default)</span>}
                        </div>
                        {filtered.map(model => (
                          <ModelRow
                            key={model.id}
                            model={model}
                            isSelected={value?.provider === key.provider && value?.model === model.id}
                            indent
                            onClick={() => {
                              onChange?.({ provider: key.provider, model: model.id });
                              setOpen(false);
                            }}
                          />
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* All providers */}
              {filteredProviders.map(provider => (
                <div key={provider.id} className="border-t border-border">
                  <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground flex items-center gap-1.5 bg-muted/30 sticky top-0 z-10">
                    <span>{provider.icon}</span>
                    <span>{provider.name}</span>
                    {provider.isTier2 && (
                      <span className="flex items-center gap-0.5 text-[8px] text-muted-foreground/60 ml-auto">
                        <Globe className="w-2.5 h-2.5" /> Gateway
                      </span>
                    )}
                  </div>
                  {provider.models.map(model => (
                    <ModelRow
                      key={model.id}
                      model={model}
                      isSelected={value?.provider === provider.id && value?.model === model.id}
                      onClick={() => {
                        onChange?.({ provider: provider.id, model: model.id });
                        setOpen(false);
                      }}
                    />
                  ))}
                </div>
              ))}

              {/* Image Generation Models */}
              {imageModels.length > 0 && (
                <div className="border-t border-border">
                  <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground flex items-center gap-1.5 bg-muted/30 sticky top-0 z-10">
                    <Palette className="w-3 h-3" />
                    Image Generation
                  </div>
                  {imageModels.map(({ model, provider }) => (
                    <ModelRow
                      key={`${provider.id}-${model.id}`}
                      model={model}
                      isSelected={value?.provider === provider.id && value?.model === model.id}
                      onClick={() => {
                        onChange?.({ provider: provider.id, model: model.id });
                        setOpen(false);
                      }}
                    />
                  ))}
                </div>
              )}

              {/* OpenRouter callout */}
              <div className="border-t border-border p-3 bg-muted/10">
                <p className="text-[10px] text-muted-foreground text-center">
                  <Globe className="w-3 h-3 inline mr-1" />
                  300+ models available via OpenRouter
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ModelRow({
  model,
  isSelected,
  indent,
  onClick,
}: {
  model: AIModel;
  isSelected: boolean;
  indent?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs text-left hover:bg-secondary transition-colors ${
        isSelected ? "bg-primary/10 text-primary" : "text-foreground"
      }`}
    >
      <div className={`flex items-center gap-2 min-w-0 ${indent ? "pl-4" : "pl-1"}`}>
        <span className="truncate">{model.name}</span>
        <div className="flex items-center gap-1 flex-shrink-0">
          {(model.badges || []).slice(0, 2).map(b => (
            <BadgePill key={b} badge={b} />
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <CostIndicator tier={model.costTier} />
        {model.context && (
          <span className="text-[9px] text-muted-foreground/60">{model.context}</span>
        )}
      </div>
    </button>
  );
}
