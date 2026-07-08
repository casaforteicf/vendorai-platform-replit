import React from "react";
import { elements } from "./bimData";
import { statusClass } from "./bimUtils";

export function ModelExplorer() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Model Explorer</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Elementos do modelo</h2>

      <div className="mt-5 overflow-hidden rounded-3xl border border-slate-100">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Elemento</th>
              <th className="px-4 py-3">Categoria</th>
              <th className="px-4 py-3">Disciplina</th>
              <th className="px-4 py-3">Nível</th>
              <th className="px-4 py-3">Material</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {elements.map((element) => (
              <tr key={element.id}>
                <td className="px-4 py-4 font-medium text-slate-800">{element.name}</td>
                <td className="px-4 py-4 text-slate-500">{element.category}</td>
                <td className="px-4 py-4 text-slate-500">{element.discipline}</td>
                <td className="px-4 py-4 text-slate-500">{element.level}</td>
                <td className="px-4 py-4 text-slate-500">{element.material}</td>
                <td className="px-4 py-4">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(element.status)}`}>{element.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
