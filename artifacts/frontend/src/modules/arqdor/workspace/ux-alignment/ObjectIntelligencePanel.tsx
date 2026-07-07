import React from "react";
import { selectedObject } from "./uxAlignmentData";

export function ObjectIntelligencePanel() {
  return (
    <section className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-violet-600">Objeto selecionado</p>
      <h3 className="mt-1 text-lg font-semibold text-slate-950">{selectedObject.name}</h3>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <Info label="Fornecedor" value={selectedObject.supplier} />
        <Info label="Preço" value={selectedObject.price} />
        <Info label="Prazo" value={selectedObject.deadline} />
        <Info label="Compatível" value={`${selectedObject.compatibility}%`} />
      </div>

      <div className="mt-4 rounded-3xl bg-slate-50 p-4">
        <p className="text-sm font-semibold text-slate-900">Material atual</p>
        <p className="mt-1 text-sm text-slate-500">{selectedObject.material}</p>
      </div>

      <div className="mt-4 rounded-3xl bg-violet-50 p-4">
        <p className="text-sm font-semibold text-violet-950">Recomendação IA</p>
        <p className="mt-1 text-xs leading-5 text-violet-700">{selectedObject.aiRecommendation}</p>
      </div>

      <button
        type="button"
        className="mt-5 w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-700"
      >
        Editar objeto inteligente
      </button>
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
