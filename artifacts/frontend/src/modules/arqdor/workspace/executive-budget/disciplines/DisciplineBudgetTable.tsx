import React from "react";
import type { DisciplineBudgetConfig } from "./disciplineBudgetData";
import { currency, disciplineTotal, lineTotal } from "./disciplineBudgetData";

type Props = {
  config: DisciplineBudgetConfig;
};

export function DisciplineBudgetTable({ config }: Props) {
  return (
    <div className="rounded-[28px] border border-slate-100 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-violet-600">Disciplina</p>
        <h3 className="mt-1 text-lg font-semibold text-slate-950">{config.label}</h3>
        <p className="mt-1 text-sm text-slate-500">{config.description}</p>
      </div>

      <div className="overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3">Un.</th>
              <th className="px-4 py-3">Qtd.</th>
              <th className="px-4 py-3">Material</th>
              <th className="px-4 py-3">Mão de obra</th>
              <th className="px-4 py-3">Margem</th>
              <th className="px-4 py-3">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {config.lines.map((line) => (
              <tr key={line.id}>
                <td className="px-4 py-4">
                  <p className="font-medium text-slate-800">{line.title}</p>
                  {line.description ? <p className="mt-1 text-xs text-slate-500">{line.description}</p> : null}
                </td>
                <td className="px-4 py-4 text-slate-500">{line.unit}</td>
                <td className="px-4 py-4 text-slate-500">{line.quantity}</td>
                <td className="px-4 py-4 text-slate-500">{currency(line.materialCost)}</td>
                <td className="px-4 py-4 text-slate-500">{currency(line.laborCost)}</td>
                <td className="px-4 py-4 text-slate-500">{line.marginPercent}%</td>
                <td className="px-4 py-4 font-semibold text-slate-800">{currency(lineTotal(line))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-50">
            <tr>
              <td className="px-4 py-4 font-semibold text-slate-950" colSpan={6}>
                Total da disciplina
              </td>
              <td className="px-4 py-4 font-semibold text-slate-950">{currency(disciplineTotal(config.lines))}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
