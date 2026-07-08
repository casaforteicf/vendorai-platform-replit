import React, { useState } from "react";
import { AIReceivingPanel } from "./AIReceivingPanel";
import { DeliveryTracking } from "./DeliveryTracking";
import { InventoryPanel } from "./InventoryPanel";
import { LogisticsPanel } from "./LogisticsPanel";
import { MetricCard } from "./MetricCard";
import { ReceivingCard } from "./ReceivingCard";
import { ReceivingInspector } from "./ReceivingInspector";
import { WarehousePanel } from "./WarehousePanel";
import { inventoryItems, receivingItems } from "./receivingData";
import type { ReceivingItem, ReceivingView } from "./receivingTypes";
import { currency } from "./receivingUtils";

type Props = {
  onNavigate?: (module: string) => void;
};

export default function ReceivingInventoryStudio({ onNavigate }: Props) {
  const [view, setView] = useState<ReceivingView>("receiving");
  const [selectedItem, setSelectedItem] = useState<ReceivingItem>(receivingItems[0]);

  const inventoryValue = inventoryItems.reduce((sum, item) => sum + item.value, 0);
  const inspection = receivingItems.filter((item) => item.status === "inspection").length;
  const approved = receivingItems.filter((item) => item.status === "approved").length;

  return (
    <div className="min-h-screen bg-[#f7f7f8] text-slate-950">
      <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-6 py-6">
        <header className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Receiving, Inventory & Logistics</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Recebimento e Logística</h1>
              <p className="mt-1 text-sm text-slate-500">Pedidos → Recebimento → Estoque → Reserva → Entrega → Instalação</p>
            </div>

            <div className="flex flex-wrap gap-2">
              {[
                ["receiving", "Recebimento"],
                ["inventory", "Estoque"],
                ["warehouse", "Warehouse"],
                ["logistics", "Logística"],
                ["tracking", "Tracking"],
                ["ai", "IA"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setView(id as ReceivingView)}
                  className={[
                    "rounded-2xl px-4 py-2 text-sm font-semibold transition",
                    view === id ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-600 hover:bg-violet-50 hover:text-violet-700",
                  ].join(" ")}
                >
                  {label}
                </button>
              ))}

              <button type="button" onClick={() => onNavigate?.("compras")} className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-violet-200 hover:text-violet-700">
                Voltar compras
              </button>
            </div>
          </div>
        </header>

        {view === "receiving" ? (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Recebimentos" value={String(receivingItems.length)} description="Itens aguardando ou recebidos." />
              <MetricCard label="Em inspeção" value={String(inspection)} description="Itens pendentes de aprovação." />
              <MetricCard label="Aprovados" value={String(approved)} description="Itens liberados." />
              <MetricCard label="Valor estoque" value={currency(inventoryValue)} description="Valor dos itens controlados." />
            </section>

            <main className="grid gap-5 xl:grid-cols-[1fr_390px]">
              <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
                <div className="mb-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Recebimentos</p>
                  <h2 className="mt-1 text-xl font-semibold text-slate-950">Itens recebidos ou previstos</h2>
                </div>
                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {receivingItems.map((item) => (
                    <ReceivingCard key={item.id} item={item} selected={selectedItem.id === item.id} onSelect={setSelectedItem} />
                  ))}
                </div>
              </section>

              <div className="space-y-5">
                <ReceivingInspector item={selectedItem} />
                <AIReceivingPanel />
              </div>
            </main>
          </>
        ) : null}

        {view === "inventory" ? <InventoryPanel /> : null}
        {view === "warehouse" ? <WarehousePanel /> : null}
        {view === "logistics" ? <LogisticsPanel /> : null}
        {view === "tracking" ? <DeliveryTracking /> : null}
        {view === "ai" ? <AIReceivingPanel /> : null}
      </div>
    </div>
  );
}
