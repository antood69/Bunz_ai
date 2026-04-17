import { useState, useEffect, lazy, Suspense } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  User, Palette, Plug, Coins, CreditCard, Brain, Sun, Moon, Lock,
  Trash2, Save, Loader2, Check, X, Image, Layers, Layout,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Lazy imports for embedded page tabs
const ConnectorsPage = lazy(() => import("@/pages/ConnectorsPage"));
const TokenUsagePage = lazy(() => import("@/pages/TokenUsagePage"));
const PricingPage = lazy(() => import("@/pages/PricingPage"));

// ── Preset accent colors (mirrored from CustomizationPage) ──────────────────
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

// ── Curated wallpaper gallery (mirrored from CustomizationPage) ─────────────
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

// ── Common AI models for the preferences tab ────────────────────────────────
const AI_MODELS = [
  { id: "gpt-5.4", label: "GPT-5.4" },
  { id: "gpt-5.4-mini", label: "GPT-5.4 Mini" },
  { id: "gpt-5.4-nano", label: "GPT-5.4 Nano" },
  { id: "claude-opus-4-6", label: "Claude Opus 4.6" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
  { id: "gemini-3.1-pro", label: "Gemini 3.1 Pro" },
  { id: "gemini-3-flash", label: "Gemini 3 Flash" },
  { id: "sonar-pro", label: "Perplexity Sonar Pro" },
];

const RESPONSE_STYLES = [
  { id: "concise", label: "Concise", description: "Short, to-the-point answers" },
  { id: "balanced", label: "Balanced", description: "Clear answers with moderate detail" },
  { id: "detailed", label: "Detailed", description: "Thorough explanations with examples" },
];

// ── Valid tab values ────────────────────────────────────────────────────────
const VALID_TABS = ["general", "appearance", "connectors", "usage", "pricing", "ai-preferences"] as const;
type TabValue = (typeof VALID_TABS)[number];

function isValidTab(value: string): value is TabValue {
  return (VALID_TABS as readonly string[]).includes(value);
}

function getInitialTab(initialTabProp?: string): TabValue {
  // 1. Check prop
  if (initialTabProp && isValidTab(initialTabProp)) {
    return initialTabProp;
  }
  // 2. Check URL hash query param: /#/settings?tab=appearance
  try {
    const hash = window.location.hash; // e.g. "#/settings?tab=appearance"
    const qIdx = hash.indexOf("?");
    if (qIdx !== -1) {
      const params = new URLSearchParams(hash.slice(qIdx));
      const tabParam = params.get("tab");
      if (tabParam && isValidTab(tabParam)) {
        return tabParam;
      }
    }
  } catch {
    // ignore
  }
  return "general";
}

// ── Styled slider (from CustomizationPage) ──────────────────────────────────
function StyledSlider({
  label, min, max, step, value, onChange, format,
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

// ── Section header (from CustomizationPage) ─────────────────────────────────
function SectionHeader({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description?: string }) {
  return (
    <div className="flex items-start gap-3 mb-5">
      <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
    </div>
  );
}

// ── Tab loading fallback ────────────────────────────────────────────────────
function TabLoader() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// GENERAL TAB
// ═══════════════════════════════════════════════════════════════════════════════
function GeneralTab() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const changePasswordMutation = useMutation({
    mutationFn: async () => {
      if (newPassword !== confirmPassword) {
        throw new Error("Passwords do not match");
      }
      if (newPassword.length < 8) {
        throw new Error("Password must be at least 8 characters");
      }
      await apiRequest("POST", "/api/auth/change-password", {
        currentPassword,
        newPassword,
      });
    },
    onSuccess: () => {
      toast({ title: "Password changed successfully" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6">
      {/* Profile Info */}
      <section className="bg-card border border-border rounded-2xl p-6">
        <SectionHeader icon={User} title="Profile" description="Your account information" />
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Email</Label>
            <Input
              value={user?.email || ""}
              disabled
              className="bg-secondary text-foreground text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Display Name</Label>
            <Input
              value={user?.displayName || user?.email?.split("@")[0] || ""}
              disabled
              className="bg-secondary text-foreground text-sm"
            />
            <p className="text-[11px] text-muted-foreground">
              Display name is derived from your email. Contact support to change it.
            </p>
          </div>
        </div>
      </section>

      {/* Change Password */}
      <section className="bg-card border border-border rounded-2xl p-6">
        <SectionHeader icon={Lock} title="Change Password" description="Update your account password" />
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current-password" className="text-xs text-muted-foreground">Current Password</Label>
            <Input
              id="current-password"
              type="password"
              placeholder="Enter current password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="bg-secondary text-foreground text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password" className="text-xs text-muted-foreground">New Password</Label>
            <Input
              id="new-password"
              type="password"
              placeholder="Enter new password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="bg-secondary text-foreground text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password" className="text-xs text-muted-foreground">Confirm New Password</Label>
            <Input
              id="confirm-password"
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="bg-secondary text-foreground text-sm"
            />
          </div>
          <Button
            size="sm"
            className="text-xs"
            disabled={changePasswordMutation.isPending || !currentPassword || !newPassword || !confirmPassword}
            onClick={() => changePasswordMutation.mutate()}
          >
            {changePasswordMutation.isPending ? (
              <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
            ) : (
              <Save className="w-3 h-3 mr-1.5" />
            )}
            Update Password
          </Button>
        </div>
      </section>

      {/* Clear Chat History */}
      <section className="bg-card border border-border rounded-2xl p-6">
        <SectionHeader icon={Trash2} title="Chat History" description="Manage your Boss Chat conversations" />
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Clear All Conversations</p>
            <p className="text-xs text-muted-foreground mt-0.5">Delete all Boss Chat conversations and messages. This cannot be undone.</p>
          </div>
          <Button variant="destructive" size="sm" className="text-xs" onClick={async () => {
            if (!confirm("Are you sure? This will delete ALL your chat history.")) return;
            try {
              await fetch("/api/conversations", { method: "DELETE", credentials: "include" });
              localStorage.removeItem("bunz-conversations");
              toast({ title: "All conversations deleted" });
            } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
          }}>
            <Trash2 className="w-3 h-3 mr-1.5" />
            Clear All
          </Button>
        </div>
      </section>

      {/* Account Deletion */}
      <section className="bg-card border border-border rounded-2xl p-6">
        <SectionHeader icon={Trash2} title="Danger Zone" description="Irreversible account actions" />
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Delete Account</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Permanently delete your account and all associated data.
            </p>
          </div>
          <Button
            variant="destructive"
            size="sm"
            className="text-xs"
            disabled
            title="Contact support to delete your account"
          >
            <Trash2 className="w-3 h-3 mr-1.5" />
            Delete Account
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground mt-3 italic">
          Account deletion is not self-service. Please contact support to request account removal.
        </p>
      </section>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// APPEARANCE TAB
// ═══════════════════════════════════════════════════════════════════════════════
function AppearanceTab() {
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
    <div className="space-y-6">
      {/* Theme + Accent Color */}
      <section className="bg-card border border-border rounded-2xl p-6">
        <SectionHeader icon={Sun} title="Theme" description="Switch between dark and light mode" />

        {/* Dark / Light toggle */}
        <div className="flex gap-3 mb-6">
          {(["dark", "light"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border text-sm font-medium transition-all ${
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

      {/* Wallpaper */}
      <section className="bg-card border border-border rounded-2xl p-6">
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
            className="flex-1 px-3 py-2 text-sm rounded-xl border border-border bg-secondary text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
          />
          <button
            onClick={() => {
              if (customUrlInput.trim()) {
                applyWallpaper(customUrlInput.trim());
                setCustomUrlInput("");
              }
            }}
            className="px-3 py-2 text-sm rounded-xl bg-primary text-white font-medium hover:bg-primary/90 transition-colors"
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

      {/* Glass Effect */}
      <section className="bg-card border border-border rounded-2xl p-6">
        <SectionHeader
          icon={Layers}
          title="Glass Effect"
          description="Glassmorphism applied to the sidebar and top bar when a wallpaper is active"
        />

        <div className="grid grid-cols-2 gap-6 mb-6">
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
        <div className="relative rounded-2xl overflow-hidden h-36 border border-border">
          {/* Background — always show something visible */}
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage: wallpaperUrl
                ? `url(${wallpaperUrl})`
                : "linear-gradient(135deg, #7c3aed 0%, #3b82f6 30%, #06b6d4 60%, #10b981 100%)",
            }}
          />
          {/* Tint overlay */}
          <div
            className="absolute inset-0"
            style={{ background: `rgba(0,0,0,${wallpaperTint})` }}
          />
          {/* Glass panel */}
          <div
            className="absolute inset-4 rounded-xl border border-white/20 flex items-center justify-center shadow-xl"
            style={{
              backdropFilter: `blur(${glassBlur}px)`,
              WebkitBackdropFilter: `blur(${glassBlur}px)`,
              background: `rgba(255,255,255,${Math.max(glassOpacity, 0.03)})`,
            }}
          >
            <div className="text-center">
              <span className="text-sm font-medium text-white/90">Glass panel preview</span>
              <p className="text-[10px] text-white/50 mt-1">Blur: {glassBlur}px · Opacity: {Math.round(glassOpacity * 100)}%</p>
            </div>
          </div>
        </div>
      </section>

      {/* Layout */}
      <section className="bg-card border border-border rounded-2xl p-6">
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
                  className={`flex-1 py-2 px-4 rounded-xl border text-sm font-medium capitalize transition-all ${
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
              className={`relative rounded-full transition-colors flex-shrink-0 ${
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

      <p className="text-xs text-muted-foreground text-center pb-4">
        All changes are saved automatically.
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGENT CONFIG TYPES
// ═══════════════════════════════════════════════════════════════════════════════
interface AgentDefaults {
  [key: string]: { model: string; systemPrompt: string; label: string };
}

const AGENT_TYPES = [
  { id: "boss", label: "Boss (Orchestrator)", icon: "bot", description: "Routes requests to specialist agents" },
  { id: "coder", label: "Coder Agent", icon: "code", description: "Code generation, debugging, refactoring" },
  { id: "art", label: "Art Agent", icon: "palette", description: "Image generation and visual content" },
  { id: "reasoning", label: "Reasoning Agent", icon: "brain", description: "Complex analysis, math, logic" },
] as const;

const AGENT_MODELS: Record<string, Array<{ id: string; label: string }>> = {
  boss: [
    { id: "gpt-5.4-mini", label: "GPT-5.4 Mini (fast routing)" },
    { id: "gpt-5.4", label: "GPT-5.4" },
    { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  ],
  coder: [
    { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (best at code)" },
    { id: "gpt-5.4", label: "GPT-5.4" },
    { id: "gpt-5.4-mini", label: "GPT-5.4 Mini" },
    { id: "claude-opus-4-6", label: "Claude Opus 4.6" },
  ],
  art: [
    { id: "gpt-image-1", label: "GPT Image 1 (OpenAI)" },
    { id: "openai/gpt-image-1", label: "GPT Image 1 (OpenRouter)" },
    { id: "imagen-3.0-generate-002", label: "Imagen 3 (Google)" },
  ],
  reasoning: [
    { id: "gpt-5.4", label: "GPT-5.4 (strongest reasoning)" },
    { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
    { id: "claude-opus-4-6", label: "Claude Opus 4.6" },
    { id: "deepseek/deepseek-r1", label: "DeepSeek R1 (OpenRouter)" },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// AI PREFERENCES TAB
// ═══════════════════════════════════════════════════════════════════════════════
function AIPreferencesTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: preferences } = useQuery<{
    defaultModel: string;
    systemPrompt: string;
    responseStyle: string;
  }>({
    queryKey: ["ai-preferences"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/user/ai-preferences");
        return res.json();
      } catch {
        return { defaultModel: "gpt-5.4-mini", systemPrompt: "", responseStyle: "balanced" };
      }
    },
  });

  // Fetch user preferences (for defaultRepo)
  const { data: userPrefs } = useQuery<{ defaultRepo: string | null }>({
    queryKey: ["/api/preferences"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/preferences", { credentials: "include" });
        return res.ok ? res.json() : { defaultRepo: null };
      } catch { return { defaultRepo: null }; }
    },
  });

  useEffect(() => {
    if (userPrefs?.defaultRepo) setDefaultRepo(userPrefs.defaultRepo);
  }, [userPrefs]);

  // Fetch agent defaults for placeholder prompts
  const { data: agentDefaults } = useQuery<AgentDefaults>({
    queryKey: ["agent-prompt-defaults"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/agent-prompts/defaults");
        return res.json();
      } catch {
        return {};
      }
    },
  });

  // Fetch user's agent configs
  const { data: agentConfigs } = useQuery<Array<{ agentType: string; model: string; systemPrompt: string }>>({
    queryKey: ["agent-configs"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/agent-configs");
        return res.json();
      } catch {
        return [];
      }
    },
  });

  const [defaultModel, setDefaultModel] = useState("gpt-5.4-mini");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [responseStyle, setResponseStyle] = useState("balanced");
  const [defaultRepo, setDefaultRepo] = useState("");
  const [hasChanges, setHasChanges] = useState(false);

  // Per-agent config state
  const [agentModels, setAgentModels] = useState<Record<string, string>>({});
  const [agentPrompts, setAgentPrompts] = useState<Record<string, string>>({});
  const [hasAgentChanges, setHasAgentChanges] = useState(false);

  useEffect(() => {
    if (preferences) {
      setDefaultModel(preferences.defaultModel || "gpt-5.4-mini");
      setSystemPrompt(preferences.systemPrompt || "");
      setResponseStyle(preferences.responseStyle || "balanced");
      setHasChanges(false);
    }
  }, [preferences]);

  useEffect(() => {
    if (agentConfigs && Array.isArray(agentConfigs)) {
      const models: Record<string, string> = {};
      const prompts: Record<string, string> = {};
      for (const cfg of agentConfigs) {
        if (cfg.model) models[cfg.agentType] = cfg.model;
        if (cfg.systemPrompt) prompts[cfg.agentType] = cfg.systemPrompt;
      }
      setAgentModels(models);
      setAgentPrompts(prompts);
      setHasAgentChanges(false);
    }
  }, [agentConfigs]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", "/api/user/ai-preferences", {
        defaultModel,
        systemPrompt,
        responseStyle,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-preferences"] });
      toast({ title: "AI preferences saved" });
      setHasChanges(false);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const saveAgentConfig = useMutation({
    mutationFn: async (agentType: string) => {
      await fetch(`/api/agent-configs/${agentType}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: agentModels[agentType] || undefined,
          systemPrompt: agentPrompts[agentType] || undefined,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-configs"] });
      toast({ title: "Agent config saved" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleChange = <T,>(setter: React.Dispatch<React.SetStateAction<T>>, value: T) => {
    setter(value);
    setHasChanges(true);
  };

  return (
    <div className="space-y-6">
      {/* Default Model */}
      <section className="bg-card border border-border rounded-2xl p-6">
        <SectionHeader icon={Brain} title="Default Model" description="Choose the AI model used for new conversations" />
        <div className="space-y-2">
          <Label htmlFor="default-model" className="text-xs text-muted-foreground">Model</Label>
          <select
            id="default-model"
            value={defaultModel}
            onChange={(e) => handleChange(setDefaultModel, e.target.value)}
            className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
          >
            {AI_MODELS.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
          <p className="text-[11px] text-muted-foreground">
            This model will be used by default unless overridden per conversation.
          </p>
        </div>
      </section>

      {/* Default Repository */}
      <section className="bg-card border border-border rounded-2xl p-6">
        <SectionHeader icon={Plug} title="Default Repository" description="The Coder department will use this repo when none is specified" />
        <div className="space-y-2">
          <Label htmlFor="default-repo" className="text-xs text-muted-foreground">Repository (owner/repo)</Label>
          <div className="flex gap-2">
            <Input
              id="default-repo"
              placeholder="e.g. antood69/bunz"
              value={defaultRepo}
              onChange={(e) => { setDefaultRepo(e.target.value); setHasChanges(true); }}
              className="flex-1"
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={!defaultRepo.includes("/")}
              onClick={async () => {
                try {
                  await fetch("/api/preferences", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ defaultRepo: defaultRepo || null }),
                  });
                  queryClient.invalidateQueries({ queryKey: ["/api/preferences"] });
                  toast({ title: "Default repository saved" });
                } catch (err: any) {
                  toast({ title: "Error", description: err.message, variant: "destructive" });
                }
              }}
            >
              <Save className="w-3.5 h-3.5 mr-1" />
              Save
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            When you ask the Coder to make changes without specifying a repo, it will target this one. Requires GitHub to be connected.
          </p>
        </div>
      </section>

      {/* System Prompt */}
      <section className="bg-card border border-border rounded-2xl p-6">
        <SectionHeader icon={User} title="System Prompt" description="Custom instructions prepended to every conversation" />
        <div className="space-y-2">
          <Label htmlFor="system-prompt" className="text-xs text-muted-foreground">Instructions</Label>
          <textarea
            id="system-prompt"
            rows={5}
            placeholder="e.g. You are a helpful assistant that specializes in..."
            value={systemPrompt}
            onChange={(e) => handleChange(setSystemPrompt, e.target.value)}
            className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary resize-y min-h-[100px]"
          />
          <p className="text-[11px] text-muted-foreground">
            Leave blank to use the default system prompt. Max 2000 characters.
          </p>
        </div>
      </section>

      {/* Response Style */}
      <section className="bg-card border border-border rounded-2xl p-6">
        <SectionHeader icon={Layout} title="Response Style" description="Control how verbose AI responses are" />
        <div className="flex gap-3">
          {RESPONSE_STYLES.map((style) => (
            <button
              key={style.id}
              onClick={() => handleChange(setResponseStyle, style.id)}
              className={`flex-1 py-3 px-4 rounded-xl border text-left transition-all ${
                responseStyle === style.id
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-primary/50"
              }`}
            >
              <p className={`text-sm font-medium ${responseStyle === style.id ? "text-primary" : "text-foreground"}`}>
                {style.label}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{style.description}</p>
              {responseStyle === style.id && (
                <Check className="w-3.5 h-3.5 text-primary mt-2" />
              )}
            </button>
          ))}
        </div>
      </section>

      {/* Save General Preferences Button */}
      <div className="flex justify-end">
        <Button
          size="sm"
          className="text-xs"
          disabled={!hasChanges || saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
        >
          {saveMutation.isPending ? (
            <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
          ) : (
            <Save className="w-3 h-3 mr-1.5" />
          )}
          Save Preferences
        </Button>
      </div>

      {/* ── Per-Agent Configuration ─────────────────────────────────────────── */}
      <section className="bg-card border border-border rounded-2xl p-6">
        <SectionHeader icon={Layers} title="Agent Configuration" description="Configure model and system prompt for each specialist agent" />
        <div className="space-y-4 mt-4">
          {AGENT_TYPES.map((agent) => {
            const defaultPrompt = agentDefaults?.[agent.id]?.systemPrompt || "";
            const defaultModelForAgent = agentDefaults?.[agent.id]?.model || "";
            const models = AGENT_MODELS[agent.id] || [];

            return (
              <div key={agent.id} className="border border-border rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-foreground">{agent.label}</h4>
                    <p className="text-[11px] text-muted-foreground">{agent.description}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-[11px] h-7"
                    onClick={() => saveAgentConfig.mutate(agent.id)}
                    disabled={saveAgentConfig.isPending}
                  >
                    {saveAgentConfig.isPending ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Save className="w-3 h-3 mr-1" />
                    )}
                    Save
                  </Button>
                </div>

                {/* Model selector */}
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Model</Label>
                  <select
                    value={agentModels[agent.id] || defaultModelForAgent}
                    onChange={(e) => {
                      setAgentModels(prev => ({ ...prev, [agent.id]: e.target.value }));
                      setHasAgentChanges(true);
                    }}
                    className="w-full bg-secondary border border-border rounded-xl px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                  >
                    {models.map((m) => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                </div>

                {/* System prompt (not for art agent since it generates images) */}
                {agent.id !== "art" && (
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">System Prompt (optional override)</Label>
                    <textarea
                      rows={3}
                      placeholder={defaultPrompt || "Leave blank for default..."}
                      value={agentPrompts[agent.id] || ""}
                      onChange={(e) => {
                        setAgentPrompts(prev => ({ ...prev, [agent.id]: e.target.value }));
                        setHasAgentChanges(true);
                      }}
                      className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary resize-y min-h-[60px]"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN SETTINGS PAGE
// ═══════════════════════════════════════════════════════════════════════════════
export default function SettingsPage({ initialTab }: { initialTab?: string } = {}) {
  const [activeTab, setActiveTab] = useState<TabValue>(() => getInitialTab(initialTab));

  // Keep the prop in sync if it changes after mount
  useEffect(() => {
    if (initialTab && isValidTab(initialTab)) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  return (
    <div className="min-h-full px-6 py-8 pb-20 max-w-4xl mx-auto">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your Bunz preferences and account</p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)}>
        <TabsList className="w-full justify-start bg-muted/50 border border-border rounded-xl p-1 mb-6 flex-wrap h-auto gap-0.5">
          <TabsTrigger value="general" className="text-xs gap-1.5 data-[state=active]:bg-background">
            <User className="w-3.5 h-3.5" />
            General
          </TabsTrigger>
          <TabsTrigger value="appearance" className="text-xs gap-1.5 data-[state=active]:bg-background">
            <Palette className="w-3.5 h-3.5" />
            Appearance
          </TabsTrigger>
          <TabsTrigger value="connectors" className="text-xs gap-1.5 data-[state=active]:bg-background">
            <Plug className="w-3.5 h-3.5" />
            Connectors
          </TabsTrigger>
          <TabsTrigger value="usage" className="text-xs gap-1.5 data-[state=active]:bg-background">
            <Coins className="w-3.5 h-3.5" />
            Usage
          </TabsTrigger>
          <TabsTrigger value="pricing" className="text-xs gap-1.5 data-[state=active]:bg-background">
            <CreditCard className="w-3.5 h-3.5" />
            Pricing
          </TabsTrigger>
          <TabsTrigger value="ai-preferences" className="text-xs gap-1.5 data-[state=active]:bg-background">
            <Brain className="w-3.5 h-3.5" />
            AI Preferences
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <GeneralTab />
        </TabsContent>

        <TabsContent value="appearance">
          <AppearanceTab />
        </TabsContent>

        <TabsContent value="connectors">
          <Suspense fallback={<TabLoader />}>
            <ConnectorsPage />
          </Suspense>
        </TabsContent>

        <TabsContent value="usage">
          <Suspense fallback={<TabLoader />}>
            <TokenUsagePage />
          </Suspense>
        </TabsContent>

        <TabsContent value="pricing">
          <Suspense fallback={<TabLoader />}>
            <PricingPage />
          </Suspense>
        </TabsContent>

        <TabsContent value="ai-preferences">
          <AIPreferencesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
