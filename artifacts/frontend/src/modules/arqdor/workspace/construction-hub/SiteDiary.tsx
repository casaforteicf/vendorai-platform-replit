import React from "react";
import { diaryEntries } from "./constructionData";
import { formatDate } from "./constructionUtils";

export function SiteDiary() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Diário de obra</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Registros diários</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        {diaryEntries.map((entry) => (
          <article key={entry.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{formatDate(entry.date)}</p>
                <p className="mt-1 text-sm text-slate-500">{entry.team} • {entry.weather}</p>
              </div>
            </div>

            <div className="mt-5">
              <p className="text-sm font-semibold text-slate-900">Atividades</p>
              <ul className="mt-2 space-y-1 text-sm text-slate-600">
                {entry.activities.map((activity) => <li key={activity}>• {activity}</li>)}
              </ul>
            </div>

            {entry.blockers.length ? (
              <div className="mt-5 rounded-3xl bg-rose-50 p-4">
                <p className="text-sm font-semibold text-rose-700">Bloqueios</p>
                <ul className="mt-2 space-y-1 text-xs text-rose-700">
                  {entry.blockers.map((blocker) => <li key={blocker}>• {blocker}</li>)}
                </ul>
              </div>
            ) : null}

            <p className="mt-4 text-sm leading-6 text-slate-500">{entry.notes}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
