import React from "react";
import { dataEntities } from "./consolidationData";
import { statusClass, statusLabel } from "./consolidationUtils";

export function DataModelPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Dados</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Entidades, persistência e escopo por tenant</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {dataEntities.map((entity) => (
          <article key={entity.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{entity.entity}</p>
                <p className="mt-1 text-sm text-slate-500">{entity.module}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(entity.persistence)}`}>
                {statusLabel(entity.persistence)}
              </span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <Info label="Fonte" value={entity.source} />
              <Info label="Tenant" value={entity.tenantScoped ? "Sim" : "Não"} />
            </div>

            <p className="mt-4 text-sm leading-6 text-slate-600">{entity.notes}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}
