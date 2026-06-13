import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import {
  db,
  invoicesTable,
  insertInvoiceSchema,
  updateInvoiceSchema,
} from "@workspace/db";

const router: IRouter = Router();

router.post("/invoices", async (req, res) => {
  const parsed = insertInvoiceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [invoice] = await db
    .insert(invoicesTable)
    .values(parsed.data)
    .returning();
  res.status(201).json(invoice);
});

router.get("/tenants/:tenantId/invoices", async (req, res) => {
  const { status } = req.query as Record<string, string | undefined>;

  const conditions = [
    eq(invoicesTable.tenantId, String(req.params.tenantId)),
  ];

  if (status) {
    conditions.push(
      eq(invoicesTable.status, status as typeof invoicesTable.status._.data)
    );
  }

  const invoices = await db
    .select()
    .from(invoicesTable)
    .where(and(...conditions))
    .orderBy(invoicesTable.dataVencimento);

  res.json(invoices);
});

router.get("/invoices/:id", async (req, res) => {
  const [invoice] = await db
    .select()
    .from(invoicesTable)
    .where(eq(invoicesTable.id, String(req.params.id)));

  if (!invoice) {
    res.status(404).json({ error: "Invoice not found" });
    return;
  }

  res.json(invoice);
});

router.patch("/invoices/:id", async (req, res) => {
  const parsed = updateInvoiceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [invoice] = await db
    .update(invoicesTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(invoicesTable.id, String(req.params.id)))
    .returning();

  if (!invoice) {
    res.status(404).json({ error: "Invoice not found" });
    return;
  }

  res.json(invoice);
});

router.delete("/invoices/:id", async (req, res) => {
  const [deleted] = await db
    .delete(invoicesTable)
    .where(eq(invoicesTable.id, String(req.params.id)))
    .returning({ id: invoicesTable.id });

  if (!deleted) {
    res.status(404).json({ error: "Invoice not found" });
    return;
  }

  res.status(204).send();
});

export default router;
