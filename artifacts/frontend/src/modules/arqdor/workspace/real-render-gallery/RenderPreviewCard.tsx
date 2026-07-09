import React from "react";
import type { RenderGalleryItem } from "./renderGalleryTypes";
import { statusClass, statusLabel } from "./renderGalleryUtils";

export function RenderPreviewCard({
  item,
  selected,
  onSelect,
}: {
  item: RenderGalleryItem;
  selected?: boolean;
  onSelect: (item: RenderGalleryItem) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className={[
        "overflow-hidden rounded-[28px] border bg-white text-left shadow-sm transition",
        selected ? "border-violet-300 ring-4 ring-violet-50" : "border-slate-100 hover:border-violet-200",
      ].join(" ")}
    >
      <div className="aspect-[4/3] bg-slate-100">
        {item.imageUrl ? (
          <img src={item.thumbUrl || item.imageUrl} alt={item.title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">Sem imagem</div>
        )}
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-950">{item.title}</p>
            <p className="mt-1 text-xs text-slate-500">{new Date(item.createdAt).toLocaleString("pt-BR")}</p>
          </div>

          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(item.status)}`}>
            {statusLabel(item.status)}
          </span>
        </div>

        <p className="mt-3 line-clamp-2 text-xs leading-5 text-slate-500">
          {item.prompt || "Render salvo no histórico do projeto."}
        </p>
      </div>
    </button>
  );
}
