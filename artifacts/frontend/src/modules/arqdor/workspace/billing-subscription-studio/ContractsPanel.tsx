import React from "react";
import { contracts } from "./billingData";
import { billingStatusClass, billingStatusLabel } from "./billingUtils";

export function ContractsPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Contratos</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Vigência, renovação e termos comerciais</h2>

      <div className="mt-5 overflow-hidden rounded-3xl border border-slate-100">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Empresa</th>
              <th className="px-4 py-3">Plano</th>
              <th className="px-4 py-3">Início</th>
              <th className="px-4 py-3">Renovação</th>
              <th className="px-4 py-3">Termo</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Notas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {contracts.map((contract) => (
              <tr key={contract.id}>
                <td className="px-4 py-4 font-medium text-slate-800">{contract.company}</td>
                <td className="px-4 py-4 text-slate-500">{contract.plan}</td>
                <td className="px-4 py-4 text-slate-500">{contract.start}</td>
                <td className="px-4 py-4 text-slate-500">{contract.renewal}</td>
                <td className="px-4 py-4 text-slate-500">{contract.term}</td>
                <td className="px-4 py-4">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${billingStatusClass(contract.status)}`}>
                    {billingStatusLabel(contract.status)}
                  </span>
                </td>
                <td className="px-4 py-4 text-slate-500">{contract.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
