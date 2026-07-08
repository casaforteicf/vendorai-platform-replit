import React from "react";
import { InfoCard } from "./InfoCard";
import type { WorkOrder } from "./productionTypes";
import { formatDate, priorityClass, statusClass } from "./productionUtils";

export function WorkOrderPanel({ order }: { order: WorkOrder }) {
  return (
    <aside className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Ordem de Produção</p>
      <h3 className="mt-1 text-lg font-semibold text-slate-950">{order.code}</h3>
      <p className="mt-1 text-sm text-slate-500">{order.objectName} • {order.discipline}</p>

      <div className="mt-5 flex gap-2">
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(order.status)}`}>{order.status}</span>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${priorityClass(order.priority)}`}>{order.priority}</span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <InfoCard label="Ambiente" value={order.environment} />
        <InfoCard label="Fornecedor" value={order.supplier} />
        <InfoCard label="Responsável" value={order.responsible} />
        <InfoCard label="Quantidade" value={String(order.quantity)} />
        <InfoCard label="Início" value={formatDate(order.startDate)} />
        <InfoCard label="Prazo" value={formatDate(order.dueDate)} />
      </div>

      <div className="mt-5 rounded-3xl bg-violet-50 p-4">
        <p className="text-sm font-semibold text-violet-950">Leitura IA</p>
        <p className="mt-1 text-xs leading-5 text-violet-700">{order.aiNote}</p>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        {["Fotos", "Checklist", "Documentos", "Atualizar"].map((action, index) => (
          <button
            key={action}
            type="button"
            className={[
              "rounded-2xl px-3 py-3 text-xs font-semibold transition",
              index === 3 ? "bg-slate-950 text-white hover:bg-violet-700" : "bg-slate-50 text-slate-700 hover:bg-violet-50 hover:text-violet-700",
            ].join(" ")}
          >
            {action}
          </button>
        ))}
      </div>
    </aside>
  );
}
