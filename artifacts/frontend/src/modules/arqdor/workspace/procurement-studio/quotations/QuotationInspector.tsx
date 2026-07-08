import React from "react";
import type { Quotation, QuoteCriteria } from "./quotationTypes";
import { currency, quoteScore, statusClass } from "./quotationUtils";

export function QuotationInspector({ quote, criteria }: { quote: Quotation; criteria: QuoteCriteria }) {
  return (
    <aside className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Cotação selecionada</p>
      <h3 className="mt-1 text-lg font-semibold text-slate-950">{quote.supplier}</h3>
      <p className="mt-1 text-sm text-slate-500">{quote.requestCode} • {quote.category}</p>

      <div className="mt-5 flex gap-2">
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(quote.status)}`}>{quote.status}</span>
        <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">Ranking {quoteScore(quote, criteria)}%</span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <Info label="Preço" value={currency(quote.price)} />
        <Info label="Original" value={currency(quote.originalPrice)} />
        <Info label="Prazo" value={`${quote.leadTimeDays} dias`} />
        <Info label="Score" value={`${quote.score}%`} />
        <Info label="Pagamento" value={quote.paymentTerms} />
        <Info label="Garantia" value={quote.warranty} />
      </div>

      <div className="mt-5 rounded-3xl bg-slate-50 p-4">
        <p className="text-sm font-semibold text-slate-900">Observações</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">{quote.observations}</p>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        {["Negociar", "Aprovar", "Recusar", "Gerar pedido"].map((action, index) => (
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 font-semibold text-slate-800">{value}</p>
    </div>
  );
}
