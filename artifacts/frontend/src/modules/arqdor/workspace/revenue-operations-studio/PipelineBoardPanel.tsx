import React from "react";
import { revenueDeals } from "./revenueData";
import { DealStage } from "./revenueTypes";
import { ProbabilityBar } from "./ProbabilityBar";
import { revenueStatusClass, revenueStatusLabel, stageLabel } from "./revenueUtils";

const stages: DealStage[] = ["lead", "qualified", "demo", "proposal", "pilot", "contract", "won"];

export function PipelineBoardPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Pipeline</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Pipeline comercial ARQDOR.ai</h2>

      <div className="mt-5 grid gap-4 xl:grid-cols-7">
        {stages.map((stage) => {
          const deals = revenueDeals.filter((deal) => deal.stage === stage);

          return (
            <div key={stage} className="rounded-[28px] border border-slate-100 bg-slate-50 p-4">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">{stageLabel(stage)}</p>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-500">{deals.length}</span>
              </div>

              <div className="space-y-3">
                {deals.map((deal) => (
                  <article key={deal.id} className="rounded-3xl bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-950">{deal.company}</p>
                        <p className="mt-1 text-xs text-slate-500">{deal.segment}</p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${revenueStatusClass(deal.status)}`}>
                        {revenueStatusLabel(deal.status)}
                      </span>
                    </div>

                    <p className="mt-3 text-xs font-semibold text-violet-700">{deal.plan}</p>
                    <p className="mt-1 text-xs text-slate-500">{deal.value} • {deal.setup}</p>

                    <div className="mt-3">
                      <div className="mb-1 flex justify-between text-[11px] font-semibold text-slate-500">
                        <span>Prob.</span>
                        <span>{deal.probability}%</span>
                      </div>
                      <ProbabilityBar value={deal.probability} />
                    </div>

                    <p className="mt-3 text-xs leading-5 text-slate-600">{deal.nextStep}</p>
                  </article>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
