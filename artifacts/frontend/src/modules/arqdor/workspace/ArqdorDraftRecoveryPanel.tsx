import { useState } from "react";
import type { ProjectContext } from "../engines/aie/aie-types";
import { useAuth } from "../../../contexts/AuthContext";
import { useWorkspaceProject } from "./WorkspaceContext";
import { reviewEncryptedRecovery } from "../../../lib/arqdorEncryptedRecovery";

/** MULTI-09.5 — explicit read-only recovery preview. Never uploads or applies a draft. */
export function ArqdorDraftRecoveryPanel() {
  const { user, token } = useAuth();
  const { projectCtx, unlockDraftSaving, applyRecoveredDraft } = useWorkspaceProject();
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [candidate, setCandidate] = useState<{ context: ProjectContext; projectId: string; revision: string } | null>(null);
  const [message, setMessage] = useState("");
  const [summary, setSummary] = useState<{ savedAt: string; revision: string; status: string } | null>(null);
  const enabled = import.meta.env.VITE_MULTI09_RECOVERY_REVIEW === "true" &&
    import.meta.env.VITE_MULTI08_PROJECT_ACL === "true";
  if (!enabled || !projectCtx.id) return null;
  const review = async () => {
    setBusy(true);
    setSummary(null);
    setCandidate(null);
    setMessage("");
    try {
      if (!user?.id || !user.tenantId || !token) throw new Error("Sessão indisponível.");
      const id = projectCtx.id;
      const headers = { Authorization: `Bearer ${token}` };
      const [snap, access] = await Promise.all([
        fetch(`/api/arqdor/projects/${encodeURIComponent(id)}/snapshot`, { headers, cache: "no-store" }),
        fetch(`/api/arqdor/projects/${encodeURIComponent(id)}/edit-access`, { headers, cache: "no-store" }),
      ]);
      if (!snap.ok || !access.ok) throw new Error("A autorização atual do projeto não foi confirmada.");
      const snapshot = await snap.json() as { id?: string; revision?: string };
      const authorization = await access.json() as { projectId?: string; canEdit?: boolean };
      if (snapshot.id !== id || typeof snapshot.revision !== "string" ||
          authorization.projectId !== id || authorization.canEdit !== true)
        throw new Error("Você não possui autorização de edição confirmada.");
      const result = await reviewEncryptedRecovery(
        { userId:user.id, tenantId:user.tenantId, projectId:id, contextId:"arqdor-workspace" },
        { userId:user.id, tenantId:user.tenantId, projectId:id, contextId:"arqdor-workspace",
          revision:snapshot.revision, canEdit:true }, phrase,
      );
      if (result.status === "missing") {
        unlockDraftSaving(phrase);
        setMessage("Nenhum rascunho existente. Cofre desbloqueado para novos salvamentos criptografados nesta sessão.");
      }
      else if (result.status === "denied") setMessage("Recuperação negada: identidade ou revisão inválida.");
      else {
        if (result.decision.status === "ready" && result.draft.content &&
            typeof result.draft.content === "object" &&
            (result.draft.content as ProjectContext).id === id) {
          setCandidate({ context: result.draft.content as ProjectContext, projectId: id,
            revision: snapshot.revision });
          unlockDraftSaving(phrase);
        }
        setSummary({ savedAt:result.draft.savedAt, revision:result.draft.change.baseRevision,
          status:result.decision.status });
        setMessage(result.decision.status === "conflict" ?
          "A versão do servidor mudou. Não restaure sem comparar as alterações." :
          "Revisão compatível. Esta visualização não altera o projeto.");
      }
    } catch {
      setMessage("Não foi possível desbloquear ou autorizar o rascunho. Nenhum dado foi alterado.");
    } finally {
      setPhrase("");
      setBusy(false);
    }
  };
  const restore = async () => {
    if (!candidate || busy || !token || !projectCtx.id || projectCtx.id !== candidate.projectId) return;
    setBusy(true);
    try {
      const id = candidate.projectId;
      const headers = { Authorization: `Bearer ${token}` };
      const [snap, access] = await Promise.all([
        fetch(`/api/arqdor/projects/${encodeURIComponent(id)}/snapshot`, { headers, cache:"no-store" }),
        fetch(`/api/arqdor/projects/${encodeURIComponent(id)}/edit-access`, { headers, cache:"no-store" }),
      ]);
      if (!snap.ok || !access.ok) throw new Error("Acesso não confirmado");
      const snapshot = await snap.json() as { id?: string; revision?: string };
      const permission = await access.json() as { projectId?: string; canEdit?: boolean };
      if (snapshot.id !== id || snapshot.revision !== candidate.revision ||
          permission.projectId !== id || permission.canEdit !== true) throw new Error("Revisão alterada");
      if (!window.confirm("Aplicar o rascunho neste editor e tentar salvá-lo? Esta ação não substitui o backup criptografado.")) return;
      applyRecoveredDraft(candidate.context);
      setCandidate(null);
      setMessage("Recuperação solicitada. Confira o indicador de salvamento antes de fechar.");
    } catch {
      setCandidate(null);
      setMessage("A autorização ou revisão mudou. Consulte novamente antes de recuperar.");
    } finally { setBusy(false); }
  };
  return <section aria-label="Recuperação de rascunho" style={{padding:12,border:"1px solid #555",borderRadius:8}}>
    <strong>Rascunho criptografado — prévia segura</strong>
    <p>Confira sua cópia local sem substituir o projeto salvo.</p>
    <input type="password" autoComplete="off" value={phrase}
      onChange={event => setPhrase(event.target.value)} placeholder="Frase de recuperação"
      aria-label="Frase de recuperação" />
    <button type="button" disabled={busy || phrase.length < 12} onClick={() => void review()}>
      {busy ? "Verificando…" : "Consultar rascunho"}
    </button>
    {message && <p role="status">{message}</p>}
    {summary && <p>Salvo em: {summary.savedAt} · Revisão local: {summary.revision} · Estado: {summary.status}</p>}
    {candidate && <button type="button" disabled={busy} onClick={() => void restore()}>Confirmar recuperação compatível</button>}
  </section>;
}
