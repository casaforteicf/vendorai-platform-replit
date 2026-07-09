import React from "react";
import { feedbackItems } from "./pilotData";
import { pilotStatusClass, pilotStatusLabel } from "./pilotUtils";

export function PilotFeedbackPanel() {
  const typeClass = {
    ux: "bg-violet-50 text-violet-700",
    bug: "bg-rose-50 text-rose-700",
    feature: "bg-blue-50 text-blue-700",
    business: "bg-emerald-50 text-emerald-700",
    training: "bg-amber-50 text-amber-700",
  } as const;

  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Feedback</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Voz do piloto e backlog de produto</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {feedbackItems.map((item) => (
          <article key={item.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${typeClass[item.type]}`}>{item.type}</span>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${pilotStatusClass(item.status)}`}>
                {pilotStatusLabel(item.status)}
              </span>
            </div>

            <p className="mt-4 text-base font-semibold text-slate-950">{item.title}</p>
            <p className="mt-1 text-sm text-slate-500">{item.account}</p>

            <div className="mt-4 rounded-3xl bg-slate-50 p-4">
              <p className="text-sm italic leading-6 text-slate-700">"{item.quote}"</p>
            </div>

            <p className="mt-4 text-sm leading-6 text-violet-700">{item.impact}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
