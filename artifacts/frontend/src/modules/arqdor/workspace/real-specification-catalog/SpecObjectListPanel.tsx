import React from "react";
import type { SpecObject } from "./specCatalogTypes";
import { money, statusClass, statusLabel } from "./specCatalogUtils";

export function SpecObjectListPanel({
  items,
  selectedObject,
  loading,
  onSelect,
}: {
  items: SpecObject[];
  selectedObject?: SpecObject | null;
  loading?: boolean;
  extracting?: boolean;
  hasRender?: boolean;
  onSelect: (item: SpecObject) => void;
  onExtract: () => void;
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="h-16 animate-pulse rounded-2xl bg-[var(--arq-card-soft)]" />
        ))}
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--arq-border)] bg-[var(--arq-card-soft)] p-8 text-center">
        <p className="text-sm font-semibold text-[var(--arq-foreground)]">Nenhum item encontrado</p>
        <p className="mt-1 text-sm text-[var(--arq-muted)]">Crie um item ou ajuste a busca.</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-[var(--arq-border)]">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelect(item)}
          className={[
            "grid w-full gap-3 px-2 py-3 text-left transition md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center",
            selectedObject?.id === item.id ? "bg-[var(--arq-card-soft)]" : "hover:bg-[var(--arq-card-soft)]",
          ].join(" ")}
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[var(--arq-foreground)]">{item.name}</p>
            <p className="mt-0.5 truncate text-xs text-[var(--arq-muted)]">
              {item.region || item.category || "Sem ambiente"} • {item.quantity} {item.unit}
            </p>
          </div>

          <div className="min-w-0">
            <p className="truncate text-xs text-[var(--arq-muted)]">Material / produto</p>
            <p className="truncate text-sm font-medium">{item.productName || item.materialName || "A definir"}</p>
          </div>

          <div className="min-w-0">
            <p className="truncate text-xs text-[var(--arq-muted)]">Fornecedor</p>
            <p className="truncate text-sm font-medium">{item.supplierName || item.manufacturerName || "A definir"}</p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 md:justify-end">
            {item.revisionImpact && item.revisionImpact !== "unchanged" ? (
              <span className={[
                "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                item.revisionImpact === "removed"
                  ? "bg-rose-50 text-rose-700"
                  : item.revisionImpact === "new"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-amber-50 text-amber-800",
              ].join(" ")}>
                {item.revisionImpact === "removed"
                  ? "Removido do projeto"
                  : item.revisionImpact === "new"
                    ? "Novo"
                    : item.revisionImpact === "quantity_changed"
                      ? "Quantidade alterada"
                      : "Geometria alterada"}
              </span>
            ) : null}
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusClass(item.status)}`}>
              {statusLabel(item.status)}
            </span>
            <span className="whitespace-nowrap text-sm font-semibold text-[var(--arq-foreground)]">{money(item.totalValue)}</span>
          </div>
        </button>
      ))}
    </div>
  );
}
