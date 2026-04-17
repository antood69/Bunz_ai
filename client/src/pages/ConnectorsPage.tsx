import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plug,
  Plus,
  Trash2,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Globe,
  Webhook,
  Key,
  Shield,
  Loader2,
  Copy,
  Eye,
  EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";

// Types
interface ConnectorMeta {
  id: number;
  type: string;
  provider: string;
  name: string;
  status: string;
  lastUsedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

// Connector catalog definitions
interface ConnectorTemplate {
  provider: string;
  name: string;
  description: string;
  type: "api_key" | "oauth2";
  category: string;
  icon: string;
  fields?: { key: string; label: string; placeholder: string; type?: string }[];
}

const API_KEY_CONNECTORS: ConnectorTemplate[] = [
  { provider: "openai", name: "OpenAI", description: "GPT-4, DALL-E, Whisper and more", type: "api_key", category: "AI Providers", icon: "O", fields: [{ key: "apiKey", label: "API Key", placeholder: "sk-..." }] },
  { provider: "anthropic", name: "Anthropic", description: "Claude models for AI chat and analysis", type: "api_key", category: "AI Providers", icon: "A", fields: [{ key: "apiKey", label: "API Key", placeholder: "sk-ant-..." }] },
  { provider: "github", name: "GitHub", description: "Repos, issues, pull requests, and code", type: "api_key", category: "Developer Tools", icon: "G", fields: [{ key: "apiKey", label: "Personal Access Token", placeholder: "ghp_..." }] },
  { provider: "slack", name: "Slack", description: "Send messages and manage channels", type: "api_key", category: "Communication", icon: "S", fields: [{ key: "apiKey", label: "Bot Token", placeholder: "xoxb-..." }] },
  { provider: "stripe", name: "Stripe", description: "Payments, customers, and invoices", type: "api_key", category: "Payments", icon: "$", fields: [{ key: "apiKey", label: "Secret Key", placeholder: "sk_..." }] },
  { provider: "linkedin", name: "LinkedIn", description: "Publish posts and content to LinkedIn", type: "api_key", category: "Social Media", icon: "in", fields: [{ key: "apiKey", label: "Access Token", placeholder: "Your LinkedIn access token" }] },
  { provider: "shopify", name: "Shopify", description: "Products, orders, and fulfillment", type: "api_key", category: "E-Commerce", icon: "Sh", fields: [{ key: "shop", label: "Shop Domain", placeholder: "mystore.myshopify.com" }, { key: "apiKey", label: "Admin API Token", placeholder: "shpat_..." }] },
  { provider: "gumroad", name: "Gumroad", description: "Digital products and sales", type: "api_key", category: "E-Commerce", icon: "Gm", fields: [{ key: "apiKey", label: "Access Token", placeholder: "Your Gumroad access token" }] },
  { provider: "supabase", name: "Supabase", description: "Database, auth, and storage", type: "api_key", category: "Developer Tools", icon: "Sb", fields: [{ key: "url", label: "Project URL", placeholder: "https://xxx.supabase.co" }, { key: "apiKey", label: "Service Role Key", placeholder: "eyJ..." }] },
  { provider: "vercel", name: "Vercel", description: "Deployments, projects, and domains", type: "api_key", category: "Developer Tools", icon: "V", fields: [{ key: "apiKey", label: "API Token", placeholder: "Your Vercel token" }] },
  { provider: "figma", name: "Figma", description: "Design files, components, and comments", type: "api_key", category: "Design", icon: "F", fields: [{ key: "apiKey", label: "Personal Access Token", placeholder: "figd_..." }] },
  { provider: "discord", name: "Discord Bot", description: "Send messages via bot token", type: "api_key", category: "Communication", icon: "D", fields: [{ key: "apiKey", label: "Bot Token", placeholder: "Your Discord bot token" }] },
];

const OAUTH2_CONNECTORS: ConnectorTemplate[] = [
  { provider: "google", name: "Google Workspace", description: "Gmail, Drive, Calendar access", type: "oauth2", category: "Productivity", icon: "G" },
  { provider: "notion", name: "Notion", description: "Pages, databases, and content", type: "oauth2", category: "Productivity", icon: "N" },
  { provider: "hubspot", name: "HubSpot", description: "CRM contacts and deals", type: "oauth2", category: "Productivity", icon: "H" },
  { provider: "discord", name: "Discord", description: "Servers, channels, and messaging", type: "oauth2", category: "Communication", icon: "D" },
  { provider: "dropbox", name: "Dropbox", description: "Cloud file storage and sharing", type: "oauth2", category: "Productivity", icon: "B" },
];

const ALL_CONNECTORS = [...API_KEY_CONNECTORS, ...OAUTH2_CONNECTORS];

// Providers that need env vars for OAuth2
const OAUTH2_ENV_PROVIDERS: Record<string, string> = {
  google: "GOOGLE_CLIENT_ID",
  notion: "NOTION_CLIENT_ID",
  hubspot: "HUBSPOT_CLIENT_ID",
  discord: "DISCORD_CLIENT_ID",
  dropbox: "DROPBOX_CLIENT_ID",
};

function formatDate(iso: string | null) {
  if (!iso) return "Never";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function StatusBadge({ status }: { status: string }) {
  if (status === "connected") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xl bg-green-500/10 text-xs text-green-500 border border-green-500/20">
        <CheckCircle2 className="w-3 h-3" />
        Connected
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xl bg-red-500/10 text-xs text-red-500 border border-red-500/20">
        <XCircle className="w-3 h-3" />
        Error
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xl bg-muted text-xs text-muted-foreground border border-border">
      <AlertTriangle className="w-3 h-3" />
      Disconnected
    </span>
  );
}

function ConnectorIcon({ icon, provider }: { icon: string; provider: string }) {
  const colors: Record<string, string> = {
    openai: "#10a37f", anthropic: "#d97706", github: "#e5e7eb", slack: "#4a154b",
    stripe: "#635bff", google: "#4285f4", notion: "#e5e7eb", hubspot: "#ff7a59",
    discord: "#5865f2", dropbox: "#0061ff", linkedin: "#0077b5", shopify: "#96bf48",
    gumroad: "#ff90e8", supabase: "#3ecf8e", vercel: "#e5e7eb", figma: "#a259ff",
    custom_rest: "#22d3ee", custom_webhook: "#fbbf24", custom_oauth2: "#ec4899",
  };
  const color = colors[provider] || "#6382ff";
  // Inline SVG paths for popular brands
  const paths: Record<string, string> = {
    openai: "M22.28 14.37a6.4 6.4 0 0 0-.55-5.27 6.47 6.47 0 0 0-6.97-3.08A6.4 6.4 0 0 0 9.94 3a6.47 6.47 0 0 0-6.18 4.5 6.4 6.4 0 0 0-4.28 3.1 6.47 6.47 0 0 0 .8 7.58 6.4 6.4 0 0 0 .55 5.27 6.47 6.47 0 0 0 6.97 3.08A6.4 6.4 0 0 0 12.62 29a6.47 6.47 0 0 0 6.18-4.5 6.4 6.4 0 0 0 4.28-3.1 6.47 6.47 0 0 0-.8-7.03z",
    github: "M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.2.5-2.3 1.3-3.1-.1-.4-.6-1.6.1-3.2 0 0 1-.3 3.4 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.7 1.6.2 2.8.1 3.2.9.8 1.3 1.9 1.3 3.2 0 4.6-2.8 5.6-5.5 5.9.5.4.9 1.2.9 2.3v3.4c0 .3.2.7.8.6A12 12 0 0 0 12 .3",
    slack: "M5.04 15.16a2.53 2.53 0 0 1-2.52 2.53A2.53 2.53 0 0 1 0 15.16a2.53 2.53 0 0 1 2.52-2.52h2.52zm1.27 0a2.53 2.53 0 0 1 2.52-2.52 2.53 2.53 0 0 1 2.52 2.52v6.32A2.53 2.53 0 0 1 8.83 24a2.53 2.53 0 0 1-2.52-2.52zM8.83 5.04a2.53 2.53 0 0 1-2.52-2.52A2.53 2.53 0 0 1 8.83 0a2.53 2.53 0 0 1 2.52 2.52v2.52zm0 1.27a2.53 2.53 0 0 1 2.52 2.52 2.53 2.53 0 0 1-2.52 2.52H2.52A2.53 2.53 0 0 1 0 8.83a2.53 2.53 0 0 1 2.52-2.52zM18.96 8.83a2.53 2.53 0 0 1 2.52-2.52A2.53 2.53 0 0 1 24 8.83a2.53 2.53 0 0 1-2.52 2.52h-2.52zm-1.27 0a2.53 2.53 0 0 1-2.52 2.52 2.53 2.53 0 0 1-2.52-2.52V2.52A2.53 2.53 0 0 1 15.17 0a2.53 2.53 0 0 1 2.52 2.52zM15.17 18.96a2.53 2.53 0 0 1 2.52 2.52A2.53 2.53 0 0 1 15.17 24a2.53 2.53 0 0 1-2.52-2.52v-2.52zm0-1.27a2.53 2.53 0 0 1-2.52-2.52 2.53 2.53 0 0 1 2.52-2.52h6.31A2.53 2.53 0 0 1 24 15.17a2.53 2.53 0 0 1-2.52 2.52z",
    stripe: "M13.98 11.17c0-1.1.65-1.53 1.73-1.53 1.54 0 3.5.47 5.04 1.3V6.58c-1.69-.67-3.35-.93-5.04-.93-4.13 0-6.87 2.15-6.87 5.76 0 5.62 7.73 4.72 7.73 7.14 0 1.3-1.13 1.73-2.72 1.73-1.87 0-4.26-.77-6.15-1.8v4.4c2.09.9 4.2 1.3 6.15 1.3 4.23 0 7.14-2.1 7.14-5.74-.01-6.07-7.77-4.98-7.77-7.27z",
    google: "M12.48 10.92v3.28h7.84c-.24 1.84-.87 3.19-1.84 4.15-1.18 1.18-3 2.47-5.99 2.47-4.78 0-8.52-3.86-8.52-8.64s3.74-8.63 8.52-8.63c2.58 0 4.47 1.01 5.86 2.32l2.32-2.32C18.36 1.45 15.76 0 12.48 0 5.76 0 .21 5.39.21 12.06s5.55 12.05 12.27 12.05c3.6 0 6.31-1.18 8.44-3.39 2.18-2.18 2.86-5.26 2.86-7.74 0-.77-.07-1.48-.18-2.06z",
    discord: "M20.32 4.37a19.8 19.8 0 0 0-4.89-1.52.07.07 0 0 0-.08.04c-.21.38-.44.87-.61 1.26a18.27 18.27 0 0 0-5.49 0 12.64 12.64 0 0 0-.62-1.26.08.08 0 0 0-.08-.04 19.74 19.74 0 0 0-4.89 1.52.07.07 0 0 0-.03.03C.53 9.05-.32 13.58.1 18.06a.08.08 0 0 0 .03.06 19.9 19.9 0 0 0 5.99 3.03.08.08 0 0 0 .08-.03c.46-.63.87-1.3 1.22-2a.08.08 0 0 0-.04-.11 13.1 13.1 0 0 1-1.87-.9.08.08 0 0 1 0-.13c.13-.09.25-.19.37-.29a.08.08 0 0 1 .08-.01c3.93 1.79 8.18 1.79 12.07 0a.08.08 0 0 1 .08.01c.12.1.25.2.37.29a.08.08 0 0 1 0 .13c-.6.35-1.22.65-1.88.9a.08.08 0 0 0-.04.11c.36.7.77 1.37 1.22 2a.08.08 0 0 0 .08.03 19.83 19.83 0 0 0 6-3.03.08.08 0 0 0 .03-.05c.5-5.18-.84-9.68-3.55-13.66a.06.06 0 0 0-.03-.03zM8.02 15.33c-1.18 0-2.16-1.09-2.16-2.42s.96-2.42 2.16-2.42c1.21 0 2.18 1.1 2.16 2.42 0 1.33-.96 2.42-2.16 2.42zm7.97 0c-1.18 0-2.16-1.09-2.16-2.42s.96-2.42 2.16-2.42c1.21 0 2.18 1.1 2.16 2.42 0 1.33-.95 2.42-2.16 2.42z",
    linkedin: "M20.45 20.45h-3.55v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.63-1.85 3.36-1.85 3.6 0 4.26 2.37 4.26 5.45v6.29zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z",
    notion: "M4.46 4.48l8.6-.63c1.06-.09 1.33-.03 2 .47l2.73 1.9c.45.32.6.41.6.76v12.38c0 .67-.25 1.06-.98 1.11l-9.97.58c-.55.03-.81-.05-1.1-.41l-2.2-2.86c-.33-.43-.46-.75-.46-1.13V5.5c0-.53.24-.98.78-1.02zm8.88 1.76c.08.37 0 .73-.37.77l-.47.09v9.15c-.41.22-.79.35-1.1.35-.52 0-.65-.17-.98-.57l-3.18-4.98v4.82l.97.22s0 .73-.69.73l-1.9.11c-.06-.12 0-.41.21-.46l.5-.14V8.4l-.7-.05c-.04-.37.12-.9.72-.95l2.04-.13 3.3 5.05V8l-.82-.1c-.04-.44.24-.76.64-.79l2.03-.14zM21.42.92l-10.3.76C9.74 1.8 9.41 1.85 9.1 2.1L6.7 3.86c-.18.14-.25.18-.25.33v16.76c0 .45.18.7.78.66l11.15-.65c.6-.04.84-.32.84-.72V2.19c0-.44-.27-.72-.8-.72z",
    anthropic: "M17.31 3.84h-3.56L19.7 20.16h3.56zm-7.06 0L4.3 20.16h3.66l1.14-3.06h5.86l1.14 3.06h3.66L13.81 3.84zm-.68 10.2l2.05-5.52 2.05 5.52z",
    shopify: "M20.89 5.47l-.52-.06s-.39-.39-.52-.52c0 0-.39-.39-.91-.39-.13 0-.39 0-.65.13-.26-.78-.78-1.43-1.56-1.43h-.13C16.21 2.68 15.69 2.42 15.3 2.42c-2.47 0-3.64 3.12-4.03 4.68l-1.69.52c-.52.13-.52.13-.59.65-.06.39-1.43 10.97-1.43 10.97L15.56 21l5.85-1.3s-2.47-16.86-2.47-16.99c0-.13-.06-.13-.06-.13zm-4.16-.91c-.26.06-.52.13-.84.26 0-.52-.06-1.23-.32-1.82.84.13 1.17 1.04 1.17 1.56zm-1.82.59c-.59.19-1.23.39-1.88.59.39-1.3 1.04-1.95 1.63-2.21.19.39.26.97.26 1.63zm-1.3-2.21c.13 0 .26.06.39.13-.78.39-1.56 1.3-1.95 3.12l-1.43.45c.39-1.43 1.36-3.7 2.99-3.7z",
    figma: "M15.85 12a3.85 3.85 0 1 1-7.7 0 3.85 3.85 0 0 1 7.7 0zM4 19.85A3.85 3.85 0 0 1 7.85 16H12v3.85A3.85 3.85 0 0 1 4 19.85zM12 0v7.7h3.85a3.85 3.85 0 1 0 0-7.7H12zM4 3.85A3.85 3.85 0 0 0 7.85 7.7H12V0H7.85A3.85 3.85 0 0 0 4 3.85zM4 12a3.85 3.85 0 0 0 3.85 3.85H12V8.15H7.85A3.85 3.85 0 0 0 4 12z",
    supabase: "M13.93 23.65c-.52.68-1.57.3-1.58-.57l-.16-11.53h7.74c1.4 0 2.17 1.63 1.28 2.72l-7.28 9.38zM10.07.35c.52-.68 1.57-.3 1.58.57l.06 11.53H3.97c-1.4 0-2.17-1.63-1.28-2.72L10.07.35z",
    vercel: "M12 1L1 21h22L12 1z",
    gumroad: "M12.61 7.42c-2.24 0-4.09 1.83-4.09 4.09s1.83 4.09 4.09 4.09c1.31 0 2.47-.63 3.21-1.59l1.54 1.15c-1.11 1.41-2.85 2.32-4.79 2.32-3.37 0-6.11-2.73-6.11-6.11S9.24 5.25 12.61 5.25c1.93 0 3.66.9 4.79 2.3l-1.54 1.17c-.74-.97-1.9-1.6-3.21-1.6zM23.5 11.51c0 6.35-5.15 11.49-11.5 11.49S.5 17.86.5 11.51 5.65 0 12 0s11.5 5.15 11.5 11.51zm-1.93 0c0-5.28-4.29-9.57-9.57-9.57S2.43 6.23 2.43 11.51 6.72 21.07 12 21.07s9.57-4.29 9.57-9.56z",
    dropbox: "M12 6.56l-6 3.84 6 3.84 6-3.84-6-3.84zM2.04 6.72L8.04 10.56 12 7.92 6 4.08 2.04 6.72zm0 7.68L8.04 18.24 12 15.6l-3.96-2.64-6 3.84zm19.92-7.68L18 4.08l-6 3.84 3.96 2.64 6-3.84zm0 7.68l-6.00-3.84L12 15.6l3.96 2.64 6-3.84zM12 16.56l-3.96-2.64-2.04 1.32L12 19.08l6-3.84-2.04-1.32L12 16.56z",
    hubspot: "M18.16 5.67V3.39a2.19 2.19 0 0 0 1.28-1.98A2.2 2.2 0 0 0 17.24 0a2.2 2.2 0 0 0-2.21 2.16c0 .87.52 1.61 1.27 1.97v2.31a5.48 5.48 0 0 0-2.79 1.35L6.2 2.6a2.73 2.73 0 0 0 .07-.54A2.68 2.68 0 0 0 3.59 0 2.68 2.68 0 0 0 .91 2.06a2.68 2.68 0 0 0 2.68 2.68c.56 0 1.08-.18 1.51-.48l7.15 5.1a5.45 5.45 0 0 0-.73 2.73 5.5 5.5 0 0 0 .82 2.88l-2.27 2.27a2.18 2.18 0 0 0-.65-.11 2.2 2.2 0 0 0-2.2 2.2 2.2 2.2 0 0 0 2.2 2.2 2.2 2.2 0 0 0 2.2-2.2c0-.24-.04-.47-.11-.68l2.22-2.22a5.48 5.48 0 1 0 4.63-10.77z",
  };

  const svgPath = paths[provider];
  return (
    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${color}20` }}>
      {svgPath ? (
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill={color}><path d={svgPath} /></svg>
      ) : (
        <span className="text-xs font-bold" style={{ color }}>{icon}</span>
      )}
    </div>
  );
}

// === MAIN PAGE ===
export default function ConnectorsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isOwner } = useAuth();
  const [activeTab, setActiveTab] = useState("connections");

  // Fetch user's connectors
  const { data: connectors = [], isLoading } = useQuery<ConnectorMeta[]>({
    queryKey: ["/api/connectors"],
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/connectors/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/connectors"] });
      toast({ title: "Connector deleted" });
    },
  });

  // Test mutation
  const testMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/connectors/${id}/test`);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/connectors"] });
      if (data.ok) {
        toast({ title: "Connection successful" });
      } else {
        toast({ title: "Connection failed", description: data.error, variant: "destructive" });
      }
    },
  });

  // State
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<ConnectorTemplate | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ConnectorMeta | null>(null);
  const [showCustomRestModal, setShowCustomRestModal] = useState(false);
  const [showCustomWebhookModal, setShowCustomWebhookModal] = useState(false);
  const [showCustomOAuth2Modal, setShowCustomOAuth2Modal] = useState(false);

  // Listen for OAuth popup messages
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "oauth_complete") {
        queryClient.invalidateQueries({ queryKey: ["/api/connectors"] });
        if (event.data.success) {
          toast({ title: `${event.data.provider} connected!` });
        } else {
          toast({ title: "OAuth failed", description: event.data.error, variant: "destructive" });
        }
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [queryClient, toast]);

  const handleConnect = useCallback((template: ConnectorTemplate) => {
    if (template.type === "api_key") {
      setSelectedTemplate(template);
      setShowApiKeyModal(true);
    } else if (template.type === "oauth2") {
      startOAuth(template.provider);
    }
  }, []);

  const startOAuth = async (provider: string) => {
    try {
      const res = await apiRequest("POST", "/api/connectors/oauth/start", { provider });
      const data = await res.json();
      if (data.url) {
        const w = 600, h = 700;
        const left = window.screenX + (window.outerWidth - w) / 2;
        const top = window.screenY + (window.outerHeight - h) / 2;
        window.open(data.url, "oauth_popup", `width=${w},height=${h},left=${left},top=${top},popup=1`);
      } else {
        toast({ title: "OAuth not available", description: data.error || "Could not start OAuth flow", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "OAuth Error", description: err.message, variant: "destructive" });
    }
  };

  // Check if a connector is already connected for a given provider
  const isConnected = (provider: string) => connectors.some((c) => c.provider === provider && c.status === "connected");

  return (
    <div className="p-3 sm:p-4 space-y-4 page-enter">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/12 flex items-center justify-center">
          <Plug className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Connectors</h1>
          <p className="text-sm text-muted-foreground">Connect external services, APIs, and webhooks</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="connections">My Connections</TabsTrigger>
          <TabsTrigger value="available">Available</TabsTrigger>
          <TabsTrigger value="custom">Custom</TabsTrigger>
        </TabsList>

        {/* Tab 1: My Connections */}
        <TabsContent value="connections" className="mt-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : connectors.length === 0 ? (
            <div className="text-center py-20 space-y-3">
              <Plug className="w-12 h-12 text-muted-foreground/30 mx-auto" />
              <h3 className="text-lg font-medium text-muted-foreground">No connections yet</h3>
              <p className="text-sm text-muted-foreground/60">Add your first connector from the Available tab.</p>
              <Button variant="outline" size="sm" onClick={() => setActiveTab("available")}>
                Browse Connectors
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {connectors.map((c) => {
                const template = ALL_CONNECTORS.find((t) => t.provider === c.provider);
                return (
                  <div key={c.id} className="bg-card border border-border rounded-2xl p-5 flex flex-col gap-3 hover:border-primary/40 transition-all">
                    <div className="flex items-start gap-3">
                      <ConnectorIcon icon={template?.icon || c.provider[0].toUpperCase()} provider={c.provider} />
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-sm text-foreground truncate">{c.name}</h3>
                        <p className="text-xs text-muted-foreground capitalize">{c.type.replace("_", " ")} &middot; {c.provider}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatusBadge status={c.status} />
                      {c.lastUsedAt && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          {formatDate(c.lastUsedAt)}
                        </span>
                      )}
                    </div>
                    {c.lastError && c.status === "error" && (
                      <p className="text-xs text-red-500 bg-red-500/10 rounded-xl px-2 py-1 truncate">{c.lastError}</p>
                    )}
                    <div className="flex items-center gap-2 pt-1 border-t border-border">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => testMutation.mutate(c.id)}
                        disabled={testMutation.isPending}
                      >
                        {testMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />}
                        Test
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-red-500 hover:text-red-300 hover:bg-red-500/10"
                        onClick={() => setDeleteTarget(c)}
                      >
                        <Trash2 className="w-3 h-3 mr-1" />
                        Disconnect
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Tab 2: Available Connectors */}
        <TabsContent value="available" className="mt-6 space-y-6">
          {/* API Key Connectors */}
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">API Key Connectors</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {API_KEY_CONNECTORS.map((t) => (
                <div key={t.provider} className="bg-card border border-border rounded-2xl p-6 flex flex-col gap-3 hover:border-primary/40 transition-all">
                  <div className="flex items-start gap-3">
                    <ConnectorIcon icon={t.icon} provider={t.provider} />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm text-foreground">{t.name}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xl bg-secondary text-[11px] text-muted-foreground border border-border">
                      <Key className="w-3 h-3" />
                      API Key
                    </span>
                    <span className="text-[11px] text-muted-foreground">{t.category}</span>
                  </div>
                  <Button
                    size="sm"
                    className="w-full mt-auto"
                    variant={isConnected(t.provider) ? "outline" : "default"}
                    onClick={() => handleConnect(t)}
                  >
                    {isConnected(t.provider) ? "Reconnect" : "Connect"}
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* OAuth2 Connectors */}
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">OAuth2 Connectors</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {OAUTH2_CONNECTORS.map((t) => {
                const envVar = OAUTH2_ENV_PROVIDERS[t.provider];
                return (
                  <div key={t.provider} className="bg-card border border-border rounded-2xl p-6 flex flex-col gap-3 hover:border-primary/40 transition-all">
                    <div className="flex items-start gap-3">
                      <ConnectorIcon icon={t.icon} provider={t.provider} />
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-sm text-foreground">{t.name}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xl bg-secondary text-[11px] text-muted-foreground border border-border">
                        <Shield className="w-3 h-3" />
                        OAuth2
                      </span>
                      <span className="text-[11px] text-muted-foreground">{t.category}</span>
                    </div>
                    <Button
                      size="sm"
                      className="w-full mt-auto"
                      variant={isConnected(t.provider) ? "outline" : "default"}
                      onClick={() => handleConnect(t)}
                    >
                      {isConnected(t.provider) ? "Reconnect" : "Connect"}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        </TabsContent>

        {/* Tab 3: Custom Connectors */}
        <TabsContent value="custom" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Custom REST API */}
            <div className="bg-card border border-border rounded-2xl p-6 flex flex-col gap-3 hover:border-primary/40 transition-all">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center">
                  <Globe className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-foreground">Custom REST API</h3>
                  <p className="text-xs text-muted-foreground">Base URL + auth + headers</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Connect any REST API with bearer tokens, API keys, or basic auth.</p>
              <Button size="sm" variant="outline" className="mt-auto" onClick={() => setShowCustomRestModal(true)}>
                <Plus className="w-3 h-3 mr-1" />
                Create
              </Button>
            </div>

            {/* Custom Webhook */}
            <div className="bg-card border border-border rounded-2xl p-6 flex flex-col gap-3 hover:border-primary/40 transition-all">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-yellow-500/20 flex items-center justify-center">
                  <Webhook className="w-5 h-5 text-yellow-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-foreground">Custom Webhook</h3>
                  <p className="text-xs text-muted-foreground">Inbound + outbound</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Receive inbound webhooks with HMAC verification or send outbound events.</p>
              <Button size="sm" variant="outline" className="mt-auto" onClick={() => setShowCustomWebhookModal(true)}>
                <Plus className="w-3 h-3 mr-1" />
                Create
              </Button>
            </div>

            {/* Custom OAuth2 */}
            <div className="bg-card border border-border rounded-2xl p-6 flex flex-col gap-3 hover:border-primary/40 transition-all">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-pink-500/20 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-pink-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-foreground">Custom OAuth2</h3>
                  <p className="text-xs text-muted-foreground">User-registered apps</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Connect any OAuth2 provider with your own client credentials.</p>
              <Button size="sm" variant="outline" className="mt-auto" onClick={() => setShowCustomOAuth2Modal(true)}>
                <Plus className="w-3 h-3 mr-1" />
                Create
              </Button>
            </div>
          </div>

          {/* Show existing custom connectors */}
          {connectors.filter((c) => c.provider.startsWith("custom_")).length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Your Custom Connectors</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {connectors.filter((c) => c.provider.startsWith("custom_")).map((c) => (
                  <div key={c.id} className="bg-card border border-border rounded-2xl p-5 flex flex-col gap-3">
                    <div className="flex items-start gap-3">
                      <ConnectorIcon icon={c.provider === "custom_rest" ? "R" : c.provider === "custom_webhook" ? "W" : "O"} provider={c.provider} />
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-sm text-foreground truncate">{c.name}</h3>
                        <p className="text-xs text-muted-foreground capitalize">{c.type.replace("_", " ")}</p>
                      </div>
                    </div>
                    <StatusBadge status={c.status} />
                    <div className="flex items-center gap-2 pt-1 border-t border-border">
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => testMutation.mutate(c.id)}>
                        <RefreshCw className="w-3 h-3 mr-1" /> Test
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 text-xs text-red-500 hover:text-red-300 hover:bg-red-500/10" onClick={() => setDeleteTarget(c)}>
                        <Trash2 className="w-3 h-3 mr-1" /> Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* === MODALS === */}

      {/* API Key Modal */}
      <ApiKeyModal
        open={showApiKeyModal}
        template={selectedTemplate}
        onClose={() => { setShowApiKeyModal(false); setSelectedTemplate(null); }}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/connectors"] });
          setShowApiKeyModal(false);
          setSelectedTemplate(null);
          setActiveTab("connections");
        }}
      />

      {/* Custom REST Modal */}
      <CustomRestModal
        open={showCustomRestModal}
        onClose={() => setShowCustomRestModal(false)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/connectors"] });
          setShowCustomRestModal(false);
          setActiveTab("connections");
        }}
      />

      {/* Custom Webhook Modal */}
      <CustomWebhookModal
        open={showCustomWebhookModal}
        onClose={() => setShowCustomWebhookModal(false)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/connectors"] });
          setShowCustomWebhookModal(false);
          setActiveTab("connections");
        }}
      />

      {/* Custom OAuth2 Modal */}
      <CustomOAuth2Modal
        open={showCustomOAuth2Modal}
        onClose={() => setShowCustomOAuth2Modal(false)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/connectors"] });
          setShowCustomOAuth2Modal(false);
          setActiveTab("connections");
        }}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the connection and delete stored credentials. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
                setDeleteTarget(null);
              }}
            >
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// === API KEY MODAL ===
function ApiKeyModal({ open, template, onClose, onSuccess }: {
  open: boolean;
  template: ConnectorTemplate | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [values, setValues] = useState<Record<string, string>>({});
  const [showValue, setShowValue] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setValues({}); setTestResult(null); setShowValue(false); }
  }, [open]);

  const buildConfig = () => {
    const config: Record<string, string> = {};
    for (const field of (template?.fields || [])) {
      if (values[field.key]?.trim()) config[field.key] = values[field.key].trim();
    }
    return config;
  };

  const hasRequired = () => {
    const first = template?.fields?.[0];
    return first ? !!values[first.key]?.trim() : false;
  };

  const handleTest = async () => {
    if (!hasRequired()) return;
    setTesting(true); setTestResult(null);
    try {
      const res = await apiRequest("POST", "/api/connectors", {
        type: "api_key", provider: template!.provider, name: template!.name, config: buildConfig(),
      });
      const connector = await res.json();
      const testRes = await apiRequest("POST", `/api/connectors/${connector.id}/test`);
      const result = await testRes.json();
      setTestResult(result);
      if (!result.ok) { await apiRequest("DELETE", `/api/connectors/${connector.id}`); }
      else { toast({ title: `${template!.name} connected!` }); onSuccess(); return; }
    } catch (err: any) { setTestResult({ ok: false, error: err.message }); }
    finally { setTesting(false); }
  };

  const handleSave = async () => {
    if (!hasRequired()) return;
    setSaving(true);
    try {
      await apiRequest("POST", "/api/connectors", {
        type: "api_key", provider: template!.provider, name: template!.name, config: buildConfig(),
      });
      toast({ title: `${template!.name} connected!` }); onSuccess();
    } catch (err: any) { toast({ title: "Failed to save", description: err.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  if (!template) return null;
  const fields = template.fields || [];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ConnectorIcon icon={template.icon} provider={template.provider} />
            Connect {template.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {fields.map((field, i) => (
          <div key={field.key}>
            <Label htmlFor={`field-${field.key}`}>{field.label || "API Key"}</Label>
            <div className="relative mt-1.5">
              <Input
                id={`field-${field.key}`}
                type={field.type === "text" || showValue ? "text" : "password"}
                placeholder={field.placeholder || "Enter value..."}
                value={values[field.key] || ""}
                onChange={(e) => setValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                className={field.type !== "text" ? "pr-10" : ""}
              />
              {field.type !== "text" && i === 0 && (
              <button
                type="button"
                onClick={() => setShowValue(!showValue)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showValue ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              )}
            </div>
          </div>
          ))}
          {testResult && (
            <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-xl ${testResult.ok ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-500"}`}>
              {testResult.ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              {testResult.ok ? "Connection successful!" : testResult.error || "Connection failed"}
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="outline" onClick={handleTest} disabled={!hasRequired() || testing}>
            {testing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
            Test Connection
          </Button>
          <Button onClick={handleSave} disabled={!hasRequired() || saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// === CUSTOM REST MODAL ===
function CustomRestModal({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [authType, setAuthType] = useState("none");
  const [authValue, setAuthValue] = useState("");
  const [testEndpoint, setTestEndpoint] = useState("");
  const [headers, setHeaders] = useState<{ key: string; value: string }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setName(""); setBaseUrl(""); setAuthType("none"); setAuthValue(""); setTestEndpoint(""); setHeaders([]); }
  }, [open]);

  const addHeader = () => setHeaders([...headers, { key: "", value: "" }]);
  const removeHeader = (i: number) => setHeaders(headers.filter((_, idx) => idx !== i));
  const updateHeader = (i: number, field: "key" | "value", val: string) => {
    const next = [...headers];
    next[i][field] = val;
    setHeaders(next);
  };

  const handleSave = async () => {
    if (!name.trim() || !baseUrl.trim()) return;
    setSaving(true);
    try {
      const headersObj: Record<string, string> = {};
      headers.forEach((h) => { if (h.key.trim()) headersObj[h.key.trim()] = h.value; });
      await apiRequest("POST", "/api/connectors", {
        type: "rest",
        provider: "custom_rest",
        name: name.trim(),
        config: { baseUrl: baseUrl.trim(), authType, authValue, testEndpoint, headers: headersObj },
      });
      toast({ title: "Custom REST connector created" });
      onSuccess();
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-cyan-400" />
            Custom REST API
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Name</Label>
            <Input className="mt-1" placeholder="My API" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Base URL</Label>
            <Input className="mt-1" placeholder="https://api.example.com" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
          </div>
          <div>
            <Label>Auth Type</Label>
            <Select value={authType} onValueChange={setAuthType}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="bearer">Bearer Token</SelectItem>
                <SelectItem value="api_key">API Key Header</SelectItem>
                <SelectItem value="basic">Basic Auth</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {authType !== "none" && (
            <div>
              <Label>{authType === "bearer" ? "Bearer Token" : authType === "api_key" ? "API Key" : "Username:Password"}</Label>
              <Input className="mt-1" type="password" placeholder="Enter credential..." value={authValue} onChange={(e) => setAuthValue(e.target.value)} />
            </div>
          )}
          <div>
            <div className="flex items-center justify-between">
              <Label>Custom Headers</Label>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={addHeader}>
                <Plus className="w-3 h-3 mr-1" /> Add
              </Button>
            </div>
            {headers.map((h, i) => (
              <div key={i} className="flex gap-2 mt-2">
                <Input placeholder="Header name" value={h.key} onChange={(e) => updateHeader(i, "key", e.target.value)} className="flex-1" />
                <Input placeholder="Value" value={h.value} onChange={(e) => updateHeader(i, "value", e.target.value)} className="flex-1" />
                <Button variant="ghost" size="sm" className="h-9 px-2 text-red-500" onClick={() => removeHeader(i)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
          <div>
            <Label>Test Endpoint (optional)</Label>
            <Input className="mt-1" placeholder="/health" value={testEndpoint} onChange={(e) => setTestEndpoint(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!name.trim() || !baseUrl.trim() || saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
            Create Connector
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// === CUSTOM WEBHOOK MODAL ===
function CustomWebhookModal({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [direction, setDirection] = useState<"inbound" | "outbound">("inbound");
  const [targetUrl, setTargetUrl] = useState("");
  const [httpMethod, setHttpMethod] = useState("POST");
  const [headers, setHeaders] = useState<{ key: string; value: string }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setName(""); setDirection("inbound"); setTargetUrl(""); setHttpMethod("POST"); setHeaders([]); }
  }, [open]);

  const addHeader = () => setHeaders([...headers, { key: "", value: "" }]);
  const removeHeader = (i: number) => setHeaders(headers.filter((_, idx) => idx !== i));
  const updateHeader = (i: number, field: "key" | "value", val: string) => {
    const next = [...headers];
    next[i][field] = val;
    setHeaders(next);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    if (direction === "outbound" && !targetUrl.trim()) return;
    setSaving(true);
    try {
      const headersObj: Record<string, string> = {};
      headers.forEach((h) => { if (h.key.trim()) headersObj[h.key.trim()] = h.value; });

      const config: Record<string, any> = { direction };
      if (direction === "outbound") {
        config.targetUrl = targetUrl.trim();
        config.httpMethod = httpMethod;
        config.headers = headersObj;
      }
      // HMAC secret auto-generated server-side for inbound

      const res = await apiRequest("POST", "/api/connectors", {
        type: "webhook",
        provider: "custom_webhook",
        name: name.trim(),
        config,
      });
      const connector = await res.json();

      toast({
        title: "Webhook connector created",
        description: direction === "inbound" ? `Webhook URL: /api/webhooks/inbound/${connector.id}` : undefined,
      });
      onSuccess();
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Webhook className="w-5 h-5 text-yellow-400" />
            Custom Webhook
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Name</Label>
            <Input className="mt-1" placeholder="My Webhook" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Direction</Label>
            <Select value={direction} onValueChange={(v) => setDirection(v as "inbound" | "outbound")}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="inbound">Inbound (receive events)</SelectItem>
                <SelectItem value="outbound">Outbound (send events)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {direction === "inbound" && (
            <div className="bg-secondary/50 rounded-xl p-3 text-xs text-muted-foreground space-y-1">
              <p>A unique webhook URL and HMAC secret will be generated after creation.</p>
              <p>The last 100 events will be stored.</p>
            </div>
          )}
          {direction === "outbound" && (
            <>
              <div>
                <Label>Target URL</Label>
                <Input className="mt-1" placeholder="https://example.com/webhook" value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} />
              </div>
              <div>
                <Label>HTTP Method</Label>
                <Select value={httpMethod} onValueChange={setHttpMethod}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="POST">POST</SelectItem>
                    <SelectItem value="PUT">PUT</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <Label>Custom Headers</Label>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={addHeader}>
                    <Plus className="w-3 h-3 mr-1" /> Add
                  </Button>
                </div>
                {headers.map((h, i) => (
                  <div key={i} className="flex gap-2 mt-2">
                    <Input placeholder="Header name" value={h.key} onChange={(e) => updateHeader(i, "key", e.target.value)} className="flex-1" />
                    <Input placeholder="Value" value={h.value} onChange={(e) => updateHeader(i, "value", e.target.value)} className="flex-1" />
                    <Button variant="ghost" size="sm" className="h-9 px-2 text-red-500" onClick={() => removeHeader(i)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!name.trim() || saving || (direction === "outbound" && !targetUrl.trim())}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
            Create Webhook
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// === CUSTOM OAUTH2 MODAL ===
function CustomOAuth2Modal({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [authUrl, setAuthUrl] = useState("");
  const [tokenUrl, setTokenUrl] = useState("");
  const [scopes, setScopes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setName(""); setClientId(""); setClientSecret(""); setAuthUrl(""); setTokenUrl(""); setScopes(""); }
  }, [open]);

  const handleSave = async () => {
    if (!name.trim() || !clientId.trim() || !clientSecret.trim() || !authUrl.trim() || !tokenUrl.trim()) return;
    setSaving(true);
    try {
      await apiRequest("POST", "/api/connectors", {
        type: "oauth2",
        provider: "custom_oauth2",
        name: name.trim(),
        config: { clientId, clientSecret, authUrl, tokenUrl, scopes },
      });
      toast({ title: "Custom OAuth2 connector created" });
      onSuccess();
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-pink-400" />
            Custom OAuth2
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Name</Label>
            <Input className="mt-1" placeholder="My OAuth App" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Client ID</Label>
            <Input className="mt-1" placeholder="client_id_xxx" value={clientId} onChange={(e) => setClientId(e.target.value)} />
          </div>
          <div>
            <Label>Client Secret</Label>
            <Input className="mt-1" type="password" placeholder="client_secret_xxx" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} />
          </div>
          <div>
            <Label>Authorization URL</Label>
            <Input className="mt-1" placeholder="https://provider.com/oauth/authorize" value={authUrl} onChange={(e) => setAuthUrl(e.target.value)} />
          </div>
          <div>
            <Label>Token URL</Label>
            <Input className="mt-1" placeholder="https://provider.com/oauth/token" value={tokenUrl} onChange={(e) => setTokenUrl(e.target.value)} />
          </div>
          <div>
            <Label>Scopes (space-separated)</Label>
            <Input className="mt-1" placeholder="read write" value={scopes} onChange={(e) => setScopes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!name.trim() || !clientId.trim() || !clientSecret.trim() || !authUrl.trim() || !tokenUrl.trim() || saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
            Create Connector
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
