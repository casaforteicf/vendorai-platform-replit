import React from "react";
import { checklists } from "./constructionData";

export function ChecklistPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Checklists</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Controle de qualidade em obra</h2>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {checklists.map((check) => (
          <label key={check.id} className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <input type="checkbox" defaultChecked={check.checked} className="h-4 w-4 rounded border-slate-300" />
            <span>
              <span className="font-semibold">{check.title}</span>
              <span className="ml-2 text-xs text-slate-400">{check.owner}</span>
            </span>
          </label>
        ))}
      </div>
    </section>
  );
}
