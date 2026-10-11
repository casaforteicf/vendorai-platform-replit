import { Router } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db, arqdorWorkspaceMembersTable, arqdorWorkspaceProjectsTable, usersTable } from "@workspace/db";
import { authenticate, requireRole } from "../middlewares/auth.js";

/**
 * MULTI-07 management pilot. OFF by default.
 * Only tenant admins can grant/revoke editor/viewer memberships.
 * Owner creation/transfer is intentionally excluded until verified provenance.
 */
const router = Router();
router.use("/arqdor/projects/:id/members", authenticate, requireRole("super_admin", "tenant_admin"), (req, res, next) => {
  if (process.env.ARQDOR_PROJECT_ACL_ENABLED !== "true") return res.status(404).json({ error: "Recurso indisponível." });
  const actor = req.user;
  if (!actor?.sub || !actor.tenantId ||
      (actor.accessScope && actor.accessScope !== "tenant") ||
      (actor.actorType && actor.actorType !== "human")) return res.status(403).json({ error: "Acesso negado." });
  next();
});
router.get("/arqdor/projects/:id/members", async (req, res) => {
  const tenantId = req.user!.tenantId, projectId = String(req.params.id || "");
  if (!projectId.trim()) return res.status(400).json({ error: "Projeto inválido." });
  try {
    const [project] = await db.select({ id: arqdorWorkspaceProjectsTable.id }).from(arqdorWorkspaceProjectsTable)
      .where(and(eq(arqdorWorkspaceProjectsTable.tenantId, tenantId), eq(arqdorWorkspaceProjectsTable.id, projectId))).limit(1);
    if (!project) return res.status(404).json({ error: "Projeto não encontrado." });
    const members = await db.select({ userId: arqdorWorkspaceMembersTable.userId, permission: arqdorWorkspaceMembersTable.permission })
      .from(arqdorWorkspaceMembersTable)
      .where(and(eq(arqdorWorkspaceMembersTable.tenantId, tenantId), eq(arqdorWorkspaceMembersTable.projectId, projectId)));
    res.setHeader("Cache-Control", "no-store");
    return res.json({ projectId, members });
  } catch { return res.status(503).json({ error: "Não foi possível consultar colaboradores." }); }
});
router.put("/arqdor/projects/:id/members/:userId", async (req, res) => {
  const tenantId = req.user!.tenantId, projectId = String(req.params.id || ""), userId = String(req.params.userId || "");
  const permission: "editor" | "viewer" | undefined = req.body?.permission === "editor" ? "editor" : req.body?.permission === "viewer" ? "viewer" : undefined;
  if (!projectId.trim() || !userId.trim() || !["editor", "viewer"].includes(permission))
    return res.status(400).json({ error: "Usuário ou permissão inválidos." });
  try {
    const result = await db.transaction(async tx => {
      const [project] = await tx.select({ id: arqdorWorkspaceProjectsTable.id }).from(arqdorWorkspaceProjectsTable)
        .where(and(eq(arqdorWorkspaceProjectsTable.tenantId, tenantId), eq(arqdorWorkspaceProjectsTable.id, projectId))).limit(1);
      if (!project) return "not-found" as const;
      const [user] = await tx.select({ id: usersTable.id }).from(usersTable)
        .where(and(eq(usersTable.id, userId), eq(usersTable.tenantId, tenantId), eq(usersTable.active, true))).limit(1);
      if (!user) return "invalid-user" as const;
      const [existing] = await tx.select({ permission: arqdorWorkspaceMembersTable.permission }).from(arqdorWorkspaceMembersTable)
        .where(and(eq(arqdorWorkspaceMembersTable.tenantId, tenantId), eq(arqdorWorkspaceMembersTable.projectId, projectId), eq(arqdorWorkspaceMembersTable.userId, userId))).limit(1);
      if (existing?.permission === "owner") return "owner-immutable" as const;
      await tx.insert(arqdorWorkspaceMembersTable).values({ tenantId, projectId, userId, permission })
        .onConflictDoUpdate({
          target: [arqdorWorkspaceMembersTable.tenantId, arqdorWorkspaceMembersTable.projectId, arqdorWorkspaceMembersTable.userId],
          set: { permission },
          // The owner role cannot be overwritten even if another transaction
          // grants ownership between the initial read and this upsert.
          setWhere: sql`${arqdorWorkspaceMembersTable.permission} <> 'owner'`,
        });
      return "ok" as const;
    });
    if (result !== "ok") return res.status(result === "not-found" ? 404 : result === "owner-immutable" ? 409 : 422).json({ error: result });
    return res.json({ projectId, userId, permission });
  } catch { return res.status(503).json({ error: "Não foi possível atualizar colaborador." }); }
});
router.delete("/arqdor/projects/:id/members/:userId", async (req, res) => {
  const tenantId = req.user!.tenantId, projectId = String(req.params.id || ""), userId = String(req.params.userId || "");
  if (!projectId.trim() || !userId.trim()) return res.status(400).json({ error: "Projeto ou usuário inválido." });
  try {
    // Atomic guard: owners can never be deleted by this route, including under concurrency.
    const removed = await db.delete(arqdorWorkspaceMembersTable).where(and(
      eq(arqdorWorkspaceMembersTable.tenantId, tenantId),
      eq(arqdorWorkspaceMembersTable.projectId, projectId),
      eq(arqdorWorkspaceMembersTable.userId, userId),
      sql`${arqdorWorkspaceMembersTable.permission} <> 'owner'`,
    )).returning({ userId: arqdorWorkspaceMembersTable.userId });
    if (!removed.length) return res.status(409).json({ error: "Nenhum colaborador removido; proprietário protegido ou vínculo ausente." });
    return res.json({ projectId, userId, revoked: true });
  } catch { return res.status(503).json({ error: "Não foi possível revogar acesso." }); }
});
export default router;
