import React, { useState } from "react";
import type { DeliveryProject, FutureOpportunity, OpportunityType } from "./postSaleTypes";
import { money, opportunityStatusClass, opportunityStatusLabel, opportunityTypeLabel } from "./postSaleUtils";

export function FutureOpportunitiesPanel({
  delivery,
  opportunities,
  saving,
  onAdd,
  onUpdate,
}: {
  delivery?: DeliveryProject | null;
  opportunities: FutureOpportunity[];
  saving?: boolean;
  onAdd: (payload: any) => Promise<unknown>;
  onUpdate: (id: string, payload: any) => Promise<unknown>;
}) {
  const [type, setType] = useState<OpportunityType>("new-room");
  const [title, setTitle] = useState("");
  const [estimatedValue, setEstimatedValue] = useState(0);
  const [nextAction, setNextAction] = useState("Entrar em contato em 30 dias.");

  function add() {
    if (!delivery || !title.trim()) return;

    void onAdd({
      deliveryId: delivery.id,
      projectId: delivery.projectId,
      type,
      title,
      estimatedValue,
      nextAction,
      status: "identified",
    });

    setTitle("");
    setEstimatedValue(0);
  }

  return (
    <section className="rounded-[34px] border border-[var(--arq-border)] bg-[var(--arq-card)] p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-accent)]">Oportunidades</p>
      <h2 className="mt-1 text-xl font-semibold text-[var(--arq-foreground)]">Novas vendas, manutenção e indicação</h2>

      <div className="mt-5 grid gap-3 md:grid-cols-[220px_1fr_160px_auto]">
        <select
          value={type}
          onChange={(event) => setType(event.target.value as OpportunityType)}
          className="rounded-2xl border border-[var(--arq-border)] bg-[var(--arq-card)] px-4 py-3 text-sm outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
        >
          <option value="new-room">Novo ambiente</option>
          <option value="maintenance">Manutenção</option>
          <option value="complement">Complemento</option>
          <option value="supplier-upsell">Upsell fornecedor</option>
          <option value="referral">Indicação</option>
          <option value="recurring-service">Serviço recorrente</option>
          <option value="new-project">Novo projeto</option>
        </select>

        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Título da oportunidade"
          className="rounded-2xl border border-[var(--arq-border)] bg-[var(--arq-card)] px-4 py-3 text-sm outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
        />

        <input
          type="number"
          value={estimatedValue}
          onChange={(event) => setEstimatedValue(Number(event.target.value))}
          placeholder="Valor"
          className="rounded-2xl border border-[var(--arq-border)] bg-[var(--arq-card)] px-4 py-3 text-sm outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
        />

        <button
          type="button"
          disabled={!delivery || saving}
          onClick={add}
          className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          Criar
        </button>
      </div>

      <input
        value={nextAction}
        onChange={(event) => setNextAction(event.target.value)}
        placeholder="Próxima ação"
        className="mt-3 w-full rounded-2xl border border-[var(--arq-border)] bg-[var(--arq-card)] px-4 py-3 text-sm outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
      />

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {opportunities.map((opportunity) => (
          <article key={opportunity.id} className="rounded-[28px] border border-[var(--arq-border)] bg-[var(--arq-card)] p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-[var(--arq-foreground)]">{opportunity.title}</p>
                <p className="mt-1 text-xs text-[var(--arq-muted)]">{opportunityTypeLabel(opportunity.type)}</p>
              </div>
              <select
                value={opportunity.status}
                onChange={(event) => void onUpdate(opportunity.id, { status: event.target.value })}
                className={`rounded-full border-0 px-3 py-1 text-xs font-semibold outline-none ${opportunityStatusClass(opportunity.status)}`}
              >
                <option value="identified">Identificada</option>
                <option value="contact-pending">Contato pendente</option>
                <option value="in-nurturing">Nutrição</option>
                <option value="proposal">Proposta</option>
                <option value="won">Ganha</option>
                <option value="lost">Perdida</option>
                <option value="archived">Arquivada</option>
              </select>
            </div>

            <p className="mt-4 text-sm leading-6 text-[var(--arq-muted)]">{opportunity.description || opportunity.nextAction || "-"}</p>
            <p className="mt-4 text-lg font-semibold text-[var(--arq-foreground)]">{money(opportunity.estimatedValue)}</p>
            <p className="mt-1 text-xs text-[var(--arq-muted)]">{opportunityStatusLabel(opportunity.status)}</p>
          </article>
        ))}

        {!opportunities.length ? (
          <div className="rounded-[28px] border border-dashed border-[var(--arq-border)] bg-[var(--arq-card-soft)] p-8 text-center text-sm text-[var(--arq-muted)]">
            Nenhuma oportunidade futura criada.
          </div>
        ) : null}
      </div>
    </section>
  );
}
