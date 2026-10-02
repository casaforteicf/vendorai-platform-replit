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
  mockCanAccessConversation,
  mockCanViewAllConversations,
} = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockDbDelete: vi.fn(),
  mockDbInsert: vi.fn(),
  mockCanAccessConversation: vi.fn(),
  mockCanViewAllConversations: vi.fn(),
}));

vi.mock("../lib/conversation-access.js", () => ({
  canAccessConversation: mockCanAccessConversation,
  canViewAllConversations: mockCanViewAllConversations,
  conversationOwnedByUserCondition: vi.fn(() => "ownership-condition"),
}));

vi.mock("@workspace/db", () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
    delete: mockDbDelete,
    insert: mockDbInsert,
  },
  conversationsTable: {
    id: "id",
    tenantId: "tenantId",
    createdAt: "createdAt",
    updatedAt: "updatedAt",
    naoLidas: "naoLidas",
  },
  insertConversationSchema: {
    safeParse: () => ({ success: false, error: { message: "not exercised" } }),
  },
  updateConversationSchema: {
    safeParse: () => ({ success: true, data: {} }),
  },
}));

import express from "express";
import { authenticate } from "../middlewares/auth.js";
import conversationsRouter from "../routes/conversations.js";

const app = express();
app.use(express.json());
app.use("/api", authenticate, conversationsRouter);

const { setupSelectReturning, setupUpdateReturning, setupDeleteSuccess } = createDbHelpers({
  mockDbSelect,
  mockDbUpdate,
  mockDbDelete,
  mockDbInsert,
});

const RECORD_ID = "conv-owned-by-b";

const recordOwnedByTenantB: MockRow = {
  id: RECORD_ID,
  tenantId: TENANT_B,
  titulo: "Support Chat",
};

describe("GET /api/conversations/:id — cross-tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSelectReturning([recordOwnedByTenantB]);
    mockCanViewAllConversations.mockResolvedValue(false);
    mockCanAccessConversation.mockImplementation(async (req: any, tenantId: string) =>
      req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId
    );
  });

  it("returns 403 when tenant A requests a record owned by tenant B", async () => {
    const res = await request(app)
      .get(`/api/conversations/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: expect.stringContaining("Access denied") });
  });

  it("returns 403 when a same-tenant user is not authorized for the conversation", async () => {
    mockCanAccessConversation.mockResolvedValueOnce(false);

    const res = await request(app)
      .get(`/api/conversations/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: expect.stringContaining("Access denied") });
  });

  it("returns 200 when tenant B requests its own record", async () => {
    const res = await request(app)
      .get(`/api/conversations/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(RECORD_ID);
  });

  it("returns 200 when super_admin requests a cross-tenant record", async () => {
    const res = await request(app)
      .get(`/api/conversations/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenSuperAdmin}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(RECORD_ID);
  });

  it("returns 404 when the record does not exist", async () => {
    setupSelectReturning([]);

    const res = await request(app)
      .get(`/api/conversations/nonexistent`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/conversations/:id — cross-tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSelectReturning([recordOwnedByTenantB]);
    setupUpdateReturning([{ ...recordOwnedByTenantB, titulo: "Updated Chat" }]);
    mockCanViewAllConversations.mockResolvedValue(false);
    mockCanAccessConversation.mockImplementation(async (req: any, tenantId: string) =>
      req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId
    );
  });

  it("returns 403 when tenant A patches a record owned by tenant B", async () => {
    const res = await request(app)
      .patch(`/api/conversations/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ titulo: "Updated Chat" });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: expect.stringContaining("Access denied") });
  });

  it("returns 200 when tenant B patches its own record", async () => {
    const res = await request(app)
      .patch(`/api/conversations/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ titulo: "Updated Chat" });

    expect(res.status).toBe(200);
  });

  it("returns 200 when super_admin patches a cross-tenant record", async () => {
    const res = await request(app)
      .patch(`/api/conversations/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenSuperAdmin}`)
      .send({ titulo: "Updated Chat" });

    expect(res.status).toBe(200);
  });

  it("returns 404 when the record does not exist", async () => {
    setupSelectReturning([]);

    const res = await request(app)
      .patch(`/api/conversations/nonexistent`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ titulo: "Updated Chat" });

    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/conversations/:id — cross-tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSelectReturning([recordOwnedByTenantB]);
    setupDeleteSuccess();
    mockCanViewAllConversations.mockResolvedValue(false);
    mockCanAccessConversation.mockImplementation(async (req: any, tenantId: string) =>
      req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId
    );
  });

  it("returns 403 when tenant A deletes a record owned by tenant B", async () => {
    const res = await request(app)
      .delete(`/api/conversations/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: expect.stringContaining("Access denied") });
  });

  it("returns 204 when tenant B deletes its own record", async () => {
    const res = await request(app)
      .delete(`/api/conversations/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(204);
  });

  it("returns 204 when super_admin deletes a cross-tenant record", async () => {
    const res = await request(app)
      .delete(`/api/conversations/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenSuperAdmin}`);

    expect(res.status).toBe(204);
  });

  it("returns 404 when the record does not exist", async () => {
    setupSelectReturning([]);

    const res = await request(app)
      .delete(`/api/conversations/nonexistent`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
  });
});

describe("Unauthenticated access — conversations", () => {
  it("returns 401 for GET without a token", async () => {
    const res = await request(app).get(`/api/conversations/${RECORD_ID}`);
    expect(res.status).toBe(401);
  });

  it("returns 401 for PATCH without a token", async () => {
    const res = await request(app)
      .patch(`/api/conversations/${RECORD_ID}`)
      .send({ titulo: "X" });
    expect(res.status).toBe(401);
  });

  it("returns 401 for DELETE without a token", async () => {
    const res = await request(app).delete(`/api/conversations/${RECORD_ID}`);
    expect(res.status).toBe(401);
  });
});