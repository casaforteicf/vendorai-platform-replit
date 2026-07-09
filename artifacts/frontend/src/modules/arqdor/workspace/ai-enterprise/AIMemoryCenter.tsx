import React from "react";
import { aiMemory } from "./aiEnterpriseData";

export function AIMemoryCenter() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Memória IA</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Aprendizado por projeto, cliente e decisão</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {aiMemory.map((memory) => (
          <article key={memory.id} className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <p className="text-base font-semibold text-slate-950">{memory.title}</p>
              <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">{memory.confidence}%</span>
            </div>

            <p className="mt-3 text-sm leading-6 text-slate-600">{memory.description}</p>

            <div className="mt-4 rounded-2xl bg-slate-50 p-3">
              <p className="text-xs text-slate-400">Fonte</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">{memory.source}</p>
            </div>

            <p className="mt-3 text-xs font-semibold text-slate-500">
              {memory.reusable ? "Reutilizável em novos projetos" : "Somente contexto local"}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
