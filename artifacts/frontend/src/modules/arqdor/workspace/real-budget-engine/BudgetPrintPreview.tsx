import React from "react";
import type { Budget, BudgetItem, BudgetTotals, BudgetViewMode } from "./budgetTypes";
import { money, statusLabel } from "./budgetUtils";

export function BudgetPrintPreview({
  budget,
  items,
  totals,
  viewMode,
  projectTitle,
}: {
  budget?: Budget | null;
  items: BudgetItem[];
  totals: BudgetTotals;
  viewMode: BudgetViewMode;
  projectTitle: string;
}) {
  const visibleItems = viewMode === "client" ? items.filter((item) => item.visibleToClient) : items;

  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between print:hidden">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Impressão</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-950">Preview com itens e atividades visíveis</h2>
        </div>

        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Imprimir / salvar PDF
        </button>
      </div>

      <div className="budget-print mt-5 rounded-3xl border border-slate-200 bg-white p-8 print:mt-0 print:border-0 print:p-0">
        <div className="flex items-start justify-between gap-6 border-b border-slate-200 pb-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">ARQDOR.ai</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-950">{budget?.title || "Orçamento"}</h1>
            <p className="mt-1 text-sm text-slate-500">{projectTitle}</p>
            <p className="mt-1 text-sm text-slate-500">Cliente: {budget?.clientName || "-"}</p>
          </div>

          <div className="text-right text-sm text-slate-500">
            <p>Status: {budget?.status ? statusLabel(budget.status) : "Rascunho"}</p>
            <p>Versão: {budget?.version || 1}</p>
            <p>Data: {new Date().toLocaleDateString("pt-BR")}</p>
            <p>Modo: {viewMode === "client" ? "Cliente" : "Interno"}</p>
          </div>
        </div>

        <table className="mt-6 w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-300 text-xs uppercase tracking-wide text-slate-500">
              <th className="py-3 pr-3">Item</th>
              <th className="py-3 pr-3 text-right">Qtd.</th>
              <th className="py-3 pr-3">Un.</th>
              <th className="py-3 pr-3 text-right">Valor Material</th>
              <th className="py-3 pr-3 text-right">Valor Mão de Obra</th>
              <th className="py-3 pr-3 text-right">Total</th>
            </tr>
          </thead>

          <tbody>
            {visibleItems.map((item) => (
              <tr key={item.id} className="border-b border-slate-100 break-inside-avoid">
                <td className="py-4 pr-3 align-top">
                  <p className="font-medium text-slate-900">{item.item}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    {item.description || item.productName || item.materialName || ""}
                  </p>
                  {viewMode === "internal" ? (
                    <p className="mt-1 text-xs leading-5 text-slate-400">
                      {item.supplierName || item.manufacturerName || ""}
                    </p>
                  ) : null}
                </td>
                <td className="py-4 pr-3 text-right align-top text-slate-700">{item.quantity}</td>
                <td className="py-4 pr-3 align-top text-slate-700">{item.unit}</td>
                <td className="py-4 pr-3 text-right align-top text-slate-700">{money(item.materialValue)}</td>
                <td className="py-4 pr-3 text-right align-top text-slate-700">{money(item.laborValue)}</td>
                <td className="py-4 pr-3 text-right align-top font-semibold text-slate-950">{money(item.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="ml-auto mt-8 w-full max-w-md space-y-3">
          <Line label="Total material" value={money(totals.subtotalMaterial)} />
          <Line label="Total mão de obra" value={money(totals.subtotalLabor)} />
          <Line label="Subtotal" value={money(totals.subtotal)} />
          <Line label="Desconto" value={`- ${money(totals.discountTotal)}`} />
          <div className="flex items-center justify-between border-t border-slate-300 pt-4 text-lg font-semibold text-slate-950">
            <span>Total geral</span>
            <span>{money(totals.grandTotal)}</span>
          </div>
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Observações para cliente</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{budget?.clientNotes || "-"}</p>
          </div>

          {viewMode === "internal" ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Observações internas</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{budget?.internalNotes || "-"}</p>
            </div>
          ) : null}
        </div>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          .budget-print, .budget-print * { visibility: visible; }
          .budget-print { position: absolute; left: 0; top: 0; width: 100%; }
          .print\\:hidden { display: none !important; }
          @page { margin: 14mm; }
        }
      `}</style>
    </section>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm text-slate-700">
      <span>{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
