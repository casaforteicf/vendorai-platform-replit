import React from "react";
import { mockFiles } from "./mockApiInventoryData";
import { priorityClass, statusClass } from "./mockApiInventoryUtils";

export function MockInventoryPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Mock Inventory</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Arquivos com dados mockados</h2>

      <div className="mt-5 overflow-hidden rounded-3xl border border-slate-100">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Módulo</th>
              <th className="px-4 py-3">Arquivo</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">API substituta</th>
              <th className="px-4 py-3">Prioridade</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {mockFiles.map((item) => (
              <tr key={item.id}>
                <td className="px-4 py-4 font-medium text-slate-800">{item.module}</td>
                <td className="px-4 py-4 text-slate-500">{item.file}</td>
                <td className="px-4 py-4 text-slate-500">{item.mockType}</td>
                <td className="px-4 py-4 text-slate-500">{item.replacementApi}</td>
                <td className="px-4 py-4"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${priorityClass(item.priority)}`}>{item.priority}</span></td>
                <td className="px-4 py-4"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(item.status)}`}>{item.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
