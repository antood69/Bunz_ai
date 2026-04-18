import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, Clock, AlertCircle, Info, CheckCircle, Zap } from "lucide-react";

interface Notification {
  id: number;
  type: string;
  title: string;
  message: string;
  read: number;
  created_at: string;
}

const TYPE_ICONS: Record<string, typeof Bell> = {
  alert: AlertCircle,
  success: CheckCircle,
  info: Info,
  system: Zap,
};

const TYPE_COLORS: Record<string, string> = {
  alert: "text-red-400 bg-red-500/10",
  success: "text-emerald-400 bg-emerald-500/10",
  info: "text-blue-400 bg-blue-500/10",
  system: "text-primary bg-primary/10",
};

function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function NotificationsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ notifications: Notification[]; unreadCount: number }>({
    queryKey: ["/api/notifications"],
  });

  const markRead = useMutation({
    mutationFn: (id: number) => fetch(`/api/notifications/${id}/read`, { method: "POST" }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/notifications"] }),
  });

  const markAllRead = useMutation({
    mutationFn: () => fetch("/api/notifications/read-all", { method: "POST" }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/notifications"] }),
  });

  const notifications = data?.notifications || [];
  const unread = data?.unreadCount || 0;

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-foreground">Notifications</h1>
          {unread > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-primary/15 text-primary text-xs font-medium">
              {unread} new
            </span>
          )}
        </div>
        {unread > 0 && (
          <button
            onClick={() => markAllRead.mutate()}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            Mark all read
          </button>
        )}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Bell className="w-10 h-10 mb-3 opacity-30" />
          <p className="text-sm font-medium">No notifications yet</p>
          <p className="text-xs mt-1">You'll see alerts, updates, and system messages here</p>
        </div>
      ) : (
        <div className="space-y-1">
          {notifications.map((n) => {
            const Icon = TYPE_ICONS[n.type] || Info;
            const color = TYPE_COLORS[n.type] || "text-muted-foreground bg-secondary";
            return (
              <button
                key={n.id}
                onClick={() => !n.read && markRead.mutate(n.id)}
                className={`w-full flex items-start gap-3 p-3 rounded-xl text-left transition-colors ${
                  n.read ? "opacity-60" : "bg-card hover:bg-secondary/50"
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`text-sm ${n.read ? "text-muted-foreground" : "text-foreground font-medium"}`}>
                      {n.title}
                    </p>
                    {!n.read && <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />}
                  </div>
                  {n.message && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                  )}
                  <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground/60">
                    <Clock className="w-2.5 h-2.5" />
                    {timeAgo(n.created_at)}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
