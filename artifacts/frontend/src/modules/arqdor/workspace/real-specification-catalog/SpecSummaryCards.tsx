import React from "react";
import { money } from "./specCatalogUtils";

export function SpecSummaryCards({
  count,
  specified,
  material,
  labor,
  total,
}: {
  count: number;
  specified: number;
  material: number;
  labor: number;
  total: number;
}) {
  const completion = count ? Math.round((specified / count) * 100) : 0;
  const cards = [
    { label: "Completude", value: `${completion}%`, hint: `${specified} de ${count} itens` },
    { label: "Itens", value: String(count), hint: "no projeto" },
    { label: "Materiais", value: money(material), hint: "consolidado" },
    { label: "Mão de obra", value: money(labor), hint: "consolidado" },
    { label: "Total", value: money(total), hint: "estimado" },
  ];

  return (
    <section className="grid grid-cols-2 gap-2 md:grid-cols-5">
      {cards.map((card) => (
        <div key={card.label} className="rounded-2xl border border-[var(--arq-border)] bg-[var(--arq-card)] px-4 py-3 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--arq-muted)]">{card.label}</p>
          <p className="mt-1 truncate text-lg font-semibold text-[var(--arq-foreground)]">{card.value}</p>
          <p className="mt-0.5 truncate text-[11px] text-[var(--arq-muted)]">{card.hint}</p>
        </div>
      ))}
    </section>
  );
}
