import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { TENANT_B, tokenB } from "./helpers/auth.js";
import { MockRow, createDbHelpers } from "./helpers/isolation.js";

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
  dealsTable: {
    id: "id",
    tenantId: "tenantId",
    createdAt: "createdAt",
    updatedAt: "updatedAt",
    etapa: "etapa",
    funilId: "funilId",
    leadId: "leadId",
    assignedTo: "assignedTo",
    relationshipStage: "relationshipStage",
    titulo: "titulo",
    archivedAt: "archivedAt",
  },
  leadsTable: { id: "id", tenantId: "tenantId", email: "email", nome: "nome", telefone: "telefone", documento: "documento", empresa: "empresa", excluidoEm: "excluidoEm" },
  pipelineStagesTable: {
    id: "id",
    tenantId: "tenantId",
    pipeline: "pipeline",
    key: "key",
    label: "label",
    ordem: "ordem",
    responsaveisFuncoes: "responsaveisFuncoes",
  },
  tenantsTable: { id: "id", name: "name" },
  usersTable: {
    id: "id",
    tenantId: "tenantId",
    name: "name",
    email: "email",
    role: "role",
    platformRole: "platformRole",
    userFunction: "userFunction",
    customFunctionId: "customFunctionId",
    active: "active",
  },
  activitiesTable: { id: "id", tenantId: "tenantId", leadId: "leadId", dealId: "dealId", tipo: "tipo", titulo: "titulo", descricao: "descricao", status: "status", concluidaEm: "concluidaEm", responsavelId: "responsavelId", createdAt: "createdAt" },
  workCardsTable: { id: "id", tenantId: "tenantId", pipeline: "pipeline", leadId: "leadId", dealId: "dealId", metadata: "metadata", etapa: "etapa", descricao: "descricao" },
  billingEventsTable: { id: "id" },
  insertDealSchema: { safeParse: () => ({ success: false, error: { message: "not exercised" } }) },
  updateDealSchema: { safeParse: () => ({ success: true, data: {} }) },
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

const { setupUpdateReturning, setupInsertReturning } = createDbHelpers({
  mockDbSelect,
  mockDbUpdate,
  mockDbDelete,
  mockDbInsert,
});

const DEAL_ID = "deal-transfer-1";
const LEAD_ID = "lead-transfer-1";
const OWNER_ID = "owner-transfer-1";

const movableDeal: MockRow = {
  id: DEAL_ID,
  tenantId: TENANT_B,
  leadId: LEAD_ID,
  titulo: "Negócio de teste",
  etapa: "novo",
  assignedTo: OWNER_ID,
  relationshipStage: null,
  archivedAt: null,
};

function queueLimitedSelect(rows: MockRow[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ limit });
  mockDbSelect.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({ where }),
  });
}

function queueTransferDependencies() {
  queueLimitedSelect([movableDeal]);
  queueLimitedSelect([{ excluidoEm: null }]);
  queueLimitedSelect([{ id: "stage-novo", key: "novo", label: "Novo", responsaveisFuncoes: ["builtin:vendedor"] }]);
  queueLimitedSelect([{ id: OWNER_ID, active: true, userFunction: "vendedor", customFunctionId: null }]);
}

function transferPayload(extra: Record<string, unknown> = {}) {
  return {
    targetPipeline: "comercial",
    targetStage: "novo",
    responsavelId: OWNER_ID,
    ...extra,
  };
}

describe("POST /api/deals/:id/transfer-pipeline — justificativa opcional", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupUpdateReturning([]);
    setupInsertReturning([]);
  });

  it("moves the lead without a justificativa", async () => {
    queueTransferDependencies();

    const res = await request(app)
      .post(`/api/deals/${DEAL_ID}/transfer-pipeline`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send(transferPayload());

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, destination: { pipeline: "comercial", stage: "novo" } });
    expect(mockDbUpdate).toHaveBeenCalled();
    const journeyValues = mockDbInsert.mock.results[0]?.value?.values?.mock?.calls?.[0]?.[0];
    expect(journeyValues).toMatchObject({ descricao: "Movimentação registrada sem justificativa." });
  });

  it("accepts an empty justificativa", async () => {
    queueTransferDependencies();

    const res = await request(app)
      .post(`/api/deals/${DEAL_ID}/transfer-pipeline`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send(transferPayload({ justificativa: "   " }));

    expect(res.status).toBe(200);
  });

  it("still records the justificativa when one is provided", async () => {
    queueTransferDependencies();

    const res = await request(app)
      .post(`/api/deals/${DEAL_ID}/transfer-pipeline`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send(transferPayload({ justificativa: "Cliente pediu suporte técnico" }));

    expect(res.status).toBe(200);
    const journeyValues = mockDbInsert.mock.results[0]?.value?.values?.mock?.calls?.[0]?.[0];
    expect(journeyValues).toMatchObject({ descricao: "Justificativa: Cliente pediu suporte técnico" });
  });
});
