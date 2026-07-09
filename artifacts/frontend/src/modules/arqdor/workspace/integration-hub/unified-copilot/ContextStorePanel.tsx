import React from "react";
import { contextItems } from "./copilotData";

export function ContextStorePanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Context Store</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Contexto global carregado</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-5">
        {contextItems.map((item) => (
          <article key={item.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <p className="text-base font-semibold text-slate-950">{item.title}</p>
            <p className="mt-1 text-sm text-slate-500">{item.module} • {item.entity}</p>
            <div className="mt-5">
              <div className="mb-1 flex justify-between text-xs">
                <span className="font-medium text-slate-600">Confiança</span>
                <span className="text-slate-400">{item.confidence}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-violet-600" style={{ width: `${item.confidence}%` }} />
              </div>
            </div>
            <p className="mt-4 text-xs text-slate-400">{item.lastUpdated}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
