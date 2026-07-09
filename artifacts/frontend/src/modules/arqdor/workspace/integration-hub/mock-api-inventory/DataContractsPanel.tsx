import React from "react";
import { contracts } from "./mockApiInventoryData";
import { statusClass } from "./mockApiInventoryUtils";

export function DataContractsPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Data Contracts</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">IDs canônicos obrigatórios</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {contracts.map((contract) => (
          <article key={contract.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{contract.entity}</p>
                <p className="mt-1 text-sm text-slate-500">{contract.canonicalId}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(contract.status)}`}>{contract.status}</span>
            </div>

            <p className="mt-4 text-xs leading-5 text-slate-500">Usado por: {contract.usedBy.join(", ")}</p>
            <p className="mt-2 text-xs text-slate-400">{contract.required ? "Obrigatório" : "Opcional / futuro"}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
