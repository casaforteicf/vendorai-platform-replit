import React from "react";
import { orders } from "./marketplaceData";
import { currency, orderStatusClass } from "./marketplaceUtils";

export function MarketplaceOrders() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Pedidos marketplace</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Compras originadas no marketplace</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-3">
        {orders.map((order) => (
          <article key={order.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{order.code}</p>
                <p className="mt-1 text-sm text-slate-500">{order.product}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${orderStatusClass(order.status)}`}>{order.status}</span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <Info label="Fornecedor" value={order.supplier} />
              <Info label="Comprador" value={order.buyer} />
              <Info label="Valor" value={currency(order.value)} />
              <Info label="Data" value={order.date} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 font-semibold text-slate-800">{value}</p>
    </div>
  );
}
