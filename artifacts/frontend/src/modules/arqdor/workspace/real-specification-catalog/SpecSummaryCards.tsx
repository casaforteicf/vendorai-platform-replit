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
  const cards = [
    { label: "Objetos", value: String(count), description: "Itens especificáveis no projeto." },
    { label: "Especificados", value: `${specified}/${count}`, description: "Itens com produto/material definido." },
    { label: "Material", value: money(material), description: "Valor material consolidado." },
    { label: "Mão de obra", value: money(labor), description: "Valor mão de obra consolidado." },
    { label: "Total", value: money(total), description: "Material + mão de obra." },
  ];

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => (
        <div key={card.label} className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{card.label}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{card.value}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">{card.description}</p>
        </div>
      ))}
    </section>
  );
}
