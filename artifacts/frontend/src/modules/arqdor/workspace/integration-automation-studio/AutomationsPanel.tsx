import React from "react";
import { automations } from "./integrationData";
import { SuccessBar } from "./SuccessBar";
import { automationStatusClass, automationStatusLabel } from "./integrationUtils";

export function AutomationsPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Automações</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Fluxos de trabalho entre módulos</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {automations.map((automation) => (
          <article key={automation.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{automation.name}</p>
                <p className="mt-1 text-sm text-slate-500">{automation.owner}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${automationStatusClass(automation.status)}`}>
                {automationStatusLabel(automation.status)}
              </span>
            </div>

            <div className="mt-5 rounded-3xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Trigger</p>
              <p className="mt-1 text-sm leading-6 text-slate-700">{automation.trigger}</p>
            </div>

            <div className="mt-4 space-y-2">
              {automation.actions.map((action) => (
                <div key={action} className="rounded-2xl bg-violet-50 px-4 py-3 text-sm font-medium text-violet-900">
                  {action}
                </div>
              ))}
            </div>

            <div className="mt-5">
              <div className="mb-2 flex justify-between text-xs font-semibold text-slate-500">
                <span>Sucesso</span>
                <span>{automation.successRate}%</span>
              </div>
              <SuccessBar value={automation.successRate} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
