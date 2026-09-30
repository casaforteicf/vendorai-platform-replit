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
  const saleTotal = budget?.saleTotal == null ? null : Number(budget.saleTotal);
  const technicalCost = Number(totals.grandTotal || 0);
  const margin = saleTotal == null ? null : saleTotal - technicalCost;
  const marginPercent = saleTotal && margin != null ? (margin / saleTotal) * 100 : null;

  const cards = [
    { label: "Itens", value: String(itemCount), description: "Itens do orçamento." },
    { label: "Custo material", value: money(totals.subtotalMaterial), description: "Custo técnico de materiais." },
    { label: "Custo mão de obra", value: money(totals.subtotalLabor), description: "Custo técnico de mão de obra." },
    { label: "Custo técnico", value: money(technicalCost), description: "Custo estimado após desconto técnico." },
    { label: "Preço de venda", value: saleTotal == null ? "Não definido" : money(saleTotal), description: "Preço comercial apresentado ao cliente." },
    { label: "Margem prevista", value: margin == null ? "—" : `${money(margin)} • ${marginPercent?.toFixed(1)}%`, description: "Preço de venda menos custo técnico." },
  ];

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
      {cards.map((card) => (
        <div key={card.label} className="rounded-[28px] border border-[var(--arq-border)] bg-[var(--arq-card)] p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-muted)]">{card.label}</p>
            {card.label === "Itens" && budget ? (
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(budget.status)}`}>
                {statusLabel(budget.status)}
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-2xl font-semibold text-[var(--arq-foreground)]">{card.value}</p>
          <p className="mt-1 text-xs leading-5 text-[var(--arq-muted)]">{card.description}</p>
        </div>
      ))}
    </section>
  );
}
