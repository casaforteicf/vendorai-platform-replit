import React, { useState } from "react";
import type { SupplierOrder, SupplierOrderPayload, WorkOrder } from "./productionTypes";
import { dateShort, money, supplierStatusClass, supplierStatusLabel } from "./productionUtils";

export function SupplierOrdersPanel({
  projectId,
  orders,
  selectedOrder,
  saving,
  onCreate,
  onUpdate,
}: {
  projectId: string;
  orders: SupplierOrder[];
  selectedOrder?: WorkOrder | null;
  saving?: boolean;
  onCreate: (payload: SupplierOrderPayload) => Promise<unknown>;
  onUpdate: (id: string, payload: Partial<SupplierOrderPayload>) => Promise<unknown>;
}) {
  const [supplierName, setSupplierName] = useState("");
  const [item, setItem] = useState("");

  function create() {
    void onCreate({
      projectId,
      workOrderId: selectedOrder?.id || null,
      supplierName: supplierName || selectedOrder?.supplierName || "Fornecedor",
      item: item || selectedOrder?.item || selectedOrder?.title || "Item",
      quantity: selectedOrder?.quantity || 1,
      unit: selectedOrder?.unit || "un",
      estimatedValue: selectedOrder?.estimatedCost || 0,
      confirmedValue: 0,
      status: "quote-requested",
      expectedDelivery: selectedOrder?.plannedEnd || null,
    });

    setSupplierName("");
    setItem("");
  }

  return (
    <section className="rounded-[34px] border border-[var(--arq-border)] bg-[var(--arq-card)] p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-accent)]">Compras</p>
      <h2 className="mt-1 text-xl font-semibold text-[var(--arq-foreground)]">Pedidos e fornecedores</h2>

      <div className="mt-5 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
        <input
          value={supplierName}
          onChange={(event) => setSupplierName(event.target.value)}
          placeholder="Fornecedor"
          className="rounded-2xl border border-[var(--arq-border)] bg-[var(--arq-card)] px-4 py-3 text-sm outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
        />
        <input
          value={item}
          onChange={(event) => setItem(event.target.value)}
          placeholder="Item"
          className="rounded-2xl border border-[var(--arq-border)] bg-[var(--arq-card)] px-4 py-3 text-sm outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
        />
        <button
          type="button"
          disabled={saving}
          onClick={create}
          className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          Solicitar
        </button>
      </div>

      <div className="mt-5 overflow-x-auto rounded-3xl border border-[var(--arq-border)]">
        <table className="min-w-[900px] w-full text-left text-sm">
          <thead className="bg-[var(--arq-card-soft)] text-xs uppercase tracking-wide text-[var(--arq-muted)]">
            <tr>
              <th className="px-4 py-3">Fornecedor</th>
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3">Qtd.</th>
              <th className="px-4 py-3">Valor estimado</th>
              <th className="px-4 py-3">Entrega prevista</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--arq-border)]">
            {orders.map((order) => (
              <tr key={order.id}>
                <td className="px-4 py-4 font-medium text-[var(--arq-foreground)]">{order.supplierName}</td>
                <td className="px-4 py-4 text-[var(--arq-muted)]">{order.item}</td>
                <td className="px-4 py-4 text-[var(--arq-muted)]">{order.quantity} {order.unit}</td>
                <td className="px-4 py-4 text-[var(--arq-muted)]">{money(order.estimatedValue)}</td>
                <td className="px-4 py-4 text-[var(--arq-muted)]">{dateShort(order.expectedDelivery)}</td>
                <td className="px-4 py-4">
                  <select
                    value={order.status}
                    onChange={(event) => void onUpdate(order.id, { status: event.target.value as any })}
                    className={`rounded-full border-0 px-3 py-1 text-xs font-semibold outline-none ${supplierStatusClass(order.status)}`}
                  >
                    <option value="not-requested">Não solicitado</option>
                    <option value="quote-requested">Cotação solicitada</option>
                    <option value="quote-received">Cotação recebida</option>
                    <option value="approved">Aprovado</option>
                    <option value="ordered">Pedido feito</option>
                    <option value="delivered">Entregue</option>
                    <option value="delayed">Atrasado</option>
                    <option value="cancelled">Cancelado</option>
                  </select>
                </td>
              </tr>
            ))}

            {!orders.length ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-[var(--arq-muted)]">
                  Nenhum pedido de fornecedor criado.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
