import React from "react";
import { activities } from "./operationsData";
import { formatDate } from "./operationsUtils";

export function ActivityFeed() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Activity Feed</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Histórico operacional</h2>

      <div className="mt-5 space-y-4">
        {activities.map((activity, index) => (
          <div key={activity.id} className="flex gap-4">
            <div className="flex flex-col items-center">
              <span className="h-3 w-3 rounded-full bg-violet-600" />
              {index < activities.length - 1 ? <span className="mt-2 h-full min-h-[42px] w-px bg-slate-200" /> : null}
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-950">{activity.title}</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">{activity.description}</p>
              <p className="mt-1 text-xs text-slate-400">{activity.module} • {activity.actor} • {formatDate(activity.date)}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
