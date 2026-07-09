import React from "react";
import type { ProposalEvent } from "./portalTypes";

export function ApprovalTimelinePanel({ events }: { events: ProposalEvent[] }) {
  return (
    <section className="rounded-[34px] border border-[var(--arq-border)] bg-[var(--arq-card)] p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-accent)]">Histórico</p>
      <h2 className="mt-1 text-xl font-semibold text-[var(--arq-foreground)]">Linha do tempo de aprovação</h2>

      <div className="mt-5 space-y-3">
        {events.map((event) => (
          <article key={event.id} className="rounded-[26px] border border-[var(--arq-border)] bg-[var(--arq-card)] p-4 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-[var(--arq-foreground)]">{event.message}</p>
                <p className="mt-1 text-xs text-[var(--arq-muted)]">{event.actorType} {event.actorName ? `• ${event.actorName}` : ""}</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-[var(--arq-muted)]">{event.type}</span>
            </div>
            <p className="mt-3 text-xs text-[var(--arq-muted)]">{new Date(event.createdAt).toLocaleString("pt-BR")}</p>
          </article>
        ))}

        {!events.length ? (
          <div className="rounded-[26px] border border-dashed border-[var(--arq-border)] bg-[var(--arq-card-soft)] p-6 text-center text-sm text-[var(--arq-muted)]">
            Nenhum evento registrado ainda.
          </div>
        ) : null}
      </div>
    </section>
  );
}
