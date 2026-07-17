import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import {
  db,
  tenantsTable,
  tenantNavModulesTable,
  NAV_MODULE_CATALOG,
  type NavModuleKey,
} from "@workspace/db";
import { requireRole } from "./index.js";

const router: IRouter = Router();

// ── GET /tenants/:tenantId/nav-modules ──────────────────────────────────────
// Retorna o catálogo completo de módulos com o estado is_enabled do tenant.
// Módulos sem override usam o default do catálogo.
router.get("/tenants/:tenantId/nav-modules", async (req, res) => {
  const { tenantId } = req.params;
  const user = (req as any).user;

  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (user.role !== "super_admin" && user.tenantId !== tenantId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const overrides = await db
    .select({ moduleKey: tenantNavModulesTable.moduleKey, isEnabled: tenantNavModulesTable.isEnabled })
    .from(tenantNavModulesTable)
    .where(eq(tenantNavModulesTable.tenantId, tenantId));

  const overrideMap = new Map(overrides.map((o) => [o.moduleKey, o.isEnabled]));

  const modules = NAV_MODULE_CATALOG.map((entry) => ({
    moduleKey:   entry.moduleKey,
    moduleName:  entry.moduleName,
    icon:        entry.icon,
    description: entry.description,
    isDefault:   entry.isDefault,
    isEnabled:   overrideMap.has(entry.moduleKey)
      ? overrideMap.get(entry.moduleKey)!
      : entry.isDefault,
  }));

  res.json(modules);
});

// ── PATCH /tenants/:tenantId/nav-modules/:moduleKey ─────────────────────────
// Liga/desliga um módulo específico.
router.patch("/tenants/:tenantId/nav-modules/:moduleKey", requireRole("owner", "admin", "super_admin"), async (req, res) => {
  const { tenantId, moduleKey } = req.params;
  const user = (req as any).user;

  if (user.role !== "super_admin" && user.tenantId !== tenantId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { isEnabled } = req.body;
  if (typeof isEnabled !== "boolean") {
    res.status(400).json({ error: "isEnabled deve ser boolean" });
    return;
  }

  const validKey = NAV_MODULE_CATALOG.find((m) => m.moduleKey === moduleKey);
  if (!validKey) {
    res.status(400).json({ error: `moduleKey inválido: ${moduleKey}` });
    return;
  }

  await db
    .insert(tenantNavModulesTable)
    .values({ tenantId, moduleKey: moduleKey as NavModuleKey, isEnabled, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [tenantNavModulesTable.tenantId, tenantNavModulesTable.moduleKey],
      set: { isEnabled, updatedAt: new Date() },
    });

  req.log.info({ tenantId, moduleKey, isEnabled }, "nav-module toggled");
  res.json({ success: true });
});

// ── PUT /tenants/:tenantId/nav-modules ──────────────────────────────────────
// Atualização em lote: body = Array<{ moduleKey, isEnabled }>
router.put("/tenants/:tenantId/nav-modules", requireRole("owner", "admin", "super_admin"), async (req, res) => {
  const { tenantId } = req.params;
  const user = (req as any).user;

  if (user.role !== "super_admin" && user.tenantId !== tenantId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { modules } = req.body;
  if (!Array.isArray(modules)) {
    res.status(400).json({ error: "modules deve ser um array" });
    return;
  }

  const validKeys = new Set(NAV_MODULE_CATALOG.map((m) => m.moduleKey));

  for (const mod of modules) {
    const { moduleKey, isEnabled } = mod as { moduleKey: string; isEnabled: boolean };
    if (!validKeys.has(moduleKey) || typeof isEnabled !== "boolean") continue;

    await db
      .insert(tenantNavModulesTable)
      .values({ tenantId, moduleKey: moduleKey as NavModuleKey, isEnabled, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [tenantNavModulesTable.tenantId, tenantNavModulesTable.moduleKey],
        set: { isEnabled, updatedAt: new Date() },
      });
  }

  req.log.info({ tenantId, count: modules.length }, "nav-modules bulk updated");
  res.json({ success: true });
});

// ── GET /nav-modules/catalog ─────────────────────────────────────────────────
// Catálogo global de módulos (sem autenticação de tenant específico).
router.get("/nav-modules/catalog", async (req, res) => {
  res.json(NAV_MODULE_CATALOG);
});

export default router;
