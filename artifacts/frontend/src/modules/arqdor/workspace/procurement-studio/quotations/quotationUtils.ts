import type { Quotation, QuoteCriteria, QuoteStatus } from "./quotationTypes";

export function currency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function statusClass(status: QuoteStatus) {
  const classes: Record<QuoteStatus, string> = {
    draft: "bg-slate-100 text-slate-700",
    sent: "bg-blue-50 text-blue-700",
    received: "bg-violet-50 text-violet-700",
    negotiation: "bg-amber-50 text-amber-700",
    approved: "bg-emerald-50 text-emerald-700",
    rejected: "bg-rose-50 text-rose-700",
  };
  return classes[status];
}

export function quoteScore(quote: Quotation, criteria: QuoteCriteria): number {
  const priceScore = Math.max(0, 100 - quote.price / 120);
  const deadlineScore = Math.max(0, 100 - quote.leadTimeDays * 2);
  const supplierScore = quote.score;

  if (criteria === "price") return Math.round(priceScore);
  if (criteria === "deadline") return Math.round(deadlineScore);
  if (criteria === "score") return Math.round(supplierScore);

  return Math.round(priceScore * 0.4 + deadlineScore * 0.25 + supplierScore * 0.35);
}

export function bestQuote(quotes: Quotation[], criteria: QuoteCriteria): Quotation {
  return [...quotes].sort((a, b) => quoteScore(b, criteria) - quoteScore(a, criteria))[0];
}
