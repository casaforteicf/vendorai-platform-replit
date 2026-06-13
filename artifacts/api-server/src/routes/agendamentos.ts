import { Router, type IRouter } from "express";
import { and, eq, gte, lte, lt, gt } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  agendamentosTable,
  insertAgendamentoSchema,
  updateAgendamentoSchema,
} from "@workspace/db";

const router: IRouter = Router();

router.post("/agendamentos", async (req, res) => {
  const parsed = insertAgendamentoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const { dataHoraInicio, dataHoraFim } = parsed.data;
  if (dataHoraFim <= dataHoraInicio) {
    res
      .status(422)
      .json({ error: "dataHoraFim must be after dataHoraInicio" });
    return;
  }

  const [agendamento] = await db
    .insert(agendamentosTable)
    .values(parsed.data)
    .returning();
  res.status(201).json(agendamento);
});

router.get("/tenants/:tenantId/agendamentos", async (req, res) => {
  const { leadId, status, from, to } = req.query as Record<
    string,
    string | undefined
  >;

  const conditions = [
    eq(agendamentosTable.tenantId, String(req.params.tenantId)),
  ];

  if (leadId) conditions.push(eq(agendamentosTable.leadId, leadId));
  if (status)
    conditions.push(
      eq(agendamentosTable.status, status as typeof agendamentosTable.status._.data)
    );
  if (from) conditions.push(gte(agendamentosTable.dataHoraInicio, new Date(from)));
  if (to) conditions.push(lte(agendamentosTable.dataHoraInicio, new Date(to)));

  const agendamentos = await db
    .select()
    .from(agendamentosTable)
    .where(and(...conditions))
    .orderBy(agendamentosTable.dataHoraInicio);

  res.json(agendamentos);
});

const disponibilidadeQuerySchema = z.object({
  responsavelId: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
});

router.get(
  "/tenants/:tenantId/agendamentos/disponibilidade",
  async (req, res) => {
    const parsed = disponibilidadeQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(422).json({
        error:
          "Query params required: responsavelId, from (ISO date), to (ISO date)",
      });
      return;
    }

    const { responsavelId, from, to } = parsed.data;
    const fromDate = new Date(from);
    const toDate = new Date(to);

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      res.status(422).json({ error: "Invalid date format for from or to" });
      return;
    }

    if (toDate <= fromDate) {
      res.status(422).json({ error: "to must be after from" });
      return;
    }

    const conflitos = await db
      .select()
      .from(agendamentosTable)
      .where(
        and(
          eq(agendamentosTable.tenantId, String(req.params.tenantId)),
          eq(agendamentosTable.responsavelId, responsavelId),
          lt(agendamentosTable.dataHoraInicio, toDate),
          gt(agendamentosTable.dataHoraFim, fromDate)
        )
      )
      .orderBy(agendamentosTable.dataHoraInicio);

    res.json({
      disponivel: conflitos.length === 0,
      conflitos,
    });
  }
);

router.get("/agendamentos/:id", async (req, res) => {
  const [agendamento] = await db
    .select()
    .from(agendamentosTable)
    .where(eq(agendamentosTable.id, String(req.params.id)));

  if (!agendamento) {
    res.status(404).json({ error: "Agendamento not found" });
    return;
  }

  res.json(agendamento);
});

router.patch("/agendamentos/:id", async (req, res) => {
  const parsed = updateAgendamentoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const data = parsed.data;
  if (
    data.dataHoraInicio &&
    data.dataHoraFim &&
    data.dataHoraFim <= data.dataHoraInicio
  ) {
    res
      .status(422)
      .json({ error: "dataHoraFim must be after dataHoraInicio" });
    return;
  }

  const [agendamento] = await db
    .update(agendamentosTable)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(agendamentosTable.id, String(req.params.id)))
    .returning();

  if (!agendamento) {
    res.status(404).json({ error: "Agendamento not found" });
    return;
  }

  res.json(agendamento);
});

router.delete("/agendamentos/:id", async (req, res) => {
  const [deleted] = await db
    .delete(agendamentosTable)
    .where(eq(agendamentosTable.id, String(req.params.id)))
    .returning({ id: agendamentosTable.id });

  if (!deleted) {
    res.status(404).json({ error: "Agendamento not found" });
    return;
  }

  res.status(204).send();
});

export default router;
