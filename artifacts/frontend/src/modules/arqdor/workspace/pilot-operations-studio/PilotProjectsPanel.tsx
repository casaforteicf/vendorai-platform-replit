import React from "react";
import { pilotProjects } from "./pilotData";
import { ProgressBar } from "./ProgressBar";
import { pilotStatusClass, pilotStatusLabel } from "./pilotUtils";

export function PilotProjectsPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Projetos piloto</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Execução assistida por projeto</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {pilotProjects.map((project) => (
          <article key={project.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{project.projectName}</p>
                <p className="mt-1 text-sm text-slate-500">{project.account}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${pilotStatusClass(project.status)}`}>
                {pilotStatusLabel(project.status)}
              </span>
            </div>

            <div className="mt-5 rounded-3xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Etapa</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">{project.stage}</p>
              <p className="mt-1 text-xs text-slate-500">{project.module}</p>
            </div>

            <div className="mt-5">
              <div className="mb-2 flex justify-between text-xs font-semibold text-slate-500">
                <span>Progresso</span>
                <span>{project.progress}%</span>
              </div>
              <ProgressBar value={project.progress} />
            </div>

            <p className="mt-4 text-sm leading-6 text-slate-600">{project.output}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
