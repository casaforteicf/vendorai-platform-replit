import React, { createContext, useContext, useMemo, useState } from "react";

export type StudioMode = "design" | "materials" | "ai" | "versions";

export type StudioContextValue = {
  mode: StudioMode;
  setMode: (mode: StudioMode) => void;
  selectedTool: string;
  setSelectedTool: (tool: string) => void;
  isRightPanelOpen: boolean;
  setRightPanelOpen: (open: boolean) => void;
};

const StudioContext = createContext<StudioContextValue | null>(null);

export function StudioProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<StudioMode>("design");
  const [selectedTool, setSelectedTool] = useState("select");
  const [isRightPanelOpen, setRightPanelOpen] = useState(true);

  const value = useMemo(
    () => ({
      mode,
      setMode,
      selectedTool,
      setSelectedTool,
      isRightPanelOpen,
      setRightPanelOpen,
    }),
    [mode, selectedTool, isRightPanelOpen],
  );

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export function useStudio() {
  const ctx = useContext(StudioContext);
  if (!ctx) {
    throw new Error("useStudio must be used inside StudioProvider");
  }
  return ctx;
}
