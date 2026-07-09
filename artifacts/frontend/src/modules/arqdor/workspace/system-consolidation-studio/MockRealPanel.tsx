import React from "react";
import { mockRealItems } from "./consolidationData";
import { effortClass, priorityClass, statusClass, statusLabel } from "./consolidationUtils";

export function MockRealPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Mock → Real</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">O que precisa sair do mock e virar operação real</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {mockRealItems.map((item) => (
          <article key={item.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(item.status)}`}>
                {statusLabel(item.status)}
              </span>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${priorityClass(item.priority)}`}>
                {item.priority}
              </span>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${effortClass(item.effort)}`}>
                esforço {item.effort}
              </span>
            </div>

            <p className="mt-4 text-base font-semibold text-slate-950">{item.area}</p>

            <Block label="Estado atual" value={item.currentState} />
            <Block label="Estado alvo" value={item.targetState} />
            <Block label="Ação" value={item.action} highlight />
          </article>
        ))}
      </div>
    </section>
  );
}

function Block({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`mt-4 rounded-3xl p-4 ${highlight ? "bg-violet-50" : "bg-slate-50"}`}>
      <p className={`text-xs font-semibold uppercase tracking-wide ${highlight ? "text-violet-600" : "text-slate-400"}`}>{label}</p>
      <p className={`mt-1 text-sm leading-6 ${highlight ? "text-violet-900" : "text-slate-700"}`}>{value}</p>
    </div>
  );
}
