import React from "react";
import { migrations } from "./migrationData";
import { statusClass } from "./migrationUtils";

export function MigrationCenter() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Migration Center</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Plano mock → API real</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        {migrations.map((migration) => (
          <article key={migration.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{migration.title}</p>
                <p className="mt-1 text-sm text-slate-500">{migration.module} • {migration.owner}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(migration.status)}`}>{migration.status}</span>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <Info label="De" value={migration.from} />
              <Info label="Para" value={migration.to} />
            </div>

            <div className="mt-5">
              <div className="mb-1 flex justify-between text-xs">
                <span className="font-medium text-slate-600">Progresso</span>
                <span className="text-slate-400">{migration.progress}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-violet-600" style={{ width: `${migration.progress}%` }} />
              </div>
            </div>

            {migration.blocker ? (
              <div className="mt-4 rounded-2xl bg-rose-50 p-3">
                <p className="text-xs font-semibold text-rose-700">Bloqueio</p>
                <p className="mt-1 text-xs text-rose-700">{migration.blocker}</p>
              </div>
            ) : null}
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
