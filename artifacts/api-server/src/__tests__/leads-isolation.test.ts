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
import { MockRow, createDbHelpers, mockSelectQuery } from "./helpers/isolation.js";

const { mockDbSelect, mockDbUpdate, mockDbDelete, mockDbInsert, mockDbTransaction } = vi.hoisted(
  () => ({
    mockDbSelect: vi.fn(),
    mockDbUpdate: vi.fn(),
    mockDbDelete: vi.fn(),
    mockDbInsert: vi.fn(),
    mockDbTransaction: vi.fn(),
  })
);

vi.mock("@workspace/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@workspace/db")>()),
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
  leadProposalsTable: { id: "id", tenantId: "tenantId", leadId: "leadId" },
  leadBriefingsTable: { id: "id", tenantId: "tenantId", leadId: "leadId" },
  beautyAgendamentosTable: { tenantId: "tenantId", clienteId: "clienteId" },
  beautyProntuariosTable: { tenantId: "tenantId", clienteId: "clienteId" },
  clientServiceGapsTable: { tenantId: "tenantId", clienteId: "clienteId" },
  clinicConsultasTable: { tenantId: "tenantId", pacienteId: "pacienteId" },
  clinicProntuariosTable: { tenantId: "tenantId", pacienteId: "pacienteId" },
  fretesCargasTable: { tenantId: "tenantId", clienteId: "clienteId" },
  imoveisVisitasTable: { tenantId: "tenantId", clienteId: "clienteId" },
  scoutOportunidadesTable: { tenantId: "tenantId", clienteId: "clienteId" },
  servicosOrdensTable: { tenantId: "tenantId", clienteId: "clienteId" },
  veiculosTestDrivesTable: { tenantId: "tenantId", clienteId: "clienteId" },
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

const { setupSelectReturning, setupUpdateReturning, setupDeleteSuccess } = createDbHelpers({
  mockDbSelect,
  mockDbUpdate,
  mockDbDelete,
  mockDbInsert,
});

const RECORD_ID = "lead-owned-by-b";

const recordOwnedByTenantB: MockRow = {
  id: RECORD_ID,
  tenantId: TENANT_B,
  assignedTo: "owner-b",
  nome: "Acme Corp",
};

describe("GET /api/leads/:id — cross-tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbSelect.mockReset();
    setupSelectReturning([recordOwnedByTenantB]);
  });

  it("returns 403 when tenant A requests a record owned by tenant B", async () => {
    mockDbSelect.mockReturnValueOnce(mockSelectQuery([recordOwnedByTenantB])).mockReturnValue(mockSelectQuery([]));
    const res = await request(app)
      .get(`/api/leads/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(res.body).toMatchObject({ error: expect.stringContaining("Access denied") });
  });

  it("returns 200 when tenant B requests its own record", async () => {
    const res = await request(app)
      .get(`/api/leads/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.id).toBe(RECORD_ID);
  });

  it("returns 200 when super_admin requests a cross-tenant record", async () => {
    const res = await request(app)
      .get(`/api/leads/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenSuperAdmin}`);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.id).toBe(RECORD_ID);
  });

  it("returns 404 when the record does not exist", async () => {
    setupSelectReturning([]);

    const res = await request(app)
      .get(`/api/leads/nonexistent`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status, JSON.stringify(res.body)).toBe(404);
  });
});

describe("PATCH /api/leads/:id — cross-tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbSelect.mockReset();
    setupSelectReturning([recordOwnedByTenantB]);
    setupUpdateReturning([{ ...recordOwnedByTenantB, nome: "Updated Corp" }]);
  });

  it("returns 403 when tenant A patches a record owned by tenant B", async () => {
    const res = await request(app)
      .patch(`/api/leads/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ nome: "Updated Corp" });

    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(res.body).toMatchObject({ error: expect.stringContaining("Access denied") });
  });

  it("returns 200 when tenant B patches its own record", async () => {
    const res = await request(app)
      .patch(`/api/leads/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ nome: "Updated Corp" });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
  });

  it("returns 200 when super_admin patches a cross-tenant record", async () => {
    const res = await request(app)
      .patch(`/api/leads/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenSuperAdmin}`)
      .send({ nome: "Updated Corp" });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
  });

  it("returns 404 when the record does not exist", async () => {
    setupSelectReturning([]);

    const res = await request(app)
      .patch(`/api/leads/nonexistent`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ nome: "Updated Corp" });

    expect(res.status, JSON.stringify(res.body)).toBe(404);
  });
});

describe("DELETE /api/leads/:id — cross-tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbSelect.mockReset();
    setupSelectReturning([recordOwnedByTenantB]);
    setupUpdateReturning([{ ...recordOwnedByTenantB, excluidoEm: new Date() }]);
    mockDbTransaction.mockImplementation(async (callback) =>
      callback({ delete: mockDbDelete }),
    );
  });

  it("returns 403 when tenant A deletes a record owned by tenant B", async () => {
    const res = await request(app)
      .delete(`/api/leads/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(res.body).toMatchObject({ error: expect.stringContaining("Access denied") });
  });

  it("returns 200 when tenant B deletes its own record", async () => {
    const res = await request(app)
      .delete(`/api/leads/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.excluidoEm).toBeTruthy();
    expect(mockDbDelete).not.toHaveBeenCalled();
  });

  it("returns 200 when super_admin deletes a cross-tenant record", async () => {
    const res = await request(app)
      .delete(`/api/leads/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenSuperAdmin}`);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.excluidoEm).toBeTruthy();
    expect(mockDbDelete).not.toHaveBeenCalled();
  });

  it("returns 404 when the record does not exist", async () => {
    setupSelectReturning([]);

    const res = await request(app)
      .delete(`/api/leads/nonexistent`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status, JSON.stringify(res.body)).toBe(404);
  });
});

describe("Unauthenticated access — leads", () => {
  it("returns 401 for GET without a token", async () => {
    const res = await request(app).get(`/api/leads/${RECORD_ID}`);
    expect(res.status, JSON.stringify(res.body)).toBe(401);
  });

  it("returns 401 for PATCH without a token", async () => {
    const res = await request(app)
      .patch(`/api/leads/${RECORD_ID}`)
      .send({ nome: "X" });
    expect(res.status, JSON.stringify(res.body)).toBe(401);
  });

  it("returns 401 for DELETE without a token", async () => {
    const res = await request(app).delete(`/api/leads/${RECORD_ID}`);
    expect(res.status, JSON.stringify(res.body)).toBe(401);
  });
});
