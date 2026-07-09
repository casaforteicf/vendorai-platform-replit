import React from "react";
import { assets } from "./facilityData";
import { formatDate, statusClass } from "./facilityUtils";

export function AssetInventory() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Inventário</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Ativos entregues</h2>

      <div className="mt-5 overflow-hidden rounded-3xl border border-slate-100">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Ativo</th>
              <th className="px-4 py-3">Categoria</th>
              <th className="px-4 py-3">Local</th>
              <th className="px-4 py-3">Fornecedor</th>
              <th className="px-4 py-3">Instalação</th>
              <th className="px-4 py-3">Próx. manutenção</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {assets.map((asset) => (
              <tr key={asset.id}>
                <td className="px-4 py-4 font-medium text-slate-800">{asset.name}</td>
                <td className="px-4 py-4 text-slate-500">{asset.category}</td>
                <td className="px-4 py-4 text-slate-500">{asset.location}</td>
                <td className="px-4 py-4 text-slate-500">{asset.supplier}</td>
                <td className="px-4 py-4 text-slate-500">{formatDate(asset.installDate)}</td>
                <td className="px-4 py-4 text-slate-500">{formatDate(asset.nextMaintenance)}</td>
                <td className="px-4 py-4"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(asset.status)}`}>{asset.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
