import React from "react";
import { portfolioProjects } from "./executiveData";
import { currency, healthClass } from "./executiveUtils";

export function PortfolioManager() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Portfólio</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Projetos ativos</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {portfolioProjects.map((project) => (
          <article key={project.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{project.name}</p>
                <p className="mt-1 text-sm text-slate-500">{project.client}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${healthClass(project.health)}`}>{project.health}</span>
            </div>

            <div className="mt-5">
              <div className="mb-1 flex justify-between text-xs">
                <span className="font-medium text-slate-600">{project.phase}</span>
                <span className="text-slate-400">{project.progress}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-violet-600" style={{ width: `${project.progress}%` }} />
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <Info label="Budget" value={currency(project.budget)} />
              <Info label="Margem" value={`${project.margin}%`} />
            </div>

            <p className="mt-4 text-xs leading-5 text-slate-500">{project.nextAction}</p>
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
