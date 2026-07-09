import React from "react";
import { money } from "./productionUtils";

export function ProductionSummaryCards({
  stats,
}: {
  stats: {
    total: number;
    completed: number;
    blocked: number;
    supplierPending: number;
    estimatedCost: number;
    actualCost: number;
  };
}) {
  const cards = [
    { label: "Ordens", value: String(stats.total), description: "Ordens criadas da aprovação." },
    { label: "Concluídas", value: String(stats.completed), description: "Itens instalados/concluídos." },
    { label: "Bloqueios", value: String(stats.blocked), description: "Aguardam decisão." },
    { label: "Fornecedores pendentes", value: String(stats.supplierPending), description: "Cotações/entregas pendentes." },
    { label: "Custo previsto", value: money(stats.estimatedCost), description: "Estimativa operacional." },
  ];

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => (
        <div key={card.label} className="rounded-[28px] border border-[var(--arq-border)] bg-[var(--arq-card)] p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-muted)]">{card.label}</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--arq-foreground)]">{card.value}</p>
          <p className="mt-1 text-xs leading-5 text-[var(--arq-muted)]">{card.description}</p>
        </div>
      ))}
    </section>
  );
}
