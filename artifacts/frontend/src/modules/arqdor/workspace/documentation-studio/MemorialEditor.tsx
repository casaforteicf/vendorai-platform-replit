import React, { useState } from "react";
import type { DocumentationDiscipline } from "./DocumentationStudioContext";

export function MemorialEditor({ discipline }: { discipline: DocumentationDiscipline }) {
  const [text, setText] = useState(
    `Memorial técnico — ${discipline}\n\nDescrever materiais, medidas, acabamentos, critérios de execução e observações específicas desta disciplina.`,
  );

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
      <div className="rounded-[32px] border border-slate-100 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-violet-600">Memorial</p>
            <h3 className="mt-1 text-lg font-semibold text-slate-950">Editor assistido</h3>
          </div>
          <button className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700" type="button">
            Gerar com IA
          </button>
        </div>

        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="min-h-[520px] w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 outline-none focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100"
        />
      </div>

      <aside className="rounded-[32px] border border-slate-100 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-slate-950">Checklist</p>
        <div className="mt-4 space-y-2">
          {["Materiais", "Medidas", "Acabamentos", "Observações", "Responsável", "Revisão"].map((item) => (
            <label key={item} className="flex items-center gap-3 rounded-2xl bg-slate-50 px-3 py-3 text-sm text-slate-600">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300" />
              {item}
            </label>
          ))}
        </div>
      </aside>
    </div>
  );
}
