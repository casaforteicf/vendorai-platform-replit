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
import { MockRow, createDbHelpers } from "./helpers/isolation.js";

const {
  mockDbSelect,
  mockDbUpdate,
  mockDbDelete,
  mockDbInsert,
  mockCanAccessActivity,
  mockCanAccessLead,
  mockCanViewAllScopedData,
} = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockDbDelete: vi.fn(),
  mockDbInsert: vi.fn(),
  mockCanAccessActivity: vi.fn(),
  mockCanAccessLead: vi.fn(),
  mockCanViewAllScopedData: vi.fn(),
}));

vi.mock("../lib/lead-scope-access.js", () => ({
  canAccessActivity: mockCanAccessActivity,
  canAccessLead: mockCanAccessLead,
  canViewAllScopedData: mockCanViewAllScopedData,
  leadOwnedByUserCondition: vi.fn(() => "lead-owned-condition"),
}));

vi.mock("@workspace/db", () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
    delete: mockDbDelete,
    insert: mockDbInsert,
  },
  activitiesTable: {
    id: "id",
    tenantId: "tenantId",
    createdAt: "createdAt",
    updatedAt: "updatedAt",
    leadId: "leadId",
    dealId: "dealId",
    status: "status",
    dataVencimento: "dataVencimento",
    concluidaEm: "concluidaEm",
  },
  insertActivitySchema: {
    safeParse: () => ({ success: false, error: { message: "not exercised" } }),
  },
  updateActivitySchema: {
    safeParse: () => ({ success: true, data: {} }),
  },
}));

import express from "express";
import { authenticate } from "../middlewares/auth.js";
import activitiesRouter from "../routes/activities.js";

const app = express();
app.use(express.json());
app.use("/api", authenticate, activitiesRouter);

const { setupSelectReturning, setupUpdateReturning, setupDeleteSuccess } = createDbHelpers({
  mockDbSelect,
  mockDbUpdate,
  mockDbDelete,
  mockDbInsert,
});

const RECORD_ID = "activity-owned-by-b";

const recordOwnedByTenantB: MockRow = {
  id: RECORD_ID,
  tenantId: TENANT_B,
  tipo: "call",
  status: "pendente",
};

describe("GET /api/activities/:id — cross-tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSelectReturning([recordOwnedByTenantB]);
    mockCanAccessActivity.mockImplementation(async (req: any, tenantId: string) =>
      req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId
    );
    mockCanAccessLead.mockResolvedValue(true);
    mockCanViewAllScopedData.mockResolvedValue(false);
  });

  it("returns 403 when tenant A requests a record owned by tenant B", async () => {
    const res = await request(app)
      .get(`/api/activities/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: expect.stringContaining("Access denied") });
  });

  it("returns 403 when a same-tenant user is outside the activity scope", async () => {
    mockCanAccessActivity.mockResolvedValueOnce(false);

    const res = await request(app)
      .get(`/api/activities/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: expect.stringContaining("Access denied") });
  });

  it("returns 200 when tenant B requests its own record", async () => {
    const res = await request(app)
      .get(`/api/activities/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(RECORD_ID);
  });

  it("returns 200 when super_admin requests a cross-tenant record", async () => {
    const res = await request(app)
      .get(`/api/activities/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenSuperAdmin}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(RECORD_ID);
  });

  it("returns 404 when the record does not exist", async () => {
    setupSelectReturning([]);

    const res = await request(app)
      .get(`/api/activities/nonexistent`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/activities/:id — cross-tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSelectReturning([recordOwnedByTenantB]);
    mockCanAccessActivity.mockImplementation(async (req: any, tenantId: string) =>
      req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId
    );
    mockCanAccessLead.mockResolvedValue(true);
    mockCanViewAllScopedData.mockResolvedValue(false);
    setupUpdateReturning([{ ...recordOwnedByTenantB, status: "concluida" }]);
  });

  it("returns 403 when tenant A patches a record owned by tenant B", async () => {
    const res = await request(app)
      .patch(`/api/activities/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ status: "concluida" });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: expect.stringContaining("Access denied") });
  });

  it("returns 200 when tenant B patches its own record", async () => {
    const res = await request(app)
      .patch(`/api/activities/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ status: "concluida" });

    expect(res.status).toBe(200);
  });

  it("returns 200 when super_admin patches a cross-tenant record", async () => {
    const res = await request(app)
      .patch(`/api/activities/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenSuperAdmin}`)
      .send({ status: "concluida" });

    expect(res.status).toBe(200);
  });

  it("returns 404 when the record does not exist", async () => {
    setupSelectReturning([]);

    const res = await request(app)
      .patch(`/api/activities/nonexistent`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ status: "concluida" });

    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/activities/:id — cross-tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSelectReturning([recordOwnedByTenantB]);
    mockCanAccessActivity.mockImplementation(async (req: any, tenantId: string) =>
      req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId
    );
    mockCanAccessLead.mockResolvedValue(true);
    mockCanViewAllScopedData.mockResolvedValue(false);
    setupDeleteSuccess();
  });

  it("returns 403 when tenant A deletes a record owned by tenant B", async () => {
    const res = await request(app)
      .delete(`/api/activities/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: expect.stringContaining("Access denied") });
  });

  it("returns 204 when tenant B deletes its own record", async () => {
    const res = await request(app)
      .delete(`/api/activities/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(204);
  });

  it("returns 204 when super_admin deletes a cross-tenant record", async () => {
    const res = await request(app)
      .delete(`/api/activities/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenSuperAdmin}`);

    expect(res.status).toBe(204);
  });

  it("returns 404 when the record does not exist", async () => {
    setupSelectReturning([]);

    const res = await request(app)
      .delete(`/api/activities/nonexistent`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
  });
});

describe("Unauthenticated access — activities", () => {
  it("returns 401 for GET without a token", async () => {
    const res = await request(app).get(`/api/activities/${RECORD_ID}`);
    expect(res.status).toBe(401);
  });

  it("returns 401 for PATCH without a token", async () => {
    const res = await request(app)
      .patch(`/api/activities/${RECORD_ID}`)
      .send({ status: "concluida" });
    expect(res.status).toBe(401);
  });

  it("returns 401 for DELETE without a token", async () => {
    const res = await request(app).delete(`/api/activities/${RECORD_ID}`);
    expect(res.status).toBe(401);
  });
});