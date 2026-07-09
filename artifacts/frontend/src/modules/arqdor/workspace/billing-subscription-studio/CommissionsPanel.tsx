import React from "react";
import { commissions } from "./billingData";
import { billingStatusClass, billingStatusLabel } from "./billingUtils";

export function CommissionsPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Comissões</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Parceiros, representantes e marketplace</h2>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        {commissions.map((commission) => (
          <article key={commission.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{commission.partner}</p>
                <p className="mt-1 text-sm text-slate-500">{commission.source}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${billingStatusClass(commission.status)}`}>
                {billingStatusLabel(commission.status)}
              </span>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-3">
              <Info label="Base" value={commission.base} />
              <Info label="Taxa" value={commission.rate} />
              <Info label="Comissão" value={commission.amount} />
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
