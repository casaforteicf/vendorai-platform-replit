import React from "react";
import { logs } from "./integrationData";
import { integrationStatusClass, integrationStatusLabel, severityClass } from "./integrationUtils";

export function IntegrationLogsPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Logs</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Eventos, alertas e falhas</h2>

      <div className="mt-5 overflow-hidden rounded-3xl border border-slate-100">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Serviço</th>
              <th className="px-4 py-3">Evento</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Severidade</th>
              <th className="px-4 py-3">Detalhes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {logs.map((log) => (
              <tr key={log.id}>
                <td className="px-4 py-4 text-slate-500">{log.date}</td>
                <td className="px-4 py-4 font-medium text-slate-800">{log.service}</td>
                <td className="px-4 py-4 text-slate-500">{log.event}</td>
                <td className="px-4 py-4">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${integrationStatusClass(log.status)}`}>
                    {integrationStatusLabel(log.status)}
                  </span>
                </td>
                <td className="px-4 py-4">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${severityClass(log.severity)}`}>
                    {log.severity}
                  </span>
                </td>
                <td className="px-4 py-4 text-slate-500">{log.details}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
