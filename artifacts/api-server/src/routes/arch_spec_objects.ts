import { Router } from "express";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger";
import { syncSpecObjectToBudget } from "../lib/arqdor-spec-budget-sync.js";

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
  sourceType?: string | null;
  projectRevision?: string | null;
  name: string;
  description?: string | null;
  category?: string | null;
  region?: string | null;
  quantity?: number;
  unit?: string;
  quantitySource?: string | null;
  widthMm?: number | null;
  heightMm?: number | null;
  depthMm?: number | null;
  lengthMm?: number | null;
  areaM2?: number | null;
  perimeterM?: number | null;
  volumeM3?: number | null;
  measurementSource?: string | null;
  measurementRevision?: string | null;
  wasteFactor?: number | null;
  purchaseQuantity?: number | null;
  packageYield?: number | null;
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

function totalValue(payload: Partial<SpecObjectPayload>) {
  const quantity = Number(payload.quantity ?? 1);
  const material = Number(payload.materialValue ?? 0);
  const labor = Number(payload.laborValue ?? 0);
  return quantity * (material + labor);
}

function tenantId(req: any): string | null {
  return req?.user?.tenantId ?? req?.tenantId ?? null;
}

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
      source_type, project_revision,
      name, description, category, region, quantity, unit, quantity_source,
      width_mm, height_mm, depth_mm, length_mm, area_m2, perimeter_m, volume_m3,
      measurement_source, measurement_revision, waste_factor, purchase_quantity, package_yield,
      catalog_product_id, catalog_material_id, manufacturer_id, supplier_id,
      product_name, material_name, manufacturer_name, supplier_name,
      material_value, labor_value, total_value, notes, status, created_at, updated_at
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,
      $10,$11,$12,$13,$14,$15,$16,
      $17,$18,$19,$20,$21,$22,$23,
      $24,$25,$26,$27,$28,
      $29,$30,$31,$32,$33,$34,$35,$36,
      $37,$38,$39,$40,$41,$42,$43
    ) RETURNING *`,
    [
      id, tId, payload.projectId, payload.ambienteId ?? null, payload.cenaId ?? null, payload.renderId ?? null,
      payload.sourceObjectId ?? null, payload.sourceType ?? "manual", payload.projectRevision ?? null,
      payload.name, payload.description ?? null, payload.category ?? null, payload.region ?? null,
      Number(payload.quantity ?? 1), payload.unit ?? "un", payload.quantitySource ?? "pending",
      payload.widthMm ?? null, payload.heightMm ?? null, payload.depthMm ?? null, payload.lengthMm ?? null,
      payload.areaM2 ?? null, payload.perimeterM ?? null, payload.volumeM3 ?? null,
      payload.measurementSource ?? "pending", payload.measurementRevision ?? null,
      Number(payload.wasteFactor ?? 0), payload.purchaseQuantity ?? null, payload.packageYield ?? null,
      payload.catalogProductId ?? null, payload.catalogMaterialId ?? null, payload.manufacturerId ?? null,
      payload.supplierId ?? null, payload.productName ?? null, payload.materialName ?? null,
      payload.manufacturerName ?? null, payload.supplierName ?? null,
      Number(payload.materialValue ?? 0), Number(payload.laborValue ?? 0), totalValue(payload),
      payload.notes ?? null, payload.status ?? "draft", now, now,
    ],
  );
  return result.rows[0];
}

async function updateSpecObject(id: string, tId: string | null, payload: Partial<SpecObjectPayload>) {
  const currentValues: unknown[] = [id];
  let currentWhere = `id = $1`;
  if (tId) {
    currentValues.push(tId);
    currentWhere += ` AND tenant_id = $2`;
  }
  const currentResult = await pool.query(`SELECT * FROM arch_spec_objects WHERE ${currentWhere} LIMIT 1`, currentValues);
  const current = currentResult.rows[0];
  if (!current) return null;

  const allowed: Record<string, string> = {
    sourceObjectId: "source_object_id",
    sourceType: "source_type",
    projectRevision: "project_revision",
    name: "name",
    description: "description",
    category: "category",
    region: "region",
    quantity: "quantity",
    unit: "unit",
    quantitySource: "quantity_source",
    widthMm: "width_mm",
    heightMm: "height_mm",
    depthMm: "depth_mm",
    lengthMm: "length_mm",
    areaM2: "area_m2",
    perimeterM: "perimeter_m",
    volumeM3: "volume_m3",
    measurementSource: "measurement_source",
    measurementRevision: "measurement_revision",
    wasteFactor: "waste_factor",
    purchaseQuantity: "purchase_quantity",
    packageYield: "package_yield",
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

  if (sets.length === 0) return current;

  const mergedTotals = totalValue({
    quantity: payload.quantity ?? Number(current.quantity ?? 1),
    materialValue: payload.materialValue ?? Number(current.material_value ?? 0),
    laborValue: payload.laborValue ?? Number(current.labor_value ?? 0),
  });
  values.push(mergedTotals);
  sets.push(`total_value = $${values.length}`);
  values.push(new Date());
  sets.push(`updated_at = $${values.length}`);

  values.push(id);
  let where = `id = $${values.length}`;
  if (tId) {
    values.push(tId);
    where += ` AND tenant_id = $${values.length}`;
  }

  const result = await pool.query(`UPDATE arch_spec_objects SET ${sets.join(", ")} WHERE ${where} RETURNING *`, values);
  return result.rows[0] ?? null;
}

async function createSpecObjectsFromRender(
  tId: string | null,
  payload: { projectId: string; ambienteId?: string | null; cenaId?: string | null; renderId: string },
) {
  const defaults: SpecObjectPayload[] = [{
    projectId: payload.projectId,
    ambienteId: payload.ambienteId ?? null,
    cenaId: payload.cenaId ?? null,
    renderId: payload.renderId,
    sourceType: "render",
    measurementSource: "pending",
    quantitySource: "pending",
    name: "Objeto identificado no render",
    category: "a especificar",
    region: "render aprovado",
    quantity: 1,
    unit: "un",
    materialValue: 0,
    laborValue: 0,
    status: "identified",
    notes: "Criado a partir do render aprovado. Medidas devem vir do projeto ou ser confirmadas antes de uso técnico.",
  }];

  const rows = [];
  for (const item of defaults) rows.push(await createSpecObject(tId, item));
  return rows;
}

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
    const tId = tenantId(req);
    const item = await updateSpecObject(req.params["id"]!, tId, req.body as Partial<SpecObjectPayload>);
    if (!item) {
      res.status(404).json({ error: "SpecObject não encontrado" });
      return;
    }
    const budgetSync = item.status === "sent-to-budget"
      ? await syncSpecObjectToBudget({ tenantId: tId, specObjectId: item.id })
      : null;
    res.json({ item, budgetSync });
  } catch (err) {
    logger.error({ err }, "arch/spec-objects PATCH error");
    next(err);
  }
});

archSpecObjectsRouter.post("/arch/spec-objects/:id/send-to-budget", async (req, res, next) => {
  try {
    const tId = tenantId(req);
    const item = await updateSpecObject(req.params["id"]!, tId, { status: "sent-to-budget" });
    if (!item) {
      res.status(404).json({ error: "SpecObject não encontrado" });
      return;
    }
    const budgetSync = await syncSpecObjectToBudget({ tenantId: tId, specObjectId: item.id });
    if (!budgetSync) {
      res.status(404).json({ error: "Não foi possível sincronizar a especificação com o orçamento" });
      return;
    }
    res.json({ ok: true, specObjectId: item.id, ...budgetSync });
  } catch (err) {
    logger.error({ err }, "arch/spec-objects/send-to-budget error");
    next(err);
  }
});

export default archSpecObjectsRouter;
