type ErrorLike = {
  cause?: unknown;
  code?: unknown;
  column?: unknown;
  constraint?: unknown;
  driverError?: unknown;
  error?: unknown;
  name?: unknown;
  original?: unknown;
  originalError?: unknown;
  parent?: unknown;
  sqlState?: unknown;
  sqlstate?: unknown;
  sql_state?: unknown;
  schema?: unknown;
  table?: unknown;
};

export type PostgresDiagnostic = {
  code: string | null;
  schema?: string;
  table?: string;
  column?: string;
  constraint?: string;
  errorTypes: string[];
};

function safeIdentifier(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 128);
  return normalized || undefined;
}

/** Unwraps Drizzle's query error without returning/logging SQL or bound values. */
export function getPostgresDiagnostic(error: unknown): PostgresDiagnostic {
  const seen = new Set<object>();
  const pending: unknown[] = [error];
  const errorTypes: string[] = [];

  while (pending.length > 0 && seen.size < 16) {
    const current = pending.shift();
    if (!current || typeof current !== "object" || seen.has(current)) continue;
    seen.add(current);
    const candidate = current as ErrorLike;
    const errorType = safeIdentifier(candidate.name)
      ?? safeIdentifier((current as { constructor?: { name?: unknown } }).constructor?.name);
    if (errorType && !errorTypes.includes(errorType)) errorTypes.push(errorType);

    const rawCode = candidate.code ?? candidate.sqlState ?? candidate.sqlstate ?? candidate.sql_state;
    if (typeof rawCode === "string" && /^[0-9A-Z]{5}$/.test(rawCode)) {
      const diagnostic: PostgresDiagnostic = { code: rawCode, errorTypes };
      const schema = safeIdentifier(candidate.schema);
      const table = safeIdentifier(candidate.table);
      const column = safeIdentifier(candidate.column);
      const constraint = safeIdentifier(candidate.constraint);
      if (schema) diagnostic.schema = schema;
      if (table) diagnostic.table = table;
      if (column) diagnostic.column = column;
      if (constraint) diagnostic.constraint = constraint;
      return diagnostic;
    }

    for (const key of ["cause", "driverError", "originalError", "original", "parent", "error"] as const) {
      try {
        const nested = candidate[key];
        if (nested && typeof nested === "object" && !seen.has(nested)) pending.push(nested);
      } catch {
        // Ignore hostile or throwing accessors; diagnostics must never disrupt error handling.
      }
    }
  }

  return { code: null, errorTypes };
}
