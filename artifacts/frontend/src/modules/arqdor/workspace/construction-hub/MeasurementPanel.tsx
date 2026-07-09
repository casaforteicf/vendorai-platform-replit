import React from "react";
import { measurements } from "./constructionData";
import { currency, statusClass } from "./constructionUtils";

export function MeasurementPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Medições</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Medição física e financeira</h2>

      <div className="mt-5 overflow-hidden rounded-3xl border border-slate-100">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3">Disciplina</th>
              <th className="px-4 py-3">Previsto</th>
              <th className="px-4 py-3">Executado</th>
              <th className="px-4 py-3">Valor</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {measurements.map((item) => (
              <tr key={item.id}>
                <td className="px-4 py-4 font-medium text-slate-800">{item.title}</td>
                <td className="px-4 py-4 text-slate-500">{item.discipline}</td>
                <td className="px-4 py-4 text-slate-500">{item.planned} {item.unit}</td>
                <td className="px-4 py-4 text-slate-500">{item.executed} {item.unit}</td>
                <td className="px-4 py-4 text-slate-500">{currency(item.value)}</td>
                <td className="px-4 py-4"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(item.status)}`}>{item.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
