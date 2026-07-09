import React from "react";
import { proposals } from "./revenueData";
import { revenueStatusClass, revenueStatusLabel } from "./revenueUtils";

export function ProposalCenterPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Propostas</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Propostas, implantação e bloqueios</h2>

      <div className="mt-5 overflow-hidden rounded-3xl border border-slate-100">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Empresa</th>
              <th className="px-4 py-3">Pacote</th>
              <th className="px-4 py-3">MRR</th>
              <th className="px-4 py-3">Setup</th>
              <th className="px-4 py-3">Prazo</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Bloqueio</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {proposals.map((proposal) => (
              <tr key={proposal.id}>
                <td className="px-4 py-4 font-medium text-slate-800">{proposal.company}</td>
                <td className="px-4 py-4 text-slate-500">{proposal.packageName}</td>
                <td className="px-4 py-4 text-slate-500">{proposal.mrr}</td>
                <td className="px-4 py-4 text-slate-500">{proposal.setup}</td>
                <td className="px-4 py-4 text-slate-500">{proposal.deadline}</td>
                <td className="px-4 py-4">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${revenueStatusClass(proposal.status)}`}>
                    {revenueStatusLabel(proposal.status)}
                  </span>
                </td>
                <td className="px-4 py-4 text-slate-500">{proposal.blockers}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
