const API = "https://api.cloudflare.com/client/v4";
const token = process.env.CLOUDFLARE_API_TOKEN;
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const zoneName = "appvendorai.com";
const workerScript = "vendorai-tenant-saas";
const fallbackHost = "proxy-fallback.appvendorai.com";
const cnameTarget = "domains.appvendorai.com";

if (!token || !accountId) {
  throw new Error("CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required");
}

const headers = {
  Authorization: "Bearer " + token,
  "Content-Type": "application/json",
};

async function cf(path, init = {}) {
  const response = await fetch(API + path, {
    ...init,
    headers: { ...headers, ...(init.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error((init.method || "GET") + " " + path + ": " + JSON.stringify(payload.errors || payload.messages || payload));
  }
  return payload.result;
}

const zones = await cf("/zones?name=" + encodeURIComponent(zoneName) + "&account.id=" + encodeURIComponent(accountId));
const zone = zones?.[0];
if (!zone?.id) throw new Error("Zone " + zoneName + " not found");
const zoneId = zone.id;

async function upsertDns({ name, type, content, proxied = true }) {
  const existing = await cf("/zones/" + zoneId + "/dns_records?name=" + encodeURIComponent(name) + "&type=" + type);
  const payload = { name, type, content, proxied, ttl: 1 };
  if (existing?.[0]?.id) {
    return cf("/zones/" + zoneId + "/dns_records/" + existing[0].id, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  }
  return cf("/zones/" + zoneId + "/dns_records", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

await upsertDns({
  name: fallbackHost,
  type: "AAAA",
  content: "100::",
  proxied: true,
});

await cf("/zones/" + zoneId + "/custom_hostnames/fallback_origin", {
  method: "PUT",
  body: JSON.stringify({ origin: fallbackHost }),
});

await upsertDns({
  name: cnameTarget,
  type: "CNAME",
  content: fallbackHost,
  proxied: true,
});

const routes = await cf("/zones/" + zoneId + "/workers/routes");
const desiredRoutes = [
  { pattern: "*/*", script: workerScript },
  { pattern: "appvendorai.com/*", script: null },
  { pattern: "app.appvendorai.com/*", script: null },
  { pattern: "*.appvendorai.com/*", script: null },
];

for (const desired of desiredRoutes) {
  const existing = routes.find((route) => route.pattern === desired.pattern);
  const body = desired.script
    ? { pattern: desired.pattern, script: desired.script }
    : { pattern: desired.pattern };

  if (existing?.id) {
    await cf("/zones/" + zoneId + "/workers/routes/" + existing.id, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  } else {
    await cf("/zones/" + zoneId + "/workers/routes", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }
}

const fallback = await cf("/zones/" + zoneId + "/custom_hostnames/fallback_origin");
const finalRoutes = await cf("/zones/" + zoneId + "/workers/routes");
const finalDns = await cf("/zones/" + zoneId + "/dns_records?per_page=100");

console.log(JSON.stringify({
  zone: zoneName,
  fallback: {
    origin: fallback?.origin || null,
    status: fallback?.status || null,
  },
  cnameTarget,
  dns: finalDns
    .filter((record) => [fallbackHost, cnameTarget].includes(record.name))
    .map((record) => ({
      name: record.name,
      type: record.type,
      content: record.content,
      proxied: record.proxied,
    })),
  routes: finalRoutes
    .filter((route) => desiredRoutes.some((desired) => desired.pattern === route.pattern))
    .map((route) => ({
      pattern: route.pattern,
      script: route.script || null,
    })),
}, null, 2));
