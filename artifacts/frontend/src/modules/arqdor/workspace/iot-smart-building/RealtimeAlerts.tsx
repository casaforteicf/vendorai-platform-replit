import React from "react";
import { alerts } from "./iotData";
import { severityClass, statusClass } from "./iotUtils";

export function RealtimeAlerts() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Alertas</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Alertas em tempo real</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-3">
        {alerts.map((alert) => (
          <article key={alert.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{alert.title}</p>
                <p className="mt-1 text-sm text-slate-500">{alert.location} • {alert.timestamp}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${severityClass(alert.severity)}`}>{alert.severity}</span>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-600">{alert.recommendation}</p>
            <span className={`mt-5 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusClass(alert.status)}`}>{alert.status}</span>
          </article>
        ))}
      </div>
    </section>
  );
}
