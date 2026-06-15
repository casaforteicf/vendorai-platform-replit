import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, dealsTable, insertDealSchema, updateDealSchema, tenantsTable } from "@workspace/db";
import { dispatchVendaWebhook } from "../services/erp-webhook.js";

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

  // ── Webhook de saída: deal ganho = venda realizada ────────────────────────
  if (parsed.data.etapa === "ganho" && existing.etapa !== "ganho") {
    void (async () => {
      try {
        const [tenant] = await db
          .select({ webhookEstoqueUrl: tenantsTable.webhookEstoqueUrl })
          .from(tenantsTable)
          .where(eq(tenantsTable.id, existing.tenantId));

        if (!tenant?.webhookEstoqueUrl) return;

        dispatchVendaWebhook(
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
      } catch (err) {
        req.log.warn({ err }, "erp-webhook: failed to read tenant config");
      }
    })();
  }

  res.json(deal);
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
