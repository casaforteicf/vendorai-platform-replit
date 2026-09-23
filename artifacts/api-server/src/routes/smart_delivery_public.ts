import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, activitiesTable, campaignsTable, leadsTable } from "@workspace/db";
import { safeToolTarget, verifySmartDeliveryToken } from "../services/smart-delivery.js";

const router: IRouter = Router();

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
      .select({ id: leadsTable.id })
      .from(leadsTable)
      .where(and(eq(leadsTable.id, payload.leadId), eq(leadsTable.tenantId, payload.tenantId)))
      .limit(1);
    if (!lead) return res.status(404).json({ error: "Lead não encontrado" });

    await db.insert(activitiesTable).values({
      tenantId: payload.tenantId,
      leadId: payload.leadId,
      tipo: "tarefa",
      titulo: "Evento da Entrega Inteligente",
      descricao: `Campanha ${payload.campaignId} | ${event} | Ferramenta: ${payload.toolName ?? payload.toolRef}`,
      status: "concluida",
      concluidaEm: new Date(),
      resultadoExecucao: `smart_delivery_${event}`,
    });

    return res.json({ ok: true });
  } catch {
    return res.status(400).json({ error: "Link de entrega inválido ou expirado" });
  }
});

export default router;
