import React from "react";
import { nonConformities } from "./constructionData";
import { severityClass, statusClass } from "./constructionUtils";

export function NonConformityPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Não conformidades</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Ocorrências e correções</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-3">
        {nonConformities.map((item) => (
          <article key={item.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{item.title}</p>
                <p className="mt-1 text-sm text-slate-500">{item.discipline} • {item.owner}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${severityClass(item.severity)}`}>{item.severity}</span>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-600">{item.recommendation}</p>
            <div className="mt-5">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(item.status)}`}>{item.status}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
