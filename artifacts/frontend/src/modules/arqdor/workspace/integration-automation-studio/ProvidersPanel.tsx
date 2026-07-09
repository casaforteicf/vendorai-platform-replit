import React from "react";
import { providers } from "./integrationData";
import { integrationStatusClass, integrationStatusLabel } from "./integrationUtils";

export function ProvidersPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Providers</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Provedores, credenciais e escopos</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-5">
        {providers.map((provider) => (
          <article key={provider.id} className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{provider.provider}</p>
                <p className="mt-1 text-sm text-slate-500">{provider.category}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${integrationStatusClass(provider.status)}`}>
                {integrationStatusLabel(provider.status)}
              </span>
            </div>

            <div className="mt-5 rounded-3xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Credencial</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">{provider.credentialMode}</p>
            </div>

            <p className="mt-4 text-sm leading-6 text-slate-600">{provider.scope}</p>
            <p className="mt-3 text-xs leading-5 text-violet-700">{provider.notes}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
