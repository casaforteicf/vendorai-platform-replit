import React from "react";
import { manufacturers, orders, products } from "./marketplaceData";
import { currency } from "./marketplaceUtils";
import { MetricCard } from "./MetricCard";

export function MarketplaceAnalytics() {
  const total = orders.reduce((sum, order) => sum + order.value, 0);

  return (
    <div className="space-y-5">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Produtos" value={String(products.length)} description="Produtos publicados." />
        <MetricCard label="Fabricantes" value={String(manufacturers.length)} description="Marcas cadastradas." />
        <MetricCard label="Pedidos" value={String(orders.length)} description="Pedidos marketplace." />
        <MetricCard label="GMV" value={currency(total)} description="Volume transacionado." />
      </section>

      <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Performance</p>
        <h2 className="mt-1 text-xl font-semibold text-slate-950">Categorias mais fortes</h2>

        <div className="mt-6 space-y-4">
          {["Iluminação", "MDF", "Pedras", "Móveis", "Tecidos"].map((category, index) => (
            <div key={category}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-semibold text-slate-800">{category}</span>
                <span className="text-slate-500">{95 - index * 9}%</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-violet-600" style={{ width: `${95 - index * 9}%` }} />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
