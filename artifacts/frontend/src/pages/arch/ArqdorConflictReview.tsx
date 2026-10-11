import { useMemo, useState } from "react";
import { compareArqdorSnapshots } from "@/lib/arqdorConflictCompare";

/** Review-only; intentionally offers no 'force overwrite' operation. */
export function ArqdorConflictReview(props: {
  localRevision: string;
  remoteRevision: string;
  localSnapshot: unknown;
  remoteSnapshot: unknown;
  onKeepLocalCopy: () => void;
  onUseRemoteAfterBackup: () => void;
  onCancel: () => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
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
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} />
        Entendo que devo guardar uma cópia das minhas alterações antes de trocar de versão.
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="rounded border px-3 py-2" onClick={props.onKeepLocalCopy}>Manter cópia local para revisão</button>
        <button type="button" className="rounded border px-3 py-2 disabled:opacity-50" disabled={!acknowledged} onClick={props.onUseRemoteAfterBackup}>Continuar com versão do servidor após backup</button>
        <button type="button" className="rounded border px-3 py-2" onClick={props.onCancel}>Cancelar</button>
      </div>
    </section>
  );
}
