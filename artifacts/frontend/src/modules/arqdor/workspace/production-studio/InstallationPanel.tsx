import React from "react";
import { workOrders } from "./productionData";

export function InstallationPanel() {
  const installationOrders = workOrders.filter((order) => ["expedicao", "instalacao", "finalizado"].includes(order.status));

  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Instalação</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Agenda e aceite</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {(installationOrders.length ? installationOrders : workOrders).map((order) => (
          <article key={order.id} className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
            <p className="text-base font-semibold text-slate-950">{order.objectName}</p>
            <p className="mt-1 text-sm text-slate-500">{order.environment} • {order.supplier}</p>
            <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">
              Status: <span className="font-semibold">{order.status}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
