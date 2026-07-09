import React from "react";
import { featureFlags } from "./tenantAdminData";
import { RolloutBar } from "./RolloutBar";
import { adminStatusClass, adminStatusLabel } from "./tenantAdminUtils";

export function FeatureFlagsPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Feature flags</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Liberação controlada por plano e tenant</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {featureFlags.map((flag) => (
          <article key={flag.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{flag.name}</p>
                <p className="mt-1 text-sm text-slate-500">{flag.enabledFor}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${adminStatusClass(flag.status)}`}>
                {adminStatusLabel(flag.status)}
              </span>
            </div>

            <p className="mt-4 text-sm leading-6 text-slate-600">{flag.description}</p>

            <div className="mt-5">
              <div className="mb-2 flex justify-between text-xs font-semibold text-slate-500">
                <span>Rollout</span>
                <span>{flag.rollout}%</span>
              </div>
              <RolloutBar value={flag.rollout} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
