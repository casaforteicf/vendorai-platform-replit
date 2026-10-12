import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { tokenA, TENANT_A } from "./helpers/auth.js";

// ---------------------------------------------------------------------------
// Hoisted mock state — must be created before vi.mock calls
// ---------------------------------------------------------------------------
const { mockDbSelect, MockAnalysisAlreadyInFlightError, mockAnalyze } = vi.hoisted(() => {
  class MockAnalysisAlreadyInFlightError extends Error {
    constructor(leadId: string) {
      super(`Analysis already in flight for lead ${leadId}`);
      this.name = "AnalysisAlreadyInFlightError";
    }
  }

  return {
    mockDbSelect: vi.fn(),
    MockAnalysisAlreadyInFlightError,
    mockAnalyze: vi.fn(),
  };
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock("@workspace/db", () => ({
  db: {
    select: mockDbSelect,
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  customerIntelligenceTable: {
    id: "id",
    tenantId: "tenantId",
    leadId: "leadId",
    lastAnalyzedAt: "lastAnalyzedAt",
    isAnalyzing: "isAnalyzing",
    updatedAt: "updatedAt",
  },
  intelligenceAnalysisLogTable: {
    tenantId: "tenantId",
    createdAt: "createdAt",
  },
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
  tenantsTable: {
    id: "id",
    maxAnalysesPerHour: "maxAnalysesPerHour",
  },
  // These are referenced by the router's POST /customer-intelligence route
  insertCustomerIntelligenceSchema: {
    safeParse: () => ({ success: false, error: { message: "not exercised here" } }),
  },
  updateCustomerIntelligenceSchema: {
    safeParse: () => ({ success: true, data: {} }),
  },
}));

// Mock the entire analyze-intelligence module so we control what
// analyzeLeadIntelligence throws — and export the *same* class that the
// route uses for its `instanceof AnalysisAlreadyInFlightError` check.
vi.mock("../lib/analyze-intelligence.js", () => ({
  analyzeLeadIntelligence: mockAnalyze,
  AnalysisAlreadyInFlightError: MockAnalysisAlreadyInFlightError,
  ANALYSIS_COOLDOWN_MINUTES: 5,
  MAX_ANALYSES_PER_TENANT_PER_HOUR: 50,
}));

vi.mock("../middlewares/plan-guard.js", () => ({
  checkPlanModule: vi.fn().mockResolvedValue({ allowed: true }),
  checkAgentPlan: vi.fn().mockResolvedValue({ allowed: true }),
}));

// ---------------------------------------------------------------------------
// Minimal Express app — mirrors the pattern in customer-intelligence-isolation
// ---------------------------------------------------------------------------
import express from "express";
import { authenticate } from "../middlewares/auth.js";
import customerIntelligenceRouter from "../routes/customer_intelligence.js";

const app = express();
app.use(express.json());
app.use("/api", authenticate, customerIntelligenceRouter);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const LEAD_ID = "lead-409-route-test";

/**
 * Sets up the two DB selects that the analyze route performs before it ever
 * calls analyzeLeadIntelligence:
 *   1. Hourly rate-limit count → 0 (well within limit)
 *   2. Per-lead cooldown check → no existing record (no cooldown)
 */
function setupPassthroughDbSelects() {
  mockDbSelect
    // 1. Hourly rolling-window count → 0 (well within limit)
    .mockReturnValueOnce({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([{ recentCount: 0 }]),
    })
    // 2. Tenant maxAnalysesPerHour override — fetched in parallel with (1)
    .mockReturnValueOnce({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([{ maxAnalysesPerHour: null }]),
    })
    // 3. Per-lead cooldown check → no existing record (no cooldown)
    .mockReturnValueOnce({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("POST /api/tenants/:tenantId/leads/:leadId/intelligence/analyze — 409 on duplicate analysis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupPassthroughDbSelects();
    // Make the analysis function throw AnalysisAlreadyInFlightError
    mockAnalyze.mockRejectedValue(new MockAnalysisAlreadyInFlightError(LEAD_ID));
  });

  it("returns 409 with a descriptive message when analyzeLeadIntelligence throws AnalysisAlreadyInFlightError", async () => {
    const res = await request(app)
      .post(`/api/tenants/${TENANT_A}/leads/${LEAD_ID}/intelligence/analyze`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      error: expect.stringContaining("already running"),
    });
  });

  it("does not propagate AnalysisAlreadyInFlightError as a 500", async () => {
    const res = await request(app)
      .post(`/api/tenants/${TENANT_A}/leads/${LEAD_ID}/intelligence/analyze`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).not.toBe(500);
  });
});
