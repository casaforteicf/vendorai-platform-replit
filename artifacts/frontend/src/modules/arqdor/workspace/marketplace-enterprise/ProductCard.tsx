import React from "react";
import type { MarketplaceProduct } from "./marketplaceTypes";
import { currency, productStatusClass } from "./marketplaceUtils";

export function ProductCard({ product, selected, onSelect }: { product: MarketplaceProduct; selected?: boolean; onSelect: (product: MarketplaceProduct) => void }) {
  return (
    <button type="button" onClick={() => onSelect(product)} className="text-left">
      <article className={[
        "rounded-[30px] border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
        selected ? "border-violet-300 ring-4 ring-violet-100" : "border-slate-100",
      ].join(" ")}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-slate-950">{product.name}</p>
            <p className="mt-1 text-sm text-slate-500">{product.manufacturer} • {product.collection}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${productStatusClass(product.status)}`}>{product.status}</span>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <Info label="Preço" value={currency(product.price)} />
          <Info label="Prazo" value={product.leadTime} />
          <Info label="Estoque" value={product.stock} />
          <Info label="Score" value={`${product.score}%`} />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {product.assets.map((asset) => (
            <span key={asset} className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">{asset}</span>
          ))}
        </div>
      </article>
    </button>
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
