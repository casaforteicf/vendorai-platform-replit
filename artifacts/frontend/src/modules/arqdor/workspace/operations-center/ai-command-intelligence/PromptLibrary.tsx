import React from "react";
import { prompts } from "./aiCommandData";
import { statusClass } from "./aiCommandUtils";

export function PromptLibrary() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Prompt Library</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Prompts operacionais</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {prompts.map((prompt) => (
          <article key={prompt.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <p className="text-base font-semibold text-slate-950">{prompt.name}</p>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(prompt.status)}`}>{prompt.status}</span>
            </div>
            <p className="mt-2 text-sm text-slate-500">{prompt.module}</p>
            <p className="mt-4 text-xs leading-5 text-slate-500">{prompt.purpose}</p>
            <p className="mt-4 text-xs font-semibold text-slate-400">Versão {prompt.version}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
