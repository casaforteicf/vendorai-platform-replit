import React from "react";
import type { ProposalItem } from "./portalTypes";
import { approvalStatusClass, approvalStatusLabel, money } from "./portalUtils";

export function ProposalItemsApprovalTable({
  items,
}: {
  items: ProposalItem[];
}) {
  return (
    <section className="rounded-[34px] border border-[var(--arq-border)] bg-[var(--arq-card)] p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-accent)]">Aprovações</p>
      <h2 className="mt-1 text-xl font-semibold text-[var(--arq-foreground)]">Status por item da proposta</h2>

      <div className="mt-5 overflow-x-auto rounded-3xl border border-[var(--arq-border)]">
        <table className="min-w-[960px] w-full text-left text-sm">
          <thead className="bg-[var(--arq-card-soft)] text-xs uppercase tracking-wide text-[var(--arq-muted)]">
            <tr>
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3">Qtd.</th>
              <th className="px-4 py-3">Un.</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Status Cliente</th>
              <th className="px-4 py-3">Comentário</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-[var(--arq-border)]">
            {items.map((item) => (
              <tr key={item.id}>
                <td className="px-4 py-4">
                  <p className="font-medium text-[var(--arq-foreground)]">{item.item}</p>
                  <p className="mt-1 text-xs text-[var(--arq-muted)]">{item.description || "-"}</p>
                </td>
                <td className="px-4 py-4 text-[var(--arq-muted)]">{item.quantity}</td>
                <td className="px-4 py-4 text-[var(--arq-muted)]">{item.unit}</td>
                <td className="px-4 py-4 font-semibold text-[var(--arq-foreground)]">{money(item.total)}</td>
                <td className="px-4 py-4">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${approvalStatusClass(item.approvalStatus)}`}>
                    {approvalStatusLabel(item.approvalStatus)}
                  </span>
                </td>
                <td className="px-4 py-4 text-[var(--arq-muted)]">{item.clientComment || "-"}</td>
              </tr>
            ))}

            {!items.length ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-[var(--arq-muted)]">
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
