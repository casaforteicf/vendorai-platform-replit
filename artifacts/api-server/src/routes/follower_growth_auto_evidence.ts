import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { linkFollowerGrowthExecutionEvidence } from "../services/follower-growth-auto-evidence.js";

const router: IRouter = Router();

function canAccess(req: any, tenantId: string) {
  return req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId;
}

router.post("/tenants/:tenantId/follower-growth/approvals/auto-evidence", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const approvals = await db.execute(sql`
    SELECT id, action_type AS "actionType", execution_started_at AS "executionStartedAt"
      FROM follower_growth_daily_approvals
     WHERE tenant_id = ${tenantId}
       AND approval_date = CURRENT_DATE
       AND status = 'approved'
       AND execution_status = 'running'
       AND execution_evidence_id IS NULL
       AND execution_started_at IS NOT NULL
     ORDER BY execution_started_at ASC
  `);

  const linked: Array<{ approvalId: string; evidenceType: "publication" | "campaign"; evidenceId: string }> = [];
  const ambiguous: string[] = [];

  for (const raw of approvals.rows ?? []) {
    const item = raw as { id: string; actionType: "content" | "replicate" | "paid"; executionStartedAt: string | Date };
    if (item.actionType === "paid") {
      const candidates = await db.execute(sql`
        SELECT id, nome
          FROM campaigns
         WHERE tenant_id = ${tenantId}
           AND created_at >= ${item.executionStartedAt}
         ORDER BY created_at ASC
         LIMIT 2
      `);
      if ((candidates.rows?.length ?? 0) === 1) {
        const candidate = candidates.rows![0] as { id: string; nome?: string | null };
        const result = await linkFollowerGrowthExecutionEvidence({
          tenantId,
          approvalId: item.id,
          evidenceType: "campaign",
          evidenceId: candidate.id,
          label: candidate.nome ?? "Campanha criada a partir da execução",
        });
        if (result.linked) linked.push({ approvalId: item.id, evidenceType: "campaign", evidenceId: candidate.id });
      } else if ((candidates.rows?.length ?? 0) > 1) {
        ambiguous.push(item.id);
      }
      continue;
    }

    const candidates = await db.execute(sql`
      SELECT id, provider, status
        FROM social_publications
       WHERE tenant_id = ${tenantId}
         AND created_at >= ${item.executionStartedAt}
       ORDER BY created_at ASC
       LIMIT 2
    `);
    if ((candidates.rows?.length ?? 0) === 1) {
      const candidate = candidates.rows![0] as { id: string; provider?: string | null; status?: string | null };
      const result = await linkFollowerGrowthExecutionEvidence({
        tenantId,
        approvalId: item.id,
        evidenceType: "publication",
        evidenceId: candidate.id,
        label: `${candidate.provider ?? "social"} · ${candidate.status ?? "criada"}`,
      });
      if (result.linked) linked.push({ approvalId: item.id, evidenceType: "publication", evidenceId: candidate.id });
    } else if ((candidates.rows?.length ?? 0) > 1) {
      ambiguous.push(item.id);
    }
  }

  return res.json({ linked, ambiguous, checked: approvals.rows?.length ?? 0 });
});

export default router;
