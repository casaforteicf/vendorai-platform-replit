import { Router } from "express";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger";
import { calculateEngineeringQuote } from "../lib/arqdor-engineering-engine.js";

// ─── Types ────────────────────────────────────────────────────────────────────
type BudgetStatus = "draft" | "in-review" | "sent" | "approved" | "rejected" | "archived";

interface BudgetPayload {
  projectId: string;
  ambienteId?: string | null;
  renderId?: string | null;
  title: string;
  clientName?: string | null;
  status?: BudgetStatus;
  discountType?: "percent" | "fixed";
  discountValue?: number;
  saleTotal?: number | null;
  saleSource?: "manual" | "proposal" | "imported" | "calculated";
  notes?: string | null;
  clientNotes?: string | null;
  internalNotes?: string | null;
}

interface BudgetItemPayload {
  budgetId: string;
  specObjectId?: string | null;
  projectId: string;
  ambienteId?: string | null;
  renderId?: string | null;
  item: string;
  description?: string | null;
  type?: string;
  quantity: number;
  unit: string;
  materialValue: number;
  laborValue: number;
  supplierName?: string | null;
  manufacturerName?: string | null;
  productName?: string | null;
  materialName?: string | null;
  catalogCode?: string | null;
  compositionId?: string | null;
  compositionCode?: string | null;
  visibleToClient?: boolean;
  sortOrder?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function itemTotals(payload: Partial<BudgetItemPayload>) {
  const quantity = Number(payload.quantity ?? 1);
  const materialValue = Number(payload.materialValue ?? 0);
  const laborValue = Number(payload.laborValue ?? 0);
  return {
    unitTotal: materialValue + laborValue,
    totalMaterial: quantity * materialValue,
    totalLabor: quantity * laborValue,
    total: quantity * (materialValue + laborValue),
  };
}

function tenantId(req: any): string | null {
  return req?.user?.tenantId ?? req?.tenantId ?? null;
}

// ─── Service ──────────────────────────────────────────────────────────────────
async function recalculateBudget(budgetId: string) {
  const budgetOwner = await pool.query(
    `SELECT tenant_id FROM arch_budgets WHERE id = $1 LIMIT 1`,
    [budgetId],
  );
  const tenant = budgetOwner.rows[0]?.tenant_id ?? null;

  if (tenant) {
    await pool.query(
      `WITH composition_costs AS (
         SELECT
           c.id,
           c.codigo,
           c.tenant_id,
           COALESCE(SUM(CASE WHEN i.tipo = 'mao_de_obra' THEN 0 ELSE ci.quantidade::numeric * COALESCE(i.preco_unitario::numeric, 0) END), 0) AS material_value,
           COALESCE(SUM(CASE WHEN i.tipo = 'mao_de_obra' THEN ci.quantidade::numeric * COALESCE(i.preco_unitario::numeric, 0) ELSE 0 END), 0) AS labor_value
         FROM composicoes c
         LEFT JOIN composicao_insumos ci ON ci.composicao_id = c.id
         LEFT JOIN insumos i ON i.id = ci.insumo_id
        WHERE c.tenant_id::text = $2::text
          AND c.ativo = true
        GROUP BY c.id, c.codigo, c.tenant_id
       )
       UPDATE arch_budget_items abi
          SET composition_id = COALESCE(abi.composition_id, cc.id),
              material_value = cc.material_value,
              labor_value = cc.labor_value,
              unit_total = cc.material_value + cc.labor_value,
              total_material = abi.quantity::numeric * cc.material_value,
              total_labor = abi.quantity::numeric * cc.labor_value,
              total = abi.quantity::numeric * (cc.material_value + cc.labor_value),
              updated_at = now()
         FROM composition_costs cc
        WHERE abi.budget_id = $1
          AND abi.tenant_id::text = $2::text
          AND abi.deleted_at IS NULL
          AND (
            (abi.composition_id IS NOT NULL AND abi.composition_id = cc.id)
            OR
            (abi.composition_id IS NULL AND abi.composition_code IS NOT NULL AND lower(abi.composition_code) = lower(cc.codigo))
          )`,
      [budgetId, tenant],
    );
  }

  const itemsResult = await pool.query(
    `SELECT * FROM arch_budget_items WHERE budget_id = $1 AND deleted_at IS NULL`,
    [budgetId],
  );

  const subtotalMaterial = itemsResult.rows.reduce((s: number, r: any) => s + Number(r.total_material ?? 0), 0);
  const subtotalLabor = itemsResult.rows.reduce((s: number, r: any) => s + Number(r.total_labor ?? 0), 0);
  const subtotal = subtotalMaterial + subtotalLabor;

  const budgetResult = await pool.query(`SELECT * FROM arch_budgets WHERE id = $1`, [budgetId]);
  const budget = budgetResult.rows[0];

  const discountValue = Number(budget?.discount_value ?? 0);
  const discountTotal = budget?.discount_type === "percent"
    ? subtotal * (discountValue / 100)
    : discountValue;
  const grandTotal = Math.max(0, subtotal - discountTotal);

  const saleTotal = budget?.sale_total == null ? null : Number(budget.sale_total);
  const updated = await pool.query(
    `UPDATE arch_budgets
     SET subtotal_material = $2, subtotal_labor = $3, subtotal = $4,
         discount_total = $5, grand_total = $6, updated_at = now()
     WHERE id = $1 RETURNING *`,
    [budgetId, subtotalMaterial, subtotalLabor, subtotal, discountTotal, grandTotal],
  );

  if (saleTotal != null && saleTotal >= 0) {
    await pool.query(
      `UPDATE arch_budget_items
          SET sale_total = CASE
            WHEN $2::numeric > 0 THEN ROUND(($3::numeric * total::numeric / $2::numeric), 2)
            ELSE 0
          END,
          updated_at = now()
        WHERE budget_id = $1 AND deleted_at IS NULL`,
      [budgetId, subtotal, saleTotal],
    );
  } else {
    await pool.query(
      `UPDATE arch_budget_items SET sale_total = NULL, updated_at = now()
        WHERE budget_id = $1 AND deleted_at IS NULL`,
      [budgetId],
    );
  }

  const refreshedItems = await pool.query(
    `SELECT * FROM arch_budget_items WHERE budget_id = $1 AND deleted_at IS NULL ORDER BY sort_order, created_at`,
    [budgetId],
  );

  return {
    budget: updated.rows[0],
    items: refreshedItems.rows,
    totals: { subtotalMaterial, subtotalLabor, subtotal, discountTotal, grandTotal },
  };
}

async function getBudgetByProject(params: { tenantId?: string | null; projectId: string }) {
  const values: unknown[] = [params.projectId];
  let where = `project_id = $1 AND deleted_at IS NULL`;
  if (params.tenantId) {
    values.push(params.tenantId);
    where += ` AND tenant_id = $${values.length}`;
  }

  const result = await pool.query(
    `SELECT * FROM arch_budgets WHERE ${where} ORDER BY created_at DESC LIMIT 1`,
    values,
  );

  const budget = result.rows[0] ?? null;
  if (!budget) {
    return { budget: null, items: [], totals: { subtotalMaterial: 0, subtotalLabor: 0, subtotal: 0, discountTotal: 0, grandTotal: 0 } };
  }

  return recalculateBudget(budget.id);
}

async function createBudget(tId: string | null, payload: BudgetPayload) {
  const id = crypto.randomUUID();

  const result = await pool.query(
    `INSERT INTO arch_budgets (
      id, tenant_id, project_id, ambiente_id, render_id,
      title, client_name, status, version,
      discount_type, discount_value, discount_total,
      subtotal_material, subtotal_labor, subtotal, grand_total,
      sale_total, sale_source,
      notes, client_notes, internal_notes, created_at, updated_at
    ) VALUES (
      $1,$2,$3,$4,$5,
      $6,$7,$8,$9,
      $10,$11,0,
      0,0,0,0,
      $12,$13,
      $14,$15,$16,now(),now()
    ) RETURNING *`,
    [
      id, tId, payload.projectId, payload.ambienteId ?? null, payload.renderId ?? null,
      payload.title, payload.clientName ?? null, payload.status ?? "draft", 1,
      payload.discountType ?? "fixed", Number(payload.discountValue ?? 0),
      payload.saleTotal == null ? null : Number(payload.saleTotal), payload.saleSource ?? "manual",
      payload.notes ?? null, payload.clientNotes ?? null, payload.internalNotes ?? null,
    ],
  );

  return { budget: result.rows[0], items: [], totals: { subtotalMaterial: 0, subtotalLabor: 0, subtotal: 0, discountTotal: 0, grandTotal: 0 } };
}

async function updateBudget(id: string, tId: string | null, payload: Partial<BudgetPayload>) {
  const allowed: Record<string, string> = {
    title: "title", clientName: "client_name", status: "status",
    discountType: "discount_type", discountValue: "discount_value",
    saleTotal: "sale_total", saleSource: "sale_source",
    notes: "notes", clientNotes: "client_notes", internalNotes: "internal_notes",
  };

  const sets: string[] = [];
  const values: unknown[] = [];

  for (const [key, col] of Object.entries(allowed)) {
    if ((payload as Record<string, unknown>)[key] === undefined) continue;
    values.push((payload as Record<string, unknown>)[key]);
    sets.push(`${col} = $${values.length}`);
  }

  if (sets.length === 0) return null;

  values.push(new Date());
  sets.push(`updated_at = $${values.length}`);
  values.push(id);
  let where = `id = $${values.length}`;
  if (tId) {
    values.push(tId);
    where += ` AND tenant_id = $${values.length}`;
  }

  const result = await pool.query(
    `UPDATE arch_budgets SET ${sets.join(", ")} WHERE ${where} RETURNING *`,
    values,
  );

  if (!result.rows[0]) return null;
  return recalculateBudget(result.rows[0].id);
}

async function createBudgetItem(tId: string | null, payload: BudgetItemPayload) {
  const t = itemTotals(payload);
  const id = crypto.randomUUID();

  const result = await pool.query(
    `INSERT INTO arch_budget_items (
      id, tenant_id, budget_id, spec_object_id, project_id, ambiente_id, render_id,
      item, description, type, quantity, unit,
      material_value, labor_value, unit_total, total_material, total_labor, total,
      supplier_name, manufacturer_name, product_name, material_name, catalog_code,
      composition_id, composition_code,
      visible_to_client, sort_order, created_at, updated_at
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,
      $8,$9,$10,$11,$12,
      $13,$14,$15,$16,$17,$18,
      $19,$20,$21,$22,$23,
      $24,$25,
      $26,$27,now(),now()
    ) RETURNING *`,
    [
      id, tId, payload.budgetId, payload.specObjectId ?? null, payload.projectId,
      payload.ambienteId ?? null, payload.renderId ?? null,
      payload.item, payload.description ?? null, payload.type ?? "product",
      Number(payload.quantity ?? 1), payload.unit ?? "un",
      Number(payload.materialValue ?? 0), Number(payload.laborValue ?? 0),
      t.unitTotal, t.totalMaterial, t.totalLabor, t.total,
      payload.supplierName ?? null, payload.manufacturerName ?? null,
      payload.productName ?? null, payload.materialName ?? null, payload.catalogCode ?? null,
      payload.compositionId ?? null, payload.compositionCode ?? null,
      payload.visibleToClient ?? true, Number(payload.sortOrder ?? 0),
    ],
  );

  await recalculateBudget(payload.budgetId);
  return result.rows[0];
}

async function updateBudgetItem(id: string, tId: string | null, payload: Partial<BudgetItemPayload>) {
  const currentValues: unknown[] = [id];
  let currentWhere = `id = $1`;
  if (tId) {
    currentValues.push(tId);
    currentWhere += ` AND tenant_id = $2`;
  }
  const currentResult = await pool.query(`SELECT * FROM arch_budget_items WHERE ${currentWhere}`, currentValues);
  const current = currentResult.rows[0];
  if (!current) return null;

  const merged = {
    quantity: payload.quantity ?? Number(current.quantity),
    materialValue: payload.materialValue ?? Number(current.material_value),
    laborValue: payload.laborValue ?? Number(current.labor_value),
  };
  const t = itemTotals(merged);

  const allowed: Record<string, string> = {
    item: "item", description: "description", type: "type",
    quantity: "quantity", unit: "unit",
    materialValue: "material_value", laborValue: "labor_value",
    supplierName: "supplier_name", manufacturerName: "manufacturer_name",
    productName: "product_name", materialName: "material_name", catalogCode: "catalog_code",
    compositionId: "composition_id", compositionCode: "composition_code",
    visibleToClient: "visible_to_client", sortOrder: "sort_order",
  };

  const sets: string[] = [];
  const values: unknown[] = [];

  for (const [key, col] of Object.entries(allowed)) {
    if ((payload as Record<string, unknown>)[key] === undefined) continue;
    values.push((payload as Record<string, unknown>)[key]);
    sets.push(`${col} = $${values.length}`);
  }

  values.push(t.unitTotal); sets.push(`unit_total = $${values.length}`);
  values.push(t.totalMaterial); sets.push(`total_material = $${values.length}`);
  values.push(t.totalLabor); sets.push(`total_labor = $${values.length}`);
  values.push(t.total); sets.push(`total = $${values.length}`);
  values.push(new Date()); sets.push(`updated_at = $${values.length}`);
  values.push(id);
  let where = `id = $${values.length}`;
  if (tId) {
    values.push(tId);
    where += ` AND tenant_id = $${values.length}`;
  }

  const result = await pool.query(
    `UPDATE arch_budget_items SET ${sets.join(", ")} WHERE ${where} RETURNING *`,
    values,
  );

  await recalculateBudget(current.budget_id);
  return result.rows[0] ?? null;
}

async function deleteBudgetItem(id: string, tId: string | null) {
  const values: unknown[] = [id];
  let where = `id = $1`;
  if (tId) {
    values.push(tId);
    where += ` AND tenant_id = $2`;
  }

  const currentResult = await pool.query(`SELECT * FROM arch_budget_items WHERE ${where}`, values);
  const current = currentResult.rows[0];
  if (!current) return false;

  await pool.query(`UPDATE arch_budget_items SET deleted_at = now() WHERE ${where}`, values);
  await recalculateBudget(current.budget_id);
  return true;
}

async function createBudgetFromSpecObjects(tId: string | null, payload: {
  projectId: string;
  ambienteId?: string | null;
  renderId?: string | null;
  title: string;
  clientName?: string | null;
  specObjectIds?: string[];
}) {
  const created = await createBudget(tId, {
    projectId: payload.projectId,
    ambienteId: payload.ambienteId ?? null,
    renderId: payload.renderId ?? null,
    title: payload.title,
    clientName: payload.clientName ?? null,
    status: "draft",
    discountType: "fixed",
    discountValue: 0,
  });

  const budget = created.budget;
  const values: unknown[] = [payload.projectId];
  let where = `project_id = $1 AND status != 'archived'`;
  if (tId) {
    values.push(tId);
    where += ` AND tenant_id = $${values.length}`;
  }
  if (payload.specObjectIds?.length) {
    values.push(payload.specObjectIds);
    where += ` AND id = ANY($${values.length})`;
  }

  const specResult = await pool.query(
    `SELECT * FROM arch_spec_objects WHERE ${where} ORDER BY created_at ASC`,
    values,
  );

  for (const spec of specResult.rows) {
    await createBudgetItem(tId, {
      budgetId: budget.id,
      specObjectId: spec.id,
      projectId: spec.project_id,
      ambienteId: spec.ambiente_id,
      renderId: spec.render_id,
      item: spec.name,
      description: spec.description,
      type: "product",
      quantity: Number(spec.quantity ?? 1),
      unit: spec.unit ?? "un",
      materialValue: Number(spec.material_value ?? 0),
      laborValue: Number(spec.labor_value ?? 0),
      supplierName: spec.supplier_name,
      manufacturerName: spec.manufacturer_name,
      productName: spec.product_name,
      materialName: spec.material_name,
      catalogCode: spec.catalog_code,
      visibleToClient: true,
      sortOrder: 0,
    });
  }

  return recalculateBudget(budget.id);
}

async function calculateParametricEngineeringQuote(tId: string | null, payload: {
  configurationId: string;
  request: Record<string, unknown>;
  projectId?: string | null;
  budgetId?: string | null;
}) {
  const cfgValues: unknown[] = [payload.configurationId];
  let tenantClause = "";
  if (tId) {
    cfgValues.push(tId);
    tenantClause = ` AND (s.scope = 'universal' OR s.tenant_id::text = ${cfgValues.length}::text)`;
  }

  const configResult = await pool.query(
    `SELECT c.*, s.manufacturer, s.line, s.material, s.version AS system_version
       FROM arqdor_engineering_configurations c
       JOIN arqdor_engineering_systems s ON s.id = c.system_id
      WHERE c.id = $1
        AND c.is_active = true
        AND s.is_active = true
        ${tenantClause}
      LIMIT 1`,
    cfgValues,
  );

  const row = configResult.rows[0];
  if (!row) return null;

  const componentResult = await pool.query(
    `SELECT
        ec.*,
        cc.required,
        cc.sequence,
        cc.quantity_rule,
        cc.dimension_rule,
        cc.condition_rule,
        cc.cutting_rule,
        cc.waste_rule,
        cc.metadata AS link_metadata
       FROM arqdor_engineering_configuration_components cc
       JOIN arqdor_engineering_components ec ON ec.id = cc.component_id
      WHERE cc.configuration_id = $1
        AND ec.is_active = true
      ORDER BY cc.sequence, ec.code`,
    [payload.configurationId],
  );

  const performanceResult = await pool.query(
    `SELECT *
       FROM arqdor_engineering_performance_tests
      WHERE configuration_id = $1
      ORDER BY test_type, created_at`,
    [payload.configurationId],
  );

  const configuration = {
    id: row.id,
    code: row.code,
    name: row.name,
    productKind: row.product_kind,
    openingType: row.opening_type,
    leafCount: row.leaf_count == null ? null : Number(row.leaf_count),
    minWidthMm: row.min_width_mm == null ? null : Number(row.min_width_mm),
    maxWidthMm: row.max_width_mm == null ? null : Number(row.max_width_mm),
    minHeightMm: row.min_height_mm == null ? null : Number(row.min_height_mm),
    maxHeightMm: row.max_height_mm == null ? null : Number(row.max_height_mm),
    maxLeafWeightKg: row.max_leaf_weight_kg == null ? null : Number(row.max_leaf_weight_kg),
    allowedGlassThicknessMm: Array.isArray(row.allowed_glass_thickness_mm)
      ? row.allowed_glass_thickness_mm.map(Number).filter(Number.isFinite)
      : [],
    installationRules: row.installation_rules ?? {},
  };

  const components = componentResult.rows.map((item: any) => ({
    code: item.code,
    name: item.name,
    group: item.group,
    role: item.role,
    unit: item.unit,
    required: item.required,
    commercialLengthMm: item.commercial_length_mm == null ? null : Number(item.commercial_length_mm),
    costValue: item.cost_value == null ? null : Number(item.cost_value),
    saleValue: item.sale_value == null ? null : Number(item.sale_value),
    pricingBasis: item.pricing_basis,
    quantityRule: item.quantity_rule ?? undefined,
    dimensionRule: item.dimension_rule ?? undefined,
    conditionRule: item.condition_rule ?? undefined,
    wasteRule: item.waste_rule ?? undefined,
    metadata: { ...(item.metadata ?? {}), ...(item.link_metadata ?? {}) },
  }));

  const performanceEvidence = performanceResult.rows.map((item: any) => ({
    id: item.id,
    reportNumber: item.report_number,
    testType: item.test_type,
    acousticDb: item.acoustic_db == null ? null : Number(item.acoustic_db),
    watertightnessPa: item.watertightness_pa == null ? null : Number(item.watertightness_pa),
    windPressurePa: item.wind_pressure_pa == null ? null : Number(item.wind_pressure_pa),
    airPermeability: item.air_permeability == null ? null : Number(item.air_permeability),
    conditions: {
      ...(item.conditions ?? {}),
      measuredDeflectionMm: item.measured_deflection_mm == null ? undefined : Number(item.measured_deflection_mm),
      allowedDeflectionMm: item.allowed_deflection_mm == null ? undefined : Number(item.allowed_deflection_mm),
      sourceFile: item.source_file ?? undefined,
    },
  }));

  const result = calculateEngineeringQuote({
    configuration,
    components,
    performanceEvidence,
    request: payload.request as any,
  });

  if (tId && (payload.projectId || payload.budgetId)) {
    await pool.query(
      `INSERT INTO arqdor_engineering_quote_snapshots (
         id, tenant_id, project_id, budget_id, configuration_id, engine_version,
         input, resolved_bom, validation, cost_summary, price_summary, created_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6,
         $7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,now()
       )`,
      [
        crypto.randomUUID(),
        tId,
        payload.projectId ?? null,
        payload.budgetId ?? null,
        payload.configurationId,
        `engineering-v1/system-${row.system_version ?? 1}`,
        JSON.stringify(payload.request ?? {}),
        JSON.stringify(result.bom),
        JSON.stringify({ valid: result.valid, validations: result.validations, evidence: result.evidence }),
        JSON.stringify({ cost: result.totals.cost }),
        JSON.stringify({ sale: result.totals.sale }),
      ],
    );
  }

  return {
    ...result,
    configuration: {
      ...configuration,
      manufacturer: row.manufacturer,
      line: row.line,
      material: row.material,
      systemVersion: Number(row.system_version ?? 1),
    },
  };
}

// ─── Router ───────────────────────────────────────────────────────────────────
const archBudgetEngineRouter = Router();

archBudgetEngineRouter.post("/arch/orcamento/engineering/quote", async (req, res, next) => {
  try {
    const configurationId = String(req.body?.configurationId ?? "");
    if (!configurationId) {
      res.status(400).json({ error: "configurationId é obrigatório" });
      return;
    }
    const result = await calculateParametricEngineeringQuote(tenantId(req), {
      configurationId,
      request: req.body?.request ?? {},
      projectId: req.body?.projectId ?? null,
      budgetId: req.body?.budgetId ?? null,
    });
    if (!result) {
      res.status(404).json({ error: "Configuração de engenharia não encontrada ou sem acesso" });
      return;
    }
    res.json(result);
  } catch (err) {
    logger.error({ err }, "arch/orcamento/engineering/quote error");
    next(err);
  }
});

archBudgetEngineRouter.get("/arch/orcamento", async (req, res, next) => {
  try {
    const projectId = String(req.query["projectId"] ?? "");
    if (!projectId) { res.status(400).json({ error: "projectId é obrigatório" }); return; }
    const result = await getBudgetByProject({ tenantId: tenantId(req), projectId });
    res.json(result);
  } catch (err) {
    logger.error({ err }, "arch/orcamento GET error");
    next(err);
  }
});

archBudgetEngineRouter.post("/arch/orcamento", async (req, res, next) => {
  try {
    const result = await createBudget(tenantId(req), req.body as BudgetPayload);
    res.status(201).json(result);
  } catch (err) {
    logger.error({ err }, "arch/orcamento POST error");
    next(err);
  }
});

archBudgetEngineRouter.post("/arch/orcamento/from-spec-objects", async (req, res, next) => {
  try {
    const result = await createBudgetFromSpecObjects(tenantId(req), req.body);
    res.status(201).json(result);
  } catch (err) {
    logger.error({ err }, "arch/orcamento/from-spec-objects error");
    next(err);
  }
});

archBudgetEngineRouter.patch("/arch/orcamento/budget/:id", async (req, res, next) => {
  try {
    const result = await updateBudget(req.params["id"]!, tenantId(req), req.body as Partial<BudgetPayload>);
    if (!result) { res.status(404).json({ error: "Orçamento não encontrado" }); return; }
    res.json(result);
  } catch (err) {
    logger.error({ err }, "arch/orcamento PATCH error");
    next(err);
  }
});

archBudgetEngineRouter.post("/arch/orcamento/:id/items", async (req, res, next) => {
  try {
    const item = await createBudgetItem(tenantId(req), {
      ...req.body,
      budgetId: req.params["id"]!,
    } as BudgetItemPayload);
    res.status(201).json({ item });
  } catch (err) {
    logger.error({ err }, "arch/orcamento/:id/items POST error");
    next(err);
  }
});

archBudgetEngineRouter.patch("/arch/orcamento/items/:id", async (req, res, next) => {
  try {
    const item = await updateBudgetItem(req.params["id"]!, tenantId(req), req.body as Partial<BudgetItemPayload>);
    if (!item) { res.status(404).json({ error: "Item não encontrado" }); return; }
    res.json({ item });
  } catch (err) {
    logger.error({ err }, "arch/orcamento/items PATCH error");
    next(err);
  }
});

archBudgetEngineRouter.delete("/arch/orcamento/items/:id", async (req, res, next) => {
  try {
    const ok = await deleteBudgetItem(req.params["id"]!, tenantId(req));
    res.json({ ok });
  } catch (err) {
    logger.error({ err }, "arch/orcamento/items DELETE error");
    next(err);
  }
});

export default archBudgetEngineRouter;
