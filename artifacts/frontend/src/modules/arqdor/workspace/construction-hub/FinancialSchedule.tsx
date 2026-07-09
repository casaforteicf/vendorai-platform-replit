import React from "react";
import { measurements } from "./constructionData";
import { currency } from "./constructionUtils";

export function FinancialSchedule() {
  const total = measurements.reduce((sum, item) => sum + item.value, 0);
  const executed = measurements.reduce((sum, item) => sum + item.value * (item.executed / Math.max(item.planned, 1)), 0);

  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Cronograma financeiro</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Execução financeira por medição</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <Card label="Previsto" value={currency(total)} />
        <Card label="Executado proporcional" value={currency(executed)} />
      </div>

      <div className="mt-6 space-y-4">
        {measurements.map((item) => {
          const percent = Math.round((item.executed / Math.max(item.planned, 1)) * 100);
          return (
            <div key={item.id}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-semibold text-slate-800">{item.title}</span>
                <span className="text-slate-500">{currency(item.value)}</span>
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

function Card({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-sm font-semibold text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-950">{value}</p>
    </article>
  );
}
