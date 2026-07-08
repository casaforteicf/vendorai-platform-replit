import React, { useMemo, useState } from "react";
import { MarketplaceFilters } from "./MarketplaceFilters";
import { MarketplaceSearch } from "./MarketplaceSearch";
import { ProductCard } from "./ProductCard";
import { ProductInspector } from "./ProductInspector";
import { products } from "./marketplaceData";
import type { MarketplaceProduct, ProductCategory } from "./marketplaceTypes";

export function ProductCatalog() {
  const [category, setCategory] = useState<ProductCategory>("todos");
  const [query, setQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<MarketplaceProduct>(products[0]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((product) => {
      const matchesCategory = category === "todos" || product.category === category;
      const matchesQuery =
        !q ||
        product.name.toLowerCase().includes(q) ||
        product.manufacturer.toLowerCase().includes(q) ||
        product.sku.toLowerCase().includes(q) ||
        product.tags.some((tag) => tag.toLowerCase().includes(q));
      return matchesCategory && matchesQuery;
    });
  }, [category, query]);

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_390px]">
      <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
        <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Catálogo</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">Produtos marketplace</h2>
          </div>
          <div className="w-full xl:w-[420px]">
            <MarketplaceSearch value={query} onChange={setQuery} />
          </div>
        </div>

        <div className="mb-5">
          <MarketplaceFilters category={category} setCategory={setCategory} />
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((product) => (
            <ProductCard key={product.id} product={product} selected={selectedProduct.id === product.id} onSelect={setSelectedProduct} />
          ))}
        </div>
      </section>

      <ProductInspector product={selectedProduct} />
    </div>
  );
}
