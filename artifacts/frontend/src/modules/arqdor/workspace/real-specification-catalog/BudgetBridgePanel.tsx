import React, { useMemo } from "react";
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
  const grouped = useMemo(() => {
    const map = new Map<string, SpecObject[]>();
    for (const item of ready) {
      const key = item.supplierName?.trim() || "Fornecedor a definir";
      map.set(key, [...(map.get(key) || []), item]);
    }
    return Array.from(map.entries())
      .map(([supplier, supplierItems]) => ({
        supplier,
        items: supplierItems,
        total: supplierItems.reduce((sum, item) => sum + Number(item.totalValue || 0), 0),
      }))
      .sort((a, b) => a.supplier.localeCompare(b.supplier, "pt-BR"));
  }, [ready]);

  return (
    <section className="rounded-3xl border border-[var(--arq-border)] bg-[var(--arq-card)] p-5 shadow-sm">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-accent)]">Orçamento</p>
          <h2 className="mt-1 text-xl font-semibold text-[var(--arq-foreground)]">Por fornecedor</h2>
        </div>
        <span className="text-xs text-[var(--arq-muted)]">{ready.length} itens prontos</span>
      </div>

      <div className="mt-5 space-y-4">
        {grouped.map((group) => (
          <div key={group.supplier} className="overflow-hidden rounded-2xl border border-[var(--arq-border)]">
            <div className="flex items-center justify-between gap-3 bg-[var(--arq-card-soft)] px-4 py-3">
              <div>
                <p className="text-sm font-semibold">{group.supplier}</p>
                <p className="text-xs text-[var(--arq-muted)]">{group.items.length} item(ns)</p>
              </div>
              <p className="text-sm font-semibold">{money(group.total)}</p>
            </div>

            <div className="divide-y divide-[var(--arq-border)]">
              {group.items.map((item) => (
                <div key={item.id} className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{item.name}</p>
                    <p className="mt-0.5 text-xs text-[var(--arq-muted)]">
                      {item.quantity} {item.unit} • {item.productName || item.materialName || "produto/material a definir"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusClass(item.status)}`}>
                      {statusLabel(item.status)}
                    </span>
                    <span className="whitespace-nowrap text-sm font-semibold">{money(item.totalValue)}</span>
                    <button
                      type="button"
                      disabled={sending}
                      onClick={() => onSend(item)}
                      className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      Enviar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {!grouped.length ? (
          <div className="rounded-2xl border border-dashed border-[var(--arq-border)] bg-[var(--arq-card-soft)] p-6 text-center text-sm text-[var(--arq-muted)]">
            Nenhum item pronto para orçamento.
          </div>
        ) : null}
      </div>
    </section>
  );
}
