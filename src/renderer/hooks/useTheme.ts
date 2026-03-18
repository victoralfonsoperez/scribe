import { useCallback, useEffect, useState } from "react";

export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "scribe-theme";

function getStoredPreference(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") {
    return stored;
  }
  return "system";
}

function resolveTheme(preference: ThemePreference): "light" | "dark" {
  if (preference === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return preference;
}

function applyTheme(theme: "light" | "dark") {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(getStoredPreference);
  const [resolved, setResolved] = useState<"light" | "dark">(() =>
    resolveTheme(getStoredPreference()),
  );

  // Apply theme and listen for system changes
  useEffect(() => {
    const effective = resolveTheme(preference);
    setResolved(effective);
    applyTheme(effective);

    if (preference !== "system") return;

    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      const theme = e.matches ? "dark" : "light";
      setResolved(theme);
      applyTheme(theme);
    };
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [preference]);

  const setTheme = useCallback((pref: ThemePreference) => {
    localStorage.setItem(STORAGE_KEY, pref);
    setPreference(pref);
  }, []);

  return { preference, resolved, setTheme };
}
