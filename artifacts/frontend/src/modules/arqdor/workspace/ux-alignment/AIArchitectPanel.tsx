import React from "react";
import { aiInsights } from "./uxAlignmentData";

export function AIArchitectPanel() {
  return (
    <section className="rounded-[28px] border border-violet-100 bg-white p-5 shadow-sm">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-violet-600">AI Architect</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-950">Inteligência do ambiente</h3>
        </div>
        <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">Ativo</span>
      </div>

      <div className="space-y-3">
        {aiInsights.map((insight) => (
          <div key={insight.id} className="rounded-3xl bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-950">{insight.title}</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">{insight.description}</p>
            <p className="mt-2 text-xs font-semibold text-violet-700">{insight.impact}</p>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="mt-5 w-full rounded-2xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-700"
      >
        Aplicar sugestões
      </button>
    </section>
  );
}
