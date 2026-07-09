import React from "react";
import { aiInventoryInsights } from "./mockApiInventoryData";

export function AIInventoryPanel() {
  return (
    <aside className="rounded-[34px] border border-violet-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">AI Inventory</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Recomendações</h2>

      <div className="mt-5 space-y-3">
        {aiInventoryInsights.map((insight) => (
          <div key={insight.title} className="rounded-3xl bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold text-slate-900">{insight.title}</p>
              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-violet-700">{insight.impact}</span>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">{insight.description}</p>
            <button type="button" className="mt-3 rounded-2xl bg-slate-950 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-700">
              {insight.action}
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}
