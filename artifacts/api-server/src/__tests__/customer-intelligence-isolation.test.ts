import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

const TEST_SECRET = "test-jwt-secret-for-unit-tests";

// ---------------------------------------------------------------------------
// Hoisted mock state — must be created before vi.mock calls
// ---------------------------------------------------------------------------
const { mockDbSelect, mockDbUpdate, mockDbDelete, mockDbInsert } = vi.hoisted(
  () => {
    return {
      mockDbSelect: vi.fn(),
      mockDbUpdate: vi.fn(),
      mockDbDelete: vi.fn(),
      mockDbInsert: vi.fn(),
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
  insertCustomerIntelligenceSchema: {
    safeParse: () => ({ success: false, error: { message: "not exercised in these tests" } }),
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
// JWT helpers
// ---------------------------------------------------------------------------
function makeToken(
  tenantId: string,
  platformRole: "super_admin" | "tenant_admin" | "member" = "tenant_admin"
): string {
  return jwt.sign(
    {
      sub: `user-${tenantId}`,
      email: `user@${tenantId}.example.com`,
      platformRole,
      tenantId,
      role: "admin",
    },
    TEST_SECRET,
    { expiresIn: "1h" }
  );
}

// ---------------------------------------------------------------------------
// DB mock helpers
// ---------------------------------------------------------------------------
type MockRow = { id: string; tenantId: string; [k: string]: unknown };

function setupSelectReturning(rows: MockRow[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(rows),
    orderBy: vi.fn().mockResolvedValue(rows),
  };
  mockDbSelect.mockReturnValue(chain);
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

// ---------------------------------------------------------------------------
// Shared test fixture
// ---------------------------------------------------------------------------
const TENANT_A = "tenant-alpha";
const TENANT_B = "tenant-beta";
const RECORD_ID = "ci-record-owned-by-b";

const recordOwnedByTenantB: MockRow = {
  id: RECORD_ID,
  tenantId: TENANT_B,
  churnRisk: 72,
};

const tokenA = makeToken(TENANT_A);
const tokenB = makeToken(TENANT_B);
const tokenSuperAdmin = makeToken("platform", "super_admin");

// ---------------------------------------------------------------------------
// Cross-tenant isolation tests
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
