import React from "react";
import { webhooks } from "./integrationData";
import { integrationStatusClass, integrationStatusLabel } from "./integrationUtils";

export function WebhookPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Webhooks</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Endpoints, eventos e destinos</h2>

      <div className="mt-5 overflow-hidden rounded-3xl border border-slate-100">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Método</th>
              <th className="px-4 py-3">Path</th>
              <th className="px-4 py-3">Origem</th>
              <th className="px-4 py-3">Destino</th>
              <th className="px-4 py-3">Eventos</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {webhooks.map((webhook) => (
              <tr key={webhook.id}>
                <td className="px-4 py-4 font-medium text-slate-800">{webhook.name}</td>
                <td className="px-4 py-4 text-slate-500">{webhook.method}</td>
                <td className="px-4 py-4 font-mono text-xs text-slate-500">{webhook.path}</td>
                <td className="px-4 py-4 text-slate-500">{webhook.source}</td>
                <td className="px-4 py-4 text-slate-500">{webhook.target}</td>
                <td className="px-4 py-4 text-slate-500">{webhook.events}</td>
                <td className="px-4 py-4">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${integrationStatusClass(webhook.status)}`}>
                    {integrationStatusLabel(webhook.status)}
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
