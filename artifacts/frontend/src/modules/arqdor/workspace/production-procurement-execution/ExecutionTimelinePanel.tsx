import React from "react";
import type { ExecutionEvent } from "./productionTypes";

export function ExecutionTimelinePanel({ events }: { events: ExecutionEvent[] }) {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Timeline</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Histórico de produção e execução</h2>

      <div className="mt-5 space-y-3">
        {events.map((event) => (
          <article key={event.id} className="rounded-[26px] border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-950">{event.message}</p>
                <p className="mt-1 text-xs text-slate-500">{event.actorType} {event.actorName ? `• ${event.actorName}` : ""}</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{event.type}</span>
            </div>
            <p className="mt-3 text-xs text-slate-400">{new Date(event.createdAt).toLocaleString("pt-BR")}</p>
          </article>
        ))}

        {!events.length ? (
          <div className="rounded-[26px] border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
            Nenhum evento registrado.
          </div>
        ) : null}
      </div>
    </section>
  );
}
