import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Logger } from "pino";

// ---------------------------------------------------------------------------
// Hoisted mock state — must be created before vi.mock calls
// ---------------------------------------------------------------------------
const { mockDbSelect, mockDbInsert, mockDbUpdate } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
  mockDbUpdate: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock("@workspace/db", () => ({
  db: {
    select: mockDbSelect,
    insert: mockDbInsert,
    update: mockDbUpdate,
  },
  customerIntelligenceTable: {
    id: "id",
    leadId: "leadId",
    tenantId: "tenantId",
    isAnalyzing: "isAnalyzing",
    lastAnalyzedAt: "lastAnalyzedAt",
    updatedAt: "updatedAt",
  },
  leadsTable: { id: "id", tenantId: "tenantId" },
  intelligenceAnalysisLogTable: {},
  agentConfigsTable: {},
  conversationsTable: {},
  messagesTable: { leadId: "leadId", tenantId: "tenantId", createdAt: "createdAt" },
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
  tenantsTable: {
    id: "id",
    analysisStalenessHours: "analysisStalenessHours",
    analysisMessageThreshold: "analysisMessageThreshold",
  },
}));

vi.mock("openai", () => ({
  default: vi.fn(() => ({
    chat: { completions: { create: vi.fn() } },
  })),
}));

vi.mock("../routes/rules.js", () => ({
  evaluateForLead: vi.fn().mockResolvedValue({ triggered: 0, results: [] }),
}));

// ---------------------------------------------------------------------------
// Import the real function under test (after mocks are in place)
// ---------------------------------------------------------------------------
import {
  maybeReanalyze,
  ANALYSIS_STALENESS_HOURS,
  ANALYSIS_MESSAGE_THRESHOLD,
} from "../lib/analyze-intelligence.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------
const TENANT_ID = "tenant-threshold-tests";

const fakeLog = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  fatal: vi.fn(),
  child: vi.fn().mockReturnThis(),
} as unknown as Logger;

/**
 * Drain the microtask/timer queue so the fire-and-forget promise inside
 * maybeReanalyze has time to settle (all mocks resolve synchronously).
 */
async function flushPromises(): Promise<void> {
  await new Promise<void>((r) => setTimeout(r, 0));
  await new Promise<void>((r) => setTimeout(r, 0));
}

/**
 * Builds a minimal select chain: db.select({...}).from(table).where(...) → rows
 */
function makeSelectChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(rows),
    }),
  };
}

/**
 * Builds a lock-acquisition insert chain. Returning [] simulates the "already
 * in flight" DB response (0 rows), which causes analyzeLeadIntelligence to
 * throw AnalysisAlreadyInFlightError — caught by maybeReanalyze's .catch.
 * This is the cheapest way to verify that analysis was triggered without
 * running the full AI pipeline.
 */
function makeInsertChain(returningRows: unknown[]) {
  return {
    values: vi.fn().mockReturnValue({
      onConflictDoUpdate: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(returningRows),
      }),
    }),
  };
}

/** A timestamp N hours in the past */
function hoursAgo(n: number): Date {
  return new Date(Date.now() - n * 60 * 60 * 1000);
}

beforeEach(() => {
  vi.clearAllMocks();
  // mockDbUpdate is needed if analyzeLeadIntelligence's finally block fires
  // (releases the DB lock). In most tests it won't be reached, but set a
  // safe default to avoid "not a function" errors.
  mockDbUpdate.mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    }),
  });
});

// ---------------------------------------------------------------------------
// Tests: per-tenant thresholds override global defaults
// ---------------------------------------------------------------------------
describe("maybeReanalyze — per-tenant threshold overrides", () => {
  describe("analysisStalenessHours override", () => {
    it("uses the tenant staleness hours instead of the global env default", async () => {
      // The lead was analyzed 25 hours ago.
      // Global default (ANALYSIS_STALENESS_HOURS) is 24 h → would be considered stale.
      // The tenant sets 100 h → NOT stale → analysis should not fire.
      const leadId = "lead-staleness-override-no-trigger";
      const tenantStalenessHours = 100; // much longer than global default of 24h

      mockDbSelect
        // 1. Tenant settings query inside maybeReanalyze
        .mockReturnValueOnce(
          makeSelectChain([
            {
              analysisStalenessHours: tenantStalenessHours,
              analysisMessageThreshold: null,
            },
          ])
        )
        // 2. CI record — lastAnalyzedAt is 25h ago (stale by global 24h, fresh by tenant 100h)
        .mockReturnValueOnce(makeSelectChain([{ lastAnalyzedAt: hoursAgo(25) }]))
        // 3. Message count (reached because staleness check passes — not stale by tenant's hours)
        .mockReturnValueOnce(makeSelectChain([{ newMessageCount: 0 }]));

      maybeReanalyze({ tenantId: TENANT_ID, leadId, log: fakeLog });
      await flushPromises();

      // analyzeLeadIntelligence was NOT called — no lock-acquisition insert
      expect(mockDbInsert).not.toHaveBeenCalled();
    });

    it("triggers re-analysis when tenant staleness hours are shorter than the global default", async () => {
      // The lead was analyzed 3 hours ago.
      // Global default is 24h → would NOT be considered stale.
      // The tenant sets 2h → IS stale → analysis should fire.
      const leadId = "lead-staleness-override-triggers";
      const tenantStalenessHours = 2; // shorter than global default of 24h
      const leadRow = { id: leadId, tenantId: TENANT_ID, nome: "Test Lead" };

      mockDbSelect
        // 1. Tenant settings
        .mockReturnValueOnce(
          makeSelectChain([
            {
              analysisStalenessHours: tenantStalenessHours,
              analysisMessageThreshold: null,
            },
          ])
        )
        // 2. CI record — 3h ago: stale by tenant's 2h, fresh by global 24h
        .mockReturnValueOnce(makeSelectChain([{ lastAnalyzedAt: hoursAgo(3) }]))
        // 3. Lead lookup inside analyzeLeadIntelligence
        .mockReturnValueOnce(makeSelectChain([leadRow]));

      // Simulate "already in flight" so the DB lock insert returns 0 rows,
      // causing an AnalysisAlreadyInFlightError. This verifies analysis was
      // attempted without running the full AI pipeline.
      mockDbInsert.mockReturnValue(makeInsertChain([]));

      maybeReanalyze({ tenantId: TENANT_ID, leadId, log: fakeLog });
      await flushPromises();

      // Lock-acquisition insert was called → analyzeLeadIntelligence was triggered
      expect(mockDbInsert).toHaveBeenCalledTimes(1);
    });
  });

  describe("analysisMessageThreshold override", () => {
    it("uses the tenant message threshold instead of the global env default", async () => {
      // 10 new messages since last analysis.
      // Global default (ANALYSIS_MESSAGE_THRESHOLD) is 5 → would trigger.
      // Tenant sets threshold to 20 → 10 < 20, should NOT trigger.
      const leadId = "lead-msg-threshold-override-no-trigger";
      const tenantMessageThreshold = 20;

      mockDbSelect
        // 1. Tenant settings
        .mockReturnValueOnce(
          makeSelectChain([
            {
              analysisStalenessHours: null,
              analysisMessageThreshold: tenantMessageThreshold,
            },
          ])
        )
        // 2. CI record — only 1h ago (not stale, even by global default)
        .mockReturnValueOnce(makeSelectChain([{ lastAnalyzedAt: hoursAgo(1) }]))
        // 3. Message count — 10 new messages, below tenant's 20 but above global 5
        .mockReturnValueOnce(makeSelectChain([{ newMessageCount: 10 }]));

      maybeReanalyze({ tenantId: TENANT_ID, leadId, log: fakeLog });
      await flushPromises();

      // analysis was NOT triggered — no lock-acquisition insert
      expect(mockDbInsert).not.toHaveBeenCalled();
    });

    it("triggers re-analysis when message count meets the tenant threshold", async () => {
      // 25 new messages since last analysis.
      // Tenant sets threshold to 20 → 25 >= 20 → analysis should fire.
      const leadId = "lead-msg-threshold-override-triggers";
      const tenantMessageThreshold = 20;
      const leadRow = { id: leadId, tenantId: TENANT_ID, nome: "Test Lead" };

      mockDbSelect
        // 1. Tenant settings
        .mockReturnValueOnce(
          makeSelectChain([
            {
              analysisStalenessHours: null,
              analysisMessageThreshold: tenantMessageThreshold,
            },
          ])
        )
        // 2. CI record — 1h ago (not stale)
        .mockReturnValueOnce(makeSelectChain([{ lastAnalyzedAt: hoursAgo(1) }]))
        // 3. Message count — 25 new messages, above tenant's 20
        .mockReturnValueOnce(makeSelectChain([{ newMessageCount: 25 }]))
        // 4. Lead lookup inside analyzeLeadIntelligence
        .mockReturnValueOnce(makeSelectChain([leadRow]));

      mockDbInsert.mockReturnValue(makeInsertChain([]));

      maybeReanalyze({ tenantId: TENANT_ID, leadId, log: fakeLog });
      await flushPromises();

      // Lock-acquisition insert was called → analyzeLeadIntelligence was triggered
      expect(mockDbInsert).toHaveBeenCalledTimes(1);
    });
  });

  describe("null tenant overrides fall back to global env defaults", () => {
    it("falls back to global staleness default when tenant has null analysisStalenessHours", async () => {
      // Lead was analyzed 25 hours ago.
      // Tenant has null analysisStalenessHours → use global default (ANALYSIS_STALENESS_HOURS = 24h).
      // 25h > 24h → stale → analysis should fire.
      const leadId = "lead-null-staleness-fallback";
      const leadRow = { id: leadId, tenantId: TENANT_ID, nome: "Test Lead" };

      expect(ANALYSIS_STALENESS_HOURS).toBe(24); // confirm the global default

      mockDbSelect
        // 1. Tenant settings — both null
        .mockReturnValueOnce(
          makeSelectChain([
            { analysisStalenessHours: null, analysisMessageThreshold: null },
          ])
        )
        // 2. CI record — 25h ago (stale by global 24h default)
        .mockReturnValueOnce(makeSelectChain([{ lastAnalyzedAt: hoursAgo(25) }]))
        // 3. Lead lookup inside analyzeLeadIntelligence
        .mockReturnValueOnce(makeSelectChain([leadRow]));

      mockDbInsert.mockReturnValue(makeInsertChain([]));

      maybeReanalyze({ tenantId: TENANT_ID, leadId, log: fakeLog });
      await flushPromises();

      // Global default caused analysis to fire
      expect(mockDbInsert).toHaveBeenCalledTimes(1);
    });

    it("falls back to global message threshold default when tenant has null analysisMessageThreshold", async () => {
      // 6 new messages since last analysis.
      // Tenant has null analysisMessageThreshold → use global default (ANALYSIS_MESSAGE_THRESHOLD = 5).
      // 6 >= 5 → analysis should fire.
      const leadId = "lead-null-msg-threshold-fallback";
      const leadRow = { id: leadId, tenantId: TENANT_ID, nome: "Test Lead" };

      expect(ANALYSIS_MESSAGE_THRESHOLD).toBe(5); // confirm the global default

      mockDbSelect
        // 1. Tenant settings — both null
        .mockReturnValueOnce(
          makeSelectChain([
            { analysisStalenessHours: null, analysisMessageThreshold: null },
          ])
        )
        // 2. CI record — 1h ago (not stale by global 24h default)
        .mockReturnValueOnce(makeSelectChain([{ lastAnalyzedAt: hoursAgo(1) }]))
        // 3. Message count — 6 new messages, meets global threshold of 5
        .mockReturnValueOnce(makeSelectChain([{ newMessageCount: 6 }]))
        // 4. Lead lookup inside analyzeLeadIntelligence
        .mockReturnValueOnce(makeSelectChain([leadRow]));

      mockDbInsert.mockReturnValue(makeInsertChain([]));

      maybeReanalyze({ tenantId: TENANT_ID, leadId, log: fakeLog });
      await flushPromises();

      // Global default caused analysis to fire
      expect(mockDbInsert).toHaveBeenCalledTimes(1);
    });

    it("does not trigger re-analysis when count is below global default and tenant has null threshold", async () => {
      // 3 new messages since last analysis.
      // Tenant has null analysisMessageThreshold → use global default of 5.
      // 3 < 5 → should NOT fire.
      const leadId = "lead-null-threshold-below-default";

      mockDbSelect
        // 1. Tenant settings — both null
        .mockReturnValueOnce(
          makeSelectChain([
            { analysisStalenessHours: null, analysisMessageThreshold: null },
          ])
        )
        // 2. CI record — 1h ago (not stale)
        .mockReturnValueOnce(makeSelectChain([{ lastAnalyzedAt: hoursAgo(1) }]))
        // 3. Message count — 3, below global default of 5
        .mockReturnValueOnce(makeSelectChain([{ newMessageCount: 3 }]));

      maybeReanalyze({ tenantId: TENANT_ID, leadId, log: fakeLog });
      await flushPromises();

      expect(mockDbInsert).not.toHaveBeenCalled();
    });
  });
});
