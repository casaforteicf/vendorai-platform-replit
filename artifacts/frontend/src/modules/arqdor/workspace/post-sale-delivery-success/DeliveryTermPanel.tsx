import React, { useMemo, useState } from "react";
import type { DeliveryProject, DeliveryTerm } from "./postSaleTypes";
import { dateShort } from "./postSaleUtils";

export function DeliveryTermPanel({
  delivery,
  terms,
  saving,
  projectTitle,
  onGenerate,
  onAccept,
}: {
  delivery?: DeliveryProject | null;
  terms: DeliveryTerm[];
  saving?: boolean;
  projectTitle: string;
  onGenerate: (content: string) => Promise<unknown>;
  onAccept: (term: DeliveryTerm, acceptedBy?: string) => Promise<unknown>;
}) {
  const defaultContent = useMemo(() => {
    return [
      `Termo de entrega referente ao projeto ${projectTitle}.`,
      "",
      "Declaro que recebi a entrega conforme escopo aprovado, com os itens finais conferidos, documentação disponibilizada e eventuais ressalvas registradas no histórico do projeto.",
      "",
      "Este termo não substitui garantias legais, manuais de fornecedores ou condições comerciais previamente acordadas.",
    ].join("\n");
  }, [projectTitle]);

  const [content, setContent] = useState(defaultContent);
  const [acceptedBy, setAcceptedBy] = useState(delivery?.clientName || "");

  return (
    <section className="rounded-[34px] border border-[var(--arq-border)] bg-[var(--arq-card)] p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-accent)]">Termo</p>
      <h2 className="mt-1 text-xl font-semibold text-[var(--arq-foreground)]">Termo de entrega e aceite</h2>

      <label className="mt-5 block">
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-muted)]">Conteúdo</span>
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          rows={8}
          className="mt-2 w-full rounded-2xl border border-[var(--arq-border)] bg-[var(--arq-card)] px-4 py-3 text-sm leading-6 outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
        />
      </label>

      <button
        type="button"
        disabled={!delivery || saving}
        onClick={() => void onGenerate(content)}
        className="mt-4 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
      >
        {saving ? "Gerando..." : "Gerar termo"}
      </button>

      <div className="mt-5 space-y-3">
        {terms.map((term) => (
          <article key={term.id} className="rounded-[26px] border border-[var(--arq-border)] bg-[var(--arq-card-soft)] p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold text-[var(--arq-foreground)]">{term.title}</p>
                <p className="mt-1 text-xs text-[var(--arq-muted)]">
                  {term.accepted ? `Aceito em ${dateShort(term.acceptedAt)}` : "Aguardando aceite"}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <input
                  value={acceptedBy}
                  onChange={(event) => setAcceptedBy(event.target.value)}
                  placeholder="Nome do cliente"
                  className="rounded-2xl border border-[var(--arq-border)] bg-[var(--arq-card)] px-4 py-2 text-sm"
                />
                <button
                  type="button"
                  disabled={term.accepted || saving}
                  onClick={() => void onAccept(term, acceptedBy)}
                  className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Registrar aceite
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
