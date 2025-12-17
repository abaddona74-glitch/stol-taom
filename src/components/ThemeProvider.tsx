"use client";

import React, { useEffect, useState } from "react";
import { ThemeContext, type ThemeMode } from "@/lib/theme-context";
import { usePathname } from "next/navigation";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>("dark");
  const [mounted, setMounted] = useState(false);

  // Hydration-safe initialization
  useEffect(() => {
    // Client-side only: apply theme to <html> element
    const applyTheme = (mode: ThemeMode) => {
      const root = document.documentElement;
      if (mode === "light") {
        root.classList.remove("dark");
        root.classList.add("light");
      } else {
        root.classList.remove("light");
        root.classList.add("dark");
      }
    };

    // Check if there's a stored preference and per-page override
    const stored = localStorage.getItem("app-theme") as ThemeMode | null;
    let pageThemes: Array<{ path: string; currentTheme: ThemeMode }> | null =
      null;
    try {
      const raw = localStorage.getItem("page-themes");
      if (raw) pageThemes = JSON.parse(raw);
    } catch {
      pageThemes = null;
    }
    const pathname =
      typeof window !== "undefined" ? window.location.pathname : "/";
    const pageCfg = pageThemes
      ? pageThemes.find((p) => pathname.includes(p.path))
      : null;
    if (pageCfg) {
      setThemeState(pageCfg.currentTheme as ThemeMode);
      applyTheme(pageCfg.currentTheme as ThemeMode);
    } else if (stored) {
      setThemeState(stored);
      applyTheme(stored);
    } else {
      // Default to dark - ensure dark class is applied
      applyTheme("dark");
      setThemeState("dark");
    }

    setMounted(true);
  }, []);

  const setTheme = (newTheme: ThemeMode) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem("app-theme", newTheme);
    } catch {}
    // Apply to DOM immediately
    const root = document.documentElement;
    if (newTheme === "light") {
      root.classList.remove("dark");
      root.classList.add("light");
    } else {
      root.classList.remove("light");
      root.classList.add("dark");
    }
  };

  // transient setter: apply theme immediately but don't persist
  const setThemeTransient = (newTheme: ThemeMode) => {
    setThemeState(newTheme);
    const root = document.documentElement;
    if (newTheme === "light") {
      root.classList.remove("dark");
      root.classList.add("light");
    } else {
      root.classList.remove("light");
      root.classList.add("dark");
    }
  };

  // Hydration: ensure dark class is present on mount before rendering children
  // This prevents flash of light mode and ensures Tailwind dark: classes work
  useEffect(() => {
    // Double-check dark class is set on initial mount
    const root = document.documentElement;
    if (!root.classList.contains("dark") && !root.classList.contains("light")) {
      root.classList.add("dark");
    }
  }, [mounted]);

  // On client-side navigation, prefer per-page theme if configured.
  const pathname = usePathname();
  useEffect(() => {
    try {
      const raw = localStorage.getItem("page-themes");
      if (!raw) return;
      const pages: Array<{ path: string; currentTheme: ThemeMode }> =
        JSON.parse(raw);
      const cfg = pages.find((p) => pathname?.includes(p.path));
      if (cfg) {
        // apply transiently (do not overwrite stored app-theme)
        setThemeTransient(cfg.currentTheme as ThemeMode);
      } else {
        // no per-page override: ensure stored app-theme is applied
        const stored = localStorage.getItem("app-theme") as ThemeMode | null;
        if (stored) setThemeTransient(stored);
      }
    } catch {
      // ignore
    }
  }, [pathname]);

  // Prevent rendering until client-side hydration
  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, setThemeTransient }}>
      {children}
    </ThemeContext.Provider>
  );
}
