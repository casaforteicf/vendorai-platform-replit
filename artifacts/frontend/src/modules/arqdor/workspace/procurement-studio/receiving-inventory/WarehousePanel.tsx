import React from "react";
import { inventoryItems } from "./receivingData";

export function WarehousePanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Warehouse</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Mapa de armazenamento</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-3">
        {inventoryItems.map((item) => (
          <article key={item.id} className="rounded-[30px] border border-slate-100 bg-slate-50 p-5">
            <p className="text-base font-semibold text-slate-950">{item.location}</p>
            <p className="mt-1 text-sm text-slate-500">{item.name}</p>
            <div className="mt-4 rounded-2xl bg-white p-3 text-sm font-semibold text-slate-700">
              Reservado para: {item.reservedFor}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
