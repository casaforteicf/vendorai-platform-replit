import React, { createContext, useContext, useMemo, useState } from "react";

export type WorkflowStage = "design" | "documentacao" | "producao" | "orcamento" | "cliente";

export type UXAlignmentContextValue = {
  stage: WorkflowStage;
  setStage: (stage: WorkflowStage) => void;
  aiPanelOpen: boolean;
  setAiPanelOpen: (open: boolean) => void;
  selectedObjectId: string | null;
  setSelectedObjectId: (id: string | null) => void;
};

const UXAlignmentContext = createContext<UXAlignmentContextValue | null>(null);

export function UXAlignmentProvider({ children }: { children: React.ReactNode }) {
  const [stage, setStage] = useState<WorkflowStage>("design");
  const [aiPanelOpen, setAiPanelOpen] = useState(true);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>("poltrona-lisboa");

  const value = useMemo(
    () => ({ stage, setStage, aiPanelOpen, setAiPanelOpen, selectedObjectId, setSelectedObjectId }),
    [stage, aiPanelOpen, selectedObjectId],
  );

  return <UXAlignmentContext.Provider value={value}>{children}</UXAlignmentContext.Provider>;
}

export function useUXAlignment() {
  const context = useContext(UXAlignmentContext);
  if (!context) {
    throw new Error("useUXAlignment must be used inside UXAlignmentProvider");
  }
  return context;
}
