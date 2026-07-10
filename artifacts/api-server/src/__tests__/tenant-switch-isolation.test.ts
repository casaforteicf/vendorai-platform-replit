/**
 * BLOCO 14 Fase B — Testes de isolamento obrigatórios para troca de tenant.
 *
 * Cobre os 3 cenários mandatórios da especificação:
 *  1. Usuário legítimo troca entre lojas da sua organização → sucesso
 *  2. Tentativa de acesso a tenant de organização diferente → 403 (sempre)
 *  3. Usuário sem vínculo em usuarios_organizacao tenta trocar → 403 (sempre)
 *
 * Mais 2 casos de borda:
 *  4. Tenant de destino sem organizacaoId (não vinculado a nenhuma org) → 403
 *  5. Body sem targetTenantId → 422
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { TEST_SECRET, makeToken } from "./helpers/auth.js";

// ── Tenant / org fixtures ────────────────────────────────────────────────────
const USER_ID = "user-org-admin";
const CURRENT_TENANT = "tenant-loja-a";
const TARGET_TENANT_SAME_ORG = "tenant-loja-b";
const TARGET_TENANT_OTHER_ORG = "tenant-loja-c";
const ORG_A = "org-alpha";
const ORG_B = "org-beta";
const MEMBERSHIP_ID = "membership-1";

function makeOrgToken(tenantId: string): string {
  return jwt.sign(
    {
      sub: USER_ID,
      email: "admin@org.example.com",
      platformRole: "tenant_admin",
      tenantId,
      role: "admin",
      userFunction: "administrador",
    },
    TEST_SECRET,
    { expiresIn: "1h" }
  );
}

const tokenCurrentTenant = makeOrgToken(CURRENT_TENANT);
const tokenNoOrg = makeToken("unrelated-tenant");

// ── DB mock ──────────────────────────────────────────────────────────────────
const { mockDbSelect, mockDbInsert } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
}));

vi.mock("@workspace/db", () => ({
  db: {
    select: mockDbSelect,
    insert: mockDbInsert,
  },
  tenantsTable: {
    id: "id",
    name: "name",
    organizacaoId: "organizacaoId",
    status: "status",
    slug: "slug",
  },
  usuariosOrganizacaoTable: {
    id: "id",
    userId: "userId",
    organizacaoId: "organizacaoId",
  },
  tenantSwitchLogTable: {
    userId: "userId",
    fromTenantId: "fromTenantId",
    toTenantId: "toTenantId",
    organizacaoId: "organizacaoId",
    ipAddress: "ipAddress",
  },
}));

import express from "express";
import { authenticate } from "../middlewares/auth.js";
import tenantSwitchRouter from "../routes/tenant_switch.js";

const app = express();
app.use(express.json());
app.use("/api", authenticate, tenantSwitchRouter);

// ── Helper to set up sequential selects ─────────────────────────────────────
function setupSequentialSelects(
  ...rowArrays: Record<string, unknown>[][]
): void {
  rowArrays.forEach((rows) => {
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(rows),
    };
    mockDbSelect.mockReturnValueOnce(chain);
  });
}

function setupInsertSuccess(): void {
  const chain = {
    values: vi.fn().mockReturnValue({ catch: vi.fn() }),
  };
  mockDbInsert.mockReturnValue(chain);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/auth/switch-tenant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupInsertSuccess();
  });

  // ── Cenário 1 (obrigatório): troca legítima dentro da mesma organização ──
  it("cenário 1 — retorna 200 e novo token para membro legítimo trocando entre lojas da sua organização", async () => {
    setupSequentialSelects(
      // select targetTenant
      [{ id: TARGET_TENANT_SAME_ORG, name: "Loja B", organizacaoId: ORG_A, status: "active" }],
      // select currentTenant org
      [{ organizacaoId: ORG_A }],
      // select membership
      [{ id: MEMBERSHIP_ID }]
    );

    const res = await request(app)
      .post("/api/auth/switch-tenant")
      .set("Authorization", `Bearer ${tokenCurrentTenant}`)
      .send({ targetTenantId: TARGET_TENANT_SAME_ORG });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("token");
    expect(res.body.tenantId).toBe(TARGET_TENANT_SAME_ORG);

    // Verificar que o token emitido está escopado para o tenant de destino
    const decoded = jwt.verify(res.body.token, TEST_SECRET) as { tenantId: string; sub: string };
    expect(decoded.tenantId).toBe(TARGET_TENANT_SAME_ORG);
    expect(decoded.sub).toBe(USER_ID);
  });

  // ── Cenário 2 (obrigatório): tentativa cross-org via manipulação de request ──
  it("cenário 2 — retorna 403 quando tenant de destino pertence a organização diferente (mesmo via manipulação de request)", async () => {
    setupSequentialSelects(
      // select targetTenant — organização B (diferente da do usuário)
      [{ id: TARGET_TENANT_OTHER_ORG, name: "Loja C", organizacaoId: ORG_B, status: "active" }],
      // select currentTenant — organização A
      [{ organizacaoId: ORG_A }]
      // membership NÃO é consultada — deve falhar antes
    );

    const res = await request(app)
      .post("/api/auth/switch-tenant")
      .set("Authorization", `Bearer ${tokenCurrentTenant}`)
      .send({ targetTenantId: TARGET_TENANT_OTHER_ORG });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/mesma organização/i);
  });

  // ── Cenário 3 (obrigatório): usuário sem vínculo em usuarios_organizacao ──
  it("cenário 3 — retorna 403 quando usuário não tem vínculo em usuarios_organizacao", async () => {
    setupSequentialSelects(
      // select targetTenant — org A (existe e tem org)
      [{ id: TARGET_TENANT_SAME_ORG, name: "Loja B", organizacaoId: ORG_A, status: "active" }],
      // select currentTenant — org A (mesma)
      [{ organizacaoId: ORG_A }],
      // select membership — VAZIO (sem vínculo)
      []
    );

    const res = await request(app)
      .post("/api/auth/switch-tenant")
      .set("Authorization", `Bearer ${tokenNoOrg}`)
      .send({ targetTenantId: TARGET_TENANT_SAME_ORG });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/acesso a esta organização/i);
  });

  // ── Caso de borda: tenant de destino sem org ─────────────────────────────
  it("retorna 403 quando tenant de destino não pertence a nenhuma organização", async () => {
    setupSequentialSelects(
      // target tenant existe mas sem organizacaoId
      [{ id: TARGET_TENANT_OTHER_ORG, name: "Tenant Avulso", organizacaoId: null, status: "active" }]
    );

    const res = await request(app)
      .post("/api/auth/switch-tenant")
      .set("Authorization", `Bearer ${tokenCurrentTenant}`)
      .send({ targetTenantId: TARGET_TENANT_OTHER_ORG });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/nenhuma organização/i);
  });

  // ── Caso de borda: tenant inexistente ────────────────────────────────────
  it("retorna 404 quando tenant de destino não existe", async () => {
    setupSequentialSelects(
      // target tenant não encontrado
      []
    );

    const res = await request(app)
      .post("/api/auth/switch-tenant")
      .set("Authorization", `Bearer ${tokenCurrentTenant}`)
      .send({ targetTenantId: "tenant-fantasma" });

    expect(res.status).toBe(404);
  });

  // ── Validação de input ────────────────────────────────────────────────────
  it("retorna 422 quando targetTenantId não é informado", async () => {
    const res = await request(app)
      .post("/api/auth/switch-tenant")
      .set("Authorization", `Bearer ${tokenCurrentTenant}`)
      .send({});

    expect(res.status).toBe(422);
  });

  // ── Sem autenticação ──────────────────────────────────────────────────────
  it("retorna 401 sem token de autenticação", async () => {
    const res = await request(app)
      .post("/api/auth/switch-tenant")
      .send({ targetTenantId: TARGET_TENANT_SAME_ORG });

    expect(res.status).toBe(401);
  });
});
