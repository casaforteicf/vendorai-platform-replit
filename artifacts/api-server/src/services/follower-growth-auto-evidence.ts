import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

export type FollowerGrowthEvidenceType = "publication" | "campaign";

export async function linkFollowerGrowthExecutionEvidence(input: {
  tenantId: string;
  approvalId: string;
  evidenceType: FollowerGrowthEvidenceType;
  evidenceId: string;
  label?: string | null;
}) {
  const approval = await db.execute(sql`
    SELECT id, status, execution_status
      FROM follower_growth_daily_approvals
     WHERE tenant_id = ${input.tenantId}
       AND id = ${input.approvalId}
       AND approval_date = CURRENT_DATE
     LIMIT 1
  `);
  const row = approval.rows?.[0] as { id?: string; status?: string; execution_status?: string } | undefined;
  if (!row?.id || row.status !== "approved") return { linked: false, reason: "approval_not_approved" as const };

  if (input.evidenceType === "publication") {
    const publication = await db.execute(sql`
      SELECT id, provider, status
        FROM social_publications
       WHERE tenant_id = ${input.tenantId} AND id = ${input.evidenceId}
       LIMIT 1
    `);
    const evidence = publication.rows?.[0] as { id?: string; provider?: string; status?: string } | undefined;
    if (!evidence?.id) return { linked: false, reason: "publication_not_found" as const };
  } else {
    const campaign = await db.execute(sql`
      SELECT id, nome, status
        FROM campaigns
       WHERE tenant_id = ${input.tenantId} AND id = ${input.evidenceId}
       LIMIT 1
    `);
    const evidence = campaign.rows?.[0] as { id?: string; nome?: string; status?: string } | undefined;
    if (!evidence?.id) return { linked: false, reason: "campaign_not_found" as const };
  }

  await db.execute(sql`
    UPDATE follower_growth_daily_approvals
       SET execution_evidence_type = ${input.evidenceType},
           execution_evidence_id = ${input.evidenceId},
           execution_evidence_label = ${input.label ?? null},
           execution_evidence_at = now(),
           execution_status = CASE WHEN execution_status = 'released' THEN 'running' ELSE execution_status END,
           execution_started_at = COALESCE(execution_started_at, now()),
           updated_at = now()
     WHERE tenant_id = ${input.tenantId}
       AND id = ${input.approvalId}
       AND approval_date = CURRENT_DATE
       AND status = 'approved'
  `);

  return { linked: true as const };
}
