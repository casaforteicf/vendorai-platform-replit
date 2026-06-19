const CF_API_BASE = "https://api.cloudflare.com/client/v4";

const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ZONE_ID = process.env.CLOUDFLARE_ZONE_ID;

if (!API_TOKEN) {
  console.warn("[Cloudflare] CLOUDFLARE_API_TOKEN not set — custom domains will not work");
}
if (!ZONE_ID) {
  console.warn("[Cloudflare] CLOUDFLARE_ZONE_ID not set — custom domains will not work");
}

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

// ── Create a custom hostname (Cloudflare for SaaS) ───────────────────────────
export async function createCustomHostname(
  hostname: string
): Promise<{ id: string; status: string; sslStatus: string }> {
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
  }) as {
    result?: {
      id: string;
      status: string;
      ssl: { status: string };
    };
  };

  const result = body.result;
  if (!result) {
    throw new Error("Cloudflare returned empty result");
  }

  return {
    id: result.id,
    status: result.status,
    sslStatus: result.ssl?.status ?? "pending",
  };
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
  }) as {
    result?: {
      status: string;
      ssl: { status: string };
      hostname: string;
    };
  };

  const result = body.result;
  if (!result) {
    throw new Error("Cloudflare returned empty result");
  }

  return {
    status: result.status,
    sslStatus: result.ssl?.status ?? "pending",
    hostname: result.hostname,
  };
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
    value: `${process.env.CLOUDFLARE_SAAS_ORIGIN ?? "origin.vendor.ai"}`,
  };
}
