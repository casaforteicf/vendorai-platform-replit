import { useMemo, useState, type ChangeEvent } from "react";
import type { DraftScope, LocalDraft } from "@/lib/arqdorEncryptedDraft";
import { verifyConflictRecoveryFile } from "@/lib/arqdorVerifiedConflictFile";
import { compareArqdorSnapshots } from "@/lib/arqdorConflictCompare";
import { backupReceiptMatches, type ConflictBackupIdentity, type VerifiedConflictBackupReceipt } from "@/lib/arqdorConflictBackupGate";

/** Review-only; intentionally offers no 'force overwrite' operation. */
export function ArqdorConflictReview(props: {
  localRevision: string;
  remoteRevision: string;
  localSnapshot: unknown;
  remoteSnapshot: unknown;
  backupIdentity: ConflictBackupIdentity;
  localDraft: LocalDraft;
  authorizedScope: DraftScope;
  onKeepLocalCopy: () => void;
  onUseRemoteAfterBackup: () => void;
  onCancel: () => void;
}) {
  const [receipt, setReceipt] = useState<VerifiedConflictBackupReceipt | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [backupError, setBackupError] = useState("");
  const verified = backupReceiptMatches(props.backupIdentity, receipt);
  async function verifyBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    setReceipt(null);
    if (!file) return;
    setVerifying(true); setBackupError("");
    try {
      const result = await verifyConflictRecoveryFile({
        file, draft: props.localDraft, authorizedScope: props.authorizedScope,
        identity: props.backupIdentity, passphrase,
      });
      if (!backupReceiptMatches(props.backupIdentity, result)) throw new Error("BACKUP_RECEIPT_MISMATCH");
      setReceipt(result);
    } catch {
      setBackupError("Arquivo não verificado: a cópia não corresponde ao rascunho atual, à revisão ou à senha.");
    } finally { setVerifying(false); }
  }
  const differences = useMemo(
    () => compareArqdorSnapshots(props.localSnapshot, props.remoteSnapshot),
    [props.localSnapshot, props.remoteSnapshot],
  );
  return (
    <section aria-label="Revisão de conflito do projeto" className="rounded-xl border p-4 space-y-3">
      <h2 className="font-semibold">Existem alterações em duas versões do projeto</h2>
      <p className="text-sm">Rascunho local: {props.localRevision} · Versão do servidor: {props.remoteRevision}</p>
      <p className="text-sm">Nenhuma versão será substituída automaticamente.</p>
      <ul className="max-h-72 overflow-auto space-y-1 text-sm" aria-label="Campos diferentes">
        {differences.map((difference, i) => (
          <li key={i} className="rounded border p-2">
            <strong>{difference.path}</strong> — {difference.kind === "changed" ? "modificado" : difference.kind === "added" ? "presente apenas localmente" : "presente apenas no servidor"}
          </li>
        ))}
      </ul>
      {differences.length >= 200 && <p role="alert" className="text-sm">Comparação limitada aos primeiros 200 campos. Exporte cópia antes de continuar.</p>}
      <div className="space-y-2">
        <label className="block text-sm">Senha do arquivo de recuperação
          <input type="password" autoComplete="off" value={passphrase} className="block rounded border p-2"
            onChange={event => { setPassphrase(event.target.value); setReceipt(null); }} />
        </label>
        <label className="inline-block rounded border px-3 py-2 text-sm">
          Selecionar cópia criptografada salva e verificar
          <input type="file" accept=".json,application/json" className="sr-only"
            disabled={verifying || passphrase.length < 12} onChange={event => void verifyBackup(event)} />
        </label>
        {verified && <p role="status" className="text-sm">Arquivo selecionado descriptografado e comparado com o rascunho atual.</p>}
        {backupError && <p role="alert" className="text-sm">{backupError}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="rounded border px-3 py-2" onClick={props.onKeepLocalCopy}>Manter cópia local para revisão</button>
        <button type="button" className="rounded border px-3 py-2 disabled:opacity-50" disabled={!verified || verifying} onClick={() => {
          if (backupReceiptMatches(props.backupIdentity, receipt)) props.onUseRemoteAfterBackup();
        }}>Continuar com versão do servidor após backup</button>
        <button type="button" className="rounded border px-3 py-2" onClick={props.onCancel}>Cancelar</button>
      </div>
    </section>
  );
}
