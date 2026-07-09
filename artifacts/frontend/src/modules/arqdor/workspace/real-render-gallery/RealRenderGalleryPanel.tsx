import React from "react";
import { RenderPreviewCard } from "./RenderPreviewCard";
import type { RenderGalleryItem } from "./renderGalleryTypes";

export function RealRenderGalleryPanel({
  items,
  selectedRender,
  loading,
  onSelect,
  onReload,
}: {
  items: RenderGalleryItem[];
  selectedRender?: RenderGalleryItem | null;
  loading?: boolean;
  onSelect: (item: RenderGalleryItem) => void;
  onReload: () => void;
}) {
  return (
    <section className="rounded-[34px] border border-[var(--arq-border)] bg-[var(--arq-card)] p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-accent)]">Galeria real</p>
          <h2 className="mt-1 text-xl font-semibold text-[var(--arq-foreground)]">Histórico de renders do projeto</h2>
        </div>

        <button
          type="button"
          onClick={onReload}
          className="rounded-2xl border border-[var(--arq-border)] bg-[var(--arq-card)] px-4 py-2 text-sm font-semibold text-[var(--arq-foreground)] hover:border-violet-200 hover:text-[var(--arq-accent)]"
        >
          {loading ? "Carregando..." : "Atualizar"}
        </button>
      </div>

      {!loading && !items.length ? (
        <div className="mt-5 rounded-[28px] border border-dashed border-[var(--arq-border)] bg-[var(--arq-card-soft)] p-8 text-center">
          <p className="text-sm font-semibold text-[var(--arq-foreground)]">Nenhum render encontrado</p>
          <p className="mt-1 text-sm text-[var(--arq-muted)]">
            Gere um render ou confirme se /arch/renders/gallery está retornando dados para este projeto.
          </p>
        </div>
      ) : null}

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => (
          <RenderPreviewCard
            key={item.id}
            item={item}
            selected={selectedRender?.id === item.id}
            onSelect={onSelect}
          />
        ))}
      </div>
    </section>
  );
}
