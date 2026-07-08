import React from "react";
import { aiReceivingAlerts } from "./receivingData";

export function AIReceivingPanel() {
  return (
    <section className="rounded-[34px] border border-violet-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">AI Receiving</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Alertas de recebimento</h2>

      <div className="mt-5 space-y-3">
        {aiReceivingAlerts.map((alert) => (
          <div key={alert.title} className="rounded-3xl bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold text-slate-900">{alert.title}</p>
              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-violet-700">{alert.impact}</span>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">{alert.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
