import React from "react";
import type { Supplier } from "./productionData";

type Props = {
  supplier: Supplier;
  selected?: boolean;
  onSelect?: (supplier: Supplier) => void;
};

export function SupplierCard({ supplier, selected, onSelect }: Props) {
  return (
    <button
      type="button"
      onClick={() => onSelect?.(supplier)}
      className={[
        "w-full rounded-[28px] border bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
        selected ? "border-violet-300 ring-4 ring-violet-100" : "border-slate-100",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold text-slate-950">{supplier.name}</p>
          <p className="mt-1 text-sm text-slate-500">{supplier.type === "local" ? "Prestador local" : "Fabricante parceiro"}</p>
        </div>
        <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700">
          {supplier.compatibility}% compatível
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-2xl bg-slate-50 p-3">
          <p className="text-xs text-slate-400">Custo</p>
          <p className="mt-1 font-semibold text-slate-700">{supplier.estimatedCost}</p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-3">
          <p className="text-xs text-slate-400">Prazo</p>
          <p className="mt-1 font-semibold text-slate-700">{supplier.estimatedDeadline}</p>
        </div>
      </div>

      {supplier.status === "future" ? (
        <p className="mt-4 rounded-2xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
          Biblioteca oficial prevista para fase futura.
        </p>
      ) : null}
    </button>
  );
}
