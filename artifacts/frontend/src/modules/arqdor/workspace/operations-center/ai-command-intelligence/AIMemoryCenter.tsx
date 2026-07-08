import React from "react";
import { memories } from "./aiCommandData";

export function AIMemoryCenter() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">AI Memory</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Memória operacional</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        {memories.map((memory) => (
          <article key={memory.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{memory.title}</p>
                <p className="mt-1 text-sm text-slate-500">{memory.category} • {memory.source}</p>
              </div>
              <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">{memory.confidence}%</span>
            </div>
            <p className="mt-4 text-xs text-slate-400">Atualizado em {memory.lastUpdated}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
