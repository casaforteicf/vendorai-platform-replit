import React, { createContext, useContext, useMemo, useState } from "react";

export type ProductionMode = "overview" | "local" | "manufacturer" | "hybrid" | "quotes";
export type ProductionDiscipline = "marcenaria" | "gesso" | "marmoraria" | "iluminacao" | "pintura" | "paisagismo" | "esquadrias";

export type ProductionContextValue = {
  mode: ProductionMode;
  setMode: (mode: ProductionMode) => void;
  discipline: ProductionDiscipline;
  setDiscipline: (discipline: ProductionDiscipline) => void;
  selectedSupplierId: string | null;
  setSelectedSupplierId: (id: string | null) => void;
};

const ProductionStudioContext = createContext<ProductionContextValue | null>(null);

export function ProductionStudioProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ProductionMode>("overview");
  const [discipline, setDiscipline] = useState<ProductionDiscipline>("marcenaria");
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);

  const value = useMemo(
    () => ({ mode, setMode, discipline, setDiscipline, selectedSupplierId, setSelectedSupplierId }),
    [mode, discipline, selectedSupplierId],
  );

  return <ProductionStudioContext.Provider value={value}>{children}</ProductionStudioContext.Provider>;
}

export function useProductionStudio() {
  const context = useContext(ProductionStudioContext);
  if (!context) throw new Error("useProductionStudio must be used inside ProductionStudioProvider");
  return context;
}
