export function getVendiPostgresErrorCode(error: unknown): string | undefined {
  const visited = new Set<object>();
  let current: unknown = error;

  while (current !== null && typeof current === "object" && !visited.has(current)) {
    visited.add(current);
    const candidate = current as { code?: unknown; cause?: unknown };
    if (typeof candidate.code === "string") return candidate.code;
    current = candidate.cause;
  }

  return undefined;
}
