import React from "react";
import { deliveryRoutes } from "./receivingData";
import { deliveryClass, formatDate } from "./receivingUtils";

export function LogisticsPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Logística</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Rotas e entregas</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {deliveryRoutes.map((route) => (
          <article key={route.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{route.code}</p>
                <p className="mt-1 text-sm text-slate-500">{route.destination}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${deliveryClass(route.status)}`}>{route.status}</span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <Info label="Fornecedor" value={route.supplier} />
              <Info label="Data" value={formatDate(route.scheduledDate)} />
              <Info label="Itens" value={String(route.items)} />
              <Info label="Motorista" value={route.driver} />
            </div>

            <div className="mt-4 rounded-3xl bg-violet-50 p-4">
              <p className="text-xs leading-5 text-violet-700">{route.aiNote}</p>
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
