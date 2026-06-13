import { Router, IRouter } from "express";
import {
  db,
  rulesTable,
  insertRuleSchema,
  updateRuleSchema,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";

type RuleTrigger =
  | "lead_criado"
  | "churn_risk_alto"
  | "proposta_enviada"
  | "agendamento_proximo"
  | "sem_atividade_x_dias"
  | "deal_ganho"
  | "deal_perdido";

const router: IRouter = Router();

// POST /rules
router.post("/rules", async (req, res) => {
  const parsed = insertRuleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: "Validation error", details: parsed.error.issues });
    return;
  }
  const [row] = await db.insert(rulesTable).values(parsed.data).returning();
  res.status(201).json(row);
});

// GET /tenants/:tenantId/rules  ?trigger=  ?ativo=
router.get("/tenants/:tenantId/rules", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const { trigger, ativo } = req.query as Record<string, string | undefined>;

  const conditions = [eq(rulesTable.tenantId, tenantId)];

  if (trigger) {
    const valid = [
      "lead_criado", "churn_risk_alto", "proposta_enviada",
      "agendamento_proximo", "sem_atividade_x_dias", "deal_ganho", "deal_perdido",
    ];
    if (!valid.includes(trigger)) {
      res.status(422).json({ error: "Invalid trigger value" });
      return;
    }
    conditions.push(eq(rulesTable.trigger, trigger as RuleTrigger));
  }

  if (ativo !== undefined) {
    conditions.push(eq(rulesTable.ativo, ativo === "true"));
  }

  const rows = await db
    .select()
    .from(rulesTable)
    .where(and(...conditions))
    .orderBy(rulesTable.createdAt);

  res.json(rows);
});

// GET /rules/:id
router.get("/rules/:id", async (req, res) => {
  const id = String(req.params.id);
  const [row] = await db.select().from(rulesTable).where(eq(rulesTable.id, id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

// PATCH /rules/:id
router.patch("/rules/:id", async (req, res) => {
  const id = String(req.params.id);
  const parsed = updateRuleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: "Validation error", details: parsed.error.issues });
    return;
  }
  const [row] = await db
    .update(rulesTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(rulesTable.id, id))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

// DELETE /rules/:id
router.delete("/rules/:id", async (req, res) => {
  const id = String(req.params.id);
  const [row] = await db.delete(rulesTable).where(eq(rulesTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.status(204).send();
});

export default router;
