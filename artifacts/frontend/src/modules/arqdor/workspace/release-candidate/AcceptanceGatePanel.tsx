import React from "react";
import { acceptanceGates } from "./releaseData";
import { releaseStatusClass, releaseStatusLabel } from "./releaseUtils";

export function AcceptanceGatePanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Acceptance Gates</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Critérios para declarar Release Candidate</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-5">
        {acceptanceGates.map((gate) => (
          <article key={gate.id} className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${releaseStatusClass(gate.status)}`}>
                {releaseStatusLabel(gate.status)}
              </span>
              <span className={["rounded-full px-3 py-1 text-xs font-semibold", gate.required ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-600"].join(" ")}>
                {gate.required ? "obrigatório" : "opcional"}
              </span>
            </div>

            <p className="mt-4 text-base font-semibold text-slate-950">{gate.title}</p>
            <p className="mt-3 text-sm leading-6 text-slate-600">{gate.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
