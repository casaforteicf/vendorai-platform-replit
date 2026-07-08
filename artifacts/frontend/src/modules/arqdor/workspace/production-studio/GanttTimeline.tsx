import React from "react";
import { workOrders } from "./productionData";
import { formatDate } from "./productionUtils";

export function GanttTimeline() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Cronograma</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Gantt executivo</h2>

      <div className="mt-6 space-y-4">
        {workOrders.map((order) => (
          <div key={order.id} className="grid gap-3 xl:grid-cols-[220px_1fr_120px] xl:items-center">
            <div>
              <p className="text-sm font-semibold text-slate-900">{order.objectName}</p>
              <p className="text-xs text-slate-500">{formatDate(order.startDate)} → {formatDate(order.dueDate)}</p>
            </div>
            <div className="h-4 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-violet-600" style={{ width: `${order.progress}%` }} />
            </div>
            <p className="text-sm font-semibold text-slate-700">{order.progress}%</p>
          </div>
        ))}
      </div>
    </section>
  );
}
