import type { ArqdorLocalDraft } from "./arqdorLocalDrafts";
import { evaluateArqdorDraftSync, type AuthorizedRemoteProject } from "./arqdorDraftReconciliation";

/**
 * MULTI-04.3: explicit, single-project conditional draft upload.
 * Never runs automatically. Caller MUST confirm identity, project membership,
 * and explicit user approval before invoking. Server must reauthorize edits.
 */
export type ConditionalUploadResult =
  | { status: "saved"; revision: string }
  | { status: "conflict"; detail: string }
  | { status: "denied"; detail: string }
  | { status: "failed"; detail: string };

export async function uploadArqdorDraftConditionally(
  draft: ArqdorLocalDraft,
  remote: AuthorizedRemoteProject,
  token: string,
  signal?: AbortSignal,
): Promise<ConditionalUploadResult> {
  if (!token?.trim()) return { status: "denied", detail: "Sessão inválida." };
  const assessment = evaluateArqdorDraftSync(draft, remote);
  if (assessment.status === "denied") return { status: "denied", detail: assessment.reason };
  if (assessment.status === "conflict") return { status: "conflict", detail: "Revisão diferente; preserve o rascunho." };
  if (!draft.payload || typeof draft.payload !== "object" || Array.isArray(draft.payload) ||
      (draft.payload as { id?: unknown }).id !== draft.projectId) {
    return { status: "denied", detail: "Conteúdo do projeto inválido." };
  }
  try {
    const response = await fetch(`/api/arqdor/projects/${encodeURIComponent(draft.projectId)}/conditional`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ expectedRevision: assessment.expectedRevision, contextBlob: draft.payload }),
      cache: "no-store",
      signal,
    });
    if (response.status === 409) return { status: "conflict", detail: "O projeto mudou no servidor. Rascunho preservado." };
    if (response.status === 401 || response.status === 403) return { status: "denied", detail: "Sem permissão de gravação." };
    if (!response.ok) return { status: "failed", detail: `Erro HTTP ${response.status}; rascunho preservado.` };
    const saved = await response.json() as { revision?: unknown; id?: unknown };
    if (saved.id !== draft.projectId || typeof saved.revision !== "string") {
      return { status: "failed", detail: "Resposta de confirmação inválida; confira o servidor antes de reenviar." };
    }
    // Never remove draft here: caller must confirm remote content and resolve session lifecycle.
    return { status: "saved", revision: saved.revision };
  } catch {
    return { status: "failed", detail: "Conexão interrompida; não foi possível confirmar a gravação. Rascunho preservado." };
  }
}
