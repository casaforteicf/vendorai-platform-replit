const API = "https://api.cloudflare.com/client/v4";
const PROJECT = "vendorai";
const DOMAIN = "app.appvendorai.com";
const ZONE_NAME = "appvendorai.com";
const PAGES_TARGET = "vendorai.pages.dev";

const token = process.env.CLOUDFLARE_API_TOKEN;
const dnsToken = process.env.CLOUDFLARE_DNS_API_TOKEN || token;
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const configuredZoneId = process.env.CLOUDFLARE_ZONE_ID;

if (!token || !accountId) {
  throw new Error("CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required");
}

async function cf(path, init = {}, authToken = token) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { success: false, errors: [{ message: text || `HTTP ${response.status}` }] };
  }
  return { response, payload };
}

function assertSuccess(label, result) {
  if (result.payload?.success === true) return result.payload;
  const details = JSON.stringify({
    status: result.response.status,
    errors: result.payload?.errors,
    messages: result.payload?.messages,
  });
  throw new Error(`${label} failed: ${details}`);
}

async function readDomain() {
  return cf(`/accounts/${accountId}/pages/projects/${PROJECT}/domains/${encodeURIComponent(DOMAIN)}`);
}

async function ensurePagesDomain() {
  const current = await readDomain();
  if (current.payload?.success === true && current.payload?.result?.status === "active") {
    console.log(`Cloudflare Pages custom domain already active: ${DOMAIN}`);
    return "active";
  }

  if (current.payload?.success !== true) {
    console.log(`Attaching ${DOMAIN} to Cloudflare Pages project ${PROJECT}...`);
    const attached = await cf(`/accounts/${accountId}/pages/projects/${PROJECT}/domains`, {
      method: "POST",
      body: JSON.stringify({ name: DOMAIN }),
    });
    assertSuccess("Attach Pages custom domain", attached);
  }

  return current.payload?.result?.status || "pending";
}

async function resolveZoneId() {
  if (configuredZoneId) {
    console.log(`Using configured Cloudflare zone id for ${ZONE_NAME}`);
    return configuredZoneId;
  }

  const zones = await cf(`/zones?name=${encodeURIComponent(ZONE_NAME)}`, {}, dnsToken);
  const zonesPayload = assertSuccess("Read Cloudflare zone", zones);
  const zoneId = zonesPayload?.result?.[0]?.id;
  if (!zoneId) throw new Error(`Cloudflare zone not found: ${ZONE_NAME}`);
  return zoneId;
}

async function ensureDns() {
  const zoneId = await resolveZoneId();
  const records = await cf(
    `/zones/${zoneId}/dns_records?name=${encodeURIComponent(DOMAIN)}`,
    {},
    dnsToken,
  );
  const recordsPayload = assertSuccess("Read production DNS", records);
  const existing = recordsPayload?.result?.[0];

  if (existing && existing.type !== "CNAME") {
    throw new Error(
      `Refusing to replace non-CNAME DNS record for ${DOMAIN}: ${existing.type}. Review it manually.`,
    );
  }

  const payload = JSON.stringify({
    type: "CNAME",
    name: "app",
    content: PAGES_TARGET,
    ttl: 1,
    proxied: true,
  });

  if (existing?.id) {
    const updated = await cf(
      `/zones/${zoneId}/dns_records/${existing.id}`,
      {
        method: "PUT",
        body: payload,
      },
      dnsToken,
    );
    assertSuccess("Update production DNS", updated);
    console.log(`Updated DNS: ${DOMAIN} -> ${PAGES_TARGET}`);
  } else {
    const created = await cf(
      `/zones/${zoneId}/dns_records`,
      {
        method: "POST",
        body: payload,
      },
      dnsToken,
    );
    assertSuccess("Create production DNS", created);
    console.log(`Created DNS: ${DOMAIN} -> ${PAGES_TARGET}`);
  }
}

async function waitUntilActive() {
  for (let attempt = 1; attempt <= 18; attempt += 1) {
    const current = await readDomain();
    if (current.payload?.success === true) {
      const status = current.payload?.result?.status || "unknown";
      console.log(`Cloudflare Pages custom domain status: ${status} (attempt ${attempt}/18)`);
      if (status === "active") return;
      if (status === "blocked" || status === "error" || status === "deactivated") {
        throw new Error(`Custom domain entered terminal status: ${status}`);
      }
    } else {
      console.log(`Could not read custom domain status on attempt ${attempt}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
  throw new Error(`Custom domain did not become active in time: ${DOMAIN}`);
}

async function main() {
  const initialStatus = await ensurePagesDomain();
  await ensureDns();
  if (initialStatus !== "active") {
    await waitUntilActive();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
