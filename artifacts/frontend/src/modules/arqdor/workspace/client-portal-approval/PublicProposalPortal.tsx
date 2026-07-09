import React, { useState } from "react";
import { usePublicProposalPortal } from "./usePublicProposalPortal";
import { approvalStatusClass, approvalStatusLabel, money, proposalStatusClass, proposalStatusLabel } from "./portalUtils";

type PublicProposalPortalProps = {
  token: string;
};

export default function PublicProposalPortal({ token }: PublicProposalPortalProps) {
  const {
    proposal,
    items,
    loading,
    submitting,
    error,
    decideProposal,
    decideItem,
  } = usePublicProposalPortal(token);

  const [clientName, setClientName] = useState("");
  const [comment, setComment] = useState("");

  if (loading) {
    return <div className="min-h-screen bg-slate-50 p-8 text-slate-600">Carregando proposta...</div>;
  }

  if (error) {
    return <div className="min-h-screen bg-rose-50 p-8 text-rose-700">{error}</div>;
  }

  if (!proposal) {
    return <div className="min-h-screen bg-slate-50 p-8 text-slate-600">Proposta não encontrada.</div>;
  }

  return (
    <main className="min-h-screen bg-[#f7f7f8] px-4 py-6 text-slate-950">
      <div className="mx-auto max-w-5xl rounded-[34px] border border-slate-100 bg-white p-6 shadow-sm">
        <header className="rounded-[28px] bg-slate-950 p-6 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-300">ARQDOR.ai</p>
          <h1 className="mt-2 text-3xl font-semibold">{proposal.title}</h1>
          <p className="mt-1 text-sm text-slate-300">Cliente: {proposal.clientName || "Cliente"}</p>
          <span className={`mt-4 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${proposalStatusClass(proposal.status)}`}>
            {proposalStatusLabel(proposal.status)}
          </span>
        </header>

        <section className="mt-6 space-y-3">
          {items.filter((item) => item.visibleToClient).map((item) => (
            <article key={item.id} className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-base font-semibold text-slate-950">{item.item}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-500">{item.description || ""}</p>
                  <p className="mt-1 text-xs text-slate-500">{item.quantity} {item.unit}</p>
                </div>

                <div className="md:text-right">
                  <p className="text-lg font-semibold text-slate-950">{money(item.total)}</p>
                  <span className={`mt-1 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${approvalStatusClass(item.approvalStatus)}`}>
                    {approvalStatusLabel(item.approvalStatus)}
                  </span>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void decideItem(item.id, "approve")}
                  className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  Aprovar item
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void decideItem(item.id, "reject", "Item reprovado pelo cliente.")}
                  className="rounded-full bg-rose-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  Reprovar item
                </button>
              </div>

              {item.clientComment ? (
                <p className="mt-3 rounded-2xl bg-white p-3 text-sm text-slate-600">Comentário: {item.clientComment}</p>
              ) : null}
            </article>
          ))}
        </section>

        <section className="ml-auto mt-8 max-w-md space-y-3">
          <Line label="Subtotal" value={money(proposal.subtotal)} />
          <Line label="Desconto" value={`- ${money(proposal.discountTotal)}`} />
          <div className="flex justify-between border-t border-slate-300 pt-4 text-xl font-semibold text-slate-950">
            <span>Total geral</span>
            <span>{money(proposal.grandTotal)}</span>
          </div>
        </section>

        <section className="mt-8 rounded-3xl bg-slate-50 p-5">
          <p className="text-sm font-semibold text-slate-950">Decisão final</p>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <input
              value={clientName}
              onChange={(event) => setClientName(event.target.value)}
              placeholder="Seu nome"
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
            />
            <input
              value={proposal.clientName || ""}
              readOnly
              className="rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm text-slate-500"
            />
          </div>

          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Comentário geral..."
            rows={4}
            className="mt-4 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
          />

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <button
              type="button"
              disabled={submitting}
              onClick={() => void decideProposal("approve", comment, clientName)}
              className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              Aprovar proposta
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => void decideProposal("revision", comment, clientName)}
              className="rounded-2xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              Solicitar revisão
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => void decideProposal("reject", comment, clientName)}
              className="rounded-2xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              Reprovar proposta
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm text-slate-600">
      <span>{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
