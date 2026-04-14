import { useTheme } from "@/contexts/ThemeContext";
import { useState } from "react";
import { Sun, Moon, X, Check, Palette, Image, Layers, Layout } from "lucide-react";

// ── Preset accent colors ──────────────────────────────────────────────────────
const ACCENT_COLORS = [
  { label: "Indigo",  value: "#6366f1" },
  { label: "Blue",    value: "#3b82f6" },
  { label: "Cyan",    value: "#06b6d4" },
  { label: "Emerald", value: "#10b981" },
  { label: "Green",   value: "#22c55e" },
  { label: "Purple",  value: "#a855f7" },
  { label: "Pink",    value: "#ec4899" },
  { label: "Rose",    value: "#f43f5e" },
  { label: "Orange",  value: "#f97316" },
  { label: "Amber",   value: "#f59e0b" },
];

// ── Curated wallpaper gallery ─────────────────────────────────────────────────
const WALLPAPERS = [
  {
    id: "dark-abstract",
    label: "Dark Abstract",
    url: "https://images.unsplash.com/photo-1534796636912-3b95b3ab5986?w=1920",
    thumb: "https://images.unsplash.com/photo-1534796636912-3b95b3ab5986?w=400",
  },
  {
    id: "neon-city",
    label: "Neon City",
    url: "https://images.unsplash.com/photo-1515705576963-95cad62945b6?w=1920",
    thumb: "https://images.unsplash.com/photo-1515705576963-95cad62945b6?w=400",
  },
  {
    id: "space",
    label: "Space",
    url: "https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=1920",
    thumb: "https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=400",
  },
  {
    id: "mountains",
    label: "Mountains",
    url: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920",
    thumb: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400",
  },
  {
    id: "ocean",
    label: "Ocean",
    url: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1920",
    thumb: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400",
  },
  {
    id: "forest",
    label: "Forest",
    url: "https://images.unsplash.com/photo-1448375240586-882707db888b?w=1920",
    thumb: "https://images.unsplash.com/photo-1448375240586-882707db888b?w=400",
  },
  {
    id: "gradient-1",
    label: "Gradient I",
    url: "https://images.unsplash.com/photo-1557682250-33bd709cbe85?w=1920",
    thumb: "https://images.unsplash.com/photo-1557682250-33bd709cbe85?w=400",
  },
  {
    id: "gradient-2",
    label: "Gradient II",
    url: "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=1920",
    thumb: "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=400",
  },
  {
    id: "cyberpunk",
    label: "Cyberpunk",
    url: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=1920",
    thumb: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=400",
  },
  {
    id: "northern-lights",
    label: "Northern Lights",
    url: "https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=1920",
    thumb: "https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=400",
  },
  {
    id: "dark-texture",
    label: "Dark Texture",
    url: "https://images.unsplash.com/photo-1557683316-973673baf926?w=1920",
    thumb: "https://images.unsplash.com/photo-1557683316-973673baf926?w=400",
  },
];

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description?: string }) {
  return (
    <div className="flex items-start gap-3 mb-5">
      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
    </div>
  );
}

// ── Slider ────────────────────────────────────────────────────────────────────
function StyledSlider({
  label,
  min,
  max,
  step,
  value,
  onChange,
  format,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  const display = format ? format(value) : String(value);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs font-mono text-foreground bg-secondary px-1.5 py-0.5 rounded">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer
          bg-secondary accent-primary
          [&::-webkit-slider-thumb]:appearance-none
          [&::-webkit-slider-thumb]:w-4
          [&::-webkit-slider-thumb]:h-4
          [&::-webkit-slider-thumb]:rounded-full
          [&::-webkit-slider-thumb]:bg-primary
          [&::-webkit-slider-thumb]:cursor-pointer
          [&::-webkit-slider-thumb]:shadow-sm"
      />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function CustomizationPage() {
  const {
    theme, setTheme,
    accentColor, setCustomization,
    wallpaperUrl, wallpaperTint,
    glassBlur, glassOpacity,
    sidebarPosition, compactMode,
  } = useTheme();

  const [customUrlInput, setCustomUrlInput] = useState("");

  const isWallpaperActive = (url: string | null) =>
    url === wallpaperUrl && wallpaperUrl !== null;

  const applyWallpaper = (url: string | null) => {
    setCustomization({
      wallpaperUrl: url,
      wallpaperType: url ? "image" : "none",
    });
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <Palette className="w-5 h-5 text-primary" />
          Appearance
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Personalize your workspace. Changes apply instantly.
        </p>
      </div>

      {/* ── Section A: Theme ── */}
      <section className="bg-card border border-border rounded-xl p-5">
        <SectionHeader icon={Sun} title="Theme" description="Switch between dark and light mode" />

        {/* Dark / Light toggle */}
        <div className="flex gap-3 mb-6">
          {(["dark", "light"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg border text-sm font-medium transition-all ${
                theme === t
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
              }`}
            >
              {t === "dark" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              {t === "dark" ? "Dark" : "Light"}
              {theme === t && <Check className="w-3 h-3 ml-auto" />}
            </button>
          ))}
        </div>

        {/* Accent color */}
        <div>
          <p className="text-xs text-muted-foreground mb-3">Accent color</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {ACCENT_COLORS.map((c) => (
              <button
                key={c.value}
                title={c.label}
                onClick={() => setCustomization({ accentColor: c.value })}
                className="w-7 h-7 rounded-full border-2 transition-all flex items-center justify-center"
                style={{
                  backgroundColor: c.value,
                  borderColor: accentColor === c.value ? "white" : "transparent",
                  boxShadow: accentColor === c.value ? `0 0 0 1px ${c.value}` : "none",
                }}
              >
                {accentColor === c.value && (
                  <Check className="w-3 h-3 text-white drop-shadow" />
                )}
              </button>
            ))}
          </div>

          {/* Custom color input */}
          <div className="flex items-center gap-2 mt-3">
            <div
              className="w-7 h-7 rounded-full border-2 border-border flex-shrink-0"
              style={{ backgroundColor: accentColor }}
            />
            <label className="text-xs text-muted-foreground">Custom:</label>
            <input
              type="color"
              value={accentColor}
              onChange={(e) => setCustomization({ accentColor: e.target.value })}
              className="w-10 h-7 rounded cursor-pointer border border-border bg-transparent p-0.5"
            />
            <span className="text-xs font-mono text-muted-foreground">{accentColor}</span>
          </div>

          {/* Preview chip */}
          <div className="mt-4 flex items-center gap-3">
            <div
              className="px-3 py-1.5 rounded-md text-xs font-medium text-white"
              style={{ backgroundColor: accentColor }}
            >
              Button preview
            </div>
            <div
              className="px-3 py-1.5 rounded-md text-xs font-medium border"
              style={{ borderColor: accentColor, color: accentColor }}
            >
              Outline preview
            </div>
            <div
              className="px-3 py-1.5 rounded-md text-xs font-medium"
              style={{ backgroundColor: `${accentColor}20`, color: accentColor }}
            >
              Subtle preview
            </div>
          </div>
        </div>
      </section>

      {/* ── Section B: Wallpaper ── */}
      <section className="bg-card border border-border rounded-xl p-5">
        <SectionHeader
          icon={Image}
          title="Wallpaper"
          description="Set a background image for your workspace"
        />

        {/* Gallery grid */}
        <div className="grid grid-cols-4 gap-2 mb-5">
          {/* No Wallpaper option */}
          <button
            onClick={() => applyWallpaper(null)}
            className={`relative aspect-video rounded-xl border-2 flex items-center justify-center transition-all overflow-hidden ${
              !wallpaperUrl
                ? "border-primary bg-primary/10"
                : "border-border hover:border-primary/50 bg-secondary"
            }`}
          >
            <div className="flex flex-col items-center gap-1">
              <X className="w-5 h-5 text-muted-foreground" />
              <span className="text-[9px] text-muted-foreground font-medium">None</span>
            </div>
            {!wallpaperUrl && (
              <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                <Check className="w-2.5 h-2.5 text-white" />
              </div>
            )}
          </button>

          {/* Wallpaper thumbnails */}
          {WALLPAPERS.map((wp) => {
            const active = isWallpaperActive(wp.url);
            return (
              <button
                key={wp.id}
                onClick={() => applyWallpaper(wp.url)}
                title={wp.label}
                className={`relative aspect-video rounded-xl border-2 overflow-hidden transition-all ${
                  active
                    ? "border-primary ring-1 ring-primary/50"
                    : "border-transparent hover:border-primary/50"
                }`}
              >
                <img
                  src={wp.thumb}
                  alt={wp.label}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                {active && (
                  <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                    <Check className="w-2.5 h-2.5 text-white" />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/0 hover:bg-black/10 transition-colors" />
              </button>
            );
          })}
        </div>

        {/* Custom URL */}
        <div className="flex gap-2 mb-5">
          <input
            type="url"
            placeholder="Paste a custom image URL..."
            value={customUrlInput}
            onChange={(e) => setCustomUrlInput(e.target.value)}
            className="flex-1 px-3 py-2 text-sm rounded-lg border border-border bg-secondary text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
          />
          <button
            onClick={() => {
              if (customUrlInput.trim()) {
                applyWallpaper(customUrlInput.trim());
                setCustomUrlInput("");
              }
            }}
            className="px-3 py-2 text-sm rounded-lg bg-primary text-white font-medium hover:bg-primary/90 transition-colors"
          >
            Apply
          </button>
        </div>

        {/* Tint slider */}
        <StyledSlider
          label="Tint intensity"
          min={0}
          max={0.8}
          step={0.01}
          value={wallpaperTint}
          onChange={(v) => setCustomization({ wallpaperTint: v })}
          format={(v) => `${Math.round(v * 100)}%`}
        />
      </section>

      {/* ── Section C: Glass Effect ── */}
      <section className="bg-card border border-border rounded-xl p-5">
        <SectionHeader
          icon={Layers}
          title="Glass Effect"
          description="Glassmorphism applied to the sidebar and top bar when a wallpaper is active"
        />

        <div className="grid grid-cols-2 gap-6 mb-5">
          <StyledSlider
            label="Blur intensity"
            min={0}
            max={30}
            step={1}
            value={glassBlur}
            onChange={(v) => setCustomization({ glassBlur: v })}
            format={(v) => `${v}px`}
          />
          <StyledSlider
            label="Panel opacity"
            min={0}
            max={0.3}
            step={0.01}
            value={glassOpacity}
            onChange={(v) => setCustomization({ glassOpacity: v })}
            format={(v) => `${Math.round(v * 100)}%`}
          />
        </div>

        {/* Glass preview panel */}
        <div className="relative rounded-xl overflow-hidden h-24 border border-border">
          {/* Fake background */}
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage: wallpaperUrl
                ? `url(${wallpaperUrl})`
                : "linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4338ca 100%)",
            }}
          />
          {/* Tint */}
          <div
            className="absolute inset-0"
            style={{ background: `rgba(0,0,0,${wallpaperTint})` }}
          />
          {/* Glass panel */}
          <div
            className="absolute inset-4 rounded-lg border border-white/10 flex items-center justify-center"
            style={{
              backdropFilter: `blur(${glassBlur}px)`,
              WebkitBackdropFilter: `blur(${glassBlur}px)`,
              background: `rgba(15,15,20,${glassOpacity})`,
            }}
          >
            <span className="text-xs font-medium text-white/80">Glass panel preview</span>
          </div>
        </div>
      </section>

      {/* ── Section D: Layout ── */}
      <section className="bg-card border border-border rounded-xl p-5">
        <SectionHeader icon={Layout} title="Layout" description="Configure sidebar position and density" />

        <div className="space-y-4">
          {/* Sidebar position */}
          <div>
            <p className="text-xs text-muted-foreground mb-2">Sidebar position</p>
            <div className="flex gap-2">
              {(["left", "right"] as const).map((pos) => (
                <button
                  key={pos}
                  onClick={() => setCustomization({ sidebarPosition: pos })}
                  className={`flex-1 py-2 px-4 rounded-lg border text-sm font-medium capitalize transition-all ${
                    sidebarPosition === pos
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                  }`}
                >
                  {pos === sidebarPosition && <Check className="w-3 h-3 inline mr-1.5" />}
                  {pos}
                </button>
              ))}
            </div>
            {sidebarPosition === "right" && (
              <p className="text-[11px] text-muted-foreground mt-2 italic">
                Note: Right sidebar layout requires a page refresh to fully apply.
              </p>
            )}
          </div>

          {/* Compact mode */}
          <div className="flex items-center justify-between py-3 border-t border-border">
            <div>
              <p className="text-sm font-medium text-foreground">Compact mode</p>
              <p className="text-xs text-muted-foreground">Reduce padding and margins throughout the UI</p>
            </div>
            <button
              onClick={() => setCustomization({ compactMode: compactMode ? 0 : 1 })}
              className={`relative w-10 h-5.5 rounded-full transition-colors flex-shrink-0 ${
                compactMode ? "bg-primary" : "bg-secondary border border-border"
              }`}
              style={{ height: "22px", width: "40px" }}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                  compactMode ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        </div>
      </section>

      {/* Footer note */}
      <p className="text-xs text-muted-foreground text-center pb-4">
        All changes are saved automatically.
      </p>
    </div>
  );
}
