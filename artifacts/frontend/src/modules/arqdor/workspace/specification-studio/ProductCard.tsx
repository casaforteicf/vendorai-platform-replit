import React from "react";
import type { ProductItem } from "./specificationTypes";

type ProductCardProps = {
  product: ProductItem;
};

export function ProductCard({ product }: ProductCardProps) {
  return (
    <article className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold text-slate-950">{product.name}</p>
          <p className="mt-1 text-sm text-slate-500">{product.manufacturer} • {product.collection}</p>
        </div>
        <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
          {product.compatibility}%
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-2xl bg-slate-50 p-3">
          <p className="text-xs text-slate-400">Preço</p>
          <p className="mt-1 font-semibold text-slate-800">{product.price}</p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-3">
          <p className="text-xs text-slate-400">Prazo</p>
          <p className="mt-1 font-semibold text-slate-800">{product.leadTime}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {product.tags.map((tag) => (
          <span key={tag} className="rounded-full bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500">
            {tag}
          </span>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Badge active={product.hasPdf} label="PDF" />
        <Badge active={product.hasBim} label="BIM" />
        <Badge active={product.hasSketchup} label="SKP" />
      </div>
    </article>
  );
}

function Badge({ active, label }: { active?: boolean; label: string }) {
  return (
    <div className={["rounded-2xl px-3 py-2 text-center text-xs font-semibold", active ? "bg-emerald-50 text-emerald-700" : "bg-slate-50 text-slate-400"].join(" ")}>
      {label}
    </div>
  );
}
