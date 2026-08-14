import { Router, type IRouter } from "express";
import { and, eq, gte, lte, desc } from "drizzle-orm";
import {
  db,
  imoveisPropriedadesTable,
  imoveisVisitasTable,
  leadsTable,
  usersTable,
} from "@workspace/db";
import { logger } from "../lib/logger.js";
import { autoCreateAdCampaignIfNeeded } from "../lib/adAutoCreate.js";

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

// ─── Propriedades ─────────────────────────────────────────────────────────────

router.get("/tenants/:tenantId/imoveis/propriedades", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const conditions = [eq(imoveisPropriedadesTable.tenantId, tenantId)];
  if (req.query.tipo) conditions.push(eq(imoveisPropriedadesTable.tipo, req.query.tipo as any));
  if (req.query.finalidade) conditions.push(eq(imoveisPropriedadesTable.finalidade, req.query.finalidade as any));
  if (req.query.status) conditions.push(eq(imoveisPropriedadesTable.status, req.query.status as any));
  else conditions.push(eq(imoveisPropriedadesTable.status, "disponivel")); // default: só disponíveis

  const rows = await db.select().from(imoveisPropriedadesTable)
    .where(and(...conditions))
    .orderBy(desc(imoveisPropriedadesTable.destaque), desc(imoveisPropriedadesTable.createdAt));
  return res.json(rows);
});

router.post("/tenants/:tenantId/imoveis/propriedades", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db.insert(imoveisPropriedadesTable)
    .values({ ...req.body, tenantId } as any)
    .returning();

  if (row!.status === "disponivel" && row!.vendeNoPracaAi) {
    await autoCreateAdCampaignIfNeeded(
      { tenantId, itemTipo: "imovel", itemId: row!.id, vertical: "imoveis" },
      logger,
    );
  }

  return res.status(201).json(row);
});

router.get("/tenants/:tenantId/imoveis/propriedades/:id", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  const id = req.params.id as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db.select().from(imoveisPropriedadesTable)
    .where(and(eq(imoveisPropriedadesTable.id, id), eq(imoveisPropriedadesTable.tenantId, tenantId)));
  if (!row) return res.status(404).json({ error: "Propriedade not found" });
  return res.json(row);
});

router.put("/tenants/:tenantId/imoveis/propriedades/:id", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  const id = req.params.id as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db.update(imoveisPropriedadesTable)
    .set({ ...req.body, updatedAt: new Date() } as any)
    .where(and(eq(imoveisPropriedadesTable.id, id), eq(imoveisPropriedadesTable.tenantId, tenantId)))
    .returning();
  if (!row) return res.status(404).json({ error: "Propriedade not found" });

  if (row.status === "disponivel" && row.vendeNoPracaAi) {
    await autoCreateAdCampaignIfNeeded(
      { tenantId, itemTipo: "imovel", itemId: row.id, vertical: "imoveis" },
      logger,
    );
  }

  return res.json(row);
});

// Soft delete — status = inativo (histórico de propriedade não some, útil pra relatório)
router.delete("/tenants/:tenantId/imoveis/propriedades/:id", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  const id = req.params.id as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db.update(imoveisPropriedadesTable)
    .set({ status: "inativo", updatedAt: new Date() })
    .where(and(eq(imoveisPropriedadesTable.id, id), eq(imoveisPropriedadesTable.tenantId, tenantId)))
    .returning();
  if (!row) return res.status(404).json({ error: "Propriedade not found" });
  return res.json(row);
});

// ─── Visitas ──────────────────────────────────────────────────────────────────

router.get("/tenants/:tenantId/imoveis/visitas", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const conditions = [eq(imoveisVisitasTable.tenantId, tenantId)];
  if (req.query.propriedadeId) conditions.push(eq(imoveisVisitasTable.propriedadeId, req.query.propriedadeId as string));
  if (req.query.corretorId) conditions.push(eq(imoveisVisitasTable.corretorId, req.query.corretorId as string));
  if (req.query.status) conditions.push(eq(imoveisVisitasTable.status, req.query.status as any));
  if (req.query.data) {
    const dayStart = new Date(`${req.query.data}T00:00:00`);
    const dayEnd   = new Date(`${req.query.data}T23:59:59.999`);
    conditions.push(gte(imoveisVisitasTable.dataHora, dayStart));
    conditions.push(lte(imoveisVisitasTable.dataHora, dayEnd));
  }

  const visitas = await db.select().from(imoveisVisitasTable)
    .where(and(...conditions))
    .orderBy(imoveisVisitasTable.dataHora);

  // Enrich
  const propIds = [...new Set(visitas.map((v) => v.propriedadeId))];
  const clienteIds = [...new Set(visitas.map((v) => v.clienteId))];
  const corretorIds = [...new Set(visitas.map((v) => v.corretorId).filter(Boolean) as string[])];

  const [props, clientes, corretores] = await Promise.all([
    propIds.length
      ? db.select().from(imoveisPropriedadesTable).where(eq(imoveisPropriedadesTable.tenantId, tenantId))
      : Promise.resolve([]),
    clienteIds.length
      ? db.select({ id: leadsTable.id, nome: leadsTable.nome, telefone: leadsTable.telefone }).from(leadsTable)
          .where(eq(leadsTable.tenantId, tenantId))
      : Promise.resolve([]),
    corretorIds.length
      ? db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable)
          .where(eq(usersTable.tenantId, tenantId))
      : Promise.resolve([]),
  ]);

  const propMap = Object.fromEntries(props.map((p) => [p.id, p]));
  const clienteMap = Object.fromEntries(clientes.map((c) => [c.id, c]));
  const corretorMap = Object.fromEntries(corretores.map((c) => [c.id, c]));

  const result = visitas.map((v) => ({
    ...v,
    propriedade: propMap[v.propriedadeId] ?? null,
    cliente: clienteMap[v.clienteId] ?? null,
    corretor: v.corretorId ? corretorMap[v.corretorId] ?? null : null,
  }));

  return res.json(result);
});

router.post("/tenants/:tenantId/imoveis/visitas", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const { propriedadeId, clienteId, corretorId, dataHora } = req.body as {
    propriedadeId: string;
    clienteId: string;
    corretorId?: string;
    dataHora: string;
  };

  if (!propriedadeId || !clienteId || !dataHora) {
    return res.status(422).json({ error: "propriedadeId, clienteId e dataHora são obrigatórios" });
  }

  const [propriedade] = await db.select({ id: imoveisPropriedadesTable.id, corretorResponsavelId: imoveisPropriedadesTable.corretorResponsavelId })
    .from(imoveisPropriedadesTable)
    .where(and(eq(imoveisPropriedadesTable.id, propriedadeId), eq(imoveisPropriedadesTable.tenantId, tenantId)));

  if (!propriedade) return res.status(404).json({ error: "Propriedade not found" });

  const [visita] = await db.insert(imoveisVisitasTable)
    .values({
      tenantId,
      propriedadeId,
      clienteId,
      corretorId: corretorId ?? propriedade.corretorResponsavelId ?? null,
      dataHora: new Date(dataHora),
    })
    .returning();

  return res.status(201).json(visita);
});

router.patch("/tenants/:tenantId/imoveis/visitas/:id", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  const id = req.params.id as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db.update(imoveisVisitasTable)
    .set(req.body as any)
    .where(and(eq(imoveisVisitasTable.id, id), eq(imoveisVisitasTable.tenantId, tenantId)))
    .returning();
  if (!row) return res.status(404).json({ error: "Visita not found" });
  return res.json(row);
});

export default router;
