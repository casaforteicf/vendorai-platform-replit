import React from "react";
import { bugs } from "./releaseData";
import { severityClass } from "./releaseUtils";

export function BugTriagePanel() {
  const statusClass = {
    open: "bg-rose-50 text-rose-700",
    triage: "bg-amber-50 text-amber-700",
    fixed: "bg-emerald-50 text-emerald-700",
    wontfix: "bg-slate-100 text-slate-600",
  } as const;

  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Bug Triage</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Riscos e ajustes antes do RC</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {bugs.map((bug) => (
          <article key={bug.id} className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${severityClass(bug.severity)}`}>
                {bug.severity}
              </span>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass[bug.status]}`}>
                {bug.status}
              </span>
            </div>

            <p className="mt-4 text-base font-semibold text-slate-950">{bug.title}</p>
            <p className="mt-1 text-sm text-slate-500">{bug.module}</p>
            <p className="mt-4 text-sm leading-6 text-slate-600">{bug.impact}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
