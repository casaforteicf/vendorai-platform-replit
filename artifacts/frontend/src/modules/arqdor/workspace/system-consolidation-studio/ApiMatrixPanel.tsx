import React from "react";
import { apiEndpoints } from "./consolidationData";
import { statusClass, statusLabel } from "./consolidationUtils";

export function ApiMatrixPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">API Matrix</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Endpoints existentes e uso alvo</h2>

      <div className="mt-5 overflow-hidden rounded-3xl border border-slate-100">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Endpoint</th>
              <th className="px-4 py-3">Método</th>
              <th className="px-4 py-3">Módulo</th>
              <th className="px-4 py-3">Uso atual</th>
              <th className="px-4 py-3">Uso alvo</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {apiEndpoints.map((api) => (
              <tr key={api.id}>
                <td className="px-4 py-4 font-mono text-xs text-slate-800">{api.endpoint}</td>
                <td className="px-4 py-4 text-slate-500">{api.method}</td>
                <td className="px-4 py-4 text-slate-500">{api.module}</td>
                <td className="px-4 py-4 text-slate-500">{api.currentUsage}</td>
                <td className="px-4 py-4 text-slate-500">{api.targetUsage}</td>
                <td className="px-4 py-4">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(api.status)}`}>
                    {statusLabel(api.status)}
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
