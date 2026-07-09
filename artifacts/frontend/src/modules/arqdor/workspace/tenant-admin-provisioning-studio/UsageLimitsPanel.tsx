import React from "react";
import { usageLimits } from "./tenantAdminData";
import { adminStatusClass, adminStatusLabel } from "./tenantAdminUtils";

export function UsageLimitsPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Limites</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Uso por plano, tenant e recurso</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {usageLimits.map((limit) => (
          <article key={limit.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{limit.tenant}</p>
                <p className="mt-1 text-sm text-slate-500">{limit.plan}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${adminStatusClass(limit.status)}`}>
                {adminStatusLabel(limit.status)}
              </span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <Info label="Renders" value={limit.renders} />
              <Info label="Storage" value={limit.storage} />
              <Info label="Ações IA" value={limit.aiActions} />
              <Info label="Usuários" value={limit.users} />
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
      <p className="mt-1 text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}
