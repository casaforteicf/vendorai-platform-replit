import React from "react";
import { waterMetrics } from "./iotData";
import { currency, severityClass } from "./iotUtils";

export function WaterManagement() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Água</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Consumo e vazamentos</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-3">
        {waterMetrics.map((item) => (
          <article key={item.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{item.area}</p>
                <p className="mt-1 text-sm text-slate-500">{item.consumptionLiters} L</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${severityClass(item.leakRisk)}`}>{item.leakRisk}</span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <Info label="Base" value={`${item.baselineLiters} L`} />
              <Info label="Custo" value={currency(item.cost)} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 font-semibold text-slate-800">{value}</p>
    </div>
  );
}
