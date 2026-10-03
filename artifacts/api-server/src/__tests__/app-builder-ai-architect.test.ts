import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { tokenSuperAdmin } from "./helpers/auth.js";

const mockSelect = vi.hoisted(() => vi.fn());
const mockExecute = vi.hoisted(() => vi.fn());
const mockCallOpenAI = vi.hoisted(() => vi.fn());

vi.mock("@workspace/db", () => ({
  db: { select: mockSelect, execute: mockExecute },
  appActionRegistryTable: { key: "key", name: "name", category: "category", riskLevel: "riskLevel", requiredPermissions: "requiredPermissions", status: "status" },
  appAiPoliciesTable: { key: "key", name: "name", riskLevel: "riskLevel", rules: "rules", status: "status", verticalId: "verticalId" },
  appComponentRegistryTable: { key: "key", name: "name", category: "category", status: "status" },
  appDataSourceRegistryTable: { key: "key", name: "name", category: "category", status: "status" },
  appFeatureRegistryTable: { key: "key", name: "name", category: "category", status: "status" },
  appInstancesTable: { id: "id" },
  appTemplateVersionsTable: { id: "id", templateId: "templateId", status: "status", definition: "definition", version: "version" },
  appTemplatesTable: { id: "id", name: "name", slug: "slug", description: "description", verticalId: "verticalId" },
  appVerticalsTable: { id: "id", key: "key", name: "name" },
  appWorkflowRegistryTable: { key: "key", name: "name", status: "status" },
  tenantsTable: { id: "id", name: "name", vertical: "vertical", status: "status" },
}));

vi.mock("../lib/ai-gateway.js", () => ({ callOpenAI: mockCallOpenAI }));

import { authenticate } from "../middlewares/auth.js";
import appBuilderStandaloneRouter from "../routes/admin_app_builder_standalone.js";

function chain(rows: unknown[]) {
  const value: any = {};
  value.from = vi.fn().mockReturnValue(value);
  value.where = vi.fn().mockReturnValue(value);
  value.orderBy = vi.fn().mockReturnValue(value);
  value.limit = vi.fn().mockResolvedValue(rows);
  value.then = (resolve: (rows: unknown[]) => unknown) => resolve(rows);
  return value;
}

function validProposal(actionKey = "lead.create") {
  return {
    summary: "App operacional completo para o cenário de teste.",
    assumptions: [],
    questions: [],
    warnings: [],
    architecture: {
      pages: [{ id: "dashboard", title: "Dashboard", purpose: "Visão executiva" }],
      roles: [{ key: "admin", name: "Administrador", purpose: "Gestão" }],
      dataModel: [{ entity: "Lead", purpose: "Oportunidades", source: "registry" }],
      integrations: [],
      risks: [],
    },
    definition: {
      runtime: {
        version: 1,
        defaultPageId: "dashboard",
        pages: [{
          id: "dashboard",
          title: "Dashboard",
          blocks: [{ id: "form-1", type: "action_form", props: { actionKey } }],
        }],
      },
    },
    gaps: [],
    recommendedActions: [],
    quality: { completeness: 92, ux: 90, security: 88, data: 90, integration: 84 },
  };
}

function prepareDb() {
  const responses = [
    [{ id: "tpl-1", name: "Template Produção", slug: "producao", description: null, verticalId: "vert-1" }],
    [{ id: "vert-1", key: "industria", name: "Indústria" }],
    [{ definition: { runtime: { version: 1, defaultPageId: "old", pages: [{ id: "old", title: "Antiga", blocks: [] }] } } }],
    [{ key: "hero", name: "Hero", category: "layout" }],
    [{ key: "crm", name: "CRM", category: "comercial" }],
    [{ key: "lead.create", name: "Criar lead", category: "crm", riskLevel: "low", requiredPermissions: [] }],
    [{ key: "leads.list", name: "Lista de leads", category: "crm" }],
    [{ key: "followup", name: "Follow-up" }],
    [{ key: "safe-default", name: "Política padrão", riskLevel: "medium", rules: {} }],
  ];
  let index = 0;
  mockSelect.mockImplementation(() => chain(responses[Math.min(index++, responses.length - 1)]));
}

const app = express();
app.use(express.json());
app.use("/api", authenticate, appBuilderStandaloneRouter);

describe("Arquiteto IA do App Builder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prepareDb();
  });

  it("usa duas passagens no modo profundo e devolve a revisão final validada", async () => {
    mockCallOpenAI
      .mockResolvedValueOnce({ content: JSON.stringify(validProposal()), inputTokens: 1000, outputTokens: 500, costUsd: 0.02 })
      .mockResolvedValueOnce({ content: JSON.stringify({ ...validProposal(), summary: "Revisão crítica final aprovada." }), inputTokens: 1200, outputTokens: 600, costUsd: 0.03 });

    const response = await request(app)
      .post("/api/admin/app-builder/ai/architect")
      .set("Authorization", `Bearer ${tokenSuperAdmin}`)
      .send({
        mode: "generate",
        depth: "deep",
        templateId: "tpl-1",
        appContext: { id: "pre-1", name: "App Metalúrgica", ownerType: "prospect", ownerCompany: "Metal Forte" },
        request: "Crie um app completo para orçamentos técnicos, produção e acompanhamento de pedidos de uma metalúrgica.",
      });

    expect(response.status).toBe(200);
    expect(mockCallOpenAI).toHaveBeenCalledTimes(2);
    expect(response.body.usage.passes).toBe(2);
    expect(response.body.validation.ok).toBe(true);
    expect(response.body.proposal.summary).toBe("Revisão crítica final aprovada.");
  });

  it("bloqueia como inválida uma arquitetura que inventa Action fora do registry", async () => {
    mockCallOpenAI.mockResolvedValue({
      content: JSON.stringify(validProposal("production.teleport")),
      inputTokens: 900,
      outputTokens: 450,
      costUsd: 0.01,
    });

    const response = await request(app)
      .post("/api/admin/app-builder/ai/architect")
      .set("Authorization", `Bearer ${tokenSuperAdmin}`)
      .send({
        mode: "generate",
        depth: "fast",
        templateId: "tpl-1",
        appContext: { id: "internal-1", name: "Projeto interno", ownerType: "internal" },
        request: "Monte um app interno para testar operações e automações antes de vincular um tenant.",
      });

    expect(response.status).toBe(200);
    expect(mockCallOpenAI).toHaveBeenCalledTimes(1);
    expect(response.body.validation.ok).toBe(false);
    expect(response.body.validation.findings.join(" ")).toContain("production.teleport");
    expect(response.body.proposal.warnings.join(" ")).toContain("Validador");
  });

  it("mantém o modo rápido em uma passagem para iterações sem reduzir a validação determinística", async () => {
    mockCallOpenAI.mockResolvedValue({
      content: JSON.stringify(validProposal()),
      inputTokens: 700,
      outputTokens: 350,
      costUsd: 0.008,
    });

    const response = await request(app)
      .post("/api/admin/app-builder/ai/architect")
      .set("Authorization", `Bearer ${tokenSuperAdmin}`)
      .send({
        mode: "revise",
        depth: "fast",
        templateId: "tpl-1",
        appContext: { id: "tenant-app-1", tenantId: "tenant-real", name: "Portal Cliente", ownerType: "tenant" },
        request: "Revise o app mantendo as funções existentes e melhore a experiência mobile e as permissões por papel.",
      });

    expect(response.status).toBe(200);
    expect(mockCallOpenAI).toHaveBeenCalledTimes(1);
    expect(response.body.usage.passes).toBe(1);
    expect(response.body.validation.ok).toBe(true);
  });
});
