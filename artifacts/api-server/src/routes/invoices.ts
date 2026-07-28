import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import {
  db,
  invoicesTable,
  insertInvoiceSchema,
  updateInvoiceSchema,
} from "@workspace/db";
import { authenticate } from "../middlewares/auth.js";

const router: IRouter = Router();

router.post("/invoices", authenticate, async (req, res) => {
  const parsed = insertInvoiceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== parsed.data.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const [invoice] = await db
    .insert(invoicesTable)
    .values(parsed.data)
    .returning();
  res.status(201).json(invoice);
});

router.get("/tenants/:tenantId/invoices", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId);

  // BUG DE SEGURANÇA CORRIGIDO: esse endpoint não checava autorização —
  // qualquer usuário autenticado podia passar qualquer tenantId na URL e
  // ver as faturas de outro tenant. Todos os outros handlers deste mesmo
  // arquivo (POST/PATCH/DELETE) já faziam essa checagem corretamente.
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const { status } = req.query as Record<string, string | undefined>;

  const conditions = [
    eq(invoicesTable.tenantId, tenantId),
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

router.get("/invoices/:id", authenticate, async (req, res) => {
  const [invoice] = await db
    .select()
    .from(invoicesTable)
    .where(eq(invoicesTable.id, String(req.params.id)));

  if (!invoice) {
    res.status(404).json({ error: "Invoice not found" });
    return;
  }

  // BUG DE SEGURANÇA CORRIGIDO: mesmo problema do endpoint de lista — sem
  // checagem, qualquer usuário autenticado conseguia buscar fatura de
  // qualquer tenant só sabendo o id.
  if (req.user?.platformRole !== "super_admin" && invoice.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  res.json(invoice);
});

router.patch("/invoices/:id", authenticate, async (req, res) => {
  const parsed = updateInvoiceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select({ id: invoicesTable.id, tenantId: invoicesTable.tenantId })
    .from(invoicesTable)
    .where(eq(invoicesTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Invoice not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const [invoice] = await db
    .update(invoicesTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(invoicesTable.id, existing.id))
    .returning();

  res.json(invoice);
});

router.delete("/invoices/:id", authenticate, async (req, res) => {
  const [existing] = await db
    .select({ id: invoicesTable.id, tenantId: invoicesTable.tenantId })
    .from(invoicesTable)
    .where(eq(invoicesTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Invoice not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  await db.delete(invoicesTable).where(eq(invoicesTable.id, existing.id));

  res.status(204).send();
});

export default router;
