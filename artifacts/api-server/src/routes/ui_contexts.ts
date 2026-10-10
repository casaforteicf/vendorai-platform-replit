import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, tenantsTable, usersTable } from "@workspace/db";
import { authorizeContextDiscovery } from "../lib/ui-context-policy.js";

const router: IRouter = Router();

/** Read-only discovery. Never grants modules, switches tenants, or accepts caller-chosen IDs. */
router.get("/ui/contexts", async (req, res) => {
  const identity = req.user;
  const preliminary = authorizeContextDiscovery(identity, null);
  if (!identity?.sub || !identity.tenantId || preliminary.error === "UI_CONTEXT_SCOPE_DENIED") {
    res.status(preliminary.error === "INVALID_SESSION_CONTEXT" ? 401 : 403)
      .json({ error: preliminary.error });
    return;
  }

  try {
    const [member] = await db.select({
      userId: usersTable.id,
      tenantId: usersTable.tenantId,
      platformRole: usersTable.platformRole,
      userFunction: usersTable.userFunction,
      active: usersTable.active,
      tenantName: tenantsTable.name,
    }).from(usersTable)
      .innerJoin(tenantsTable, eq(usersTable.tenantId, tenantsTable.id))
      .where(and(eq(usersTable.id, identity.sub), eq(usersTable.tenantId, identity.tenantId)))
      .limit(1);

    const decision = authorizeContextDiscovery(identity, member ? {
      userId: member.userId, tenantId: member.tenantId, active: member.active,
    } : null);
    if (!decision.allowed) {
      res.status(403).json({ error: decision.error });
      return;
    }

    res.setHeader("Cache-Control", "private, no-store");
    res.json({
      currentContextId: `organization:${decision.tenantId}`,
      contexts: [{
        id: `organization:${decision.tenantId}`,
        kind: "organization",
        label: member!.tenantName,
        tenantId: decision.tenantId,
        roles: [member!.platformRole === "tenant_admin" ? "tenant_admin" :
          member!.userFunction === "vendedor" ? "sales" : "member"],
        enabledExperiences: [],
      }],
      capabilitiesStatus: "pending_backend_entitlement_mapping",
    });
  } catch {
    res.status(500).json({ error: "CONTEXT_LOOKUP_FAILED" });
  }
});

export default router;
