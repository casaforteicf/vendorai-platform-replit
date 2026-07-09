import React from "react";
import { schemaContracts } from "./dataSyncData";
import { statusClass } from "./dataSyncUtils";

export function SchemaContractPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Schema Contracts</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Contratos de dados</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-5">
        {schemaContracts.map((schema) => (
          <article key={schema.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <p className="text-base font-semibold text-slate-950">{schema.name}</p>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(schema.status)}`}>{schema.status}</span>
            </div>
            <p className="mt-2 text-sm text-slate-500">{schema.entity} • {schema.owner}</p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <Info label="Versão" value={schema.version} />
              <Info label="Campos" value={String(schema.fields)} />
            </div>
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
      <p className="mt-1 font-semibold text-slate-800">{value}</p>
    </div>
  );
}
