import React from "react";
import type { RenderGalleryItem } from "./renderGalleryTypes";
import { statusClass, statusLabel } from "./renderGalleryUtils";

export function SelectedRenderInspector({ item }: { item?: RenderGalleryItem | null }) {
  if (!item) {
    return (
      <section className="rounded-[34px] border border-[var(--arq-border)] bg-[var(--arq-card)] p-5 shadow-sm">
        <p className="text-sm text-[var(--arq-muted)]">Selecione um render para ver detalhes.</p>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-[34px] border border-[var(--arq-border)] bg-[var(--arq-card)] shadow-sm">
      <div className="aspect-[16/10] bg-slate-100">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt={item.title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-[var(--arq-muted)]">Sem imagem</div>
        )}
      </div>

      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xl font-semibold text-[var(--arq-foreground)]">{item.title}</p>
            <p className="mt-1 text-sm text-[var(--arq-muted)]">{item.kind} • {item.engine || "engine não informado"}</p>
          </div>

          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(item.status)}`}>
            {statusLabel(item.status)}
          </span>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <Info label="Render ID" value={item.id} />
          <Info label="Projeto" value={item.projectId || "-"} />
          <Info label="Ambiente" value={item.ambienteId || "-"} />
          <Info label="Parent" value={item.parentRenderId || "original"} />
        </div>

        <div className="mt-5 rounded-3xl bg-[var(--arq-card-soft)] p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-muted)]">Prompt</p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[var(--arq-foreground)]">{item.prompt || "Sem prompt registrado."}</p>
        </div>
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
