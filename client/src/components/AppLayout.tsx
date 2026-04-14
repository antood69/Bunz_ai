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
  Package,
  Briefcase,
  Target,
  BookOpen,
  Layers,
  Cpu,
  Trophy,
  Building2,
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
import { useQuery } from "@tanstack/react-query";

const ICON_MAP: Record<string, React.ElementType> = {
  Briefcase, Target, BookOpen, Layers, Cpu, Trophy, Building2,
};

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/boss", label: "Chat", icon: MessageSquare },
  { href: "/settings", label: "Settings", icon: Settings },
];

function BunzLogo() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-label="Bunz">
      <rect x="2" y="2" width="28" height="28" rx="6" stroke="hsl(239 84% 67%)" strokeWidth="2" />
      <path d="M10 22V10l6 8 6-8v12" stroke="hsl(263 70% 58%)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UserAvatar({ name, email }: { name?: string; email?: string }) {
  const initial = (name ?? email ?? "?")[0].toUpperCase();
  return (
    <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-semibold text-primary flex-shrink-0 select-none">
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

  // Fetch installed mods for sidebar
  const { data: installedMods = [] } = useQuery<{ slug: string; name: string; icon: string; route: string }[]>({
    queryKey: ["/api/workshop/installed"],
    enabled: isAuthenticated,
    staleTime: 60000,
  });

  // Redirect to login if not authenticated (skip for public pages)
  useEffect(() => {
    if (!allowPublic && !isLoading && !isAuthenticated) {
      window.location.href = "/#/login";
    }
  }, [isLoading, isAuthenticated, allowPublic]);

  // While loading auth, show nothing to prevent flash (but allow public pages through)
  if (isLoading && !allowPublic) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // If not authenticated and not public, render nothing (redirect is in progress)
  if (!isAuthenticated && !allowPublic) {
    return null;
  }

  const displayLabel = user?.displayName ?? user?.email ?? "User";

  return (
    <div className="flex h-screen overflow-hidden bg-background relative">
      {/* Wallpaper background layer */}
      <WallpaperLayer />

      {/* Sidebar — desktop only */}
      <aside
        className={`hidden md:flex flex-shrink-0 border-r border-border flex-col relative z-10 transition-all duration-200 ${
          sidebarCollapsed ? "w-14" : "w-56"
        } ${
          hasWallpaper
            ? "bg-sidebar/80 backdrop-blur-xl"
            : "bg-sidebar"
        }`}
      >
        {/* Logo + collapse toggle */}
        <div className={`flex items-center h-14 border-b border-border ${sidebarCollapsed ? "justify-center px-2" : "justify-between px-4"}`}>
          <div className={`flex items-center gap-2.5 ${sidebarCollapsed ? "justify-center" : ""}`}>
            <BunzLogo />
            {!sidebarCollapsed && <span className="font-semibold text-sm tracking-tight text-foreground">Bunz</span>}
          </div>
          {!sidebarCollapsed && (
            <button
              onClick={toggleSidebar}
              className="p-1 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              title="Collapse sidebar"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Expand button when collapsed */}
        {sidebarCollapsed && (
          <div className="flex justify-center py-2 border-b border-border">
            <button
              onClick={toggleSidebar}
              className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              title="Expand sidebar"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* User info */}
        {!sidebarCollapsed && (
          <div className="px-3 py-3 border-b border-border">
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-md">
              <UserAvatar name={user?.displayName} email={user?.email} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">{displayLabel}</p>
                {isOwner && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-primary">
                    <ShieldAlert className="w-2.5 h-2.5" />
                    Owner
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
        {sidebarCollapsed && (
          <div className="flex justify-center py-2 border-b border-border">
            <UserAvatar name={user?.displayName} email={user?.email} />
          </div>
        )}

        {/* Navigation */}
        <nav className={`flex-1 py-3 space-y-0.5 overflow-y-auto overscroll-contain ${sidebarCollapsed ? "px-1" : "px-2"}`}>
          {navItems.map((item) => {
            const isActive =
              location === item.href ||
              (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href}>
                <div
                  data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                  title={sidebarCollapsed ? item.label : undefined}
                  className={`flex items-center rounded-md cursor-pointer transition-colors ${
                    sidebarCollapsed ? "justify-center px-2 py-2" : "gap-2.5 px-3 py-2 text-sm"
                  } ${
                    isActive
                      ? "bg-primary/15 text-primary font-medium"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  <item.icon className="w-4 h-4 flex-shrink-0" />
                  {!sidebarCollapsed && item.label}
                </div>
              </Link>
            );
          })}

          {/* Mods removed */}
          {false && installedMods.length > 0 && (
            <>
              {!sidebarCollapsed && (
                <div className="px-3 pt-3 pb-1">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">My Mods</p>
                </div>
              )}
              {sidebarCollapsed && <div className="border-t border-border my-1" />}
              {installedMods.map((mod) => {
                const ModIcon = ICON_MAP[mod.icon] || Package;
                const isActive = location === mod.route || location.startsWith(mod.route + "/");
                return (
                  <Link key={mod.slug} href={mod.route}>
                    <div
                      title={sidebarCollapsed ? mod.name : undefined}
                      className={`flex items-center rounded-md cursor-pointer transition-colors ${
                        sidebarCollapsed ? "justify-center px-2 py-2" : "gap-2.5 px-3 py-2 text-sm"
                      } ${
                        isActive
                          ? "bg-primary/15 text-primary font-medium"
                          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                      }`}
                    >
                      <ModIcon className="w-4 h-4 flex-shrink-0" />
                      {!sidebarCollapsed && mod.name}
                    </div>
                  </Link>
                );
              })}
            </>
          )}

          {/* Admin link — owner only */}
          {isOwner && (
            <Link href="/admin">
              <div
                data-testid="nav-admin"
                title={sidebarCollapsed ? "Admin" : undefined}
                className={`flex items-center rounded-md cursor-pointer transition-colors ${
                  sidebarCollapsed ? "justify-center px-2 py-2" : "gap-2.5 px-3 py-2 text-sm"
                } ${
                  location === "/admin"
                    ? "bg-primary/15 text-primary font-medium"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                {!sidebarCollapsed && "Admin"}
              </div>
            </Link>
          )}
        </nav>

        {!sidebarCollapsed && <TokenCounter />}

        {/* Bottom section: plan + logout */}
        <div className={`py-3 border-t border-border space-y-1 ${sidebarCollapsed ? "px-1" : "px-3"}`}>
          {!sidebarCollapsed ? (
            <>
              <Link href="/settings?tab=pricing">
                <div
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-secondary cursor-pointer transition-colors group"
                  data-testid="sidebar-plan-badge"
                >
                  <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-medium text-primary flex-shrink-0">
                    N
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">Free Tier</p>
                    <p className="text-[11px] text-muted-foreground">2 / 2 agents used</p>
                  </div>
                  <Zap className="w-3 h-3 text-primary opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                </div>
              </Link>

              <button
                onClick={logout}
                data-testid="sidebar-logout"
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-secondary hover:text-foreground cursor-pointer transition-colors"
              >
                <LogOut className="w-4 h-4 flex-shrink-0" />
                Logout
              </button>
            </>
          ) : (
            <button
              onClick={logout}
              data-testid="sidebar-logout"
              title="Logout"
              className="w-full flex items-center justify-center py-2 rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground cursor-pointer transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden relative z-10">
        {/* Mobile top header bar */}
        {isMobile && (
          <div
            className={`flex md:hidden h-14 items-center justify-between px-4 border-b border-border shrink-0 ${
              hasWallpaper
                ? "bg-card/80 backdrop-blur-xl"
                : "bg-card"
            }`}
          >
            {/* Left spacer to center the logo */}
            <div className="w-8" />
            {/* Centered logo */}
            <div className="flex items-center gap-2">
              <BunzLogo />
              <span className="font-semibold text-sm tracking-tight text-foreground">Bunz</span>
            </div>
            {/* Right: notification bell */}
            <div className="flex items-center">
              <NotificationBell />
            </div>
          </div>
        )}

        {/* Desktop top bar with notification bell */}
        {!isMobile && (
          <div
            className={`h-12 border-b border-border flex items-center justify-end px-4 gap-3 shrink-0 ${
              hasWallpaper
                ? "bg-card/80 backdrop-blur-xl"
                : "bg-card"
            }`}
          >
            <NotificationBell />
            <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-semibold text-primary">
              {(user?.displayName || user?.email || "U").charAt(0).toUpperCase()}
            </div>
          </div>
        )}

        <main className={`flex-1 overflow-y-auto overscroll-contain ${isMobile ? "pb-16" : ""}`}>
          {children}
        </main>
      </div>

      {/* Mobile bottom tab bar */}
      {isMobile && <MobileTabBar />}

      {/* Onboarding tour for first-time users */}
      {isAuthenticated && <OnboardingTour />}
    </div>
  );
}
