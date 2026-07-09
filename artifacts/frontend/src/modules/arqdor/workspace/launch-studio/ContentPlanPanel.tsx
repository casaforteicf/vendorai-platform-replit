import React from "react";
import { contentAssets } from "./launchData";
import { launchStatusClass, launchStatusLabel } from "./launchUtils";

export function ContentPlanPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Conteúdo</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Assets de lançamento</h2>

      <div className="mt-5 overflow-hidden rounded-3xl border border-slate-100">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Asset</th>
              <th className="px-4 py-3">Canal</th>
              <th className="px-4 py-3">Formato</th>
              <th className="px-4 py-3">Objetivo</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Dono</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {contentAssets.map((asset) => (
              <tr key={asset.id}>
                <td className="px-4 py-4 font-medium text-slate-800">{asset.title}</td>
                <td className="px-4 py-4 text-slate-500">{asset.channel}</td>
                <td className="px-4 py-4 text-slate-500">{asset.format}</td>
                <td className="px-4 py-4 text-slate-500">{asset.objective}</td>
                <td className="px-4 py-4">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${launchStatusClass(asset.status)}`}>
                    {launchStatusLabel(asset.status)}
                  </span>
                </td>
                <td className="px-4 py-4 text-slate-500">{asset.owner}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
