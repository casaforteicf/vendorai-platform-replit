import React from "react";
import { scheduleItems } from "./clientExperienceData";
import { formatDate } from "./clientExperienceUtils";

export function SchedulePanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Agenda</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Próximos eventos</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-3">
        {scheduleItems.map((item) => (
          <article key={item.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <p className="text-base font-semibold text-slate-950">{item.title}</p>
            <p className="mt-1 text-sm text-slate-500">{item.type}</p>
            <div className="mt-5 rounded-2xl bg-slate-50 p-3 text-sm font-semibold text-slate-700">
              {formatDate(item.date)} • {item.time}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
