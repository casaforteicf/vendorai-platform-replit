import { Router, type IRouter } from "express";
import { and, eq, isNull } from "drizzle-orm";
import {
  db,
  dealsTable,
  insertDealSchema,
  updateDealSchema,
  tenantsTable,
  leadsTable,
  tenantInvitesTable,
} from "@workspace/db";
import { dispatchVendaWebhook } from "../services/erp-webhook.js";
import { buildInviteUrl } from "./invites.js";
import { sendInviteEmail } from "../lib/email.js";

const router: IRouter = Router();

router.post("/deals", async (req, res) => {
  const parsed = insertDealSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== parsed.data.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const [deal] = await db.insert(dealsTable).values(parsed.data).returning();
  res.status(201).json(deal);
});

router.get("/tenants/:tenantId/deals", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const { etapa, funilId, leadId } = req.query as Record<string, string | undefined>;

  const conditions = [eq(dealsTable.tenantId, tenantId)];
  if (etapa) conditions.push(eq(dealsTable.etapa, etapa as typeof dealsTable.etapa._.data));
  if (funilId) conditions.push(eq(dealsTable.funilId, funilId));
  if (leadId) conditions.push(eq(dealsTable.leadId, leadId));

  if (req.user?.platformRole === "tenant_seller") {
    conditions.push(eq(dealsTable.assignedTo, req.user.sub));
  }

  const deals = await db
    .select()
    .from(dealsTable)
    .where(and(...conditions))
    .orderBy(dealsTable.createdAt);

  res.json(deals);
});

router.get("/deals/:id", async (req, res) => {
  const [deal] = await db
    .select()
    .from(dealsTable)
    .where(eq(dealsTable.id, String(req.params.id)));

  if (!deal) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && deal.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  if (req.user?.platformRole === "tenant_seller" && deal.assignedTo !== req.user.sub) {
    res.status(403).json({ error: "Access denied to this deal" });
    return;
  }

  res.json(deal);
});

router.patch("/deals/:id", async (req, res) => {
  const parsed = updateDealSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select({ id: dealsTable.id, tenantId: dealsTable.tenantId, etapa: dealsTable.etapa, assignedTo: dealsTable.assignedTo })
    .from(dealsTable)
    .where(eq(dealsTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  if (req.user?.platformRole === "tenant_seller" && existing.assignedTo !== req.user.sub) {
    res.status(403).json({ error: "Access denied to this deal" });
    return;
  }

  const [deal] = await db
    .update(dealsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(dealsTable.id, existing.id))
    .returning();

  let inviteSent = false;
  let inviteEmail: string | undefined;
  let inviteSkipReason: string | undefined;

  // ── Auto-invite: deal ganho → convite de onboarding para o lead ──────────
  if (parsed.data.etapa === "ganho" && existing.etapa !== "ganho") {
    try {
      const [tenant, lead] = await Promise.all([
        db
          .select({ name: tenantsTable.name, webhookEstoqueUrl: tenantsTable.webhookEstoqueUrl })
          .from(tenantsTable)
          .where(eq(tenantsTable.id, existing.tenantId))
          .then((rows) => rows[0]),
        deal.leadId
          ? db
              .select({ email: leadsTable.email })
              .from(leadsTable)
              .where(eq(leadsTable.id, deal.leadId))
              .then((rows) => rows[0])
          : Promise.resolve(undefined),
      ]);

      if (!lead?.email) {
        inviteSkipReason = "no_email";
        req.log.info({ dealId: deal.id }, "auto-invite skipped: lead has no email");
      } else {
        const email = lead.email;
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        const [existing_invite] = await db
          .select({ id: tenantInvitesTable.id, token: tenantInvitesTable.token })
          .from(tenantInvitesTable)
          .where(
            and(
              eq(tenantInvitesTable.email, email),
              eq(tenantInvitesTable.tenantId, existing.tenantId),
              eq(tenantInvitesTable.role, "tenant_admin"),
              isNull(tenantInvitesTable.usedAt),
            ),
          );

        let invite: { id: string; token: string };
        if (existing_invite) {
          [invite] = await db
            .update(tenantInvitesTable)
            .set({ expiresAt })
            .where(eq(tenantInvitesTable.id, existing_invite.id))
            .returning({ id: tenantInvitesTable.id, token: tenantInvitesTable.token });
        } else {
          [invite] = await db
            .insert(tenantInvitesTable)
            .values({
              tenantId: existing.tenantId,
              email,
              role: "tenant_admin",
              expiresAt,
              createdBy: req.user!.sub,
            })
            .returning({ id: tenantInvitesTable.id, token: tenantInvitesTable.token });
        }

        const inviteUrl = buildInviteUrl(req, invite.token);
        inviteSent = await sendInviteEmail(email, inviteUrl, tenant?.name ?? "");
        inviteEmail = email;
        req.log.info({ dealId: deal.id, inviteId: invite.id, inviteSent }, "auto-invite processed");
      }

      // ── Webhook ERP: venda realizada ──────────────────────────────────────
      if (tenant?.webhookEstoqueUrl) {
        void dispatchVendaWebhook(
          tenant.webhookEstoqueUrl,
          {
            event: "venda_realizada",
            tenantId: existing.tenantId,
            vendaId: deal.id,
            tipo: "deal",
            produtos: [],
            valorTotal: deal.valor ? Number(deal.valor) : null,
            realizadaEm: new Date().toISOString(),
          },
          req.log,
        );
      }
    } catch (err) {
      req.log.warn({ err }, "deal-ganho: auto-invite or webhook failed");
    }
  }

  res.json({ ...deal, inviteSent, inviteEmail, inviteSkipReason });
});

router.delete("/deals/:id", async (req, res) => {
  const [existing] = await db
    .select({ id: dealsTable.id, tenantId: dealsTable.tenantId, assignedTo: dealsTable.assignedTo })
    .from(dealsTable)
    .where(eq(dealsTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  if (req.user?.platformRole === "tenant_seller" && existing.assignedTo !== req.user.sub) {
    res.status(403).json({ error: "Access denied to this deal" });
    return;
  }

  await db.delete(dealsTable).where(eq(dealsTable.id, existing.id));

  res.status(204).send();
});

export default router;
