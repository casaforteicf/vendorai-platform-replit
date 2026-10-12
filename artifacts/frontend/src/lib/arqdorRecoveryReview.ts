import { evaluateOfflineUpload, type ProjectContinuity } from "./projectContinuity";
import type { DraftScope, LocalDraft } from "./arqdorEncryptedDraft";

/** MULTI-03.5: read-only recovery decision. A successful evaluation is NOT authorization to write. */
export type RecoveryDecision =
  | { status: "denied"; reason: string }
  | { status: "conflict"; reason: string; localRevision: string; remoteRevision: string }
  | { status: "review"; operationId: string; revision: string };

export function evaluateRecoveryForReview(
  draft: LocalDraft,
  authorized: DraftScope,
  remote: ProjectContinuity,
): RecoveryDecision {
  if (!draft?.scope || !draft?.change || !remote ||
      Object.values(authorized).some(v => !v) ||
      Object.keys(authorized).some(k => draft.scope[k as keyof DraftScope] !== authorized[k as keyof DraftScope]) ||
      remote.projectId !== authorized.projectId || remote.contextId !== authorized.contextId ||
      draft.change.projectId !== authorized.projectId) {
    return { status: "denied", reason: "Escopo do projeto ou sessão não corresponde." };
  }
  const result = evaluateOfflineUpload(draft.change, remote);
  if (result === "denied") return { status: "denied", reason: "Operação local inválida." };
  if (result === "conflict") {
    return { status: "conflict", reason: "A versão remota mudou. É necessária reconciliação manual.",
      localRevision: draft.change.baseRevision, remoteRevision: remote.revision };
  }
  return { status: "review", operationId: draft.change.operationId, revision: remote.revision };
}
