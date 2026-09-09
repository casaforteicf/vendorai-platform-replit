import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  financeDataAuthorityTable,
  financeIntegrationConnectionsTable,
  financeIntegrationRegistryTable,
  financeIntegrationSyncLogsTable,
} from "@workspace/db";

const router: IRouter = Router();

function canAccess(req: Express.Request, tenantId: string) {
  return (req as any).user?.platformRole === "super_admin" || (req as any).user?.tenantId === tenantId;
}

function asPercent(value: unknown): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

router.get("/tenants/:tenantId/finance-integrations", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return void res.status(403).json({ error: "Access denied to this tenant" });

  const rows = await db
    .select({
      id: financeIntegrationRegistryTable.id,
      providerKey: financeIntegrationRegistryTable.providerKey,
      name: financeIntegrationRegistryTable.name,
      category: financeIntegrationRegistryTable.category,
      authType: financeIntegrationRegistryTable.authType,
      apiVersion: financeIntegrationRegistryTable.apiVersion,
      capabilities: financeIntegrationRegistryTable.capabilities,
      webhookSupport: financeIntegrationRegistryTable.webhookSupport,
      defaultDirection: financeIntegrationRegistryTable.defaultDirection,
      connectionId: financeIntegrationConnectionsTable.id,
      status: financeIntegrationConnectionsTable.status,
      syncDirection: financeIntegrationConnectionsTable.syncDirection,
      authenticationHealthPercent: financeIntegrationConnectionsTable.authenticationHealthPercent,
      syncHealthPercent: financeIntegrationConnectionsTable.syncHealthPercent,
      webhookHealthPercent: financeIntegrationConnectionsTable.webhookHealthPercent,
      dataConsistencyPercent: financeIntegrationConnectionsTable.dataConsistencyPercent,
      overallHealthPercent: financeIntegrationConnectionsTable.overallHealthPercent,
      lastHealthCheckAt: financeIntegrationConnectionsTable.lastHealthCheckAt,
      lastSyncAt: financeIntegrationConnectionsTable.lastSyncAt,
      lastErrorCode: financeIntegrationConnectionsTable.lastErrorCode,
      lastErrorMessage: financeIntegrationConnectionsTable.lastErrorMessage,
    })
    .from(financeIntegrationRegistryTable)
    .leftJoin(
      financeIntegrationConnectionsTable,
      and(
        eq(financeIntegrationConnectionsTable.integrationId, financeIntegrationRegistryTable.id),
        eq(financeIntegrationConnectionsTable.tenantId, tenantId),
      ),
    )
    .where(eq(financeIntegrationRegistryTable.isActive, true))
    .orderBy(financeIntegrationRegistryTable.category, financeIntegrationRegistryTable.name);

  const integrations = rows.map((row) => ({
    ...row,
    status: row.status ?? "not_configured",
    syncDirection: row.syncDirection ?? row.defaultDirection,
    authenticationHealthPercent: asPercent(row.authenticationHealthPercent),
    syncHealthPercent: asPercent(row.syncHealthPercent),
    webhookHealthPercent: asPercent(row.webhookHealthPercent),
    dataConsistencyPercent: asPercent(row.dataConsistencyPercent),
    overallHealthPercent: asPercent(row.overallHealthPercent),
  }));

  const configured = integrations.filter((item) => item.status !== "not_configured" && item.status !== "disabled");
  const healthy = configured.filter((item) => item.status === "connected" && item.overallHealthPercent >= 80);
  const error = configured.filter((item) => item.status === "error" || item.status === "expired" || item.overallHealthPercent < 50);
  const total = integrations.length || 1;
  const configuredCount = configured.length;

  res.json({
    integrations,
    summary: {
      coveragePercent: Number(((configuredCount / total) * 100).toFixed(1)),
      healthyPercent: configuredCount ? Number(((healthy.length / configuredCount) * 100).toFixed(1)) : 0,
      errorPercent: configuredCount ? Number(((error.length / configuredCount) * 100).toFixed(1)) : 0,
      configuredPercent: Number(((configuredCount / total) * 100).toFixed(1)),
    },
  });
});

router.get("/tenants/:tenantId/finance-integrations/source-authority", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return void res.status(403).json({ error: "Access denied to this tenant" });

  const rows = await db
    .select({
      id: financeDataAuthorityTable.id,
      objectType: financeDataAuthorityTable.objectType,
      authority: financeDataAuthorityTable.authority,
      integrationId: financeDataAuthorityTable.integrationId,
      syncDirection: financeDataAuthorityTable.syncDirection,
      conflictPolicy: financeDataAuthorityTable.conflictPolicy,
      providerKey: financeIntegrationRegistryTable.providerKey,
      providerName: financeIntegrationRegistryTable.name,
      updatedAt: financeDataAuthorityTable.updatedAt,
    })
    .from(financeDataAuthorityTable)
    .leftJoin(financeIntegrationRegistryTable, eq(financeDataAuthorityTable.integrationId, financeIntegrationRegistryTable.id))
    .where(eq(financeDataAuthorityTable.tenantId, tenantId))
    .orderBy(financeDataAuthorityTable.objectType);

  res.json(rows);
});

const authorityBody = z.object({
  objectType: z.string().min(2).max(80),
  authority: z.enum(["vendorai", "integration", "bank", "manual"]),
  providerKey: z.string().min(1).optional().nullable(),
  syncDirection: z.enum(["in", "out", "bidirectional"]).default("bidirectional"),
  conflictPolicy: z.enum(["reject_and_review", "vendorai_wins", "source_wins", "latest_wins"]).default("reject_and_review"),
});

router.put("/tenants/:tenantId/finance-integrations/source-authority", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return void res.status(403).json({ error: "Access denied to this tenant" });

  const parsed = authorityBody.safeParse(req.body);
  if (!parsed.success) return void res.status(422).json({ error: "Invalid source authority", issues: parsed.error.issues });

  let integrationId: string | null = null;
  if (parsed.data.providerKey) {
    const [provider] = await db
      .select({ id: financeIntegrationRegistryTable.id })
      .from(financeIntegrationRegistryTable)
      .where(eq(financeIntegrationRegistryTable.providerKey, parsed.data.providerKey))
      .limit(1);
    if (!provider) return void res.status(404).json({ error: "Integration provider not found" });
    integrationId = provider.id;
  }

  if (parsed.data.authority === "integration" && !integrationId) {
    return void res.status(422).json({ error: "providerKey is required when authority=integration" });
  }

  const [row] = await db
    .insert(financeDataAuthorityTable)
    .values({
      tenantId,
      objectType: parsed.data.objectType,
      authority: parsed.data.authority,
      integrationId,
      syncDirection: parsed.data.syncDirection,
      conflictPolicy: parsed.data.conflictPolicy,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [financeDataAuthorityTable.tenantId, financeDataAuthorityTable.objectType],
      set: {
        authority: parsed.data.authority,
        integrationId,
        syncDirection: parsed.data.syncDirection,
        conflictPolicy: parsed.data.conflictPolicy,
        updatedAt: new Date(),
      },
    })
    .returning();

  res.json(row);
});

router.get("/tenants/:tenantId/finance-integrations/:providerKey/logs", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return void res.status(403).json({ error: "Access denied to this tenant" });

  const [provider] = await db
    .select({ id: financeIntegrationRegistryTable.id })
    .from(financeIntegrationRegistryTable)
    .where(eq(financeIntegrationRegistryTable.providerKey, String(req.params.providerKey)))
    .limit(1);
  if (!provider) return void res.status(404).json({ error: "Integration provider not found" });

  const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 25));
  const rows = await db
    .select()
    .from(financeIntegrationSyncLogsTable)
    .where(and(
      eq(financeIntegrationSyncLogsTable.tenantId, tenantId),
      eq(financeIntegrationSyncLogsTable.integrationId, provider.id),
    ))
    .orderBy(desc(financeIntegrationSyncLogsTable.createdAt))
    .limit(limit);

  res.json(rows);
});

export default router;
