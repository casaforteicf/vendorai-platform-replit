import React from "react";
import { arqdorModules } from "./integrationData";
import { dataSourceLabel, moduleStatusClass } from "./integrationUtils";

export function ModuleConnectionMap() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Mapa de módulos</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Conexões e dependências</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {arqdorModules.map((module) => (
          <article key={module.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{module.name}</p>
                <p className="mt-1 text-sm text-slate-500">{module.phase}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${moduleStatusClass(module.status)}`}>{module.status}</span>
            </div>

            <div className="mt-5">
              <div className="mb-1 flex justify-between text-xs">
                <span className="font-medium text-slate-600">{dataSourceLabel(module.dataSource)}</span>
                <span className="text-slate-400">{module.completion}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-violet-600" style={{ width: `${module.completion}%` }} />
              </div>
            </div>

            <p className="mt-4 text-xs leading-5 text-slate-500">
              Depende de: {module.dependencies.length ? module.dependencies.join(", ") : "base"}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
