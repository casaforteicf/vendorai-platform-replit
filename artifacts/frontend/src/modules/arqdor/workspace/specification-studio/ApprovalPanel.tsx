import React from "react";
import type { SpecObject } from "./specificationTypes";
import { statusLabel } from "./specificationUtils";

export function ApprovalPanel({ selectedObject }: { selectedObject: SpecObject }) {
  const checks = ["Produto validado", "Material aprovado", "Fornecedor confirmado", "Prazo aceito", "Custo aprovado", "Cliente ciente"];

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_390px]">
      <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Aprovação</p>
        <h2 className="mt-1 text-xl font-semibold text-slate-950">{selectedObject.name}</h2>
        <p className="mt-1 text-sm text-slate-500">Status atual: {statusLabel(selectedObject.status)}</p>

        <div className="mt-5 space-y-2">
          {checks.map((check) => (
            <label key={check} className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300" />
              {check}
            </label>
          ))}
        </div>
      </section>

      <aside className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-slate-950">Saídas</p>
        <div className="mt-5 space-y-3">
          {["Enviar ao cliente", "Gerar PDF", "Anexar à proposta", "Gerar OP"].map((action) => (
            <button key={action} type="button" className="w-full rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-violet-50 hover:text-violet-700">
              {action}
            </button>
          ))}
        </div>
      </aside>
    </div>
  );
}
