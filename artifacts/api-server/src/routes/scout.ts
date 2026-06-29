import { Router, type IRouter } from "express";
import { and, eq, desc, sum, count } from "drizzle-orm";
import {
  db,
  scoutRegrasTable,
  scoutOportunidadesTable,
} from "@workspace/db";
import { runRevenueScoutForTenant } from "../services/revenueScout.js";

const router: IRouter = Router();

function tid(req: Express.Request): string {
  return (req as any).user?.tenantId as string;
}

function isSuperAdmin(req: Express.Request) {
  return (req as any).user?.platformRole === "super_admin";
}

function canAccess(req: Express.Request, tenantId: string) {
  return isSuperAdmin(req) || tid(req) === tenantId;
}

// ─── Regras ───────────────────────────────────────────────────────────────────

router.get("/tenants/:tenantId/scout/regras", async (req, res) => {
  const { tenantId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const rows = await db
    .select()
    .from(scoutRegrasTable)
    .where(eq(scoutRegrasTable.tenantId, tenantId))
    .orderBy(desc(scoutRegrasTable.createdAt));

  return res.json(rows);
});

router.post("/tenants/:tenantId/scout/regras", async (req, res) => {
  const { tenantId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const { nome, tipo, condicoes, acao } = req.body as {
    nome?: string;
    tipo?: string;
    condicoes?: unknown;
    acao?: unknown;
  };

  if (!nome || !tipo || !condicoes || !acao) {
    return res.status(422).json({ error: "nome, tipo, condicoes e acao são obrigatórios" });
  }

  const tiposValidos = ["recompra", "cross_sell", "reativacao", "upgrade", "aniversario"];
  if (!tiposValidos.includes(tipo)) {
    return res.status(422).json({ error: `tipo inválido. Valores: ${tiposValidos.join(", ")}` });
  }

  const [row] = await db
    .insert(scoutRegrasTable)
    .values({ tenantId, nome, tipo, condicoes, acao } as any)
    .returning();

  return res.status(201).json(row);
});

router.patch("/tenants/:tenantId/scout/regras/:id", async (req, res) => {
  const { tenantId, id } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db
    .update(scoutRegrasTable)
    .set(req.body as any)
    .where(and(eq(scoutRegrasTable.id, id), eq(scoutRegrasTable.tenantId, tenantId)))
    .returning();

  if (!row) return res.status(404).json({ error: "Regra not found" });
  return res.json(row);
});

router.patch("/tenants/:tenantId/scout/regras/:id/toggle", async (req, res) => {
  const { tenantId, id } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [existing] = await db
    .select({ ativo: scoutRegrasTable.ativo })
    .from(scoutRegrasTable)
    .where(and(eq(scoutRegrasTable.id, id), eq(scoutRegrasTable.tenantId, tenantId)));

  if (!existing) return res.status(404).json({ error: "Regra not found" });

  const [row] = await db
    .update(scoutRegrasTable)
    .set({ ativo: !existing.ativo })
    .where(eq(scoutRegrasTable.id, id))
    .returning();

  return res.json(row);
});

// ─── Oportunidades ────────────────────────────────────────────────────────────

router.get("/tenants/:tenantId/scout/oportunidades", async (req, res) => {
  const { tenantId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const filters = [eq(scoutOportunidadesTable.tenantId, tenantId)];

  if (req.query.tipo) {
    filters.push(eq(scoutOportunidadesTable.tipo, req.query.tipo as string));
  }
  if (req.query.status) {
    filters.push(eq(scoutOportunidadesTable.status, req.query.status as string));
  }
  if (req.query.clienteId) {
    filters.push(eq(scoutOportunidadesTable.clienteId, req.query.clienteId as string));
  }

  const rows = await db
    .select()
    .from(scoutOportunidadesTable)
    .where(and(...filters))
    .orderBy(desc(scoutOportunidadesTable.createdAt))
    .limit(200);

  return res.json(rows);
});

// ─── Dashboard ────────────────────────────────────────────────────────────────

router.get("/tenants/:tenantId/scout/dashboard", async (req, res) => {
  const { tenantId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const todas = await db
    .select({
      status:        scoutOportunidadesTable.status,
      valorEstimado: scoutOportunidadesTable.valorEstimado,
      converteu:     scoutOportunidadesTable.converteu,
    })
    .from(scoutOportunidadesTable)
    .where(eq(scoutOportunidadesTable.tenantId, tenantId));

  const totalOportunidades = todas.length;
  const enviadas    = todas.filter((o) => o.status === "enviado" || o.status === "respondeu" || o.status === "converteu").length;
  const convertidas = todas.filter((o) => o.converteu === true).length;
  const taxaConversao = enviadas > 0 ? Number(((convertidas / enviadas) * 100).toFixed(1)) : 0;

  const receitaEstimada = todas.reduce((acc, o) => acc + Number(o.valorEstimado ?? 0), 0);
  const receitaGerada   = todas
    .filter((o) => o.converteu === true)
    .reduce((acc, o) => acc + Number(o.valorEstimado ?? 0), 0);

  return res.json({
    totalOportunidades,
    enviadas,
    convertidas,
    taxaConversao,
    receitaEstimada: Number(receitaEstimada.toFixed(2)),
    receitaGerada:   Number(receitaGerada.toFixed(2)),
  });
});

// ─── Disparo manual do Revenue Scout ─────────────────────────────────────────

router.post("/tenants/:tenantId/scout/run", async (req, res) => {
  const { tenantId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const log = (req as any).log ?? console;

  const [hasRegras] = await db
    .select({ id: scoutRegrasTable.id })
    .from(scoutRegrasTable)
    .where(and(eq(scoutRegrasTable.tenantId, tenantId), eq(scoutRegrasTable.ativo, true)))
    .limit(1);

  if (!hasRegras) {
    return res.status(422).json({ error: "Nenhuma regra ativa encontrada. Configure pelo menos uma regra antes de rodar o scout." });
  }

  const result = await runRevenueScoutForTenant(tenantId, log);
  return res.json({ ok: true, ...result });
});

// ─── Converter oportunidade ───────────────────────────────────────────────────

router.post("/tenants/:tenantId/scout/oportunidades/:id/converter", async (req, res) => {
  const { tenantId, id } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db
    .update(scoutOportunidadesTable)
    .set({ converteu: true, status: "converteu" })
    .where(and(eq(scoutOportunidadesTable.id, id), eq(scoutOportunidadesTable.tenantId, tenantId)))
    .returning();

  if (!row) return res.status(404).json({ error: "Oportunidade not found" });
  return res.json(row);
});

export default router;
