import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import {
  db,
  customerIntelligenceTable,
  insertCustomerIntelligenceSchema,
  updateCustomerIntelligenceSchema,
} from "@workspace/db";

const router: IRouter = Router();

function isPgCode(err: unknown, code: string): boolean {
  if (typeof err !== "object" || err === null) return false;
  if ("code" in err && (err as { code: string }).code === code) return true;
  if ("cause" in err) return isPgCode((err as { cause: unknown }).cause, code);
  return false;
}

function isUniqueViolation(err: unknown): boolean {
  return isPgCode(err, "23505");
}

router.post("/customer-intelligence", async (req, res) => {
  const parsed = insertCustomerIntelligenceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  try {
    const [record] = await db
      .insert(customerIntelligenceTable)
      .values(parsed.data)
      .returning();
    res.status(201).json(record);
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "A customer intelligence record already exists for this lead" });
      return;
    }
    throw err;
  }
});

router.get("/tenants/:tenantId/customer-intelligence", async (req, res) => {
  const records = await db
    .select()
    .from(customerIntelligenceTable)
    .where(eq(customerIntelligenceTable.tenantId, String(req.params.tenantId)))
    .orderBy(customerIntelligenceTable.createdAt);

  res.json(records);
});

router.get(
  "/tenants/:tenantId/leads/:leadId/intelligence",
  async (req, res) => {
    const { tenantId, leadId } = req.params;

    const [existing] = await db
      .select()
      .from(customerIntelligenceTable)
      .where(
        and(
          eq(customerIntelligenceTable.tenantId, String(tenantId)),
          eq(customerIntelligenceTable.leadId, String(leadId))
        )
      );

    if (existing) {
      res.json(existing);
      return;
    }

    const [created] = await db
      .insert(customerIntelligenceTable)
      .values({ tenantId: String(tenantId), leadId: String(leadId) })
      .returning();

    res.status(201).json(created);
  }
);

router.get("/customer-intelligence/:id", async (req, res) => {
  const [record] = await db
    .select()
    .from(customerIntelligenceTable)
    .where(eq(customerIntelligenceTable.id, String(req.params.id)));

  if (!record) {
    res.status(404).json({ error: "Customer intelligence record not found" });
    return;
  }

  res.json(record);
});

router.patch("/customer-intelligence/:id", async (req, res) => {
  const parsed = updateCustomerIntelligenceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [record] = await db
    .update(customerIntelligenceTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(customerIntelligenceTable.id, String(req.params.id)))
    .returning();

  if (!record) {
    res.status(404).json({ error: "Customer intelligence record not found" });
    return;
  }

  res.json(record);
});

router.delete("/customer-intelligence/:id", async (req, res) => {
  const [deleted] = await db
    .delete(customerIntelligenceTable)
    .where(eq(customerIntelligenceTable.id, String(req.params.id)))
    .returning({ id: customerIntelligenceTable.id });

  if (!deleted) {
    res.status(404).json({ error: "Customer intelligence record not found" });
    return;
  }

  res.status(204).send();
});

export default router;
