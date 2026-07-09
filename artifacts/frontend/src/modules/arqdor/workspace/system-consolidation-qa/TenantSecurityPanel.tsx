import React from "react";
import type { TenantSecurityCheck } from "./consolidationTypes";
import { gateClass, severityClass } from "./consolidationUtils";

export function TenantSecurityPanel({ checks }: { checks: TenantSecurityCheck[] }) {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Segurança</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Tenant, RLS e rotas públicas</h2>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {checks.map((check) => (
          <article key={check.id} className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{check.label}</p>
                <p className="mt-1 text-sm leading-6 text-slate-500">{check.description}</p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${gateClass(check.status)}`}>
                  {check.status}
                </span>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${severityClass(check.risk)}`}>
                  {check.risk}
                </span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
