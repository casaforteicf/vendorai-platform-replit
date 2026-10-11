/**
 * Verifies that MAX_ANALYSES_PER_TENANT_PER_HOUR in analyze-intelligence.ts
 * is actually parsed from process.env at module load time — not hardcoded.
 *
 * Strategy: vi.resetModules() clears the module registry before each test.
 * The subsequent dynamic import then re-evaluates analyze-intelligence.ts with
 * the current process.env, letting us assert the constant reflects the env var.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Minimal mocks for analyze-intelligence.ts's heavy dependencies so the
// module import succeeds without a real DB or OpenAI client.
// ---------------------------------------------------------------------------
vi.mock("@workspace/db", () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn() },
  customerIntelligenceTable: {},
  intelligenceAnalysisLogTable: {},
  agentConfigsTable: {},
  leadsTable: {},
  conversationsTable: {},
  messagesTable: {},
  activitiesTable: {},
  propostasTable: {
    id: "id",
    tenantId: "tenantId",
    leadId: "leadId",
    dealId: "dealId",
    titulo: "titulo",
    numero: "numero",
    status: "status",
    valorTotal: "valorTotal",
    valorMensal: "valorMensal",
    recorrente: "recorrente",
    createdAt: "createdAt",
    updatedAt: "updatedAt",
  },
  dealsTable: { id: "id", valor: "valor", tenantId: "tenantId" },
  tenantsTable: {},
}));

vi.mock("openai", () => ({
  default: vi.fn(() => ({
    chat: { completions: { create: vi.fn() } },
  })),
}));

vi.mock("../routes/rules.js", () => ({
  evaluateForLead: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Each test starts with a clean module registry so analyze-intelligence.ts is
// re-evaluated from scratch with the env var we set for that test.
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.resetModules();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("MAX_ANALYSES_PER_TENANT_PER_HOUR — env-var parsing in analyze-intelligence.ts", () => {
  it("reads a custom value from process.env when MAX_ANALYSES_PER_TENANT_PER_HOUR is set", async () => {
    process.env["MAX_ANALYSES_PER_TENANT_PER_HOUR"] = "7";

    const mod = await import("../lib/analyze-intelligence.js");
    const result = mod.MAX_ANALYSES_PER_TENANT_PER_HOUR;

    delete process.env["MAX_ANALYSES_PER_TENANT_PER_HOUR"];
    expect(result).toBe(7);
  });

  it("defaults to 50 when MAX_ANALYSES_PER_TENANT_PER_HOUR is not set", async () => {
    delete process.env["MAX_ANALYSES_PER_TENANT_PER_HOUR"];

    const mod = await import("../lib/analyze-intelligence.js");
    const result = mod.MAX_ANALYSES_PER_TENANT_PER_HOUR;

    expect(result).toBe(50);
  });

  it("parses the env var as a number (not a string)", async () => {
    process.env["MAX_ANALYSES_PER_TENANT_PER_HOUR"] = "15";

    const mod = await import("../lib/analyze-intelligence.js");
    const result = mod.MAX_ANALYSES_PER_TENANT_PER_HOUR;

    delete process.env["MAX_ANALYSES_PER_TENANT_PER_HOUR"];
    expect(typeof result).toBe("number");
    expect(result).toBe(15);
  });
});
