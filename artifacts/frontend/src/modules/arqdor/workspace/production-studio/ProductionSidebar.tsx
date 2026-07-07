import React from "react";
import { disciplines } from "./productionData";
import { useProductionStudio } from "./ProductionStudioContext";

export function ProductionSidebar() {
  const { discipline, setDiscipline, setSelectedSupplierId } = useProductionStudio();

  return (
    <aside className="flex h-full flex-col border-r border-slate-100 bg-white p-4">
      <div className="mb-4">
        <p className="text-xs font-medium uppercase tracking-wide text-violet-600">Produção</p>
        <h3 className="mt-1 text-lg font-semibold text-slate-950">Disciplinas</h3>
      </div>

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
        {disciplines.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setDiscipline(item.id);
              setSelectedSupplierId(null);
            }}
            className={[
              "w-full rounded-2xl px-3 py-3 text-left transition",
              discipline === item.id ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-violet-50 hover:text-violet-700",
            ].join(" ")}
          >
            <p className="text-sm font-semibold">{item.label}</p>
            <p className={["mt-1 line-clamp-2 text-xs", discipline === item.id ? "text-slate-300" : "text-slate-400"].join(" ")}>
              {item.description}
            </p>
          </button>
        ))}
      </div>
    </aside>
  );
}
