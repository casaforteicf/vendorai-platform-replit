import { Router, type IRouter } from "express";
import { and, eq, lt, isNotNull } from "drizzle-orm";
import {
  db,
  activitiesTable,
  agendasTable,
  leadsTable,
  insertActivitySchema,
  updateActivitySchema,
} from "@workspace/db";
import { createGoogleEvent } from "../lib/google-calendar.js";

const router: IRouter = Router();

router.post("/activities", async (req, res) => {
  const parsed = insertActivitySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== parsed.data.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const [activity] = await db
    .insert(activitiesTable)
    .values(parsed.data)
    .returning();
  res.status(201).json(activity);

  // Async Google Calendar sync for reuniao
  if (activity.tipo === "reuniao" && activity.agendaId && activity.dataHoraInicio && activity.dataHoraFim) {
    req.log.info({ activityId: activity.id, agendaId: activity.agendaId }, "activity: starting Google Calendar sync for reuniao");
    try {
      const [agenda] = await db
        .select({ googleRefreshToken: agendasTable.googleRefreshToken })
        .from(agendasTable)
        .where(eq(agendasTable.id, activity.agendaId));

      if (agenda?.googleRefreshToken) {
        const [lead] = await db
          .select({ nome: leadsTable.nome, email: leadsTable.email })
          .from(leadsTable)
          .where(eq(leadsTable.id, activity.leadId));

        const googleEventId = await createGoogleEvent(
          activity.agendaId,
          {
            id: activity.id,
            tenantId: activity.tenantId,
            leadId: activity.leadId,
            dealId: activity.dealId,
            agendaId: activity.agendaId,
            tipo: "reuniao",
            titulo: activity.titulo,
            dataHoraInicio: activity.dataHoraInicio,
            dataHoraFim: activity.dataHoraFim,
            local: null,
            status: "agendado",
            responsavelId: activity.responsavelId,
            observacoes: activity.descricao,
            googleEventId: activity.googleEventId,
            meetLink: activity.meetLink,
            gerarMeet: activity.gerarMeet ?? false,
            createdAt: activity.createdAt,
            updatedAt: activity.updatedAt,
          },
          lead?.nome ?? undefined,
          lead?.email ?? undefined,
          activity.gerarMeet ?? false
        );

        req.log.info({ activityId: activity.id, googleEventId }, "activity: Google Calendar sync result for reuniao");
      } else {
        req.log.warn({ activityId: activity.id, agendaId: activity.agendaId }, "activity: no google refresh token for agenda");
      }
    } catch (err: unknown) {
      req.log.error({ err, activityId: activity.id }, "activity: Google Calendar sync failed for reuniao");
    }
  }
});

router.get("/tenants/:tenantId/activities", async (req, res) => {
  const { leadId, dealId, status } = req.query as Record<string, string | undefined>;

  const conditions = [eq(activitiesTable.tenantId, String(req.params.tenantId))];
  if (leadId) conditions.push(eq(activitiesTable.leadId, leadId));
  if (dealId) conditions.push(eq(activitiesTable.dealId, dealId));
  if (status)
    conditions.push(
      eq(activitiesTable.status, status as typeof activitiesTable.status._.data)
    );

  const activities = await db
    .select()
    .from(activitiesTable)
    .where(and(...conditions))
    .orderBy(activitiesTable.dataVencimento, activitiesTable.createdAt);

  res.json(activities);
});

router.get("/tenants/:tenantId/activities/overdue", async (req, res) => {
  const activities = await db
    .select()
    .from(activitiesTable)
    .where(
      and(
        eq(activitiesTable.tenantId, String(req.params.tenantId)),
        eq(activitiesTable.status, "pendente"),
        isNotNull(activitiesTable.dataVencimento),
        lt(activitiesTable.dataVencimento, new Date())
      )
    )
    .orderBy(activitiesTable.dataVencimento);

  res.json(activities);
});

router.get("/activities/:id", async (req, res) => {
  const [activity] = await db
    .select()
    .from(activitiesTable)
    .where(eq(activitiesTable.id, String(req.params.id)));

  if (!activity) {
    res.status(404).json({ error: "Activity not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && activity.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  res.json(activity);
});

router.patch("/activities/:id", async (req, res) => {
  const parsed = updateActivitySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select({ id: activitiesTable.id, tenantId: activitiesTable.tenantId })
    .from(activitiesTable)
    .where(eq(activitiesTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Activity not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const data = { ...parsed.data, updatedAt: new Date() };

  // Auto-set concluidaEm when status transitions to "concluida"
  if (parsed.data.status === "concluida" && !parsed.data.concluidaEm) {
    data.concluidaEm = new Date();
  }

  const [activity] = await db
    .update(activitiesTable)
    .set(data)
    .where(eq(activitiesTable.id, existing.id))
    .returning();

  res.json(activity);
});

router.delete("/activities/:id", async (req, res) => {
  const [existing] = await db
    .select({ id: activitiesTable.id, tenantId: activitiesTable.tenantId })
    .from(activitiesTable)
    .where(eq(activitiesTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Activity not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  await db.delete(activitiesTable).where(eq(activitiesTable.id, existing.id));

  res.status(204).send();
});

export default router;
