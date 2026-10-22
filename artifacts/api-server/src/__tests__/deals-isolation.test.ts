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
  dealsTable: {
    id: "id",
    tenantId: "tenantId",
    createdAt: "createdAt",
    updatedAt: "updatedAt",
    etapa: "etapa",
    funilId: "funilId",
    leadId: "leadId",
    assignedTo: "assignedTo",
  },
  leadsTable: { id: "id", tenantId: "tenantId", email: "email", nome: "nome", telefone: "telefone", documento: "documento", empresa: "empresa" },
  tenantsTable: { id: "id", name: "name", webhookEstoqueUrl: "webhookEstoqueUrl", partnerId: "partnerId", tipoFechamentoDefault: "tipoFechamentoDefault", integrationType: "integrationType" },
  partnersTable: { id: "id", name: "name", email: "email", asaasWalletId: "asaasWalletId" },
  billingEventsTable: { id: "id" },
  notificationsTable: { id: "id", tenantId: "tenantId", title: "title", message: "message", type: "type", category: "category", readAt: "readAt", createdAt: "createdAt" },
  activitiesTable: {
    id: "id",
    tenantId: "tenantId",
    leadId: "leadId",
    dealId: "dealId",
    tipo: "tipo",
    titulo: "titulo",
    descricao: "descricao",
    status: "status",
    dataVencimento: "dataVencimento",
    concluidaEm: "concluidaEm",
    responsavelId: "responsavelId",
    createdAt: "createdAt",
  },
  tenantInvitesTable: {
    id: "id",
    tenantId: "tenantId",
    email: "email",
    role: "role",
    usedAt: "usedAt",
    token: "token",
    expiresAt: "expiresAt",
  },
  usersTable: {
    id: "id",
    tenantId: "tenantId",
    name: "name",
    email: "email",
    role: "role",
    platformRole: "platformRole",
    active: "active",
    createdAt: "createdAt",
    updatedAt: "updatedAt",
  },
  insertDealSchema: {
    safeParse: () => ({ success: false, error: { message: "not exercised" } }),
  },
  updateDealSchema: {
    safeParse: () => ({ success: true, data: {} }),
  },
}));

vi.mock("../routes/invites.js", () => ({
  buildInviteUrl: vi.fn(() => "https://example.com/invite/test-token"),
  invitesProtectedRouter: { use: vi.fn(), get: vi.fn(), post: vi.fn() },
  default: { use: vi.fn(), get: vi.fn(), post: vi.fn() },
}));

vi.mock("../lib/email.js", () => ({
  sendInviteEmail: vi.fn().mockResolvedValue(true),
}));

vi.mock("../lib/asaas.js", () => ({
  isAsaasConfigured: vi.fn().mockReturnValue(false),
  createOrGetCustomer: vi.fn(),
  createCharge: vi.fn(),
}));

vi.mock("../lib/zapsign.js", () => ({
  isZapSignConfigured: vi.fn().mockReturnValue(false),
  createDocument: vi.fn(),
}));

vi.mock("../lib/contract-generation.js", () => ({
  generateContractPDF: vi.fn().mockResolvedValue(Buffer.from("mock-pdf")),
}));

vi.mock("../services/erp-webhook.js", () => ({
  dispatchVendaWebhook: vi.fn(),
}));

vi.mock("../services/omnichannel.js", () => ({
  sendDirectWhatsAppMessage: vi.fn().mockResolvedValue(undefined),
  WhatsAppNotConnectedError: class WhatsAppNotConnectedError extends Error {},
}));

import express from "express";
import { authenticate } from "../middlewares/auth.js";
import dealsRouter from "../routes/deals.js";

const app = express();
app.use(express.json());
app.use("/api", authenticate, dealsRouter);
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
});

const { setupSelectReturning, setupUpdateReturning, setupDeleteSuccess } = createDbHelpers({
  mockDbSelect,
  mockDbUpdate,
  mockDbDelete,
  mockDbInsert,
});

const RECORD_ID = "deal-owned-by-b";

const recordOwnedByTenantB: MockRow = {
  id: RECORD_ID,
  tenantId: TENANT_B,
  assignedTo: "owner-b",
  titulo: "Big Deal",
};

describe("GET /api/deals/:id — cross-tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbSelect.mockReset();
    setupSelectReturning([recordOwnedByTenantB]);
  });

  it("returns 403 when tenant A requests a record owned by tenant B", async () => {
    const res = await request(app)
      .get(`/api/deals/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(res.body).toMatchObject({ error: expect.stringContaining("Access denied") });
  });

  it("returns 200 when tenant B requests its own record", async () => {
    const res = await request(app)
      .get(`/api/deals/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.id).toBe(RECORD_ID);
  });

  it("returns 200 when super_admin requests a cross-tenant record", async () => {
    const res = await request(app)
      .get(`/api/deals/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenSuperAdmin}`);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.id).toBe(RECORD_ID);
  });

  it("returns 404 when the record does not exist", async () => {
    mockDbSelect.mockReset();
    setupSelectReturning([]);

    const res = await request(app)
      .get(`/api/deals/nonexistent`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status, JSON.stringify(res.body)).toBe(404);
  });
});

describe("PATCH /api/deals/:id — cross-tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbSelect.mockReset();
    setupSelectReturning([recordOwnedByTenantB]);
    setupUpdateReturning([{ ...recordOwnedByTenantB, titulo: "Updated Deal" }]);
    mockDbTransaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback({
        select: mockDbSelect,
        update: mockDbUpdate,
        insert: mockDbInsert,
        delete: mockDbDelete,
      })
    );
  });

  it("returns 403 when tenant A patches a record owned by tenant B", async () => {
    const res = await request(app)
      .patch(`/api/deals/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ titulo: "Updated Deal" });

    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(res.body).toMatchObject({ error: expect.stringContaining("Access denied") });
  });

  it("returns 200 when tenant B patches its own record", async () => {
    const res = await request(app)
      .patch(`/api/deals/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ titulo: "Updated Deal" });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
  });

  it("returns 200 when super_admin patches a cross-tenant record", async () => {
    const res = await request(app)
      .patch(`/api/deals/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenSuperAdmin}`)
      .send({ titulo: "Updated Deal" });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
  });

  it("returns 404 when the record does not exist", async () => {
    mockDbSelect.mockReset();
    setupSelectReturning([]);

    const res = await request(app)
      .patch(`/api/deals/nonexistent`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ titulo: "Updated Deal" });

    expect(res.status, JSON.stringify(res.body)).toBe(404);
  });
});

describe("POST /api/deals/:id/resume-commercial — warming handoff", () => {
  const warmingDeal: MockRow = {
    id: "warming-b-1",
    tenantId: TENANT_B,
    leadId: "lead-b-1",
    titulo: "Casa ICF",
    etapa: "em_aquecimento",
    assignedTo: "owner-b-1",
    relationshipStage: "aquecimento_lead",
  };

  function queueLimitedSelect(rows: MockRow[]) {
    const limit = vi.fn().mockResolvedValue(rows);
    const where = vi.fn().mockReturnValue({ limit });
    mockDbSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({ where }),
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockDbSelect.mockReset();
  });

  it("preserves tenant isolation when another tenant tries to resume the warming card", async () => {
    queueLimitedSelect([warmingDeal]);

    const res = await request(app)
      .post("/api/deals/warming-b-1/resume-commercial")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        responsavelId: "owner-b-1",
        atividadeTitulo: "Preparar proposta",
      });

    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(mockDbTransaction).not.toHaveBeenCalled();
  });

  it("atomically creates a new commercial cycle and keeps the warming card in history", async () => {
    queueLimitedSelect([warmingDeal]);
    queueLimitedSelect([{ id: "lead-b-1", tenantId: TENANT_B, excluidoEm: null }]);
    queueLimitedSelect([{ id: "owner-b-1", tenantId: TENANT_B, active: true }]);
    mockDbSelect.mockReturnValue(mockSelectQuery([]));

    const createdDeal = {
      ...warmingDeal,
      id: "commercial-b-2",
      etapa: "novo",
      titulo: "Casa ICF — Retomada",
    };

    const txInsert = vi.fn(() => {
      const returning = vi.fn().mockResolvedValue([createdDeal]);
      const values = vi.fn().mockReturnValue({ returning });
      return { values };
    });
    const txUpdate = vi.fn(() => {
      const where = vi.fn().mockResolvedValue(undefined);
      const set = vi.fn().mockReturnValue({ where });
      return { set };
    });

    mockDbTransaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback({ insert: txInsert, update: txUpdate })
    );

    const res = await request(app)
      .post("/api/deals/warming-b-1/resume-commercial")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({
        responsavelId: "owner-b-1",
        atividadeTitulo: "Preparar proposta",
        atividadeDescricao: "Levar solução técnica",
        observacaoPassagem: "Cliente retomou contato",
      });

    if (res.status !== 201) {
      throw new Error(`resume-commercial returned ${res.status}: ${JSON.stringify(res.body)}`);
    }
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body).toMatchObject({
      resumedDealId: "warming-b-1",
      alreadyResumed: false,
      deal: { id: "commercial-b-2", etapa: "novo" },
    });
    expect(mockDbTransaction).toHaveBeenCalledTimes(1);
    expect(txInsert).toHaveBeenCalledTimes(3);
    expect(txUpdate).toHaveBeenCalledTimes(1);
  });
});

describe("DELETE /api/deals/:id — cross-tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbSelect.mockReset();
    setupSelectReturning([recordOwnedByTenantB]);
    mockDbSelect.mockReturnValueOnce(mockSelectQuery([recordOwnedByTenantB])).mockReturnValue(mockSelectQuery([]));
    setupUpdateReturning([{ ...recordOwnedByTenantB, archivedAt: new Date() }]);
  });

  it("returns 403 when tenant A deletes a record owned by tenant B", async () => {
    const res = await request(app)
      .delete(`/api/deals/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(res.body).toMatchObject({ error: expect.stringContaining("Access denied") });
  });

  it("returns 200 when tenant B deletes its own record", async () => {
    const res = await request(app)
      .delete(`/api/deals/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenB}`).send({ motivo: "Encerrado pelo administrador" });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.archivedAt).toBeTruthy();
    expect(mockDbDelete).not.toHaveBeenCalled();
  });

  it("returns 200 when super_admin deletes a cross-tenant record", async () => {
    const res = await request(app)
      .delete(`/api/deals/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenSuperAdmin}`).send({ motivo: "Encerrado pelo administrador" });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.archivedAt).toBeTruthy();
    expect(mockDbDelete).not.toHaveBeenCalled();
  });

  it("returns 404 when the record does not exist", async () => {
    mockDbSelect.mockReset();
    setupSelectReturning([]);

    const res = await request(app)
      .delete(`/api/deals/nonexistent`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status, JSON.stringify(res.body)).toBe(404);
  });
});

describe("Unauthenticated access — deals", () => {
  it("returns 401 for GET without a token", async () => {
    const res = await request(app).get(`/api/deals/${RECORD_ID}`);
    expect(res.status, JSON.stringify(res.body)).toBe(401);
  });

  it("returns 401 for PATCH without a token", async () => {
    const res = await request(app)
      .patch(`/api/deals/${RECORD_ID}`)
      .send({ titulo: "X" });
    expect(res.status, JSON.stringify(res.body)).toBe(401);
  });

  it("returns 401 for DELETE without a token", async () => {
    const res = await request(app).delete(`/api/deals/${RECORD_ID}`);
    expect(res.status, JSON.stringify(res.body)).toBe(401);
  });
});
