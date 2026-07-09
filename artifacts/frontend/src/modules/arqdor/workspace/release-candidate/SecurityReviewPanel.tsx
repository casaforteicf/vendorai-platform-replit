import React from "react";
import { securityItems } from "./releaseData";
import { checklistStatusClass, checklistStatusLabel, severityClass } from "./releaseUtils";

export function SecurityReviewPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Segurança</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Revisão de segurança e governança</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-5">
        {securityItems.map((item) => (
          <article key={item.id} className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${checklistStatusClass(item.status)}`}>
                {checklistStatusLabel(item.status)}
              </span>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${severityClass(item.risk)}`}>
                risco {item.risk}
              </span>
            </div>

            <p className="mt-4 text-base font-semibold text-slate-950">{item.title}</p>
            <p className="mt-3 text-sm leading-6 text-slate-600">{item.notes}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
