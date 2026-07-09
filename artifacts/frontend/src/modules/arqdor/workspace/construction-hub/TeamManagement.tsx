import React from "react";
import { teams } from "./constructionData";
import { statusClass } from "./constructionUtils";

export function TeamManagement() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Equipes</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Gestão de equipes e fornecedores</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {teams.map((team) => (
          <article key={team.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{team.name}</p>
                <p className="mt-1 text-sm text-slate-500">{team.role} • {team.company}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(team.status)}`}>{team.status}</span>
            </div>

            <div className="mt-5">
              <div className="mb-1 flex justify-between text-xs">
                <span className="font-medium text-slate-600">Alocação</span>
                <span className="text-slate-400">{team.allocated}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-violet-600" style={{ width: `${team.allocated}%` }} />
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
