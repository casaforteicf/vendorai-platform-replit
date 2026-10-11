import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Browser Agent MCP contract", () => {
  const source = readFileSync(new URL("../routes/browser_agent_mcp.ts", import.meta.url), "utf8");
  const agentSource = readFileSync(new URL("../services/browser-agent.ts", import.meta.url), "utf8");

  it("exposes the protected status, connections and run endpoints", () => {
    expect(source).toContain('router.use("/internal/browser-mcp"');
    expect(source).toContain('router.get("/internal/browser-mcp/status"');
    expect(source).toContain('router.post("/internal/browser-mcp/connections"');
    expect(source).toContain('router.post("/internal/browser-mcp/run"');
  });

  it("requires the Browser MCP access token before protected operations", () => {
    expect(source).toContain('req.headers.authorization === `Bearer ${expected}`');
    expect(source).toContain('res.status(401).json({ error: "unauthorized" })');
  });

  it("keeps tenant resolution and connection selection tenant-scoped", () => {
    expect(source).toContain('eq(browserAgentConnectionsTable.tenantId, tenantId)');
    expect(source).toContain('or(');
    expect(source).toContain('eq(tenantsTable.slug, tenantKey)');
    expect(source).toContain('eq(tenantsTable.subdomainSlug, tenantKey)');
  });

  it("preserves persistent session/profile and first-party auth handoff", () => {
    expect(source).toContain('persistentConnections: true');
    expect(source).toContain('persistentProfiles: true');
    expect(source).toContain('onSessionPersist');
    expect(source).toContain('onProfilePersist');
    expect(source).toContain('firstPartyAuthToken');
    expect(source).toContain('firstPartyAuthUserCache');
    expect(agentSource).toContain('sessionCookies');
  });

  it("keeps write operations gated by autonomy/approval", () => {
    expect(source).toContain('const allowWrite = globalVendiAutonomy ? true : (parsed.data.allowWrite ?? autonomyEnabled);');
    expect(agentSource).toContain('APPROVAL_REQUIRED');
  });
});
