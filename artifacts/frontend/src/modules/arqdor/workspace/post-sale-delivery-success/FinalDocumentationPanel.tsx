import React, { useState } from "react";
import type { DeliveryProject, DocumentType, FinalDocument } from "./postSaleTypes";
import { documentTypeLabel } from "./postSaleUtils";

export function FinalDocumentationPanel({
  delivery,
  documents,
  saving,
  onAdd,
}: {
  delivery?: DeliveryProject | null;
  documents: FinalDocument[];
  saving?: boolean;
  onAdd: (payload: any) => Promise<unknown>;
}) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<DocumentType>("photo");
  const [fileUrl, setFileUrl] = useState("");
  const [visibleToClient, setVisibleToClient] = useState(true);

  function add() {
    if (!delivery || !title.trim()) return;

    void onAdd({
      deliveryId: delivery.id,
      projectId: delivery.projectId,
      type,
      title,
      fileUrl,
      visibleToClient,
    });

    setTitle("");
    setFileUrl("");
  }

  return (
    <section className="rounded-[34px] border border-[var(--arq-border)] bg-[var(--arq-card)] p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-accent)]">Documentação</p>
      <h2 className="mt-1 text-xl font-semibold text-[var(--arq-foreground)]">Fotos finais, garantias e manuais</h2>

      <div className="mt-5 grid gap-3 md:grid-cols-[180px_1fr_1fr_auto]">
        <select
          value={type}
          onChange={(event) => setType(event.target.value as DocumentType)}
          className="rounded-2xl border border-[var(--arq-border)] bg-[var(--arq-card)] px-4 py-3 text-sm outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
        >
          <option value="photo">Foto</option>
          <option value="video">Vídeo</option>
          <option value="manual">Manual</option>
          <option value="warranty">Garantia</option>
          <option value="invoice">Nota fiscal</option>
          <option value="as-built">As built</option>
          <option value="delivery-term">Termo de entrega</option>
          <option value="other">Outro</option>
        </select>

        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Título do documento"
          className="rounded-2xl border border-[var(--arq-border)] bg-[var(--arq-card)] px-4 py-3 text-sm outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
        />

        <input
          value={fileUrl}
          onChange={(event) => setFileUrl(event.target.value)}
          placeholder="URL do arquivo"
          className="rounded-2xl border border-[var(--arq-border)] bg-[var(--arq-card)] px-4 py-3 text-sm outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
        />

        <button
          type="button"
          disabled={!delivery || saving}
          onClick={add}
          className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          Adicionar
        </button>
      </div>

      <label className="mt-3 flex items-center gap-3 rounded-2xl bg-[var(--arq-card-soft)] px-4 py-3 text-sm font-medium text-[var(--arq-foreground)]">
        <input
          type="checkbox"
          checked={visibleToClient}
          onChange={(event) => setVisibleToClient(event.target.checked)}
        />
        Visível para o cliente
      </label>

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {documents.map((doc) => (
          <article key={doc.id} className="rounded-[26px] border border-[var(--arq-border)] bg-[var(--arq-card)] p-4 shadow-sm">
            <div className="aspect-[4/3] overflow-hidden rounded-2xl bg-slate-100">
              {doc.thumbnailUrl || doc.fileUrl ? (
                <img src={doc.thumbnailUrl || doc.fileUrl || ""} alt={doc.title} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-[var(--arq-muted)]">{documentTypeLabel(doc.type)}</div>
              )}
            </div>
            <p className="mt-3 text-sm font-semibold text-[var(--arq-foreground)]">{doc.title}</p>
            <p className="mt-1 text-xs text-[var(--arq-muted)]">
              {documentTypeLabel(doc.type)} • {doc.visibleToClient ? "cliente" : "interno"}
            </p>
          </article>
        ))}

        {!documents.length ? (
          <div className="rounded-[26px] border border-dashed border-[var(--arq-border)] bg-[var(--arq-card-soft)] p-8 text-center text-sm text-[var(--arq-muted)]">
            Nenhum documento final adicionado.
          </div>
        ) : null}
      </div>
    </section>
  );
}
