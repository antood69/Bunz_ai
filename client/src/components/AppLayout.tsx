import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  GitBranch,
  Bot,
  Zap,
  Settings,
  LogOut,
  ShieldAlert,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  ListChecks,
  Code,
} from "lucide-react";
import TokenCounter from "./TokenCounter";
import NotificationBell from "./NotificationBell";
import WallpaperLayer from "./WallpaperLayer";
import MobileTabBar from "./MobileTabBar";
import OnboardingTour from "./OnboardingTour";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useEffect, useState } from "react";
const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/boss", label: "Chat", icon: MessageSquare },
  { href: "/editor", label: "Editor", icon: Code },
  { href: "/tasks", label: "Tasks", icon: ListChecks },
  { href: "/workflows", label: "Workflows", icon: GitBranch },
  { href: "/bots", label: "Bots", icon: Bot },
  { href: "/settings", label: "Settings", icon: Settings },
];

function BunzLogo() {
  return (
    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center flex-shrink-0">
      <span className="text-white font-bold text-sm">B</span>
    </div>
  );
}

function UserAvatar({ name, email }: { name?: string; email?: string }) {
  const initial = (name ?? email ?? "?")[0].toUpperCase();
  return (
    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-blue-500 flex items-center justify-center text-xs font-semibold text-white flex-shrink-0 select-none">
      {initial}
    </div>
  );
}

export default function AppLayout({ children, allowPublic = false }: { children: React.ReactNode; allowPublic?: boolean }) {
  const [location] = useLocation();
  const { user, isLoading, isAuthenticated, isOwner, logout } = useAuth();
  const { wallpaperUrl, wallpaperType } = useTheme();
  const hasWallpaper = !!(wallpaperUrl && wallpaperType !== "none");
  const isMobile = useIsMobile();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem("bunz-sidebar-collapsed") === "true"; } catch { return false; }
  });

  const toggleSidebar = () => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem("bunz-sidebar-collapsed", String(next)); } catch {}
      return next;
    });
  };

  // Mods disabled for now
  // const { data: installedMods = [] } = useQuery<{ slug: string; name: string; icon: string; route: string }[]>({
  //   queryKey: ["/api/workshop/installed"],
  //   enabled: isAuthenticated,
  //   staleTime: 60000,
  // });

  useEffect(() => {
    if (!allowPublic && !isLoading && !isAuthenticated) {
      window.location.href = "/#/login";
    }
  }, [isLoading, isAuthenticated, allowPublic]);

  if (isLoading && !allowPublic) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated && !allowPublic) {
    return null;
  }

  const displayLabel = user?.displayName ?? user?.email ?? "User";

  return (
    <div className="flex h-screen overflow-hidden bg-background relative">
      <WallpaperLayer />

      {/* ── Sidebar (desktop) ── */}
      <aside
        className={`hidden md:flex flex-shrink-0 flex-col relative z-10 transition-all duration-200 ${
          sidebarCollapsed ? "w-[68px]" : "w-60"
        } ${
          hasWallpaper
            ? "bg-sidebar/80 backdrop-blur-xl border-r border-border/50"
            : "bg-sidebar border-r border-border"
        }`}
      >
        {/* Logo area */}
        <div className={`flex items-center h-14 ${sidebarCollapsed ? "justify-center px-2" : "justify-between px-4"}`}>
          <div className={`flex items-center gap-3 ${sidebarCollapsed ? "justify-center" : ""}`}>
            <BunzLogo />
            {!sidebarCollapsed && (
              <span className="font-semibold text-[15px] tracking-tight text-foreground">Bunz</span>
            )}
          </div>
          {!sidebarCollapsed && (
            <button
              onClick={toggleSidebar}
              className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              title="Collapse sidebar"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          )}
        </div>

        {sidebarCollapsed && (
          <div className="flex justify-center py-2">
            <button
              onClick={toggleSidebar}
              className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              title="Expand sidebar"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* User info */}
        {!sidebarCollapsed && (
          <div className="px-3 py-3">
            <div className="flex items-center gap-3 px-2 py-2 rounded-xl bg-secondary/50">
              <UserAvatar name={user?.displayName} email={user?.email} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{displayLabel}</p>
                {isOwner && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-primary">
                    <ShieldAlert className="w-2.5 h-2.5" />
                    Owner
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
        {sidebarCollapsed && (
          <div className="flex justify-center py-3">
            <UserAvatar name={user?.displayName} email={user?.email} />
          </div>
        )}

        {/* Navigation */}
        <nav className={`flex-1 py-2 space-y-1 overflow-y-auto overscroll-contain ${sidebarCollapsed ? "px-2" : "px-3"}`}>
          {navItems.map((item) => {
            const isActive =
              location === item.href ||
              (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href}>
                <div
                  data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                  title={sidebarCollapsed ? item.label : undefined}
                  className={`flex items-center rounded-xl cursor-pointer transition-all duration-150 ${
                    sidebarCollapsed ? "justify-center p-2.5" : "gap-3 px-3 py-2.5 text-sm"
                  } ${
                    isActive
                      ? "bg-primary/12 text-primary font-medium"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  <item.icon className={`w-[18px] h-[18px] flex-shrink-0 ${isActive ? "" : ""}`} />
                  {!sidebarCollapsed && item.label}
                </div>
              </Link>
            );
          })}

          {/* Admin link — owner only */}
          {isOwner && (
            <Link href="/admin">
              <div
                data-testid="nav-admin"
                title={sidebarCollapsed ? "Admin" : undefined}
                className={`flex items-center rounded-xl cursor-pointer transition-all duration-150 ${
                  sidebarCollapsed ? "justify-center p-2.5" : "gap-3 px-3 py-2.5 text-sm"
                } ${
                  location === "/admin"
                    ? "bg-primary/12 text-primary font-medium"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <ShieldAlert className="w-[18px] h-[18px] flex-shrink-0" />
                {!sidebarCollapsed && "Admin"}
              </div>
            </Link>
          )}
        </nav>

        {!sidebarCollapsed && <TokenCounter />}

        {/* Bottom section */}
        <div className={`py-3 border-t border-border/50 space-y-1 ${sidebarCollapsed ? "px-2" : "px-3"}`}>
          {!sidebarCollapsed ? (
            <>
              <Link href="/settings?tab=pricing">
                <div
                  className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-secondary cursor-pointer transition-colors group"
                  data-testid="sidebar-plan-badge"
                >
                  <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center text-xs font-medium text-primary flex-shrink-0">
                    N
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">Free Tier</p>
                    <p className="text-[11px] text-muted-foreground">2 / 2 agents used</p>
                  </div>
                  <Zap className="w-3.5 h-3.5 text-primary opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                </div>
              </Link>

              <button
                onClick={logout}
                data-testid="sidebar-logout"
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-muted-foreground hover:bg-secondary hover:text-foreground cursor-pointer transition-colors"
              >
                <LogOut className="w-[18px] h-[18px] flex-shrink-0" />
                Logout
              </button>
            </>
          ) : (
            <button
              onClick={logout}
              data-testid="sidebar-logout"
              title="Logout"
              className="w-full flex items-center justify-center p-2.5 rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground cursor-pointer transition-colors"
            >
              <LogOut className="w-[18px] h-[18px]" />
            </button>
          )}
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col overflow-hidden relative z-10">
        {/* Mobile top header */}
        {isMobile && (
          <div
            className={`flex md:hidden h-14 items-center justify-between px-4 shrink-0 ${
              hasWallpaper
                ? "bg-card/80 backdrop-blur-xl border-b border-border/50"
                : "bg-card border-b border-border"
            }`}
          >
            <div className="w-8" />
            <div className="flex items-center gap-2.5">
              <BunzLogo />
              <span className="font-semibold text-[15px] tracking-tight text-foreground">Bunz</span>
            </div>
            <div className="flex items-center">
              <NotificationBell />
            </div>
          </div>
        )}

        {/* Desktop top bar */}
        {!isMobile && (
          <div
            className={`h-12 flex items-center justify-end px-5 gap-3 shrink-0 ${
              hasWallpaper
                ? "bg-card/80 backdrop-blur-xl border-b border-border/50"
                : "bg-card border-b border-border"
            }`}
          >
            <NotificationBell />
            <UserAvatar name={user?.displayName} email={user?.email} />
          </div>
        )}

        <main className={`flex-1 overflow-y-auto overscroll-contain ${isMobile ? "pb-16" : ""} ${
          hasWallpaper ? "bg-background/70 backdrop-blur-sm" : ""
        }`}>
          {children}
        </main>
      </div>

      {isMobile && <MobileTabBar />}
      {isAuthenticated && <OnboardingTour />}
    </div>
  );
}
