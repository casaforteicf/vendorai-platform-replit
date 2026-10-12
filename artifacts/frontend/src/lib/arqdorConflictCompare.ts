/**
 * MULTI-04.11 — Read-only structural comparison for recovery review.
 * No automatic merge and no server writes. Compare only JSON-safe project
 * snapshots obtained from the current authorized project and a local draft.
 */
export type Difference = {
  path: string;
  kind: "added" | "removed" | "changed";
  local: unknown;
  remote: unknown;
};
const MAX_ITEMS = 200;
function plain(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
export function compareArqdorSnapshots(local: unknown, remote: unknown): Difference[] {
  const differences: Difference[] = [];
  function walk(a: unknown, b: unknown, path: string, depth: number) {
    if (differences.length >= MAX_ITEMS) return;
    if (Object.is(a, b)) return;
    if (depth >= 8 || (!plain(a) && !plain(b))) {
      if (JSON.stringify(a) !== JSON.stringify(b)) differences.push({
        path: path || "projeto", kind: a === undefined ? "removed" : b === undefined ? "added" : "changed",
        local: a, remote: b,
      });
      return;
    }
    const aa = plain(a) ? a : {};
    const bb = plain(b) ? b : {};
    for (const key of new Set([...Object.keys(aa), ...Object.keys(bb)])) {
      if (differences.length >= MAX_ITEMS) break;
      if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
      walk(aa[key], bb[key], path ? `${path}.${key}` : key, depth + 1);
    }
  }
  walk(local, remote, "", 0);
  return differences;
}
