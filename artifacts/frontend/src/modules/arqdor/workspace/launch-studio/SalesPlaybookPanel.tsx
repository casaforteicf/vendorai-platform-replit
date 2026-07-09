import React from "react";
import { salesPlays } from "./launchData";

export function SalesPlaybookPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Vendas</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Playbook comercial</h2>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        {salesPlays.map((play) => (
          <article key={play.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <p className="text-lg font-semibold text-slate-950">{play.title}</p>

            <Block label="Gatilho" value={play.trigger} />
            <Block label="Script" value={play.script} />
            <Block label="Objeção" value={play.objection} />
            <Block label="Fechamento" value={play.close} />
          </article>
        ))}
      </div>
    </section>
  );
}

function Block({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-4 rounded-3xl bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-sm leading-6 text-slate-700">{value}</p>
    </div>
  );
}
