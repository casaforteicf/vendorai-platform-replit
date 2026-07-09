import React from "react";
import { syncConflicts } from "./dataSyncData";
import { severityClass, statusClass } from "./dataSyncUtils";

export function ConflictResolver() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Conflict Resolver</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Conflitos de dados</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-3">
        {syncConflicts.map((conflict) => (
          <article key={conflict.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{conflict.title}</p>
                <p className="mt-1 text-sm text-slate-500">{conflict.entity}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${severityClass(conflict.severity)}`}>{conflict.severity}</span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <Info label="Fonte A" value={conflict.sourceA} />
              <Info label="Fonte B" value={conflict.sourceB} />
            </div>

            <p className="mt-4 text-sm leading-6 text-slate-600">{conflict.recommendation}</p>
            <span className={`mt-5 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusClass(conflict.status)}`}>{conflict.status}</span>
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
