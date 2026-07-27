import { Router, type IRouter } from "express";
import { and, eq, gte, lte } from "drizzle-orm";
import {
  db,
  servicosPrestadoresTable,
  servicosTiposTable,
  servicosOrdensTable,
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

// ─── Prestadores ────────────────────────────────────────────────────────────

router.get("/tenants/:tenantId/servicos/prestadores", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const filters = [eq(servicosPrestadoresTable.tenantId, tenantId), eq(servicosPrestadoresTable.ativo, true)];
  if (req.query.especialidade) {
    filters.push(eq(servicosPrestadoresTable.especialidade, req.query.especialidade as string));
  }

  const rows = await db
    .select()
    .from(servicosPrestadoresTable)
    .where(and(...filters))
    .orderBy(servicosPrestadoresTable.nome);

  return res.json(rows);
});

router.post("/tenants/:tenantId/servicos/prestadores", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db
    .insert(servicosPrestadoresTable)
    .values({ ...req.body, tenantId } as any)
    .returning();
  return res.status(201).json(row);
});

router.patch("/tenants/:tenantId/servicos/prestadores/:id", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  const id = req.params.id as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db
    .update(servicosPrestadoresTable)
    .set(req.body as any)
    .where(and(eq(servicosPrestadoresTable.id, id), eq(servicosPrestadoresTable.tenantId, tenantId)))
    .returning();
  if (!row) return res.status(404).json({ error: "Prestador not found" });
  return res.json(row);
});

// Soft delete — ativo = false
router.delete("/tenants/:tenantId/servicos/prestadores/:id", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  const id = req.params.id as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db
    .update(servicosPrestadoresTable)
    .set({ ativo: false })
    .where(and(eq(servicosPrestadoresTable.id, id), eq(servicosPrestadoresTable.tenantId, tenantId)))
    .returning();
  if (!row) return res.status(404).json({ error: "Prestador not found" });
  return res.json(row);
});

// ─── Tipos de Serviço ─────────────────────────────────────────────────────────

router.get("/tenants/:tenantId/servicos/tipos", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const filters = [eq(servicosTiposTable.tenantId, tenantId), eq(servicosTiposTable.ativo, true)];
  if (req.query.especialidade) {
    filters.push(eq(servicosTiposTable.especialidade, req.query.especialidade as string));
  }

  const rows = await db
    .select()
    .from(servicosTiposTable)
    .where(and(...filters))
    .orderBy(servicosTiposTable.nome);

  return res.json(rows);
});

router.post("/tenants/:tenantId/servicos/tipos", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db
    .insert(servicosTiposTable)
    .values({ ...req.body, tenantId } as any)
    .returning();
  return res.status(201).json(row);
});

router.patch("/tenants/:tenantId/servicos/tipos/:id", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  const id = req.params.id as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db
    .update(servicosTiposTable)
    .set(req.body as any)
    .where(and(eq(servicosTiposTable.id, id), eq(servicosTiposTable.tenantId, tenantId)))
    .returning();
  if (!row) return res.status(404).json({ error: "Tipo de serviço not found" });
  return res.json(row);
});

// ─── Ordens de Serviço ────────────────────────────────────────────────────────
// Fluxo: orcamento_pendente → orcamento_enviado → aprovado → agendado →
// em_andamento → concluido (ou cancelado a qualquer momento)

router.get("/tenants/:tenantId/servicos/ordens", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const filters = [eq(servicosOrdensTable.tenantId, tenantId)];

  if (req.query.prestadorId) {
    filters.push(eq(servicosOrdensTable.prestadorId, req.query.prestadorId as string));
  }
  if (req.query.status) {
    filters.push(eq(servicosOrdensTable.status, req.query.status as string));
  }
  if (req.query.data) {
    const dayStart = new Date(`${req.query.data}T00:00:00`);
    const dayEnd   = new Date(`${req.query.data}T23:59:59.999`);
    filters.push(gte(servicosOrdensTable.dataHoraVisita, dayStart));
    filters.push(lte(servicosOrdensTable.dataHoraVisita, dayEnd));
  }

  const ordens = await db
    .select()
    .from(servicosOrdensTable)
    .where(and(...filters))
    .orderBy(servicosOrdensTable.createdAt);

  // Enrich with related data
  const clienteIds   = [...new Set(ordens.map((o) => o.clienteId))];
  const prestadorIds = [...new Set(ordens.map((o) => o.prestadorId).filter(Boolean) as string[])];
  const tipoIds      = [...new Set(ordens.map((o) => o.tipoServicoId))];

  const [clientes, prestadores, tipos] = await Promise.all([
    clienteIds.length
      ? db.select({ id: leadsTable.id, nome: leadsTable.nome, telefone: leadsTable.telefone })
          .from(leadsTable)
          .where(eq(leadsTable.tenantId, tenantId))
      : Promise.resolve([]),
    prestadorIds.length
      ? db.select().from(servicosPrestadoresTable)
          .where(eq(servicosPrestadoresTable.tenantId, tenantId))
      : Promise.resolve([]),
    tipoIds.length
      ? db.select().from(servicosTiposTable)
          .where(eq(servicosTiposTable.tenantId, tenantId))
      : Promise.resolve([]),
  ]);

  const clienteMap   = Object.fromEntries(clientes.map((c) => [c.id, c]));
  const prestadorMap = Object.fromEntries(prestadores.map((p) => [p.id, p]));
  const tipoMap      = Object.fromEntries(tipos.map((t) => [t.id, t]));

  const result = ordens.map((o) => ({
    ...o,
    cliente:    clienteMap[o.clienteId] ?? null,
    prestador:  o.prestadorId ? prestadorMap[o.prestadorId] ?? null : null,
    tipoServico: tipoMap[o.tipoServicoId] ?? null,
  }));

  return res.json(result);
});

router.post("/tenants/:tenantId/servicos/ordens", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const { clienteId, tipoServicoId, enderecoAtendimento, prestadorId, observacoes } = req.body as {
    clienteId: string;
    tipoServicoId: string;
    enderecoAtendimento: string;
    prestadorId?: string;
    observacoes?: string;
  };

  if (!clienteId || !tipoServicoId || !enderecoAtendimento) {
    return res.status(422).json({ error: "clienteId, tipoServicoId e enderecoAtendimento são obrigatórios" });
  }

  const [tipoServico] = await db
    .select()
    .from(servicosTiposTable)
    .where(and(eq(servicosTiposTable.id, tipoServicoId), eq(servicosTiposTable.tenantId, tenantId)));

  if (!tipoServico) return res.status(404).json({ error: "Tipo de serviço not found" });

  // Se o tipo não requer visita técnica e já tem preço fixo, a ordem já
  // nasce com orçamento — senão, fica pendente até o prestador avaliar.
  const nascePronta = !tipoServico.requerVisitaTecnica && tipoServico.precoBase != null;

  const [ordem] = await db
    .insert(servicosOrdensTable)
    .values({
      tenantId,
      clienteId,
      tipoServicoId,
      enderecoAtendimento,
      prestadorId: prestadorId ?? null,
      observacoes: observacoes ?? null,
      status: nascePronta ? "orcamento_enviado" : "orcamento_pendente",
      valorOrcado: nascePronta ? tipoServico.precoBase : null,
    } as any)
    .returning();

  return res.status(201).json(ordem);
});

router.patch("/tenants/:tenantId/servicos/ordens/:id", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  const id = req.params.id as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db
    .update(servicosOrdensTable)
    .set(req.body as any)
    .where(and(eq(servicosOrdensTable.id, id), eq(servicosOrdensTable.tenantId, tenantId)))
    .returning();
  if (!row) return res.status(404).json({ error: "Ordem de serviço not found" });
  return res.json(row);
});

router.patch("/tenants/:tenantId/servicos/ordens/:id/status", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  const id = req.params.id as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const { status } = req.body as { status: string };
  const statusValidos = ["orcamento_pendente", "orcamento_enviado", "aprovado", "agendado", "em_andamento", "concluido", "cancelado"] as const;
  if (!statusValidos.includes(status as any)) {
    return res.status(422).json({ error: `status inválido. Valores: ${statusValidos.join(", ")}` });
  }

  const [row] = await db
    .update(servicosOrdensTable)
    .set({ status })
    .where(and(eq(servicosOrdensTable.id, id), eq(servicosOrdensTable.tenantId, tenantId)))
    .returning();
  if (!row) return res.status(404).json({ error: "Ordem de serviço not found" });
  return res.json(row);
});

export default router;
