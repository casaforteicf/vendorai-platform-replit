import React from "react";
import { categories } from "./marketplaceData";
import type { ProductCategory } from "./marketplaceTypes";

export function MarketplaceFilters({ category, setCategory }: { category: ProductCategory; setCategory: (category: ProductCategory) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {categories.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => setCategory(item.id)}
          className={[
            "rounded-2xl px-4 py-2 text-sm font-semibold transition",
            category === item.id ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-600 hover:bg-violet-50 hover:text-violet-700",
          ].join(" ")}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
