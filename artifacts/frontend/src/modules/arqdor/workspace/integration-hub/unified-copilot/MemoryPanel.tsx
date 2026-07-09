import React from "react";
import { contextItems } from "./copilotData";

export function MemoryPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Copilot Memory</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Memória operacional compartilhada</h2>

      <div className="mt-5 rounded-3xl bg-violet-50 p-5">
        <p className="text-sm font-semibold text-violet-950">Regra principal</p>
        <p className="mt-2 text-sm leading-6 text-violet-700">
          O Copilot deve preservar decisões já aprovadas, evitar duplicidade de dados e consultar o estado global antes de executar ações.
        </p>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {contextItems.map((item) => (
          <div key={item.id} className="rounded-2xl bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-900">{item.title}</p>
            <p className="mt-1 text-xs text-slate-500">{item.module} • {item.confidence}% confiança</p>
          </div>
        ))}
      </div>
    </section>
  );
}
