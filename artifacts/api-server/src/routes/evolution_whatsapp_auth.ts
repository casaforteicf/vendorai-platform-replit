import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db, agentConfigsTable } from "@workspace/db";
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
    const result = await connectInstance(tenantId, webhookSecret, req.log);
    return res.json(result);
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

  const state = await getConnectionState(tenantId);
  // O webhook connection.update é a fonte de verdade principal, mas
  // consultamos o estado ao vivo também — cobre o caso da instância
  // desconectar sem o webhook chegar a tempo (rede instável etc).
  if (state === "open" && !config?.evolutionConnected) {
    await db.update(agentConfigsTable).set({ evolutionConnected: true }).where(eq(agentConfigsTable.tenantId, tenantId));
  }
  if (state === "close" && config?.evolutionConnected) {
    await db.update(agentConfigsTable).set({ evolutionConnected: false }).where(eq(agentConfigsTable.tenantId, tenantId));
  }

  return res.json({ connected: state === "open", state, phone: config?.evolutionPhone ?? null });
});

router.post("/tenants/:tenantId/evolution-whatsapp/disconnect", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!assertTenantAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  await disconnectInstance(tenantId, req.log);
  return res.json({ success: true });
});

export default router;