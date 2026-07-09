import React from "react";
import { tickets } from "./facilityData";
import { formatDate, priorityClass, statusClass } from "./facilityUtils";

export function ServiceTickets() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Assistência</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Chamados técnicos</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-3">
        {tickets.map((ticket) => (
          <article key={ticket.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{ticket.title}</p>
                <p className="mt-1 text-sm text-slate-500">{ticket.asset} • {ticket.location}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${priorityClass(ticket.priority)}`}>{ticket.priority}</span>
            </div>
            <p className="mt-4 text-xs text-slate-500">Aberto em {formatDate(ticket.openedAt)} • {ticket.owner}</p>
            <span className={`mt-5 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusClass(ticket.status)}`}>{ticket.status}</span>
          </article>
        ))}
      </div>
    </section>
  );
}
