import React from "react";
import type { Budget, BudgetTotals } from "./budgetTypes";
import { money, statusClass, statusLabel } from "./budgetUtils";

export function BudgetSummaryCards({
  budget,
  totals,
  itemCount,
}: {
  budget?: Budget | null;
  totals: BudgetTotals;
  itemCount: number;
}) {
  const cards = [
    { label: "Itens", value: String(itemCount), description: "Itens do orçamento." },
    { label: "Material", value: money(totals.subtotalMaterial), description: "Subtotal de materiais." },
    { label: "Mão de obra", value: money(totals.subtotalLabor), description: "Subtotal de mão de obra." },
    { label: "Desconto", value: money(totals.discountTotal), description: "Desconto aplicado." },
    { label: "Total geral", value: money(totals.grandTotal), description: "Valor final." },
  ];

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => (
        <div key={card.label} className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{card.label}</p>
            {card.label === "Itens" && budget ? (
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(budget.status)}`}>
                {statusLabel(budget.status)}
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
