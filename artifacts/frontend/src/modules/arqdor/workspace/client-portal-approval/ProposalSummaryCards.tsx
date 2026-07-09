import React from "react";
import type { Proposal } from "./portalTypes";
import { money, proposalStatusClass, proposalStatusLabel } from "./portalUtils";

export function ProposalSummaryCards({
  proposal,
  stats,
}: {
  proposal?: Proposal | null;
  stats: { total: number; approved: number; rejected: number; commented: number; pending: number };
}) {
  const cards = [
    { label: "Itens", value: String(stats.total), description: "Itens enviados ao cliente." },
    { label: "Aprovados", value: String(stats.approved), description: "Itens aprovados." },
    { label: "Pendentes", value: String(stats.pending), description: "Itens aguardando decisão." },
    { label: "Comentários", value: String(stats.commented), description: "Itens comentados." },
    { label: "Total proposta", value: money(proposal?.grandTotal), description: "Valor final para cliente." },
  ];

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => (
        <div key={card.label} className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{card.label}</p>
            {card.label === "Itens" && proposal ? (
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${proposalStatusClass(proposal.status)}`}>
                {proposalStatusLabel(proposal.status)}
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{card.value}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">{card.description}</p>
        </div>
      ))}
    </section>
  );
}
