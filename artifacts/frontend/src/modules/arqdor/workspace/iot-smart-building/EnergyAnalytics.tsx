import React from "react";
import { energyMetrics } from "./iotData";
import { currency } from "./iotUtils";

export function EnergyAnalytics() {
  const max = Math.max(...energyMetrics.map((item) => item.baselineKwh));

  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Energia</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Consumo e economia</h2>

      <div className="mt-6 space-y-5">
        {energyMetrics.map((item) => (
          <div key={item.id}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="font-semibold text-slate-800">{item.area}</span>
              <span className="text-slate-500">{item.currentKwh} kWh • {currency(item.cost)}</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-violet-600" style={{ width: `${(item.currentKwh / max) * 100}%` }} />
            </div>
            <p className="mt-1 text-xs text-slate-400">Economia potencial: {item.savingPotential}%</p>
          </div>
        ))}
      </div>
    </section>
  );
}
