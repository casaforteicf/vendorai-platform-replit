import { Router, type IRouter } from "express";
import { and, eq, desc } from "drizzle-orm";
import {
  db,
  fretesVeiculosTable,
  fretesCargasTable,
  leadsTable,
} from "@workspace/db";

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

// ─── Veículos ─────────────────────────────────────────────────────────────────

router.get("/tenants/:tenantId/fretes/veiculos", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const conditions = [eq(fretesVeiculosTable.tenantId, tenantId), eq(fretesVeiculosTable.ativo, true)];
  if (req.query.tipo) conditions.push(eq(fretesVeiculosTable.tipo, req.query.tipo as any));

  const rows = await db.select().from(fretesVeiculosTable)
    .where(and(...conditions))
    .orderBy(fretesVeiculosTable.placa);
  return res.json(rows);
});

router.post("/tenants/:tenantId/fretes/veiculos", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db.insert(fretesVeiculosTable)
    .values({ ...req.body, tenantId } as any)
    .returning();
  return res.status(201).json(row);
});

router.patch("/tenants/:tenantId/fretes/veiculos/:id", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  const id = req.params.id as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db.update(fretesVeiculosTable)
    .set(req.body as any)
    .where(and(eq(fretesVeiculosTable.id, id), eq(fretesVeiculosTable.tenantId, tenantId)))
    .returning();
  if (!row) return res.status(404).json({ error: "Veículo not found" });
  return res.json(row);
});

// Soft delete — ativo = false
router.delete("/tenants/:tenantId/fretes/veiculos/:id", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  const id = req.params.id as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db.update(fretesVeiculosTable)
    .set({ ativo: false })
    .where(and(eq(fretesVeiculosTable.id, id), eq(fretesVeiculosTable.tenantId, tenantId)))
    .returning();
  if (!row) return res.status(404).json({ error: "Veículo not found" });
  return res.json(row);
});

// ─── Cargas ───────────────────────────────────────────────────────────────────
// Fluxo: cotacao_pendente → cotado → aprovado → coletado → em_transito →
// entregue (ou cancelado a qualquer momento)

router.get("/tenants/:tenantId/fretes/cargas", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const conditions = [eq(fretesCargasTable.tenantId, tenantId)];
  if (req.query.status) conditions.push(eq(fretesCargasTable.status, req.query.status as any));
  if (req.query.veiculoId) conditions.push(eq(fretesCargasTable.veiculoId, req.query.veiculoId as string));

  const cargas = await db.select().from(fretesCargasTable)
    .where(and(...conditions))
    .orderBy(desc(fretesCargasTable.createdAt));

  const clienteIds = [...new Set(cargas.map((c) => c.clienteId))];
  const veiculoIds = [...new Set(cargas.map((c) => c.veiculoId).filter(Boolean) as string[])];

  const [clientes, veiculos] = await Promise.all([
    clienteIds.length
      ? db.select({ id: leadsTable.id, nome: leadsTable.nome, telefone: leadsTable.telefone }).from(leadsTable)
          .where(eq(leadsTable.tenantId, tenantId))
      : Promise.resolve([]),
    veiculoIds.length
      ? db.select().from(fretesVeiculosTable).where(eq(fretesVeiculosTable.tenantId, tenantId))
      : Promise.resolve([]),
  ]);

  const clienteMap = Object.fromEntries(clientes.map((c) => [c.id, c]));
  const veiculoMap = Object.fromEntries(veiculos.map((v) => [v.id, v]));

  const result = cargas.map((c) => ({
    ...c,
    cliente: clienteMap[c.clienteId] ?? null,
    veiculo: c.veiculoId ? veiculoMap[c.veiculoId] ?? null : null,
  }));

  return res.json(result);
});

router.post("/tenants/:tenantId/fretes/cargas", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const { clienteId, enderecoColeta, enderecoEntrega } = req.body as {
    clienteId: string;
    enderecoColeta: string;
    enderecoEntrega: string;
  };

  if (!clienteId || !enderecoColeta || !enderecoEntrega) {
    return res.status(422).json({ error: "clienteId, enderecoColeta e enderecoEntrega são obrigatórios" });
  }

  const [carga] = await db.insert(fretesCargasTable)
    .values({ ...req.body, tenantId } as any)
    .returning();

  return res.status(201).json(carga);
});

router.get("/tenants/:tenantId/fretes/cargas/:id", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  const id = req.params.id as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db.select().from(fretesCargasTable)
    .where(and(eq(fretesCargasTable.id, id), eq(fretesCargasTable.tenantId, tenantId)));
  if (!row) return res.status(404).json({ error: "Carga not found" });
  return res.json(row);
});

router.patch("/tenants/:tenantId/fretes/cargas/:id", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  const id = req.params.id as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db.update(fretesCargasTable)
    .set({ ...req.body, updatedAt: new Date() } as any)
    .where(and(eq(fretesCargasTable.id, id), eq(fretesCargasTable.tenantId, tenantId)))
    .returning();
  if (!row) return res.status(404).json({ error: "Carga not found" });
  return res.json(row);
});

router.patch("/tenants/:tenantId/fretes/cargas/:id/status", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  const id = req.params.id as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const { status } = req.body as { status: string };
  const statusValidos = ["cotacao_pendente", "cotado", "aprovado", "coletado", "em_transito", "entregue", "cancelado"] as const;
  if (!statusValidos.includes(status as any)) {
    return res.status(422).json({ error: `status inválido. Valores: ${statusValidos.join(", ")}` });
  }

  const updates: Record<string, unknown> = { status, updatedAt: new Date() };
  if (status === "coletado") updates.dataColetaReal = new Date();
  if (status === "entregue") updates.dataEntregaReal = new Date();

  const [row] = await db.update(fretesCargasTable)
    .set(updates)
    .where(and(eq(fretesCargasTable.id, id), eq(fretesCargasTable.tenantId, tenantId)))
    .returning();
  if (!row) return res.status(404).json({ error: "Carga not found" });
  return res.json(row);
});

export default router;
