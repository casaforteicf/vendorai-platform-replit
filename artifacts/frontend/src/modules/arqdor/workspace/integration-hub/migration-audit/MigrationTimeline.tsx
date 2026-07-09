import React from "react";
import { timelineEvents } from "./migrationData";
import { statusClass } from "./migrationUtils";

export function MigrationTimeline() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Migration Timeline</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Sequência de implantação</h2>

      <div className="mt-5 space-y-4">
        {timelineEvents.map((event, index) => (
          <div key={event.id} className="flex gap-4">
            <div className="flex flex-col items-center">
              <span className={["flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold", event.status === "completed" ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-500"].join(" ")}>
                {index + 1}
              </span>
              {index < timelineEvents.length - 1 ? <span className="mt-2 h-full min-h-[52px] w-px bg-slate-200" /> : null}
            </div>
            <div className="flex-1 rounded-[26px] border border-slate-100 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">{event.date} — {event.title}</p>
                  <p className="mt-1 text-xs text-slate-500">{event.description}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(event.status)}`}>{event.status}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
