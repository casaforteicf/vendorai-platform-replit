import { Router } from "express";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger";

// ─── Types ────────────────────────────────────────────────────────────────────
interface WorkOrderPayload {
  projectId: string;
  proposalId?: string | null;
  proposalItemId?: string | null;
  budgetItemId?: string | null;
  specObjectId?: string | null;
  title: string;
  description?: string | null;
  type?: string;
  priority?: string;
  status?: string;
  item?: string | null;
  quantity?: number;
  unit?: string;
  materialName?: string | null;
  productName?: string | null;
  supplierName?: string | null;
  manufacturerName?: string | null;
  plannedStart?: string | null;
  plannedEnd?: string | null;
  actualStart?: string | null;
  actualEnd?: string | null;
  estimatedCost?: number;
  actualCost?: number;
  notes?: string | null;
}

interface SupplierOrderPayload {
  projectId: string;
  workOrderId?: string | null;
  supplierName: string;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  item: string;
  quantity?: number;
  unit?: string;
  estimatedValue?: number;
  confirmedValue?: number;
  status?: string;
  expectedDelivery?: string | null;
  deliveredAt?: string | null;
  notes?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function tenantId(req: any): string | null {
  return req?.user?.tenantId ?? req?.tenantId ?? null;
}

async function addEvent(
  projectId: string,
  workOrderId: string | null,
  type: string,
  message: string,
  actorType = "system",
  metadata: Record<string, unknown> = {},
) {
  await pool.query(
    `INSERT INTO arch_execution_events (id, project_id, work_order_id, type, message, actor_type, metadata, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,now())`,
    [crypto.randomUUID(), projectId, workOrderId, type, message, actorType, JSON.stringify(metadata)],
  );
}

// ─── Service ──────────────────────────────────────────────────────────────────
async function getProductionBundle(params: { tenantId?: string | null; projectId: string }) {
  const values: unknown[] = [params.projectId];
  const tenantClause = params.tenantId ? ` AND tenant_id = $${(values.push(params.tenantId), values.length)}` : "";

  const [wo, so, it, qc, ev] = await Promise.all([
    pool.query(`SELECT * FROM arch_work_orders WHERE project_id = $1${tenantClause} AND deleted_at IS NULL ORDER BY created_at DESC`, values),
    pool.query(`SELECT * FROM arch_supplier_orders WHERE project_id = $1${tenantClause} AND deleted_at IS NULL ORDER BY created_at DESC`, values),
    pool.query(`SELECT * FROM arch_installation_tasks WHERE project_id = $1${tenantClause} ORDER BY scheduled_date ASC NULLS LAST`, values),
    pool.query(`SELECT * FROM arch_quality_checks WHERE project_id = $1${tenantClause} ORDER BY created_at DESC`, values),
    pool.query(`SELECT * FROM arch_execution_events WHERE project_id = $1 ORDER BY created_at DESC LIMIT 80`, [params.projectId]),
  ]);

  return {
    workOrders: wo.rows,
    supplierOrders: so.rows,
    installationTasks: it.rows,
    qualityChecks: qc.rows,
    events: ev.rows,
  };
}

async function createWorkOrder(tId: string | null, payload: WorkOrderPayload) {
  const id = crypto.randomUUID();

  const result = await pool.query(
    `INSERT INTO arch_work_orders (
      id, tenant_id, project_id, proposal_id, proposal_item_id, budget_item_id, spec_object_id,
      title, description, type, priority, status,
      item, quantity, unit, material_name, product_name, supplier_name, manufacturer_name,
      planned_start, planned_end, estimated_cost, actual_cost, notes, created_at, updated_at
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,
      $8,$9,$10,$11,$12,
      $13,$14,$15,$16,$17,$18,$19,
      $20,$21,$22,$23,$24,now(),now()
    ) RETURNING *`,
    [
      id, tId, payload.projectId,
      payload.proposalId ?? null, payload.proposalItemId ?? null,
      payload.budgetItemId ?? null, payload.specObjectId ?? null,
      payload.title, payload.description ?? null,
      payload.type ?? "production", payload.priority ?? "medium", payload.status ?? "planned",
      payload.item ?? null,
      Number(payload.quantity ?? 1), payload.unit ?? "un",
      payload.materialName ?? null, payload.productName ?? null,
      payload.supplierName ?? null, payload.manufacturerName ?? null,
      payload.plannedStart ?? null, payload.plannedEnd ?? null,
      Number(payload.estimatedCost ?? 0), Number(payload.actualCost ?? 0),
      payload.notes ?? null,
    ],
  );

  await addEvent(payload.projectId, id, "created", "Ordem de execução criada.", "internal", { title: payload.title });
  return result.rows[0];
}

async function updateWorkOrder(id: string, tId: string | null, payload: Partial<WorkOrderPayload>) {
  const currentResult = await pool.query(`SELECT * FROM arch_work_orders WHERE id = $1`, [id]);
  const current = currentResult.rows[0];
  if (!current) return null;

  const allowed: Record<string, string> = {
    title: "title", description: "description", type: "type", priority: "priority", status: "status",
    item: "item", quantity: "quantity", unit: "unit",
    materialName: "material_name", productName: "product_name",
    supplierName: "supplier_name", manufacturerName: "manufacturer_name",
    plannedStart: "planned_start", plannedEnd: "planned_end",
    actualStart: "actual_start", actualEnd: "actual_end",
    estimatedCost: "estimated_cost", actualCost: "actual_cost", notes: "notes",
  };

  const sets: string[] = [];
  const values: unknown[] = [];

  for (const [key, col] of Object.entries(allowed)) {
    if ((payload as Record<string, unknown>)[key] === undefined) continue;
    values.push((payload as Record<string, unknown>)[key]);
    sets.push(`${col} = $${values.length}`);
  }

  if (sets.length === 0) return current;

  values.push(new Date()); sets.push(`updated_at = $${values.length}`);
  values.push(id);
  let where = `id = $${values.length}`;
  if (tId) { values.push(tId); where += ` AND tenant_id = $${values.length}`; }

  const result = await pool.query(
    `UPDATE arch_work_orders SET ${sets.join(", ")} WHERE ${where} RETURNING *`,
    values,
  );

  if (payload.status && payload.status !== current.status) {
    await addEvent(current.project_id, id, "status-change", `Status alterado para ${payload.status}.`, "internal", {
      from: current.status, to: payload.status,
    });
  }

  return result.rows[0] ?? null;
}

async function createSupplierOrder(tId: string | null, payload: SupplierOrderPayload) {
  const id = crypto.randomUUID();

  const result = await pool.query(
    `INSERT INTO arch_supplier_orders (
      id, tenant_id, project_id, work_order_id,
      supplier_name, contact_name, contact_phone, contact_email,
      item, quantity, unit, estimated_value, confirmed_value,
      status, requested_at, expected_delivery, notes, created_at, updated_at
    ) VALUES (
      $1,$2,$3,$4,
      $5,$6,$7,$8,
      $9,$10,$11,$12,$13,
      $14,now(),$15,$16,now(),now()
    ) RETURNING *`,
    [
      id, tId, payload.projectId, payload.workOrderId ?? null,
      payload.supplierName, payload.contactName ?? null, payload.contactPhone ?? null, payload.contactEmail ?? null,
      payload.item, Number(payload.quantity ?? 1), payload.unit ?? "un",
      Number(payload.estimatedValue ?? 0), Number(payload.confirmedValue ?? 0),
      payload.status ?? "quote-requested",
      payload.expectedDelivery ?? null, payload.notes ?? null,
    ],
  );

  await addEvent(payload.projectId, payload.workOrderId ?? null, "supplier-request", "Pedido/cotação enviado ao fornecedor.", "internal", {
    supplierName: payload.supplierName, item: payload.item,
  });

  return result.rows[0];
}

async function updateSupplierOrder(id: string, tId: string | null, payload: Partial<SupplierOrderPayload>) {
  const currentResult = await pool.query(`SELECT * FROM arch_supplier_orders WHERE id = $1`, [id]);
  const current = currentResult.rows[0];
  if (!current) return null;

  const allowed: Record<string, string> = {
    supplierName: "supplier_name", contactName: "contact_name", contactPhone: "contact_phone", contactEmail: "contact_email",
    item: "item", quantity: "quantity", unit: "unit",
    estimatedValue: "estimated_value", confirmedValue: "confirmed_value",
    status: "status", expectedDelivery: "expected_delivery", deliveredAt: "delivered_at", notes: "notes",
  };

  const sets: string[] = [];
  const values: unknown[] = [];

  for (const [key, col] of Object.entries(allowed)) {
    if ((payload as Record<string, unknown>)[key] === undefined) continue;
    values.push((payload as Record<string, unknown>)[key]);
    sets.push(`${col} = $${values.length}`);
  }

  if (sets.length === 0) return current;

  values.push(new Date()); sets.push(`updated_at = $${values.length}`);
  values.push(id);
  let where = `id = $${values.length}`;
  if (tId) { values.push(tId); where += ` AND tenant_id = $${values.length}`; }

  const result = await pool.query(
    `UPDATE arch_supplier_orders SET ${sets.join(", ")} WHERE ${where} RETURNING *`,
    values,
  );

  if (payload.status && payload.status !== current.status) {
    await addEvent(current.project_id, current.work_order_id ?? null, "supplier-delivery", `Fornecedor atualizado para ${payload.status}.`, "internal", {
      supplierOrderId: id, from: current.status, to: payload.status,
    });
  }

  return result.rows[0] ?? null;
}

async function createOrdersFromApproval(tId: string | null, payload: {
  projectId: string;
  proposalId: string;
  onlyApprovedItems?: boolean;
}) {
  let where = `proposal_id = $1`;
  if (payload.onlyApprovedItems) where += ` AND approval_status = 'approved'`;

  const proposalItems = await pool.query(
    `SELECT * FROM arch_proposal_items WHERE ${where} ORDER BY sort_order ASC, created_at ASC`,
    [payload.proposalId],
  );

  for (const item of proposalItems.rows) {
    const exists = await pool.query(
      `SELECT id FROM arch_work_orders WHERE proposal_item_id = $1 AND deleted_at IS NULL LIMIT 1`,
      [item.id],
    );
    if (exists.rows[0]) continue;

    await createWorkOrder(tId, {
      projectId: payload.projectId,
      proposalId: payload.proposalId,
      proposalItemId: item.id,
      budgetItemId: item.budget_item_id ?? null,
      specObjectId: item.spec_object_id ?? null,
      title: `Executar: ${item.item}`,
      description: item.description ?? null,
      type: "production",
      priority: "medium",
      status: "planned",
      item: item.item,
      quantity: Number(item.quantity ?? 1),
      unit: item.unit ?? "un",
      estimatedCost: Number(item.total ?? 0),
      actualCost: 0,
      notes: "Criado automaticamente a partir da aprovação do cliente.",
    });
  }

  await addEvent(payload.projectId, null, "created", "Ordens geradas a partir da aprovação do cliente.", "system", { proposalId: payload.proposalId });

  return getProductionBundle({ tenantId: tId, projectId: payload.projectId });
}

// ─── Router ───────────────────────────────────────────────────────────────────
const archProductionProcurementRouter = Router();

archProductionProcurementRouter.get("/arch/producao", async (req, res, next) => {
  try {
    const projectId = String(req.query["projectId"] ?? "");
    if (!projectId) { res.status(400).json({ error: "projectId é obrigatório" }); return; }
    const result = await getProductionBundle({ tenantId: tenantId(req), projectId });
    res.json(result);
  } catch (err) {
    logger.error({ err }, "arch/producao GET error");
    next(err);
  }
});

archProductionProcurementRouter.post("/arch/producao/from-approval", async (req, res, next) => {
  try {
    const result = await createOrdersFromApproval(tenantId(req), req.body);
    res.status(201).json(result);
  } catch (err) {
    logger.error({ err }, "arch/producao/from-approval error");
    next(err);
  }
});

archProductionProcurementRouter.post("/arch/producao/work-orders", async (req, res, next) => {
  try {
    const workOrder = await createWorkOrder(tenantId(req), req.body as WorkOrderPayload);
    res.status(201).json({ workOrder });
  } catch (err) {
    logger.error({ err }, "arch/producao/work-orders POST error");
    next(err);
  }
});

archProductionProcurementRouter.patch("/arch/producao/work-orders/:id", async (req, res, next) => {
  try {
    const workOrder = await updateWorkOrder(req.params["id"]!, tenantId(req), req.body as Partial<WorkOrderPayload>);
    if (!workOrder) { res.status(404).json({ error: "Ordem não encontrada" }); return; }
    res.json({ workOrder });
  } catch (err) {
    logger.error({ err }, "arch/producao/work-orders PATCH error");
    next(err);
  }
});

archProductionProcurementRouter.post("/arch/producao/supplier-orders", async (req, res, next) => {
  try {
    const supplierOrder = await createSupplierOrder(tenantId(req), req.body as SupplierOrderPayload);
    res.status(201).json({ supplierOrder });
  } catch (err) {
    logger.error({ err }, "arch/producao/supplier-orders POST error");
    next(err);
  }
});

archProductionProcurementRouter.patch("/arch/producao/supplier-orders/:id", async (req, res, next) => {
  try {
    const supplierOrder = await updateSupplierOrder(req.params["id"]!, tenantId(req), req.body as Partial<SupplierOrderPayload>);
    if (!supplierOrder) { res.status(404).json({ error: "Pedido de fornecedor não encontrado" }); return; }
    res.json({ supplierOrder });
  } catch (err) {
    logger.error({ err }, "arch/producao/supplier-orders PATCH error");
    next(err);
  }
});

export default archProductionProcurementRouter;
