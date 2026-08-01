import { Router, type IRouter } from "express";
import { and, eq, desc, isNull } from "drizzle-orm";
import {
  db,
  fretesVeiculosTable,
  fretesCargasTable,
  leadsTable,
  usersTable,
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

// ─── Fluxo estilo Uber: motorista aceita e compartilha localização ────────────

// Cargas aprovadas ainda sem motorista — a "fila de ofertas" que qualquer
// motorista do tenant pode ver e aceitar.
router.get("/tenants/:tenantId/fretes/cargas/disponiveis", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const rows = await db.select().from(fretesCargasTable)
    .where(and(
      eq(fretesCargasTable.tenantId, tenantId),
      eq(fretesCargasTable.status, "aprovado"),
      isNull(fretesCargasTable.motoristaId),
    ))
    .orderBy(desc(fretesCargasTable.createdAt));

  const clienteIds = [...new Set(rows.map((c) => c.clienteId))];
  const clientes = clienteIds.length
    ? await db.select({ id: leadsTable.id, nome: leadsTable.nome, telefone: leadsTable.telefone }).from(leadsTable)
        .where(eq(leadsTable.tenantId, tenantId))
    : [];
  const clienteMap = Object.fromEntries(clientes.map((c) => [c.id, c]));

  return res.json(rows.map((c) => ({ ...c, cliente: clienteMap[c.clienteId] ?? null })));
});

// Entregas do motorista logado (aceitas por ele, ainda em andamento).
router.get("/tenants/:tenantId/fretes/cargas/minhas", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const motoristaId = (req as any).user?.sub as string;

  const rows = await db.select().from(fretesCargasTable)
    .where(and(eq(fretesCargasTable.tenantId, tenantId), eq(fretesCargasTable.motoristaId, motoristaId)))
    .orderBy(desc(fretesCargasTable.createdAt));

  const clienteIds = [...new Set(rows.map((c) => c.clienteId))];
  const clientes = clienteIds.length
    ? await db.select({ id: leadsTable.id, nome: leadsTable.nome, telefone: leadsTable.telefone }).from(leadsTable)
        .where(eq(leadsTable.tenantId, tenantId))
    : [];
  const clienteMap = Object.fromEntries(clientes.map((c) => [c.id, c]));

  return res.json(rows.map((c) => ({ ...c, cliente: clienteMap[c.clienteId] ?? null })));
});

// Aceitar carga — atômico: só passa se ninguém pegou primeiro (evita dois
// motoristas aceitando a mesma carga ao mesmo tempo).
router.post("/tenants/:tenantId/fretes/cargas/:id/aceitar", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  const id = req.params.id as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const motoristaId = (req as any).user?.sub as string;

  const [row] = await db.update(fretesCargasTable)
    .set({ motoristaId, updatedAt: new Date() })
    .where(and(
      eq(fretesCargasTable.id, id),
      eq(fretesCargasTable.tenantId, tenantId),
      eq(fretesCargasTable.status, "aprovado"),
      isNull(fretesCargasTable.motoristaId),
    ))
    .returning();

  if (!row) {
    return res.status(409).json({ error: "Essa carga já foi aceita por outro motorista ou não está mais disponível." });
  }
  return res.json(row);
});

// Motorista atualiza a posição ao vivo enquanto está com a carga.
router.patch("/tenants/:tenantId/fretes/cargas/:id/localizacao", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  const id = req.params.id as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const userId = (req as any).user?.sub as string;

  const { lat, lng } = req.body as { lat?: number; lng?: number };
  if (typeof lat !== "number" || typeof lng !== "number") {
    return res.status(422).json({ error: "lat e lng são obrigatórios" });
  }

  const conditions = [eq(fretesCargasTable.id, id), eq(fretesCargasTable.tenantId, tenantId)];
  if (!isSuperAdmin(req)) conditions.push(eq(fretesCargasTable.motoristaId, userId));

  const [row] = await db.update(fretesCargasTable)
    .set({ localizacaoLat: lat, localizacaoLng: lng, localizacaoAtualizadaEm: new Date() })
    .where(and(...conditions))
    .returning();

  if (!row) return res.status(404).json({ error: "Carga não encontrada ou você não é o motorista responsável" });
  return res.json(row);
});

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
  const motoristaIds = [...new Set(cargas.map((c) => c.motoristaId).filter(Boolean) as string[])];

  const [clientes, veiculos, motoristas] = await Promise.all([
    clienteIds.length
      ? db.select({ id: leadsTable.id, nome: leadsTable.nome, telefone: leadsTable.telefone }).from(leadsTable)
          .where(eq(leadsTable.tenantId, tenantId))
      : Promise.resolve([]),
    veiculoIds.length
      ? db.select().from(fretesVeiculosTable).where(eq(fretesVeiculosTable.tenantId, tenantId))
      : Promise.resolve([]),
    motoristaIds.length
      ? db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable)
          .where(eq(usersTable.tenantId, tenantId))
      : Promise.resolve([]),
  ]);

  const clienteMap = Object.fromEntries(clientes.map((c) => [c.id, c]));
  const veiculoMap = Object.fromEntries(veiculos.map((v) => [v.id, v]));
  const motoristaMap = Object.fromEntries(motoristas.map((m) => [m.id, m]));

  const result = cargas.map((c) => ({
    ...c,
    cliente: clienteMap[c.clienteId] ?? null,
    veiculo: c.veiculoId ? veiculoMap[c.veiculoId] ?? null : null,
    motorista: c.motoristaId ? motoristaMap[c.motoristaId] ?? null : null,
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

  // Foto de prova é obrigatória de verdade — não só na tela. Aceita tanto a
  // foto já salva na carga (fluxo normal: PATCH da carga primeiro, depois
  // avança o status) quanto vinda junto nesse mesmo request.
  const photoField = status === "coletado" ? "fotosColetaUrls" : status === "entregue" ? "fotosEntregaUrls" : null;
  if (photoField) {
    const incomingPhotos = (req.body as any)[photoField];
    const hasIncomingPhotos = Array.isArray(incomingPhotos) && incomingPhotos.length > 0;
    if (!hasIncomingPhotos) {
      const [current] = await db.select({ photos: fretesCargasTable[photoField] }).from(fretesCargasTable)
        .where(and(eq(fretesCargasTable.id, id), eq(fretesCargasTable.tenantId, tenantId)));
      const hasStoredPhotos = Array.isArray(current?.photos) && current.photos.length > 0;
      if (!hasStoredPhotos) {
        const etapa = status === "coletado" ? "coleta" : "entrega";
        return res.status(422).json({ error: `É preciso enviar ao menos uma foto de prova da ${etapa} antes de avançar pra esse status.` });
      }
    }
  }

  const updates: Record<string, unknown> = { status, updatedAt: new Date() };
  if (photoField && Array.isArray((req.body as any)[photoField])) updates[photoField] = (req.body as any)[photoField];
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
