import { useState, type ChangeEvent } from "react";
import { exportArqdorRecovery, importArqdorRecovery, type ArqdorRecoveryEnvelope } from "@/lib/arqdorRecoveryPackage";
import type { DraftScope, LocalDraft } from "@/lib/arqdorEncryptedDraft";

/**
 * Standalone recovery UI for a fully authenticated Arqdor project.
 * The editor must provide server-verified scope + snapshot and explicitly
 * review restored draft before committing it. This component NEVER mutates
 * project state or sends a request. No guest/anonymous use.
 */
export function ArqdorRecoveryPanel(props: {
  authorizedScope: DraftScope;
  currentDraft: LocalDraft;
  onReviewRestore: (draft: LocalDraft) => void;
}) {
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [restored, setRestored] = useState<LocalDraft | null>(null);
  const [exported, setExported] = useState(false);
  async function exportBackup() {
    setBusy(true); setMessage(""); setExported(false);
    try {
      const envelope = await exportArqdorRecovery(props.currentDraft, props.authorizedScope, passphrase);
      const url = URL.createObjectURL(new Blob([JSON.stringify(envelope)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "arqdor-recuperacao.v1.json";
      link.click();
      // Defer revocation until after browser has processed anchor download.
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setExported(true);
      setMessage("Arquivo preparado. Guarde-o em local seguro junto da senha; a senha não fica salva aqui.");
    } catch {
      setMessage("Não foi possível exportar. Verifique a senha (mínimo de 12 caracteres) e a autorização.");
    } finally { setBusy(false); }
  }
  async function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setRestored(null); setMessage("");
    if (file.size > 20 * 1024 * 1024) {
      setMessage("Arquivo excede o limite de 20 MB para este modo de recuperação."); return;
    }
    setBusy(true);
    try {
      const payload = JSON.parse(await file.text()) as ArqdorRecoveryEnvelope;
      const draft = await importArqdorRecovery(payload, props.authorizedScope, passphrase);
      setRestored(draft);
      setMessage("Arquivo descriptografado. Confira o projeto antes de aplicar; nenhuma alteração foi restaurada ainda.");
    } catch {
      setMessage("Recuperação recusada: senha, arquivo, autorização ou projeto não correspondem.");
    } finally { setBusy(false); }
  }
  return (
    <section aria-label="Recuperação segura do projeto" className="rounded-xl border p-4 space-y-3">
      <h2 className="font-semibold">Cópia de recuperação do projeto</h2>
      <p className="text-sm text-muted-foreground">
        Exporte uma cópia cifrada ou abra um arquivo de recuperação. Nunca substituímos o projeto automaticamente.
      </p>
      <label className="block text-sm">
        Senha de recuperação (mínimo 12 caracteres)
        <input className="mt-1 w-full rounded-md border bg-background p-2" type="password"
          autoComplete="new-password" minLength={12} value={passphrase}
          onChange={event => { setPassphrase(event.target.value); setRestored(null); }} />
      </label>
      <div className="flex flex-wrap gap-2">
        <button className="rounded-md border px-3 py-2 disabled:opacity-50" type="button"
          disabled={busy || passphrase.length < 12} onClick={() => void exportBackup()}>
          Exportar cópia criptografada
        </button>
        <label className="rounded-md border px-3 py-2">
          Escolher arquivo de recuperação
          <input className="sr-only" type="file" accept=".json,application/json"
            disabled={busy || passphrase.length < 12} onChange={event => void importBackup(event)} />
        </label>
      </div>
      {restored && <div className="space-y-2 rounded-lg border p-3">
        <p className="text-sm">Rascunho encontrado. Revisão de origem: {restored.change.baseRevision}.</p>
        <button type="button" className="rounded-md border px-3 py-2"
          onClick={() => { props.onReviewRestore(restored); setRestored(null); }}>
          Enviar para revisão de conflitos
        </button>
      </div>}
      {message && <p role="status" className="text-sm">{message}</p>}
      {exported && <p className="text-xs text-muted-foreground">Guarde também a senha de recuperação fora do sistema.</p>}
    </section>
  );
}
