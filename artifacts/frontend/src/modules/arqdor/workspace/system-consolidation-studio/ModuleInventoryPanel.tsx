import React from "react";
import { moduleInventory } from "./consolidationData";
import { priorityClass, statusClass, statusLabel } from "./consolidationUtils";

export function ModuleInventoryPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Inventário</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Módulos, rotas e status técnico</h2>

      <div className="mt-5 overflow-hidden rounded-3xl border border-slate-100">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Módulo</th>
              <th className="px-4 py-3">Sprint</th>
              <th className="px-4 py-3">Rota</th>
              <th className="px-4 py-3">Frontend</th>
              <th className="px-4 py-3">Backend</th>
              <th className="px-4 py-3">Dados</th>
              <th className="px-4 py-3">Risco</th>
              <th className="px-4 py-3">Resumo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {moduleInventory.map((item) => (
              <tr key={item.id}>
                <td className="px-4 py-4 font-medium text-slate-800">{item.module}</td>
                <td className="px-4 py-4 text-slate-500">{item.sprint}</td>
                <td className="px-4 py-4 font-mono text-xs text-slate-500">{item.routeKey}</td>
                <td className="px-4 py-4"><Badge value={item.frontendStatus} /></td>
                <td className="px-4 py-4"><Badge value={item.backendStatus} /></td>
                <td className="px-4 py-4"><Badge value={item.dataStatus} /></td>
                <td className="px-4 py-4">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${priorityClass(item.risk)}`}>{item.risk}</span>
                </td>
                <td className="px-4 py-4 text-slate-500">{item.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Badge({ value }: { value: any }) {
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(value)}`}>{statusLabel(value)}</span>;
}
