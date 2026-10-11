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
    updatedAt: "updatedAt",
  },
  leadsTable: { id: "id", tenantId: "tenantId" },
  intelligenceAnalysisLogTable: {},
  agentConfigsTable: {},
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
  evaluateForLead: vi.fn().mockResolvedValue({ triggered: 0, results: [] }),
}));

// ---------------------------------------------------------------------------
// Import the real function under test (after mocks are in place)
// ---------------------------------------------------------------------------
import {
  analyzeLeadIntelligence,
  AnalysisAlreadyInFlightError,
} from "../lib/analyze-intelligence.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------
const TENANT_ID = "tenant-duplicate-guard-tests";

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
 * Builds a minimal DB select chain where `.where()` resolves with `rows`.
 * Used for the lead-validation query inside analyzeLeadIntelligence.
 */
function makeSelectChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(rows),
  };
}

/**
 * Builds a DB insert chain where `.returning()` returns the given promise.
 * Matches the shape used by the lock-acquisition INSERT...ON CONFLICT statement.
 */
function makeInsertChain(returningPromise: Promise<unknown[]>) {
  return {
    values: vi.fn().mockReturnValue({
      onConflictDoUpdate: vi.fn().mockReturnValue({
        returning: vi.fn().mockReturnValue(returningPromise),
      }),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("analyzeLeadIntelligence — in-process concurrency guard (inFlightAnalyses)", () => {
  it("second concurrent call throws AnalysisAlreadyInFlightError while first is in flight", async () => {
    const leadId = "lead-concurrent-guard-1";
    const leadRow = { id: leadId, tenantId: TENANT_ID, nome: "Test Lead" };

    // Lead validation resolves immediately for both calls
    mockDbSelect.mockReturnValue(makeSelectChain([leadRow]));

    // DB lock acquisition: use a controlled promise so call 1 hangs there indefinitely
    let releaseInsert!: (rows: unknown[]) => void;
    const hangingInsert = new Promise<unknown[]>((resolve) => {
      releaseInsert = resolve;
    });
    mockDbInsert.mockReturnValue(makeInsertChain(hangingInsert));

    // Start call 1 — it will advance past the db.select (lead validation),
    // add leadId to inFlightAnalyses, then block at db.insert.
    const call1 = analyzeLeadIntelligence({ tenantId: TENANT_ID, leadId, log: fakeLog });

    // Drain the microtask queue (including call 1's continuation after the
    // db.select resolves) so inFlightAnalyses.add(leadId) has run.
    await new Promise<void>((r) => setTimeout(r, 0));

    // Call 2 should hit the in-process guard and throw immediately —
    // without touching the DB at all.
    await expect(
      analyzeLeadIntelligence({ tenantId: TENANT_ID, leadId, log: fakeLog })
    ).rejects.toBeInstanceOf(AnalysisAlreadyInFlightError);

    // Clean up call 1: resolve the hanging insert with an empty result so the
    // code path throws AnalysisAlreadyInFlightError from the DB guard and
    // the finally block runs (clearing the in-process lock).
    releaseInsert([]);
    await expect(call1).rejects.toBeInstanceOf(AnalysisAlreadyInFlightError);
  });

  it("in-process lock is always released after failure, so a subsequent call can proceed", async () => {
    const leadId = "lead-lock-release-1";
    const leadRow = { id: leadId, tenantId: TENANT_ID, nome: "Test Lead" };
    const dbError = new Error("Simulated DB failure");

    // Both calls: lead validation succeeds, lock acquisition fails
    mockDbSelect.mockReturnValue(makeSelectChain([leadRow]));
    mockDbInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(dbError),
        }),
      }),
    });

    // Call 1 should fail with the DB error (NOT AnalysisAlreadyInFlightError).
    // The finally block must delete leadId from inFlightAnalyses so call 2 can run.
    await expect(
      analyzeLeadIntelligence({ tenantId: TENANT_ID, leadId, log: fakeLog })
    ).rejects.toThrow("Simulated DB failure");

    // Call 2 starts after call 1 has fully settled.
    // If the in-process lock was NOT released, call 2 would throw
    // AnalysisAlreadyInFlightError synchronously (before any DB interaction).
    // We verify it does NOT — it fails for the same DB reason instead, proving
    // the lock was released.
    const error = await analyzeLeadIntelligence({ tenantId: TENANT_ID, leadId, log: fakeLog }).catch(
      (e: unknown) => e
    );

    expect(error).not.toBeInstanceOf(AnalysisAlreadyInFlightError);
    expect((error as Error).message).toBe("Simulated DB failure");
  });
});
