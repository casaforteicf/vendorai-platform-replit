import React, { useMemo } from "react";
import { CompatibilityPanel } from "./CompatibilityPanel";
import { getSuppliersByDiscipline } from "./productionData";
import { SupplierCard } from "./SupplierCard";
import { useProductionStudio } from "./ProductionStudioContext";
import { QuoteRequestPanel } from "./QuoteRequestPanel";

export function ProductionCanvas() {
  const { discipline, mode, selectedSupplierId, setSelectedSupplierId } = useProductionStudio();
  const suppliers = useMemo(() => getSuppliersByDiscipline(discipline), [discipline]);

  if (mode === "quotes") {
    return <QuoteRequestPanel />;
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <div className="rounded-[32px] border border-slate-100 bg-white p-5 shadow-sm">
        <div className="mb-5">
          <p className="text-xs font-medium uppercase tracking-wide text-violet-600">Fornecedores</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-950">Escolha o modo de produção</h3>
          <p className="mt-1 text-sm text-slate-500">Local, fabricante parceiro ou híbrido por disciplina.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {suppliers.length ? (
            suppliers.map((supplier) => (
              <SupplierCard
                key={supplier.id}
                supplier={supplier}
                selected={selectedSupplierId === supplier.id}
                onSelect={(item) => setSelectedSupplierId(item.id)}
              />
            ))
          ) : (
            <div className="rounded-[28px] border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500 md:col-span-2">
              Nenhum fornecedor cadastrado para esta disciplina ainda.
            </div>
          )}
        </div>
      </div>

      <CompatibilityPanel />
    </div>
  );
}
