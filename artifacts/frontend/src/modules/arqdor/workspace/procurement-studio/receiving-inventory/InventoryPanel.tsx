import React from "react";
import { inventoryItems } from "./receivingData";
import { currency, inventoryClass } from "./receivingUtils";

export function InventoryPanel() {
  const total = inventoryItems.reduce((sum, item) => sum + item.value, 0);

  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Estoque</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-950">Itens recebidos e reservados</h2>
        </div>
        <div className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white">{currency(total)}</div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-100">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3">SKU</th>
              <th className="px-4 py-3">Qtd.</th>
              <th className="px-4 py-3">Local</th>
              <th className="px-4 py-3">Reservado</th>
              <th className="px-4 py-3">Valor</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {inventoryItems.map((item) => (
              <tr key={item.id}>
                <td className="px-4 py-4 font-medium text-slate-800">{item.name}</td>
                <td className="px-4 py-4 text-slate-500">{item.sku}</td>
                <td className="px-4 py-4 text-slate-500">{item.quantity} {item.unit}</td>
                <td className="px-4 py-4 text-slate-500">{item.location}</td>
                <td className="px-4 py-4 text-slate-500">{item.reservedFor}</td>
                <td className="px-4 py-4 text-slate-500">{currency(item.value)}</td>
                <td className="px-4 py-4">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${inventoryClass(item.status)}`}>{item.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
