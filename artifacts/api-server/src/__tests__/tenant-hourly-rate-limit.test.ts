import { mockSelectQuery } from "./helpers/isolation.js";
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { tokenA, TENANT_A } from "./helpers/auth.js";

// ---------------------------------------------------------------------------
// Hoisted mock state — must be created before vi.mock calls
// MOCKED_LIMIT is declared here so vi.mock factories (which are hoisted) can
// safely reference it. It simulates MAX_ANALYSES_PER_TENANT_PER_HOUR=3 via
// the env-var override path in production.
// ---------------------------------------------------------------------------
const {
  mockDbSelect,
  mockAnalyze,
  MockAnalysisAlreadyInFlightError,
  MOCKED_LIMIT,
  capturedGteArgs,
} = vi.hoisted(() => {
  class MockAnalysisAlreadyInFlightError extends Error {
    constructor(leadId: string) {
      super(`Analysis already in flight for lead ${leadId}`);
      this.name = "AnalysisAlreadyInFlightError";
    }
  }
  return {
    mockDbSelect: vi.fn(),
    mockAnalyze: vi.fn(),
    MockAnalysisAlreadyInFlightError,
    MOCKED_LIMIT: 3,
    capturedGteArgs: [] as unknown[][],
  };
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock("@workspace/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@workspace/db")>()),
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
    updatedAt: "updatedAt",
  },
  intelligenceAnalysisLogTable: {
    tenantId: "tenantId",
    createdAt: "createdAt",
  },
  tenantsTable: {
    id: "id",
    maxAnalysesPerHour: "maxAnalysesPerHour",
  },
  insertCustomerIntelligenceSchema: {
    safeParse: () => ({ success: false, error: { message: "not exercised here" } }),
  },
  updateCustomerIntelligenceSchema: {
    safeParse: () => ({ success: true, data: {} }),
  },
}));

vi.mock("../lib/analyze-intelligence.js", () => ({
  analyzeLeadIntelligence: mockAnalyze,
  AnalysisAlreadyInFlightError: MockAnalysisAlreadyInFlightError,
  ANALYSIS_COOLDOWN_MINUTES: 5,
  MAX_ANALYSES_PER_TENANT_PER_HOUR: MOCKED_LIMIT,
}));

vi.mock("../middlewares/plan-guard.js", () => ({
  checkPlanModule: vi.fn().mockResolvedValue({ allowed: true }),
  checkAgentPlan: vi.fn().mockResolvedValue({ allowed: true }),
}));

// Wrap drizzle-orm's `gte` so we can inspect the date argument the route
// passes for the createdAt column filter. The real gte runs so SQL
// expression objects are valid; we just record the call arguments.
vi.mock("drizzle-orm", async (importOriginal) => {
  const original = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...original,
    gte: (...args: unknown[]) => {
      capturedGteArgs.push(args);
      return (original.gte as (...a: unknown[]) => unknown)(...args);
    },
  };
});

// ---------------------------------------------------------------------------
// Minimal Express app
// ---------------------------------------------------------------------------
import express, { type Request, type Response, type NextFunction } from "express";
import { authenticate } from "../middlewares/auth.js";
import customerIntelligenceRouter from "../routes/customer_intelligence.js";

const app = express();
app.use(express.json());

// The analyze route calls req.log.warn / req.log.info (pino-http).
// Attach a no-op logger so those calls don't throw in the test environment.
app.use((req: Request, _res: Response, next: NextFunction) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (req as any).log = {
    fatal: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
    silent: vi.fn(),
    level: "info",
    msgPrefix: "",
  };
  next();
});

app.use("/api", authenticate, customerIntelligenceRouter);

// ---------------------------------------------------------------------------
// DB mock helpers
// ---------------------------------------------------------------------------
const LEAD_ID = "lead-hourly-rate-limit-test";

/**
 * Configures the two db.select() calls made by the analyze route before it
 * invokes analyzeLeadIntelligence:
 *   1. Hourly rolling-window count for the tenant
 *   2. Per-lead cooldown check (empty → no cooldown active)
 */
function setupHourlyCountSelect(recentCount: number) {
  mockDbSelect
    // Validate lead scope before rate-limit accounting.
    .mockReturnValueOnce(mockSelectQuery([{ id: "lead-test" }]))
    // 1. Hourly rolling-window count (intelligenceAnalysisLogTable)
    .mockReturnValueOnce({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([{ recentCount }]),
    })
    // 2. Tenant maxAnalysesPerHour override (tenantsTable) — fetched in parallel with (1)
    .mockReturnValueOnce({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([{ maxAnalysesPerHour: null }]),
    })
    // 3. Per-lead cooldown check (customerIntelligenceTable)
    .mockReturnValueOnce({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    });
}

// ---------------------------------------------------------------------------
// Tests: rate-limit fires on recent rows
// ---------------------------------------------------------------------------
describe(
  "POST /api/tenants/:tenantId/leads/:leadId/intelligence/analyze — hourly rate limit fires",
  () => {
    beforeEach(() => {
      vi.resetAllMocks();
      capturedGteArgs.length = 0;
      mockAnalyze.mockResolvedValue({ churnRisk: 42 });
    });

    it("returns 429 when recentCount exactly equals the hourly limit", async () => {
      setupHourlyCountSelect(MOCKED_LIMIT);

      const res = await request(app)
        .post(`/api/tenants/${TENANT_A}/leads/${LEAD_ID}/intelligence/analyze`)
        .set("Authorization", `Bearer ${tokenA}`);

      expect(res.status).toBe(429);
    });

    it("returns 429 when recentCount exceeds the hourly limit", async () => {
      setupHourlyCountSelect(MOCKED_LIMIT + 10);

      const res = await request(app)
        .post(`/api/tenants/${TENANT_A}/leads/${LEAD_ID}/intelligence/analyze`)
        .set("Authorization", `Bearer ${tokenA}`);

      expect(res.status).toBe(429);
    });

    it("includes a descriptive error message in the 429 body", async () => {
      setupHourlyCountSelect(MOCKED_LIMIT);

      const res = await request(app)
        .post(`/api/tenants/${TENANT_A}/leads/${LEAD_ID}/intelligence/analyze`)
        .set("Authorization", `Bearer ${tokenA}`);

      expect(res.body).toMatchObject({
        error: expect.stringContaining("exceeded the maximum"),
      });
    });

    it("includes retryAfterSeconds: 3600 in the 429 body", async () => {
      setupHourlyCountSelect(MOCKED_LIMIT);

      const res = await request(app)
        .post(`/api/tenants/${TENANT_A}/leads/${LEAD_ID}/intelligence/analyze`)
        .set("Authorization", `Bearer ${tokenA}`);

      expect(res.body.retryAfterSeconds).toBe(3600);
    });

    it("echoes back the current recentCount in the 429 body", async () => {
      const overCount = MOCKED_LIMIT + 2;
      setupHourlyCountSelect(overCount);

      const res = await request(app)
        .post(`/api/tenants/${TENANT_A}/leads/${LEAD_ID}/intelligence/analyze`)
        .set("Authorization", `Bearer ${tokenA}`);

      expect(res.body.recentCount).toBe(overCount);
    });

    it("echoes back the configured limit in the 429 body", async () => {
      setupHourlyCountSelect(MOCKED_LIMIT);

      const res = await request(app)
        .post(`/api/tenants/${TENANT_A}/leads/${LEAD_ID}/intelligence/analyze`)
        .set("Authorization", `Bearer ${tokenA}`);

      expect(res.body.limit).toBe(MOCKED_LIMIT);
    });

    it("does not call analyzeLeadIntelligence when the hourly limit is exceeded", async () => {
      setupHourlyCountSelect(MOCKED_LIMIT);

      await request(app)
        .post(`/api/tenants/${TENANT_A}/leads/${LEAD_ID}/intelligence/analyze`)
        .set("Authorization", `Bearer ${tokenA}`);

      expect(mockAnalyze).not.toHaveBeenCalled();
    });
  }
);

// ---------------------------------------------------------------------------
// Tests: the WHERE clause uses a rolling one-hour time window
//
// The route builds:
//   gte(intelligenceAnalysisLogTable.createdAt, new Date(Date.now() - 3600_000))
//
// By spying on drizzle-orm's `gte` we can verify the date argument is
// approximately one hour ago, proving the query only counts recent rows.
// Old rows (createdAt < oneHourAgo) fall outside this window and are excluded
// by the database — the spy confirms the boundary date is sent correctly.
// ---------------------------------------------------------------------------
describe(
  "POST /api/tenants/:tenantId/leads/:leadId/intelligence/analyze — WHERE clause uses rolling 1-hour window",
  () => {
    beforeEach(() => {
      vi.resetAllMocks();
      capturedGteArgs.length = 0;
      mockAnalyze.mockResolvedValue({ churnRisk: 42 });
    });

    it("passes a Date approximately one hour ago as the lower-bound to gte()", async () => {
      setupHourlyCountSelect(0);

      const before = Date.now();

      await request(app)
        .post(`/api/tenants/${TENANT_A}/leads/${LEAD_ID}/intelligence/analyze`)
        .set("Authorization", `Bearer ${tokenA}`);

      const after = Date.now();

      // Find the gte() call that received a Date argument (createdAt boundary)
      const dateCall = capturedGteArgs.find(([, val]) => val instanceof Date);
      expect(dateCall, "gte() must be called with a Date for the createdAt filter").toBeDefined();

      const cutoff = (dateCall![1] as Date).getTime();
      // The cutoff must lie within [before - 3600s, after - 3600s]
      expect(cutoff).toBeGreaterThanOrEqual(before - 3_600_000 - 100); // 100ms tolerance
      expect(cutoff).toBeLessThanOrEqual(after - 3_600_000 + 100);
    });

    it("references the intelligenceAnalysisLogTable.createdAt column in gte()", async () => {
      setupHourlyCountSelect(0);

      await request(app)
        .post(`/api/tenants/${TENANT_A}/leads/${LEAD_ID}/intelligence/analyze`)
        .set("Authorization", `Bearer ${tokenA}`);

      // In the mock setup, intelligenceAnalysisLogTable.createdAt === "createdAt"
      const dateCall = capturedGteArgs.find(([, val]) => val instanceof Date);
      expect(dateCall).toBeDefined();
      expect(dateCall![0]).toBe("createdAt");
    });

    it("still enforces the rate limit even when the WHERE clause filters out old rows (recentCount = 0 → allow)", async () => {
      // Simulates: many old rows exist, but zero within the past hour.
      // DB returns recentCount = 0 because its WHERE clause excludes old rows.
      setupHourlyCountSelect(0);

      const res = await request(app)
        .post(`/api/tenants/${TENANT_A}/leads/${LEAD_ID}/intelligence/analyze`)
        .set("Authorization", `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(mockAnalyze).toHaveBeenCalledOnce();
    });

    it("blocks the request when recent rows alone reach the cap (old rows not counted)", async () => {
      // Simulates: recent rows = cap; old rows exist but are excluded by the window.
      setupHourlyCountSelect(MOCKED_LIMIT);

      const res = await request(app)
        .post(`/api/tenants/${TENANT_A}/leads/${LEAD_ID}/intelligence/analyze`)
        .set("Authorization", `Bearer ${tokenA}`);

      expect(res.status).toBe(429);
    });
  }
);

// ---------------------------------------------------------------------------
// Tests: env-var override — the route uses the value from the module constant
//
// The module constant MAX_ANALYSES_PER_TENANT_PER_HOUR is set to MOCKED_LIMIT (3)
// in the vi.mock factory above. This models what happens when the
// MAX_ANALYSES_PER_TENANT_PER_HOUR env var is overridden to a custom value.
// The companion file hourly-rate-limit-env-override.unit.test.ts separately
// verifies that the module constant is actually parsed from process.env at
// load time.
// ---------------------------------------------------------------------------
describe(
  "POST /api/tenants/:tenantId/leads/:leadId/intelligence/analyze — env-var override reflected in route",
  () => {
    beforeEach(() => {
      vi.resetAllMocks();
      capturedGteArgs.length = 0;
      mockAnalyze.mockResolvedValue({ churnRisk: 42 });
    });

    it(`rejects at exactly the overridden limit of ${MOCKED_LIMIT}`, async () => {
      setupHourlyCountSelect(MOCKED_LIMIT);

      const res = await request(app)
        .post(`/api/tenants/${TENANT_A}/leads/${LEAD_ID}/intelligence/analyze`)
        .set("Authorization", `Bearer ${tokenA}`);

      expect(res.status).toBe(429);
      expect(res.body.limit).toBe(MOCKED_LIMIT);
    });

    it("allows the request at one below the overridden limit", async () => {
      setupHourlyCountSelect(MOCKED_LIMIT - 1);

      const res = await request(app)
        .post(`/api/tenants/${TENANT_A}/leads/${LEAD_ID}/intelligence/analyze`)
        .set("Authorization", `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
    });

    it("echoes the same constant in the limit field as the one used for comparison", async () => {
      setupHourlyCountSelect(MOCKED_LIMIT);

      const res = await request(app)
        .post(`/api/tenants/${TENANT_A}/leads/${LEAD_ID}/intelligence/analyze`)
        .set("Authorization", `Bearer ${tokenA}`);

      expect(res.status).toBe(429);
      expect(res.body.limit).toBe(MOCKED_LIMIT);
      expect(res.body.recentCount).toBeGreaterThanOrEqual(res.body.limit);
    });
  }
);
