import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import {
  TENANT_A,
  TENANT_B,
  makeToken,
  tokenA,
  tokenB,
  tokenSuperAdmin,
} from "./helpers/auth.js";

// ---------------------------------------------------------------------------
// Hoisted mock state — must be created before vi.mock calls
// ---------------------------------------------------------------------------
const { mockDbSelect, mockDbUpdate, mockDbDelete, mockDbInsert, mockInsertSafeParse } = vi.hoisted(
  () => {
    return {
      mockDbSelect: vi.fn(),
      mockDbUpdate: vi.fn(),
      mockDbDelete: vi.fn(),
      mockDbInsert: vi.fn(),
      // Configurable per-test; defaults to failure so existing tests stay green
      mockInsertSafeParse: vi.fn(() => ({
        success: false,
        error: { message: "not exercised in these tests", flatten: () => ({ fieldErrors: {} }) },
      })),
    };
  }
);

// ---------------------------------------------------------------------------
// Module mocks (hoisted by vitest before imports are resolved)
// ---------------------------------------------------------------------------
vi.mock("@workspace/db", () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
    delete: mockDbDelete,
    insert: mockDbInsert,
  },
  customerIntelligenceTable: {
    id: "id",
    tenantId: "tenantId",
    leadId: "leadId",
    createdAt: "createdAt",
    lastAnalyzedAt: "lastAnalyzedAt",
    updatedAt: "updatedAt",
  },
  leadsTable: {
    id: "id",
    tenantId: "tenantId",
  },
  intelligenceAnalysisLogTable: {
    tenantId: "tenantId",
    tokensUsed: "tokensUsed",
    triggeredBy: "triggeredBy",
    createdAt: "createdAt",
  },
  tenantsTable: {
    id: "id",
    maxAnalysesPerHour: "maxAnalysesPerHour",
  },
  insertCustomerIntelligenceSchema: {
    safeParse: (_body: unknown) => mockInsertSafeParse(),
  },
  updateCustomerIntelligenceSchema: {
    safeParse: () => ({ success: true, data: {} }),
  },
}));

vi.mock("../lib/analyze-intelligence.js", () => ({
  analyzeLeadIntelligence: vi.fn().mockResolvedValue({}),
  ANALYSIS_COOLDOWN_MINUTES: 5,
  ANALYSIS_STALENESS_HOURS: 24,
  ANALYSIS_MESSAGE_THRESHOLD: 5,
  MAX_ANALYSES_PER_TENANT_PER_HOUR: 50,
  AnalysisAlreadyInFlightError: class AnalysisAlreadyInFlightError extends Error {},
}));

// Import only what's needed — a minimal express app avoids pulling in all
// other routes (which would require mocking every table in @workspace/db).
import express from "express";
import { authenticate } from "../middlewares/auth.js";
import customerIntelligenceRouter from "../routes/customer_intelligence.js";

const app = express();
app.use(express.json());
app.use("/api", authenticate, customerIntelligenceRouter);

// ---------------------------------------------------------------------------
// DB mock helpers
// ---------------------------------------------------------------------------
type MockRow = { id: string; tenantId: string; [k: string]: unknown };

/** Single select returning one set of rows for all calls in the test */
function setupSelectReturning(rows: MockRow[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(rows),
    orderBy: vi.fn().mockResolvedValue(rows),
  };
  mockDbSelect.mockReturnValue(chain);
}

/**
 * Sequential selects: first call returns rowArrays[0], second returns rowArrays[1], etc.
 * Any additional calls fall back to the last entry.
 */
function setupSequentialSelects(...rowArrays: MockRow[][]) {
  rowArrays.forEach((rows) => {
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(rows),
      orderBy: vi.fn().mockResolvedValue(rows),
    };
    mockDbSelect.mockReturnValueOnce(chain);
  });
}

function setupUpdateReturning(rows: MockRow[]) {
  const returning = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  mockDbUpdate.mockReturnValue({ set });
}

function setupDeleteSuccess() {
  const where = vi.fn().mockResolvedValue(undefined);
  mockDbDelete.mockReturnValue({ where });
}

/** Insert that supports both .returning() and .onConflictDoNothing() */
function setupInsertReturning(rows: MockRow[]) {
  const returning = vi.fn().mockResolvedValue(rows);
  const onConflictDoNothing = vi.fn().mockResolvedValue([]);
  const values = vi.fn().mockReturnValue({ returning, onConflictDoNothing });
  mockDbInsert.mockReturnValue({ values });
}

/** Insert that raises a unique constraint violation */
function setupInsertUniqueViolation() {
  const pgErr = Object.assign(new Error("duplicate key"), { code: "23505" });
  const returning = vi.fn().mockRejectedValue(pgErr);
  const onConflictDoNothing = vi.fn().mockResolvedValue([]);
  const values = vi.fn().mockReturnValue({ returning, onConflictDoNothing });
  mockDbInsert.mockReturnValue({ values });
}

const RECORD_ID = "ci-record-owned-by-b";
const LEAD_ID_B  = "lead-owned-by-b";

const recordOwnedByTenantB: MockRow = {
  id: RECORD_ID,
  tenantId: TENANT_B,
  churnRisk: 72,
};

const leadOwnedByTenantB: MockRow = {
  id: LEAD_ID_B,
  tenantId: TENANT_B,
};

const leadOwnedByTenantA: MockRow = {
  id: "lead-owned-by-a",
  tenantId: TENANT_A,
};

// ---------------------------------------------------------------------------
// Cross-tenant isolation tests — GET /id, PATCH, DELETE
// ---------------------------------------------------------------------------
describe("GET /api/customer-intelligence/:id — cross-tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSelectReturning([recordOwnedByTenantB]);
  });

  it("returns 403 when tenant A requests a record owned by tenant B", async () => {
    const res = await request(app)
      .get(`/api/customer-intelligence/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: expect.stringContaining("Access denied") });
  });

  it("returns 200 when tenant B requests its own record", async () => {
    const res = await request(app)
      .get(`/api/customer-intelligence/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(RECORD_ID);
  });

  it("returns 200 when super_admin requests a cross-tenant record", async () => {
    const res = await request(app)
      .get(`/api/customer-intelligence/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenSuperAdmin}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(RECORD_ID);
  });

  it("returns 404 when the record does not exist", async () => {
    setupSelectReturning([]);

    const res = await request(app)
      .get(`/api/customer-intelligence/nonexistent`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/customer-intelligence/:id — cross-tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSelectReturning([recordOwnedByTenantB]);
    setupUpdateReturning([{ ...recordOwnedByTenantB, churnRisk: 80 }]);
  });

  it("returns 403 when tenant A patches a record owned by tenant B", async () => {
    const res = await request(app)
      .patch(`/api/customer-intelligence/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ churnRisk: 80 });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: expect.stringContaining("Access denied") });
  });

  it("returns 200 when tenant B patches its own record", async () => {
    const res = await request(app)
      .patch(`/api/customer-intelligence/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ churnRisk: 80 });

    expect(res.status).toBe(200);
  });

  it("returns 200 when super_admin patches a cross-tenant record", async () => {
    const res = await request(app)
      .patch(`/api/customer-intelligence/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenSuperAdmin}`)
      .send({ churnRisk: 80 });

    expect(res.status).toBe(200);
  });

  it("returns 404 when the record does not exist", async () => {
    setupSelectReturning([]);

    const res = await request(app)
      .patch(`/api/customer-intelligence/nonexistent`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ churnRisk: 80 });

    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/customer-intelligence/:id — cross-tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSelectReturning([recordOwnedByTenantB]);
    setupDeleteSuccess();
  });

  it("returns 403 when tenant A deletes a record owned by tenant B", async () => {
    const res = await request(app)
      .delete(`/api/customer-intelligence/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: expect.stringContaining("Access denied") });
  });

  it("returns 204 when tenant B deletes its own record", async () => {
    const res = await request(app)
      .delete(`/api/customer-intelligence/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(204);
  });

  it("returns 204 when super_admin deletes a cross-tenant record", async () => {
    const res = await request(app)
      .delete(`/api/customer-intelligence/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenSuperAdmin}`);

    expect(res.status).toBe(204);
  });

  it("returns 404 when the record does not exist", async () => {
    setupSelectReturning([]);

    const res = await request(app)
      .delete(`/api/customer-intelligence/nonexistent`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /customer-intelligence — lead ownership validation
// ---------------------------------------------------------------------------
describe("POST /api/customer-intelligence — lead ownership validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Make safeParse succeed with a valid body for Tenant B
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockInsertSafeParse.mockReturnValue({
      success: true,
      data: { tenantId: TENANT_B, leadId: LEAD_ID_B },
    } as any);
  });

  it("returns 404 when leadId does not belong to the tenant (cross-tenant poisoning attempt)", async () => {
    // Lead select returns empty — the lead doesn't exist in Tenant B's scope
    setupSelectReturning([]);

    const res = await request(app)
      .post("/api/customer-intelligence")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ tenantId: TENANT_B, leadId: LEAD_ID_B });

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: expect.stringContaining("Lead not found") });
  });

  it("returns 201 when leadId is confirmed to belong to the correct tenant", async () => {
    // Lead select returns the lead, insert returns CI record
    setupSelectReturning([leadOwnedByTenantB]);
    setupInsertReturning([recordOwnedByTenantB]);

    const res = await request(app)
      .post("/api/customer-intelligence")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ tenantId: TENANT_B, leadId: LEAD_ID_B });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(RECORD_ID);
  });

  it("returns 409 when a CI record already exists for the lead (duplicate POST)", async () => {
    // Lead exists but insert throws unique constraint violation
    setupSelectReturning([leadOwnedByTenantB]);
    setupInsertUniqueViolation();

    const res = await request(app)
      .post("/api/customer-intelligence")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ tenantId: TENANT_B, leadId: LEAD_ID_B });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: expect.stringContaining("already exists") });
  });

  it("returns 403 when tenant A tries to create a CI record for tenant B", async () => {
    // safeParse returns tenant B data but request comes from tenant A token
    const res = await request(app)
      .post("/api/customer-intelligence")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ tenantId: TENANT_B, leadId: LEAD_ID_B });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: expect.stringContaining("Access denied") });
  });

  it("super_admin can create a CI record for any tenant when lead exists", async () => {
    setupSelectReturning([leadOwnedByTenantB]);
    setupInsertReturning([recordOwnedByTenantB]);

    const res = await request(app)
      .post("/api/customer-intelligence")
      .set("Authorization", `Bearer ${tokenSuperAdmin}`)
      .send({ tenantId: TENANT_B, leadId: LEAD_ID_B });

    expect(res.status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// GET /tenants/:tenantId/leads/:leadId/intelligence — upsert & lead ownership
// ---------------------------------------------------------------------------
describe("GET /api/tenants/:tenantId/leads/:leadId/intelligence — lead ownership & upsert idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 when tenant A requests intelligence for tenant B's lead path", async () => {
    const res = await request(app)
      .get(`/api/tenants/${TENANT_B}/leads/${LEAD_ID_B}/intelligence`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: expect.stringContaining("Access denied") });
  });

  it("returns 404 when leadId does not belong to the tenant (prevents cross-tenant poisoning via upsert)", async () => {
    // First select (leads check) returns empty — lead not in this tenant
    setupSequentialSelects([]);

    const res = await request(app)
      .get(`/api/tenants/${TENANT_B}/leads/${LEAD_ID_B}/intelligence`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: expect.stringContaining("Lead not found") });
    // Insert must NOT have been called — the poisoning attempt was blocked
    expect(mockDbInsert).not.toHaveBeenCalled();
  });

  it("returns 200 with CI record when lead belongs to tenant (upsert creates on first call)", async () => {
    // First select (leads check) → lead found
    // Insert (onConflictDoNothing) → no-op / creates row
    // Second select (CI record) → returns CI record
    setupSequentialSelects([leadOwnedByTenantB], [recordOwnedByTenantB]);
    setupInsertReturning([recordOwnedByTenantB]);

    const res = await request(app)
      .get(`/api/tenants/${TENANT_B}/leads/${LEAD_ID_B}/intelligence`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(RECORD_ID);
    expect(mockDbInsert).toHaveBeenCalledOnce();
  });

  it("returns 200 idempotently on second call (upsert does nothing, existing row returned)", async () => {
    // Both selects return valid data; insert is a no-op via onConflictDoNothing
    setupSequentialSelects([leadOwnedByTenantB], [recordOwnedByTenantB]);
    setupInsertReturning([]);

    const res = await request(app)
      .get(`/api/tenants/${TENANT_B}/leads/${LEAD_ID_B}/intelligence`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(RECORD_ID);
  });

  it("super_admin can access any tenant's intelligence endpoint", async () => {
    setupSequentialSelects([leadOwnedByTenantB], [recordOwnedByTenantB]);
    setupInsertReturning([recordOwnedByTenantB]);

    const res = await request(app)
      .get(`/api/tenants/${TENANT_B}/leads/${LEAD_ID_B}/intelligence`)
      .set("Authorization", `Bearer ${tokenSuperAdmin}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(RECORD_ID);
  });
});

// ---------------------------------------------------------------------------
// Unauthenticated access
// ---------------------------------------------------------------------------
describe("Unauthenticated access", () => {
  it("returns 401 for GET without a token", async () => {
    const res = await request(app).get(`/api/customer-intelligence/${RECORD_ID}`);
    expect(res.status).toBe(401);
  });

  it("returns 401 for PATCH without a token", async () => {
    const res = await request(app)
      .patch(`/api/customer-intelligence/${RECORD_ID}`)
      .send({ churnRisk: 80 });
    expect(res.status).toBe(401);
  });

  it("returns 401 for DELETE without a token", async () => {
    const res = await request(app).delete(`/api/customer-intelligence/${RECORD_ID}`);
    expect(res.status).toBe(401);
  });
});
