import { Router, type IRouter } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, activitiesTable, agentTasksTable, campaignsTable, leadsTable } from "@workspace/db";
import { safeToolTarget, verifySmartDeliveryToken } from "../services/smart-delivery.js";

const router: IRouter = Router();

const DELIVERY_INTENT_BOOST: Record<"started" | "completed" | "cta_clicked", number> = {
  started: 10,
  completed: 25,
  cta_clicked: 40,
};

const CLOSER_INTENT_THRESHOLD = 60;

async function queueCloserFromSmartDelivery(params: {
  tenantId: string;
  leadId: string;
  campaignId: string;
  event: "started" | "completed" | "cta_clicked";
  intentScore: number;
  toolName?: string;
}) {
  if (params.intentScore < CLOSER_INTENT_THRESHOLD && params.event !== "cta_clicked") return;

  const [existing] = await db
    .select({ id: agentTasksTable.id })
    .from(agentTasksTable)
    .where(and(
      eq(agentTasksTable.tenantId, params.tenantId),
      eq(agentTasksTable.leadId, params.leadId),
      eq(agentTasksTable.agentName, "closer"),
      inArray(agentTasksTable.status, ["pendente_aprovacao", "aprovado", "executando"]),
    ))
    .limit(1);

  if (!existing) {
    await db.insert(agentTasksTable).values({
      tenantId: params.tenantId,
      leadId: params.leadId,
      agentName: "closer",
      actionType: "smart_delivery_intent",
      status: "pendente_aprovacao",
      payload: {
        origin: "smart_delivery",
        campaignId: params.campaignId,
        triggerEvent: params.event,
        intentScore: params.intentScore,
        threshold: CLOSER_INTENT_THRESHOLD,
        toolName: params.toolName ?? null,
        instruction:
          "Lead avançou na Entrega Inteligente. Use o resultado já registrado no CRM e conduza o próximo passo comercial sem repetir perguntas já respondidas.",
      },
    });
  }

  await db
    .update(leadsTable)
    .set({
      proximaAcao: `Closer: lead engajado na Entrega Inteligente (Intent ${Math.round(params.intentScore)}/100)`,
      updatedAt: new Date(),
    })
    .where(and(
      eq(leadsTable.id, params.leadId),
      eq(leadsTable.tenantId, params.tenantId),
    ));
}



router.get("/public/smart-delivery/:token", async (req, res) => {
  try {
    const payload = verifySmartDeliveryToken(String(req.params.token));

    const [campaign] = await db
      .select({ id: campaignsTable.id, tenantId: campaignsTable.tenantId, contexto: campaignsTable.contexto })
      .from(campaignsTable)
      .where(and(eq(campaignsTable.id, payload.campaignId), eq(campaignsTable.tenantId, payload.tenantId)))
      .limit(1);

    const [lead] = await db
      .select({ id: leadsTable.id, tenantId: leadsTable.tenantId })
      .from(leadsTable)
      .where(and(eq(leadsTable.id, payload.leadId), eq(leadsTable.tenantId, payload.tenantId)))
      .limit(1);

    if (!campaign || !lead) return res.status(404).send("Entrega não encontrada");

    await db.insert(activitiesTable).values({
      tenantId: payload.tenantId,
      leadId: payload.leadId,
      tipo: "tarefa",
      titulo: "Entrega Inteligente aberta",
      descricao: `Campanha ${payload.campaignId} | Ferramenta: ${payload.toolName ?? payload.toolRef}`,
      status: "concluida",
      concluidaEm: new Date(),
      resultadoExecucao: "smart_delivery_opened",
    }).catch(() => {});

    const target = safeToolTarget(payload.toolRef, {
      campaignId: payload.campaignId,
      leadId: payload.leadId,
      delivery: "1",
      deliveryToken: String(req.params.token),
    });
    return res.redirect(302, target);
  } catch {
    return res.status(400).send("Link de entrega inválido ou expirado");
  }
});

router.post("/public/smart-delivery/:token/event", async (req, res) => {
  try {
    const payload = verifySmartDeliveryToken(String(req.params.token));
    const event = String(req.body?.event ?? "").trim();
    if (!["started", "completed", "cta_clicked"].includes(event)) {
      return res.status(422).json({ error: "Evento inválido" });
    }

    const [lead] = await db
      .select({ id: leadsTable.id, intentScore: leadsTable.intentScore })
      .from(leadsTable)
      .where(and(eq(leadsTable.id, payload.leadId), eq(leadsTable.tenantId, payload.tenantId)))
      .limit(1);
    if (!lead) return res.status(404).json({ error: "Lead não encontrado" });

    const eventKey = `smart_delivery:${payload.campaignId}:${event}`;
    const [alreadyRecorded] = await db
      .select({ id: activitiesTable.id })
      .from(activitiesTable)
      .where(and(
        eq(activitiesTable.tenantId, payload.tenantId),
        eq(activitiesTable.leadId, payload.leadId),
        eq(activitiesTable.resultadoExecucao, eventKey),
      ))
      .limit(1);

    if (alreadyRecorded) {
      return res.json({
        ok: true,
        duplicate: true,
        intentScore: Number(lead.intentScore ?? 0),
        closerQueued: Number(lead.intentScore ?? 0) >= CLOSER_INTENT_THRESHOLD || event === "cta_clicked",
      });
    }

    await db.insert(activitiesTable).values({
      tenantId: payload.tenantId,
      leadId: payload.leadId,
      tipo: "tarefa",
      titulo: "Evento da Entrega Inteligente",
      descricao: `Campanha ${payload.campaignId} | ${event} | Ferramenta: ${payload.toolName ?? payload.toolRef}`,
      status: "concluida",
      concluidaEm: new Date(),
      resultadoExecucao: eventKey,
    });

    const boost = DELIVERY_INTENT_BOOST[event as keyof typeof DELIVERY_INTENT_BOOST];
    const [updatedLead] = await db
      .update(leadsTable)
      .set({
        intentScore: sql<number>`LEAST(100, COALESCE(${leadsTable.intentScore}, 0) + ${boost})`,
        lastIntentUpdate: new Date(),
        updatedAt: new Date(),
      })
      .where(and(
        eq(leadsTable.id, payload.leadId),
        eq(leadsTable.tenantId, payload.tenantId),
      ))
      .returning({ intentScore: leadsTable.intentScore });

    const intentScore = Number(updatedLead?.intentScore ?? lead.intentScore ?? 0);

    await queueCloserFromSmartDelivery({
      tenantId: payload.tenantId,
      leadId: payload.leadId,
      campaignId: payload.campaignId,
      event: event as "started" | "completed" | "cta_clicked",
      intentScore,
      toolName: payload.toolName,
    });

    return res.json({ ok: true, intentScore, closerQueued: intentScore >= CLOSER_INTENT_THRESHOLD || event === "cta_clicked" });
  } catch {
    return res.status(400).json({ error: "Link de entrega inválido ou expirado" });
  }
});

export default router;
