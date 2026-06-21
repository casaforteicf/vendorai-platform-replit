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

const { mockDbSelect, mockDbUpdate, mockDbDelete, mockDbInsert, mockDbTransaction } = vi.hoisted(
  () => ({
    mockDbSelect: vi.fn(),
    mockDbUpdate: vi.fn(),
    mockDbDelete: vi.fn(),
    mockDbInsert: vi.fn(),
    mockDbTransaction: vi.fn(),
  })
);

vi.mock("@workspace/db", () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
    delete: mockDbDelete,
    insert: mockDbInsert,
    transaction: mockDbTransaction,
  },
  leadsTable: {
    id: "id",
    tenantId: "tenantId",
    createdAt: "createdAt",
    updatedAt: "updatedAt",
  },
  conversationsTable: { id: "id", tenantId: "tenantId", leadId: "leadId" },
  messagesTable: { id: "id", tenantId: "tenantId", leadId: "leadId" },
  dealsTable: { id: "id", tenantId: "tenantId", leadId: "leadId" },
  propostasTable: { id: "id", tenantId: "tenantId", leadId: "leadId" },
  activitiesTable: { id: "id", tenantId: "tenantId", leadId: "leadId" },
  customerIntelligenceTable: { id: "id", tenantId: "tenantId", leadId: "leadId" },
  agentTasksTable: { id: "id", tenantId: "tenantId", leadId: "leadId" },
  agentActionsLogTable: { id: "id", tenantId: "tenantId", leadId: "leadId" },
  consentsTable: { id: "id", tenantId: "tenantId", leadId: "leadId" },
  intelligenceAnalysisLogTable: { id: "id", tenantId: "tenantId", leadId: "leadId" },
  leadBriefingsTable: { id: "id", tenantId: "tenantId", leadId: "leadId" },
  leadProposalsTable: { id: "id", tenantId: "tenantId", leadId: "leadId" },
  insertLeadSchema: {
    safeParse: () => ({ success: false, error: { message: "not exercised" } }),
  },
  updateLeadSchema: {
    safeParse: () => ({ success: true, data: {} }),
  },
}));

import express from "express";
import { authenticate } from "../middlewares/auth.js";
import leadsRouter from "../routes/leads.js";

const app = express();
app.use(express.json());
app.use("/api", authenticate, leadsRouter);

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

const RECORD_ID = "lead-owned-by-b";

const recordOwnedByTenantB: MockRow = {
  id: RECORD_ID,
  tenantId: TENANT_B,
  nome: "Acme Corp",
};

describe("GET /api/leads/:id — cross-tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSelectReturning([recordOwnedByTenantB]);
  });

  it("returns 403 when tenant A requests a record owned by tenant B", async () => {
    const res = await request(app)
      .get(`/api/leads/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: expect.stringContaining("Access denied") });
  });

  it("returns 200 when tenant B requests its own record", async () => {
    const res = await request(app)
      .get(`/api/leads/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(RECORD_ID);
  });

  it("returns 200 when super_admin requests a cross-tenant record", async () => {
    const res = await request(app)
      .get(`/api/leads/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenSuperAdmin}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(RECORD_ID);
  });

  it("returns 404 when the record does not exist", async () => {
    setupSelectReturning([]);

    const res = await request(app)
      .get(`/api/leads/nonexistent`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/leads/:id — cross-tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSelectReturning([recordOwnedByTenantB]);
    setupUpdateReturning([{ ...recordOwnedByTenantB, nome: "Updated Corp" }]);
  });

  it("returns 403 when tenant A patches a record owned by tenant B", async () => {
    const res = await request(app)
      .patch(`/api/leads/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ nome: "Updated Corp" });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: expect.stringContaining("Access denied") });
  });

  it("returns 200 when tenant B patches its own record", async () => {
    const res = await request(app)
      .patch(`/api/leads/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ nome: "Updated Corp" });

    expect(res.status).toBe(200);
  });

  it("returns 200 when super_admin patches a cross-tenant record", async () => {
    const res = await request(app)
      .patch(`/api/leads/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenSuperAdmin}`)
      .send({ nome: "Updated Corp" });

    expect(res.status).toBe(200);
  });

  it("returns 404 when the record does not exist", async () => {
    setupSelectReturning([]);

    const res = await request(app)
      .patch(`/api/leads/nonexistent`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ nome: "Updated Corp" });

    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/leads/:id — cross-tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSelectReturning([recordOwnedByTenantB]);
    setupDeleteSuccess();
  });

  it("returns 403 when tenant A deletes a record owned by tenant B", async () => {
    const res = await request(app)
      .delete(`/api/leads/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: expect.stringContaining("Access denied") });
  });

  it("returns 204 when tenant B deletes its own record", async () => {
    const res = await request(app)
      .delete(`/api/leads/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(204);
  });

  it("returns 204 when super_admin deletes a cross-tenant record", async () => {
    const res = await request(app)
      .delete(`/api/leads/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenSuperAdmin}`);

    expect(res.status).toBe(204);
  });

  it("returns 404 when the record does not exist", async () => {
    setupSelectReturning([]);

    const res = await request(app)
      .delete(`/api/leads/nonexistent`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
  });
});

describe("Unauthenticated access — leads", () => {
  it("returns 401 for GET without a token", async () => {
    const res = await request(app).get(`/api/leads/${RECORD_ID}`);
    expect(res.status).toBe(401);
  });

  it("returns 401 for PATCH without a token", async () => {
    const res = await request(app)
      .patch(`/api/leads/${RECORD_ID}`)
      .send({ nome: "X" });
    expect(res.status).toBe(401);
  });

  it("returns 401 for DELETE without a token", async () => {
    const res = await request(app).delete(`/api/leads/${RECORD_ID}`);
    expect(res.status).toBe(401);
  });
});
