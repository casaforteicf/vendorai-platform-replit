import React from "react";
import { executionLogs } from "./automationAuditData";
import { executionClass } from "./automationAuditUtils";

export function ExecutionLogs() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Execution Logs</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Execuções de automações</h2>

      <div className="mt-5 overflow-hidden rounded-3xl border border-slate-100">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Automação</th>
              <th className="px-4 py-3">Módulo</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Início</th>
              <th className="px-4 py-3">Duração</th>
              <th className="px-4 py-3">Saída</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {executionLogs.map((log) => (
              <tr key={log.id}>
                <td className="px-4 py-4 font-medium text-slate-800">{log.automation}</td>
                <td className="px-4 py-4 text-slate-500">{log.module}</td>
                <td className="px-4 py-4"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${executionClass(log.status)}`}>{log.status}</span></td>
                <td className="px-4 py-4 text-slate-500">{log.startedAt}</td>
                <td className="px-4 py-4 text-slate-500">{log.duration}</td>
                <td className="px-4 py-4 text-slate-500">{log.output}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
