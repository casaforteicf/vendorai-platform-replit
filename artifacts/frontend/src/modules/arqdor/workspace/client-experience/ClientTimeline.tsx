import React from "react";
import { timelineItems } from "./clientExperienceData";
import { formatDate, timelineClass } from "./clientExperienceUtils";

export function ClientTimeline() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Timeline</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Jornada do cliente</h2>

      <div className="mt-5 space-y-4">
        {timelineItems.map((item, index) => (
          <div key={item.id} className="flex gap-4">
            <div className="flex flex-col items-center">
              <span className={["h-3 w-3 rounded-full", item.status === "done" ? "bg-violet-600" : "bg-slate-200"].join(" ")} />
              {index < timelineItems.length - 1 ? <span className="mt-2 h-full min-h-[52px] w-px bg-slate-200" /> : null}
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-slate-950">{item.title}</p>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${timelineClass(item.status)}`}>{item.status}</span>
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-500">{item.description}</p>
              <p className="mt-1 text-xs text-slate-400">{formatDate(item.date)} • {item.owner}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
