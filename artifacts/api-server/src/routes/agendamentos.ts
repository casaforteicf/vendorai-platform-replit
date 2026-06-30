import { Router, type IRouter } from "express";
import { and, eq, gte, lte, lt, gt } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  agendamentosTable,
  agendasTable,
  leadsTable,
  insertAgendamentoSchema,
  updateAgendamentoSchema,
} from "@workspace/db";
import {
  createGoogleEvent,
  updateGoogleEvent,
  deleteGoogleEvent,
} from "../lib/google-calendar";

const router: IRouter = Router();

router.post("/agendamentos", async (req, res) => {
  const parsed = insertAgendamentoSchema.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.issues, body: req.body }, "agendamento validation failed");
    res.status(422).json({ error: parsed.error.message, issues: parsed.error.issues });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== parsed.data.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const { dataHoraInicio, dataHoraFim } = parsed.data;
  if (dataHoraFim <= dataHoraInicio) {
    res.status(422).json({ error: "dataHoraFim must be after dataHoraInicio" });
    return;
  }
  if (dataHoraInicio <= new Date()) {
    res.status(400).json({ error: "Nao e possivel agendar para uma data/horario no passado." });
    return;
  }

  let agendamento: typeof agendamentosTable.$inferSelect;
  try {
    const rows = await db
      .insert(agendamentosTable)
      .values(parsed.data)
      .returning();
    agendamento = rows[0];
  } catch (err: unknown) {
    req.log.error({ err, body: req.body }, "agendamento insert failed");
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
    return;
  }

  res.status(201).json(agendamento);

  // Async Google Calendar sync — after response sent
  req.log.info({ agendaId: agendamento.agendaId, agendamentoId: agendamento.id }, "agendamento: starting Google Calendar sync");
  if (agendamento.agendaId) {
    try {
      const [agenda] = await db
        .select({ googleRefreshToken: agendasTable.googleRefreshToken })
        .from(agendasTable)
        .where(eq(agendasTable.id, agendamento.agendaId));

      req.log.info({ agendaId: agendamento.agendaId, hasRefreshToken: !!agenda?.googleRefreshToken }, "agendamento: agenda lookup done");

      if (agenda?.googleRefreshToken) {
        const [lead] = await db
          .select({ nome: leadsTable.nome, email: leadsTable.email })
          .from(leadsTable)
          .where(eq(leadsTable.id, agendamento.leadId));

        req.log.info({ agendaId: agendamento.agendaId, leadId: agendamento.leadId }, "agendamento: calling createGoogleEvent");
        const { googleEventId, meetLink } = await createGoogleEvent(
          agendamento.agendaId,
          {
            id: agendamento.id,
            tenantId: agendamento.tenantId,
            titulo: agendamento.titulo,
            dataHoraInicio: agendamento.dataHoraInicio,
            dataHoraFim: agendamento.dataHoraFim,
            observacoes: agendamento.observacoes,
            local: agendamento.local,
            gerarMeet: agendamento.gerarMeet ?? false,
          },
          lead?.nome ?? undefined,
          lead?.email ?? undefined,
          agendamento.gerarMeet ?? false
        );
        if (googleEventId || meetLink) {
          await db
            .update(agendamentosTable)
            .set({
              ...(googleEventId ? { googleEventId } : {}),
              ...(meetLink ? { meetLink } : {}),
              updatedAt: new Date(),
            })
            .where(eq(agendamentosTable.id, agendamento.id));
        }
        req.log.info({ agendaId: agendamento.agendaId, googleEventId, meetLink }, "agendamento: Google Calendar sync result");
      } else {
        req.log.warn({ agendaId: agendamento.agendaId }, "agendamento: agenda has no refresh_token, skipping Google Calendar sync");
      }
    } catch (err) {
      req.log.error({ err }, "agendamento: Google Calendar sync failed on create");
    }
  }
});

router.get("/tenants/:tenantId/agendamentos", async (req, res) => {
  const { leadId, status, from, to, agendaId } = req.query as Record<
    string,
    string | undefined
  >;

  const conditions = [
    eq(agendamentosTable.tenantId, String(req.params.tenantId)),
  ];

  const isAdmin = req.user?.platformRole === "super_admin" || req.user?.platformRole === "tenant_admin";
  const isSeller = req.user?.platformRole === "tenant_seller";
  const userFn = req.user?.userFunction as string | undefined;
  const userId = req.user?.sub;
  if (!isAdmin && userId && (isSeller || userFn === "vendedor" || userFn === "entrega")) {
    conditions.push(eq(agendamentosTable.responsavelId, userId));
  }

  if (leadId) conditions.push(eq(agendamentosTable.leadId, leadId));
  if (agendaId) conditions.push(eq(agendamentosTable.agendaId, agendaId));
  if (status)
    conditions.push(
      eq(agendamentosTable.status, status as typeof agendamentosTable.status._.data)
    );
  if (from) conditions.push(gte(agendamentosTable.dataHoraInicio, new Date(from)));
  if (to) conditions.push(lte(agendamentosTable.dataHoraInicio, new Date(to)));

  const agendamentos = await db
    .select()
    .from(agendamentosTable)
    .where(and(...conditions))
    .orderBy(agendamentosTable.dataHoraInicio);

  res.json(agendamentos);
});

const disponibilidadeQuerySchema = z.object({
  responsavelId: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
});

router.get(
  "/tenants/:tenantId/agendamentos/disponibilidade",
  async (req, res) => {
    const parsed = disponibilidadeQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(422).json({
        error:
          "Query params required: responsavelId, from (ISO date), to (ISO date)",
      });
      return;
    }

    const { responsavelId, from, to } = parsed.data;
    const fromDate = new Date(from);
    const toDate = new Date(to);

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      res.status(422).json({ error: "Invalid date format for from or to" });
      return;
    }

    if (toDate <= fromDate) {
      res.status(422).json({ error: "to must be after from" });
      return;
    }

    const conflitos = await db
      .select()
      .from(agendamentosTable)
      .where(
        and(
          eq(agendamentosTable.tenantId, String(req.params.tenantId)),
          eq(agendamentosTable.responsavelId, responsavelId),
          lt(agendamentosTable.dataHoraInicio, toDate),
          gt(agendamentosTable.dataHoraFim, fromDate)
        )
      )
      .orderBy(agendamentosTable.dataHoraInicio);

    res.json({
      disponivel: conflitos.length === 0,
      conflitos,
    });
  }
);

router.get("/agendamentos/:id", async (req, res) => {
  const [agendamento] = await db
    .select()
    .from(agendamentosTable)
    .where(eq(agendamentosTable.id, String(req.params.id)));

  if (!agendamento) {
    res.status(404).json({ error: "Agendamento not found" });
    return;
  }

  const role = req.user?.platformRole;
  const fn = req.user?.userFunction as string | undefined;
  const isSeller =
    role === "tenant_seller" || fn === "vendedor" || fn === "entrega";
  const isAdmin =
    role === "super_admin" || role === "tenant_admin";

  if (!isAdmin && isSeller && agendamento.responsavelId !== req.user?.sub) {
    res.status(403).json({ error: "Access denied to this agendamento" });
    return;
  }

  res.json(agendamento);
});

router.patch("/agendamentos/:id", async (req, res) => {
  const parsed = updateAgendamentoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(agendamentosTable)
    .where(eq(agendamentosTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Agendamento not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const data = parsed.data;
  if (
    data.dataHoraInicio &&
    data.dataHoraFim &&
    data.dataHoraFim <= data.dataHoraInicio
  ) {
    res.status(422).json({ error: "dataHoraFim must be after dataHoraInicio" });
    return;
  }
  if (data.dataHoraInicio && data.dataHoraInicio <= new Date()) {
    res.status(400).json({ error: "Nao e possivel agendar para uma data/horario no passado." });
    return;
  }

  const [agendamento] = await db
    .update(agendamentosTable)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(agendamentosTable.id, existing.id))
    .returning();

  res.json(agendamento);

  // Async Google Calendar sync
  const agendaId = agendamento.agendaId ?? existing.agendaId;
  if (agendaId && agendamento.googleEventId) {
    try {
      const [agenda] = await db
        .select({ googleRefreshToken: agendasTable.googleRefreshToken })
        .from(agendasTable)
        .where(eq(agendasTable.id, agendaId));

      if (agenda?.googleRefreshToken) {
        const [lead] = await db
          .select({ nome: leadsTable.nome })
          .from(leadsTable)
          .where(eq(leadsTable.id, agendamento.leadId));

        await updateGoogleEvent(agendaId, agendamento, lead?.nome ?? undefined, agendamento.googleEventId);
      }
    } catch (err) {
      req.log.warn({ err }, "Google Calendar sync failed on update");
    }
  }
});

router.delete("/agendamentos/:id", async (req, res) => {
  const [existing] = await db
    .select()
    .from(agendamentosTable)
    .where(eq(agendamentosTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Agendamento not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  await db.delete(agendamentosTable).where(eq(agendamentosTable.id, existing.id));
  res.status(204).send();

  // Async Google Calendar delete
  if (existing.agendaId && existing.googleEventId) {
    try {
      const [agenda] = await db
        .select({ googleRefreshToken: agendasTable.googleRefreshToken })
        .from(agendasTable)
        .where(eq(agendasTable.id, existing.agendaId));

      if (agenda?.googleRefreshToken) {
        await deleteGoogleEvent(existing.agendaId, existing.googleEventId);
      }
    } catch (err) {
      req.log.warn({ err }, "Google Calendar sync failed on delete");
    }
  }
});

export default router;
