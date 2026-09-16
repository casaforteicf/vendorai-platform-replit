import React from "react";
import type { SpecObject } from "./specCatalogTypes";
import type { FinancialImpact } from "./specCatalogApi";
import { money, statusClass, statusLabel } from "./specCatalogUtils";

export function BudgetBridgePanel({
  items,
  onSend,
  sending,
  financialImpact,
  onDismissImpact,
}: {
  items: SpecObject[];
  onSend: (item: SpecObject) => void;
  sending?: boolean;
  financialImpact?: FinancialImpact | null;
  onDismissImpact?: () => void;
}) {
  const ready = items.filter((item) => ["specified", "priced", "approved"].includes(item.status));

  return (
    <section className="rounded-[34px] border border-[var(--arq-border)] bg-[var(--arq-card)] p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-accent)]">Orçamento</p>
      <h2 className="mt-1 text-xl font-semibold text-[var(--arq-foreground)]">Itens prontos para orçamento</h2>

      {financialImpact ? (
        <div className="mt-4 rounded-[24px] border border-amber-200 bg-amber-50 p-4 text-amber-950">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm font-semibold">Revisão financeira criada — proposta anterior preservada</p>
              <p className="mt-1 text-xs leading-5 text-amber-800">
                A alteração não mudou o orçamento/proposta que já existia. Um novo orçamento em revisão recebeu o ajuste.
                {financialImpact.proposalStatus ? ` Proposta anterior: ${financialImpact.proposalStatus}.` : ""}
              </p>
            </div>
            {onDismissImpact ? (
              <button type="button" onClick={onDismissImpact} className="rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-800">
                Fechar
              </button>
            ) : null}
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <div className="rounded-2xl bg-white/80 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">Valor anterior</p>
              <p className="mt-1 text-base font-semibold">{money(financialImpact.previousItemTotal)}</p>
            </div>
            <div className="rounded-2xl bg-white/80 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">Valor revisado</p>
              <p className="mt-1 text-base font-semibold">{money(financialImpact.revisedItemTotal)}</p>
            </div>
            <div className="rounded-2xl bg-white/80 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">Impacto</p>
              <p className={`mt-1 text-base font-semibold ${financialImpact.delta > 0 ? "text-rose-700" : financialImpact.delta < 0 ? "text-emerald-700" : "text-slate-700"}`}>
                {financialImpact.delta > 0 ? "+" : ""}{money(financialImpact.delta)}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-5 space-y-3">
        {ready.map((item) => (
          <article key={item.id} className="rounded-[26px] border border-[var(--arq-border)] bg-[var(--arq-card)] p-4 shadow-sm">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="text-sm font-semibold text-[var(--arq-foreground)]">{item.name}</p>
                <p className="mt-1 text-xs text-[var(--arq-muted)]">
                  {item.quantity} {item.unit} • material {money(item.materialValue)} • mão de obra {money(item.laborValue)}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(item.status)}`}>
                  {statusLabel(item.status)}
                </span>
                <button
                  type="button"
                  disabled={sending}
                  onClick={() => onSend(item)}
                  className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                >
                  Enviar
                </button>
              </div>
            </div>
          </article>
        ))}

        {!ready.length ? (
          <div className="rounded-[26px] border border-dashed border-[var(--arq-border)] bg-[var(--arq-card-soft)] p-6 text-center text-sm text-[var(--arq-muted)]">
            Nenhum item pronto. Especifique produto/material e valores antes de enviar ao orçamento.
          </div>
        ) : null}
      </div>
    </section>
  );
}
