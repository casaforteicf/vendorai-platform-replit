/**
 * MULTI-04.8: conditional autosave transport. Use only after the editor
 * has captured the backend's exact updatedAt revision.
 * Never retries a 409 automatically or overwrites remote content.
 */
export type AutosaveOutcome =
  | { status: "saved"; project: unknown }
  | { status: "conflict" }
  | { status: "unauthorized" };

export async function saveConceptWithRevision(input: {
  projectId: string;
  revision: string;
  token: string;
  updates: Record<string, unknown>;
  signal?: AbortSignal;
}): Promise<AutosaveOutcome> {
  const revision = new Date(input.revision);
  if (!input.projectId || !input.token || !Number.isFinite(revision.getTime())) {
    throw new Error("PROJECT_REVISION_REQUIRED");
  }
  const response = await fetch(`/api/arch/concept-projects/${encodeURIComponent(input.projectId)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.token}`,
      "If-Match": revision.toISOString(),
    },
    body: JSON.stringify(input.updates),
    signal: input.signal,
  });
  if (response.status === 409) return { status: "conflict" };
  if (response.status === 401 || response.status === 403) return { status: "unauthorized" };
  if (!response.ok) throw new Error(`PROJECT_SAVE_FAILED_${response.status}`);
  return { status: "saved", project: await response.json() };
}
