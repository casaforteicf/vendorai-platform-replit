import React from "react";
import { auditEvents } from "./tenantAdminData";
import { severityClass } from "./tenantAdminUtils";

export function AuditLogPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Auditoria</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Eventos administrativos e rastreabilidade</h2>

      <div className="mt-5 overflow-hidden rounded-3xl border border-slate-100">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Ator</th>
              <th className="px-4 py-3">Tenant</th>
              <th className="px-4 py-3">Módulo</th>
              <th className="px-4 py-3">Ação</th>
              <th className="px-4 py-3">Severidade</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {auditEvents.map((event) => (
              <tr key={event.id}>
                <td className="px-4 py-4 text-slate-500">{event.date}</td>
                <td className="px-4 py-4 font-medium text-slate-800">{event.actor}</td>
                <td className="px-4 py-4 text-slate-500">{event.tenant}</td>
                <td className="px-4 py-4 text-slate-500">{event.module}</td>
                <td className="px-4 py-4 text-slate-500">{event.action}</td>
                <td className="px-4 py-4">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${severityClass(event.severity)}`}>
                    {event.severity}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
