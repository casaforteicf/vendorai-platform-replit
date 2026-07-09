import React from "react";
import { testCases } from "./consolidationData";
import { statusClass, statusLabel } from "./consolidationUtils";

export function TestingPanel() {
  const typeClass = {
    unit: "bg-slate-100 text-slate-600",
    integration: "bg-blue-50 text-blue-700",
    e2e: "bg-violet-50 text-violet-700",
    manual: "bg-amber-50 text-amber-700",
  } as const;

  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">QA</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Casos de teste para consolidação</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {testCases.map((test) => (
          <article key={test.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${typeClass[test.type]}`}>
                {test.type}
              </span>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(test.status)}`}>
                {statusLabel(test.status)}
              </span>
            </div>

            <p className="mt-4 text-base font-semibold text-slate-950">{test.scenario}</p>
            <p className="mt-1 text-sm text-slate-500">{test.module}</p>

            <div className="mt-4 rounded-3xl bg-violet-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Resultado esperado</p>
              <p className="mt-1 text-sm leading-6 text-violet-900">{test.expected}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
