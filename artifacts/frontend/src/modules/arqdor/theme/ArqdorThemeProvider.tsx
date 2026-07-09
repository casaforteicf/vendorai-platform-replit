import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { fetchThemePreference, saveThemePreference as saveThemePreferenceApi } from "./arqdorThemeApi";
import type {
  ArqdorAccent,
  ArqdorThemeContextValue,
  ArqdorThemeMode,
  ArqdorThemePreference,
  ResolvedArqdorTheme,
} from "./arqdorThemeTypes";
import {
  ARQDOR_THEME_STORAGE_KEY,
  DEFAULT_ARQDOR_THEME,
  getAccentVariables,
} from "./arqdorThemeTokens";

const ArqdorThemeContext = createContext<ArqdorThemeContextValue | null>(null);

function readLocalPreference(): ArqdorThemePreference {
  try {
    const raw = localStorage.getItem(ARQDOR_THEME_STORAGE_KEY);
    if (!raw) return DEFAULT_ARQDOR_THEME;
    return { ...DEFAULT_ARQDOR_THEME, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_ARQDOR_THEME;
  }
}

function writeLocalPreference(preference: ArqdorThemePreference) {
  localStorage.setItem(ARQDOR_THEME_STORAGE_KEY, JSON.stringify(preference));
}

function resolveTheme(mode: ArqdorThemeMode): ResolvedArqdorTheme {
  if (mode === "system") {
    return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
  }

  return mode;
}

function applyTheme(preference: ArqdorThemePreference, resolvedTheme: ResolvedArqdorTheme) {
  const root = document.documentElement;

  root.dataset.arqdorTheme = resolvedTheme;
  root.dataset.arqdorThemeMode = preference.mode;
  root.dataset.arqdorAccent = preference.accent;

  root.classList.toggle("arqdor-theme-dark", resolvedTheme === "dark");
  root.classList.toggle("arqdor-theme-light", resolvedTheme === "light");

  const accentVars = getAccentVariables(preference.accent);
  Object.entries(accentVars).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
}

export function ArqdorThemeProvider({
  children,
  loadRemote = true,
}: {
  children: React.ReactNode;
  loadRemote?: boolean;
}) {
  const [preference, setPreference] = useState<ArqdorThemePreference>(() => readLocalPreference());
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedArqdorTheme>(() => resolveTheme(readLocalPreference().mode));
  const [loading, setLoading] = useState(loadRemote);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((next: ArqdorThemePreference) => {
    const resolved = resolveTheme(next.mode);
    setResolvedTheme(resolved);
    applyTheme(next, resolved);
    writeLocalPreference(next);
  }, []);

  useEffect(() => {
    apply(preference);
  }, [apply, preference]);

  useEffect(() => {
    if (!loadRemote) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const remotePreference = await fetchThemePreference();
        if (cancelled) return;
        setPreference(remotePreference);
        apply(remotePreference);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Erro ao carregar tema.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [apply, loadRemote]);

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!media) return;

    const listener = () => {
      if (preference.mode === "system") {
        const resolved = resolveTheme("system");
        setResolvedTheme(resolved);
        applyTheme(preference, resolved);
      }
    };

    media.addEventListener?.("change", listener);
    return () => media.removeEventListener?.("change", listener);
  }, [preference]);

  const setMode = useCallback((mode: ArqdorThemeMode) => {
    setPreference((current) => ({ ...current, mode, updatedAt: new Date().toISOString() }));
  }, []);

  const setAccent = useCallback((accent: ArqdorAccent) => {
    setPreference((current) => ({ ...current, accent, updatedAt: new Date().toISOString() }));
  }, []);

  const setUseDarkRenderWorkspace = useCallback((enabled: boolean) => {
    setPreference((current) => ({ ...current, useDarkRenderWorkspace: enabled, updatedAt: new Date().toISOString() }));
  }, []);

  const toggleTheme = useCallback(() => {
    setPreference((current) => ({
      ...current,
      mode: resolveTheme(current.mode) === "dark" ? "light" : "dark",
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  const savePreference = useCallback(async () => {
    setSaving(true);
    setError(null);

    try {
      const saved = await saveThemePreferenceApi(preference);
      setPreference(saved);
      apply(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar tema.");
    } finally {
      setSaving(false);
    }
  }, [apply, preference]);

  const value = useMemo<ArqdorThemeContextValue>(
    () => ({
      preference,
      resolvedTheme,
      setMode,
      setAccent,
      toggleTheme,
      setUseDarkRenderWorkspace,
      savePreference,
      loading,
      saving,
      error,
    }),
    [
      error,
      loading,
      preference,
      resolvedTheme,
      savePreference,
      saving,
      setAccent,
      setMode,
      setUseDarkRenderWorkspace,
      toggleTheme,
    ],
  );

  return <ArqdorThemeContext.Provider value={value}>{children}</ArqdorThemeContext.Provider>;
}

export function useArqdorTheme() {
  const context = useContext(ArqdorThemeContext);

  if (!context) {
    throw new Error("useArqdorTheme deve ser usado dentro de ArqdorThemeProvider.");
  }

  return context;
}
