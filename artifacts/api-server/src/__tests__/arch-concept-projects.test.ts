import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { TENANT_A, TENANT_B, tokenA, tokenB } from "./helpers/auth.js";

const { mockDbSelect, mockDbUpdate, mockDbDelete, mockDbInsert, mockDbExecute, mockDbTransaction } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockDbDelete: vi.fn(),
  mockDbInsert: vi.fn(),
  mockDbExecute: vi.fn(),
  mockDbTransaction: vi.fn(),
}));

vi.mock("@workspace/db", () => {
  const passthroughSchema = { safeParse: (value: unknown) => ({ success: true, data: value }) };
  const rejectSchema = { safeParse: () => ({ success: false, error: { flatten: () => ({}) } }) };

  return {
    db: {
      select: mockDbSelect,
      update: mockDbUpdate,
      delete: mockDbDelete,
      insert: mockDbInsert,
      execute: mockDbExecute,
      transaction: mockDbTransaction,
    },
    archConceptProjectsTable: {
      id: "id",
      tenantId: "tenantId",
      ownerUserId: "ownerUserId",
      archProjetoId: "archProjetoId",
      updatedAt: "updatedAt",
    },
    archProjetosTable: {
      id: "id",
      tenantId: "tenantId",
    },
    archAiRendersTable: {
      tenantId: "tenantId",
      projectId: "projectId",
    },
    leadsTable: {},
    dealsTable: {},
    archAmbientesTable: {},
    archOrcamentoItensTable: {},
    archCenasTable: {},
    archRendersTable: {},
    archCatalogoTable: {},
    archMarketplaceItemsTable: {},
    archMarketplacePedidosTable: {},
    archRenderVersoesTable: {},
    archRenderSolicitacoesTable: {},
    archSuggestionsTable: {},
    renderSurfacesTable: {},
    renderSurfaceMaterialsTable: {},
    notificationsTable: {},
    tenantsTable: {},
    obrasTable: {},
    obraEtapasTable: {},
    arqObjectsTable: {},
    arqMaterialsTable: {},
    arqAieSnapshotsTable: {},
    archPromptVariationsTable: {},
    arqdorWorkspaceProjectsTable: {},
    archSpecificationsTable: {},
    archSpecItemsTable: {},
    archPartnersTable: {},
    archSolicitacoesTable: {},
    archKnowledgeEntriesTable: {},
    archKnowledgeTagsTable: {},
    archOfficeTemplatesTable: {},
    automationLogsTable: {},
    insertArchConceptProjectSchema: passthroughSchema,
    updateArchConceptProjectSchema: passthroughSchema,
    insertArchProjetoSchema: rejectSchema,
    updateArchProjetoSchema: rejectSchema,
    insertArchAmbienteSchema: rejectSchema,
    updateArchAmbienteSchema: rejectSchema,
    insertArchOrcamentoItemSchema: rejectSchema,
    updateArchOrcamentoItemSchema: rejectSchema,
    insertArchCatalogoSchema: rejectSchema,
    updateArchCatalogoSchema: rejectSchema,
    insertArchCenaSchema: rejectSchema,
    updateArchCenaSchema: rejectSchema,
    insertArchRenderSolicitacaoSchema: rejectSchema,
    insertRenderSurfaceSchema: rejectSchema,
    updateRenderSurfaceSchema: rejectSchema,
    insertRenderSurfaceMaterialSchema: rejectSchema,
    insertArchPartnerSchema: rejectSchema,
    updateArchPartnerSchema: rejectSchema,
    insertArchPromptVariationSchema: rejectSchema,
    updateArchPromptVariationSchema: rejectSchema,
    updateArchSpecItemSchema: rejectSchema,
    updateArchSpecificationSchema: rejectSchema,
  };
});

vi.mock("@workspace/integrations-anthropic-ai", () => ({
  anthropic: { messages: { create: vi.fn() } },
}));

vi.mock("../lib/objectStorage.js", () => ({
  objectStorageClient: {},
  ObjectStorageService: vi.fn(),
}));

vi.mock("../services/blenderService.js", () => ({
  iniciarRender: vi.fn(),
  processarSolicitacao: vi.fn(),
}));

vi.mock("openai", () => ({
  default: vi.fn(),
  toFile: vi.fn(),
}));

vi.mock("../lib/agent-engine.js", () => ({
  getOpenAIForTenant: vi.fn(),
}));

vi.mock("../lib/ai-gateway.js", () => ({
  callReplicateFlux: vi.fn(),
  callOpenAI: vi.fn(),
}));

vi.mock("../lib/arqdor/orchestrator/index.js", () => ({
  arqOrchestrator: {},
}));

vi.mock("../lib/dedup.js", () => ({
  findLeadByDedup: vi.fn(),
  storePhone: vi.fn(),
}));

vi.mock("../lib/round-robin.js", () => ({
  pickNextVendedor: vi.fn(),
}));

import express from "express";
import { authenticate } from "../middlewares/auth.js";
import archRouter from "../routes/arch.js";

const app = express();
app.use(express.json());
app.use("/api", authenticate, archRouter);

const txDb = {
  select: mockDbSelect,
  update: mockDbUpdate,
  delete: mockDbDelete,
  insert: mockDbInsert,
  execute: mockDbExecute,
};


const conceptA = {
  id: "concept-a",
  tenantId: TENANT_A,
  ownerUserId: `user-${TENANT_A}`,
  archProjetoId: null,
  title: "Casa teste",
  status: "draft",
  currentStep: 4,
  lot: { width: 12, depth: 30 },
  configuration: { floors: 1, desiredArea: 145 },
  rooms: [],
  openingOverrides: {},
  selectedVariant: 0,
};

function selectLimitReturning(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
}

function insertReturning(rows: unknown[]) {
  const returning = vi.fn().mockResolvedValue(rows);
  const values = vi.fn().mockReturnValue({ returning });
  mockDbInsert.mockReturnValue({ values });
  return { values, returning };
}

function updateReturning(rows: unknown[]) {
  const returning = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  mockDbUpdate.mockReturnValue({ set });
  return { set, where, returning };
}

describe("Arqdor Concept — persistência e isolamento", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbExecute.mockResolvedValue({ rows: [{ pg_advisory_xact_lock: true }] });
    mockDbTransaction.mockImplementation(async (callback: (tx: typeof txDb) => unknown) => callback(txDb));
  });

  it("carrega o último pré-projeto do próprio tenant/usuário", async () => {
    mockDbSelect.mockReturnValue(selectLimitReturning([conceptA]));

    const res = await request(app)
      .get("/api/arch/concept-projects/latest")
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: "concept-a",
      tenantId: TENANT_A,
      ownerUserId: `user-${TENANT_A}`,
    });
  });

  it("não expõe um Concept de outro tenant", async () => {
    mockDbSelect.mockReturnValue(selectLimitReturning([]));

    const res = await request(app)
      .get("/api/arch/concept-projects/concept-a")
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(404);
  });

  it("força tenantId e ownerUserId da sessão ao criar", async () => {
    const created = {
      ...conceptA,
      lot: { width: 14, depth: 28 },
    };
    const { values } = insertReturning([created]);

    const res = await request(app)
      .post("/api/arch/concept-projects")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        ...created,
        tenantId: TENANT_B,
        ownerUserId: "usuario-forjado",
      });

    expect(res.status).toBe(201);
    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: TENANT_A,
      ownerUserId: `user-${TENANT_A}`,
    }));
  });

  it("persiste edição do Concept existente", async () => {
    updateReturning([{ ...conceptA, currentStep: 6 }]);

    const res = await request(app)
      .patch("/api/arch/concept-projects/concept-a")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ currentStep: 6 });

    expect(res.status).toBe(200);
    expect(res.body.currentStep).toBe(6);
  });

  it("persiste o contrato avançado do editor sem perder materiais, objetos e histórico de render", async () => {
    const { set } = updateReturning([conceptA]);

    const configuration = {
      floors: 2,
      desiredArea: 210,
      objects: [
        {
          id: "obj-1",
          kind: "sofa",
          label: "Sofá 3 lugares",
          floor: 0,
          x: 2.5,
          y: 3.25,
          width: 2.2,
          depth: 0.9,
          rotation: 90,
          materialId: "tecido-bege",
        },
      ],
      spaceProfiles: [
        {
          id: "space-profile-1",
          floor: 0,
          label: "Sala",
          kind: "sala",
          centroid: { x: 4.2, y: 5.1 },
          area: 24.6,
          floorMaterialId: "madeira-carvalho",
        },
      ],
      wallMaterials: {
        "wall-1": "madeira-ripada",
      },
    };

    const conceptRender = {
      renderId: "render-2",
      status: "completed",
      resultImageUrl: "https://cdn.example/render-2.png",
      generatedAt: "2026-09-21T13:20:00.000Z",
      source: "model3d",
      renderView: "interior",
      history: [
        {
          renderId: "render-1",
          resultImageUrl: "https://cdn.example/render-1.png",
          generatedAt: "2026-09-21T13:10:00.000Z",
          source: "facade",
          renderView: "exterior",
        },
        {
          renderId: "render-2",
          resultImageUrl: "https://cdn.example/render-2.png",
          generatedAt: "2026-09-21T13:20:00.000Z",
          source: "model3d",
          renderView: "interior",
        },
      ],
    };

    const res = await request(app)
      .patch("/api/arch/concept-projects/concept-a")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        configuration,
        rooms: [
          {
            id: "room-1",
            kind: "sala",
            label: "Sala",
            width: 5,
            depth: 4,
            floor: 0,
            x: 1,
            y: 2,
            floorMaterialId: "madeira-carvalho",
          },
        ],
        conceptRender,
      });

    expect(res.status).toBe(200);
    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      configuration,
      conceptRender,
      rooms: expect.arrayContaining([
        expect.objectContaining({ id: "room-1", floorMaterialId: "madeira-carvalho" }),
      ]),
    }));
  });

  it("ignora status e archProjetoId forjados no PATCH comum", async () => {
    const { set } = updateReturning([{ ...conceptA, currentStep: 5 }]);

    const res = await request(app)
      .patch("/api/arch/concept-projects/concept-a")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        currentStep: 5,
        status: "submitted",
        archProjetoId: "forged-project",
      });

    expect(res.status).toBe(200);
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ currentStep: 5 }));
    expect(set).not.toHaveBeenCalledWith(expect.objectContaining({ status: expect.anything() }));
    expect(set).not.toHaveBeenCalledWith(expect.objectContaining({ archProjetoId: expect.anything() }));
  });

  it("retorna 404 quando PATCH não encontra linha do mesmo tenant/owner", async () => {
    updateReturning([]);

    const res = await request(app)
      .patch("/api/arch/concept-projects/concept-a")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ currentStep: 6 });

    expect(res.status).toBe(404);
  });
});

describe("Arqdor Concept — handoff idempotente para Projeto Arqdor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbExecute.mockResolvedValue({ rows: [{ pg_advisory_xact_lock: true }] });
    mockDbTransaction.mockImplementation(async (callback: (tx: typeof txDb) => unknown) => callback(txDb));
  });

  it("reutiliza archProjetoId já promovido e não cria projeto duplicado", async () => {
    const promotedConcept = {
      ...conceptA,
      archProjetoId: "arch-project-1",
      status: "submitted",
    };
    const existingProject = {
      id: "arch-project-1",
      tenantId: TENANT_A,
      titulo: "Projeto existente",
    };

    mockDbSelect
      .mockReturnValueOnce(selectLimitReturning([promotedConcept]))
      .mockReturnValueOnce(selectLimitReturning([existingProject]));

    const res = await request(app)
      .post("/api/arch/concept-projects/concept-a/promote")
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      alreadyPromoted: true,
      project: { id: "arch-project-1" },
    });
    expect(mockDbInsert).not.toHaveBeenCalled();
  });

  it("bloqueia promote quando o Concept não pertence ao tenant/owner", async () => {
    mockDbSelect.mockReturnValue(selectLimitReturning([]));

    const res = await request(app)
      .post("/api/arch/concept-projects/concept-a/promote")
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(404);
    expect(mockDbInsert).not.toHaveBeenCalled();
  });
});
