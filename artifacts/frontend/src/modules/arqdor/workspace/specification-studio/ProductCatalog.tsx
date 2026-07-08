import React, { useMemo, useState } from "react";
import { ProductCard } from "./ProductCard";
import { ProductFilters } from "./ProductFilters";
import { SearchBar } from "./SearchBar";
import { products } from "./specificationData";
import type { SpecCategory } from "./specificationTypes";

export function ProductCatalog() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<SpecCategory>("todos");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return products.filter((product) => {
      const matchesCategory = category === "todos" || product.category === category;
      const matchesQuery =
        !q ||
        product.name.toLowerCase().includes(q) ||
        product.manufacturer.toLowerCase().includes(q) ||
        product.collection.toLowerCase().includes(q) ||
        product.tags.some((tag) => tag.toLowerCase().includes(q));

      return matchesCategory && matchesQuery;
    });
  }, [category, query]);

  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Catálogo</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-950">Produtos especificáveis</h2>
        </div>

        <div className="w-full xl:w-[420px]">
          <SearchBar value={query} onChange={setQuery} />
        </div>
      </div>

      <div className="mb-5">
        <ProductFilters category={category} setCategory={setCategory} />
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
}
