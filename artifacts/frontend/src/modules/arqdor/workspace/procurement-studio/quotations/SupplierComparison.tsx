import React from "react";
import type { Quotation, QuoteCriteria } from "./quotationTypes";
import { currency, quoteScore } from "./quotationUtils";

export function SupplierComparison({ quotes, criteria }: { quotes: Quotation[]; criteria: QuoteCriteria }) {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Mapa comparativo</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Fornecedor × preço × prazo</h2>

      <div className="mt-5 overflow-hidden rounded-3xl border border-slate-100">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Fornecedor</th>
              <th className="px-4 py-3">Preço</th>
              <th className="px-4 py-3">Prazo</th>
              <th className="px-4 py-3">Score</th>
              <th className="px-4 py-3">Ranking</th>
              <th className="px-4 py-3">Condição</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {quotes.map((quote) => (
              <tr key={quote.id}>
                <td className="px-4 py-4 font-medium text-slate-800">{quote.supplier}</td>
                <td className="px-4 py-4 text-slate-500">{currency(quote.price)}</td>
                <td className="px-4 py-4 text-slate-500">{quote.leadTimeDays} dias</td>
                <td className="px-4 py-4 text-slate-500">{quote.score}%</td>
                <td className="px-4 py-4 font-semibold text-slate-800">{quoteScore(quote, criteria)}%</td>
                <td className="px-4 py-4 text-slate-500">{quote.paymentTerms}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
