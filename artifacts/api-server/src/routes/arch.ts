import { Router, type IRouter } from "express";
import { and, eq, ilike, sql, desc } from "drizzle-orm";
import {
  db,
  archProjetosTable,
  archAmbientesTable,
  archOrcamentoItensTable,
  archCenasTable,
  insertArchProjetoSchema,
  updateArchProjetoSchema,
  insertArchAmbienteSchema,
  updateArchAmbienteSchema,
} from "@workspace/db";
import { authenticate } from "../middlewares/auth.js";

const router: IRouter = Router();

function tenantId(req: Express.Request): string {
  return (req as any).user?.tenantId as string;
}

function isSuperAdmin(req: Express.Request) {
  return (req as any).user?.platformRole === "super_admin";
}

function canAccessTenant(req: Express.Request, tid: string) {
  return isSuperAdmin(req) || tenantId(req) === tid;
}

function getPortalBaseUrl(req: Express.Request): string {
  const domains = process.env.REPLIT_DOMAINS;
  if (domains) {
    return `https://${domains.split(",")[0].trim()}`;
  }
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
  const proto = req.headers["x-forwarded-proto"] || "https";
  return `${proto}://${Array.isArray(host) ? host[0] : host}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /arch/portal/:token — PUBLIC (no auth)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/arch/portal/:token", async (req, res) => {
  const token = String(req.params.token);

  const [projeto] = await db
    .select()
    .from(archProjetosTable)
    .where(
      and(
        eq(archProjetosTable.portalToken, token),
        eq(archProjetosTable.portalAtivo, true),
      ),
    )
    .limit(1);

  if (!projeto) {
    return res.status(404).json({ error: "Portal não encontrado ou inativo." });
  }

  const [ambientes, orcamento, cenas] = await Promise.all([
    db
      .select()
      .from(archAmbientesTable)
      .where(eq(archAmbientesTable.projetoId, projeto.id))
      .orderBy(archAmbientesTable.ordem),
    db
      .select()
      .from(archOrcamentoItensTable)
      .where(eq(archOrcamentoItensTable.projetoId, projeto.id)),
    db
      .select()
      .from(archCenasTable)
      .where(eq(archCenasTable.projetoId, projeto.id)),
  ]);

  return res.json({ projeto, ambientes, orcamento, cenas });
});

// ─────────────────────────────────────────────────────────────────────────────
// Protected routes below — all require authentication
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/arch/projetos
router.get("/arch/projetos", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const { status, clienteNome } = req.query as Record<string, string | undefined>;

  const conditions = [eq(archProjetosTable.tenantId, tid)];
  if (status) conditions.push(eq(archProjetosTable.status, status));
  if (clienteNome)
    conditions.push(ilike(archProjetosTable.clienteNome, `%${clienteNome}%`));

  const projetos = await db
    .select({
      id:              archProjetosTable.id,
      titulo:          archProjetosTable.titulo,
      clienteNome:     archProjetosTable.clienteNome,
      clienteEmail:    archProjetosTable.clienteEmail,
      clienteTelefone: archProjetosTable.clienteTelefone,
      status:          archProjetosTable.status,
      tipoObra:        archProjetosTable.tipoObra,
      areaM2:          archProjetosTable.areaM2,
      orcamentoTotal:  archProjetosTable.orcamentoTotal,
      prazoEstimado:   archProjetosTable.prazoEstimado,
      portalAtivo:     archProjetosTable.portalAtivo,
      createdAt:       archProjetosTable.createdAt,
      updatedAt:       archProjetosTable.updatedAt,
      totalAmbientes: sql<number>`(
        select count(*) from arch_ambientes
        where arch_ambientes.projeto_id = ${archProjetosTable.id}
      )`.mapWith(Number),
    })
    .from(archProjetosTable)
    .where(and(...conditions))
    .orderBy(desc(archProjetosTable.createdAt));

  return res.json(projetos);
});

// POST /api/arch/projetos
router.post("/arch/projetos", authenticate, async (req, res) => {
  const tid = tenantId(req);

  const parsed = insertArchProjetoSchema.safeParse({ ...req.body, tenantId: tid });
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const [projeto] = await db
    .insert(archProjetosTable)
    .values({
      ...parsed.data,
      portalToken: crypto.randomUUID(),
      portalAtivo: false,
    })
    .returning();

  return res.status(201).json(projeto);
});

// GET /api/arch/projetos/:id
router.get("/arch/projetos/:id", authenticate, async (req, res) => {
  const id = String(req.params.id);
  const tid = tenantId(req);

  const [projeto] = await db
    .select()
    .from(archProjetosTable)
    .where(eq(archProjetosTable.id, id))
    .limit(1);

  if (!projeto) return res.status(404).json({ error: "Projeto não encontrado." });
  if (!canAccessTenant(req, projeto.tenantId)) {
    return res.status(403).json({ error: "Acesso negado." });
  }

  const [ambientes, orcamento, cenas] = await Promise.all([
    db
      .select()
      .from(archAmbientesTable)
      .where(eq(archAmbientesTable.projetoId, id))
      .orderBy(archAmbientesTable.ordem),
    db
      .select()
      .from(archOrcamentoItensTable)
      .where(eq(archOrcamentoItensTable.projetoId, id)),
    db
      .select()
      .from(archCenasTable)
      .where(eq(archCenasTable.projetoId, id)),
  ]);

  return res.json({ projeto, ambientes, orcamento, cenas });
});

// PATCH /api/arch/projetos/:id
router.patch("/arch/projetos/:id", authenticate, async (req, res) => {
  const id = String(req.params.id);

  const [existing] = await db
    .select({ tenantId: archProjetosTable.tenantId })
    .from(archProjetosTable)
    .where(eq(archProjetosTable.id, id))
    .limit(1);

  if (!existing) return res.status(404).json({ error: "Projeto não encontrado." });
  if (!canAccessTenant(req, existing.tenantId)) {
    return res.status(403).json({ error: "Acesso negado." });
  }

  const parsed = updateArchProjetoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const [updated] = await db
    .update(archProjetosTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(archProjetosTable.id, id))
    .returning();

  return res.json(updated);
});

// DELETE /api/arch/projetos/:id — soft delete (status = cancelado)
router.delete("/arch/projetos/:id", authenticate, async (req, res) => {
  const id = String(req.params.id);

  const [existing] = await db
    .select({ tenantId: archProjetosTable.tenantId })
    .from(archProjetosTable)
    .where(eq(archProjetosTable.id, id))
    .limit(1);

  if (!existing) return res.status(404).json({ error: "Projeto não encontrado." });
  if (!canAccessTenant(req, existing.tenantId)) {
    return res.status(403).json({ error: "Acesso negado." });
  }

  const [updated] = await db
    .update(archProjetosTable)
    .set({ status: "cancelado", updatedAt: new Date() })
    .where(eq(archProjetosTable.id, id))
    .returning();

  return res.json(updated);
});

// POST /api/arch/projetos/:id/portal/ativar
router.post("/arch/projetos/:id/portal/ativar", authenticate, async (req, res) => {
  const id = String(req.params.id);

  const [existing] = await db
    .select({ tenantId: archProjetosTable.tenantId, portalToken: archProjetosTable.portalToken })
    .from(archProjetosTable)
    .where(eq(archProjetosTable.id, id))
    .limit(1);

  if (!existing) return res.status(404).json({ error: "Projeto não encontrado." });
  if (!canAccessTenant(req, existing.tenantId)) {
    return res.status(403).json({ error: "Acesso negado." });
  }

  await db
    .update(archProjetosTable)
    .set({ portalAtivo: true, updatedAt: new Date() })
    .where(eq(archProjetosTable.id, id));

  const baseUrl = getPortalBaseUrl(req);
  return res.json({ portalUrl: `${baseUrl}/arch/portal/${existing.portalToken}` });
});

// ─────────────────────────────────────────────────────────────────────────────
// Ambientes
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/arch/projetos/:id/ambientes
router.post("/arch/projetos/:id/ambientes", authenticate, async (req, res) => {
  const projetoId = String(req.params.id);

  const [projeto] = await db
    .select({ tenantId: archProjetosTable.tenantId })
    .from(archProjetosTable)
    .where(eq(archProjetosTable.id, projetoId))
    .limit(1);

  if (!projeto) return res.status(404).json({ error: "Projeto não encontrado." });
  if (!canAccessTenant(req, projeto.tenantId)) {
    return res.status(403).json({ error: "Acesso negado." });
  }

  const parsed = insertArchAmbienteSchema.safeParse({ ...req.body, projetoId });
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const [ambiente] = await db
    .insert(archAmbientesTable)
    .values(parsed.data)
    .returning();

  return res.status(201).json(ambiente);
});

// PATCH /api/arch/projetos/:id/ambientes/:ambId
router.patch("/arch/projetos/:id/ambientes/:ambId", authenticate, async (req, res) => {
  const projetoId = String(req.params.id);
  const ambId = String(req.params.ambId);

  const [projeto] = await db
    .select({ tenantId: archProjetosTable.tenantId })
    .from(archProjetosTable)
    .where(eq(archProjetosTable.id, projetoId))
    .limit(1);

  if (!projeto) return res.status(404).json({ error: "Projeto não encontrado." });
  if (!canAccessTenant(req, projeto.tenantId)) {
    return res.status(403).json({ error: "Acesso negado." });
  }

  const parsed = updateArchAmbienteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const [updated] = await db
    .update(archAmbientesTable)
    .set(parsed.data)
    .where(
      and(
        eq(archAmbientesTable.id, ambId),
        eq(archAmbientesTable.projetoId, projetoId),
      ),
    )
    .returning();

  if (!updated) return res.status(404).json({ error: "Ambiente não encontrado." });
  return res.json(updated);
});

// DELETE /api/arch/projetos/:id/ambientes/:ambId
router.delete("/arch/projetos/:id/ambientes/:ambId", authenticate, async (req, res) => {
  const projetoId = String(req.params.id);
  const ambId = String(req.params.ambId);

  const [projeto] = await db
    .select({ tenantId: archProjetosTable.tenantId })
    .from(archProjetosTable)
    .where(eq(archProjetosTable.id, projetoId))
    .limit(1);

  if (!projeto) return res.status(404).json({ error: "Projeto não encontrado." });
  if (!canAccessTenant(req, projeto.tenantId)) {
    return res.status(403).json({ error: "Acesso negado." });
  }

  await db
    .delete(archAmbientesTable)
    .where(
      and(
        eq(archAmbientesTable.id, ambId),
        eq(archAmbientesTable.projetoId, projetoId),
      ),
    );

  return res.status(204).send();
});

export default router;
