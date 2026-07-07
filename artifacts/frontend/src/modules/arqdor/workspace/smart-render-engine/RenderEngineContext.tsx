import React, { createContext, useContext, useMemo, useState } from "react";

export type RenderEngineMode = "view" | "compare" | "prompt" | "versions" | "export";

export type RenderVersion = {
  id: string;
  label: string;
  imageUrl?: string;
  prompt?: string;
  createdAt?: string;
  favorite?: boolean;
  approved?: boolean;
};

export type RenderEngineContextValue = {
  mode: RenderEngineMode;
  setMode: (mode: RenderEngineMode) => void;
  versions: RenderVersion[];
  setVersions: React.Dispatch<React.SetStateAction<RenderVersion[]>>;
  activeVersionId: string | null;
  setActiveVersionId: (id: string | null) => void;
  compareVersionId: string | null;
  setCompareVersionId: (id: string | null) => void;
};

const RenderEngineContext = createContext<RenderEngineContextValue | null>(null);

export function RenderEngineProvider({ children, initialVersions = [] }: { children: React.ReactNode; initialVersions?: RenderVersion[] }) {
  const [mode, setMode] = useState<RenderEngineMode>("view");
  const [versions, setVersions] = useState<RenderVersion[]>(initialVersions);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(initialVersions[0]?.id || null);
  const [compareVersionId, setCompareVersionId] = useState<string | null>(initialVersions[1]?.id || null);

  const value = useMemo(
    () => ({
      mode,
      setMode,
      versions,
      setVersions,
      activeVersionId,
      setActiveVersionId,
      compareVersionId,
      setCompareVersionId,
    }),
    [mode, versions, activeVersionId, compareVersionId],
  );

  return <RenderEngineContext.Provider value={value}>{children}</RenderEngineContext.Provider>;
}

export function useRenderEngine() {
  const context = useContext(RenderEngineContext);
  if (!context) {
    throw new Error("useRenderEngine must be used inside RenderEngineProvider");
  }
  return context;
}
