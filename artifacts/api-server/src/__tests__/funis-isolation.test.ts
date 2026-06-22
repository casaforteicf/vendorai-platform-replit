import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import {
  TENANT_A,
  TENANT_B,
  tokenA,
  tokenB,
  tokenSuperAdmin,
} from "./helpers/auth.js";
import { MockRow, createDbHelpers } from "./helpers/isolation.js";

const { mockDbSelect, mockDbUpdate, mockDbDelete, mockDbInsert, mockInsertSchema } =
  vi.hoisted(() => ({
    mockDbSelect: vi.fn(),
    mockDbUpdate: vi.fn(),
    mockDbDelete: vi.fn(),
    mockDbInsert: vi.fn(),
    mockInsertSchema: vi.fn(),
  }));

vi.mock("@workspace/db", () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
    delete: mockDbDelete,
    insert: mockDbInsert,
  },
  funisTable: {
    id: "id",
    tenantId: "tenantId",
    createdAt: "createdAt",
    updatedAt: "updatedAt",
  },
  insertFunilSchema: {
    safeParse: (data: unknown) => mockInsertSchema(data),
  },
  updateFunilSchema: {
    safeParse: () => ({ success: true, data: {} }),
  },
}));

import express from "express";
import { authenticate } from "../middlewares/auth.js";
import funisRouter from "../routes/funis.js";

const app = express();
app.use(express.json());
app.use("/api", authenticate, funisRouter);

const {
  setupSelectReturning,
  setupUpdateReturning,
  setupDeleteSuccess,
  setupInsertReturning,
} = createDbHelpers({ mockDbSelect, mockDbUpdate, mockDbDelete, mockDbInsert });

const RECORD_ID = "funil-owned-by-b";

const recordOwnedByTenantB: MockRow = {
  id: RECORD_ID,
  tenantId: TENANT_B,
  nome: "Pipeline B",
};

describe("POST /api/funis — cross-tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 when body.tenantId does not match the authenticated tenant", async () => {
    mockInsertSchema.mockReturnValue({
      success: true,
      data: { tenantId: TENANT_B, nome: "Pipeline B" },
    });

    const res = await request(app)
      .post("/api/funis")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ tenantId: TENANT_B, nome: "Pipeline B" });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: expect.stringContaining("Access denied") });
  });

  it("returns 201 when tenant posts a funil for their own tenant", async () => {
    const newFunil: MockRow = { id: "new-funil", tenantId: TENANT_B, nome: "Pipeline B" };
    mockInsertSchema.mockReturnValue({
      success: true,
      data: { tenantId: TENANT_B, nome: "Pipeline B" },
    });
    setupInsertReturning([newFunil]);

    const res = await request(app)
      .post("/api/funis")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ tenantId: TENANT_B, nome: "Pipeline B" });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe("new-funil");
  });

  it("returns 201 when super_admin posts a funil for any tenant", async () => {
    const newFunil: MockRow = { id: "new-funil", tenantId: TENANT_B, nome: "Pipeline B" };
    mockInsertSchema.mockReturnValue({
      success: true,
      data: { tenantId: TENANT_B, nome: "Pipeline B" },
    });
    setupInsertReturning([newFunil]);

    const res = await request(app)
      .post("/api/funis")
      .set("Authorization", `Bearer ${tokenSuperAdmin}`)
      .send({ tenantId: TENANT_B, nome: "Pipeline B" });

    expect(res.status).toBe(201);
  });
});

describe("PATCH /api/funis/:id — cross-tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSelectReturning([recordOwnedByTenantB]);
    setupUpdateReturning([{ ...recordOwnedByTenantB, nome: "Updated Pipeline" }]);
  });

  it("returns 403 when tenant A patches a record owned by tenant B", async () => {
    const res = await request(app)
      .patch(`/api/funis/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ nome: "Updated Pipeline" });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: expect.stringContaining("Access denied") });
  });

  it("returns 200 when tenant B patches its own record", async () => {
    const res = await request(app)
      .patch(`/api/funis/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ nome: "Updated Pipeline" });

    expect(res.status).toBe(200);
  });

  it("returns 200 when super_admin patches a cross-tenant record", async () => {
    const res = await request(app)
      .patch(`/api/funis/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenSuperAdmin}`)
      .send({ nome: "Updated Pipeline" });

    expect(res.status).toBe(200);
  });

  it("returns 404 when the record does not exist", async () => {
    setupSelectReturning([]);

    const res = await request(app)
      .patch(`/api/funis/nonexistent`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ nome: "Updated Pipeline" });

    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/funis/:id — cross-tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSelectReturning([recordOwnedByTenantB]);
    setupDeleteSuccess();
  });

  it("returns 403 when tenant A deletes a record owned by tenant B", async () => {
    const res = await request(app)
      .delete(`/api/funis/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: expect.stringContaining("Access denied") });
  });

  it("returns 204 when tenant B deletes its own record", async () => {
    const res = await request(app)
      .delete(`/api/funis/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(204);
  });

  it("returns 204 when super_admin deletes a cross-tenant record", async () => {
    const res = await request(app)
      .delete(`/api/funis/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenSuperAdmin}`);

    expect(res.status).toBe(204);
  });

  it("returns 404 when the record does not exist", async () => {
    setupSelectReturning([]);

    const res = await request(app)
      .delete(`/api/funis/nonexistent`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
  });
});

describe("Unauthenticated access — funis", () => {
  it("returns 401 for POST without a token", async () => {
    const res = await request(app).post("/api/funis").send({ nome: "Pipeline" });
    expect(res.status).toBe(401);
  });

  it("returns 401 for PATCH without a token", async () => {
    const res = await request(app)
      .patch(`/api/funis/${RECORD_ID}`)
      .send({ nome: "Updated" });
    expect(res.status).toBe(401);
  });

  it("returns 401 for DELETE without a token", async () => {
    const res = await request(app).delete(`/api/funis/${RECORD_ID}`);
    expect(res.status).toBe(401);
  });
});
