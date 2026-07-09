import React from "react";
import { pilotAccounts } from "./pilotData";
import { ProgressBar } from "./ProgressBar";
import { healthClass, pilotStatusClass, pilotStatusLabel } from "./pilotUtils";

export function PilotAccountsPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Contas piloto</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Clientes, segmentos, plano e health score</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {pilotAccounts.map((account) => (
          <article key={account.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{account.name}</p>
                <p className="mt-1 text-sm text-slate-500">{account.segment}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${pilotStatusClass(account.status)}`}>
                {pilotStatusLabel(account.status)}
              </span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${healthClass(account.health)}`}>{account.health}</span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{account.plan}</span>
            </div>

            <div className="mt-5">
              <div className="mb-2 flex justify-between text-xs font-semibold text-slate-500">
                <span>Progresso</span>
                <span>{account.progress}%</span>
              </div>
              <ProgressBar value={account.progress} />
            </div>

            <div className="mt-4 rounded-3xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Objetivo</p>
              <p className="mt-1 text-sm leading-6 text-slate-700">{account.goal}</p>
            </div>

            <div className="mt-3 rounded-3xl bg-violet-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Próximo passo</p>
              <p className="mt-1 text-sm leading-6 text-violet-900">{account.nextStep}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
