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
    churnReasonsEditedBy: "churnReasonsEditedBy",
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
  AnalysisAlreadyInFlightError,
} from "./analyze-intelligence.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------
const TENANT_ID = "tenant-core-maybeReanalyze-tests";
const LEAD_ID   = "lead-core-maybeReanalyze-tests";

const fakeLog = {
  info:  vi.fn(),
  warn:  vi.fn(),
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
 * Builds a lock-acquisition insert chain. Returning [] simulates the
 * "already in flight" DB response (0 rows), which causes
 * analyzeLeadIntelligence to throw AnalysisAlreadyInFlightError.
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

/**
 * Sets up the select mock for the staleness path (no message-count query
 * needed because analysis is triggered by staleness).
 *
 * Select call order inside maybeReanalyze:
 *   1. Tenant settings
 *   2. CI record (lastAnalyzedAt)
 *   3. Lead validation inside analyzeLeadIntelligence (if analysis fires)
 */
function setupStalenessSelects(lastAnalyzedAt: Date | null, leadRow: unknown) {
  mockDbSelect
    // 1. Tenant settings — use global defaults (null overrides)
    .mockReturnValueOnce(
      makeSelectChain([{ analysisStalenessHours: null, analysisMessageThreshold: null }])
    )
    // 2. CI record
    .mockReturnValueOnce(
      makeSelectChain(lastAnalyzedAt ? [{ lastAnalyzedAt }] : [])
    )
    // 3. Lead lookup inside analyzeLeadIntelligence
    .mockReturnValueOnce(makeSelectChain([leadRow]));
}

/**
 * Sets up the select mock for the message-count path (not stale, so
 * the staleness check passes through to counting messages).
 *
 * Select call order:
 *   1. Tenant settings
 *   2. CI record (not stale)
 *   3. Message count
 *   4. Lead validation inside analyzeLeadIntelligence (if analysis fires)
 */
function setupMessageCountSelects(
  lastAnalyzedAt: Date,
  newMessageCount: number,
  leadRow?: unknown
) {
  mockDbSelect
    // 1. Tenant settings
    .mockReturnValueOnce(
      makeSelectChain([{ analysisStalenessHours: null, analysisMessageThreshold: null }])
    )
    // 2. CI record — recent, not stale
    .mockReturnValueOnce(makeSelectChain([{ lastAnalyzedAt }]))
    // 3. Message count
    .mockReturnValueOnce(makeSelectChain([{ newMessageCount }]));

  if (leadRow !== undefined) {
    // 4. Lead lookup inside analyzeLeadIntelligence
    mockDbSelect.mockReturnValueOnce(makeSelectChain([leadRow]));
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  // Provide a safe default for the DB-level lock release in finally blocks.
  mockDbUpdate.mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    }),
  });
});

// ---------------------------------------------------------------------------
// Tests: core trigger scenarios
// ---------------------------------------------------------------------------
describe("maybeReanalyze — core trigger scenarios", () => {
  describe("never-analyzed lead", () => {
    it("triggers analysis immediately when the lead has never been analyzed (no CI record)", async () => {
      // No CI record → lastAnalyzedAt is null → isStale = true → must fire.
      const leadRow = { id: LEAD_ID, tenantId: TENANT_ID, nome: "Fresh Lead" };
      setupStalenessSelects(null, leadRow);

      // Returning [] from the insert simulates "DB lock already held", which
      // causes AnalysisAlreadyInFlightError inside analyzeLeadIntelligence.
      // maybeReanalyze catches it silently — but the insert call proves
      // analyzeLeadIntelligence was invoked.
      mockDbInsert.mockReturnValue(makeInsertChain([]));

      maybeReanalyze({ tenantId: TENANT_ID, leadId: LEAD_ID, log: fakeLog });
      await flushPromises();

      expect(mockDbInsert).toHaveBeenCalledTimes(1);
    });
  });

  describe("staleness threshold", () => {
    it("triggers when lastAnalyzedAt is older than ANALYSIS_STALENESS_HOURS", async () => {
      // Analyzed more than the global default ago → stale → must fire.
      const staleTime = hoursAgo(ANALYSIS_STALENESS_HOURS + 1);
      const leadRow = { id: LEAD_ID, tenantId: TENANT_ID, nome: "Stale Lead" };
      setupStalenessSelects(staleTime, leadRow);
      mockDbInsert.mockReturnValue(makeInsertChain([]));

      maybeReanalyze({ tenantId: TENANT_ID, leadId: LEAD_ID, log: fakeLog });
      await flushPromises();

      expect(mockDbInsert).toHaveBeenCalledTimes(1);
    });

    it("does not trigger when lastAnalyzedAt is within ANALYSIS_STALENESS_HOURS and message count is below threshold", async () => {
      // Analyzed recently AND few new messages → should NOT fire.
      const recentTime = hoursAgo(ANALYSIS_STALENESS_HOURS - 1);
      setupMessageCountSelects(recentTime, ANALYSIS_MESSAGE_THRESHOLD - 1);

      maybeReanalyze({ tenantId: TENANT_ID, leadId: LEAD_ID, log: fakeLog });
      await flushPromises();

      expect(mockDbInsert).not.toHaveBeenCalled();
    });
  });

  describe("message count threshold", () => {
    it("does not trigger when new message count is below threshold", async () => {
      const recentTime = hoursAgo(1);
      const countBelowThreshold = ANALYSIS_MESSAGE_THRESHOLD - 1;
      setupMessageCountSelects(recentTime, countBelowThreshold);

      maybeReanalyze({ tenantId: TENANT_ID, leadId: LEAD_ID, log: fakeLog });
      await flushPromises();

      expect(mockDbInsert).not.toHaveBeenCalled();
    });

    it("triggers when new message count exactly meets the threshold", async () => {
      const recentTime = hoursAgo(1);
      const leadRow = { id: LEAD_ID, tenantId: TENANT_ID, nome: "At-threshold Lead" };
      setupMessageCountSelects(recentTime, ANALYSIS_MESSAGE_THRESHOLD, leadRow);
      mockDbInsert.mockReturnValue(makeInsertChain([]));

      maybeReanalyze({ tenantId: TENANT_ID, leadId: LEAD_ID, log: fakeLog });
      await flushPromises();

      expect(mockDbInsert).toHaveBeenCalledTimes(1);
    });

    it("triggers when new message count exceeds the threshold", async () => {
      const recentTime = hoursAgo(1);
      const leadRow = { id: LEAD_ID, tenantId: TENANT_ID, nome: "Above-threshold Lead" };
      setupMessageCountSelects(recentTime, ANALYSIS_MESSAGE_THRESHOLD + 5, leadRow);
      mockDbInsert.mockReturnValue(makeInsertChain([]));

      maybeReanalyze({ tenantId: TENANT_ID, leadId: LEAD_ID, log: fakeLog });
      await flushPromises();

      expect(mockDbInsert).toHaveBeenCalledTimes(1);
    });
  });

  describe("already-in-flight guard", () => {
    it("catches AnalysisAlreadyInFlightError silently and logs debug (not error)", async () => {
      // Stale lead so analysis fires, but analyzeLeadIntelligence throws
      // AnalysisAlreadyInFlightError (simulated via 0-row insert return).
      // maybeReanalyze must NOT propagate the error and must log.debug.
      const staleTime = hoursAgo(ANALYSIS_STALENESS_HOURS + 1);
      const leadRow = { id: LEAD_ID, tenantId: TENANT_ID, nome: "In-flight Lead" };
      setupStalenessSelects(staleTime, leadRow);
      mockDbInsert.mockReturnValue(makeInsertChain([]));

      maybeReanalyze({ tenantId: TENANT_ID, leadId: LEAD_ID, log: fakeLog });
      await flushPromises();

      // The AnalysisAlreadyInFlightError path logs debug, not error.
      expect(fakeLog.debug).toHaveBeenCalledWith(
        expect.objectContaining({ leadId: LEAD_ID, tenantId: TENANT_ID }),
        expect.stringContaining("already in flight")
      );
      expect(fakeLog.error).not.toHaveBeenCalled();
    });

    it("logs error for unexpected failures (not AnalysisAlreadyInFlightError)", async () => {
      // Tenant query throws an unexpected error → maybeReanalyze must catch
      // it and call log.error (not silently swallow).
      mockDbSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockRejectedValue(new Error("Unexpected DB failure")),
        }),
      });

      maybeReanalyze({ tenantId: TENANT_ID, leadId: LEAD_ID, log: fakeLog });
      await flushPromises();

      expect(fakeLog.error).toHaveBeenCalledWith(
        expect.objectContaining({ leadId: LEAD_ID, tenantId: TENANT_ID }),
        expect.stringContaining("background re-analysis failed")
      );
    });
  });
});
