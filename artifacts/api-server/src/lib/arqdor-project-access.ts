import type { Request } from "express";
import { and, eq } from "drizzle-orm";
import { db, archProjetosTable, obrasTable } from "@workspace/db";
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
    obraId: archProjetosTable.obraId,
  }).from(archProjetosTable).where(and(
    eq(archProjetosTable.id, projectId),
    eq(archProjetosTable.tenantId, tenantId),
  )).limit(1);

  if (!project?.leadId) return false;
  return canAccessLead(req, tenantId, project.leadId);
}

/**
 * Obra-linked path: only the accountable user registered on the canonical obra
 * may access through this specific route. No implicit grant to other tenant users.
 * This does not cover administrators, collaborators, or client portals yet.
 */
export async function canAccessArqdorProjectViaObra(
  req: Request,
  tenantId: string,
  projectId: string,
): Promise<boolean> {
  const userId = req.user?.sub;
  if (!tenantId || !projectId || !userId || req.user?.tenantId !== tenantId) return false;

  const [project] = await db.select({ obraId: archProjetosTable.obraId })
    .from(archProjetosTable)
    .where(and(eq(archProjetosTable.id, projectId), eq(archProjetosTable.tenantId, tenantId)))
    .limit(1);
  if (!project?.obraId) return false;

  const [obra] = await db.select({ id: obrasTable.id })
    .from(obrasTable)
    .where(and(
      eq(obrasTable.id, project.obraId),
      eq(obrasTable.tenantId, tenantId),
      eq(obrasTable.responsavelId, userId),
    ))
    .limit(1);
  return Boolean(obra);
}

// A positive result here is narrow evidence of access via a linked lead or obra;
// it is NOT a complete project ACL. Keep this evaluator opt-in until independent
// grants for project owners, admins, collaborators and unlinked projects exist.
export async function canAccessArqdorLinkedProject(
  req: Request,
  tenantId: string,
  projectId: string,
): Promise<boolean> {
  if (!tenantId || !projectId || !req.user?.sub || req.user.tenantId !== tenantId) return false;
  if (await canAccessArqdorProjectViaLead(req, tenantId, projectId)) return true;
  return canAccessArqdorProjectViaObra(req, tenantId, projectId);
}
