import React from "react";
import { photos } from "./constructionData";
import { statusClass, formatDate } from "./constructionUtils";

export function PhotoGallery() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Fotos da obra</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Registro visual</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-3">
        {photos.map((photo) => (
          <article key={photo.id} className="overflow-hidden rounded-[30px] border border-slate-100 bg-white shadow-sm">
            <div className="flex h-44 items-center justify-center bg-slate-100 text-sm font-semibold text-slate-400">Foto</div>
            <div className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-slate-950">{photo.title}</p>
                  <p className="mt-1 text-sm text-slate-500">{photo.area} • {formatDate(photo.date)}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(photo.status)}`}>{photo.status}</span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
