import React, { useState } from "react";
import type { SatisfactionSurvey } from "./postSaleTypes";
import { dateShort } from "./postSaleUtils";

export function SatisfactionSurveyPanel({
  surveys,
  saving,
  onSend,
}: {
  surveys: SatisfactionSurvey[];
  saving?: boolean;
  onSend: (nps?: number, score?: number, comment?: string) => Promise<unknown>;
}) {
  const [nps, setNps] = useState(10);
  const [score, setScore] = useState(5);
  const [comment, setComment] = useState("Cliente satisfeito com a entrega.");

  return (
    <section className="rounded-[34px] border border-[var(--arq-border)] bg-[var(--arq-card)] p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-accent)]">Satisfação</p>
      <h2 className="mt-1 text-xl font-semibold text-[var(--arq-foreground)]">Pesquisa NPS e feedback</h2>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-muted)]">NPS 0–10</span>
          <input
            type="number"
            min={0}
            max={10}
            value={nps}
            onChange={(event) => setNps(Number(event.target.value))}
            className="mt-2 w-full rounded-2xl border border-[var(--arq-border)] bg-[var(--arq-card)] px-4 py-3 text-sm outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
          />
        </label>

        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-muted)]">Satisfação 1–5</span>
          <input
            type="number"
            min={1}
            max={5}
            value={score}
            onChange={(event) => setScore(Number(event.target.value))}
            className="mt-2 w-full rounded-2xl border border-[var(--arq-border)] bg-[var(--arq-card)] px-4 py-3 text-sm outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
          />
        </label>
      </div>

      <label className="mt-4 block">
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-muted)]">Comentário</span>
        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          rows={4}
          className="mt-2 w-full rounded-2xl border border-[var(--arq-border)] bg-[var(--arq-card)] px-4 py-3 text-sm leading-6 outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
        />
      </label>

      <button
        type="button"
        disabled={saving}
        onClick={() => void onSend(nps, score, comment)}
        className="mt-5 w-full rounded-2xl bg-[var(--arq-accent)] px-5 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
      >
        {saving ? "Salvando..." : "Registrar / enviar pesquisa"}
      </button>

      <div className="mt-5 space-y-3">
        {surveys.map((survey) => (
          <article key={survey.id} className="rounded-[26px] border border-[var(--arq-border)] bg-[var(--arq-card-soft)] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[var(--arq-foreground)]">NPS {survey.nps ?? "-"}</p>
                <p className="mt-1 text-xs text-[var(--arq-muted)]">Satisfação {survey.satisfactionScore ?? "-"} • {survey.status}</p>
              </div>
              <span className="text-xs text-[var(--arq-muted)]">{dateShort(survey.answeredAt || survey.sentAt)}</span>
            </div>
            {survey.comment ? <p className="mt-3 text-sm leading-6 text-[var(--arq-muted)]">{survey.comment}</p> : null}
          </article>
        ))}
      </div>
    </section>
  );
}
