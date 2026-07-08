import React from "react";
import { trainingItems } from "./aiCommandData";
import { statusClass } from "./aiCommandUtils";

export function TrainingCenter() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Training Center</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Bases de aprendizado</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {trainingItems.map((item) => (
          <article key={item.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <p className="text-base font-semibold text-slate-950">{item.dataset}</p>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(item.status)}`}>{item.status}</span>
            </div>
            <p className="mt-2 text-sm text-slate-500">{item.module}</p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <Info label="Amostras" value={String(item.samples)} />
              <Info label="Qualidade" value={`${item.quality}%`} />
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
