import React from "react";
import type { WorkOrder } from "./productionTypes";
import { formatDate, priorityClass, statusClass } from "./productionUtils";

type Props = {
  order: WorkOrder;
  selected?: boolean;
  onSelect: (order: WorkOrder) => void;
};

export function WorkOrderCard({ order, selected, onSelect }: Props) {
  return (
    <button type="button" onClick={() => onSelect(order)} className="text-left">
      <article className={[
        "rounded-[30px] border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
        selected ? "border-violet-300 ring-4 ring-violet-100" : "border-slate-100",
      ].join(" ")}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-slate-950">{order.code}</p>
            <p className="mt-1 text-sm text-slate-500">{order.objectName} • {order.environment}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(order.status)}`}>
            {order.status}
          </span>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-2xl bg-slate-50 p-3">
            <p className="text-xs text-slate-400">Fornecedor</p>
            <p className="mt-1 font-semibold text-slate-800">{order.supplier}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-3">
            <p className="text-xs text-slate-400">Prazo</p>
            <p className="mt-1 font-semibold text-slate-800">{formatDate(order.dueDate)}</p>
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs">
            <span className="font-medium text-slate-600">Progresso</span>
            <span className="text-slate-400">{order.progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-violet-600" style={{ width: `${order.progress}%` }} />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${priorityClass(order.priority)}`}>
            {order.priority}
          </span>
          <span className="text-sm font-semibold text-slate-700">{order.cost}</span>
        </div>
      </article>
    </button>
  );
}
