import React from "react";
import type { Quotation, QuoteCriteria } from "./quotationTypes";
import { currency, quoteScore } from "./quotationUtils";

export function QuoteRanking({ quotes, criteria }: { quotes: Quotation[]; criteria: QuoteCriteria }) {
  const ranked = [...quotes].sort((a, b) => quoteScore(b, criteria) - quoteScore(a, criteria));

  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Ranking</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Melhores cotações</h2>

      <div className="mt-5 space-y-4">
        {ranked.map((quote, index) => {
          const score = quoteScore(quote, criteria);

          return (
            <div key={quote.id}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-semibold text-slate-800">{index + 1}. {quote.supplier}</span>
                <span className="text-slate-500">{currency(quote.price)} • {score}%</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-violet-600" style={{ width: `${score}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
