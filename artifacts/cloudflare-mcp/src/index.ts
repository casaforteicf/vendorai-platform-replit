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

function accountId(): string {
  return requiredEnv("CLOUDFLARE_ACCOUNT_ID");
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


async function vendorApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const base = (process.env["VENDORAI_API_BASE"] || "https://vendorai-platform-replit-production.up.railway.app").replace(/\/$/, "");
  const token = requiredEnv("BROWSER_MCP_ACCESS_TOKEN");
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail =
      payload && typeof payload === "object"
        ? JSON.stringify(payload)
        : response.statusText;
    throw new Error(`VendorAI API ${response.status}: ${detail}`);
  }
  return payload as T;
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
      const projects = await cloudflare<unknown[]>(`/accounts/${accountId()}/pages/projects?per_page=1`);
      return toolText({ connected: true, accountId: accountId(), pagesApiReachable: Array.isArray(projects) });
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
      const result = await cloudflare<unknown[]>(`/accounts/${accountId()}/pages/projects?per_page=${perPage}`);
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
      const result = await cloudflare<unknown>(`/accounts/${accountId()}/pages/projects/${encodeURIComponent(projectName)}`);
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
      const result = await cloudflare<unknown>(`/accounts/${accountId()}/pages/projects`, {
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
      const result = await cloudflare<unknown[]>(`/accounts/${accountId()}/pages/projects/${encodeURIComponent(projectName)}/deployments?per_page=${perPage}`);
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
      const result = await cloudflare<unknown>(`/accounts/${accountId()}/pages/projects/${encodeURIComponent(projectName)}/deployments`, {
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
      const query = new URLSearchParams({ "account.id": accountId(), per_page: "50" });
      if (name) query.set("name", name);
      const result = await cloudflare<unknown[]>(`/zones?${query.toString()}`);
      return toolText(result);
    },
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
      inputSchema: z.object({
        tenantKey: z.string().min(1),
      }),
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
      description: "Executa uma missão usando o Browser Agent próprio do VendorAI em Chromium remoto. Pode usar uma conexão salva ou uma URL inicial. Ações sensíveis exigem allowWrite=true.",
      inputSchema: z.object({
        tenantKey: z.string().min(1),
        goal: z.string().min(3).max(4000),
        connectionId: z.string().min(1).optional(),
        startUrl: z.string().url().optional(),
        allowWrite: z.boolean().default(false),
        maxSteps: z.number().int().min(1).max(30).default(12),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ tenantKey, goal, connectionId, startUrl, allowWrite, maxSteps }) => {
      const result = await vendorApi<unknown>("/internal/browser-mcp/run", {
        method: "POST",
        body: JSON.stringify({ tenantKey, goal, connectionId, startUrl, allowWrite, maxSteps }),
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