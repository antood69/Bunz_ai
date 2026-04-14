import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

type Theme = "light" | "dark";

interface CustomizationState {
  wallpaperUrl: string | null;
  wallpaperType: string;
  wallpaperTint: number;
  accentColor: string;
  glassBlur: number;
  glassOpacity: number;
  sidebarPosition: string;
  compactMode: number;
}

interface ThemeContextType {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  // Customization
  wallpaperUrl: string | null;
  wallpaperType: string;
  wallpaperTint: number;
  accentColor: string;
  glassBlur: number;
  glassOpacity: number;
  sidebarPosition: string;
  compactMode: number;
  setCustomization: (prefs: Partial<CustomizationState>) => void;
  prefsLoaded: boolean;
}

const defaultCustomization: CustomizationState = {
  wallpaperUrl: null,
  wallpaperType: "none",
  wallpaperTint: 0.4,
  accentColor: "#6366f1",
  glassBlur: 12,
  glassOpacity: 0.08,
  sidebarPosition: "left",
  compactMode: 0,
};

const ThemeContext = createContext<ThemeContextType>({
  theme: "dark",
  setTheme: () => {},
  toggleTheme: () => {},
  ...defaultCustomization,
  setCustomization: () => {},
  prefsLoaded: false,
});

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("bunz-theme") as Theme) || "dark";
    }
    return "dark";
  });

  const [customization, setCustomizationState] = useState<CustomizationState>(defaultCustomization);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  // Apply theme class
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
    localStorage.setItem("bunz-theme", theme);
  }, [theme]);

  // Apply CSS custom properties when customization changes
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--accent-color", customization.accentColor);
    root.style.setProperty("--wallpaper-tint-opacity", String(customization.wallpaperTint));
    root.style.setProperty("--glass-blur", `${customization.glassBlur}px`);
    root.style.setProperty("--panel-bg-opacity", String(customization.glassOpacity));
  }, [customization]);

  // Fetch preferences on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/preferences", { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setCustomizationState({
          wallpaperUrl: data.wallpaperUrl ?? null,
          wallpaperType: data.wallpaperType ?? "none",
          wallpaperTint: data.wallpaperTint ?? 0.4,
          accentColor: data.accentColor ?? "#6366f1",
          glassBlur: data.glassBlur ?? 12,
          glassOpacity: data.glassOpacity ?? 0.08,
          sidebarPosition: data.sidebarPosition ?? "left",
          compactMode: data.compactMode ?? 0,
        });
      } catch {
        // silently ignore — use defaults
      } finally {
        if (!cancelled) setPrefsLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const setCustomization = useCallback((prefs: Partial<CustomizationState>) => {
    setCustomizationState((prev) => {
      const next = { ...prev, ...prefs };

      // Debounced save to API
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        fetch("/api/preferences", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(next),
        }).catch(() => {/* ignore */});
      }, 400);

      return next;
    });
  }, []);

  const setTheme = (t: Theme) => setThemeState(t);
  const toggleTheme = () => setThemeState((prev) => (prev === "dark" ? "light" : "dark"));

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        toggleTheme,
        wallpaperUrl: customization.wallpaperUrl,
        wallpaperType: customization.wallpaperType,
        wallpaperTint: customization.wallpaperTint,
        accentColor: customization.accentColor,
        glassBlur: customization.glassBlur,
        glassOpacity: customization.glassOpacity,
        sidebarPosition: customization.sidebarPosition,
        compactMode: customization.compactMode,
        setCustomization,
        prefsLoaded,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
