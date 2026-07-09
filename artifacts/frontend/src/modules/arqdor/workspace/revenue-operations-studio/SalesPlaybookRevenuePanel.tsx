import React from "react";
import { playbook } from "./revenueData";

export function SalesPlaybookRevenuePanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Playbook</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Scripts de conversão e expansão</h2>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        {playbook.map((item) => (
          <article key={item.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <p className="text-lg font-semibold text-slate-950">{item.title}</p>

            <Block label="Contexto" value={item.context} />
            <Block label="Mensagem" value={item.message} />
            <Block label="Prova" value={item.proof} />
            <Block label="Fechamento" value={item.close} />
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
