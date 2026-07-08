import React from "react";
import { capacityItems } from "./executiveData";
import { riskClass } from "./executiveUtils";

export function CapacityPlanning() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Capacidade</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Alocação das equipes</h2>

      <div className="mt-6 space-y-5">
        {capacityItems.map((item) => {
          const percent = Math.round((item.allocated / item.capacity) * 100);

          return (
            <div key={item.id}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-semibold text-slate-800">{item.team}</span>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${riskClass(item.overloadRisk)}`}>{percent}%</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-violet-600" style={{ width: `${percent}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
