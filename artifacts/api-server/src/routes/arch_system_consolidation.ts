import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { authenticate } from "../middlewares/auth.js";
import type { ReleaseGatePayload } from "./arch_system_consolidation.types.js";

const MODULES = [
  { id: "render-gallery",         sprint: "029", label: "Render real" },
  { id: "specification-catalog",  sprint: "030", label: "Especificação" },
  { id: "budget-engine",          sprint: "031", label: "Orçamento" },
  { id: "client-portal-approval", sprint: "032", label: "Portal cliente" },
  { id: "production-procurement", sprint: "033", label: "Produção" },
  { id: "post-sale",              sprint: "034", label: "Pós-venda" },
];

const ENDPOINTS = [
  { method: "GET",  path: "/api/arch/renders/gallery",              moduleId: "render-gallery" },
  { method: "POST", path: "/api/arch/ai-render/:id/adjust",         moduleId: "render-gallery" },
  { method: "GET",  path: "/api/arch/spec-objects",                 moduleId: "specification-catalog" },
  { method: "POST", path: "/api/arch/spec-objects",                 moduleId: "specification-catalog" },
  { method: "GET",  path: "/api/arch/orcamento",                    moduleId: "budget-engine" },
  { method: "POST", path: "/api/arch/orcamento/from-spec-objects",  moduleId: "budget-engine" },
  { method: "GET",  path: "/api/arch/propostas",                    moduleId: "client-portal-approval" },
  { method: "GET",  path: "/api/arch/portal/proposta/:token",       moduleId: "client-portal-approval" },
  { method: "GET",  path: "/api/arch/producao",                     moduleId: "production-procurement" },
  { method: "POST", path: "/api/arch/producao/from-approval",       moduleId: "production-procurement" },
  { method: "GET",  path: "/api/arch/pos-venda",                    moduleId: "post-sale" },
  { method: "POST", path: "/api/arch/pos-venda/from-production",    moduleId: "post-sale" },
];

const RELEASE_GATES_DEFAULT = [
  { id: "gate-typecheck",        label: "Typecheck global",        description: "pnpm typecheck executado sem erros." },
  { id: "gate-navigation",       label: "Navegação unificada",     description: "Menu lateral valida todos os módulos 029–034." },
  { id: "gate-real-api",         label: "APIs reais",              description: "Endpoints críticos retornam 200 com dados válidos." },
  { id: "gate-tenant",           label: "Tenant/RLS",              description: "Isolamento por tenant validado — sem vazamento cruzado." },
  { id: "gate-public-token",     label: "Tokens públicos seguros", description: "Tokens de portal público não expõem dados de outros tenants." },
  { id: "gate-print",            label: "Impressão orçamento",     description: "PDF/impressão do orçamento funciona sem erros de layout." },
  { id: "gate-release-candidate",label: "Release Candidate",       description: "Fluxo E2E completo (Render→Spec→Orç→Portal→Prod→Pós) validado." },
];

async function getSystemConsolidation() {
  let savedGates: Array<{ gate_id: string; status: string; evidence: string | null; owner: string | null }> = [];

  try {
    const result = await db.execute(
      sql`SELECT gate_id, status, evidence, owner FROM arch_release_gates ORDER BY created_at DESC`,
    );
    savedGates = (result.rows ?? result) as typeof savedGates;
  } catch {
    savedGates = [];
  }

  const releaseGates = RELEASE_GATES_DEFAULT.map((gate) => {
    const saved = savedGates.find((row) => row.gate_id === gate.id);
    return {
      ...gate,
      status: (saved?.status ?? "pending") as "pending" | "passed" | "failed" | "waived",
      evidence: saved?.evidence ?? null,
      owner: saved?.owner ?? null,
    };
  });

  return {
    modules: MODULES.map((m) => ({
      ...m,
      kind: m.id,
      routeKeys: [],
      importPath: "",
      componentName: "",
      required: true,
      description: m.label,
      expectedEndpoints: [],
      status: "applied",
      health: "unknown",
    })),
    endpoints: ENDPOINTS.map((e) => ({
      ...e,
      required: true,
      description: e.path,
      health: "unknown" as const,
      lastStatus: null,
      lastCheckedAt: null,
      error: null,
    })),
    mockDebts: [],
    releaseGates,
    flow: [],
    securityChecks: [],
  };
}

export function createSystemConsolidationRouter() {
  const router = Router();

  router.get("/arch/system/consolidation", authenticate, async (req, res, next) => {
    try {
      const bundle = await getSystemConsolidation();
      return res.json(bundle);
    } catch (err) {
      return next(err);
    }
  });

  router.post("/arch/system/release-gates", authenticate, async (req, res, next) => {
    try {
      const { gateId, status, evidence } = req.body as ReleaseGatePayload;
      const tenantId = (req as any).tenant?.id ?? (req as any).user?.tenantId ?? null;

      await db.execute(
        sql`
          INSERT INTO arch_release_gates (id, tenant_id, gate_id, status, evidence, created_at, updated_at)
          VALUES (gen_random_uuid(), ${tenantId}, ${gateId}, ${status}, ${evidence ?? null}, now(), now())
          ON CONFLICT (gate_id)
          DO UPDATE SET
            status     = EXCLUDED.status,
            evidence   = EXCLUDED.evidence,
            updated_at = now()
        `,
      );

      return res.json({ ok: true });
    } catch (err) {
      return next(err);
    }
  });

  router.post("/arch/system/health-check", authenticate, async (req, res, next) => {
    try {
      const bundle = await getSystemConsolidation();
      return res.json({
        ...bundle,
        endpoints: bundle.endpoints.map((e) => ({
          ...e,
          health: "unknown" as const,
          lastCheckedAt: new Date().toISOString(),
          error: "Health check passivo — endpoints marcados como unknown até validação E2E.",
        })),
      });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}
