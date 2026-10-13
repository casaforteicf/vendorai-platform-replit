import { validateConceptWalls, type WallPreflightIssue } from "../pages/arch/conceptWallPreflight";
import type { EditableWall } from "../pages/arch/conceptParametricEditing";

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
  /** Requer medidas reais do lote quando o payload inclui customWalls. */
  lotBounds?: { width: number; depth: number };
}): Promise<AutosaveOutcome> {
  const revision = new Date(input.revision);
  if (!input.projectId || !input.token || !Number.isFinite(revision.getTime())) {
    throw new Error("PROJECT_REVISION_REQUIRED");
  }
  const configuration = input.updates.configuration;
  const nested = configuration && typeof configuration === "object" && !Array.isArray(configuration)
    ? configuration as Record<string, unknown> : null;
  const hasDirectWalls = Object.prototype.hasOwnProperty.call(input.updates, "customWalls");
  const hasNestedWalls = nested !== null && Object.prototype.hasOwnProperty.call(nested, "customWalls");
  if (hasDirectWalls || hasNestedWalls) {
    const rawWalls = hasNestedWalls ? nested!.customWalls : input.updates.customWalls;
    const candidateBounds = input.lotBounds ?? (
      nested?.workspaceBounds && typeof nested.workspaceBounds === "object"
        ? nested.workspaceBounds as { width: number; depth: number }
        : null
    ) ?? (
      input.updates.lot && typeof input.updates.lot === "object"
        ? input.updates.lot as { width: number; depth: number }
        : null
    );
    if (!candidateBounds || !Array.isArray(rawWalls)) throw new Error("PROJECT_WALL_PREFLIGHT_CONTEXT_REQUIRED");
    const walls = rawWalls as EditableWall[];
    if (walls.some((wall) => !wall || typeof wall !== "object" ||
      typeof wall.id !== "string" || !Number.isInteger(wall.floor) ||
      [wall.x1, wall.y1, wall.x2, wall.y2].some((v) => typeof v !== "number") ||
      (wall.thickness !== undefined && typeof wall.thickness !== "number"))) {
      throw new Error("PROJECT_WALL_PREFLIGHT_INVALID_SHAPE");
    }
    const issues: WallPreflightIssue[] = validateConceptWalls(walls, candidateBounds.width, candidateBounds.depth);
    if (issues.length) throw new Error("PROJECT_WALL_PREFLIGHT_FAILED:" + issues.map((issue) => issue.code).join(","));
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
