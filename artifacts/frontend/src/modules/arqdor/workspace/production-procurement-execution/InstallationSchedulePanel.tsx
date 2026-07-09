import React from "react";
import type { InstallationTask, WorkOrder } from "./productionTypes";
import { dateShort, statusClass, statusLabel } from "./productionUtils";

export function InstallationSchedulePanel({
  tasks,
  workOrders,
}: {
  tasks: InstallationTask[];
  workOrders: WorkOrder[];
}) {
  const scheduledOrders = workOrders.filter((order) => ["scheduled", "installed", "completed"].includes(order.status));

  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Instalação</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Agenda de entrega, instalação e execução</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {scheduledOrders.map((order) => (
          <article key={order.id} className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{order.title}</p>
                <p className="mt-1 text-sm text-slate-500">{order.item || order.productName || "-"}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(order.status)}`}>
                {statusLabel(order.status)}
              </span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <Info label="Início" value={dateShort(order.plannedStart)} />
              <Info label="Fim" value={dateShort(order.plannedEnd)} />
            </div>
          </article>
        ))}

        {tasks.map((task) => (
          <article key={task.id} className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
            <p className="text-base font-semibold text-slate-950">{task.title}</p>
            <p className="mt-1 text-sm text-slate-500">{task.team || "Equipe"} • {task.location || "Local"}</p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <Info label="Data" value={dateShort(task.scheduledDate)} />
              <Info label="Duração" value={`${task.durationHours}h`} />
            </div>
          </article>
        ))}

        {!scheduledOrders.length && !tasks.length ? (
          <div className="rounded-[28px] border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
            Nenhum item agendado ainda.
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}
