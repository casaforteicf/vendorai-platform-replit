import React, { createContext, useContext, useMemo, useState } from "react";

export type BudgetDiscipline =
  | "geral"
  | "marcenaria"
  | "gesso"
  | "marmoraria"
  | "iluminacao"
  | "eletrica"
  | "hidraulica"
  | "pintura"
  | "paisagismo"
  | "esquadrias"
  | "mao_de_obra"
  | "frete";

export type BudgetView = "dashboard" | "itens" | "resumo" | "timeline" | "proposta";

export type BudgetItem = {
  id: string;
  discipline: BudgetDiscipline;
  title: string;
  description?: string;
  unit: string;
  quantity: number;
  unitCost: number;
  marginPercent: number;
  status: "estimado" | "a_revisar" | "aprovado" | "orcado";
};

export type BudgetContextValue = {
  discipline: BudgetDiscipline;
  setDiscipline: (discipline: BudgetDiscipline) => void;
  view: BudgetView;
  setView: (view: BudgetView) => void;
  items: BudgetItem[];
  setItems: React.Dispatch<React.SetStateAction<BudgetItem[]>>;
};

const BudgetContext = createContext<BudgetContextValue | null>(null);

export function BudgetProvider({ children, initialItems = [] }: { children: React.ReactNode; initialItems?: BudgetItem[] }) {
  const [discipline, setDiscipline] = useState<BudgetDiscipline>("geral");
  const [view, setView] = useState<BudgetView>("dashboard");
  const [items, setItems] = useState<BudgetItem[]>(initialItems);

  const value = useMemo(
    () => ({ discipline, setDiscipline, view, setView, items, setItems }),
    [discipline, view, items],
  );

  return <BudgetContext.Provider value={value}>{children}</BudgetContext.Provider>;
}

export function useBudget() {
  const context = useContext(BudgetContext);
  if (!context) {
    throw new Error("useBudget must be used inside BudgetProvider");
  }
  return context;
}
