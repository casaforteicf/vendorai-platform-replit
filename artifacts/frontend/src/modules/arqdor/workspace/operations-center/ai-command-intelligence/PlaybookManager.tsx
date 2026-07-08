import React from "react";
import { playbooks } from "./aiCommandData";
import { statusClass } from "./aiCommandUtils";

export function PlaybookManager() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Playbooks</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Fluxos inteligentes</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        {playbooks.map((playbook) => (
          <article key={playbook.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{playbook.name}</p>
                <p className="mt-1 text-sm text-slate-500">{playbook.trigger}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(playbook.status)}`}>{playbook.status}</span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <Info label="Etapas" value={String(playbook.steps)} />
              <Info label="Módulos" value={playbook.modules.join(", ")} />
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
