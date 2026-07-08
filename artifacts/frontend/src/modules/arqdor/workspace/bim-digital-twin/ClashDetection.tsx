import React from "react";
import { clashes } from "./bimData";
import { severityClass, statusClass } from "./bimUtils";

export function ClashDetection() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Clash Detection</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Conflitos detectados</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-3">
        {clashes.map((clash) => (
          <article key={clash.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{clash.title}</p>
                <p className="mt-1 text-sm text-slate-500">{clash.disciplineA} × {clash.disciplineB}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${severityClass(clash.severity)}`}>{clash.severity}</span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <Info label="Elemento A" value={clash.elementA} />
              <Info label="Elemento B" value={clash.elementB} />
            </div>

            <p className="mt-4 text-sm leading-6 text-slate-600">{clash.recommendation}</p>

            <div className="mt-5 flex items-center justify-between">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(clash.status)}`}>{clash.status}</span>
              <button type="button" className="rounded-2xl bg-slate-950 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-700">Gerar tarefa</button>
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
