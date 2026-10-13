import { openEncryptedArqdorDraft } from "./arqdorEncryptedVault";
import type { DraftScope, LocalDraft } from "./arqdorEncryptedDraft";
import { evaluateArqdorDraftSync, type AuthorizedRemoteProject, type DraftSyncDecision } from "./arqdorDraftReconciliation";

/** Manual read-only recovery. Caller must fetch a fresh authenticated server
 * snapshot and edit-access before invoking. Never uploads or overwrites. */
export async function reviewEncryptedRecovery(
  scope: DraftScope, remote: AuthorizedRemoteProject, passphrase: string,
): Promise<{ status: "missing" } | { status: "denied" } |
  { status: "review"; draft: LocalDraft; decision: DraftSyncDecision }> {
  if (!remote.canEdit || !scope.userId || !scope.tenantId ||
    scope.tenantId !== remote.tenantId || scope.userId !== remote.userId ||
    scope.contextId !== remote.contextId || scope.projectId !== remote.projectId) {
    return { status: "denied" };
  }
  const draft = await openEncryptedArqdorDraft(scope, passphrase);
  if (!draft) return { status: "missing" };
  const decision = evaluateArqdorDraftSync({
    ...scope, baseRevision: draft.change.baseRevision,
  }, remote);
  if (decision.status === "denied") return { status: "denied" };
  return { status: "review", draft, decision };
}
