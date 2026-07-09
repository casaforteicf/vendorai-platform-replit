import React from "react";
import type { SpecObject } from "./specCatalogTypes";
import { money, statusClass, statusLabel } from "./specCatalogUtils";

export function BudgetBridgePanel({
  items,
  onSend,
  sending,
}: {
  items: SpecObject[];
  onSend: (item: SpecObject) => void;
  sending?: boolean;
}) {
  const ready = items.filter((item) => ["specified", "priced", "approved"].includes(item.status));

  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Orçamento</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Itens prontos para orçamento</h2>

      <div className="mt-5 space-y-3">
        {ready.map((item) => (
          <article key={item.id} className="rounded-[26px] border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-950">{item.name}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {item.quantity} {item.unit} • material {money(item.materialValue)} • mão de obra {money(item.laborValue)}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(item.status)}`}>
                  {statusLabel(item.status)}
                </span>
                <button
                  type="button"
                  disabled={sending}
                  onClick={() => onSend(item)}
                  className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                >
                  Enviar
                </button>
              </div>
            </div>
          </article>
        ))}

        {!ready.length ? (
          <div className="rounded-[26px] border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
            Nenhum item pronto. Especifique produto/material e valores antes de enviar ao orçamento.
          </div>
        ) : null}
      </div>
    </section>
  );
}
