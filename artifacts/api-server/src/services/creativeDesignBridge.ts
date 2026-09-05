import { eq } from 'drizzle-orm';
import { db, businessProfilesTable, tenantsTable } from '@workspace/db';
import {
  buildCreativeExecutionPlan,
  resolveBrandProfileFromBusinessSource,
  finalizeDesignQa,
  type CreativeExecutionPlan,
  type DesignQaInput,
} from '@workspace/vendor-brain/creative-runtime';
import type { CreativeBrief, DesignQaResult } from '@workspace/vendor-brain/creative-design';
import { enrichBrandProfileWithContentAutopilot } from './contentAutopilotCreativeBridge';

/**
 * Loads the canonical tenant/business identity already used by VendorAI and
 * adapts it to the shared Creative/Design runtime. No parallel brand profile is
 * persisted here. The learned Content Autopilot tone is read as an enrichment,
 * while Perfil da Empresa / tenant remain the canonical identity source.
 */
export async function resolveTenantCreativePlan(
  tenantId: string,
  brief: CreativeBrief,
): Promise<CreativeExecutionPlan> {
  const [businessRows, tenantRows] = await Promise.all([
    db.select({
      logoUrl: businessProfilesTable.logoUrl,
    }).from(businessProfilesTable).where(eq(businessProfilesTable.tenantId, tenantId)).limit(1),
    db.select({
      logoUrl: tenantsTable.logoUrl,
    }).from(tenantsTable).where(eq(tenantsTable.id, tenantId)).limit(1),
  ]);

  const business = businessRows[0];
  const tenant = tenantRows[0];
  const baseBrand = resolveBrandProfileFromBusinessSource({
    tenantId,
    logoUrl: business?.logoUrl || tenant?.logoUrl || null,
  });
  const brand = await enrichBrandProfileWithContentAutopilot(baseBrand);

  return buildCreativeExecutionPlan({ ...brief, tenantId }, brand);
}

/**
 * Shared QA normalizer for image, video and web outputs. Callers remain
 * responsible for permission/autonomy checks before publishing.
 */
export function resolveCreativeDesignQa(input: DesignQaInput, threshold?: number): DesignQaResult {
  return finalizeDesignQa(input, threshold);
}
