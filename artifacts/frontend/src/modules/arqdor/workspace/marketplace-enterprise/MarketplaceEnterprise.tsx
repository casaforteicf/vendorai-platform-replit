import React, { useState } from "react";
import { AIMarketplacePanel } from "./AIMarketplacePanel";
import { AssetLibrary } from "./AssetLibrary";
import { ManufacturerDirectory } from "./ManufacturerDirectory";
import { MarketplaceAnalytics } from "./MarketplaceAnalytics";
import { MarketplaceHome } from "./MarketplaceHome";
import { MarketplaceOrders } from "./MarketplaceOrders";
import { ProductCatalog } from "./ProductCatalog";
import { SupplierPortal } from "./SupplierPortal";
import type { MarketplaceView } from "./marketplaceTypes";

type MarketplaceEnterpriseProps = {
  arqState?: any;
  onNavigate?: (module: string) => void;
};

function Header({ view, setView, onNavigate }: { view: MarketplaceView; setView: (view: MarketplaceView) => void; onNavigate?: (module: string) => void }) {
  const views: Array<{ id: MarketplaceView; label: string }> = [
    { id: "home", label: "Home" },
    { id: "catalog", label: "Catálogo" },
    { id: "manufacturers", label: "Fabricantes" },
    { id: "assets", label: "Assets" },
    { id: "publish", label: "Publicar" },
    { id: "orders", label: "Pedidos" },
    { id: "analytics", label: "Analytics" },
    { id: "ai", label: "IA" },
  ];

  return (
    <header className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Marketplace Enterprise</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">ARQDOR Marketplace</h1>
          <p className="mt-1 text-sm text-slate-500">Fabricantes, produtos, BIM, DWG, SketchUp, preços, estoque e compras.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {views.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setView(item.id)}
              className={[
                "rounded-2xl px-4 py-2 text-sm font-semibold transition",
                view === item.id ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-600 hover:bg-violet-50 hover:text-violet-700",
              ].join(" ")}
            >
              {item.label}
            </button>
          ))}

          <button type="button" onClick={() => onNavigate?.("specification")} className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-violet-200 hover:text-violet-700">
            Especificação
          </button>
        </div>
      </div>
    </header>
  );
}

function Content({ view }: { view: MarketplaceView }) {
  if (view === "catalog") return <ProductCatalog />;
  if (view === "manufacturers") return <ManufacturerDirectory />;
  if (view === "assets") return <AssetLibrary />;
  if (view === "publish") return <SupplierPortal />;
  if (view === "orders") return <MarketplaceOrders />;
  if (view === "analytics") return <MarketplaceAnalytics />;
  if (view === "ai") return <AIMarketplacePanel />;
  return <MarketplaceHome />;
}

export default function MarketplaceEnterprise({ onNavigate }: MarketplaceEnterpriseProps) {
  const [view, setView] = useState<MarketplaceView>("home");

  return (
    <div className="min-h-screen bg-[#f7f7f8] text-slate-950">
      <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-6 py-6">
        <Header view={view} setView={setView} onNavigate={onNavigate} />
        <Content view={view} />
      </div>
    </div>
  );
}
