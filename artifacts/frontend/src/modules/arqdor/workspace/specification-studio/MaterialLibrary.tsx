import React from "react";
import { materials } from "./specificationData";

export function MaterialLibrary() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Materiais</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Biblioteca técnica</h2>

      <div className="mt-5 overflow-hidden rounded-3xl border border-slate-100">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Material</th>
              <th className="px-4 py-3">Fabricante</th>
              <th className="px-4 py-3">Coleção</th>
              <th className="px-4 py-3">Acabamento</th>
              <th className="px-4 py-3">Preço</th>
              <th className="px-4 py-3">Prazo</th>
              <th className="px-4 py-3">Estoque</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {materials.map((material) => (
              <tr key={material.id}>
                <td className="px-4 py-4 font-medium text-slate-800">{material.name}</td>
                <td className="px-4 py-4 text-slate-500">{material.manufacturer}</td>
                <td className="px-4 py-4 text-slate-500">{material.collection}</td>
                <td className="px-4 py-4 text-slate-500">{material.finish}</td>
                <td className="px-4 py-4 text-slate-500">{material.price}</td>
                <td className="px-4 py-4 text-slate-500">{material.leadTime}</td>
                <td className="px-4 py-4 text-slate-500">{material.stock}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
