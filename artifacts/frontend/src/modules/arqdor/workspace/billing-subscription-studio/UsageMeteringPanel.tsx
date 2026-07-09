import React from "react";
import { usageMetrics } from "./billingData";
import { billingStatusClass, billingStatusLabel } from "./billingUtils";

export function UsageMeteringPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Uso</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Medição de uso por tenant</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {usageMetrics.map((usage) => (
          <article key={usage.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{usage.company}</p>
                <p className="mt-1 text-sm text-slate-500">{usage.limit}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${billingStatusClass(usage.status)}`}>
                {billingStatusLabel(usage.status)}
              </span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <Info label="Renders" value={String(usage.renders)} />
              <Info label="Storage" value={usage.storage} />
              <Info label="Ações IA" value={String(usage.aiActions)} />
              <Info label="Usuários" value={String(usage.users)} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 font-semibold text-slate-800">{value}</p>
    </div>
  );
}
