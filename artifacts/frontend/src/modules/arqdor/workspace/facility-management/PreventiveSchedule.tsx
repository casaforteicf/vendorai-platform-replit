import React from "react";
import { schedules } from "./facilityData";
import { formatDate, statusClass } from "./facilityUtils";

export function PreventiveSchedule() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Agenda preventiva</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Próximas ações</h2>

      <div className="mt-5 space-y-4">
        {schedules.map((schedule, index) => (
          <div key={schedule.id} className="flex gap-4">
            <div className="flex flex-col items-center">
              <span className="h-3 w-3 rounded-full bg-violet-600" />
              {index < schedules.length - 1 ? <span className="mt-2 h-full min-h-[52px] w-px bg-slate-200" /> : null}
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-slate-950">{schedule.title}</p>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(schedule.status)}`}>{schedule.status}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{formatDate(schedule.date)} • {schedule.type} • {schedule.responsible}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
