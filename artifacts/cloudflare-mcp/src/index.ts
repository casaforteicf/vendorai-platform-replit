import { createServer } from "node:http";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import * as z from "zod/v4";
import { authorized, challenge, handleOAuth } from "./oauth.js";

const API_BASE = "https://api.cloudflare.com/client/v4";
const DEFAULT_GITHUB_OWNER = "casaforteicf";
const DEFAULT_GITHUB_OWNER_ID = "173710513";
const DEFAULT_GITHUB_REPO = "vendorai-platform-replit";
const DEFAULT_GITHUB_REPO_ID = "1301046243";

type CloudflareEnvelope<T> = {
  success: boolean;
  errors?: Array<{ code?: number; message?: string }>;
  messages?: Array<{ code?: number; message?: string }>;
  result: T;
  result_info?: unknown;
};

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Configuração ausente: ${name}`);
  return value;
}

let resolvedAccountId: string | null = null;

async function accountId(): Promise<string> {
  const configured = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  if (configured) return configured;
  if (resolvedAccountId) return resolvedAccountId;

  const token = requiredEnv("CLOUDFLARE_API_TOKEN");
  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const zoneName = process.env.CLOUDFLARE_SAAS_ZONE_NAME?.trim() || "appvendorai.com";
  const zoneResponse = await fetch(`https://api.cloudflare.com/client/v4/zones?name=${encodeURIComponent(zoneName)}&per_page=50`, { headers: auth });
  const zonePayload = await zoneResponse.json() as { success?: boolean; result?: Array<{ account?: { id?: string } }> };
  const zoneAccountId = zonePayload?.result?.find((z) => z?.account?.id)?.account?.id?.trim();
  if (zoneResponse.ok && zonePayload?.success !== false && zoneAccountId) {
    resolvedAccountId = zoneAccountId;
    return resolvedAccountId;
  }

  const accountsResponse = await fetch("https://api.cloudflare.com/client/v4/accounts?per_page=50", { headers: auth });
  const accountsPayload = await accountsResponse.json() as { success?: boolean; result?: Array<{ id?: string }> };
  const accounts = Array.isArray(accountsPayload?.result) ? accountsPayload.result.filter((a) => a?.id?.trim()) : [];
  if (accountsResponse.ok && accountsPayload?.success !== false && accounts.length === 1) {
    resolvedAccountId = accounts[0]!.id!.trim();
    return resolvedAccountId;
  }

  throw new Error("Não foi possível resolver CLOUDFLARE_ACCOUNT_ID automaticamente");
}

async function cloudflare<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = requiredEnv("CLOUDFLARE_API_TOKEN");
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  const payload = (await response.json().catch(() => null)) as CloudflareEnvelope<T> | null;
  if (!response.ok || !payload?.success) {
    const details = payload?.errors?.map((error) => error.message || error.code).join("; ") || response.statusText;
    throw new Error(`Cloudflare API ${response.status}: ${details}`);
  }
  return payload.result;
}

function toolText(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  };
}

type CustomHostnameResult = {
  id: string;
  status: string;
  ssl?: { status?: string };
  hostname: string;
};

function mapCustomHostname(result: CustomHostnameResult) {
  return {
    id: result.id,
    status: result.status,
    sslStatus: result.ssl?.status ?? "pending",
    hostname: result.hostname,
  };
}

async function resolveSaasZoneId(): Promise<string> {
  const explicit = process.env["CLOUDFLARE_ZONE_ID"]?.trim();
  if (explicit) return explicit;

  const zoneName = (process.env["CLOUDFLARE_SAAS_ZONE_NAME"] || "appvendorai.com").trim().toLowerCase();
  const query = new URLSearchParams({ name: zoneName, "account.id": await accountId(), per_page: "50" });
  const zones = await cloudflare<Array<{ id: string; name: string }>>(`/zones?${query.toString()}`);
  const zone = zones.find((item) => item.name.toLowerCase() === zoneName);
  if (!zone) throw new Error(`Cloudflare SaaS zone not found: ${zoneName}`);
  return zone.id;
}

async function findSaasCustomHostname(hostname: string) {
  const zoneId = await resolveSaasZoneId();
  const result = await cloudflare<CustomHostnameResult[]>(
    `/zones/${encodeURIComponent(zoneId)}/custom_hostnames?hostname=${encodeURIComponent(hostname)}`,
    { method: "GET" },
  );
  const match = result.find((item) => item.hostname.toLowerCase() === hostname.toLowerCase());
  return match ? mapCustomHostname(match) : null;
}

async function createSaasCustomHostname(hostname: string) {
  const zoneId = await resolveSaasZoneId();
  const result = await cloudflare<CustomHostnameResult>(
    `/zones/${encodeURIComponent(zoneId)}/custom_hostnames`,
    {
      method: "POST",
      body: JSON.stringify({
        hostname,
        ssl: { method: "http", type: "dv", settings: { min_tls_version: "1.2" } },
      }),
    },
  );
  return mapCustomHostname(result);
}

async function createOrGetSaasCustomHostname(hostname: string) {
  const existing = await findSaasCustomHostname(hostname);
  if (existing) return existing;
  try {
    return await createSaasCustomHostname(hostname);
  } catch (error) {
    const recovered = await findSaasCustomHostname(hostname).catch(() => null);
    if (recovered) return recovered;
    throw error;
  }
}

async function getSaasCustomHostname(hostnameId: string) {
  const zoneId = await resolveSaasZoneId();
  const result = await cloudflare<CustomHostnameResult>(
    `/zones/${encodeURIComponent(zoneId)}/custom_hostnames/${encodeURIComponent(hostnameId)}`,
    { method: "GET" },
  );
  return mapCustomHostname(result);
}

async function deleteSaasCustomHostname(hostnameId: string) {
  const zoneId = await resolveSaasZoneId();
  await cloudflare<unknown>(
    `/zones/${encodeURIComponent(zoneId)}/custom_hostnames/${encodeURIComponent(hostnameId)}`,
    { method: "DELETE" },
  );
}


async function vendorApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  // Never silently fall back to a retired Railway or production API.
  const configuredBase = requiredEnv("VENDORAI_API_BASE");
  const parsedBase = new URL(configuredBase);
  if (parsedBase.protocol !== "https:" || parsedBase.username || parsedBase.password || parsedBase.search || parsedBase.hash) {
    throw new Error("VENDORAI_API_BASE must be a secure HTTPS origin");
  }
  const base = parsedBase.origin;
  const token = requiredEnv("BROWSER_MCP_ACCESS_TOKEN");
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    // API payloads can include headers, tokens or personal data; return stable safe codes.
    const code = response.status === 401 ? "INVALID_OR_EXPIRED_TOKEN"
      : response.status === 403 ? "FORBIDDEN"
      : response.status === 404 ? "RESOURCE_NOT_FOUND"
      : "UPSTREAM_API_FAILURE";
    throw new Error(`VendorAI API ${response.status}: ${code}`);
  }
  return await response.json() as T;
}

function createCloudflareMcpServer() {
  const server = new McpServer(
    { name: "vendorai-cloudflare", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.registerTool(
    "cloudflare_status",
    {
      description: "Use this when you need to verify that the private Cloudflare connection and API token are working.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async () => {
      // Verify the API token independently from optional product permissions such as Pages.
      // /user/tokens/verify is the canonical bearer-token validity check and does not require Pages access.
      const verification = await cloudflare<{ id?: string; status?: string }>(`/user/tokens/verify`);
      return toolText({ connected: true, accountIdConfigured: Boolean(await accountId()), tokenStatus: verification?.status || "active" });
    },
  );

  server.registerTool(
    "cloudflare_list_pages_projects",
    {
      description: "Use this when you need to inspect the Cloudflare Pages projects in the connected account.",
      inputSchema: z.object({ perPage: z.number().int().min(1).max(100).default(50) }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ perPage }) => {
      const result = await cloudflare<unknown[]>(`/accounts/${await accountId()}/pages/projects?per_page=${perPage}`);
      return toolText(result);
    },
  );

  server.registerTool(
    "cloudflare_get_pages_project",
    {
      description: "Use this when you need the current configuration and deployment state of one Cloudflare Pages project.",
      inputSchema: z.object({ projectName: z.string().min(1) }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ projectName }) => {
      const result = await cloudflare<unknown>(`/accounts/${await accountId()}/pages/projects/${encodeURIComponent(projectName)}`);
      return toolText(result);
    },
  );

  server.registerTool(
    "cloudflare_create_pages_project_from_github",
    {
      description: "Use this when the user explicitly asks to create a Cloudflare Pages project connected to an already-authorized GitHub repository.",
      inputSchema: z.object({
        projectName: z.string().min(1).max(58).regex(/^[a-z0-9-]+$/),
        productionBranch: z.string().min(1).default("main"),
        buildCommand: z.string().min(1),
        destinationDir: z.string().min(1),
        rootDir: z.string().min(1).default("/"),
        githubOwner: z.string().min(1).default(DEFAULT_GITHUB_OWNER),
        githubOwnerId: z.string().min(1).default(DEFAULT_GITHUB_OWNER_ID),
        githubRepo: z.string().min(1).default(DEFAULT_GITHUB_REPO),
        githubRepoId: z.string().min(1).default(DEFAULT_GITHUB_REPO_ID),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (input) => {
      const result = await cloudflare<unknown>(`/accounts/${await accountId()}/pages/projects`, {
        method: "POST",
        body: JSON.stringify({
          name: input.projectName,
          production_branch: input.productionBranch,
          build_config: {
            build_command: input.buildCommand,
            destination_dir: input.destinationDir,
            root_dir: input.rootDir,
          },
          source: {
            type: "github",
            config: {
              owner: input.githubOwner,
              owner_id: input.githubOwnerId,
              repo_name: input.githubRepo,
              repo_id: input.githubRepoId,
              production_branch: input.productionBranch,
              deployments_enabled: true,
              production_deployments_enabled: true,
              pr_comments_enabled: true,
              preview_deployment_setting: "all",
              preview_branch_includes: ["*"],
              preview_branch_excludes: [],
              path_includes: ["*"],
              path_excludes: [],
            },
          },
        }),
      });
      return toolText(result);
    },
  );

  server.registerTool(
    "cloudflare_list_pages_deployments",
    {
      description: "Use this when you need to inspect recent deployments for a Cloudflare Pages project.",
      inputSchema: z.object({ projectName: z.string().min(1), perPage: z.number().int().min(1).max(100).default(20) }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ projectName, perPage }) => {
      const result = await cloudflare<unknown[]>(`/accounts/${await accountId()}/pages/projects/${encodeURIComponent(projectName)}/deployments?per_page=${perPage}`);
      return toolText(result);
    },
  );

  server.registerTool(
    "cloudflare_trigger_pages_deployment",
    {
      description: "Use this when the user explicitly asks to trigger a new production deployment for an existing Cloudflare Pages project.",
      inputSchema: z.object({ projectName: z.string().min(1) }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ projectName }) => {
      const result = await cloudflare<unknown>(`/accounts/${await accountId()}/pages/projects/${encodeURIComponent(projectName)}/deployments`, {
        method: "POST",
        body: "{}",
      });
      return toolText(result);
    },
  );

  server.registerTool(
    "cloudflare_list_zones",
    {
      description: "Use this when you need to inspect zones/domains in the connected Cloudflare account. This tool is read-only.",
      inputSchema: z.object({ name: z.string().optional() }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ name }) => {
      const query = new URLSearchParams({ "account.id": await accountId(), per_page: "50" });
      if (name) query.set("name", name);
      const result = await cloudflare<unknown[]>(`/zones?${query.toString()}`);
      return toolText(result);
    },
  );


  server.registerTool(
    "cloudflare_list_dns_records",
    {
      description: "Lista registros DNS de uma zona Cloudflare. Use antes de criar ou editar para evitar duplicidades.",
      inputSchema: z.object({ zoneId: z.string().min(1), name: z.string().optional(), type: z.string().optional() }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ zoneId, name, type }) => {
      const query = new URLSearchParams({ per_page: "100" });
      if (name) query.set("name", name);
      if (type) query.set("type", type);
      return toolText(await cloudflare<unknown[]>(`/zones/${encodeURIComponent(zoneId)}/dns_records?${query.toString()}`));
    },
  );

  server.registerTool(
    "cloudflare_create_dns_record",
    {
      description: "Cria um registro DNS em uma zona Cloudflare quando o usuário autorizar a alteração.",
      inputSchema: z.object({
        zoneId: z.string().min(1),
        type: z.enum(["A","AAAA","CNAME","TXT","MX","SRV","CAA"]),
        name: z.string().min(1),
        content: z.string().min(1),
        ttl: z.number().int().min(1).default(1),
        proxied: z.boolean().optional(),
        priority: z.number().int().optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (input) => {
      const { zoneId, ...record } = input;
      return toolText(await cloudflare<unknown>(`/zones/${encodeURIComponent(zoneId)}/dns_records`, {
        method: "POST", body: JSON.stringify(record),
      }));
    },
  );

  server.registerTool(
    "cloudflare_update_dns_record",
    {
      description: "Edita um registro DNS existente em uma zona Cloudflare quando o usuário autorizar a alteração.",
      inputSchema: z.object({
        zoneId: z.string().min(1), recordId: z.string().min(1),
        type: z.enum(["A","AAAA","CNAME","TXT","MX","SRV","CAA"]),
        name: z.string().min(1), content: z.string().min(1),
        ttl: z.number().int().min(1).default(1), proxied: z.boolean().optional(),
        priority: z.number().int().optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (input) => {
      const { zoneId, recordId, ...record } = input;
      return toolText(await cloudflare<unknown>(`/zones/${encodeURIComponent(zoneId)}/dns_records/${encodeURIComponent(recordId)}`, {
        method: "PUT", body: JSON.stringify(record),
      }));
    },
  );

  server.registerTool(
    "cloudflare_delete_dns_record",
    {
      description: "Exclui um registro DNS existente. Use somente quando o usuário pedir explicitamente a exclusão.",
      inputSchema: z.object({ zoneId: z.string().min(1), recordId: z.string().min(1) }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async ({ zoneId, recordId }) => toolText(await cloudflare<unknown>(
      `/zones/${encodeURIComponent(zoneId)}/dns_records/${encodeURIComponent(recordId)}`, { method: "DELETE" }
    )),
  );


  server.registerTool(
    "browser_agent_status",
    {
      description: "Verifica se o Browser Agent próprio do VendorAI está disponível. Não usa TinyFish.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async () => {
      const result = await vendorApi<unknown>("/internal/browser-mcp/status");
      return toolText(result);
    },
  );

  server.registerTool(
    "browser_agent_connections",
    {
      description: "Lista as conexões de navegador salvas de um tenant VendorAI. Use tenantKey como ID, slug ou subdomínio.",
      inputSchema: z.object({ tenantKey: z.string().min(1) }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ tenantKey }) => {
      const result = await vendorApi<unknown>("/internal/browser-mcp/connections", {
        method: "POST",
        body: JSON.stringify({ tenantKey }),
      });
      return toolText(result);
    },
  );

  server.registerTool(
    "browser_agent_run",
    {
      description: "Executa uma missão usando o Browser Agent próprio do VendorAI em Chromium remoto. Pode usar uma conexão salva ou uma URL inicial. Tenants com autonomia habilitada executam ações rotineiras automaticamente; ações de alto risco continuam protegidas.",
      inputSchema: z.object({
        tenantKey: z.string().min(1),
        goal: z.string().min(3).max(4000),
        connectionId: z.string().min(1).optional(),
        startUrl: z.string().url().optional(),
        mode: z.enum(["assistido", "autonomo"]).optional(),
        allowWrite: z.boolean().optional(),
        maxSteps: z.number().int().min(1).max(30).default(12),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ tenantKey, goal, connectionId, startUrl, mode, allowWrite, maxSteps }) => {
      const result = await vendorApi<unknown>("/internal/browser-mcp/run", {
        method: "POST",
        body: JSON.stringify({ tenantKey, goal, connectionId, startUrl, mode, allowWrite, maxSteps }),
      });
      return toolText(result);
    },
  );

  return server;
}

const mcpHandler = createMcpHandler(() => createCloudflareMcpServer());
const nodeMcpHandler = toNodeHandler(mcpHandler);
const port = Number(process.env.PORT || 8788);

const httpServer = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  if (await handleOAuth(req, res, url)) return;

  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "vendorai-cloudflare-mcp" }));
    return;
  }

  if (url.pathname === "/internal/custom-hostname") {
    if (!authorized(req)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(405, { "Content-Type": "application/json", "Allow": "POST" });
      res.end(JSON.stringify({ error: "method_not_allowed" }));
      return;
    }

    let raw = "";
    for await (const chunk of req) {
      raw += chunk.toString();
      if (Buffer.byteLength(raw) > 32768) {
        res.writeHead(413, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "payload_too_large" }));
        return;
      }
    }

    try {
      const input = JSON.parse(raw || "{}") as {
        action?: "find" | "createOrGet" | "get" | "delete";
        hostname?: string;
        hostnameId?: string;
      };
      let result: unknown;
      if (input.action === "find" && input.hostname) {
        result = await findSaasCustomHostname(input.hostname);
      } else if (input.action === "createOrGet" && input.hostname) {
        result = await createOrGetSaasCustomHostname(input.hostname);
      } else if (input.action === "get" && input.hostnameId) {
        result = await getSaasCustomHostname(input.hostnameId);
      } else if (input.action === "delete" && input.hostnameId) {
        await deleteSaasCustomHostname(input.hostnameId);
        result = { deleted: true };
      } else {
        res.writeHead(422, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "invalid_action" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ ok: true, result }));
    } catch (error) {
      res.writeHead(502, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    }
    return;
  }

  if (url.pathname !== "/mcp") {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not_found" }));
    return;
  }

  if (!authorized(req)) {
    res.writeHead(401, { "Content-Type": "application/json", "WWW-Authenticate": challenge() });
    res.end(JSON.stringify({ error: "unauthorized" }));
    return;
  }

  await nodeMcpHandler(req, res);
});

httpServer.listen(port, "0.0.0.0", () => {
  console.log(`vendorai-cloudflare-mcp listening on :${port}`);
});

async function shutdown() {
  await mcpHandler.close();
  httpServer.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
