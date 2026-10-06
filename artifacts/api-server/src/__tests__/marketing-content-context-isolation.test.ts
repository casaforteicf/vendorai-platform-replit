import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import express from "express";

const mocks = vi.hoisted(() => {
  const tables = {
    contentGenerationsTable: { name: "contentGenerationsTable" },
    contentStudioUploadsTable: { name: "contentStudioUploadsTable" },
    contentLibraryTable: { name: "contentLibraryTable" },
    agentConfigsTable: { name: "agentConfigsTable" },
    businessProfilesTable: { name: "businessProfilesTable" },
    produtosCatalogoTable: { name: "produtosCatalogoTable" },
    varejoProdutoTable: { name: "varejoProdutoTable" },
    supermercadoProdutoTable: { name: "supermercadoProdutoTable" },
    insumosTable: { name: "insumosTable" },
    subscriptionsTable: { name: "subscriptionsTable" },
    tenantsTable: { name: "tenantsTable" },
    mediaPlansTable: { name: "mediaPlansTable" },
    contentCalendarItemsTable: { name: "contentCalendarItemsTable" },
  };

  return {
    tables,
    rows: new Map<string, any[]>(),
    inserted: [] as any[],
    generateFeedContent: vi.fn(),
    resolveContentContext: vi.fn(),
    buildOwnPerformancePromptBlock: vi.fn(),
    buildReferencePatternsPromptBlock: vi.fn(),
  };
});

vi.mock("drizzle-orm", () => ({
  and: vi.fn(() => ({})),
  eq: vi.fn(() => ({})),
  desc: vi.fn(() => ({})),
}));

vi.mock("@workspace/db", () => {
  const queryFor = (table: { name: string }) => {
    const result = () => mocks.rows.get(table.name) ?? [];
    const chain: any = {
      where: vi.fn(() => chain),
      orderBy: vi.fn(() => chain),
      limit: vi.fn(async () => result()),
      then: (resolve: any, reject: any) => Promise.resolve(result()).then(resolve, reject),
    };
    return chain;
  };

  const db = {
    select: vi.fn(() => ({
      from: vi.fn((table: { name: string }) => queryFor(table)),
    })),
    insert: vi.fn((table: { name: string }) => ({
      values: vi.fn((value: any) => ({
        returning: vi.fn(async () => {
          const row = { id: "generation-1", ...value };
          mocks.inserted.push({ table: table.name, value: row });
          return [row];
        }),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(async () => []),
      })),
    })),
  };

  return { db, ...mocks.tables };
});

vi.mock("../lib/content-generation.js", () => ({
  generateFeedContent: mocks.generateFeedContent,
  generateStoriesContent: vi.fn(),
  generateReelsScript: vi.fn(),
  generateLinkedInContent: vi.fn(),
  generateYouTubeScript: vi.fn(),
  generateImagesForContent: vi.fn(),
  generateImagesWithReference: vi.fn(),
  generateContentStrategy: vi.fn(),
  describeImage: vi.fn(),
  improveVariationText: vi.fn(),
}));

vi.mock("../lib/instagram-publish.js", () => ({
  InstagramApiError: class InstagramApiError extends Error {},
  listRecentMedia: vi.fn(),
}));

vi.mock("../services/content-reference-creators.js", () => ({
  buildReferencePatternsPromptBlock: mocks.buildReferencePatternsPromptBlock,
}));

vi.mock("../services/content-performance.js", () => ({
  buildOwnPerformancePromptBlock: mocks.buildOwnPerformancePromptBlock,
}));

vi.mock("../services/contentContextLibrary.js", () => ({
  resolveContentContext: mocks.resolveContentContext,
}));

vi.mock("../services/contentSocialPublisher.js", () => ({
  publishContentGenerationToInstagram: vi.fn(),
  getPublishingCredentials: vi.fn(),
  SocialPublicationError: class SocialPublicationError extends Error {},
}));

vi.mock("../services/brandFrame.js", () => ({
  applyBrandFrame: vi.fn(),
  generateHighlightCover: vi.fn(),
}));

vi.mock("../lib/objectStorage.js", () => ({
  ObjectStorageService: class ObjectStorageService {},
}));

vi.mock("../services/instagram-cover.js", () => ({
  normalizeInstagramCoverSource: vi.fn(),
  renderInstagramProfileCover: vi.fn(),
}));

import contentRouter from "../routes/content.js";

const TENANT_A = "tenant-a";
const TENANT_B = "tenant-b";
const PLAN_ID = "plan-a";
const CAMPAIGN_ID = "campaign-a";
const ITEM_ID = "calendar-a";

function baseCampaign() {
  return {
    id: CAMPAIGN_ID,
    nome: "Casas ICF",
    objetivo: "Gerar leads qualificados",
    produtoServico: "Construção de casas em ICF",
    publico: "Famílias construindo residência",
    oferta: "Solicitar diagnóstico",
    mensagemCentral: "Construção eficiente e de alto desempenho",
  };
}

function setValidRows() {
  mocks.rows.set("mediaPlansTable", [{
    id: PLAN_ID,
    tenantId: TENANT_A,
    conteudo: { campanhas: [baseCampaign()] },
  }]);
  mocks.rows.set("contentCalendarItemsTable", [{
    id: ITEM_ID,
    tenantId: TENANT_A,
    mediaPlanId: PLAN_ID,
    pilar: "Casas ICF · Educação",
  }]);
  mocks.rows.set("agentConfigsTable", [{
    id: "agent-config-1",
    tenantId: TENANT_A,
    contentGenerationsThisMonth: 0,
    contentGenerationsResetAt: new Date(),
  }]);
  mocks.rows.set("subscriptionsTable", [{ plano: "growth" }]);
  mocks.rows.set("businessProfilesTable", [{ tenantId: TENANT_A, nomeFantasia: "Casa Forte" }]);
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { tenantId: TENANT_A, platformRole: "tenant_admin" };
    (req as any).log = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };
    next();
  });
  app.use("/api", contentRouter);
  return app;
}

function postGeneration(app: express.Express, headers: Record<string, string>) {
  let req = request(app)
    .post(`/api/tenants/${TENANT_A}/content/generate`)
    .send({
      type: "feed",
      theme: "Campanha de construção ICF",
      variations: 1,
      imageCount: 1,
    });
  for (const [key, value] of Object.entries(headers)) req = req.set(key, value);
  return req;
}

const validHeaders = {
  "x-vendorai-media-plan-id": PLAN_ID,
  "x-vendorai-campaign-id": CAMPAIGN_ID,
  "x-vendorai-calendar-item-id": ITEM_ID,
};

describe("marketing content generation context isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rows.clear();
    mocks.inserted.length = 0;
    setValidRows();
    mocks.generateFeedContent.mockResolvedValue({
      result: { variations: [{ caption: "ICF", hashtags: [] }] },
      tokensUsed: 10,
    });
    mocks.resolveContentContext.mockResolvedValue({ promptBlock: "broad", sources: [{ id: "foreign" }] });
    mocks.buildOwnPerformancePromptBlock.mockResolvedValue("performance");
    mocks.buildReferencePatternsPromptBlock.mockResolvedValue("references");
  });

  it("rejects incomplete media-plan context before any AI call", async () => {
    const res = await postGeneration(buildApp(), {
      "x-vendorai-media-plan-id": PLAN_ID,
      "x-vendorai-campaign-id": CAMPAIGN_ID,
    });

    expect(res.status).toBe(422);
    expect(res.body.error).toContain("incompleto");
    expect(mocks.generateFeedContent).not.toHaveBeenCalled();
  });

  it("rejects a media plan returned for another tenant", async () => {
    mocks.rows.set("mediaPlansTable", [{
      id: PLAN_ID,
      tenantId: TENANT_B,
      conteudo: { campanhas: [baseCampaign()] },
    }]);

    const res = await postGeneration(buildApp(), validHeaders);

    expect(res.status).toBe(422);
    expect(res.body.error).toContain("não pertence ao tenant");
    expect(mocks.generateFeedContent).not.toHaveBeenCalled();
  });

  it("rejects a campaign that is not in the validated media plan", async () => {
    mocks.rows.set("mediaPlansTable", [{
      id: PLAN_ID,
      tenantId: TENANT_A,
      conteudo: { campanhas: [{ ...baseCampaign(), id: "campaign-other" }] },
    }]);

    const res = await postGeneration(buildApp(), validHeaders);

    expect(res.status).toBe(422);
    expect(res.body.error).toContain("Campanha não pertence");
    expect(mocks.generateFeedContent).not.toHaveBeenCalled();
  });

  it("rejects a campaign that does not match the calendar item", async () => {
    mocks.rows.set("contentCalendarItemsTable", [{
      id: ITEM_ID,
      tenantId: TENANT_A,
      mediaPlanId: PLAN_ID,
      pilar: "Piscinas · Oferta",
    }]);

    const res = await postGeneration(buildApp(), validHeaders);

    expect(res.status).toBe(422);
    expect(res.body.error).toContain("não corresponde");
    expect(mocks.generateFeedContent).not.toHaveBeenCalled();
  });

  it("uses only validated media-plan sources and persists contextAudit", async () => {
    const res = await postGeneration(buildApp(), validHeaders);

    expect(res.status).toBe(200);
    expect(mocks.generateFeedContent).toHaveBeenCalledTimes(1);
    expect(mocks.resolveContentContext).not.toHaveBeenCalled();
    expect(mocks.buildOwnPerformancePromptBlock).not.toHaveBeenCalled();
    expect(mocks.buildReferencePatternsPromptBlock).not.toHaveBeenCalled();

    expect(res.body.result.contextAudit).toMatchObject({
      source: "validated-media-plan",
      tenantId: TENANT_A,
      mediaPlanId: PLAN_ID,
      campaignId: CAMPAIGN_ID,
      calendarItemId: ITEM_ID,
      campaignName: "Casas ICF",
      productName: "Construção de casas em ICF",
    });
    expect(res.body.result.contextAudit.allowedSources).toEqual([
      "business_profile",
      "validated_media_plan_campaign",
    ]);
  });
});
