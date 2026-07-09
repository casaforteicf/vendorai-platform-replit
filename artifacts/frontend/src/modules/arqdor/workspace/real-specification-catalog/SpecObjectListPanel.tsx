import React from "react";
import type { SpecObject } from "./specCatalogTypes";
import { money, statusClass, statusLabel } from "./specCatalogUtils";

export function SpecObjectListPanel({
  items,
  selectedObject,
  loading,
  extracting,
  hasRender,
  onSelect,
  onExtract,
}: {
  items: SpecObject[];
  selectedObject?: SpecObject | null;
  loading?: boolean;
  extracting?: boolean;
  hasRender?: boolean;
  onSelect: (item: SpecObject) => void;
  onExtract: () => void;
}) {
  return (
    <section className="rounded-[34px] border border-[var(--arq-border)] bg-[var(--arq-card)] p-5 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-accent)]">SpecObjects</p>
          <h2 className="mt-1 text-xl font-semibold text-[var(--arq-foreground)]">Objetos especificáveis persistentes</h2>
        </div>

        <button
          type="button"
          disabled={!hasRender || extracting}
          onClick={onExtract}
          className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {extracting ? "Extraindo..." : "Criar objetos do render"}
        </button>
      </div>

      {!loading && !items.length ? (
        <div className="mt-5 rounded-[28px] border border-dashed border-[var(--arq-border)] bg-[var(--arq-card-soft)] p-8 text-center">
          <p className="text-sm font-semibold text-[var(--arq-foreground)]">Nenhum objeto persistido</p>
          <p className="mt-1 text-sm text-[var(--arq-muted)]">Crie manualmente ou extraia objetos do render aprovado.</p>
        </div>
      ) : null}

      <div className="mt-5 space-y-3">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item)}
            className={[
              "w-full rounded-[26px] border p-4 text-left transition",
              selectedObject?.id === item.id
                ? "border-violet-300 bg-[var(--arq-card-soft)]"
                : "border-[var(--arq-border)] bg-[var(--arq-card)] hover:border-violet-200",
            ].join(" ")}
          >
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="text-sm font-semibold text-[var(--arq-foreground)]">{item.name}</p>
                <p className="mt-1 text-xs text-[var(--arq-muted)]">{item.region || "sem região"} • {item.quantity} {item.unit}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(item.status)}`}>
                  {statusLabel(item.status)}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-[var(--arq-foreground)]">
                  {money(item.totalValue)}
                </span>
              </div>
            </div>

            <div className="mt-3 grid gap-2 md:grid-cols-3">
              <Info label="Produto" value={item.productName || "-"} />
              <Info label="Material" value={item.materialName || "-"} />
              <Info label="Fornecedor" value={item.supplierName || item.manufacturerName || "-"} />
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[var(--arq-card-soft)] p-3">
      <p className="text-xs text-[var(--arq-muted)]">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-[var(--arq-foreground)]">{value}</p>
    </div>
  );
}
