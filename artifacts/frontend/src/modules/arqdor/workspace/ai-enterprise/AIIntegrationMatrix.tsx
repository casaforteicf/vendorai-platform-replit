import React from "react";
import { integrations } from "./aiEnterpriseData";
import { integrationStatusClass } from "./aiEnterpriseUtils";

export function AIIntegrationMatrix() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Integrações</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">IA transversal entre módulos</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {integrations.map((integration) => (
          <article key={integration.id} className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{integration.name}</p>
                <p className="mt-1 text-sm text-slate-500">{integration.description}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${integrationStatusClass(integration.status)}`}>
                {integration.status}
              </span>
            </div>

            <div className="mt-4 rounded-3xl bg-violet-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Papel da IA</p>
              <p className="mt-1 text-sm leading-6 text-violet-900">{integration.aiRole}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
