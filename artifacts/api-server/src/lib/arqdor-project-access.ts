import type { Request } from "express";
import { and, eq } from "drizzle-orm";
import { db, archProjetosTable } from "@workspace/db";
import { canAccessLead } from "./lead-scope-access.js";

/**
 * Preliminary project access evaluator. Not yet wired to routes.
 * Denies ambiguous/unlinked projects until the product's project ACL is defined.
 * Never authorize by architect name, browser cache or request-supplied tenant.
 */
export async function canAccessArqdorProjectViaLead(
  req: Request,
  tenantId: string,
  projectId: string,
): Promise<boolean> {
  if (!tenantId || !projectId || !req.user?.sub) return false;
  if (req.user.tenantId !== tenantId) return false;

  const [project] = await db.select({
    id: archProjetosTable.id,
    leadId: archProjetosTable.leadId,
  }).from(archProjetosTable).where(and(
    eq(archProjetosTable.id, projectId),
    eq(archProjetosTable.tenantId, tenantId),
  )).limit(1);

  if (!project?.leadId) return false;
  return canAccessLead(req, tenantId, project.leadId);
}
