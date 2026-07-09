import React from "react";
import type { QualityCheck, WorkOrder } from "./productionTypes";

export function QualityChecklistPanel({
  checks,
  workOrders,
}: {
  checks: QualityCheck[];
  workOrders: WorkOrder[];
}) {
  const qualityOrders = workOrders.filter((order) => order.type === "quality-check" || ["ready", "installed", "completed"].includes(order.status));

  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Qualidade</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Checklist final e conferência</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {qualityOrders.map((order) => (
          <article key={order.id} className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
            <p className="text-base font-semibold text-slate-950">{order.title}</p>
            <p className="mt-1 text-sm text-slate-500">{order.item || order.description || "-"}</p>

            <div className="mt-5 space-y-2">
              <Check label="Medidas conferidas" />
              <Check label="Material conforme especificação" />
              <Check label="Acabamento aprovado" />
              <Check label="Fotos finais registradas" />
              <Check label="Cliente comunicado" />
            </div>
          </article>
        ))}

        {checks.map((check) => (
          <article key={check.id} className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
            <p className="text-base font-semibold text-slate-950">{check.title}</p>
            <p className="mt-1 text-sm text-slate-500">{check.responsible || "Responsável não definido"}</p>
            <p className="mt-4 text-sm leading-6 text-slate-600">{check.notes || "-"}</p>
          </article>
        ))}

        {!qualityOrders.length && !checks.length ? (
          <div className="rounded-[28px] border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
            Nenhum item pronto para qualidade.
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Check({ label }: { label: string }) {
  return (
    <label className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
      <input type="checkbox" />
      {label}
    </label>
  );
}
