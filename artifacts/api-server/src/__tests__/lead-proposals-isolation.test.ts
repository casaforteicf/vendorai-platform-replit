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
import { MockRow } from "./helpers/isolation.js";

const { mockDbSelect, mockDbInsert, mockDbDelete, mockDbUpdate } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
  mockDbDelete: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
  mockDbUpdate: vi.fn(() => ({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) })),
}));

const mockCallProposalAI = vi.hoisted(() => vi.fn());
const mockGenerateProposalPDF = vi.hoisted(() => vi.fn());

vi.mock("@workspace/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@workspace/db")>()),
  db: {
    select: mockDbSelect,
    insert: mockDbInsert,
    delete: mockDbDelete,
    update: mockDbUpdate,
  },
  leadsTable: {
    id: "id",
    tenantId: "tenantId",
    nome: "nome",
    empresa: "empresa",
    objetivo: "objetivo",
    mercadoSegmento: "mercadoSegmento",
    logoUrl: "logoUrl",
    corDestaque: "corDestaque",
    corSecundaria: "corSecundaria",
  },
  leadBriefingsTable: { id: "id", tenantId: "tenantId", leadId: "leadId" },
  leadProposalsTable: {
    id: "id",
    tenantId: "tenantId",
    leadId: "leadId",
    version: "version",
    htmlContent: "htmlContent",
    jsonContent: "jsonContent",
    status: "status",
    createdAt: "createdAt",
  },
  leadProductsTable: {
    id: "id",
    tenantId: "tenantId",
    leadId: "leadId",
    nome: "nome",
    imagemUrl: "imagemUrl",
    createdAt: "createdAt",
  },
  propostasTable: { id: "id", tenantId: "tenantId", leadId: "leadId" },
  conversationsTable: { id: "id", tenantId: "tenantId", leadId: "leadId" },
  messagesTable: { id: "id", tenantId: "tenantId", leadId: "leadId" },
  customerIntelligenceTable: { id: "id", tenantId: "tenantId", leadId: "leadId" },
  businessProfilesTable: { id: "id", tenantId: "tenantId" },
  dealsTable: { id: "id", tenantId: "tenantId", leadId: "leadId", etapa: "etapa" },
  tenantsTable: { id: "id", tenantId: "tenantId", proposalStyleMemory: "proposalStyleMemory" },
}));

vi.mock("../lib/proposal-engine.js", () => ({
  buildProposalPrompt: vi.fn(() => "mock-prompt"),
  callProposalAI: mockCallProposalAI,
  renderProposalHtml: vi.fn(() => "<html>mock</html>"),
  generateTheme: vi.fn(() => ({ accent: "#A78BFA" })),
  AI_PROVIDER: "anthropic",
  generateProposalPDF: mockGenerateProposalPDF,
  learnFromProposalEdit: vi.fn().mockResolvedValue({}),
}));

import express from "express";
import { authenticate } from "../middlewares/auth.js";
import leadProposalsRouter from "../routes/lead_proposals.js";

const app = express();
app.use(express.json());
// Add req.log mock for routes that use it
app.use("/api", authenticate, (req, _res, next) => {
  (req as any).log = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    child: vi.fn(() => (req as any).log),
  };
  next();
}, leadProposalsRouter);


// ── Drizzle select chain builder (thenable, supports .where().orderBy().limit())
function createSelectChain(rows: MockRow[]) {
  const chain: any = {};
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockResolvedValue(rows);
  // Make chain itself awaitable
  chain.then = (resolve: any) => resolve(rows);
  return chain;
}

// ── Drizzle insert chain builder
function createInsertChain(rows: MockRow[]) {
  const chain: any = {};
  chain.values = vi.fn().mockReturnValue(chain);
  chain.onConflictDoNothing = vi.fn().mockReturnValue(chain);
  chain.returning = vi.fn().mockResolvedValue(rows);
  chain.then = (resolve: any) => resolve(undefined);
  return chain;
}

function setupSelectReturning(rows: MockRow[]) {
  mockDbSelect.mockReturnValue(createSelectChain(rows));
}

function setupSelectReturningLead(lead: MockRow) {
  const chains = [
    createSelectChain([lead]),          // 1. lead
    createSelectChain([]),                // 2. briefing
    createSelectChain([]),                // 3. products
    createSelectChain([]),                // 4. propostas
    createSelectChain([]),                // 5. conversations
    createSelectChain([]),                // 6. intelligence
    createSelectChain([]),                // 7. business profile
  ];
  let callCount = 0;
  mockDbSelect.mockImplementation(() => {
    callCount++;
    return chains[Math.min(callCount - 1, chains.length - 1)];
  });
}

function setupInsertReturning(rows: MockRow[]) {
  mockDbInsert.mockReturnValue(createInsertChain(rows));
}

const LEAD_ID = "lead-proposal-test";
const leadOwnedByTenantB: MockRow = {
  id: LEAD_ID,
  tenantId: TENANT_B,
  nome: "Acme Corp",
  empresa: "Acme Inc",
  objetivo: "Crescer vendas",
  mercadoSegmento: "varejo",
  logoUrl: "https://example.com/logo.png",
  corDestaque: "#A78BFA",
  corSecundaria: "#C4B5FD",
};

// ───────────────────────────────────────────────────────────────
// Products CRUD
// ───────────────────────────────────────────────────────────────
describe("GET /api/leads/:leadId/products — cross-tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSelectReturning([leadOwnedByTenantB]);
  });

  it("returns 404 (not found) when tenant A lists products of lead owned by tenant B", async () => {
    const res = await request(app)
      .get(`/api/leads/${LEAD_ID}/products`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status, JSON.stringify(res.body)).toBe(404);
    expect(res.body).toMatchObject({ error: expect.stringContaining("Not found") });
  });

  it("returns 200 when tenant B lists its own products", async () => {
    const res = await request(app)
      .get(`/api/leads/${LEAD_ID}/products`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
  });
});

describe("POST /api/leads/:leadId/products — cross-tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSelectReturning([leadOwnedByTenantB]);
    setupInsertReturning([{ id: "prod-1", tenantId: TENANT_B, leadId: LEAD_ID, nome: "Widget", imagemUrl: null, createdAt: "2026-06-20T00:00:00Z" }]);
  });

  it("returns 404 (not found) when tenant A adds product to lead owned by tenant B", async () => {
    const res = await request(app)
      .post(`/api/leads/${LEAD_ID}/products`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ nome: "Widget" });

    expect(res.status, JSON.stringify(res.body)).toBe(404);
    expect(res.body).toMatchObject({ error: expect.stringContaining("Not found") });
  });

  it("returns 201 when tenant B adds product to its own lead", async () => {
    const res = await request(app)
      .post(`/api/leads/${LEAD_ID}/products`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ nome: "Widget", imagemUrl: "https://img.com/w.jpg" });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.nome).toBe("Widget");
  });

  it("returns 400 when nome is missing", async () => {
    const res = await request(app)
      .post(`/api/leads/${LEAD_ID}/products`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({});

    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(res.body.error).toContain("nome");
  });
});

describe("DELETE /api/leads/:leadId/products/:productId — cross-tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSelectReturning([leadOwnedByTenantB]);
  });

  it("returns 404 (not found) when tenant A deletes product from lead owned by tenant B", async () => {
    const res = await request(app)
      .delete(`/api/leads/${LEAD_ID}/products/prod-1`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status, JSON.stringify(res.body)).toBe(404);
    expect(res.body).toMatchObject({ error: expect.stringContaining("Not found") });
  });

  it("returns 204 when tenant B deletes product from its own lead", async () => {
    const res = await request(app)
      .delete(`/api/leads/${LEAD_ID}/products/prod-1`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status, JSON.stringify(res.body)).toBe(204);
  });
});

// ───────────────────────────────────────────────────────────────
// Proposals generation
// ───────────────────────────────────────────────────────────────
describe("POST /api/leads/:leadId/proposals — cross-tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCallProposalAI.mockResolvedValue({
      content: JSON.stringify({
        title: "Proposta",
        greeting: "Olá",
        situation: "Situação",
        problem: "Problema",
        implication: "Implicação",
        needPayoff: "Solução",
        productBlocks: [{ title: "Produto", description: "Desc", price: "R$ 100" }],
        riskReverse: "Garantia",
        cta: "Aprove",
        signature: "Assinado",
      }),
      provider: "anthropic",
      model: "claude-sonnet-4-6",
    });
    mockGenerateProposalPDF.mockResolvedValue(Buffer.from("%PDF1.4"));
  });

  it("returns 404 when tenant A generates proposal for lead owned by tenant B", async () => {
    setupSelectReturning([leadOwnedByTenantB]);
    const res = await request(app)
      .post(`/api/leads/${LEAD_ID}/proposals`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ segmento: "varejo" });

    expect(res.status, JSON.stringify(res.body)).toBe(404);
    expect(res.body).toMatchObject({ error: expect.stringContaining("not found") });
  });

  it("returns 201 when tenant B generates proposal for its own lead", async () => {
    setupSelectReturningLead(leadOwnedByTenantB);
    setupInsertReturning([{ id: "prop-1", tenantId: TENANT_B, leadId: LEAD_ID, version: 1, htmlContent: "<html>mock</html>", status: "ready", createdAt: "2026-06-20T00:00:00Z" }]);

    const res = await request(app)
      .post(`/api/leads/${LEAD_ID}/proposals`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ segmento: "varejo", logoUrl: "https://logo.com/img.png", corDestaque: "#A78BFA", corSecundaria: "#C4B5FD" });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.version).toBe(1);
    expect(res.body._provider).toBe("anthropic");
  });

  it("returns 404 when lead does not exist", async () => {
    setupSelectReturning([]);
    const res = await request(app)
      .post(`/api/leads/nonexistent/proposals`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ segmento: "varejo" });

    expect(res.status, JSON.stringify(res.body)).toBe(404);
  });

  it("returns 502 when AI returns invalid JSON", async () => {
    mockCallProposalAI.mockResolvedValue({
      content: "not-json",
      provider: "anthropic",
      model: "claude-sonnet-4-6",
    });
    setupSelectReturningLead(leadOwnedByTenantB);

    const res = await request(app)
      .post(`/api/leads/${LEAD_ID}/proposals`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({});

    expect(res.status, JSON.stringify(res.body)).toBe(502);
    expect(res.body.error).toContain("JSON");
  });
});

// ───────────────────────────────────────────────────────────────
// Proposals list
// ───────────────────────────────────────────────────────────────
describe("GET /api/leads/:leadId/proposals — cross-tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSelectReturning([leadOwnedByTenantB]);
  });

  it("returns 403 when tenant A lists proposals for lead owned by tenant B", async () => {
    const res = await request(app)
      .get(`/api/leads/${LEAD_ID}/proposals`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(res.body).toMatchObject({ error: expect.stringContaining("Access denied") });
  });

  it("returns 200 when tenant B lists its own proposals", async () => {
    const res = await request(app)
      .get(`/api/leads/${LEAD_ID}/proposals`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
  });
});

// ───────────────────────────────────────────────────────────────
// Proposal download
// ───────────────────────────────────────────────────────────────
describe("GET /api/leads/:leadId/proposals/:version/download — cross-tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 when tenant A downloads proposal for lead owned by tenant B", async () => {
    setupSelectReturning([leadOwnedByTenantB]);
    const res = await request(app)
      .get(`/api/leads/${LEAD_ID}/proposals/1/download`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(res.body).toMatchObject({ error: expect.stringContaining("Access denied") });
  });

  it("returns 200 when tenant B downloads its own proposal", async () => {
    const proposal = { id: "prop-1", tenantId: TENANT_B, leadId: LEAD_ID, version: 1, htmlContent: "<h1>Proposta</h1>", status: "ready" };
    let callCount = 0;
    mockDbSelect.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return createSelectChain([leadOwnedByTenantB]);
      return createSelectChain([proposal]);
    });

    const res = await request(app)
      .get(`/api/leads/${LEAD_ID}/proposals/1/download`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.text).toBe("<h1>Proposta</h1>");
    expect(res.headers["content-type"]).toContain("text/html");
  });
});

// ───────────────────────────────────────────────────────────────
// Proposal PDF
// ───────────────────────────────────────────────────────────────
describe("GET /api/leads/:leadId/proposals/:version/pdf — cross-tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateProposalPDF.mockResolvedValue(Buffer.from("%PDF1.4 fake pdf"));
  });

  it("returns 403 when tenant A downloads PDF for lead owned by tenant B", async () => {
    setupSelectReturning([leadOwnedByTenantB]);
    const res = await request(app)
      .get(`/api/leads/${LEAD_ID}/proposals/1/pdf`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(res.body).toMatchObject({ error: expect.stringContaining("Access denied") });
  });

  it("returns 200 with application/pdf when tenant B downloads its own proposal PDF", async () => {
    const proposal = { id: "prop-1", tenantId: TENANT_B, leadId: LEAD_ID, version: 1, htmlContent: "<h1>Proposta</h1>", status: "ready" };
    let callCount = 0;
    mockDbSelect.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return createSelectChain([leadOwnedByTenantB]);
      return createSelectChain([proposal]);
    });

    const res = await request(app)
      .get(`/api/leads/${LEAD_ID}/proposals/1/pdf`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
  });

  it("returns text/html fallback when puppeteer fails", async () => {
    mockGenerateProposalPDF.mockResolvedValue(Buffer.from("<html>fallback</html>", "utf-8"));
    const proposal = { id: "prop-1", tenantId: TENANT_B, leadId: LEAD_ID, version: 1, htmlContent: "<h1>Proposta</h1>", status: "ready" };
    let callCount = 0;
    mockDbSelect.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return createSelectChain([leadOwnedByTenantB]);
      return createSelectChain([proposal]);
    });

    const res = await request(app)
      .get(`/api/leads/${LEAD_ID}/proposals/1/pdf`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
  });
});

// ───────────────────────────────────────────────────────────────
// Unauthenticated
// ───────────────────────────────────────────────────────────────
describe("Unauthenticated access — lead proposals", () => {
  it("returns 401 for GET products without token", async () => {
    const res = await request(app).get(`/api/leads/${LEAD_ID}/products`);
    expect(res.status, JSON.stringify(res.body)).toBe(401);
  });

  it("returns 401 for POST products without token", async () => {
    const res = await request(app).post(`/api/leads/${LEAD_ID}/products`).send({ nome: "X" });
    expect(res.status, JSON.stringify(res.body)).toBe(401);
  });

  it("returns 401 for DELETE product without token", async () => {
    const res = await request(app).delete(`/api/leads/${LEAD_ID}/products/p1`);
    expect(res.status, JSON.stringify(res.body)).toBe(401);
  });

  it("returns 401 for GET proposals without token", async () => {
    const res = await request(app).get(`/api/leads/${LEAD_ID}/proposals`);
    expect(res.status, JSON.stringify(res.body)).toBe(401);
  });

  it("returns 401 for POST proposals without token", async () => {
    const res = await request(app).post(`/api/leads/${LEAD_ID}/proposals`).send({});
    expect(res.status, JSON.stringify(res.body)).toBe(401);
  });

  it("returns 401 for GET proposal download without token", async () => {
    const res = await request(app).get(`/api/leads/${LEAD_ID}/proposals/1/download`);
    expect(res.status, JSON.stringify(res.body)).toBe(401);
  });

  it("returns 401 for GET proposal PDF without token", async () => {
    const res = await request(app).get(`/api/leads/${LEAD_ID}/proposals/1/pdf`);
    expect(res.status, JSON.stringify(res.body)).toBe(401);
  });
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
});
