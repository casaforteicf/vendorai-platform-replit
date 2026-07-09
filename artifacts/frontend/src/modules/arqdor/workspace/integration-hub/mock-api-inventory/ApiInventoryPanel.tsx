import React from "react";
import { apiInventory } from "./mockApiInventoryData";
import { statusClass } from "./mockApiInventoryUtils";

export function ApiInventoryPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">API Inventory</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Endpoints disponíveis</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {apiInventory.map((api) => (
          <article key={api.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{api.module}</p>
                <p className="mt-1 text-sm text-slate-500">{api.method}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(api.status)}`}>{api.status}</span>
            </div>

            <p className="mt-4 rounded-2xl bg-slate-50 p-3 text-xs text-slate-500">{api.endpoint}</p>

            <div className="mt-5">
              <div className="mb-1 flex justify-between text-xs">
                <span className="font-medium text-slate-600">Cobertura</span>
                <span className="text-slate-400">{api.coverage}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-violet-600" style={{ width: `${api.coverage}%` }} />
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
