import React, { useState } from "react";
import type { Quotation } from "./quotationTypes";
import { currency } from "./quotationUtils";

export function NegotiationPanel({ quote }: { quote: Quotation }) {
  const [target, setTarget] = useState(Math.round(quote.price * 0.95));
  const saving = quote.price - target;

  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Negociação</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">{quote.supplier}</h2>

      <label className="mt-5 block">
        <span className="text-sm font-semibold text-slate-700">Contraoferta desejada</span>
        <input
          type="number"
          value={target}
          onChange={(event) => setTarget(Number(event.target.value))}
          className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100"
        />
      </label>

      <div className="mt-5 rounded-3xl bg-emerald-50 p-4">
        <p className="text-sm font-semibold text-emerald-950">Economia simulada</p>
        <p className="mt-1 text-2xl font-semibold text-emerald-700">{currency(Math.max(0, saving))}</p>
      </div>

      <button type="button" className="mt-5 w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-700">
        Enviar contraproposta
      </button>
    </section>
  );
}
