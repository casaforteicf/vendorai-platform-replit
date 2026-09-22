const CF_API_BASE = "https://api.cloudflare.com/client/v4";

const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ZONE_ID = process.env.CLOUDFLARE_ZONE_ID;
const SAAS_CNAME_TARGET = (
  process.env.CLOUDFLARE_SAAS_CNAME_TARGET ??
  process.env.CLOUDFLARE_SAAS_ORIGIN ??
  ""
).trim();

if (!API_TOKEN) {
  console.warn("[Cloudflare] CLOUDFLARE_API_TOKEN not set — custom domains will not work");
}
if (!ZONE_ID) {
  console.warn("[Cloudflare] CLOUDFLARE_ZONE_ID not set — custom domains will not work");
}
if (!SAAS_CNAME_TARGET) {
  console.warn("[Cloudflare] CLOUDFLARE_SAAS_CNAME_TARGET not set — DNS instructions will stay unavailable");
}

type CustomHostnameResult = {
  id: string;
  status: string;
  ssl?: { status?: string };
  hostname: string;
};

async function cfRequest(
  path: string,
  options: RequestInit = {}
): Promise<unknown> {
  const url = `${CF_API_BASE}${path}`;
  const resp = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const body = (await resp.json().catch(() => ({}))) as Record<string, unknown>;

  if (!resp.ok) {
    const errors = (body.errors as Array<{ message: string }>) ?? [];
    const msg = errors.map((e) => e.message).join("; ") || `Cloudflare HTTP ${resp.status}`;
    throw new Error(msg);
  }

  return body;
}

function mapCustomHostname(result: CustomHostnameResult) {
  return {
    id: result.id,
    status: result.status,
    sslStatus: result.ssl?.status ?? "pending",
    hostname: result.hostname,
  };
}

export function getCloudflareCustomDomainConfig() {
  return {
    apiConfigured: Boolean(API_TOKEN && ZONE_ID),
    cnameTargetConfigured: Boolean(SAAS_CNAME_TARGET),
    // Backward-compatible field for older frontend builds.
    originConfigured: Boolean(SAAS_CNAME_TARGET),
    ready: Boolean(API_TOKEN && ZONE_ID && SAAS_CNAME_TARGET),
  };
}

// ── Find an existing custom hostname (Cloudflare for SaaS) ──────────────────
export async function findCustomHostname(
  hostname: string
): Promise<{ id: string; status: string; sslStatus: string; hostname: string } | null> {
  if (!API_TOKEN || !ZONE_ID) {
    throw new Error("Cloudflare credentials not configured");
  }

  const body = await cfRequest(
    `/zones/${ZONE_ID}/custom_hostnames?hostname=${encodeURIComponent(hostname)}`,
    { method: "GET" },
  ) as { result?: CustomHostnameResult[] };

  const result = body.result?.find(
    (item) => item.hostname.toLowerCase() === hostname.toLowerCase(),
  );

  return result ? mapCustomHostname(result) : null;
}

// ── Create a custom hostname (Cloudflare for SaaS) ───────────────────────────
export async function createCustomHostname(
  hostname: string
): Promise<{ id: string; status: string; sslStatus: string; hostname: string }> {
  if (!API_TOKEN || !ZONE_ID) {
    throw new Error("Cloudflare credentials not configured");
  }

  const body = await cfRequest(`/zones/${ZONE_ID}/custom_hostnames`, {
    method: "POST",
    body: JSON.stringify({
      hostname,
      ssl: {
        method: "http",
        type: "dv",
        settings: {
          min_tls_version: "1.2",
        },
      },
    }),
  }) as { result?: CustomHostnameResult };

  const result = body.result;
  if (!result) {
    throw new Error("Cloudflare returned empty result");
  }

  return mapCustomHostname(result);
}

// Reuses an existing hostname when Cloudflare already has it. This makes
// provisioning idempotent and lets a tenant recover from a previous partial
// failure where the Cloudflare hostname was created but the local DB was not
// updated (or vice-versa).
export async function createOrGetCustomHostname(
  hostname: string
): Promise<{ id: string; status: string; sslStatus: string; hostname: string }> {
  const existing = await findCustomHostname(hostname);
  if (existing) return existing;

  try {
    return await createCustomHostname(hostname);
  } catch (error) {
    // A concurrent request or an earlier timed-out request may have created the
    // hostname even though our POST failed. Re-read once before surfacing the
    // error so Verify DNS can self-heal.
    const recovered = await findCustomHostname(hostname).catch(() => null);
    if (recovered) return recovered;
    throw error;
  }
}

// ── Get custom hostname details ─────────────────────────────────────────────
export async function getCustomHostname(
  hostnameId: string
): Promise<{ status: string; sslStatus: string; hostname: string }> {
  if (!API_TOKEN || !ZONE_ID) {
    throw new Error("Cloudflare credentials not configured");
  }

  const body = await cfRequest(`/zones/${ZONE_ID}/custom_hostnames/${hostnameId}`, {
    method: "GET",
  }) as { result?: CustomHostnameResult };

  const result = body.result;
  if (!result) {
    throw new Error("Cloudflare returned empty result");
  }

  return mapCustomHostname(result);
}

// ── Delete custom hostname ──────────────────────────────────────────────────
export async function deleteCustomHostname(hostnameId: string): Promise<void> {
  if (!API_TOKEN || !ZONE_ID) {
    throw new Error("Cloudflare credentials not configured");
  }

  await cfRequest(`/zones/${ZONE_ID}/custom_hostnames/${hostnameId}`, {
    method: "DELETE",
  });
}

// ── Get DNS instructions for CNAME ─────────────────────────────────────────
export function getDnsInstructions(domain: string): {
  recordType: string;
  name: string;
  value: string;
} {
  return {
    recordType: "CNAME",
    name: domain,
    // Never expose a made-up fallback hostname to customers. If the SaaS
    // origin is not configured, the UI will show "Preparando destino..." and
    // the API will report that infrastructure provisioning is incomplete.
    value: SAAS_CNAME_TARGET,
  };
}
