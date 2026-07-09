import React from "react";
import { approvals } from "./constructionData";
import { formatDate, statusClass } from "./constructionUtils";

export function SiteApprovals() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Aprovações</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Liberações de obra</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-3">
        {approvals.map((approval) => (
          <article key={approval.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{approval.title}</p>
                <p className="mt-1 text-sm text-slate-500">{approval.type} • {approval.owner}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(approval.status)}`}>{approval.status}</span>
            </div>
            <p className="mt-4 text-xs text-slate-400">Prazo: {formatDate(approval.dueDate)}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
