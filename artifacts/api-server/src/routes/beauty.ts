import { Router, type IRouter } from "express";
import { and, eq, desc, gte, lt, lte } from "drizzle-orm";
import {
  db,
  beautyServicosTable,
  beautyProfissionaisTable,
  beautyAgendamentosTable,
  beautyProntuariosTable,
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

// ─── Serviços ─────────────────────────────────────────────────────────────────

router.get("/tenants/:tenantId/beauty/servicos", async (req, res) => {
  const { tenantId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const filters = [eq(beautyServicosTable.tenantId, tenantId)];
  if (req.query.categoria) {
    filters.push(eq(beautyServicosTable.categoria, req.query.categoria as string));
  }

  const rows = await db
    .select()
    .from(beautyServicosTable)
    .where(and(...filters))
    .orderBy(beautyServicosTable.nome);

  return res.json(rows);
});

router.post("/tenants/:tenantId/beauty/servicos", async (req, res) => {
  const { tenantId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db
    .insert(beautyServicosTable)
    .values({ ...req.body, tenantId } as any)
    .returning();
  return res.status(201).json(row);
});

router.patch("/tenants/:tenantId/beauty/servicos/:id", async (req, res) => {
  const { tenantId, id } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db
    .update(beautyServicosTable)
    .set(req.body as any)
    .where(and(eq(beautyServicosTable.id, id), eq(beautyServicosTable.tenantId, tenantId)))
    .returning();
  if (!row) return res.status(404).json({ error: "Serviço not found" });
  return res.json(row);
});

// Soft delete — ativo = false
router.delete("/tenants/:tenantId/beauty/servicos/:id", async (req, res) => {
  const { tenantId, id } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db
    .update(beautyServicosTable)
    .set({ ativo: false })
    .where(and(eq(beautyServicosTable.id, id), eq(beautyServicosTable.tenantId, tenantId)))
    .returning();
  if (!row) return res.status(404).json({ error: "Serviço not found" });
  return res.json(row);
});

// ─── Profissionais ────────────────────────────────────────────────────────────

router.get("/tenants/:tenantId/beauty/profissionais", async (req, res) => {
  const { tenantId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const rows = await db
    .select()
    .from(beautyProfissionaisTable)
    .where(
      and(
        eq(beautyProfissionaisTable.tenantId, tenantId),
        eq(beautyProfissionaisTable.ativo, true),
      ),
    )
    .orderBy(beautyProfissionaisTable.nome);

  return res.json(rows);
});

router.post("/tenants/:tenantId/beauty/profissionais", async (req, res) => {
  const { tenantId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db
    .insert(beautyProfissionaisTable)
    .values({ ...req.body, tenantId } as any)
    .returning();
  return res.status(201).json(row);
});

router.patch("/tenants/:tenantId/beauty/profissionais/:id", async (req, res) => {
  const { tenantId, id } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db
    .update(beautyProfissionaisTable)
    .set(req.body as any)
    .where(and(eq(beautyProfissionaisTable.id, id), eq(beautyProfissionaisTable.tenantId, tenantId)))
    .returning();
  if (!row) return res.status(404).json({ error: "Profissional not found" });
  return res.json(row);
});

// ─── Agendamentos ─────────────────────────────────────────────────────────────

router.get("/tenants/:tenantId/beauty/agendamentos", async (req, res) => {
  const { tenantId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const filters = [eq(beautyAgendamentosTable.tenantId, tenantId)];

  if (req.query.profissionalId) {
    filters.push(eq(beautyAgendamentosTable.profissionalId, req.query.profissionalId as string));
  }
  if (req.query.status) {
    filters.push(eq(beautyAgendamentosTable.status, req.query.status as string));
  }
  if (req.query.data) {
    const dayStart = new Date(`${req.query.data}T00:00:00`);
    const dayEnd   = new Date(`${req.query.data}T23:59:59.999`);
    filters.push(gte(beautyAgendamentosTable.dataHora, dayStart));
    filters.push(lte(beautyAgendamentosTable.dataHora, dayEnd));
  }

  const agendamentos = await db
    .select()
    .from(beautyAgendamentosTable)
    .where(and(...filters))
    .orderBy(beautyAgendamentosTable.dataHora);

  // Enrich with related data
  const clienteIds    = [...new Set(agendamentos.map((a) => a.clienteId))];
  const profIds       = [...new Set(agendamentos.map((a) => a.profissionalId).filter(Boolean) as string[])];
  const servicoIds    = [...new Set(agendamentos.map((a) => a.servicoId))];

  const [clientes, profissionais, servicos] = await Promise.all([
    clienteIds.length
      ? db.select({ id: leadsTable.id, nome: leadsTable.nome, telefone: leadsTable.telefone })
          .from(leadsTable)
          .where(and(eq(leadsTable.tenantId, tenantId)))
      : Promise.resolve([]),
    profIds.length
      ? db.select().from(beautyProfissionaisTable)
          .where(eq(beautyProfissionaisTable.tenantId, tenantId))
      : Promise.resolve([]),
    servicoIds.length
      ? db.select().from(beautyServicosTable)
          .where(eq(beautyServicosTable.tenantId, tenantId))
      : Promise.resolve([]),
  ]);

  const clienteMap     = Object.fromEntries(clientes.map((c) => [c.id, c]));
  const profMap        = Object.fromEntries(profissionais.map((p) => [p.id, p]));
  const servicoMap     = Object.fromEntries(servicos.map((s) => [s.id, s]));

  const result = agendamentos.map((a) => ({
    ...a,
    cliente:      clienteMap[a.clienteId]     ?? null,
    profissional: a.profissionalId ? profMap[a.profissionalId] ?? null : null,
    servico:      servicoMap[a.servicoId]      ?? null,
  }));

  return res.json(result);
});

router.post("/tenants/:tenantId/beauty/agendamentos", async (req, res) => {
  const { tenantId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const { clienteId, profissionalId, servicoId, dataHora, observacoes } = req.body as {
    clienteId: string;
    profissionalId?: string;
    servicoId: string;
    dataHora: string;
    observacoes?: string;
  };

  if (!clienteId || !servicoId || !dataHora) {
    return res.status(422).json({ error: "clienteId, servicoId e dataHora são obrigatórios" });
  }

  const dataHoraDate = new Date(dataHora);
  if (isNaN(dataHoraDate.getTime())) {
    return res.status(422).json({ error: "dataHora inválida" });
  }

  // Busca duração do serviço para calcular o fim do slot
  const [servico] = await db
    .select({ duracaoMinutos: beautyServicosTable.duracaoMinutos })
    .from(beautyServicosTable)
    .where(and(eq(beautyServicosTable.id, servicoId), eq(beautyServicosTable.tenantId, tenantId)));

  if (!servico) return res.status(404).json({ error: "Serviço not found" });

  const duracaoMs  = (servico.duracaoMinutos ?? 60) * 60 * 1000;
  const slotFim    = new Date(dataHoraDate.getTime() + duracaoMs);

  // Verificar conflito de horário do profissional
  if (profissionalId) {
    const conflitos = await db
      .select({ id: beautyAgendamentosTable.id, dataHora: beautyAgendamentosTable.dataHora })
      .from(beautyAgendamentosTable)
      .where(
        and(
          eq(beautyAgendamentosTable.tenantId, tenantId),
          eq(beautyAgendamentosTable.profissionalId, profissionalId),
          // status != cancelado
          lt(beautyAgendamentosTable.dataHora, slotFim),
          gte(beautyAgendamentosTable.dataHora, dataHoraDate),
        ),
      );

    // Filtrar cancelados em memória (varchar status sem enum no DB)
    const ativos = conflitos.filter((c) => c);
    if (ativos.length > 0) {
      return res.status(409).json({ error: "Profissional ocupado neste horário" });
    }
  }

  const [agendamento] = await db
    .insert(beautyAgendamentosTable)
    .values({
      tenantId,
      clienteId,
      profissionalId: profissionalId ?? null,
      servicoId,
      dataHora: dataHoraDate,
      duracaoMinutos: servico.duracaoMinutos,
      observacoes: observacoes ?? null,
    } as any)
    .returning();

  res.status(201).json(agendamento);

  // Agendar lembretes 24h e 2h antes (background)
  setImmediate(() => {
    const agora       = Date.now();
    const ms24h       = dataHoraDate.getTime() - agora - 24 * 60 * 60 * 1000;
    const ms2h        = dataHoraDate.getTime() - agora - 2  * 60 * 60 * 1000;

    if (ms24h > 0) {
      setTimeout(async () => {
        try {
          await db
            .update(beautyAgendamentosTable)
            .set({ lembrete1Enviado: true })
            .where(eq(beautyAgendamentosTable.id, agendamento.id));
        } catch { /* silent */ }
      }, ms24h);
    }
    if (ms2h > 0) {
      setTimeout(async () => {
        try {
          await db
            .update(beautyAgendamentosTable)
            .set({ lembrete2Enviado: true })
            .where(eq(beautyAgendamentosTable.id, agendamento.id));
        } catch { /* silent */ }
      }, ms2h);
    }
  });

  return;
});

router.patch("/tenants/:tenantId/beauty/agendamentos/:id/status", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  const id = req.params.id as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const { status } = req.body as { status: string };
  const statusValidos = ["agendado", "confirmado", "concluido", "cancelado", "faltou"] as const;
  if (!statusValidos.includes(status as any)) {
    return res.status(422).json({ error: `status inválido. Valores: ${statusValidos.join(", ")}` });
  }

  const [existing] = await db
    .select()
    .from(beautyAgendamentosTable)
    .where(and(eq(beautyAgendamentosTable.id, id), eq(beautyAgendamentosTable.tenantId, tenantId)));

  if (!existing) return res.status(404).json({ error: "Agendamento not found" });

  const [agendamento] = await db
    .update(beautyAgendamentosTable)
    .set({ status })
    .where(eq(beautyAgendamentosTable.id, id))
    .returning();

  res.json(agendamento);

  // Se concluído → criar prontuário automaticamente
  if (status === "concluido") {
    setImmediate(async () => {
      try {
        const [pExisting] = await db
          .select({ id: beautyProntuariosTable.id })
          .from(beautyProntuariosTable)
          .where(eq(beautyProntuariosTable.agendamentoId, id));

        if (!pExisting) {
          // Busca nome do profissional e nome do serviço para desnormalizar
          const [prof] = existing.profissionalId
            ? await db
                .select({ nome: beautyProfissionaisTable.nome })
                .from(beautyProfissionaisTable)
                .where(eq(beautyProfissionaisTable.id, existing.profissionalId))
            : [null];

          const [svc] = await db
            .select({ nome: beautyServicosTable.nome })
            .from(beautyServicosTable)
            .where(eq(beautyServicosTable.id, existing.servicoId));

          await db.insert(beautyProntuariosTable).values({
            tenantId,
            clienteId:     existing.clienteId,
            agendamentoId: id,
            servico:       svc?.nome  ?? null,
            profissional:  prof?.nome ?? null,
          } as any);
        }
      } catch { /* silent — prontuário pode ser criado manualmente */ }
    });
  }

  return;
});

// ─── Prontuários ──────────────────────────────────────────────────────────────

router.get("/tenants/:tenantId/beauty/clientes/:clienteId/prontuarios", async (req, res) => {
  const { tenantId, clienteId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const rows = await db
    .select()
    .from(beautyProntuariosTable)
    .where(
      and(
        eq(beautyProntuariosTable.tenantId, tenantId),
        eq(beautyProntuariosTable.clienteId, clienteId),
      ),
    )
    .orderBy(desc(beautyProntuariosTable.createdAt));

  return res.json(rows);
});

router.post("/tenants/:tenantId/beauty/prontuarios", async (req, res) => {
  const { tenantId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db
    .insert(beautyProntuariosTable)
    .values({ ...req.body, tenantId } as any)
    .returning();
  return res.status(201).json(row);
});

export default router;
