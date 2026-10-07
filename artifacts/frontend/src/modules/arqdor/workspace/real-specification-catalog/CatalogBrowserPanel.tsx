import React from "react";
import type { CatalogItem, CatalogItemType, SpecObject } from "./specCatalogTypes";
import { money } from "./specCatalogUtils";

export function CatalogBrowserPanel({
  items,
  selectedObject,
  catalogType,
  query,
  loading,
  onTypeChange,
  onQueryChange,
  onApply,
  onReload,
}: {
  items: CatalogItem[];
  selectedObject?: SpecObject | null;
  catalogType: CatalogItemType | "all";
  query: string;
  loading?: boolean;
  onTypeChange: (value: CatalogItemType | "all") => void;
  onQueryChange: (value: string) => void;
  onApply: (item: CatalogItem) => void;
  onReload: () => void;
}) {
  const requestApply = (item: CatalogItem) => {
    if (!selectedObject) return;

    const quantity = Number(selectedObject.quantity || 1);
    const currentMaterial = Number(selectedObject.materialValue || 0);
    const currentLabor = Number(selectedObject.laborValue || 0);
    const nextMaterial = Number(item.price ?? currentMaterial);
    const nextLabor = Number(item.laborPrice ?? currentLabor);
    const currentTotal = quantity * (currentMaterial + currentLabor);
    const nextTotal = quantity * (nextMaterial + nextLabor);
    const delta = nextTotal - currentTotal;

    const governed = selectedObject.status === "approved" || selectedObject.status === "sent-to-budget";
    const statusNotice = selectedObject.status === "sent-to-budget"
      ? "Este objeto já foi enviado ao orçamento. Ao confirmar, o orçamento será sincronizado com os novos valores."
      : selectedObject.status === "approved"
        ? "Este objeto está aprovado. Ao alterar o catálogo, ele voltará para especificado e precisará de nova aprovação."
        : "";

    const message = [
      `Aplicar “${item.name}” ao objeto “${selectedObject.name}”?`,
      "",
      `Valor atual: ${money(currentTotal)}`,
      `Novo valor: ${money(nextTotal)}`,
      `Diferença: ${delta >= 0 ? "+" : ""}${money(delta)}`,
      statusNotice ? `\n${statusNotice}` : "",
      governed ? "\nConfirme apenas se esta alteração foi revisada." : "",
    ].filter(Boolean).join("\n");

    if (window.confirm(message)) onApply(item);
  };

  return (
    <section className="rounded-[34px] border border-[var(--arq-border)] bg-[var(--arq-card)] p-5 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-accent)]">Catálogo real</p>
          <h2 className="mt-1 text-xl font-semibold text-[var(--arq-foreground)]">Produtos, materiais, fabricantes e fornecedores</h2>
        </div>

        <button
          type="button"
          onClick={onReload}
          className="rounded-2xl border border-[var(--arq-border)] bg-[var(--arq-card)] px-4 py-2 text-sm font-semibold text-[var(--arq-foreground)] hover:border-violet-200 hover:text-[var(--arq-accent)]"
        >
          {loading ? "Carregando..." : "Atualizar catálogo"}
        </button>
      </div>

      {selectedObject ? (
        <div className="mt-4 rounded-2xl border border-[var(--arq-border)] bg-[var(--arq-card-soft)] px-4 py-3 text-xs text-[var(--arq-muted)]">
          Aplicando em <span className="font-semibold text-[var(--arq-foreground)]">{selectedObject.name}</span>
          {selectedObject.status === "approved" ? " • aprovado: alteração exigirá nova aprovação" : ""}
          {selectedObject.status === "sent-to-budget" ? " • enviado ao orçamento: valores serão sincronizados" : ""}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800">
          Selecione primeiro um objeto do projeto. O catálogo nunca é aplicado sem um destino definido.
        </div>
      )}

      <div className="mt-5 grid gap-3 md:grid-cols-[220px_1fr]">
        <select
          value={catalogType}
          onChange={(event) => onTypeChange(event.target.value as CatalogItemType | "all")}
          className="rounded-2xl border border-[var(--arq-border)] bg-[var(--arq-card)] px-4 py-3 text-sm outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
        >
          <option value="all">Todos</option>
          <option value="product">Produtos</option>
          <option value="material">Materiais</option>
          <option value="manufacturer">Fabricantes</option>
          <option value="supplier">Fornecedores</option>
          <option value="component">Componentes</option>
          <option value="finish">Acabamentos</option>
        </select>

        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Buscar no catálogo..."
          className="rounded-2xl border border-[var(--arq-border)] bg-[var(--arq-card)] px-4 py-3 text-sm outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
        />
      </div>

      {!loading && !items.length ? (
        <div className="mt-5 rounded-[28px] border border-dashed border-[var(--arq-border)] bg-[var(--arq-card-soft)] p-8 text-center">
          <p className="text-sm font-semibold text-[var(--arq-foreground)]">Nenhum item encontrado</p>
          <p className="mt-1 text-sm text-[var(--arq-muted)]">Verifique se /arch/catalogo está retornando dados reais para o tenant.</p>
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => {
          const quantity = Number(selectedObject?.quantity || 1);
          const currentMaterial = Number(selectedObject?.materialValue || 0);
          const currentLabor = Number(selectedObject?.laborValue || 0);
          const nextMaterial = Number(item.price ?? currentMaterial);
          const nextLabor = Number(item.laborPrice ?? currentLabor);
          const nextTotal = quantity * (nextMaterial + nextLabor);
          const currentTotal = quantity * (currentMaterial + currentLabor);
          const delta = nextTotal - currentTotal;

          return (
            <article key={item.id} className="rounded-[26px] border border-[var(--arq-border)] bg-[var(--arq-card)] p-4 shadow-sm">
              <div className="flex gap-3">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-slate-100">
                  {item.imageUrl ? <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" /> : null}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[var(--arq-foreground)]">{item.name}</p>
                  <p className="mt-1 text-xs text-[var(--arq-muted)]">{item.type} • {item.category || "sem categoria"}</p>
                  <p className="mt-1 text-xs text-[var(--arq-muted)]">{item.manufacturer || item.supplier || item.material || "sem vínculo"}</p>
                  {item.code ? <p className="mt-1 text-[11px] font-medium text-[var(--arq-foreground)]">SKU / ref.: {item.code}</p> : null}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <Info label="Material" value={money(item.price)} />
                <Info label="Mão de obra" value={money(item.laborPrice)} />
              </div>
              ) : null}
              {(item.width || item.height || item.depth) ? (
                <div className="mt-2 rounded-2xl bg-[var(--arq-card-soft)] p-3 text-xs text-[var(--arq-muted)]">
                  Dimensões de referência: {[item.width, item.height, item.depth].filter((v) => v != null).join(" × ")}
                </div>
              ) : null}

              {selectedObject ? (
                <div className="mt-2 rounded-2xl bg-[var(--arq-card-soft)] p-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[var(--arq-muted)]">Impacto estimado</span>
                    <span className={`font-semibold ${delta > 0 ? "text-rose-600" : delta < 0 ? "text-emerald-600" : "text-[var(--arq-foreground)]"}`}>
                      {delta >= 0 ? "+" : ""}{money(delta)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-[var(--arq-muted)]">
                    <span>Novo total</span>
                    <span className="font-semibold text-[var(--arq-foreground)]">{money(nextTotal)}</span>
                  </div>
                </div>
              ) : null}

              <button
                type="button"
                disabled={!selectedObject}
                onClick={() => requestApply(item)}
                className="mt-4 w-full rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Revisar e aplicar
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[var(--arq-card-soft)] p-3">
      <p className="text-xs text-[var(--arq-muted)]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[var(--arq-foreground)]">{value}</p>
    </div>
  );
}
