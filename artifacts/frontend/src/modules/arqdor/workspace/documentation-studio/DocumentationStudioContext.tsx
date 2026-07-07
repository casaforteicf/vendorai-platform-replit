import React, { createContext, useContext, useMemo, useState } from "react";

export type DocumentationDiscipline =
  | "geral"
  | "arquitetura"
  | "interiores"
  | "marcenaria"
  | "gesso"
  | "iluminacao"
  | "eletrica"
  | "hidraulica"
  | "paisagismo"
  | "pintura"
  | "marmoraria"
  | "esquadrias"
  | "decoracao";

export type DocumentationView = "overview" | "plantas" | "memorial" | "quantitativos" | "impressao";

export type DocumentationContextValue = {
  discipline: DocumentationDiscipline;
  setDiscipline: (discipline: DocumentationDiscipline) => void;
  view: DocumentationView;
  setView: (view: DocumentationView) => void;
  selectedItems: string[];
  toggleSelectedItem: (id: string) => void;
  clearSelection: () => void;
};

const DocumentationStudioContext = createContext<DocumentationContextValue | null>(null);

export function DocumentationStudioProvider({ children }: { children: React.ReactNode }) {
  const [discipline, setDiscipline] = useState<DocumentationDiscipline>("geral");
  const [view, setView] = useState<DocumentationView>("overview");
  const [selectedItems, setSelectedItems] = useState<string[]>([]);

  const toggleSelectedItem = (id: string) => {
    setSelectedItems((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      return [...current, id];
    });
  };

  const clearSelection = () => setSelectedItems([]);

  const value = useMemo(
    () => ({ discipline, setDiscipline, view, setView, selectedItems, toggleSelectedItem, clearSelection }),
    [discipline, view, selectedItems],
  );

  return <DocumentationStudioContext.Provider value={value}>{children}</DocumentationStudioContext.Provider>;
}

export function useDocumentationStudio() {
  const context = useContext(DocumentationStudioContext);
  if (!context) {
    throw new Error("useDocumentationStudio must be used inside DocumentationStudioProvider");
  }
  return context;
}
