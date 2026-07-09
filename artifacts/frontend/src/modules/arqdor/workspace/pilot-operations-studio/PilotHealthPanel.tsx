import React from "react";
import { pilotAccounts } from "./pilotData";
import { ProgressBar } from "./ProgressBar";
import { healthClass } from "./pilotUtils";

export function PilotHealthPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Health score</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Saúde dos pilotos</h2>

      <div className="mt-5 space-y-3">
        {pilotAccounts.map((account) => (
          <article key={account.id} className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-[260px]">
                <p className="text-base font-semibold text-slate-950">{account.name}</p>
                <p className="mt-1 text-sm text-slate-500">{account.segment} • {account.owner}</p>
              </div>

              <div className="flex-1">
                <div className="mb-2 flex justify-between text-xs font-semibold text-slate-500">
                  <span>Progresso</span>
                  <span>{account.progress}%</span>
                </div>
                <ProgressBar value={account.progress} />
              </div>

              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${healthClass(account.health)}`}>
                {account.health}
              </span>
            </div>

            <p className="mt-4 text-sm leading-6 text-slate-600">{account.nextStep}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
