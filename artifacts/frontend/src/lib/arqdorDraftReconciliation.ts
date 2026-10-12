import type { ArqdorLocalDraft } from "./arqdorLocalDrafts";

/**
 * MULTI-04: pure, read-only reconciliation gate.
 * Does not upload, merge, mutate drafts or grant server authorization.
 * Each comparison must use a fresh authenticated revision from the server.
 */
export type DraftSyncDecision =
  | { status: "ready"; projectId: string; expectedRevision: string }
  | { status: "conflict"; projectId: string; localRevision: string; remoteRevision: string }
  | { status: "denied"; reason: "unauthorized" | "scope-mismatch" | "invalid-revision" };

export interface AuthorizedRemoteProject {
  tenantId: string;
  userId: string;
  contextId: string;
  projectId: string;
  revision: string;
  /** Must be true only after server verified project membership and edit rights. */
  canEdit: boolean;
}

const valid = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

export function evaluateArqdorDraftSync(
  draft: Pick<ArqdorLocalDraft, "tenantId" | "userId" | "contextId" | "projectId" | "baseRevision">,
  remote: AuthorizedRemoteProject,
): DraftSyncDecision {
  if (!remote.canEdit) return { status: "denied", reason: "unauthorized" };
  const dimensions = ["tenantId", "userId", "contextId", "projectId"] as const;
  if (dimensions.some(field => !valid(draft[field]) || !valid(remote[field]) || draft[field] !== remote[field])) {
    return { status: "denied", reason: "scope-mismatch" };
  }
  if (!valid(draft.baseRevision) || !valid(remote.revision)) {
    return { status: "denied", reason: "invalid-revision" };
  }
  if (draft.baseRevision !== remote.revision) {
    return {
      status: "conflict",
      projectId: draft.projectId,
      localRevision: draft.baseRevision,
      remoteRevision: remote.revision,
    };
  }
  return { status: "ready", projectId: draft.projectId, expectedRevision: remote.revision };
}

/** Guidance only: server MUST enforce conditional revision check atomically when saving. */
export function syncDecisionMessage(decision: DraftSyncDecision): string {
  if (decision.status === "conflict") return "O projeto mudou no servidor. Preserve seu rascunho e revise as diferenças antes de enviar.";
  if (decision.status === "denied") return "Não foi possível confirmar permissão e versão deste projeto. Nenhum dado será enviado.";
  return "Versão compatível. O envio ainda depende de confirmação segura pelo servidor.";
}
