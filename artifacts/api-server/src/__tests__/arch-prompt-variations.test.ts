import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { TENANT_A, TENANT_B, tokenA, tokenB } from "./helpers/auth.js";
import { MockRow, createDbHelpers } from "./helpers/isolation.js";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const { mockDbSelect, mockDbUpdate, mockDbDelete, mockDbInsert } = vi.hoisted(
  () => ({
    mockDbSelect: vi.fn(),
    mockDbUpdate: vi.fn(),
    mockDbDelete: vi.fn(),
    mockDbInsert: vi.fn(),
  })
);

// ─── @workspace/db ────────────────────────────────────────────────────────────

vi.mock("@workspace/db", () => {
  const noopSafeParse = (v: unknown) => ({ success: true, data: v });
  const stubSchema = { safeParse: () => ({ success: false, error: { issues: [] } }) };

  return {
    db: {
      select: mockDbSelect,
      update: mockDbUpdate,
      delete: mockDbDelete,
      insert: mockDbInsert,
    },
    archPromptVariationsTable: {
      id: "id",
      tenantId: "tenantId",
      userId: "userId",
      name: "name",
      translator: "translator",
      detail: "detail",
      prompt: "prompt",
      negativePrompt: "negativePrompt",
      estimatedTokens: "estimatedTokens",
      notes: "notes",
      savedAt: "savedAt",
      createdAt: "createdAt",
      updatedAt: "updatedAt",
    },
    // Stubs for tables used by other arch.ts routes (not exercised here)
    archProjetosTable: {},
    archAmbientesTable: {},
    archOrcamentoItensTable: {},
    archCenasTable: {},
    archRendersTable: {},
    archCatalogoTable: {},
    produtosCatalogoTable: {},
    categoriasProdutoTable: {},
    archMaterialsTable: {},
    archMaterialImagesTable: {},
    archMaterialTenantAccessTable: {},
    archCatalogProductMaterialsTable: {},
    archMarketplaceItemsTable: {},
    archMarketplacePedidosTable: {},
    archRenderVersoesTable: {},
    archRenderSolicitacoesTable: {},
    archSuggestionsTable: {},
    renderSurfacesTable: {},
    renderSurfaceMaterialsTable: {},
    notificationsTable: {},
    tenantsTable: {},
    invoicesTable: {},
    arqObjectsTable: {},
    arqMaterialsTable: {},
    arqAieSnapshotsTable: {},
    automationLogsTable: {},
    // Only the prompt-variation schemas are exercised in these tests
    insertArchPromptVariationSchema: { safeParse: noopSafeParse },
    updateArchPromptVariationSchema: { safeParse: noopSafeParse },
    insertArchProjetoSchema: stubSchema,
    updateArchProjetoSchema: stubSchema,
    insertArchAmbienteSchema: stubSchema,
    updateArchAmbienteSchema: stubSchema,
    insertArchOrcamentoItemSchema: stubSchema,
    updateArchOrcamentoItemSchema: stubSchema,
    insertArchCatalogoSchema: stubSchema,
    updateArchCatalogoSchema: stubSchema,
    insertArchMaterialSchema: stubSchema,
    updateArchMaterialSchema: stubSchema,
    insertArchCatalogProductMaterialSchema: stubSchema,
    insertArchCenaSchema: stubSchema,
    updateArchCenaSchema: stubSchema,
    insertArchRenderSolicitacaoSchema: stubSchema,
    insertRenderSurfaceSchema: stubSchema,
    updateRenderSurfaceSchema: stubSchema,
    insertRenderSurfaceMaterialSchema: stubSchema,
  };
});

// ─── External service stubs ───────────────────────────────────────────────────

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
  callGoogleVertexImage: vi.fn(),
  callReplicateFlux: vi.fn(),
  callOpenAI: vi.fn(),
}));

// ─── App under test ───────────────────────────────────────────────────────────

import express from "express";
import { authenticate } from "../middlewares/auth.js";
import archRouter from "../routes/arch.js";

const app = express();
app.use(express.json());
app.use("/api", authenticate, archRouter);

const { setupListSelectReturning, setupInsertReturning } = createDbHelpers({
  mockDbSelect,
  mockDbUpdate,
  mockDbDelete,
  mockDbInsert,
});

// ─── Shared fixture ───────────────────────────────────────────────────────────

const VARIATION_ID = "var-a1";

const variationA: MockRow = {
  id: VARIATION_ID,
  tenantId: TENANT_A,
  userId: `user-${TENANT_A}`,
  name: "My variation",
  translator: "midjourney",
  detail: "medium",
  prompt: "Elegant interior with warm lighting",
  negativePrompt: "",
  estimatedTokens: 60,
  notes: null,
  savedAt: new Date().toISOString(),
};

// ─── GET /arch/prompt-variations ─────────────────────────────────────────────

describe("GET /api/arch/prompt-variations — list all for tenant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupListSelectReturning([variationA]);
  });

  it("returns 200 with the tenant's variations array", async () => {
    const res = await request(app)
      .get("/api/arch/prompt-variations")
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].id).toBe(VARIATION_ID);
  });

  it("returns an empty array when the tenant has no saved variations", async () => {
    setupListSelectReturning([]);

    const res = await request(app)
      .get("/api/arch/prompt-variations")
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("returns 401 without an auth token", async () => {
    const res = await request(app).get("/api/arch/prompt-variations");
    expect(res.status).toBe(401);
  });
});

// ─── POST /arch/prompt-variations ────────────────────────────────────────────

const validPayload = {
  name: "Studio lighting draft",
  translator: "midjourney",
  detail: "high",
  prompt: "Photorealistic kitchen interior",
  negativePrompt: "low quality, blurry",
  estimatedTokens: 90,
};

describe("POST /api/arch/prompt-variations — create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupInsertReturning([{ ...variationA, ...validPayload }]);
  });

  it("returns 201 with the created variation body", async () => {
    const res = await request(app)
      .post("/api/arch/prompt-variations")
      .set("Authorization", `Bearer ${tokenA}`)
      .send(validPayload);

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Studio lighting draft");
    expect(res.body.prompt).toBe("Photorealistic kitchen interior");
  });

  it("returns 401 without an auth token", async () => {
    const res = await request(app)
      .post("/api/arch/prompt-variations")
      .send(validPayload);

    expect(res.status).toBe(401);
  });
});

// ─── PATCH /arch/prompt-variations/:id ───────────────────────────────────────
//
// The first-registered PATCH handler in arch.ts applies a WHERE clause that
// includes BOTH tenantId AND userId.  A cross-tenant caller's userId won't
// match, so the UPDATE affects 0 rows and 404 is returned — access is still
// blocked, just without an explicit 403.

describe("PATCH /api/arch/prompt-variations/:id — rename / update notes", () => {
  function setupUpdateMock(rows: MockRow[]) {
    const returning = vi.fn().mockResolvedValue(rows);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    mockDbUpdate.mockReturnValue({ set });
  }

  beforeEach(() => vi.clearAllMocks());

  it("returns 200 with the updated variation when the owner renames it", async () => {
    setupUpdateMock([{ ...variationA, name: "Renamed" }]);

    const res = await request(app)
      .patch(`/api/arch/prompt-variations/${VARIATION_ID}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ name: "Renamed" });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Renamed");
  });

  it("returns 404 when the variation does not exist", async () => {
    setupUpdateMock([]);

    const res = await request(app)
      .patch(`/api/arch/prompt-variations/does-not-exist`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ name: "Ghost" });

    expect(res.status).toBe(404);
  });

  it("blocks cross-tenant access — tenant B cannot rename tenant A's variation", async () => {
    // WHERE includes userId; tenant B's sub won't match tenant A's record →
    // update returns 0 rows → 404 (access still denied)
    setupUpdateMock([]);

    const res = await request(app)
      .patch(`/api/arch/prompt-variations/${VARIATION_ID}`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ name: "Stolen rename" });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("returns 401 without an auth token", async () => {
    const res = await request(app)
      .patch(`/api/arch/prompt-variations/${VARIATION_ID}`)
      .send({ name: "No auth" });

    expect(res.status).toBe(401);
  });
});

// ─── DELETE /arch/prompt-variations/:id ──────────────────────────────────────
//
// The first-registered DELETE handler uses .returning() rather than a prior
// SELECT.  It returns { ok: true } with 200 on success, 404 when no row
// matched (record missing or cross-tenant).

describe("DELETE /api/arch/prompt-variations/:id — remove", () => {
  function setupDeleteMock(returnedRows: Array<{ id: string }>) {
    const returning = vi.fn().mockResolvedValue(returnedRows);
    const where = vi.fn().mockReturnValue({ returning });
    mockDbDelete.mockReturnValue({ where });
  }

  beforeEach(() => vi.clearAllMocks());

  it("returns 200 and { ok: true } when the owner deletes their variation", async () => {
    setupDeleteMock([{ id: VARIATION_ID }]);

    const res = await request(app)
      .delete(`/api/arch/prompt-variations/${VARIATION_ID}`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true });
  });

  it("returns 404 when the variation does not exist", async () => {
    setupDeleteMock([]);

    const res = await request(app)
      .delete(`/api/arch/prompt-variations/does-not-exist`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
  });

  it("blocks cross-tenant access — tenant B cannot delete tenant A's variation", async () => {
    // WHERE includes userId; cross-tenant yields no match → 404
    setupDeleteMock([]);

    const res = await request(app)
      .delete(`/api/arch/prompt-variations/${VARIATION_ID}`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(404);
  });

  it("returns 401 without an auth token", async () => {
    const res = await request(app)
      .delete(`/api/arch/prompt-variations/${VARIATION_ID}`);

    expect(res.status).toBe(401);
  });
});
