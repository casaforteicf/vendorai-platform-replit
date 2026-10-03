import { Router, type IRouter } from "express";
import { and, eq, lt, isNotNull } from "drizzle-orm";
import {
  db,
  activitiesTable,
  agendasTable,
  leadsTable,
  tenantsTable,
  insertActivitySchema,
  updateActivitySchema,
  dealsTable,
  pipelineStagesTable,
} from "@workspace/db";
import { createGoogleEvent, updateGoogleEvent, deleteGoogleEvent } from "../lib/google-calendar.js";
import { generateSpinForActivity } from "./spin.js";
import { recordIntelligenceEvent } from "../services/customer-intelligence-history.js";

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

  let insertData = { ...parsed.data };

  // Selecionar “IA” precisa representar um agente real da etapa, e não um
  // responsável fictício. Quando a atividade está ligada a um negócio,
  // herdamos o agente IA configurado na etapa atual.
  if (insertData.categoriaExecucao === "automatica" && !insertData.agenteResponsavelKey) {
    if (!insertData.dealId) {
      res.status(422).json({
        error: "AI_STAGE_REQUIRED",
        message: "Para atribuir uma atividade à IA, vincule-a a um negócio com etapa e Agente IA configurados.",
      });
      return;
    }

    const [deal] = await db
      .select({ etapa: dealsTable.etapa })
      .from(dealsTable)
      .where(and(
        eq(dealsTable.id, insertData.dealId),
        eq(dealsTable.tenantId, insertData.tenantId),
      ))
      .limit(1);

    if (!deal) {
      res.status(422).json({ error: "DEAL_NOT_FOUND", message: "Negócio vinculado não encontrado." });
      return;
    }

    const [stage] = await db
      .select({ agentKey: pipelineStagesTable.responsavelAgenteKey })
      .from(pipelineStagesTable)
      .where(and(
        eq(pipelineStagesTable.tenantId, insertData.tenantId),
        eq(pipelineStagesTable.pipeline, "comercial"),
        eq(pipelineStagesTable.key, deal.etapa),
      ))
      .limit(1);

    if (!stage?.agentKey) {
      res.status(422).json({
        error: "AI_AGENT_NOT_CONFIGURED",
        message: "Configure o Agente IA responsável desta etapa antes de atribuir a atividade à IA.",
      });
      return;
    }

    insertData = { ...insertData, agenteResponsavelKey: stage.agentKey, responsavelId: null };
  }

  const [activity] = await db
    .insert(activitiesTable)
    .values(insertData)
    .returning();
  res.status(201).json(activity);

  void recordIntelligenceEvent({
    tenantId: activity.tenantId,
    leadId: activity.leadId,
    eventType: "activity_created",
    title: `Atividade criada: ${activity.titulo}`,
    summary: activity.descricao ?? null,
    sourceModule: "activities",
    sourceId: activity.id,
    metadata: {
      tipo: activity.tipo,
      status: activity.status,
      dealId: activity.dealId ?? null,
      dataVencimento: activity.dataVencimento?.toISOString?.() ?? activity.dataVencimento ?? null,
      responsavelId: activity.responsavelId ?? null,
    },
    log: req.log,
  });

  // Async tasks for reuniao (SPIN briefing + Google Calendar)
  if (activity.tipo === "reuniao") {
    const [tenant] = await db
      .select({ isDemo: tenantsTable.isDemo })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, activity.tenantId))
      .limit(1);

    // Async SPIN briefing generation when a meeting is scheduled
    if (!tenant?.isDemo && activity.dataHoraInicio) {
      generateSpinForActivity(activity.id, activity.tenantId, req.log).catch((err: unknown) => {
        req.log.error({ err, activityId: activity.id }, "activity: SPIN generation failed (non-fatal)");
      });
    }

    // Async Google Calendar sync
    if (activity.agendaId && activity.dataHoraInicio && activity.dataHoraFim) {
      if (tenant?.isDemo) {
        req.log.info({ activityId: activity.id }, "activity: demo tenant — skipping Google Calendar sync");
        return;
      }

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

          const { googleEventId, meetLink } = await createGoogleEvent(
            activity.agendaId,
            {
              id: activity.id,
              tenantId: activity.tenantId,
              titulo: activity.titulo,
              dataHoraInicio: activity.dataHoraInicio,
              dataHoraFim: activity.dataHoraFim,
              observacoes: activity.descricao,
              local: null,
              gerarMeet: activity.gerarMeet ?? false,
            },
            lead?.nome ?? undefined,
            lead?.email ?? undefined,
            activity.gerarMeet ?? false
          );

          if (googleEventId || meetLink) {
            await db
              .update(activitiesTable)
              .set({
                ...(googleEventId ? { googleEventId } : {}),
                ...(meetLink ? { meetLink } : {}),
                updatedAt: new Date(),
              })
              .where(eq(activitiesTable.id, activity.id));
          }

          req.log.info({ activityId: activity.id, googleEventId, meetLink }, "activity: Google Calendar sync result for reuniao");
        } else {
          req.log.warn({ activityId: activity.id, agendaId: activity.agendaId }, "activity: no google refresh token for agenda");
        }
      } catch (err: unknown) {
        req.log.error({ err, activityId: activity.id }, "activity: Google Calendar sync failed for reuniao");
      }
    }
  }
});

router.get("/tenants/:tenantId/activities", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const { leadId, dealId, status } = req.query as Record<string, string | undefined>;

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const conditions = [eq(activitiesTable.tenantId, tenantId)];

  const isAdmin = req.user?.platformRole === "super_admin" || req.user?.platformRole === "tenant_admin";
  const isSeller = req.user?.platformRole === "tenant_seller";
  const userFn = req.user?.userFunction as string | undefined;
  const userId = req.user?.sub;
  if (!isAdmin && userId && (isSeller || userFn === "vendedor" || userFn === "entrega")) {
    conditions.push(eq(activitiesTable.responsavelId, userId));
  }

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
  const tenantId = String(req.params.tenantId);

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const overdueConditions = [
    eq(activitiesTable.tenantId, tenantId),
    eq(activitiesTable.status, "pendente"),
    isNotNull(activitiesTable.dataVencimento),
    lt(activitiesTable.dataVencimento, new Date()),
  ];

  const isAdminOverdue = req.user?.platformRole === "super_admin" || req.user?.platformRole === "tenant_admin";
  const isSellerOverdue = req.user?.platformRole === "tenant_seller";
  const userFnOverdue = req.user?.userFunction as string | undefined;
  const userIdOverdue = req.user?.sub;
  if (!isAdminOverdue && userIdOverdue && (isSellerOverdue || userFnOverdue === "vendedor" || userFnOverdue === "entrega")) {
    overdueConditions.push(eq(activitiesTable.responsavelId, userIdOverdue));
  }

  const activities = await db
    .select()
    .from(activitiesTable)
    .where(and(...overdueConditions))
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

  const actRole = req.user?.platformRole;
  const actFn = req.user?.userFunction as string | undefined;
  const actIsSeller =
    actRole === "tenant_seller" || actFn === "vendedor" || actFn === "representante_comercial" || actFn === "entrega";
  const actIsAdmin =
    actRole === "super_admin" || actRole === "tenant_admin";

  if (!actIsAdmin && actIsSeller && activity.responsavelId !== req.user?.sub) {
    res.status(403).json({ error: "Access denied to this activity" });
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
    .select({
      id: activitiesTable.id,
      tenantId: activitiesTable.tenantId,
      leadId: activitiesTable.leadId,
      dealId: activitiesTable.dealId,
      titulo: activitiesTable.titulo,
      agendaId: activitiesTable.agendaId,
      googleEventId: activitiesTable.googleEventId,
      responsavelId: activitiesTable.responsavelId,
      bloqueiaAvanco: activitiesTable.bloqueiaAvanco,
      agenteResponsavelKey: activitiesTable.agenteResponsavelKey,
    })
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

  const isAdminPatch = req.user?.platformRole === "super_admin" || req.user?.platformRole === "tenant_admin";
  const isSellerPatch = req.user?.platformRole === "tenant_seller";
  const userFnPatch = req.user?.userFunction as string | undefined;
  const userIdPatch = req.user?.sub;
  if (!isAdminPatch && userIdPatch && (isSellerPatch || userFnPatch === "vendedor" || userFnPatch === "entrega")) {
    if (existing.responsavelId !== userIdPatch) {
      res.status(403).json({ error: "Acesso negado: esta atividade pertence a outro responsável" });
      return;
    }
  }

  if (parsed.data.status === "concluida" && existing.bloqueiaAvanco && !parsed.data.resultadoExecucao?.trim()) {
    res.status(422).json({
      error: "ACTIVITY_RESULT_REQUIRED",
      message: "Registre o resultado da atividade obrigatória antes de concluí-la.",
    });
    return;
  }

  const data = { ...parsed.data, updatedAt: new Date() };

  // Mantém o status legado sincronizado com o estado operacional detalhado.
  if (parsed.data.estadoExecucao === "concluida") data.status = "concluida";
  if (parsed.data.estadoExecucao === "cancelada") data.status = "cancelada";
  if (parsed.data.estadoExecucao === "em_execucao" || parsed.data.estadoExecucao === "aguardando") data.status = "pendente";

  // Auto-set concluidaEm when status transitions to "concluida"
  if (data.status === "concluida" && !parsed.data.concluidaEm) {
    data.concluidaEm = new Date();
    data.estadoExecucao = "concluida";
  } else if (data.status === "cancelada") {
    data.estadoExecucao = "cancelada";
  }

  const [activity] = await db
    .update(activitiesTable)
    .set(data)
    .where(eq(activitiesTable.id, existing.id))
    .returning();

  if (data.status === "concluida" && parsed.data.proximaAcaoTexto?.trim()) {
    await db.insert(activitiesTable).values({
      tenantId: existing.tenantId,
      leadId: existing.leadId,
      dealId: existing.dealId,
      tipo: "tarefa",
      titulo: parsed.data.proximaAcaoTexto.trim(),
      descricao: `Próxima ação criada a partir da conclusão de “${existing.titulo}”.`,
      status: "planejado",
      estadoExecucao: "planejada",
      prioridade: "normal",
      origem: "activity-next-action",
      atividadePaiId: existing.id,
      responsavelId: existing.responsavelId,
      agenteResponsavelKey: existing.agenteResponsavelKey,
    });
  }

  res.json(activity);

  void recordIntelligenceEvent({
    tenantId: activity.tenantId,
    leadId: activity.leadId,
    eventType: parsed.data.status === "concluida" ? "activity_completed" : "activity_updated",
    title: parsed.data.status === "concluida"
      ? `Atividade concluída: ${activity.titulo}`
      : `Atividade atualizada: ${activity.titulo}`,
    summary: activity.descricao ?? null,
    sourceModule: "activities",
    sourceId: activity.id,
    metadata: {
      tipo: activity.tipo,
      status: activity.status,
      dealId: activity.dealId ?? null,
      concluidaEm: activity.concluidaEm?.toISOString?.() ?? activity.concluidaEm ?? null,
    },
    log: req.log,
  });

  // Async Google Calendar sync on update
  const agendaId = activity.agendaId ?? existing.agendaId;
  if (agendaId && activity.googleEventId) {
    try {
      const [agenda] = await db
        .select({ googleRefreshToken: agendasTable.googleRefreshToken })
        .from(agendasTable)
        .where(eq(agendasTable.id, agendaId));

      if (agenda?.googleRefreshToken) {
        const [lead] = await db
          .select({ nome: leadsTable.nome })
          .from(leadsTable)
          .where(eq(leadsTable.id, activity.leadId));

        await updateGoogleEvent(agendaId, activity, lead?.nome ?? undefined, activity.googleEventId);
      }
    } catch (err) {
      req.log.warn({ err }, "activity: Google Calendar sync failed on update");
    }
  }
});

router.delete("/activities/:id", async (req, res) => {
  const [existing] = await db
    .select({ id: activitiesTable.id, tenantId: activitiesTable.tenantId, agendaId: activitiesTable.agendaId, googleEventId: activitiesTable.googleEventId, responsavelId: activitiesTable.responsavelId })
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

  const isAdminDelete = req.user?.platformRole === "super_admin" || req.user?.platformRole === "tenant_admin";
  const isSellerDelete = req.user?.platformRole === "tenant_seller";
  const userFnDelete = req.user?.userFunction as string | undefined;
  const userIdDelete = req.user?.sub;
  if (!isAdminDelete && userIdDelete && (isSellerDelete || userFnDelete === "vendedor" || userFnDelete === "entrega")) {
    if (existing.responsavelId !== userIdDelete) {
      res.status(403).json({ error: "Acesso negado: esta atividade pertence a outro responsável" });
      return;
    }
  }

  await db.delete(activitiesTable).where(eq(activitiesTable.id, existing.id));

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
      req.log.warn({ err }, "activity: Google Calendar delete failed");
    }
  }
});

export default router;
