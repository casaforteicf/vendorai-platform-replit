import React from "react";
import { documents } from "./facilityData";
import { statusClass } from "./facilityUtils";

export function DocumentCenter() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Documentos</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Documentação final</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-5">
        {documents.map((document) => (
          <article key={document.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{document.name}</p>
                <p className="mt-1 text-sm text-slate-500">{document.type} • {document.version}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(document.status)}`}>{document.status}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
