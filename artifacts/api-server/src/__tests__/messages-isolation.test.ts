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

const {
  mockDbSelect,
  mockDbUpdate,
  mockDbDelete,
  mockDbInsert,
  mockInsertSchema,
  mockCanAccessConversation,
  mockCanViewAllConversations,
} = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockDbDelete: vi.fn(),
  mockDbInsert: vi.fn(),
  mockInsertSchema: vi.fn(),
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
  messagesTable: {
    id: "id",
    tenantId: "tenantId",
    leadId: "leadId",
    conversationId: "conversationId",
    createdAt: "createdAt",
  },
  insertMessageSchema: {
    safeParse: (data: unknown) => mockInsertSchema(data),
  },
  updateMessageSchema: {
    safeParse: () => ({ success: true, data: {} }),
  },
}));

vi.mock("../lib/analyze-intelligence.js", () => ({
  maybeReanalyze: vi.fn(),
}));

import express from "express";
import { authenticate } from "../middlewares/auth.js";
import messagesRouter from "../routes/messages.js";

const app = express();
app.use(express.json());
app.use("/api", authenticate, messagesRouter);

const {
  setupSelectReturning,
  setupUpdateReturning,
  setupDeleteSuccess,
  setupInsertReturning,
} = createDbHelpers({ mockDbSelect, mockDbUpdate, mockDbDelete, mockDbInsert });

const RECORD_ID = "message-owned-by-b";

const recordOwnedByTenantB: MockRow = {
  id: RECORD_ID,
  tenantId: TENANT_B,
  conteudo: "Hello",
};

describe("POST /api/messages — cross-tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanViewAllConversations.mockResolvedValue(false);
    mockCanAccessConversation.mockImplementation(async (req: any, tenantId: string) =>
      req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId
    );
  });

  it("returns 403 when body.tenantId does not match the authenticated tenant", async () => {
    mockInsertSchema.mockReturnValue({
      success: true,
      data: { tenantId: TENANT_B, leadId: "lead-1", conversationId: "conv-1", conteudo: "hi" },
    });

    const res = await request(app)
      .post("/api/messages")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ tenantId: TENANT_B, leadId: "lead-1", conversationId: "conv-1", conteudo: "hi" });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: expect.stringContaining("Access denied") });
  });

  it("returns 403 when a same-tenant user cannot access the conversation", async () => {
    mockInsertSchema.mockReturnValue({
      success: true,
      data: {
        tenantId: TENANT_B,
        leadId: "lead-1",
        conversationId: "conv-private",
        conteudo: "hi",
        canal: "chat",
        direcao: "saida",
      },
    });
    mockCanAccessConversation.mockResolvedValueOnce(false);

    const res = await request(app)
      .post("/api/messages")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({
        tenantId: TENANT_B,
        leadId: "lead-1",
        conversationId: "conv-private",
        conteudo: "hi",
        canal: "chat",
        direcao: "saida",
      });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: expect.stringContaining("conversation") });
  });

  it("returns 201 when tenant posts a message for their own tenant", async () => {
    const newMessage: MockRow = { id: "new-msg", tenantId: TENANT_B, conteudo: "hi" };
    mockInsertSchema.mockReturnValue({
      success: true,
      data: { tenantId: TENANT_B, leadId: "lead-1", conversationId: "conv-1", conteudo: "hi" },
    });
    setupInsertReturning([newMessage]);

    const res = await request(app)
      .post("/api/messages")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ tenantId: TENANT_B, leadId: "lead-1", conversationId: "conv-1", conteudo: "hi" });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe("new-msg");
  });

  it("returns 201 when super_admin posts a message for any tenant", async () => {
    const newMessage: MockRow = { id: "new-msg", tenantId: TENANT_B, conteudo: "hi" };
    mockInsertSchema.mockReturnValue({
      success: true,
      data: { tenantId: TENANT_B, leadId: "lead-1", conversationId: "conv-1", conteudo: "hi" },
    });
    setupInsertReturning([newMessage]);

    const res = await request(app)
      .post("/api/messages")
      .set("Authorization", `Bearer ${tokenSuperAdmin}`)
      .send({ tenantId: TENANT_B, leadId: "lead-1", conversationId: "conv-1", conteudo: "hi" });

    expect(res.status).toBe(201);
  });
});

describe("PATCH /api/messages/:id — cross-tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSelectReturning([recordOwnedByTenantB]);
    setupUpdateReturning([{ ...recordOwnedByTenantB, conteudo: "Updated" }]);
    mockCanViewAllConversations.mockResolvedValue(false);
    mockCanAccessConversation.mockImplementation(async (req: any, tenantId: string) =>
      req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId
    );
  });

  it("returns 403 when tenant A patches a record owned by tenant B", async () => {
    const res = await request(app)
      .patch(`/api/messages/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ conteudo: "Updated" });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: expect.stringContaining("Access denied") });
  });

  it("returns 200 when tenant B patches its own record", async () => {
    const res = await request(app)
      .patch(`/api/messages/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ conteudo: "Updated" });

    expect(res.status).toBe(200);
  });

  it("returns 200 when super_admin patches a cross-tenant record", async () => {
    const res = await request(app)
      .patch(`/api/messages/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenSuperAdmin}`)
      .send({ conteudo: "Updated" });

    expect(res.status).toBe(200);
  });

  it("returns 404 when the record does not exist", async () => {
    setupSelectReturning([]);

    const res = await request(app)
      .patch(`/api/messages/nonexistent`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ conteudo: "Updated" });

    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/messages/:id — cross-tenant isolation", () => {
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
      .delete(`/api/messages/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: expect.stringContaining("Access denied") });
  });

  it("returns 204 when tenant B deletes its own record", async () => {
    const res = await request(app)
      .delete(`/api/messages/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(204);
  });

  it("returns 204 when super_admin deletes a cross-tenant record", async () => {
    const res = await request(app)
      .delete(`/api/messages/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenSuperAdmin}`);

    expect(res.status).toBe(204);
  });

  it("returns 404 when the record does not exist", async () => {
    setupSelectReturning([]);

    const res = await request(app)
      .delete(`/api/messages/nonexistent`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
  });
});

describe("Unauthenticated access — messages", () => {
  it("returns 401 for POST without a token", async () => {
    const res = await request(app).post("/api/messages").send({ conteudo: "hi" });
    expect(res.status).toBe(401);
  });

  it("returns 401 for PATCH without a token", async () => {
    const res = await request(app)
      .patch(`/api/messages/${RECORD_ID}`)
      .send({ conteudo: "Updated" });
    expect(res.status).toBe(401);
  });

  it("returns 401 for DELETE without a token", async () => {
    const res = await request(app).delete(`/api/messages/${RECORD_ID}`);
    expect(res.status).toBe(401);
  });
});