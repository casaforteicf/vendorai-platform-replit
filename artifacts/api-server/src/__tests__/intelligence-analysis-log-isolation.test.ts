import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import {
  TENANT_A,
  TENANT_B,
  tokenA,
  tokenB,
  tokenSuperAdmin,
} from "./helpers/auth.js";

// ---------------------------------------------------------------------------
// Hoisted mock state — must be created before vi.mock calls
// ---------------------------------------------------------------------------
const { mockDbSelect } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
}));

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
  intelligenceAnalysisLogTable: {
    tenantId: "tenantId",
    createdAt: "createdAt",
    tokensUsed: "tokensUsed",
    triggeredBy: "triggeredBy",
  },
  customerIntelligenceTable: {
    id: "id",
    tenantId: "tenantId",
    leadId: "leadId",
    lastAnalyzedAt: "lastAnalyzedAt",
    updatedAt: "updatedAt",
  },
  insertCustomerIntelligenceSchema: {
    safeParse: () => ({ success: false, error: { message: "not exercised here" } }),
  },
  updateCustomerIntelligenceSchema: {
    safeParse: () => ({ success: true, data: {} }),
  },
}));

vi.mock("../lib/analyze-intelligence.js", () => ({
  analyzeLeadIntelligence: vi.fn().mockResolvedValue({}),
  AnalysisAlreadyInFlightError: class AnalysisAlreadyInFlightError extends Error {},
  ANALYSIS_COOLDOWN_MINUTES: 5,
  MAX_ANALYSES_PER_TENANT_PER_HOUR: 50,
}));

import express from "express";
import { authenticate } from "../middlewares/auth.js";
import customerIntelligenceRouter from "../routes/customer_intelligence.js";

const app = express();
app.use(express.json());
app.use("/api", authenticate, customerIntelligenceRouter);

// ---------------------------------------------------------------------------
// DB mock helpers
// ---------------------------------------------------------------------------

type LogRow = {
  id: string;
  tenantId: string;
  leadId: string;
  tokensUsed: number;
  triggeredBy: string;
  createdAt: string;
};

type ByTriggerRow = { triggeredBy: string; calls: number; tokens: string };

/**
 * Sets up the four parallel db.select() calls the log endpoint makes:
 *   1. Paginated items list
 *   2. Aggregate totals (totalCalls, totalTokens) — resolved via Promise .then()
 *   3. Per-trigger breakdown — groupBy
 *   4. Rolling-hour count — resolved via Promise .then()
 */
function setupLogSelects(
  items: LogRow[],
  totals: { totalCalls: number; totalTokens: string },
  byTrigger: ByTriggerRow[],
  rollingHourCount = 0
) {
  mockDbSelect
    // Query 1: paginated items — chain ends with .offset()
    .mockReturnValueOnce({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockResolvedValue(items),
    })
    // Query 2: aggregate totals — chain ends with .where() which must be
    // thenable because the route calls .then(rows => rows[0] ?? ...)
    .mockReturnValueOnce({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([totals]),
    })
    // Query 3: per-trigger breakdown — chain ends with .groupBy()
    .mockReturnValueOnce({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockResolvedValue(byTrigger),
    })
    // Query 4: rolling-hour count — chain ends with .where() which must be
    // thenable because the route calls .then(rows => rows[0] ?? ...)
    .mockReturnValueOnce({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([{ recentCount: rollingHourCount }]),
    });
}

const SAMPLE_ITEMS: LogRow[] = [
  {
    id: "log-1",
    tenantId: TENANT_B,
    leadId: "lead-1",
    tokensUsed: 120,
    triggeredBy: "manual",
    createdAt: new Date().toISOString(),
  },
  {
    id: "log-2",
    tenantId: TENANT_B,
    leadId: "lead-2",
    tokensUsed: 80,
    triggeredBy: "auto",
    createdAt: new Date().toISOString(),
  },
];

const SAMPLE_TOTALS = { totalCalls: 2, totalTokens: "200" };

const SAMPLE_BY_TRIGGER: ByTriggerRow[] = [
  { triggeredBy: "manual", calls: 1, tokens: "120" },
  { triggeredBy: "auto",   calls: 1, tokens: "80"  },
];

// ---------------------------------------------------------------------------
// Access-control tests
// ---------------------------------------------------------------------------
describe("GET /api/tenants/:tenantId/intelligence-analysis-log — access control", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupLogSelects(SAMPLE_ITEMS, SAMPLE_TOTALS, SAMPLE_BY_TRIGGER);
  });

  it("returns 401 when no token is provided", async () => {
    const res = await request(app).get(
      `/api/tenants/${TENANT_B}/intelligence-analysis-log`
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when tenant A requests tenant B's log", async () => {
    const res = await request(app)
      .get(`/api/tenants/${TENANT_B}/intelligence-analysis-log`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: expect.stringContaining("Access denied") });
  });

  it("returns 200 when a tenant user reads their own log", async () => {
    const res = await request(app)
      .get(`/api/tenants/${TENANT_B}/intelligence-analysis-log`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(200);
  });

  it("returns 200 when super_admin reads any tenant's log", async () => {
    const res = await request(app)
      .get(`/api/tenants/${TENANT_B}/intelligence-analysis-log`)
      .set("Authorization", `Bearer ${tokenSuperAdmin}`);

    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Response shape tests
// ---------------------------------------------------------------------------
describe("GET /api/tenants/:tenantId/intelligence-analysis-log — response shape", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupLogSelects(SAMPLE_ITEMS, SAMPLE_TOTALS, SAMPLE_BY_TRIGGER);
  });

  it("returns items array and pagination fields", async () => {
    const res = await request(app)
      .get(`/api/tenants/${TENANT_B}/intelligence-analysis-log`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({ id: "log-1", tenantId: TENANT_B }),
      ]),
      page:  1,
      limit: 20,
    });
    expect(typeof res.body.total).toBe("number");
  });

  it("includes aggregate stats with totalCalls, totalTokens, byTriggeredBy, rollingHourCount, and hourlyLimit", async () => {
    const res = await request(app)
      .get(`/api/tenants/${TENANT_B}/intelligence-analysis-log`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(200);
    expect(res.body.stats).toMatchObject({
      totalCalls:  2,
      totalTokens: 200,
      byTriggeredBy: {
        manual: { calls: 1, tokens: 120 },
        auto:   { calls: 1, tokens: 80  },
      },
      rollingHourCount: 0,
      hourlyLimit: 50,
    });
  });

  it("total in the response matches stats.totalCalls", async () => {
    const res = await request(app)
      .get(`/api/tenants/${TENANT_B}/intelligence-analysis-log`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(res.body.stats.totalCalls);
  });
});

// ---------------------------------------------------------------------------
// Pagination parameter tests
// ---------------------------------------------------------------------------
describe("GET /api/tenants/:tenantId/intelligence-analysis-log — pagination params", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reflects custom page and limit in the response", async () => {
    setupLogSelects([], { totalCalls: 0, totalTokens: "0" }, []);

    const res = await request(app)
      .get(`/api/tenants/${TENANT_B}/intelligence-analysis-log?page=3&limit=5`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(200);
    expect(res.body.page).toBe(3);
    expect(res.body.limit).toBe(5);
  });

  it("clamps limit to 100 when a larger value is provided", async () => {
    setupLogSelects([], { totalCalls: 0, totalTokens: "0" }, []);

    const res = await request(app)
      .get(`/api/tenants/${TENANT_B}/intelligence-analysis-log?limit=500`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(100);
  });

  it("defaults to page 1 and limit 20 when no params are supplied", async () => {
    setupLogSelects([], { totalCalls: 0, totalTokens: "0" }, []);

    const res = await request(app)
      .get(`/api/tenants/${TENANT_B}/intelligence-analysis-log`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(20);
  });

  it("returns empty items and zero totals when the tenant has no log entries", async () => {
    setupLogSelects([], { totalCalls: 0, totalTokens: "0" }, []);

    const res = await request(app)
      .get(`/api/tenants/${TENANT_B}/intelligence-analysis-log`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
    expect(res.body.stats.totalCalls).toBe(0);
    expect(res.body.stats.totalTokens).toBe(0);
    expect(res.body.stats.byTriggeredBy).toEqual({});
    expect(res.body.stats.rollingHourCount).toBe(0);
    expect(res.body.stats.hourlyLimit).toBe(50);
  });
});
