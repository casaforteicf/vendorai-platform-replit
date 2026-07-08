import React from "react";
import { InfoCard } from "./InfoCard";
import type { SpecObject } from "./specificationTypes";

type ObjectInspectorProps = {
  object: SpecObject;
};

export function ObjectInspector({ object }: ObjectInspectorProps) {
  return (
    <aside className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Objeto selecionado</p>
      <h3 className="mt-1 text-lg font-semibold text-slate-950">{object.name}</h3>
      <p className="mt-1 text-sm text-slate-500">{object.manufacturer} • {object.sku}</p>

      <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <InfoCard label="Material" value={object.material} />
        <InfoCard label="Acabamento" value={object.finish} />
        <InfoCard label="Medidas" value={object.dimensions} />
        <InfoCard label="Compatível" value={`${object.compatibility}%`} />
        <InfoCard label="Preço" value={object.price} />
        <InfoCard label="Prazo" value={object.deadline} />
      </div>

      <div className="mt-5 rounded-3xl bg-violet-50 p-4">
        <p className="text-sm font-semibold text-violet-950">Recomendação IA</p>
        <p className="mt-1 text-xs leading-5 text-violet-700">{object.aiNote}</p>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        {["Manual PDF", "Modelo 3D", "Orçar", "Produzir"].map((action, index) => (
          <button
            key={action}
            type="button"
            className={[
              "rounded-2xl px-3 py-3 text-xs font-semibold transition",
              index === 3 ? "bg-slate-950 text-white hover:bg-violet-700" : "bg-slate-50 text-slate-700 hover:bg-violet-50 hover:text-violet-700",
            ].join(" ")}
          >
            {action}
          </button>
        ))}
      </div>
    </aside>
  );
}
