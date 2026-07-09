import React from "react";
import { demoEvents } from "./revenueData";
import { revenueStatusClass, revenueStatusLabel } from "./revenueUtils";

export function DemoCalendarPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Demos</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Agenda de demonstrações comerciais</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {demoEvents.map((demo) => (
          <article key={demo.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{demo.company}</p>
                <p className="mt-1 text-sm text-slate-500">{demo.date} • {demo.owner}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${revenueStatusClass(demo.status)}`}>
                {revenueStatusLabel(demo.status)}
              </span>
            </div>

            <div className="mt-5 rounded-3xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Público</p>
              <p className="mt-1 text-sm leading-6 text-slate-700">{demo.audience}</p>
            </div>

            <div className="mt-3 rounded-3xl bg-violet-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Objetivo</p>
              <p className="mt-1 text-sm leading-6 text-violet-900">{demo.objective}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
