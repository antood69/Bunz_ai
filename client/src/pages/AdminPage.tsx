import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Shield,
  Users,
  Database,
  ThumbsUp,
  ThumbsDown,
  Search,
  ChevronLeft,
  ChevronRight,
  Minus,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface IntelligenceStats {
  total: number;
  byType: Record<string, number>;
  byQuality: { good: number; bad: number; unrated: number };
}

interface UserRow {
  id: string | number;
  username: string;
  email: string;
  displayName: string;
  role: string;
  tier: string;
  authProvider: string;
  avatarUrl?: string;
  lastLoginAt?: string;
  createdAt?: string;
}

interface UserDetail {
  user: UserRow;
  plan?: Record<string, unknown>;
  stats: { totalTokensUsed: number; sessionCount: number };
}

interface IntelligenceRow {
  id: string | number;
  userEmail?: string;
  userId?: string | number;
  eventType: string;
  model?: string;
  inputData?: unknown;
  outputData?: unknown;
  tokensUsed?: number;
  quality?: string;
  createdAt?: string;
}

interface IntelligenceResponse {
  data: IntelligenceRow[];
  total: number;
  limit: number;
  offset: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dt?: string) {
  if (!dt) return "—";
  return new Date(dt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function truncate(str: string, len = 100) {
  if (!str) return "";
  return str.length <= len ? str : str.slice(0, len) + "…";
}

function safeStringify(val: unknown) {
  if (val === undefined || val === null) return "";
  if (typeof val === "string") return val;
  try {
    return JSON.stringify(val, null, 2);
  } catch {
    return String(val);
  }
}

// ---------------------------------------------------------------------------
// Badge helpers
// ---------------------------------------------------------------------------

function RoleBadge({ role }: { role: string }) {
  const map: Record<string, string> = {
    owner: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    admin: "bg-violet-500/20 text-violet-300 border-violet-500/30",
    user: "bg-zinc-700/60 text-zinc-300 border-zinc-600/40",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-xl text-[11px] font-medium border ${
        map[role] ?? map.user
      }`}
    >
      {role}
    </span>
  );
}

function TierBadge({ tier }: { tier: string }) {
  const map: Record<string, string> = {
    free: "bg-zinc-700/60 text-zinc-300 border-zinc-600/40",
    starter: "bg-sky-500/20 text-sky-300 border-sky-500/30",
    pro: "bg-violet-500/20 text-violet-300 border-violet-500/30",
    agency: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-xl text-[11px] font-medium border ${
        map[tier] ?? map.free
      }`}
    >
      {tier ?? "free"}
    </span>
  );
}

function EventTypeBadge({ type }: { type: string }) {
  const map: Record<string, string> = {
    agent_chat: "bg-sky-500/20 text-sky-300 border-sky-500/30",
    boss_chat: "bg-violet-500/20 text-violet-300 border-violet-500/30",
    workflow_run: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-xl text-[11px] font-medium border ${
        map[type] ?? "bg-zinc-700/60 text-zinc-300 border-zinc-600/40"
      }`}
    >
      {type}
    </span>
  );
}

function QualityBadge({ quality }: { quality?: string }) {
  if (!quality || quality === "unrated") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-xl text-[11px] font-medium border bg-zinc-700/40 text-zinc-400 border-zinc-600/30">
        unrated
      </span>
    );
  }
  const map: Record<string, string> = {
    good: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    bad: "bg-red-500/20 text-red-300 border-red-500/30",
    neutral: "bg-zinc-700/60 text-zinc-300 border-zinc-600/40",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-xl text-[11px] font-medium border ${
        map[quality] ?? map.neutral
      }`}
    >
      {quality}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: number | string;
  iconClass: string;
}

function StatCard({ icon: Icon, label, value, iconClass }: StatCardProps) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-5">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${iconClass}`}>
            <Icon className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-xl font-semibold tabular-nums">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Overview Tab
// ---------------------------------------------------------------------------

function OverviewTab() {
  const { data: stats, isLoading } = useQuery<IntelligenceStats>({
    queryKey: ["/api/owner/intelligence/stats"],
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-card animate-pulse border border-border" />
          ))}
        </div>
      </div>
    );
  }

  const total = stats?.total ?? 0;
  const good = stats?.byQuality?.good ?? 0;
  const bad = stats?.byQuality?.bad ?? 0;
  const byType = stats?.byType ?? {};
  const typeEntries = Object.entries(byType);

  const typeColors: Record<string, string> = {
    agent_chat: "bg-sky-500",
    boss_chat: "bg-violet-500",
    workflow_run: "bg-emerald-500",
  };

  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Users}
          label="Total Users"
          value="—"
          iconClass="bg-indigo-500/10 text-indigo-400"
        />
        <StatCard
          icon={Database}
          label="Total Generations"
          value={total.toLocaleString()}
          iconClass="bg-sky-500/10 text-sky-400"
        />
        <StatCard
          icon={ThumbsUp}
          label="Rated Good"
          value={good.toLocaleString()}
          iconClass="bg-emerald-500/10 text-emerald-500"
        />
        <StatCard
          icon={ThumbsDown}
          label="Rated Bad"
          value={bad.toLocaleString()}
          iconClass="bg-red-500/10 text-red-500"
        />
      </div>

      {/* By Type Breakdown */}
      {typeEntries.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Generations by Type
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {typeEntries.map(([type, count]) => {
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <div key={type} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <EventTypeBadge type={type} />
                    </div>
                    <span className="text-muted-foreground tabular-nums">
                      {count.toLocaleString()} &nbsp;
                      <span className="text-xs">({pct}%)</span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full ${typeColors[type] ?? "bg-zinc-500"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Quality Breakdown */}
      {stats && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Quality Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 flex-wrap">
              {Object.entries(stats.byQuality).map(([q, n]) => (
                <div key={q} className="flex flex-col items-center gap-1">
                  <QualityBadge quality={q} />
                  <span className="text-lg font-semibold tabular-nums">{n.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// User Detail Dialog
// ---------------------------------------------------------------------------

function UserDetailDialog({
  userId,
  open,
  onClose,
}: {
  userId: string | number | null;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [pendingRole, setPendingRole] = useState<string | null>(null);
  const [pendingTier, setPendingTier] = useState<string | null>(null);

  const { data, isLoading } = useQuery<UserDetail>({
    queryKey: [`/api/owner/users/${userId}`],
    enabled: open && userId !== null,
    retry: false,
  });

  const updateUser = useMutation({
    mutationFn: async (patch: { role?: string; tier?: string }) => {
      const res = await fetch(`/api/owner/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("Update failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/owner/users"] });
      qc.invalidateQueries({ queryKey: [`/api/owner/users/${userId}`] });
    },
  });

  const u = data?.user;
  const stats = data?.stats;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-base">User Details</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3 py-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-8 rounded bg-muted animate-pulse" />
            ))}
          </div>
        ) : !u ? (
          <p className="text-sm text-muted-foreground py-4">User not found.</p>
        ) : (
          <div className="space-y-5 py-2">
            {/* Identity */}
            <div className="flex items-center gap-3">
              <Avatar className="w-10 h-10">
                {u.avatarUrl && <AvatarImage src={u.avatarUrl} />}
                <AvatarFallback className="bg-muted text-muted-foreground text-sm">
                  {(u.displayName || u.email || "?")[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-medium">{u.displayName || u.username}</p>
                <p className="text-xs text-muted-foreground">{u.email}</p>
              </div>
            </div>

            {/* Badges */}
            <div className="flex gap-2 flex-wrap">
              <RoleBadge role={u.role} />
              <TierBadge tier={u.tier} />
              <span className="inline-flex items-center px-2 py-0.5 rounded-xl text-[11px] font-medium border bg-zinc-700/40 text-zinc-400 border-zinc-600/30">
                {u.authProvider}
              </span>
            </div>

            {/* Stats */}
            {stats && (
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-muted/30 border border-border p-3">
                  <p className="text-xs text-muted-foreground mb-0.5">Total Tokens Used</p>
                  <p className="text-lg font-semibold tabular-nums">
                    {stats.totalTokensUsed?.toLocaleString() ?? 0}
                  </p>
                </div>
                <div className="rounded-xl bg-muted/30 border border-border p-3">
                  <p className="text-xs text-muted-foreground mb-0.5">Sessions</p>
                  <p className="text-lg font-semibold tabular-nums">
                    {stats.sessionCount?.toLocaleString() ?? 0}
                  </p>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="space-y-3 pt-1">
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-20 shrink-0">Change Role</span>
                <Select
                  value={pendingRole ?? u.role}
                  onValueChange={(val) => setPendingRole(val)}
                >
                  <SelectTrigger className="h-8 text-xs bg-muted/30 border-border flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">user</SelectItem>
                    <SelectItem value="admin">admin</SelectItem>
                    <SelectItem value="owner">owner</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  disabled={!pendingRole || pendingRole === u.role || updateUser.isPending}
                  onClick={() => {
                    if (pendingRole) updateUser.mutate({ role: pendingRole });
                  }}
                >
                  Save
                </Button>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-20 shrink-0">Change Tier</span>
                <Select
                  value={pendingTier ?? u.tier ?? "free"}
                  onValueChange={(val) => setPendingTier(val)}
                >
                  <SelectTrigger className="h-8 text-xs bg-muted/30 border-border flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free">free</SelectItem>
                    <SelectItem value="starter">starter</SelectItem>
                    <SelectItem value="pro">pro</SelectItem>
                    <SelectItem value="agency">agency</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  disabled={!pendingTier || pendingTier === (u.tier ?? "free") || updateUser.isPending}
                  onClick={() => {
                    if (pendingTier) updateUser.mutate({ tier: pendingTier });
                  }}
                >
                  Save
                </Button>
              </div>
            </div>

            {/* Plan */}
            {data?.plan && (
              <div className="rounded-xl bg-muted/20 border border-border p-3">
                <p className="text-xs font-medium text-muted-foreground mb-2">Plan Details</p>
                <pre className="text-[11px] text-zinc-300 overflow-x-auto">
                  {JSON.stringify(data.plan, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Users Tab
// ---------------------------------------------------------------------------

function UsersTab() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const { data: users, isLoading } = useQuery<UserRow[]>({
    queryKey: ["/api/owner/users"],
    retry: false,
  });

  const filtered = (users ?? []).filter((u) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      u.email?.toLowerCase().includes(q) ||
      u.displayName?.toLowerCase().includes(q) ||
      u.username?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          className="pl-9 h-8 text-sm bg-muted/30 border-border"
          placeholder="Search email or name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-xs text-muted-foreground w-10"></TableHead>
              <TableHead className="text-xs text-muted-foreground">Email</TableHead>
              <TableHead className="text-xs text-muted-foreground">Display Name</TableHead>
              <TableHead className="text-xs text-muted-foreground">Role</TableHead>
              <TableHead className="text-xs text-muted-foreground">Tier</TableHead>
              <TableHead className="text-xs text-muted-foreground">Provider</TableHead>
              <TableHead className="text-xs text-muted-foreground">Last Login</TableHead>
              <TableHead className="text-xs text-muted-foreground w-16"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="border-border">
                  {Array.from({ length: 8 }).map((__, j) => (
                    <TableCell key={j}>
                      <div className="h-4 bg-muted animate-pulse rounded" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow className="border-border">
                <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                  {search ? "No users match your search." : "No users found."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((u) => (
                <TableRow
                  key={u.id}
                  className="border-border hover:bg-muted/20 cursor-pointer"
                  onClick={() => {
                    setSelectedUserId(u.id);
                    setDetailOpen(true);
                  }}
                >
                  <TableCell>
                    <Avatar className="w-7 h-7">
                      {u.avatarUrl && <AvatarImage src={u.avatarUrl} />}
                      <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                        {(u.displayName || u.email || "?")[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </TableCell>
                  <TableCell className="text-sm">{u.email}</TableCell>
                  <TableCell className="text-sm">{u.displayName || u.username || "—"}</TableCell>
                  <TableCell>
                    <RoleBadge role={u.role} />
                  </TableCell>
                  <TableCell>
                    <TierBadge tier={u.tier} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground capitalize">
                    {u.authProvider || "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(u.lastLoginAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={u.tier}
                        onChange={async (e) => {
                          await fetch(`/api/owner/users/${u.id}`, {
                            method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include",
                            body: JSON.stringify({ tier: e.target.value }),
                          });
                          queryClient.invalidateQueries({ queryKey: ["/api/owner/users"] });
                        }}
                        className="h-6 bg-secondary border border-border rounded px-1 text-[10px]"
                      >
                        <option value="free">Free</option>
                        <option value="starter">Starter</option>
                        <option value="pro">Pro</option>
                        <option value="agency">Agency</option>
                      </select>
                      {u.role !== "owner" && (
                        <Button size="sm" variant="ghost" className={`h-6 px-1.5 text-[10px] ${u.role === "suspended" ? "text-emerald-500" : "text-amber-500"}`}
                          onClick={async () => {
                            await fetch(`/api/owner/users/${u.id}/suspend`, { method: "POST", credentials: "include" });
                            queryClient.invalidateQueries({ queryKey: ["/api/owner/users"] });
                          }}>
                          {u.role === "suspended" ? "Unsuspend" : "Suspend"}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <UserDetailDialog
        userId={selectedUserId}
        open={detailOpen}
        onClose={() => {
          setDetailOpen(false);
          setSelectedUserId(null);
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Intelligence Expand Dialog
// ---------------------------------------------------------------------------

function IntelligenceExpandDialog({
  row,
  open,
  onClose,
  onQualityChange,
}: {
  row: IntelligenceRow | null;
  open: boolean;
  onClose: () => void;
  onQualityChange: (id: string | number, quality: string) => void;
}) {
  if (!row) return null;

  const inputStr = safeStringify(row.inputData);
  const outputStr = safeStringify(row.outputData);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            Generation Detail
            <EventTypeBadge type={row.eventType} />
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Metadata */}
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div>
              <p className="text-muted-foreground mb-0.5">User</p>
              <p className="font-medium">{row.userEmail || String(row.userId) || "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground mb-0.5">Model</p>
              <p className="font-medium">{row.model || "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground mb-0.5">Tokens</p>
              <p className="font-medium tabular-nums">{row.tokensUsed?.toLocaleString() ?? "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground mb-0.5">Timestamp</p>
              <p className="font-medium">{row.createdAt ? new Date(row.createdAt).toLocaleString() : "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground mb-0.5">Quality</p>
              <QualityBadge quality={row.quality} />
            </div>
          </div>

          {/* Quality Buttons */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Rate:</span>
            <button
              onClick={() => onQualityChange(row.id, "good")}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs border transition-colors ${
                row.quality === "good"
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                  : "bg-muted/30 text-muted-foreground border-border hover:bg-muted/50"
              }`}
            >
              <ThumbsUp className="w-3 h-3" /> Good
            </button>
            <button
              onClick={() => onQualityChange(row.id, "bad")}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs border transition-colors ${
                row.quality === "bad"
                  ? "bg-red-500/20 text-red-300 border-red-500/30"
                  : "bg-muted/30 text-muted-foreground border-border hover:bg-muted/50"
              }`}
            >
              <ThumbsDown className="w-3 h-3" /> Bad
            </button>
            <button
              onClick={() => onQualityChange(row.id, "neutral")}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs border transition-colors ${
                row.quality === "neutral"
                  ? "bg-zinc-600/50 text-zinc-300 border-zinc-500/40"
                  : "bg-muted/30 text-muted-foreground border-border hover:bg-muted/50"
              }`}
            >
              <Minus className="w-3 h-3" /> Neutral
            </button>
          </div>

          {/* Input */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Input</p>
            <pre className="text-[11px] font-mono bg-muted/20 border border-border rounded-xl p-3 overflow-x-auto whitespace-pre-wrap break-words text-zinc-300">
              {inputStr || "(empty)"}
            </pre>
          </div>

          {/* Output */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Output</p>
            <pre className="text-[11px] font-mono bg-muted/20 border border-border rounded-xl p-3 overflow-x-auto whitespace-pre-wrap break-words text-zinc-300">
              {outputStr || "(empty)"}
            </pre>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Intelligence Tab
// ---------------------------------------------------------------------------

const LIMIT = 50;

function IntelligenceTab() {
  const qc = useQueryClient();
  const [offset, setOffset] = useState(0);
  const [eventTypeFilter, setEventTypeFilter] = useState("all");
  const [qualityFilter, setQualityFilter] = useState("all");
  const [userIdSearch, setUserIdSearch] = useState("");
  const [expandRow, setExpandRow] = useState<IntelligenceRow | null>(null);
  const [expandOpen, setExpandOpen] = useState(false);

  const queryParams = new URLSearchParams({
    limit: String(LIMIT),
    offset: String(offset),
    ...(eventTypeFilter !== "all" && { eventType: eventTypeFilter }),
    ...(qualityFilter !== "all" && { quality: qualityFilter }),
    ...(userIdSearch && { userId: userIdSearch }),
  });

  const { data, isLoading } = useQuery<IntelligenceResponse>({
    queryKey: [`/api/owner/intelligence?${queryParams.toString()}`],
    retry: false,
  });

  const qualityMutation = useMutation({
    mutationFn: async ({ id, quality }: { id: string | number; quality: string }) => {
      const res = await fetch(`/api/owner/intelligence/${id}/quality`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quality }),
      });
      if (!res.ok) throw new Error("Rating failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/owner/intelligence`], type: "all" });
    },
  });

  function handleQualityChange(id: string | number, quality: string) {
    qualityMutation.mutate({ id, quality });
    // Optimistic local update for expanded row
    if (expandRow && expandRow.id === id) {
      setExpandRow({ ...expandRow, quality });
    }
  }

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const hasPrev = offset > 0;
  const hasNext = offset + LIMIT < total;

  function resetFilters() {
    setOffset(0);
    setEventTypeFilter("all");
    setQualityFilter("all");
    setUserIdSearch("");
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={eventTypeFilter}
          onValueChange={(v) => { setEventTypeFilter(v); setOffset(0); }}
        >
          <SelectTrigger className="h-8 text-xs w-36 bg-muted/30 border-border">
            <SelectValue placeholder="Event type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="agent_chat">agent_chat</SelectItem>
            <SelectItem value="boss_chat">boss_chat</SelectItem>
            <SelectItem value="workflow_run">workflow_run</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={qualityFilter}
          onValueChange={(v) => { setQualityFilter(v); setOffset(0); }}
        >
          <SelectTrigger className="h-8 text-xs w-32 bg-muted/30 border-border">
            <SelectValue placeholder="Quality" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All quality</SelectItem>
            <SelectItem value="good">Good</SelectItem>
            <SelectItem value="bad">Bad</SelectItem>
            <SelectItem value="neutral">Neutral</SelectItem>
            <SelectItem value="unrated">Unrated</SelectItem>
          </SelectContent>
        </Select>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            className="pl-8 h-8 text-xs w-44 bg-muted/30 border-border"
            placeholder="Filter by user ID…"
            value={userIdSearch}
            onChange={(e) => { setUserIdSearch(e.target.value); setOffset(0); }}
          />
        </div>

        {(eventTypeFilter !== "all" || qualityFilter !== "all" || userIdSearch) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground"
            onClick={resetFilters}
          >
            Clear filters
          </Button>
        )}

        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {total.toLocaleString()} total
        </span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-xs text-muted-foreground">User</TableHead>
              <TableHead className="text-xs text-muted-foreground">Type</TableHead>
              <TableHead className="text-xs text-muted-foreground">Model</TableHead>
              <TableHead className="text-xs text-muted-foreground">Input</TableHead>
              <TableHead className="text-xs text-muted-foreground">Output</TableHead>
              <TableHead className="text-xs text-muted-foreground">Tokens</TableHead>
              <TableHead className="text-xs text-muted-foreground">Quality</TableHead>
              <TableHead className="text-xs text-muted-foreground">Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i} className="border-border">
                  {Array.from({ length: 8 }).map((__, j) => (
                    <TableCell key={j}>
                      <div className="h-4 bg-muted animate-pulse rounded" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow className="border-border">
                <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-10">
                  No intelligence data found.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const inputStr = safeStringify(row.inputData);
                const outputStr = safeStringify(row.outputData);
                return (
                  <TableRow key={row.id} className="border-border hover:bg-muted/10">
                    {/* User */}
                    <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate">
                      {row.userEmail || String(row.userId || "—")}
                    </TableCell>

                    {/* Type */}
                    <TableCell>
                      <EventTypeBadge type={row.eventType} />
                    </TableCell>

                    {/* Model */}
                    <TableCell className="text-xs text-muted-foreground max-w-[100px] truncate">
                      {row.model || "—"}
                    </TableCell>

                    {/* Input */}
                    <TableCell className="max-w-[150px]">
                      <button
                        className="text-left text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                        onClick={() => {
                          setExpandRow(row);
                          setExpandOpen(true);
                        }}
                      >
                        {truncate(inputStr, 80) || "(empty)"}
                      </button>
                    </TableCell>

                    {/* Output */}
                    <TableCell className="max-w-[150px]">
                      <button
                        className="text-left text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                        onClick={() => {
                          setExpandRow(row);
                          setExpandOpen(true);
                        }}
                      >
                        {truncate(outputStr, 80) || "(empty)"}
                      </button>
                    </TableCell>

                    {/* Tokens */}
                    <TableCell className="text-xs tabular-nums text-muted-foreground">
                      {row.tokensUsed?.toLocaleString() ?? "—"}
                    </TableCell>

                    {/* Quality */}
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <button
                          title="Good"
                          onClick={() => handleQualityChange(row.id, "good")}
                          className={`p-1 rounded transition-colors ${
                            row.quality === "good"
                              ? "text-emerald-500 bg-emerald-500/15"
                              : "text-zinc-600 hover:text-emerald-500"
                          }`}
                        >
                          <ThumbsUp className="w-3 h-3" />
                        </button>
                        <button
                          title="Bad"
                          onClick={() => handleQualityChange(row.id, "bad")}
                          className={`p-1 rounded transition-colors ${
                            row.quality === "bad"
                              ? "text-red-500 bg-red-500/15"
                              : "text-zinc-600 hover:text-red-500"
                          }`}
                        >
                          <ThumbsDown className="w-3 h-3" />
                        </button>
                        <button
                          title="Neutral"
                          onClick={() => handleQualityChange(row.id, "neutral")}
                          className={`p-1 rounded transition-colors ${
                            row.quality === "neutral"
                              ? "text-zinc-300 bg-zinc-600/40"
                              : "text-zinc-600 hover:text-zinc-300"
                          }`}
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                      </div>
                    </TableCell>

                    {/* Date */}
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {row.createdAt ? new Date(row.createdAt).toLocaleDateString() : "—"}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          Showing {offset + 1}–{Math.min(offset + LIMIT, total)} of {total.toLocaleString()}
        </span>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            disabled={!hasPrev}
            onClick={() => setOffset(Math.max(0, offset - LIMIT))}
          >
            <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Previous
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            disabled={!hasNext}
            onClick={() => setOffset(offset + LIMIT)}
          >
            Next <ChevronRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        </div>
      </div>

      {/* Expand Dialog */}
      <IntelligenceExpandDialog
        row={expandRow}
        open={expandOpen}
        onClose={() => {
          setExpandOpen(false);
          setExpandRow(null);
        }}
        onQualityChange={handleQualityChange}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Audit Log Tab
// ---------------------------------------------------------------------------
function AuditTab() {
  const { data: logs = [] } = useQuery<Array<{ id: string; userId: number; title: string; description: string; createdAt: number }>>({
    queryKey: ["/api/owner/audit"],
    refetchInterval: 10000,
  });

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Admin actions, user management events, and system changes</p>
      {logs.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No audit events yet</p>
      ) : (
        <div className="space-y-2">
          {logs.map((l) => (
            <div key={l.id} className="flex items-start gap-3 bg-card border border-border rounded-2xl px-4 py-3">
              <div className="flex-1">
                <p className="text-sm text-foreground">{l.title}</p>
                {l.description && <p className="text-xs text-muted-foreground mt-0.5">{l.description}</p>}
              </div>
              <span className="text-[10px] text-muted-foreground flex-shrink-0">
                {new Date(l.createdAt).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Obsidian Vault Tab (Owner-only)
// ---------------------------------------------------------------------------
function ObsidianTab() {
  const [apiKey, setApiKey] = useState("");
  const [apiUrl, setApiUrl] = useState("http://127.0.0.1:27123");
  const [status, setStatus] = useState<"idle" | "testing" | "connected" | "error">("idle");
  const [error, setError] = useState("");
  const { toast } = useToast();

  // Load existing config
  const { data: connectors = [], refetch } = useQuery<any[]>({ queryKey: ["/api/connectors"] });
  const obsConnector = connectors.find((c: any) => c.provider === "obsidian");

  useEffect(() => {
    if (obsConnector) {
      setStatus(obsConnector.status === "connected" ? "connected" : "error");
    }
  }, [obsConnector]);

  const handleConnect = async () => {
    if (!apiKey.trim()) return;
    setStatus("testing"); setError("");
    try {
      // Delete old one if exists
      if (obsConnector) await fetch(`/api/connectors/${obsConnector.id}`, { method: "DELETE", credentials: "include" });
      // Create new
      const res = await fetch("/api/connectors", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ type: "api_key", provider: "obsidian", name: "Obsidian Vault", config: { apiKey: apiKey.trim(), apiUrl } }),
      });
      const connector = await res.json();
      // Test
      const testRes = await fetch(`/api/connectors/${connector.id}/test`, { method: "POST", credentials: "include" });
      const result = await testRes.json();
      if (result.ok) {
        setStatus("connected"); toast({ title: "Obsidian vault connected!" }); refetch();
      } else {
        setStatus("error"); setError(result.error || "Connection failed");
        await fetch(`/api/connectors/${connector.id}`, { method: "DELETE", credentials: "include" });
      }
    } catch (e: any) { setStatus("error"); setError(e.message); }
  };

  const handleDisconnect = async () => {
    if (obsConnector) {
      await fetch(`/api/connectors/${obsConnector.id}`, { method: "DELETE", credentials: "include" });
      setStatus("idle"); setApiKey(""); refetch();
      toast({ title: "Obsidian disconnected" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-xl bg-purple-500/15 flex items-center justify-center text-purple-400 font-bold text-sm">◆</div>
          <div>
            <h3 className="text-sm font-semibold">Obsidian Vault</h3>
            <p className="text-xs text-muted-foreground">All user inputs and outputs are saved to your vault</p>
          </div>
          {status === "connected" && <span className="ml-auto text-xs text-emerald-500 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Connected</span>}
        </div>

        {status === "connected" ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Your Obsidian vault is receiving all platform activity — every user's inputs, outputs, and department results are auto-saved and organized by folder.</p>
            <div className="text-xs text-muted-foreground">
              <p><strong>Folders:</strong> Boss/, Research/, Coder/, Writer/, Artist/, Inputs/, Synthesis/, Workflows/, Bots/</p>
            </div>
            <Button variant="destructive" size="sm" className="text-xs" onClick={handleDisconnect}>Disconnect</Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">API Key (from Obsidian Local REST API plugin)</label>
              <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Your API key..."
                className="w-full mt-1 bg-secondary border border-border rounded-xl px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">API URL</label>
              <input value={apiUrl} onChange={(e) => setApiUrl(e.target.value)}
                className="w-full mt-1 bg-secondary border border-border rounded-xl px-3 py-2 text-sm" />
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <Button size="sm" onClick={handleConnect} disabled={!apiKey.trim() || status === "testing"}>
              {status === "testing" ? "Testing..." : "Connect Vault"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AdminPage
// ---------------------------------------------------------------------------

export default function AdminPage() {
  const { isOwner } = useAuth();

  if (!isOwner) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6">
        <Shield className="w-12 h-12 text-muted-foreground mb-3" />
        <h1 className="text-lg font-semibold mb-1">Access Denied</h1>
        <p className="text-sm text-muted-foreground">
          This page is restricted to platform owners.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[1200px]">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center">
          <Shield className="w-5 h-5 text-amber-500" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Owner Control Panel</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Platform intelligence &amp; user management
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList className="bg-muted/30 border border-border">
          <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
          <TabsTrigger value="users" className="text-xs">Users</TabsTrigger>
          <TabsTrigger value="intelligence" className="text-xs">Intelligence</TabsTrigger>
          <TabsTrigger value="obsidian" className="text-xs">Obsidian</TabsTrigger>
          <TabsTrigger value="audit" className="text-xs">Audit Log</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab />
        </TabsContent>

        <TabsContent value="users" className="mt-4">
          <UsersTab />
        </TabsContent>

        <TabsContent value="intelligence" className="mt-4">
          <IntelligenceTab />
        </TabsContent>

        <TabsContent value="obsidian" className="mt-4">
          <ObsidianTab />
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <AuditTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
