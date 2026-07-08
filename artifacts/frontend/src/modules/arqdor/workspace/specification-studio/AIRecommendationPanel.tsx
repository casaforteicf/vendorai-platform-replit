import React from "react";
import { aiRecommendations } from "./specificationData";
import { ObjectInspector } from "./ObjectInspector";
import type { SpecObject } from "./specificationTypes";

export function AIRecommendationPanel({ selectedObject }: { selectedObject: SpecObject }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_390px]">
      <section className="rounded-[34px] border border-violet-100 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">AI Specification</p>
        <h2 className="mt-1 text-xl font-semibold text-slate-950">Recomendações inteligentes</h2>

        <div className="mt-5 space-y-3">
          {aiRecommendations.map((recommendation) => (
            <div key={recommendation.id} className="rounded-3xl bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-slate-900">{recommendation.title}</p>
                <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-violet-700">
                  {recommendation.impact}
                </span>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500">{recommendation.description}</p>
              <button type="button" className="mt-3 rounded-2xl bg-slate-950 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-700">
                {recommendation.action}
              </button>
            </div>
          ))}
        </div>
      </section>

      <ObjectInspector object={selectedObject} />
    </div>
  );
}
