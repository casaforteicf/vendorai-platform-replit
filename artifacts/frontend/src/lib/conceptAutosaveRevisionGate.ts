/**
 * MULTI-04: pure optimistic-concurrency gate for the ConceptPlanner editor autosave.
 *
 * This isolates the two decisions that decide whether the editor autosave can
 * silently overwrite a newer server revision (for example one produced by an
 * authorized restore):
 *   1. which revision header the PATCH carries, and
 *   2. whether a given response is a revision conflict.
 *
 * Contract, so the live editor behavior does not change when the rollout flag is
 * off (production state today):
 *   - flag OFF  -> no If-Match header is ever added and HTTP 409 is NOT treated
 *                  as a revision conflict. The autosave behaves exactly like the
 *                  legacy unversioned PATCH (same headers, same error handling).
 *   - flag ON   -> an existing project with a captured server revision sends
 *                  If-Match, and HTTP 409 is surfaced as a conflict so the editor
 *                  stops and warns instead of clobbering the newer revision.
 *
 * New projects (POST, no targetId) and a missing captured revision never produce
 * an If-Match header; the editor's pre-flight guards block the ambiguous case.
 */

/** Header map to spread into the autosave request. Empty unless CAS applies. */
export function conceptAutosaveIfMatchHeader(
  enabled: boolean,
  targetId: string | null,
  revision: string | null,
): Record<string, string> {
  if (enabled && targetId && revision) return { "If-Match": revision };
  return {};
}

/**
 * True only when the rollout flag is on AND the server reported a revision
 * conflict (HTTP 409). With the flag off this is always false, so the caller
 * keeps its legacy `!response.ok` handling and behavior is unchanged.
 */
export function isConceptAutosaveConflict(enabled: boolean, status: number): boolean {
  return enabled && status === 409;
}
