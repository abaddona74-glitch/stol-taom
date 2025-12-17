"use client";

import React from "react";
import { useTheme, type ThemeMode } from "@/lib/theme-context";

type PageThemeConfig = {
  name: string;
  path: string;
  currentTheme: "dark" | "light";
};

export default function ThemeManager() {
  let themeContext;
  try {
    themeContext = useTheme();
  } catch (e) {
    console.error("ThemeManager: useTheme hook failed", e);
    return (
      <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-3 text-xs text-red-300">
        <p>
          <strong>Xato:</strong> Tema sozlamasi mavjud emas. ThemeProvider qayta
          yuklang.
        </p>
      </div>
    );
  }

  const { theme, setTheme: setThemeFromContext } = themeContext;

  const setTheme = (newTheme: ThemeMode) => {
    try {
      setThemeFromContext(newTheme);
      console.log(`[ThemeManager] Theme changed to: ${newTheme}`);
    } catch (e) {
      console.error(`[ThemeManager] Error setting theme to ${newTheme}:`, e);
    }
  };
  const defaultPages: PageThemeConfig[] = [
    { name: "Home", path: "/home", currentTheme: "dark" },
    { name: "Login", path: "/login", currentTheme: "dark" },
    { name: "Register", path: "/register", currentTheme: "dark" },
    { name: "Menu", path: "/menu", currentTheme: "light" },
    { name: "Reservation", path: "/reservation", currentTheme: "light" },
    { name: "Profile", path: "/profile", currentTheme: "dark" },
    { name: "Orders", path: "/orders", currentTheme: "light" },
  ];

  // Start as null to avoid overwriting localStorage on initial mount.
  const [pages, setPages] = React.useState<PageThemeConfig[] | null>(null);

  // Load per-page themes from localStorage once on mount
  React.useEffect(() => {
    const saved = localStorage.getItem("page-themes");
    if (saved) {
      try {
        setPages(JSON.parse(saved));
        console.log("[ThemeManager] Loaded page-themes from localStorage");
        return;
      } catch (e) {
        console.error(
          "[ThemeManager] Failed to parse page-themes from localStorage:",
          e,
        );
      }
    }
    // fallback to defaults
    setPages(defaultPages);
  }, []);

  // Save per-page themes whenever they change (but only after we've loaded them)
  React.useEffect(() => {
    if (pages === null) return; // not loaded yet
    try {
      localStorage.setItem("page-themes", JSON.stringify(pages));
      console.log("[ThemeManager] Saved page-themes to localStorage:", pages);
    } catch (e) {
      console.error(
        "[ThemeManager] Failed to save page-themes to localStorage:",
        e,
      );
    }
  }, [pages]);

  const togglePageTheme = (path: string) => {
    if (!pages) return;
    const next = pages.map((p) =>
      p.path === path
        ? { ...p, currentTheme: p.currentTheme === "dark" ? "light" : "dark" }
        : p,
    );
    setPages(next as PageThemeConfig[]);
    // If we're toggling the current page, apply the theme immediately (transiently)
    try {
      const cfg = next.find((pp) => currentPath.includes(pp.path));
      if (cfg) {
        // Prefer transient setter to avoid overwriting global stored app-theme
        if (typeof themeContext.setThemeTransient === "function") {
          themeContext.setThemeTransient(cfg.currentTheme as ThemeMode);
        } else {
          setThemeFromContext(cfg.currentTheme as ThemeMode);
        }
      }
    } catch (e) {
      // ignore
    }
  };

  const currentPath = React.useMemo(() => {
    if (typeof window === "undefined") return "";
    return window.location.pathname;
  }, []);

  const getCurrentPageConfig = () => {
    if (!pages) return undefined;
    return pages.find((p) => currentPath.includes(p.path));
  };

  return (
    <div className="space-y-4">
      {/* Current-page theme controls removed per user request */}

      <div className="bg-white/5 border border-white/10 rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-3">
          Barcha sahifalar tema sozlamalari
        </h3>
        <div className="space-y-2  overflow-y-auto">
          {!pages ? (
            <div className="p-2 text-xs text-gray-400">Yuklanmoqda...</div>
          ) : (
            pages.map((page) => (
              <div
                key={page.path}
                className="flex items-center justify-between p-2 bg-white/5 rounded"
              >
                <span className="text-sm">{page.name}</span>
                <div className="flex gap-1">
                  <button
                    onClick={() => togglePageTheme(page.path)}
                    className={`px-2 py-1 rounded text-xs font-medium transition cursor-pointer ${
                      page.currentTheme === "dark"
                        ? "bg-blue-600 text-white"
                        : "bg-yellow-500 text-black"
                    }`}
                    aria-pressed={page.currentTheme === "dark"}
                  >
                    {page.currentTheme === "dark" ? "🌙" : "☀️"}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
