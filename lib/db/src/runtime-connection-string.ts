const POSTGRES_SCHEME = /postgres(?:ql)?:\/\//gi;

export function recoverPostgresConnectionString(value: string): string {
  const trimmed = value.trim();
  const matches = Array.from(trimmed.matchAll(POSTGRES_SCHEME));
  if (matches.length === 0) return trimmed;

  const firstIndex = matches[0]?.index ?? 0;
  const secondIndex = matches[1]?.index;

  if (typeof secondIndex === "number") {
    return trimmed.slice(firstIndex, secondIndex);
  }

  return firstIndex > 0 ? trimmed.slice(firstIndex) : trimmed;
}

export function normalizeRuntimeConnectionString(
  value: string,
  appDatabaseUrlConfigured = false,
): string {
  const recovered = recoverPostgresConnectionString(value);
  if (!appDatabaseUrlConfigured) return recovered;

  try {
    const url = new URL(recovered);
    let projectRef: string | null = null;
    const isSupabaseHost =
      url.hostname.endsWith(".supabase.co") ||
      url.hostname.endsWith(".pooler.supabase.com");

    if (isSupabaseHost && url.username === "postgres") {
      url.username = "vendorai_app";
    } else if (isSupabaseHost && url.username.startsWith("postgres.")) {
      projectRef = url.username.slice("postgres.".length);
      url.username = `vendorai_app.${projectRef}`;
    }

    if (projectRef && url.hostname.endsWith(".pooler.supabase.com")) {
      url.hostname = `db.${projectRef}.supabase.co`;
      url.port = "5432";
      url.username = "vendorai_app";
      if (!url.searchParams.has("sslmode")) {
        url.searchParams.set("sslmode", "require");
      }
    }

    return url.toString();
  } catch {
    return recovered;
  }
}

export function safeConnectionTarget(value: string) {
  try {
    const url = new URL(value);
    const rawDatabase = url.pathname.replace(/^\/+/, "").split("/")[0] || "(default)";
    const database = /^[A-Za-z0-9_.-]+$/.test(rawDatabase)
      ? rawDatabase
      : "(redacted-invalid-path)";

    return {
      protocol: url.protocol,
      username: url.username,
      hostname: url.hostname,
      port: url.port || "(default)",
      database,
      hasPassword: url.password.length > 0,
    };
  } catch {
    return null;
  }
}
