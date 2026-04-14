import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  Percent,
  DollarSign,
  Clock,
  Bot,
  AlertTriangle,
  CheckCircle,
  Timer,
  BarChart2,
  Inbox,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Escalation {
  id: number | string;
  agent?: string;
  reason?: string;
  status?: string;
  created_at?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function StatCard({
  icon: Icon,
  label,
  value,
  color = "indigo",
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color?: string;
}) {
  const colorMap: Record<string, string> = {
    indigo: "text-indigo-400",
    violet: "text-violet-400",
    emerald: "text-emerald-400",
    amber: "text-amber-400",
    red: "text-red-400",
    sky: "text-sky-400",
  };
  const iconColor = colorMap[color] ?? "text-indigo-400";

  return (
    <Card className="bg-card border border-border">
      <CardContent className="pt-5 pb-4 px-5">
        <div className="flex items-center gap-3">
          <div className={`${iconColor} shrink-0`}>
            <Icon size={20} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground leading-none mb-1">{label}</p>
            <p className="text-xl font-semibold text-foreground">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
      <Inbox size={32} className="opacity-40" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trading Stats Tab
// ---------------------------------------------------------------------------
function TradingStatsTab() {
  return (
    <div className="space-y-6">
      {/* Summary row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard icon={BarChart2} label="Total Trades" value={0} color="indigo" />
        <StatCard icon={Percent} label="Win Rate" value="0%" color="violet" />
        <StatCard icon={DollarSign} label="Total P&L" value="$0.00" color="emerald" />
        <StatCard icon={TrendingUp} label="Best Day" value="$0.00" color="sky" />
        <StatCard icon={TrendingUp} label="Worst Day" value="$0.00" color="red" />
        <StatCard icon={Clock} label="Avg Hold Time" value="--" color="amber" />
      </div>

      {/* Firm Breakdown */}
      <Card className="bg-card border border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-foreground">
            Firm Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground pl-6">Firm</TableHead>
                <TableHead className="text-muted-foreground">Trades</TableHead>
                <TableHead className="text-muted-foreground">Win Rate</TableHead>
                <TableHead className="text-muted-foreground">Avg P&L</TableHead>
                <TableHead className="text-muted-foreground">Total P&L</TableHead>
                <TableHead className="text-muted-foreground pr-6">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow className="border-border hover:bg-white/5">
                <TableCell
                  colSpan={6}
                  className="text-center py-10 text-muted-foreground text-sm"
                >
                  <EmptyState message="Connect firm to see data" />
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Instrument Breakdown */}
      <Card className="bg-card border border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-foreground">
            Instrument Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState message="Connect firm to see data" />
        </CardContent>
      </Card>

      {/* Footer note */}
      <p className="text-xs text-muted-foreground text-center">
        Connect your prop firm accounts in the Trading module to see live
        performance data.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Agent Stats Tab
// ---------------------------------------------------------------------------
function AgentStatsTab() {
  const { data: escalations = [], isLoading } = useQuery<Escalation[]>({
    queryKey: ["escalations"],
    queryFn: async () => {
      const res = await fetch("/api/escalations");
      if (!res.ok) throw new Error("Failed to fetch escalations");
      return res.json();
    },
  });

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Bot} label="Total Jobs Run" value={0} color="indigo" />
        <StatCard icon={Timer} label="Avg Completion Time" value="--" color="violet" />
        <StatCard icon={AlertTriangle} label="Escalation Rate" value="0%" color="amber" />
        <StatCard icon={CheckCircle} label="Audit Pass Rate" value="0%" color="emerald" />
      </div>

      {/* Top Agents by Completion */}
      <Card className="bg-card border border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-foreground">
            Top Agents by Completion
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState message="No agent run data yet" />
        </CardContent>
      </Card>

      {/* Recent Escalations */}
      <Card className="bg-card border border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-foreground">
            Recent Escalations
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
              Loading…
            </div>
          ) : escalations.length === 0 ? (
            <EmptyState message="No escalations found" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground pl-6">ID</TableHead>
                  <TableHead className="text-muted-foreground">Agent</TableHead>
                  <TableHead className="text-muted-foreground">Reason</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                  <TableHead className="text-muted-foreground pr-6">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {escalations.map((e) => (
                  <TableRow
                    key={e.id}
                    className="border-border hover:bg-white/5"
                  >
                    <TableCell className="pl-6 text-foreground/80 font-mono text-xs">
                      #{e.id}
                    </TableCell>
                    <TableCell className="text-foreground/80">
                      {e.agent ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-xs truncate">
                      {e.reason ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          e.status === "resolved"
                            ? "border-emerald-500 text-emerald-400"
                            : "border-amber-500 text-amber-400"
                        }
                      >
                        {e.status ?? "open"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs pr-6">
                      {e.created_at
                        ? new Date(e.created_at).toLocaleDateString()
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function AnalyticsPage() {
  const [tab, setTab] = useState("trading");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            Performance Analytics
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Cross-firm trading metrics &amp; agent efficiency
          </p>
        </div>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="bg-card border border-border">
            <TabsTrigger
              value="trading"
              className="data-[state=active]:bg-indigo-600 data-[state=active]:text-foreground text-muted-foreground"
            >
              Trading Stats
            </TabsTrigger>
            <TabsTrigger
              value="agent"
              className="data-[state=active]:bg-indigo-600 data-[state=active]:text-foreground text-muted-foreground"
            >
              Agent Stats
            </TabsTrigger>
          </TabsList>

          <TabsContent value="trading" className="mt-6">
            <TradingStatsTab />
          </TabsContent>

          <TabsContent value="agent" className="mt-6">
            <AgentStatsTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
