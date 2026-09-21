import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, agentConfigsTable, whatsappConnectionsTable } from "@workspace/db";
import { authenticate } from "../middlewares/auth.js";
import { logger } from "../lib/logger.js";
import {
  connectInstance,
  getConnectionState,
  disconnectInstance,
  EvolutionApiError,
} from "../services/evolution-whatsapp.js";

const router: IRouter = Router();

function assertTenantAccess(req: any, tenantId: string): boolean {
  return req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId;
}

async function ensureWebhookSecret(tenantId: string): Promise<string> {
  const [config] = await db
    .select({ webhookSecret: agentConfigsTable.webhookSecret })
    .from(agentConfigsTable)
    .where(eq(agentConfigsTable.tenantId, tenantId));
  if (config?.webhookSecret) return config.webhookSecret;

  const secret = `whs_${crypto.randomUUID().replace(/-/g, "")}`;
  await db
    .insert(agentConfigsTable)
    .values({ tenantId, webhookSecret: secret })
    .onConflictDoUpdate({
      target: agentConfigsTable.tenantId,
      set: { webhookSecret: secret, updatedAt: new Date() },
    });
  return secret;
}

router.post("/tenants/:tenantId/evolution-whatsapp/connect", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!assertTenantAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  try {
    const webhookSecret = await ensureWebhookSecret(tenantId);
    const connectionId = crypto.randomUUID();
    const result = await connectInstance(tenantId, webhookSecret, req.log, connectionId);
    if (result.alreadyConnected) {
      await db.update(whatsappConnectionsTable)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(eq(whatsappConnectionsTable.tenantId, tenantId));
    }
    await db.insert(whatsappConnectionsTable).values({
      id: connectionId, tenantId, provider: "evolution", assignedUserId: req.user?.sub ?? null,
      evolutionInstanceName: result.instanceName, status: result.alreadyConnected ? "active" : "connecting",
      isDefault: result.alreadyConnected, connectedAt: new Date(), updatedAt: new Date(),
    });
    return res.json({ ...result, connectionId });
  } catch (err) {
    if (err instanceof EvolutionApiError) return res.status(502).json({ error: err.message });
    logger.error({ err, tenantId }, "evolution-whatsapp: erro ao conectar");
    return res.status(500).json({ error: "Erro inesperado ao conectar." });
  }
});

router.get("/tenants/:tenantId/evolution-whatsapp/status", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!assertTenantAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [config] = await db
    .select({ evolutionConnected: agentConfigsTable.evolutionConnected, evolutionPhone: agentConfigsTable.evolutionPhone })
    .from(agentConfigsTable)
    .where(eq(agentConfigsTable.tenantId, tenantId));

  const connectionId = typeof req.query.connectionId === "string" ? req.query.connectionId : null;
  const [connection] = connectionId ? await db.select().from(whatsappConnectionsTable).where(and(eq(whatsappConnectionsTable.id, connectionId), eq(whatsappConnectionsTable.tenantId, tenantId))).limit(1) : [null];
  const state = await getConnectionState(tenantId, connection?.evolutionInstanceName ?? undefined);
  // O webhook connection.update é a fonte de verdade principal, mas
  // consultamos o estado ao vivo também — cobre o caso da instância
  // desconectar sem o webhook chegar a tempo (rede instável etc).
  if (state === "open" && !config?.evolutionConnected) {
    await db.update(agentConfigsTable).set({ evolutionConnected: true }).where(eq(agentConfigsTable.tenantId, tenantId));
  }
  if (state === "close" && config?.evolutionConnected) {
    await db.update(agentConfigsTable).set({ evolutionConnected: false }).where(eq(agentConfigsTable.tenantId, tenantId));
  }

  return res.json({ connected: state === "open", state, phone: connection?.displayPhoneNumber ?? config?.evolutionPhone ?? null });
});

router.post("/tenants/:tenantId/evolution-whatsapp/disconnect", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!assertTenantAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const connectionId = typeof req.query.connectionId === "string" ? req.query.connectionId : null;
  const [connection] = connectionId ? await db.select().from(whatsappConnectionsTable).where(and(eq(whatsappConnectionsTable.id, connectionId), eq(whatsappConnectionsTable.tenantId, tenantId))).limit(1) : [null];
  await disconnectInstance(tenantId, req.log, connection?.evolutionInstanceName ?? undefined);
  if (connection) await db.update(whatsappConnectionsTable).set({ status: "disconnected", disconnectedAt: new Date(), updatedAt: new Date() }).where(eq(whatsappConnectionsTable.id, connection.id));
  return res.json({ success: true });
});

export default router;