import React from "react";
import { productionStatuses, workOrders } from "./productionData";

export function ProductionPipeline() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Pipeline</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Fluxo de produção</h2>

      <div className="mt-6 grid gap-4 xl:grid-cols-9">
        {productionStatuses.map((status) => {
          const count = workOrders.filter((order) => order.status === status.id).length;

          return (
            <div key={status.id} className="rounded-[24px] border border-slate-100 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">{status.label}</p>
              <p className="mt-1 text-xs text-slate-500">{count} OP(s)</p>
              <div className="mt-4 space-y-2">
                {workOrders.filter((order) => order.status === status.id).map((order) => (
                  <div key={order.id} className="rounded-2xl bg-white p-3 text-xs font-semibold text-slate-700 shadow-sm">
                    {order.code}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
