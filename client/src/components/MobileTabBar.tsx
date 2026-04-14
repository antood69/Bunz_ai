import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  MessageSquare,
  GitBranch,
  Package,
  Menu,
  X,
  Settings,
  ShieldAlert,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

// Primary 5 tabs shown in the bottom bar
const primaryTabs = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/boss", label: "Chat", icon: MessageSquare },
  { href: "/workflows", label: "Editor", icon: GitBranch },
  { href: "/workshop", label: "Workshop", icon: Package },
];

// All remaining nav items shown in the "More" drawer
const moreItems = [
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function MobileTabBar() {
  const [location] = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const { isOwner, logout } = useAuth();

  const isActive = (href: string) =>
    href === "/" ? location === "/" : location.startsWith(href);

  const isMoreActive = moreItems.some((item) => isActive(item.href)) ||
    (isOwner && location === "/admin");

  return (
    <>
      {/* Bottom tab bar */}
      <div
        className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50 flex items-center"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)", height: "calc(64px + env(safe-area-inset-bottom, 0px))" }}
      >
        {/* Primary tabs */}
        {primaryTabs.map((tab) => {
          const active = isActive(tab.href);
          return (
            <Link key={tab.href} href={tab.href}>
              <button
                className="flex-1 flex flex-col items-center justify-center gap-0.5 min-w-[44px] min-h-[44px] px-1"
                style={{ minWidth: "calc(100vw / 5)" }}
                onClick={() => setMoreOpen(false)}
              >
                <tab.icon
                  className={`w-5 h-5 ${active ? "text-primary" : "text-muted-foreground"}`}
                />
                <span
                  className={`text-[10px] font-medium ${active ? "text-primary" : "text-muted-foreground"}`}
                >
                  {tab.label}
                </span>
              </button>
            </Link>
          );
        })}

        {/* More button */}
        <button
          className="flex-1 flex flex-col items-center justify-center gap-0.5 min-w-[44px] min-h-[44px] px-1"
          style={{ minWidth: "calc(100vw / 5)" }}
          onClick={() => setMoreOpen((prev) => !prev)}
          aria-label="More navigation options"
        >
          <Menu
            className={`w-5 h-5 ${isMoreActive || moreOpen ? "text-primary" : "text-muted-foreground"}`}
          />
          <span
            className={`text-[10px] font-medium ${isMoreActive || moreOpen ? "text-primary" : "text-muted-foreground"}`}
          >
            More
          </span>
        </button>
      </div>

      {/* More drawer overlay */}
      {moreOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setMoreOpen(false)}
          />

          {/* Slide-up drawer */}
          <div
            className="fixed bottom-16 left-0 right-0 z-50 bg-card border-t border-border rounded-t-2xl shadow-2xl"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            {/* Drag handle + close */}
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <span className="text-sm font-semibold text-foreground">More</span>
              <button
                onClick={() => setMoreOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-secondary text-muted-foreground"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Nav items */}
            <nav className="px-2 pb-4 space-y-0.5">
              {moreItems.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link key={item.href} href={item.href}>
                    <div
                      className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm cursor-pointer transition-colors min-h-[44px] ${
                        active
                          ? "bg-primary/15 text-primary font-medium"
                          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                      }`}
                      onClick={() => setMoreOpen(false)}
                    >
                      <item.icon className="w-4 h-4 flex-shrink-0" />
                      {item.label}
                    </div>
                  </Link>
                );
              })}

              {/* Admin link — owner only */}
              {isOwner && (
                <Link href="/admin">
                  <div
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm cursor-pointer transition-colors min-h-[44px] ${
                      location === "/admin"
                        ? "bg-primary/15 text-primary font-medium"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                    }`}
                    onClick={() => setMoreOpen(false)}
                  >
                    <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                    Admin
                  </div>
                </Link>
              )}

              {/* Logout */}
              <button
                onClick={() => { setMoreOpen(false); logout(); }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm text-muted-foreground hover:bg-secondary hover:text-foreground cursor-pointer transition-colors min-h-[44px]"
              >
                <LogOut className="w-4 h-4 flex-shrink-0" />
                Logout
              </button>
            </nav>
          </div>
        </>
      )}
    </>
  );
}
