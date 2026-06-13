import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

const TEST_SECRET = "test-jwt-secret-for-unit-tests";

const { mockDbSelect, mockDbUpdate, mockDbDelete, mockDbInsert } = vi.hoisted(
  () => ({
    mockDbSelect: vi.fn(),
    mockDbUpdate: vi.fn(),
    mockDbDelete: vi.fn(),
    mockDbInsert: vi.fn(),
  })
);

vi.mock("@workspace/db", () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
    delete: mockDbDelete,
    insert: mockDbInsert,
  },
  propostasTable: {
    id: "id",
    tenantId: "tenantId",
    createdAt: "createdAt",
    updatedAt: "updatedAt",
    leadId: "leadId",
    dealId: "dealId",
    status: "status",
  },
  produtosCatalogoTable: {
    id: "id",
    tenantId: "tenantId",
    nome: "nome",
    ativo: "ativo",
    precoBase: "precoBase",
  },
  insertPropostaSchema: {
    safeParse: () => ({ success: false, error: { message: "not exercised" } }),
  },
  updatePropostaSchema: {
    safeParse: () => ({ success: true, data: {} }),
  },
}));

import express from "express";
import { authenticate } from "../middlewares/auth.js";
import propostasRouter from "../routes/propostas.js";

const app = express();
app.use(express.json());
app.use("/api", authenticate, propostasRouter);

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

const TENANT_A = "tenant-alpha";
const TENANT_B = "tenant-beta";
const RECORD_ID = "proposta-owned-by-b";

const recordOwnedByTenantB: MockRow = {
  id: RECORD_ID,
  tenantId: TENANT_B,
  titulo: "Proposta Acme",
  status: "rascunho",
};

const tokenA = makeToken(TENANT_A);
const tokenB = makeToken(TENANT_B);
const tokenSuperAdmin = makeToken("platform", "super_admin");

describe("GET /api/propostas/:id — cross-tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSelectReturning([recordOwnedByTenantB]);
  });

  it("returns 403 when tenant A requests a record owned by tenant B", async () => {
    const res = await request(app)
      .get(`/api/propostas/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: expect.stringContaining("Access denied") });
  });

  it("returns 200 when tenant B requests its own record", async () => {
    const res = await request(app)
      .get(`/api/propostas/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(RECORD_ID);
  });

  it("returns 200 when super_admin requests a cross-tenant record", async () => {
    const res = await request(app)
      .get(`/api/propostas/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenSuperAdmin}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(RECORD_ID);
  });

  it("returns 404 when the record does not exist", async () => {
    setupSelectReturning([]);

    const res = await request(app)
      .get(`/api/propostas/nonexistent`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/propostas/:id — cross-tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSelectReturning([recordOwnedByTenantB]);
    setupUpdateReturning([{ ...recordOwnedByTenantB, titulo: "Updated Proposta" }]);
  });

  it("returns 403 when tenant A patches a record owned by tenant B", async () => {
    const res = await request(app)
      .patch(`/api/propostas/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ titulo: "Updated Proposta" });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: expect.stringContaining("Access denied") });
  });

  it("returns 200 when tenant B patches its own record", async () => {
    const res = await request(app)
      .patch(`/api/propostas/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ titulo: "Updated Proposta" });

    expect(res.status).toBe(200);
  });

  it("returns 200 when super_admin patches a cross-tenant record", async () => {
    const res = await request(app)
      .patch(`/api/propostas/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenSuperAdmin}`)
      .send({ titulo: "Updated Proposta" });

    expect(res.status).toBe(200);
  });

  it("returns 404 when the record does not exist", async () => {
    setupSelectReturning([]);

    const res = await request(app)
      .patch(`/api/propostas/nonexistent`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ titulo: "Updated Proposta" });

    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/propostas/:id/status — cross-tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSelectReturning([recordOwnedByTenantB]);
    setupUpdateReturning([{ ...recordOwnedByTenantB, status: "enviada" }]);
  });

  it("returns 403 when tenant A transitions status on a record owned by tenant B", async () => {
    const res = await request(app)
      .patch(`/api/propostas/${RECORD_ID}/status`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ status: "enviada" });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: expect.stringContaining("Access denied") });
  });

  it("returns 200 when tenant B transitions status on its own record", async () => {
    const res = await request(app)
      .patch(`/api/propostas/${RECORD_ID}/status`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ status: "enviada" });

    expect(res.status).toBe(200);
  });

  it("returns 200 when super_admin transitions status on a cross-tenant record", async () => {
    const res = await request(app)
      .patch(`/api/propostas/${RECORD_ID}/status`)
      .set("Authorization", `Bearer ${tokenSuperAdmin}`)
      .send({ status: "enviada" });

    expect(res.status).toBe(200);
  });

  it("returns 404 when the record does not exist", async () => {
    setupSelectReturning([]);

    const res = await request(app)
      .patch(`/api/propostas/nonexistent/status`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ status: "enviada" });

    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/propostas/:id — cross-tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSelectReturning([recordOwnedByTenantB]);
    setupDeleteSuccess();
  });

  it("returns 403 when tenant A deletes a record owned by tenant B", async () => {
    const res = await request(app)
      .delete(`/api/propostas/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: expect.stringContaining("Access denied") });
  });

  it("returns 204 when tenant B deletes its own record", async () => {
    const res = await request(app)
      .delete(`/api/propostas/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(204);
  });

  it("returns 204 when super_admin deletes a cross-tenant record", async () => {
    const res = await request(app)
      .delete(`/api/propostas/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenSuperAdmin}`);

    expect(res.status).toBe(204);
  });

  it("returns 404 when the record does not exist", async () => {
    setupSelectReturning([]);

    const res = await request(app)
      .delete(`/api/propostas/nonexistent`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
  });
});

describe("Unauthenticated access — propostas", () => {
  it("returns 401 for GET without a token", async () => {
    const res = await request(app).get(`/api/propostas/${RECORD_ID}`);
    expect(res.status).toBe(401);
  });

  it("returns 401 for PATCH without a token", async () => {
    const res = await request(app)
      .patch(`/api/propostas/${RECORD_ID}`)
      .send({ titulo: "X" });
    expect(res.status).toBe(401);
  });

  it("returns 401 for PATCH /status without a token", async () => {
    const res = await request(app)
      .patch(`/api/propostas/${RECORD_ID}/status`)
      .send({ status: "enviada" });
    expect(res.status).toBe(401);
  });

  it("returns 401 for DELETE without a token", async () => {
    const res = await request(app).delete(`/api/propostas/${RECORD_ID}`);
    expect(res.status).toBe(401);
  });
});
