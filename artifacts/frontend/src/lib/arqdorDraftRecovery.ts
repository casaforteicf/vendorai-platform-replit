import { loadArqdorDraft, type ArqdorLocalDraft } from "./arqdorLocalDrafts";
import { evaluateArqdorDraftSync, type AuthorizedRemoteProject, type DraftSyncDecision } from "./arqdorDraftReconciliation";

/** MULTI-06: explicit recovery review; never uploads or overwrites either copy. */
export type DraftRecoveryReview =
  | { status: "no-local-draft" }
  | { status: "local-draft"; draft: ArqdorLocalDraft; decision: Exclude<DraftSyncDecision, { status: "denied" }> }
  | { status: "denied"; decision: Extract<DraftSyncDecision, { status: "denied" }> };

/**
 * Call only after authenticating the active user and fetching a FRESH server
 * membership/revision for this exact scope. Consumers must not display payload
 * on denied access, and must not persist credentials into the draft.
 */
export async function inspectArqdorDraftRecovery(
  remote: AuthorizedRemoteProject,
): Promise<DraftRecoveryReview> {
  if (!remote.canEdit) {
    return { status: "denied", decision: { status: "denied", reason: "unauthorized" } };
  }
  const scope = {
    tenantId: remote.tenantId, userId: remote.userId,
    contextId: remote.contextId, projectId: remote.projectId,
  };
  if (Object.values(scope).some(v => typeof v !== "string" || !v.trim())) {
    return { status: "denied", decision: { status: "denied", reason: "scope-mismatch" } };
  }
  const draft = await loadArqdorDraft(scope);
  if (!draft) return { status: "no-local-draft" };
  const decision = evaluateArqdorDraftSync(draft, remote);
  if (decision.status === "denied") return { status: "denied", decision };
  return { status: "local-draft", draft, decision };
}
