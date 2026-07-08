import React from "react";
import { AIMarketplacePanel } from "./AIMarketplacePanel";
import { MetricCard } from "./MetricCard";
import { products, manufacturers, assets, orders } from "./marketplaceData";
import { currency } from "./marketplaceUtils";

export function MarketplaceHome() {
  const total = orders.reduce((sum, order) => sum + order.value, 0);

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_390px]">
      <main className="space-y-5">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Produtos" value={String(products.length)} description="Itens publicados." />
          <MetricCard label="Fabricantes" value={String(manufacturers.length)} description="Marcas integradas." />
          <MetricCard label="Assets" value={String(assets.length)} description="BIM, DWG, PDF e texturas." />
          <MetricCard label="GMV" value={currency(total)} description="Volume transacionado." />
        </section>

        <section className="rounded-[34px] border border-slate-100 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Marketplace Enterprise</p>
          <h2 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">Render conectado a produtos reais</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">
            O marketplace transforma objetos do render em produtos especificáveis, orçáveis, compráveis e rastreáveis dentro do ARQDOR.ai.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-4">
            {["Render", "Especificação", "Orçamento", "Compra"].map((item, index) => (
              <div key={item} className={["rounded-3xl p-5", index === 0 ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-800"].join(" ")}>
                <p className="text-sm font-semibold">{item}</p>
                <p className={["mt-2 text-xs leading-5", index === 0 ? "text-slate-300" : "text-slate-500"].join(" ")}>
                  Etapa conectada ao ecossistema de produto.
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <AIMarketplacePanel />
    </div>
  );
}
