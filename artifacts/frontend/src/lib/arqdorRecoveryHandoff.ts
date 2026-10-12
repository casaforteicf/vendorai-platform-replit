import { evaluateRecoveryForReview, type RecoveryDecision } from "./arqdorRecoveryReview";
import type { LocalDraft, DraftScope } from "./arqdorEncryptedDraft";
import type { ProjectContinuity } from "./projectContinuity";

/**
 * Refresh before approval; fail closed if backend authorization/revision read fails.
 * The result permits UI review ONLY, not a write or synchronization.
 */
export async function checkRecoveryAtHandoff(
  draft: LocalDraft, scope: DraftScope, fetchAuthorizedCurrent: () => Promise<ProjectContinuity>,
): Promise<RecoveryDecision> {
  try {
    const fresh = await fetchAuthorizedCurrent();
    if (!fresh?.revision || !fresh.projectId || !fresh.contextId) {
      return { status: "denied", reason: "Revisão remota indisponível." };
    }
    return evaluateRecoveryForReview(draft, scope, fresh);
  } catch {
    return { status: "denied", reason: "Autorização remota ou conexão indisponível." };
  }
}
