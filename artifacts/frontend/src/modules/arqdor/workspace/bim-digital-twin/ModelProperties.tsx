import React, { useState } from "react";
import { elements } from "./bimData";
import { statusClass } from "./bimUtils";

export function ModelProperties() {
  const [selectedId, setSelectedId] = useState(elements[0]?.id || "");
  const element = elements.find((item) => item.id === selectedId) || elements[0];

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_390px]">
      <ModelExplorerList selectedId={selectedId} setSelectedId={setSelectedId} />

      <aside className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Propriedades</p>
        <h3 className="mt-1 text-lg font-semibold text-slate-950">{element.name}</h3>
        <p className="mt-1 text-sm text-slate-500">{element.category} • {element.discipline}</p>

        <div className="mt-5">
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(element.status)}`}>{element.status}</span>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <Info label="Material" value={element.material} />
          <Info label="Medidas" value={element.dimensions} />
          <Info label="Nível" value={element.level} />
          <Info label="Spec" value={element.linkedSpecification} />
          <Info label="Budget" value={element.linkedBudget} />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          {["Selecionar", "Sincronizar", "Gerar tarefa", "Abrir spec"].map((action, index) => (
            <button key={action} type="button" className={[
              "rounded-2xl px-3 py-3 text-xs font-semibold transition",
              index === 1 ? "bg-slate-950 text-white hover:bg-violet-700" : "bg-slate-50 text-slate-700 hover:bg-violet-50 hover:text-violet-700",
            ].join(" ")}>
              {action}
            </button>
          ))}
        </div>
      </aside>
    </div>
  );
}

function ModelExplorerList({ selectedId, setSelectedId }: { selectedId: string; setSelectedId: (id: string) => void }) {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Elementos</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Selecionar elemento</h2>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {elements.map((element) => (
          <button
            key={element.id}
            type="button"
            onClick={() => setSelectedId(element.id)}
            className={[
              "rounded-[26px] border p-4 text-left transition",
              selectedId === element.id ? "border-violet-300 bg-violet-50" : "border-slate-100 bg-white hover:bg-slate-50",
            ].join(" ")}
          >
            <p className="text-sm font-semibold text-slate-950">{element.name}</p>
            <p className="mt-1 text-xs text-slate-500">{element.discipline} • {element.material}</p>
          </button>
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
