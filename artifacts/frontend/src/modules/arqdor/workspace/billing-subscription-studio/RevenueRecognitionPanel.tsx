import React from "react";
import { recognition } from "./billingData";
import { billingStatusClass, billingStatusLabel } from "./billingUtils";

export function RevenueRecognitionPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Reconhecimento</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">MRR, setup e receita diferida</h2>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        {recognition.map((item) => (
          <article key={item.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <p className="text-lg font-semibold text-slate-950">{item.month}</p>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${billingStatusClass(item.status)}`}>
                {billingStatusLabel(item.status)}
              </span>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-3">
              <Info label="MRR" value={item.mrrRecognized} />
              <Info label="Setup" value={item.setupRecognized} />
              <Info label="Diferida" value={item.deferred} />
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
      <p className="mt-1 text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}
