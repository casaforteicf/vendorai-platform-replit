import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { TENANT_B, tokenB } from "./helpers/auth.js";
import { MockRow, createDbHelpers, mockSelectQuery } from "./helpers/isolation.js";

const { mockDbSelect, mockDbUpdate, mockDbDelete, mockDbInsert, mockCheckCatalogMatch } = vi.hoisted(
  () => ({
    mockDbSelect: vi.fn(),
    mockDbUpdate: vi.fn(),
    mockDbDelete: vi.fn(),
    mockDbInsert: vi.fn(),
    mockCheckCatalogMatch: vi.fn(),
  })
);

vi.mock("@workspace/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@workspace/db")>()),
  db: {
    transaction: async (callback: (tx: unknown) => unknown) => callback({ update: mockDbUpdate, insert: mockDbInsert, select: mockDbSelect }),
    select: mockDbSelect,
    update: mockDbUpdate,
    delete: mockDbDelete,
    insert: mockDbInsert,
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
    valor: "valor",
    titulo: "titulo",
    planoContratado: "planoContratado",
    wonAt: "wonAt",
  },
  leadsTable: { id: "id", tenantId: "tenantId", email: "email", nome: "nome", telefone: "telefone", documento: "documento", empresa: "empresa" },
  tenantsTable: { id: "id", name: "name", webhookEstoqueUrl: "webhookEstoqueUrl", partnerId: "partnerId", tipoFechamentoDefault: "tipoFechamentoDefault", integrationType: "integrationType" },
  partnersTable: { id: "id", name: "name", email: "email", asaasWalletId: "asaasWalletId" },
  billingEventsTable: { id: "id" },
  notificationsTable: { id: "id", tenantId: "tenantId", title: "title", message: "message", type: "type", category: "category", readAt: "readAt", createdAt: "createdAt" },
  propostasTable: { id: "id", dealId: "dealId", itens: "itens", valorTotal: "valorTotal", createdAt: "createdAt" },
  farmaciaPedidoTable: {
    id: "id",
    tenantId: "tenantId",
    dealId: "dealId",
    status: "status",
    updatedAt: "updatedAt",
  },
  agentTasksTable: { id: "id", tenantId: "tenantId", leadId: "leadId", agentName: "agentName", actionType: "actionType", payload: "payload" },
  usersTable: {
    id: "id",
    tenantId: "tenantId",
    name: "name",
    email: "email",
    role: "role",
    platformRole: "platformRole",
    active: "active",
    telefone: "telefone",
    createdAt: "createdAt",
    updatedAt: "updatedAt",
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
  insertDealSchema: {
    safeParse: () => ({ success: false, error: { message: "not exercised" } }),
  },
  updateDealSchema: {
    safeParse: (body: unknown) => ({ success: true, data: body }),
  },
}));

vi.mock("../lib/catalog-price-check.js", () => ({
  checkCatalogMatch: mockCheckCatalogMatch,
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

vi.mock("../services/vehicle-reservation.js", () => ({
  finalizeVehicleReservation: vi.fn().mockResolvedValue(undefined),
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
app.use((req, _res, next) => {
  (req as unknown as { log: Record<string, ReturnType<typeof vi.fn>> }).log = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  next();
});
app.use("/api", authenticate, dealsRouter);
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
});

const { setupInsertReturning } = createDbHelpers({
  mockDbSelect,
  mockDbUpdate,
  mockDbDelete,
  mockDbInsert,
});

function queueSimpleSelect(rows: MockRow[]) {
  const chain = mockSelectQuery(rows);
  mockDbSelect.mockReturnValueOnce(chain);
}

function queuePropostaSelect(rows: MockRow[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const orderBy = vi.fn().mockReturnValue({ limit });
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnValue({ orderBy }),
  };
  mockDbSelect.mockReturnValueOnce(chain);
}

const DEAL_ID = "deal-b-1";

const baseDeal: MockRow = {
  id: DEAL_ID,
  tenantId: TENANT_B,
  etapa: "negociacao",
  assignedTo: null,
  wonAt: null,
  leadId: "lead-b-1",
  titulo: "Negócio Divergente",
  planoContratado: "starter",
  valor: "500.00",
};

describe("PATCH /api/deals/:id — etapa=ganho catalog guardrail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbSelect.mockReset();
  });

  it("blocks direct close and creates an agent_task when value diverges from catalog", async () => {
    // 1) initial `existing` select, 2) dealForCheck select, 3) proposta select (empty)
    queueSimpleSelect([baseDeal]);
    queueSimpleSelect([{ id: "lead-b-1", tenantId: TENANT_B, excluidoEm: null }]);
    queueSimpleSelect([baseDeal]);
    queuePropostaSelect([]);
    mockCheckCatalogMatch.mockResolvedValue({
      hasCatalogBasis: true,
      matches: false,
      propostaTotal: 500,
      catalogTotal: 1000,
      diferenca: -500,
      itemDetails: [],
    });
    setupInsertReturning([{ id: "task-1", tenantId: TENANT_B }]);

    const res = await request(app)
      .patch(`/api/deals/${DEAL_ID}`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ etapa: "ganho" });

    expect(res.status, JSON.stringify(res.body)).toBe(202);
    expect(res.body).toMatchObject({ pendingApproval: true, agentTaskId: "task-1" });
    expect(mockDbUpdate).not.toHaveBeenCalled();

    const insertCalls = mockDbInsert.mock.calls;
    expect(insertCalls.length).toBeGreaterThan(0);
    const taskInsertValuesCall = mockDbInsert.mock.results[0].value.values.mock.calls[0][0];
    expect(taskInsertValuesCall).toMatchObject({
      tenantId: TENANT_B,
      leadId: "lead-b-1",
      actionType: "aprovacao_fechamento",
    });
    expect(taskInsertValuesCall.payload).toMatchObject({ origin: "deals_patch", dealId: DEAL_ID });
  });

  it("returns 422 when value diverges and deal has no leadId (cannot create approval task)", async () => {
    const dealNoLead = { ...baseDeal, leadId: null };
    queueSimpleSelect([dealNoLead]);
    queueSimpleSelect([dealNoLead]);
    queuePropostaSelect([]);
    mockCheckCatalogMatch.mockResolvedValue({
      hasCatalogBasis: true,
      matches: false,
      propostaTotal: 500,
      catalogTotal: 1000,
      diferenca: -500,
      itemDetails: [],
    });

    const res = await request(app)
      .patch(`/api/deals/${DEAL_ID}`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ etapa: "ganho" });

    expect(res.status, JSON.stringify(res.body)).toBe(422);
    expect(mockDbUpdate).not.toHaveBeenCalled();
    expect(mockDbInsert).not.toHaveBeenCalled();
  });

  it("proceeds to the normal update flow when value matches the catalog", async () => {
    queueSimpleSelect([baseDeal]);
    queueSimpleSelect([{ id: "lead-b-1", tenantId: TENANT_B, excluidoEm: null }]);
    queueSimpleSelect([baseDeal]);
    queuePropostaSelect([]);
    queueSimpleSelect([]); // no mandatory pending activities
    queueSimpleSelect([{ id: "user-b", tenantId: TENANT_B, active: true }]); // new owner
    queueSimpleSelect([{ id: "stage-won", tenantId: TENANT_B, responsaveisFuncoes: ["builtin:vendedor"] }]);
    queueSimpleSelect([{ id: "user-b", tenantId: TENANT_B, active: true, userFunction: "vendedor", customFunctionId: null }]);
    mockDbSelect.mockReturnValue(mockSelectQuery([]));
    mockCheckCatalogMatch.mockResolvedValue({
      hasCatalogBasis: true,
      matches: true,
      propostaTotal: 500,
      catalogTotal: 500,
      diferenca: 0,
      itemDetails: [],
    });

    const updated = { ...baseDeal, etapa: "ganho", planoContratado: null };
    const returning = vi.fn().mockResolvedValue([updated]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    mockDbUpdate.mockReturnValue({ set });

    const res = await request(app)
      .patch(`/api/deals/${DEAL_ID}`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ etapa: "ganho" });

    // planoContratado becomes null post-update in this fixture, so the route
    // should hit the PLANO_OBRIGATORIO guard further down — proving it passed
    // the catalog guardrail and reached the pre-existing validation logic.
    expect(mockDbUpdate, JSON.stringify(res.body)).toHaveBeenCalled();
    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(res.body).toMatchObject({ error: "PLANO_OBRIGATORIO" });
  });
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
});
