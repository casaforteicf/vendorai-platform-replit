import React from "react";
import type { MarketplaceProduct } from "./marketplaceTypes";
import { currency, productStatusClass } from "./marketplaceUtils";

export function ProductInspector({ product }: { product: MarketplaceProduct }) {
  return (
    <aside className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Produto selecionado</p>
      <h3 className="mt-1 text-lg font-semibold text-slate-950">{product.name}</h3>
      <p className="mt-1 text-sm text-slate-500">{product.sku} • {product.supplier}</p>

      <div className="mt-5">
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${productStatusClass(product.status)}`}>{product.status}</span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <Info label="Fabricante" value={product.manufacturer} />
        <Info label="Coleção" value={product.collection} />
        <Info label="Preço" value={currency(product.price)} />
        <Info label="Prazo" value={product.leadTime} />
        <Info label="Estoque" value={product.stock} />
        <Info label="Score" value={`${product.score}%`} />
      </div>

      <div className="mt-5 rounded-3xl bg-violet-50 p-4">
        <p className="text-sm font-semibold text-violet-950">Integração ARQDOR</p>
        <p className="mt-1 text-xs leading-5 text-violet-700">
          Este produto pode alimentar Specification Studio, Budget Studio, Procurement e Production.
        </p>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        {["Especificar", "Orçar", "Comprar", "Favoritar"].map((action, index) => (
          <button key={action} type="button" className={[
            "rounded-2xl px-3 py-3 text-xs font-semibold transition",
            index === 0 ? "bg-slate-950 text-white hover:bg-violet-700" : "bg-slate-50 text-slate-700 hover:bg-violet-50 hover:text-violet-700",
          ].join(" ")}>
            {action}
          </button>
        ))}
      </div>
    </aside>
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
