import { Router, type IRouter } from "express";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { adCampaignsTable, db, socialPublicationsTable } from "@workspace/db";

const router: IRouter = Router();

function canAccess(req: any, tenantId: string) {
  return req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId;
}

const evidenceSchema = z.object({
  evidenceType: z.enum(["social_publication", "campaign"]),
  evidenceId: z.string().min(1),
});

router.post("/tenants/:tenantId/follower-growth/approvals/:id/evidence", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const id = String(req.params.id);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const parsed = evidenceSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  let label = "";
  if (parsed.data.evidenceType === "social_publication") {
    const [publication] = await db.select({ id: socialPublicationsTable.id, provider: socialPublicationsTable.provider, status: socialPublicationsTable.status })
      .from(socialPublicationsTable)
      .where(and(eq(socialPublicationsTable.id, parsed.data.evidenceId), eq(socialPublicationsTable.tenantId, tenantId)))
      .limit(1);
    if (!publication) return res.status(404).json({ error: "Publicação não encontrada neste tenant." });
    label = `${publication.provider} · ${publication.status}`;
  } else {
    const [campaign] = await db.select({ id: adCampaignsTable.id, nome: adCampaignsTable.nome, status: adCampaignsTable.status, plataforma: adCampaignsTable.plataforma })
      .from(adCampaignsTable)
      .where(and(eq(adCampaignsTable.id, parsed.data.evidenceId), eq(adCampaignsTable.tenantId, tenantId)))
      .limit(1);
    if (!campaign) return res.status(404).json({ error: "Campanha não encontrada neste tenant." });
    label = `${campaign.nome || campaign.plataforma} · ${campaign.status}`;
  }

  const updated = await db.execute(sql`
    UPDATE follower_growth_daily_approvals
       SET execution_evidence_type = ${parsed.data.evidenceType},
           execution_evidence_id = ${parsed.data.evidenceId},
           execution_evidence_label = ${label},
           execution_evidence_at = now(),
           updated_at = now()
     WHERE tenant_id = ${tenantId} AND approval_date = CURRENT_DATE AND id = ${id} AND status = 'approved'
     RETURNING id
  `);
  if (!updated.rows?.length) return res.status(409).json({ error: "A ação precisa estar aprovada antes de receber evidência." });
  return res.json({ ok: true, evidenceType: parsed.data.evidenceType, evidenceId: parsed.data.evidenceId, evidenceLabel: label });
});

export default router;
