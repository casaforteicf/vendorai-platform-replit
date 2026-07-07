import React from "react";
import type { DocumentationDiscipline } from "./DocumentationStudioContext";

const rows = [
  { item: "Material principal", unit: "m²", qty: "0,00", confidence: "A validar" },
  { item: "Rodapé / acabamento", unit: "m", qty: "0,00", confidence: "A validar" },
  { item: "Peças / módulos", unit: "un", qty: "0", confidence: "A validar" },
];

export function QuantityTable({ discipline }: { discipline: DocumentationDiscipline }) {
  return (
    <div className="rounded-[32px] border border-slate-100 bg-white p-5 shadow-sm">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-violet-600">Quantitativos</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-950">{discipline}</h3>
        </div>
        <button type="button" className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700">
          Recalcular
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-100">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3">Unidade</th>
              <th className="px-4 py-3">Quantidade</th>
              <th className="px-4 py-3">Confiança</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.item}>
                <td className="px-4 py-4 font-medium text-slate-800">{row.item}</td>
                <td className="px-4 py-4 text-slate-500">{row.unit}</td>
                <td className="px-4 py-4 text-slate-500">{row.qty}</td>
                <td className="px-4 py-4 text-amber-600">{row.confidence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
