import React from "react";
import { deliveryRoutes } from "./receivingData";
import { deliveryClass } from "./receivingUtils";

export function DeliveryTracking() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Tracking</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Rastreamento operacional</h2>

      <div className="mt-6 space-y-4">
        {deliveryRoutes.map((route, index) => (
          <div key={route.id} className="flex gap-4">
            <div className="flex flex-col items-center">
              <span className="h-3 w-3 rounded-full bg-violet-600" />
              {index < deliveryRoutes.length - 1 ? <span className="mt-2 h-full min-h-[48px] w-px bg-slate-200" /> : null}
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-950">{route.code} — {route.destination}</p>
              <p className="mt-1 text-xs text-slate-500">{route.supplier} • {route.driver}</p>
              <span className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${deliveryClass(route.status)}`}>{route.status}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
