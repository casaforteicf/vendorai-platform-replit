import React, { useMemo, useState } from "react";
import { AIQuoteAnalyzer } from "./AIQuoteAnalyzer";
import { LeadTimeComparison } from "./LeadTimeComparison";
import { NegotiationPanel } from "./NegotiationPanel";
import { PriceHistory } from "./PriceHistory";
import { QuotationCard } from "./QuotationCard";
import { QuotationInspector } from "./QuotationInspector";
import { QuoteRanking } from "./QuoteRanking";
import { SupplierComparison } from "./SupplierComparison";
import { quotations } from "./quotationData";
import type { Quotation, QuoteCriteria } from "./quotationTypes";
import { bestQuote, currency } from "./quotationUtils";

type QuotationsProps = {
  onNavigate?: (module: string) => void;
};

export default function Quotations({ onNavigate }: QuotationsProps) {
  const [criteria, setCriteria] = useState<QuoteCriteria>("balanced");
  const [selectedQuote, setSelectedQuote] = useState<Quotation>(quotations[0]);
  const recommended = useMemo(() => bestQuote(quotations, criteria), [criteria]);
  const total = quotations.reduce((sum, quote) => sum + quote.price, 0);

  return (
    <div className="min-h-screen bg-[#f7f7f8] text-slate-950">
      <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-6 py-6">
        <header className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Procurement Quotations</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Mapa de cotações</h1>
              <p className="mt-1 text-sm text-slate-500">Comparativo de fornecedores, preço, prazo, score e IA.</p>
            </div>

            <div className="flex flex-wrap gap-2">
              {[
                ["balanced", "Equilibrado"],
                ["price", "Preço"],
                ["deadline", "Prazo"],
                ["score", "Score"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setCriteria(id as QuoteCriteria)}
                  className={[
                    "rounded-2xl px-4 py-2 text-sm font-semibold transition",
                    criteria === id ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-600 hover:bg-violet-50 hover:text-violet-700",
                  ].join(" ")}
                >
                  {label}
                </button>
              ))}

              <button type="button" onClick={() => onNavigate?.("compras")} className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-violet-200 hover:text-violet-700">
                Voltar compras
              </button>
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Metric label="Cotações" value={String(quotations.length)} />
          <Metric label="Volume cotado" value={currency(total)} />
          <Metric label="Recomendado" value={recommended.supplier} />
          <Metric label="Critério" value={criteria} />
        </section>

        <main className="grid gap-5 xl:grid-cols-[1fr_390px]">
          <section className="space-y-5">
            <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
              <div className="mb-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Fornecedores</p>
                <h2 className="mt-1 text-xl font-semibold text-slate-950">Cotações recebidas</h2>
              </div>

              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {quotations.map((quote) => (
                  <QuotationCard key={quote.id} quote={quote} criteria={criteria} selected={selectedQuote.id === quote.id} onSelect={setSelectedQuote} />
                ))}
              </div>
            </section>

            <SupplierComparison quotes={quotations} criteria={criteria} />

            <div className="grid gap-5 xl:grid-cols-2">
              <QuoteRanking quotes={quotations} criteria={criteria} />
              <LeadTimeComparison quotes={quotations} />
            </div>

            <PriceHistory />
          </section>

          <aside className="space-y-5">
            <QuotationInspector quote={selectedQuote} criteria={criteria} />
            <AIQuoteAnalyzer />
            <NegotiationPanel quote={selectedQuote} />
          </aside>
        </main>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}
