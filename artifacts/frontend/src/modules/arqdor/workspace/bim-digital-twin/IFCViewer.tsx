import React from "react";

export function IFCViewer() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">IFC Viewer</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-950">Visualizador BIM / Digital Twin</h2>
        </div>
        <div className="flex gap-2">
          {["Orbit", "Section", "Measure", "Clash"].map((tool) => (
            <button key={tool} type="button" className="rounded-2xl bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-violet-50 hover:text-violet-700">
              {tool}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 flex min-h-[520px] items-center justify-center rounded-[32px] border border-dashed border-slate-200 bg-gradient-to-br from-slate-50 to-white">
        <div className="text-center">
          <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-[32px] bg-slate-950 text-3xl font-semibold text-white">3D</div>
          <h3 className="mt-5 text-2xl font-semibold text-slate-950">Modelo BIM navegável</h3>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
            Placeholder seguro para integrar IFC.js / xeokit / three.js sem alterar backend nesta sprint.
          </p>
        </div>
      </div>
    </section>
  );
}
