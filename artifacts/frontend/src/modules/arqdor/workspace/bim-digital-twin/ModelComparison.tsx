import React from "react";
import { versions } from "./bimData";

export function ModelComparison() {
  const current = versions[0];
  const previous = versions[1];

  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Comparador</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Comparação de versões</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <VersionCard title="Versão atual" version={current.version} changes={current.changes} date={current.date} />
        <VersionCard title="Versão anterior" version={previous.version} changes={previous.changes} date={previous.date} />
      </div>

      <div className="mt-5 rounded-3xl bg-violet-50 p-5">
        <p className="text-sm font-semibold text-violet-950">Diferenças principais</p>
        <ul className="mt-3 space-y-2 text-sm text-violet-700">
          <li>• Alteração em rasgo técnico do painel TV.</li>
          <li>• Atualização de posição do perfil LED.</li>
          <li>• Revisão de cortineiro e compatibilização com iluminação.</li>
        </ul>
      </div>
    </section>
  );
}

function VersionCard({ title, version, changes, date }: { title: string; version: string; changes: number; date: string }) {
  return (
    <article className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-sm font-semibold text-slate-500">{title}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-950">{version}</p>
      <p className="mt-1 text-sm text-slate-500">{changes} alterações • {date}</p>
    </article>
  );
}
