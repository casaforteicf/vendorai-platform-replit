import React from "react";
import { provisioningSteps } from "./tenantAdminData";
import { adminStatusClass, adminStatusLabel } from "./tenantAdminUtils";

export function ProvisioningPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Provisioning</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Esteira de criação e ativação de tenants</h2>

      <div className="mt-5 space-y-3">
        {provisioningSteps.map((step) => (
          <article key={step.id} className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <p className="text-base font-semibold text-slate-950">{step.step}</p>
                <p className="mt-1 text-sm text-slate-500">{step.tenant} • {step.owner} • {step.eta}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${adminStatusClass(step.status)}`}>
                {adminStatusLabel(step.status)}
              </span>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-600">{step.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
