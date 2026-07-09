import { Router } from "express";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger";

// ─── Types ────────────────────────────────────────────────────────────────────
type SpecObjectStatus =
  | "draft"
  | "identified"
  | "specified"
  | "priced"
  | "approved"
  | "sent-to-budget"
  | "archived";

interface SpecObjectPayload {
  projectId: string;
  ambienteId?: string | null;
  cenaId?: string | null;
  renderId?: string | null;
  sourceObjectId?: string | null;
  name: string;
  description?: string | null;
  category?: string | null;
  region?: string | null;
  quantity?: number;
  unit?: string;
  catalogProductId?: string | null;
  catalogMaterialId?: string | null;
  manufacturerId?: string | null;
  supplierId?: string | null;
  productName?: string | null;
  materialName?: string | null;
  manufacturerName?: string | null;
  supplierName?: string | null;
  materialValue?: number;
  laborValue?: number;
  notes?: string | null;
  status?: SpecObjectStatus;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function totalValue(payload: Partial<SpecObjectPayload>) {
  const quantity = Number(payload.quantity ?? 1);
  const material = Number(payload.materialValue ?? 0);
  const labor = Number(payload.laborValue ?? 0);
  return quantity * (material + labor);
}

function tenantId(req: any): string | null {
  return req?.user?.tenantId ?? req?.tenantId ?? null;
}

// ─── Service ──────────────────────────────────────────────────────────────────
async function listSpecObjects(params: {
  tenantId?: string | null;
  projectId: string;
  renderId?: string;
}) {
  const values: unknown[] = [params.projectId];
  let sql = `SELECT * FROM arch_spec_objects WHERE project_id = $1`;

  if (params.tenantId) {
    values.push(params.tenantId);
    sql += ` AND tenant_id = $${values.length}`;
  }
  if (params.renderId) {
    values.push(params.renderId);
    sql += ` AND render_id = $${values.length}`;
  }
  sql += ` ORDER BY created_at DESC`;

  const result = await pool.query(sql, values);
  return result.rows;
}

async function createSpecObject(tId: string | null, payload: SpecObjectPayload) {
  const id = crypto.randomUUID();
  const now = new Date();

  const result = await pool.query(
    `INSERT INTO arch_spec_objects (
      id, tenant_id, project_id, ambiente_id, cena_id, render_id, source_object_id,
      name, description, category, region, quantity, unit,
      catalog_product_id, catalog_material_id, manufacturer_id, supplier_id,
      product_name, material_name, manufacturer_name, supplier_name,
      material_value, labor_value, total_value, notes, status, created_at, updated_at
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,
      $8,$9,$10,$11,$12,$13,
      $14,$15,$16,$17,
      $18,$19,$20,$21,
      $22,$23,$24,$25,$26,$27,$28
    ) RETURNING *`,
    [
      id,
      tId,
      payload.projectId,
      payload.ambienteId ?? null,
      payload.cenaId ?? null,
      payload.renderId ?? null,
      payload.sourceObjectId ?? null,
      payload.name,
      payload.description ?? null,
      payload.category ?? null,
      payload.region ?? null,
      Number(payload.quantity ?? 1),
      payload.unit ?? "un",
      payload.catalogProductId ?? null,
      payload.catalogMaterialId ?? null,
      payload.manufacturerId ?? null,
      payload.supplierId ?? null,
      payload.productName ?? null,
      payload.materialName ?? null,
      payload.manufacturerName ?? null,
      payload.supplierName ?? null,
      Number(payload.materialValue ?? 0),
      Number(payload.laborValue ?? 0),
      totalValue(payload),
      payload.notes ?? null,
      payload.status ?? "draft",
      now,
      now,
    ],
  );
  return result.rows[0];
}

async function updateSpecObject(
  id: string,
  tId: string | null,
  payload: Partial<SpecObjectPayload>,
) {
  const allowed: Record<string, string> = {
    name: "name",
    description: "description",
    category: "category",
    region: "region",
    quantity: "quantity",
    unit: "unit",
    catalogProductId: "catalog_product_id",
    catalogMaterialId: "catalog_material_id",
    manufacturerId: "manufacturer_id",
    supplierId: "supplier_id",
    productName: "product_name",
    materialName: "material_name",
    manufacturerName: "manufacturer_name",
    supplierName: "supplier_name",
    materialValue: "material_value",
    laborValue: "labor_value",
    notes: "notes",
    status: "status",
  };

  const sets: string[] = [];
  const values: unknown[] = [];

  for (const [key, column] of Object.entries(allowed)) {
    if ((payload as Record<string, unknown>)[key] === undefined) continue;
    values.push((payload as Record<string, unknown>)[key]);
    sets.push(`${column} = $${values.length}`);
  }

  if (sets.length === 0) return null;

  values.push(totalValue(payload));
  sets.push(`total_value = $${values.length}`);
  values.push(new Date());
  sets.push(`updated_at = $${values.length}`);

  values.push(id);
  let where = `id = $${values.length}`;

  if (tId) {
    values.push(tId);
    where += ` AND tenant_id = $${values.length}`;
  }

  const result = await pool.query(
    `UPDATE arch_spec_objects SET ${sets.join(", ")} WHERE ${where} RETURNING *`,
    values,
  );
  return result.rows[0] ?? null;
}

async function createSpecObjectsFromRender(
  tId: string | null,
  payload: {
    projectId: string;
    ambienteId?: string | null;
    cenaId?: string | null;
    renderId: string;
  },
) {
  const defaults: SpecObjectPayload[] = [
    {
      projectId: payload.projectId,
      ambienteId: payload.ambienteId ?? null,
      cenaId: payload.cenaId ?? null,
      renderId: payload.renderId,
      name: "Objeto identificado no render",
      category: "a especificar",
      region: "render aprovado",
      quantity: 1,
      unit: "un",
      materialValue: 0,
      laborValue: 0,
      status: "identified",
      notes: "Criado a partir do render aprovado. Especificar produto, material e fornecedor.",
    },
  ];

  const rows = [];
  for (const item of defaults) {
    rows.push(await createSpecObject(tId, item));
  }
  return rows;
}

// ─── Router ───────────────────────────────────────────────────────────────────
const archSpecObjectsRouter = Router();

archSpecObjectsRouter.get("/arch/spec-objects", async (req, res, next) => {
  try {
    const projectId = String(req.query["projectId"] ?? "");
    if (!projectId) {
      res.status(400).json({ error: "projectId é obrigatório" });
      return;
    }
    const renderId = req.query["renderId"] ? String(req.query["renderId"]) : undefined;
    const items = await listSpecObjects({ tenantId: tenantId(req), projectId, renderId });
    res.json({ items, total: items.length });
  } catch (err) {
    logger.error({ err }, "arch/spec-objects GET error");
    next(err);
  }
});

archSpecObjectsRouter.post("/arch/spec-objects", async (req, res, next) => {
  try {
    const item = await createSpecObject(tenantId(req), req.body as SpecObjectPayload);
    res.status(201).json({ item });
  } catch (err) {
    logger.error({ err }, "arch/spec-objects POST error");
    next(err);
  }
});

archSpecObjectsRouter.post("/arch/spec-objects/bulk-from-render", async (req, res, next) => {
  try {
    const body = req.body as { projectId: string; ambienteId?: string; cenaId?: string; renderId: string };
    if (!body.projectId || !body.renderId) {
      res.status(400).json({ error: "projectId e renderId são obrigatórios" });
      return;
    }
    const items = await createSpecObjectsFromRender(tenantId(req), body);
    res.status(201).json({ items, total: items.length });
  } catch (err) {
    logger.error({ err }, "arch/spec-objects/bulk-from-render error");
    next(err);
  }
});

archSpecObjectsRouter.patch("/arch/spec-objects/:id", async (req, res, next) => {
  try {
    const item = await updateSpecObject(
      req.params["id"]!,
      tenantId(req),
      req.body as Partial<SpecObjectPayload>,
    );
    if (!item) {
      res.status(404).json({ error: "SpecObject não encontrado" });
      return;
    }
    res.json({ item });
  } catch (err) {
    logger.error({ err }, "arch/spec-objects PATCH error");
    next(err);
  }
});

archSpecObjectsRouter.post("/arch/spec-objects/:id/send-to-budget", async (req, res, next) => {
  try {
    const item = await updateSpecObject(req.params["id"]!, tenantId(req), {
      status: "sent-to-budget",
    });
    res.json({ ok: true, specObjectId: item?.id ?? req.params["id"], budgetItemId: null });
  } catch (err) {
    logger.error({ err }, "arch/spec-objects/send-to-budget error");
    next(err);
  }
});

export default archSpecObjectsRouter;
