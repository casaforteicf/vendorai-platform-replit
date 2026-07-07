import React from "react";
import type { DocumentationDiscipline } from "./DocumentationStudioContext";

export function TechnicalPreview({ discipline }: { discipline: DocumentationDiscipline }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <div className="flex min-h-[560px] items-center justify-center rounded-[32px] border border-slate-100 bg-white shadow-sm">
        <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-slate-50 p-8">
          <div className="aspect-[1.4] rounded-xl border border-dashed border-slate-300 bg-white p-6">
            <div className="h-full w-full rounded-lg border-2 border-slate-300">
              <div className="flex h-full items-center justify-center text-center text-slate-400">
                <div>
                  <p className="text-lg font-semibold text-slate-500">Planta / Vista Técnica</p>
                  <p className="mt-2 text-sm">Disciplina: {discipline}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <aside className="rounded-[32px] border border-slate-100 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-slate-950">Camadas</p>
        <div className="mt-4 space-y-2">
          {["Planta baixa", "Vista frontal", "Vista lateral", "Medidas", "Mobiliário", "Observações"].map((item) => (
            <label key={item} className="flex items-center gap-3 rounded-2xl bg-slate-50 px-3 py-3 text-sm text-slate-600">
              <input type="checkbox" defaultChecked className="h-4 w-4 rounded border-slate-300" />
              {item}
            </label>
          ))}
        </div>
      </aside>
    </div>
  );
}
