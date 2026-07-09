import React from "react";
import type { ProductionStatus, WorkOrder } from "./productionTypes";
import { dateShort, priorityClass, statusClass, statusLabel, typeLabel } from "./productionUtils";

const columns: Array<{ status: ProductionStatus; label: string }> = [
  { status: "planned", label: "Planejado" },
  { status: "waiting-supplier", label: "Fornecedor" },
  { status: "ordered", label: "Pedido" },
  { status: "in-production", label: "Produção" },
  { status: "scheduled", label: "Agendado" },
  { status: "completed", label: "Concluído" },
];

export function WorkOrdersBoard({
  orders,
  selectedOrder,
  onSelect,
  onStatusChange,
}: {
  orders: WorkOrder[];
  selectedOrder?: WorkOrder | null;
  onSelect: (order: WorkOrder) => void;
  onStatusChange: (order: WorkOrder, status: ProductionStatus) => void;
}) {
  return (
    <section className="rounded-[34px] border border-[var(--arq-border)] bg-[var(--arq-card)] p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-accent)]">Ordens</p>
      <h2 className="mt-1 text-xl font-semibold text-[var(--arq-foreground)]">Produção, compras e execução</h2>

      <div className="mt-5 grid gap-4 xl:grid-cols-6">
        {columns.map((column) => {
          const list = orders.filter((order) => order.status === column.status);

          return (
            <div key={column.status} className="rounded-[28px] bg-[var(--arq-card-soft)] p-3">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-[var(--arq-foreground)]">{column.label}</p>
                <span className="rounded-full bg-[var(--arq-card)] px-2 py-1 text-xs font-semibold text-[var(--arq-muted)]">{list.length}</span>
              </div>

              <div className="space-y-3">
                {list.map((order) => (
                  <article
                    key={order.id}
                    className={[
                      "rounded-[24px] border bg-[var(--arq-card)] p-4 shadow-sm transition",
                      selectedOrder?.id === order.id ? "border-violet-300 ring-4 ring-violet-50" : "border-[var(--arq-border)]",
                    ].join(" ")}
                  >
                    <button type="button" onClick={() => onSelect(order)} className="w-full text-left">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-[var(--arq-foreground)]">{order.title}</p>
                          <p className="mt-1 text-xs text-[var(--arq-muted)]">{typeLabel(order.type)} • {order.quantity} {order.unit}</p>
                        </div>
                        <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${priorityClass(order.priority)}`}>
                          {order.priority}
                        </span>
                      </div>

                      <p className="mt-3 line-clamp-2 text-xs leading-5 text-[var(--arq-muted)]">{order.description || order.item || "-"}</p>
                      <p className="mt-3 text-xs text-[var(--arq-muted)]">Prazo: {dateShort(order.plannedEnd)}</p>
                    </button>

                    <select
                      value={order.status}
                      onChange={(event) => onStatusChange(order, event.target.value as ProductionStatus)}
                      className={`mt-3 w-full rounded-2xl border-0 px-3 py-2 text-xs font-semibold outline-none ${statusClass(order.status)}`}
                    >
                      <option value="planned">Planejado</option>
                      <option value="waiting-supplier">Aguardando fornecedor</option>
                      <option value="ordered">Pedido feito</option>
                      <option value="in-production">Em produção</option>
                      <option value="ready">Pronto</option>
                      <option value="scheduled">Agendado</option>
                      <option value="installed">Instalado</option>
                      <option value="completed">Concluído</option>
                      <option value="blocked">Bloqueado</option>
                      <option value="cancelled">Cancelado</option>
                    </select>
                  </article>
                ))}

                {!list.length ? (
                  <div className="rounded-[20px] border border-dashed border-[var(--arq-border)] bg-[var(--arq-card)] p-4 text-center text-xs text-[var(--arq-muted)]">
                    Sem itens
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {orders.some((order) => ["draft", "ready", "installed", "blocked", "cancelled"].includes(order.status)) ? (
        <div className="mt-5 rounded-3xl bg-[var(--arq-card-soft)] p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-muted)]">Outros status</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {orders
              .filter((order) => ["draft", "ready", "installed", "blocked", "cancelled"].includes(order.status))
              .map((order) => (
                <button
                  key={order.id}
                  type="button"
                  onClick={() => onSelect(order)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(order.status)}`}
                >
                  {order.title} • {statusLabel(order.status)}
                </button>
              ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
