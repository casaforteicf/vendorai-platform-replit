import React from "react";
import { assets } from "./marketplaceData";
import { assetStatusClass } from "./marketplaceUtils";

export function AssetLibrary() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Assets</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">BIM, DWG, SketchUp, PDF e texturas</h2>

      <div className="mt-5 overflow-hidden rounded-3xl border border-slate-100">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Arquivo</th>
              <th className="px-4 py-3">Produto</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Tamanho</th>
              <th className="px-4 py-3">Versão</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {assets.map((asset) => (
              <tr key={asset.id}>
                <td className="px-4 py-4 font-medium text-slate-800">{asset.name}</td>
                <td className="px-4 py-4 text-slate-500">{asset.product}</td>
                <td className="px-4 py-4 text-slate-500">{asset.type}</td>
                <td className="px-4 py-4 text-slate-500">{asset.size}</td>
                <td className="px-4 py-4 text-slate-500">{asset.version}</td>
                <td className="px-4 py-4">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${assetStatusClass(asset.status)}`}>{asset.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
