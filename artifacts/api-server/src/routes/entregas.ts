import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  entregasTable,
  insertEntregaSchema,
  updateEntregaSchema,
} from "@workspace/db";
import { buildUserFunctionFilter } from "../middlewares/auth.js";
import { checkTurnoCapacity, pickNextMotorista } from "../lib/entregas.js";

const router: IRouter = Router();

// GET /tenants/:tenantId/entregas — list, filtered to own entregas for
// userFunction=entrega (motoristas only see their own deliveries).
router.get("/tenants/:tenantId/entregas", async (req, res) => {
  const { status, dealId, from, to } = req.query as Record<string, string | undefined>;

  const conditions = [eq(entregasTable.tenantId, String(req.params.tenantId))];
  conditions.push(...buildUserFunctionFilter(req, entregasTable));

  if (status) conditions.push(eq(entregasTable.status, status as typeof entregasTable.$inferInsert.status));
  if (dealId) conditions.push(eq(entregasTable.dealId, dealId));

  const entregas = await db
    .select()
    .from(entregasTable)
    .where(and(...conditions))
    .orderBy(entregasTable.dataPrevista);

  res.json(entregas.filter((e) => {
    if (from && e.dataPrevista && new Date(e.dataPrevista) < new Date(from)) return false;
    if (to && e.dataPrevista && new Date(e.dataPrevista) > new Date(to)) return false;
    return true;
  }));
});

router.post("/tenants/:tenantId/entregas", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const parsed = insertEntregaSchema.safeParse({ ...req.body, tenantId });
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message, issues: parsed.error.issues });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const data = { ...parsed.data };

  // Auto round-robin: se modo=agendada e sem assignedTo, escolhe motorista.
  if (data.modo === "agendada" && !data.assignedTo && data.dataPrevista && data.periodo) {
    const motoristaId = await pickNextMotorista(tenantId, new Date(data.dataPrevista), data.periodo);
    if (!motoristaId) {
      res.status(409).json({ error: "Nenhum motorista disponível para esse turno" });
      return;
    }
    data.assignedTo = motoristaId;
    data.status = "agendada";
  } else if (data.assignedTo && data.dataPrevista && data.periodo) {
    const capacity = await checkTurnoCapacity(data.assignedTo, new Date(data.dataPrevista), data.periodo);
    if (!capacity.ok) {
      res.status(409).json({ error: capacity.reason });
      return;
    }
  }

  const [entrega] = await db.insert(entregasTable).values(data).returning();
  res.status(201).json(entrega);
});

router.get("/entregas/:id", async (req, res) => {
  const [entrega] = await db
    .select()
    .from(entregasTable)
    .where(eq(entregasTable.id, String(req.params.id)));

  if (!entrega) {
    res.status(404).json({ error: "Entrega not found" });
    return;
  }

  const isAdmin = req.user?.platformRole === "super_admin" || req.user?.platformRole === "tenant_admin";
  const userFn = req.user?.userFunction as string | undefined;
  if (!isAdmin && userFn === "entrega" && entrega.assignedTo !== req.user?.sub) {
    res.status(403).json({ error: "Access denied to this entrega" });
    return;
  }

  res.json(entrega);
});

router.patch("/entregas/:id", async (req, res) => {
  const parsed = updateEntregaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message, issues: parsed.error.issues });
    return;
  }

  const [existing] = await db
    .select()
    .from(entregasTable)
    .where(eq(entregasTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Entrega not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const isAdmin = req.user?.platformRole === "super_admin" || req.user?.platformRole === "tenant_admin";
  const userFn = req.user?.userFunction as string | undefined;
  if (!isAdmin && userFn === "entrega" && existing.assignedTo !== req.user?.sub) {
    res.status(403).json({ error: "Acesso negado: esta entrega pertence a outro motorista" });
    return;
  }

  const data = parsed.data;

  if (data.assignedTo && (data.dataPrevista || existing.dataPrevista) && (data.periodo || existing.periodo)) {
    const dataPrevista = new Date(data.dataPrevista ?? existing.dataPrevista!);
    const periodo = (data.periodo ?? existing.periodo) as "manha" | "tarde";
    if (data.assignedTo !== existing.assignedTo) {
      const capacity = await checkTurnoCapacity(data.assignedTo, dataPrevista, periodo);
      if (!capacity.ok) {
        res.status(409).json({ error: capacity.reason });
        return;
      }
    }
  }

  if (data.status === "entregue" && !data.dataEntregue) {
    data.dataEntregue = new Date();
  }

  const [entrega] = await db
    .update(entregasTable)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(entregasTable.id, existing.id))
    .returning();

  res.json(entrega);
});

export default router;
