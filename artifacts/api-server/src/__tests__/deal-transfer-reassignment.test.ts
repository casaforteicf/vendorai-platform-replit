import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { TENANT_B, TEST_SECRET } from "./helpers/auth.js";
import { MockRow, createDbHelpers } from "./helpers/isolation.js";

const { mockDbSelect, mockDbUpdate, mockDbDelete, mockDbInsert, mockDbTransaction, dbModuleMock } = vi.hoisted(
  () => {
    const mockDbSelect = vi.fn();
    const mockDbUpdate = vi.fn();
    const mockDbDelete = vi.fn();
    const mockDbInsert = vi.fn();
    const mockDbTransaction = vi.fn();
    const table = (columns: string[]) => Object.fromEntries(columns.map((column) => [column, column]));
    return {
      mockDbSelect,
      mockDbUpdate,
      mockDbDelete,
      mockDbInsert,
      mockDbTransaction,
      dbModuleMock: {
        db: {
          select: mockDbSelect,
          update: mockDbUpdate,
          delete: mockDbDelete,
          insert: mockDbInsert,
          transaction: mockDbTransaction,
        },
        dealsTable: table(["id", "tenantId", "createdAt", "updatedAt", "etapa", "funilId", "leadId", "assignedTo", "relationshipStage", "titulo", "archivedAt"]),
        leadsTable: table(["id", "tenantId", "email", "nome", "telefone", "documento", "empresa", "excluidoEm"]),
        pipelineStagesTable: table(["id", "tenantId", "pipeline", "key", "label", "ordem", "responsaveisFuncoes"]),
        tenantsTable: table(["id", "name"]),
        usersTable: table(["id", "tenantId", "name", "email", "role", "platformRole", "userFunction", "customFunctionId", "active"]),
        activitiesTable: table(["id", "tenantId", "leadId", "dealId", "tipo", "titulo", "descricao", "status", "concluidaEm", "responsavelId", "createdAt"]),
        workCardsTable: table(["id", "tenantId", "pipeline", "leadId", "dealId", "metadata", "etapa", "descricao"]),
        tenantInvitesTable: table(["id"]),
        partnersTable: table(["id"]),
        notificationsTable: table(["id"]),
        propostasTable: table(["id"]),
        plansTable: table(["id"]),
        planAssignmentLogTable: table(["id"]),
        dealClosingStatusTable: table(["id"]),
        contractsTable: table(["id"]),
        billingRecordsTable: table(["id"]),
        automationLogsTable: table(["id"]),
        reactivationQueueTable: table(["id"]),
        agentTasksTable: table(["id"]),
        sellerCommissionsTable: table(["id"]),
        produtosCatalogoTable: table(["id"]),
        farmaciaPedidoTable: table(["id"]),
        billingEventsTable: table(["id"]),
        insertDealSchema: { safeParse: () => ({ success: false, error: { message: "not exercised" } }) },
        updateDealSchema: { safeParse: () => ({ success: true, data: {} }) },
      },
    };
  }
);

vi.mock("@workspace/db", () => dbModuleMock);

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

vi.mock("../lib/objectStorage.js", () => ({
  ObjectStorageService: class ObjectStorageService {},
  ObjectNotFoundError: class ObjectNotFoundError extends Error {},
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

const { setupUpdateReturning, setupInsertReturning } = createDbHelpers({
  mockDbSelect,
  mockDbUpdate,
  mockDbDelete,
  mockDbInsert,
});

const DEAL_ID = "deal-transfer-1";
const LEAD_ID = "lead-transfer-1";
const OWNER_ID = "owner-transfer-1";
const OTHER_SELLER_ID = "seller-transfer-2";
const NEW_OWNER_ID = "new-owner-transfer-3";

type TokenRole = "super_admin" | "tenant_admin" | "tenant_seller" | "member";

function tokenFor(sub: string, platformRole: TokenRole, userFunction?: string) {
  return jwt.sign(
    {
      sub,
      email: `${sub}@tenant-beta.example.com`,
      platformRole,
      tenantId: TENANT_B,
      role: "member",
      ...(userFunction ? { userFunction } : {}),
    },
    TEST_SECRET,
    { expiresIn: "1h" }
  );
}

const sellerToken = tokenFor(OWNER_ID, "tenant_seller", "vendedor");
const otherSellerToken = tokenFor(OTHER_SELLER_ID, "tenant_seller", "vendedor");
const adminFunctionToken = tokenFor("admin-function-1", "member", "administrador");

function dealWith(overrides: Partial<MockRow> = {}): MockRow {
  return {
    id: DEAL_ID,
    tenantId: TENANT_B,
    leadId: LEAD_ID,
    titulo: "Negócio de teste",
    etapa: "novo",
    assignedTo: OWNER_ID,
    relationshipStage: null,
    archivedAt: null,
    ...overrides,
  };
}

function queueLimitedSelect(rows: MockRow[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ limit });
  mockDbSelect.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({ where }),
  });
}

function queueTransferDependencies(deal: MockRow, responsibleId = NEW_OWNER_ID, withResponsible = true) {
  queueLimitedSelect([deal]);
  queueLimitedSelect([{ excluidoEm: null }]);
  queueLimitedSelect([{ id: "stage-novo", key: "novo", label: "Novo", responsaveisFuncoes: ["builtin:vendedor"] }]);
  if (withResponsible) {
    queueLimitedSelect([{ id: responsibleId, active: true, userFunction: "vendedor", customFunctionId: null }]);
  }
}

function transferPayload(extra: Record<string, unknown> = {}) {
  return {
    targetPipeline: "comercial",
    targetStage: "novo",
    responsavelId: NEW_OWNER_ID,
    justificativa: "Cliente solicitou a mudança de pipeline",
    ...extra,
  };
}

describe("POST /api/deals/:id/transfer-pipeline — reatribuição de responsável", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupUpdateReturning([]);
    setupInsertReturning([]);
  });

  it("permite que a função administrador reatribua o responsável ao mover de pipeline", async () => {
    queueTransferDependencies(dealWith());

    const res = await request(app)
      .post(`/api/deals/${DEAL_ID}/transfer-pipeline`)
      .set("Authorization", `Bearer ${adminFunctionToken}`)
      .send(transferPayload());

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, destination: { pipeline: "comercial", stage: "novo" } });
    expect(mockDbUpdate).toHaveBeenCalled();
  });

  it("permite ao vendedor assumir um negócio que ainda não tem responsável", async () => {
    queueTransferDependencies(dealWith({ assignedTo: null }), OWNER_ID);

    const res = await request(app)
      .post(`/api/deals/${DEAL_ID}/transfer-pipeline`)
      .set("Authorization", `Bearer ${sellerToken}`)
      .send(transferPayload({ responsavelId: OWNER_ID }));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true });
  });

  it("bloqueia o vendedor que tenta reatribuir um negócio já atribuído", async () => {
    queueTransferDependencies(dealWith(), NEW_OWNER_ID, false);

    const res = await request(app)
      .post(`/api/deals/${DEAL_ID}/transfer-pipeline`)
      .set("Authorization", `Bearer ${sellerToken}`)
      .send(transferPayload());

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: "Apenas administradores podem reatribuir o responsável na transferência." });
  });

  it("bloqueia o vendedor que tenta mover negócio de outro responsável", async () => {
    queueTransferDependencies(dealWith(), NEW_OWNER_ID, false);

    const res = await request(app)
      .post(`/api/deals/${DEAL_ID}/transfer-pipeline`)
      .set("Authorization", `Bearer ${otherSellerToken}`)
      .send(transferPayload({ responsavelId: OWNER_ID }));

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: "Sem permissão para transferir negócio de outro responsável." });
  });
});
