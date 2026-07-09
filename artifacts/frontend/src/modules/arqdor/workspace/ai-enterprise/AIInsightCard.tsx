import React from "react";
import type { AIInsight } from "./aiEnterpriseTypes";

export function AIInsightCard({ insight }: { insight: AIInsight }) {
  const severityClass = {
    low: "bg-emerald-50 text-emerald-700",
    medium: "bg-amber-50 text-amber-700",
    high: "bg-rose-50 text-rose-700",
  } as const;

  return (
    <article className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold text-slate-950">{insight.title}</p>
          <p className="mt-1 text-sm text-slate-500">{insight.module}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${severityClass[insight.severity]}`}>
          {insight.impact}
        </span>
      </div>

      <p className="mt-4 text-sm leading-6 text-slate-600">{insight.description}</p>

      <div className="mt-4 rounded-3xl bg-violet-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Recomendação</p>
        <p className="mt-1 text-sm leading-6 text-violet-900">{insight.recommendation}</p>
      </div>
    </article>
  );
}
