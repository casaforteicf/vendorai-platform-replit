import React from "react";
import type { Quotation, QuoteCriteria } from "./quotationTypes";
import { currency, quoteScore, statusClass } from "./quotationUtils";

type Props = {
  quote: Quotation;
  criteria: QuoteCriteria;
  selected?: boolean;
  onSelect: (quote: Quotation) => void;
};

export function QuotationCard({ quote, criteria, selected, onSelect }: Props) {
  const score = quoteScore(quote, criteria);
  const saving = quote.originalPrice - quote.price;

  return (
    <button type="button" onClick={() => onSelect(quote)} className="text-left">
      <article className={[
        "rounded-[30px] border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
        selected ? "border-violet-300 ring-4 ring-violet-100" : "border-slate-100",
      ].join(" ")}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-slate-950">{quote.supplier}</p>
            <p className="mt-1 text-sm text-slate-500">{quote.itemName}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(quote.status)}`}>{quote.status}</span>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <Info label="Preço" value={currency(quote.price)} />
          <Info label="Prazo" value={`${quote.leadTimeDays} dias`} />
          <Info label="Score" value={`${quote.score}%`} />
          <Info label="Ranking" value={`${score}%`} />
        </div>

        {saving > 0 ? (
          <div className="mt-4 rounded-2xl bg-emerald-50 p-3">
            <p className="text-xs font-semibold text-emerald-700">Desconto identificado</p>
            <p className="mt-1 text-sm font-semibold text-emerald-800">{currency(saving)}</p>
          </div>
        ) : null}
      </article>
    </button>
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
