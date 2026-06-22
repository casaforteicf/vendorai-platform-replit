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
  knowledgeBaseTable: {
    id: "id",
    tenantId: "tenantId",
    titulo: "titulo",
    conteudo: "conteudo",
    categoria: "categoria",
    tags: "tags",
    createdAt: "createdAt",
    updatedAt: "updatedAt",
  },
  insertKnowledgeBaseSchema: {
    safeParse: (data: unknown) => mockInsertSchema(data),
  },
  updateKnowledgeBaseSchema: {
    safeParse: () => ({ success: true, data: {} }),
  },
}));

import express from "express";
import { authenticate } from "../middlewares/auth.js";
import knowledgeBaseRouter from "../routes/knowledge_base.js";

const app = express();
app.use(express.json());
app.use("/api", authenticate, knowledgeBaseRouter);

const {
  setupSelectReturning,
  setupUpdateReturning,
  setupDeleteSuccess,
  setupInsertReturning,
} = createDbHelpers({ mockDbSelect, mockDbUpdate, mockDbDelete, mockDbInsert });

const RECORD_ID = "kb-article-owned-by-b";

const recordOwnedByTenantB: MockRow = {
  id: RECORD_ID,
  tenantId: TENANT_B,
  titulo: "Article B",
  conteudo: "Content",
};

describe("POST /api/knowledge-base — cross-tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 when body.tenantId does not match the authenticated tenant", async () => {
    mockInsertSchema.mockReturnValue({
      success: true,
      data: { tenantId: TENANT_B, titulo: "Article B", conteudo: "Content" },
    });

    const res = await request(app)
      .post("/api/knowledge-base")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ tenantId: TENANT_B, titulo: "Article B", conteudo: "Content" });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: expect.stringContaining("Access denied") });
  });

  it("returns 201 when tenant posts an article for their own tenant", async () => {
    const newArticle: MockRow = { id: "new-article", tenantId: TENANT_B, titulo: "Article B" };
    mockInsertSchema.mockReturnValue({
      success: true,
      data: { tenantId: TENANT_B, titulo: "Article B", conteudo: "Content" },
    });
    setupInsertReturning([newArticle]);

    const res = await request(app)
      .post("/api/knowledge-base")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ tenantId: TENANT_B, titulo: "Article B", conteudo: "Content" });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe("new-article");
  });

  it("returns 201 when super_admin posts an article for any tenant", async () => {
    const newArticle: MockRow = { id: "new-article", tenantId: TENANT_A, titulo: "Article A" };
    mockInsertSchema.mockReturnValue({
      success: true,
      data: { tenantId: TENANT_A, titulo: "Article A", conteudo: "Content" },
    });
    setupInsertReturning([newArticle]);

    const res = await request(app)
      .post("/api/knowledge-base")
      .set("Authorization", `Bearer ${tokenSuperAdmin}`)
      .send({ tenantId: TENANT_A, titulo: "Article A", conteudo: "Content" });

    expect(res.status).toBe(201);
  });
});

describe("PATCH /api/knowledge-base/:id — cross-tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSelectReturning([recordOwnedByTenantB]);
    setupUpdateReturning([{ ...recordOwnedByTenantB, titulo: "Updated Article" }]);
  });

  it("returns 403 when tenant A patches a record owned by tenant B", async () => {
    const res = await request(app)
      .patch(`/api/knowledge-base/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ titulo: "Updated Article" });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: expect.stringContaining("Access denied") });
  });

  it("returns 200 when tenant B patches its own record", async () => {
    const res = await request(app)
      .patch(`/api/knowledge-base/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ titulo: "Updated Article" });

    expect(res.status).toBe(200);
  });

  it("returns 200 when super_admin patches a cross-tenant record", async () => {
    const res = await request(app)
      .patch(`/api/knowledge-base/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenSuperAdmin}`)
      .send({ titulo: "Updated Article" });

    expect(res.status).toBe(200);
  });

  it("returns 404 when the record does not exist", async () => {
    setupSelectReturning([]);

    const res = await request(app)
      .patch(`/api/knowledge-base/nonexistent`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ titulo: "Updated Article" });

    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/knowledge-base/:id — cross-tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSelectReturning([recordOwnedByTenantB]);
    setupDeleteSuccess();
  });

  it("returns 403 when tenant A deletes a record owned by tenant B", async () => {
    const res = await request(app)
      .delete(`/api/knowledge-base/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: expect.stringContaining("Access denied") });
  });

  it("returns 204 when tenant B deletes its own record", async () => {
    const res = await request(app)
      .delete(`/api/knowledge-base/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(204);
  });

  it("returns 204 when super_admin deletes a cross-tenant record", async () => {
    const res = await request(app)
      .delete(`/api/knowledge-base/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenSuperAdmin}`);

    expect(res.status).toBe(204);
  });

  it("returns 404 when the record does not exist", async () => {
    setupSelectReturning([]);

    const res = await request(app)
      .delete(`/api/knowledge-base/nonexistent`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
  });
});

describe("Unauthenticated access — knowledge-base", () => {
  it("returns 401 for POST without a token", async () => {
    const res = await request(app)
      .post("/api/knowledge-base")
      .send({ titulo: "Article", conteudo: "Content" });
    expect(res.status).toBe(401);
  });

  it("returns 401 for PATCH without a token", async () => {
    const res = await request(app)
      .patch(`/api/knowledge-base/${RECORD_ID}`)
      .send({ titulo: "Updated" });
    expect(res.status).toBe(401);
  });

  it("returns 401 for DELETE without a token", async () => {
    const res = await request(app).delete(`/api/knowledge-base/${RECORD_ID}`);
    expect(res.status).toBe(401);
  });
});
