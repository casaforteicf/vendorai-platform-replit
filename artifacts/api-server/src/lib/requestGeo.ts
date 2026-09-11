import type { Request } from "express";

export type RequestGeo = {
  country: string | null;
  region: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  source: "edge_headers" | "ip_lookup" | "unavailable";
};

type CachedGeo = { value: RequestGeo; expiresAt: number };

const GEO_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const GEO_LOOKUP_TIMEOUT_MS = 1800;
const GEO_CACHE_MAX_ENTRIES = 5000;
const geoCache = new Map<string, CachedGeo>();

function clean(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    return decodeURIComponent(value.trim());
  } catch {
    return value.trim();
  }
}

function firstHeader(req: Request, names: string[]): string | null {
  for (const name of names) {
    const value = clean(req.get(name));
    if (value) return value;
  }
  return null;
}

function normalizeIp(raw: string | null): string | null {
  if (!raw) return null;
  const first = raw.split(",")[0]?.trim().replace(/^"|"$/g, "");
  if (!first) return null;
  const withoutMappedPrefix = first.replace(/^::ffff:/i, "");
  const withoutPort = /^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(withoutMappedPrefix)
    ? withoutMappedPrefix.replace(/:\d+$/, "")
    : withoutMappedPrefix;
  return withoutPort || null;
}

function isPublicIp(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (
    lower === "::1"
    || lower === "0.0.0.0"
    || lower.startsWith("fc")
    || lower.startsWith("fd")
    || lower.startsWith("fe80:")
  ) return false;

  const parts = lower.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return lower.includes(":");
  }

  const [a, b] = parts;
  return !(
    a === 10
    || a === 127
    || a === 0
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127)
  );
}

function requestIp(req: Request): string | null {
  const candidates = [
    req.get("cf-connecting-ip"),
    req.get("true-client-ip"),
    req.get("x-real-ip"),
    req.get("x-client-ip"),
    req.get("fly-client-ip"),
    req.get("x-forwarded-for"),
    req.ip,
    req.socket.remoteAddress,
  ];

  for (const candidate of candidates) {
    const ip = normalizeIp(candidate ?? null);
    if (ip && isPublicIp(ip)) return ip;
  }
  return null;
}

function headerGeo(req: Request): RequestGeo {
  const country = firstHeader(req, [
    "x-vercel-ip-country",
    "cf-ipcountry",
    "x-country-code",
  ]);
  const region = firstHeader(req, [
    "x-vercel-ip-country-region",
    "x-vercel-ip-region",
    "cf-region",
    "x-region",
  ]);
  const city = firstHeader(req, [
    "x-vercel-ip-city",
    "cf-ipcity",
    "x-city",
  ]);
  const latitude = Number(firstHeader(req, ["x-vercel-ip-latitude", "cf-iplatitude"]));
  const longitude = Number(firstHeader(req, ["x-vercel-ip-longitude", "cf-iplongitude"]));

  return {
    country,
    region,
    city,
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    source: country || region || city ? "edge_headers" : "unavailable",
  };
}

async function lookupIp(ip: string): Promise<RequestGeo | null> {
  const cached = geoCache.get(ip);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached) geoCache.delete(ip);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEO_LOOKUP_TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://ipwho.is/${encodeURIComponent(ip)}?fields=success,country_code,region,city,latitude,longitude`,
      { signal: controller.signal, headers: { accept: "application/json" } },
    );
    if (!response.ok) return null;
    const data = await response.json() as Record<string, unknown>;
    if (data.success !== true) return null;

    const value: RequestGeo = {
      country: typeof data.country_code === "string" ? data.country_code : null,
      region: typeof data.region === "string" ? data.region : null,
      city: typeof data.city === "string" ? data.city : null,
      latitude: typeof data.latitude === "number" ? data.latitude : null,
      longitude: typeof data.longitude === "number" ? data.longitude : null,
      source: "ip_lookup",
    };
    if (!value.country && !value.region && !value.city) return null;

    if (geoCache.size >= GEO_CACHE_MAX_ENTRIES) {
      const oldest = geoCache.keys().next().value;
      if (oldest) geoCache.delete(oldest);
    }
    geoCache.set(ip, { value, expiresAt: Date.now() + GEO_CACHE_TTL_MS });
    return value;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function resolveRequestGeo(req: Request): Promise<RequestGeo> {
  const headers = headerGeo(req);
  if (headers.city && headers.region && headers.country) return headers;

  const ip = requestIp(req);
  const lookedUp = ip ? await lookupIp(ip) : null;
  if (!lookedUp) return headers;

  return {
    country: headers.country ?? lookedUp.country,
    region: headers.region ?? lookedUp.region,
    city: headers.city ?? lookedUp.city,
    latitude: headers.latitude ?? lookedUp.latitude,
    longitude: headers.longitude ?? lookedUp.longitude,
    source: headers.country || headers.region || headers.city ? "edge_headers" : "ip_lookup",
  };
}
