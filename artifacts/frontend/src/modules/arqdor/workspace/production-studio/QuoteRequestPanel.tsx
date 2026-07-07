import React from "react";

const quoteItems = [
  { discipline: "Marcenaria", supplier: "Marceneiro Local", status: "A preparar" },
  { discipline: "Gesso", supplier: "Gesseiro Local", status: "A preparar" },
  { discipline: "Marmoraria", supplier: "Marmoraria Local", status: "A preparar" },
];

export function QuoteRequestPanel() {
  return (
    <div className="rounded-[32px] border border-slate-100 bg-white p-5 shadow-sm">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-violet-600">Cotações</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-950">Solicitar orçamento</h3>
        </div>

        <button type="button" className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700">
          Preparar envio
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-100">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Disciplina</th>
              <th className="px-4 py-3">Fornecedor</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {quoteItems.map((item) => (
              <tr key={item.discipline}>
                <td className="px-4 py-4 font-medium text-slate-800">{item.discipline}</td>
                <td className="px-4 py-4 text-slate-500">{item.supplier}</td>
                <td className="px-4 py-4 text-amber-600">{item.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
