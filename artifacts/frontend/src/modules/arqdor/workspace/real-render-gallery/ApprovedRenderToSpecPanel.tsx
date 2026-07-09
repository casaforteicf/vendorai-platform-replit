import React, { useState } from "react";
import type { RenderGalleryItem } from "./renderGalleryTypes";

export function ApprovedRenderToSpecPanel({
  projectId,
  selectedRender,
  approving,
  sendingToSpec,
  onApprove,
  onSendToSpec,
}: {
  projectId: string;
  selectedRender?: RenderGalleryItem | null;
  approving?: boolean;
  sendingToSpec?: boolean;
  onApprove: (notes?: string) => Promise<unknown>;
  onSendToSpec: () => Promise<unknown>;
}) {
  const [notes, setNotes] = useState("Render aprovado para iniciar especificação técnica e comercial.");

  return (
    <section className="rounded-[34px] border border-[var(--arq-border)] bg-[var(--arq-card)] p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-accent)]">Aprovação</p>
      <h2 className="mt-1 text-xl font-semibold text-[var(--arq-foreground)]">Render aprovado → Specification Studio</h2>

      <div className="mt-5 rounded-3xl bg-[var(--arq-card-soft)] p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-muted)]">Render selecionado</p>
        <p className="mt-1 text-sm font-semibold text-[var(--arq-foreground)]">{selectedRender?.title || "Nenhum render selecionado"}</p>
        <p className="mt-1 text-xs text-[var(--arq-muted)]">Projeto: {projectId || "não identificado"}</p>
      </div>

      <label className="mt-4 block">
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-muted)]">Notas de aprovação</span>
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={4}
          className="mt-2 w-full rounded-2xl border border-[var(--arq-border)] bg-[var(--arq-card)] px-4 py-3 text-sm leading-6 outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
        />
      </label>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <button
          type="button"
          disabled={!selectedRender || approving}
          onClick={() => onApprove(notes)}
          className="rounded-2xl bg-[var(--arq-accent)] px-5 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {approving ? "Aprovando..." : "Aprovar render"}
        </button>

        <button
          type="button"
          disabled={!selectedRender || sendingToSpec}
          onClick={onSendToSpec}
          className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sendingToSpec ? "Enviando..." : "Enviar para especificação"}
        </button>
      </div>
    </section>
  );
}
