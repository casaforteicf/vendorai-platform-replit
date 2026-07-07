import React from "react";
import { buildCompatibilityNotes } from "./productionData";
import { useProductionStudio } from "./ProductionStudioContext";
import { suppliers } from "./productionData";

export function CompatibilityPanel() {
  const { selectedSupplierId } = useProductionStudio();
  const supplier = suppliers.find((item) => item.id === selectedSupplierId) || null;
  const notes = buildCompatibilityNotes(supplier);

  return (
    <aside className="rounded-[32px] border border-slate-100 bg-white p-5 shadow-sm">
      <div className="mb-5">
        <p className="text-xs font-medium uppercase tracking-wide text-violet-600">Compatibilização</p>
        <h3 className="mt-1 text-lg font-semibold text-slate-950">{supplier?.name || "Fornecedor não selecionado"}</h3>
      </div>

      <div className="space-y-3">
        {notes.map((note) => (
          <div key={note} className="rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
            {note}
          </div>
        ))}
      </div>

      <button
        type="button"
        disabled={!supplier}
        className="mt-5 w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Gerar pacote de produção
      </button>
    </aside>
  );
}
