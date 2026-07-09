import React from "react";
import type { RenderGalleryItem } from "./renderGalleryTypes";
import { statusClass, statusLabel } from "./renderGalleryUtils";

export function RenderVersionTimeline({
  items,
  selectedRender,
  onSelect,
}: {
  items: RenderGalleryItem[];
  selectedRender?: RenderGalleryItem | null;
  onSelect: (item: RenderGalleryItem) => void;
}) {
  if (!items.length) {
    return (
      <div className="rounded-[28px] border border-dashed border-slate-200 bg-white p-6 text-sm text-slate-500">
        Nenhuma versão encontrada.
      </div>
    );
  }

  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Versionamento</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Histórico original → melhorias → materiais</h2>

      <div className="mt-5 space-y-3">
        {items.map((item, index) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item)}
            className={[
              "flex w-full items-center gap-4 rounded-[24px] border p-4 text-left transition",
              selectedRender?.id === item.id
                ? "border-violet-300 bg-violet-50"
                : "border-slate-100 bg-slate-50 hover:bg-white",
            ].join(" ")}
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-950 text-sm font-semibold text-white">
              {index + 1}
            </div>

            <div className="h-16 w-20 shrink-0 overflow-hidden rounded-2xl bg-slate-200">
              {item.imageUrl ? <img src={item.thumbUrl || item.imageUrl} alt={item.title} className="h-full w-full object-cover" /> : null}
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-950">{item.title}</p>
              <p className="mt-1 text-xs text-slate-500">{item.kind} • {new Date(item.createdAt).toLocaleString("pt-BR")}</p>
              <p className="mt-1 line-clamp-1 text-xs text-slate-500">{item.prompt || "Sem prompt registrado."}</p>
            </div>

            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(item.status)}`}>
              {statusLabel(item.status)}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
