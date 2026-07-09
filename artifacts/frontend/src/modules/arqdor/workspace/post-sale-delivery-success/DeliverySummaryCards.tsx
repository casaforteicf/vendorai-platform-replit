import React from "react";
import type { DeliveryProject } from "./postSaleTypes";
import { deliveryStatusClass, deliveryStatusLabel } from "./postSaleUtils";

export function DeliverySummaryCards({
  delivery,
  stats,
}: {
  delivery?: DeliveryProject | null;
  stats: {
    checklistTotal: number;
    checklistDone: number;
    requiredTotal: number;
    requiredDone: number;
    documents: number;
    opportunities: number;
    nps: number;
    canClose: boolean;
  };
}) {
  const cards = [
    { label: "Checklist", value: `${stats.checklistDone}/${stats.checklistTotal}`, description: "Itens finais concluídos." },
    { label: "Obrigatórios", value: `${stats.requiredDone}/${stats.requiredTotal}`, description: "Necessários para encerramento." },
    { label: "Documentos", value: String(stats.documents), description: "Fotos, vídeos, garantias e manuais." },
    { label: "NPS", value: stats.nps ? stats.nps.toFixed(1) : "-", description: "Satisfação do cliente." },
    { label: "Oportunidades", value: String(stats.opportunities), description: "Novos negócios gerados." },
  ];

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => (
        <div key={card.label} className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{card.label}</p>
            {card.label === "Checklist" && delivery ? (
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${deliveryStatusClass(delivery.status)}`}>
                {deliveryStatusLabel(delivery.status)}
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
