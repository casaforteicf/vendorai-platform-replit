import React from "react";
import type { ProposalItem } from "./portalTypes";
import { approvalStatusClass, approvalStatusLabel, money } from "./portalUtils";

export function ProposalItemsApprovalTable({
  items,
}: {
  items: ProposalItem[];
}) {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Aprovações</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Status por item da proposta</h2>

      <div className="mt-5 overflow-x-auto rounded-3xl border border-slate-100">
        <table className="min-w-[960px] w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3">Qtd.</th>
              <th className="px-4 py-3">Un.</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Status Cliente</th>
              <th className="px-4 py-3">Comentário</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {items.map((item) => (
              <tr key={item.id}>
                <td className="px-4 py-4">
                  <p className="font-medium text-slate-800">{item.item}</p>
                  <p className="mt-1 text-xs text-slate-500">{item.description || "-"}</p>
                </td>
                <td className="px-4 py-4 text-slate-500">{item.quantity}</td>
                <td className="px-4 py-4 text-slate-500">{item.unit}</td>
                <td className="px-4 py-4 font-semibold text-slate-950">{money(item.total)}</td>
                <td className="px-4 py-4">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${approvalStatusClass(item.approvalStatus)}`}>
                    {approvalStatusLabel(item.approvalStatus)}
                  </span>
                </td>
                <td className="px-4 py-4 text-slate-500">{item.clientComment || "-"}</td>
              </tr>
            ))}

            {!items.length ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-500">
                  Nenhum item encontrado. Crie a proposta a partir do orçamento.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
