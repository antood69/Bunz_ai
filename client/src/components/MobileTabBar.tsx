import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  MessageSquare,
  GitBranch,
  Bot,
  Menu,
  X,
  Settings,
  ShieldAlert,
  LogOut,
  Store,
  Wallet,
  Puzzle,
  Code,
  ListChecks,
  Sparkles,
  Activity,
  Layers,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";

const primaryTabs = [
  { href: "/", label: "Pulse", icon: Sparkles },
  { href: "/boss", label: "Chat", icon: MessageSquare },
  { href: "/workflows", label: "Flows", icon: GitBranch },
  { href: "/bots", label: "Bots", icon: Bot },
];

const moreItems = [
  { href: "/editor", label: "Editor", icon: Code },
  { href: "/plugins", label: "Plugins", icon: Puzzle },
  { href: "/gallery", label: "Gallery", icon: Layers },
  { href: "/traces", label: "Traces", icon: Activity },
  { href: "/wallet", label: "Wallet", icon: Wallet },
  { href: "/workshop", label: "Workshop", icon: Store },
  { href: "/tasks", label: "Tasks", icon: ListChecks },
  { href: "/dashboard", label: "Analytics", icon: LayoutDashboard },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function MobileTabBar() {
  const [location] = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const { isOwner, logout } = useAuth();
  const { wallpaperUrl, wallpaperType } = useTheme();
  const hasWallpaper = !!(wallpaperUrl && wallpaperType !== "none");

  const isActive = (href: string) =>
    href === "/" ? location === "/" : location.startsWith(href);

  const isMoreActive = moreItems.some((item) => isActive(item.href)) ||
    (isOwner && location === "/admin");

  return (
    <>
      <div
        className={`fixed bottom-0 left-0 right-0 border-t border-border/50 z-50 flex items-center ${
          hasWallpaper ? "bg-card/80 backdrop-blur-xl" : "bg-card"
        }`}
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)", height: "calc(64px + env(safe-area-inset-bottom, 0px))" }}
      >
        {primaryTabs.map((tab) => {
          const active = isActive(tab.href);
          return (
            <Link key={tab.href} href={tab.href}>
              <button
                className="flex-1 flex flex-col items-center justify-center gap-1 min-w-[44px] min-h-[44px] px-1"
                style={{ minWidth: "calc(100vw / 4)" }}
                onClick={() => setMoreOpen(false)}
              >
                <tab.icon className={`w-5 h-5 transition-colors ${active ? "text-primary" : "text-muted-foreground"}`} />
                <span className={`text-[10px] font-medium transition-colors ${active ? "text-primary" : "text-muted-foreground"}`}>
                  {tab.label}
                </span>
              </button>
            </Link>
          );
        })}

        <button
          className="flex-1 flex flex-col items-center justify-center gap-1 min-w-[44px] min-h-[44px] px-1"
          style={{ minWidth: "calc(100vw / 4)" }}
          onClick={() => setMoreOpen((prev) => !prev)}
          aria-label="More navigation options"
        >
          <Menu className={`w-5 h-5 transition-colors ${isMoreActive || moreOpen ? "text-primary" : "text-muted-foreground"}`} />
          <span className={`text-[10px] font-medium transition-colors ${isMoreActive || moreOpen ? "text-primary" : "text-muted-foreground"}`}>
            More
          </span>
        </button>
      </div>

      {moreOpen && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={() => setMoreOpen(false)} />
          <div
            className={`fixed bottom-16 left-0 right-0 z-50 border-t border-border rounded-t-2xl shadow-xl ${
              hasWallpaper ? "bg-card/90 backdrop-blur-xl" : "bg-card"
            }`}
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <span className="text-sm font-semibold text-foreground">More</span>
              <button
                onClick={() => setMoreOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-secondary text-muted-foreground transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <nav className="px-3 pb-4 space-y-0.5">
              {moreItems.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link key={item.href} href={item.href}>
                    <div
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm cursor-pointer transition-all min-h-[44px] ${
                        active
                          ? "bg-primary/12 text-primary font-medium"
                          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                      }`}
                      onClick={() => setMoreOpen(false)}
                    >
                      <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
                      {item.label}
                    </div>
                  </Link>
                );
              })}

              {isOwner && (
                <Link href="/admin">
                  <div
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm cursor-pointer transition-all min-h-[44px] ${
                      location === "/admin"
                        ? "bg-primary/12 text-primary font-medium"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                    }`}
                    onClick={() => setMoreOpen(false)}
                  >
                    <ShieldAlert className="w-[18px] h-[18px] flex-shrink-0" />
                    Admin
                  </div>
                </Link>
              )}

              <button
                onClick={() => { setMoreOpen(false); logout(); }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-muted-foreground hover:bg-secondary hover:text-foreground cursor-pointer transition-all min-h-[44px]"
              >
                <LogOut className="w-[18px] h-[18px] flex-shrink-0" />
                Logout
              </button>
            </nav>
          </div>
        </>
      )}
    </>
  );
}
