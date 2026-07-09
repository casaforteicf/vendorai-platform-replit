import React from "react";
import { healthChecks } from "./copilotData";
import { statusClass } from "./copilotUtils";

export function HealthMonitor() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Health Monitor</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Saúde dos serviços e integrações</h2>

      <div className="mt-5 overflow-hidden rounded-3xl border border-slate-100">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Serviço</th>
              <th className="px-4 py-3">Módulo</th>
              <th className="px-4 py-3">Latência</th>
              <th className="px-4 py-3">Uptime</th>
              <th className="px-4 py-3">Último check</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {healthChecks.map((check) => (
              <tr key={check.id}>
                <td className="px-4 py-4 font-medium text-slate-800">{check.service}</td>
                <td className="px-4 py-4 text-slate-500">{check.module}</td>
                <td className="px-4 py-4 text-slate-500">{check.latency}</td>
                <td className="px-4 py-4 text-slate-500">{check.uptime}</td>
                <td className="px-4 py-4 text-slate-500">{check.lastCheck}</td>
                <td className="px-4 py-4">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(check.status)}`}>{check.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
