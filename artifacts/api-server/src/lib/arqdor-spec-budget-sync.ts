import { pool } from "@workspace/db";

async function recalculateBudget(budgetId: string) {
  const items = await pool.query(
    `SELECT total_material, total_labor
       FROM arch_budget_items
      WHERE budget_id = $1 AND deleted_at IS NULL`,
    [budgetId],
  );
  const subtotalMaterial = items.rows.reduce((sum: number, row: any) => sum + Number(row.total_material ?? 0), 0);
  const subtotalLabor = items.rows.reduce((sum: number, row: any) => sum + Number(row.total_labor ?? 0), 0);
  const subtotal = subtotalMaterial + subtotalLabor;

  const budgetResult = await pool.query(
    `SELECT discount_type, discount_value FROM arch_budgets WHERE id = $1 LIMIT 1`,
    [budgetId],
  );
  const budget = budgetResult.rows[0];
  const discountValue = Number(budget?.discount_value ?? 0);
  const discountTotal = budget?.discount_type === "percent" ? subtotal * (discountValue / 100) : discountValue;
  const grandTotal = Math.max(0, subtotal - discountTotal);

  await pool.query(
    `UPDATE arch_budgets
        SET subtotal_material = $2,
            subtotal_labor = $3,
            subtotal = $4,
            discount_total = $5,
            grand_total = $6,
            updated_at = now()
      WHERE id = $1`,
    [budgetId, subtotalMaterial, subtotalLabor, subtotal, discountTotal, grandTotal],
  );

  return { subtotalMaterial, subtotalLabor, subtotal, discountTotal, grandTotal };
}

async function ensureDraftBudget(tenantId: string | null, projectId: string, renderId: string | null, ambienteId: string | null) {
  const values: unknown[] = [projectId];
  let where = `project_id = $1 AND deleted_at IS NULL AND status NOT IN ('approved','rejected','archived')`;
  if (tenantId) {
    values.push(tenantId);
    where += ` AND tenant_id = $${values.length}`;
  }

  const existing = await pool.query(
    `SELECT * FROM arch_budgets WHERE ${where} ORDER BY created_at DESC LIMIT 1`,
    values,
  );
  if (existing.rows[0]) return { budget: existing.rows[0], created: false };

  const projectResult = await pool.query(
    `SELECT titulo, cliente_nome FROM arch_projetos WHERE id = $1 LIMIT 1`,
    [projectId],
  );
  const project = projectResult.rows[0];
  const id = crypto.randomUUID();
  const inserted = await pool.query(
    `INSERT INTO arch_budgets (
       id, tenant_id, project_id, ambiente_id, render_id,
       title, client_name, status, version,
       discount_type, discount_value, discount_total,
       subtotal_material, subtotal_labor, subtotal, grand_total,
       created_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,'draft',1,'fixed',0,0,0,0,0,0,now(),now())
     RETURNING *`,
    [
      id,
      tenantId,
      projectId,
      ambienteId,
      renderId,
      project?.titulo ? `Orçamento — ${project.titulo}` : "Orçamento do projeto",
      project?.cliente_nome ?? null,
    ],
  );
  return { budget: inserted.rows[0], created: true };
}

export async function syncSpecObjectToBudget(params: { tenantId: string | null; specObjectId: string }) {
  const values: unknown[] = [params.specObjectId];
  let where = `id = $1 AND status != 'archived'`;
  if (params.tenantId) {
    values.push(params.tenantId);
    where += ` AND tenant_id = $${values.length}`;
  }

  const specResult = await pool.query(`SELECT * FROM arch_spec_objects WHERE ${where} LIMIT 1`, values);
  const spec = specResult.rows[0];
  if (!spec) return null;

  // Always use the SpecObject's persisted tenant as the source of truth.
  // This prevents Super Admin flows (whose session tenant may be null) from
  // creating a cross-tenant/global draft budget for a tenant-owned item.
  const effectiveTenantId = spec.tenant_id ?? params.tenantId ?? null;

  const ensured = await ensureDraftBudget(effectiveTenantId, spec.project_id, spec.render_id ?? null, spec.ambiente_id ?? null);
  const budget = ensured.budget;

  const quantity = Number(spec.quantity ?? 1);
  const materialValue = Number(spec.material_value ?? 0);
  const laborValue = Number(spec.labor_value ?? 0);
  const unitTotal = materialValue + laborValue;
  const totalMaterial = quantity * materialValue;
  const totalLabor = quantity * laborValue;
  const total = totalMaterial + totalLabor;

  const existingItem = await pool.query(
    `SELECT id FROM arch_budget_items
      WHERE budget_id = $1 AND spec_object_id = $2 AND deleted_at IS NULL
      LIMIT 1`,
    [budget.id, spec.id],
  );

  let budgetItemId: string;
  if (existingItem.rows[0]) {
    budgetItemId = existingItem.rows[0].id;
    await pool.query(
      `UPDATE arch_budget_items
          SET item = $3, description = $4, quantity = $5, unit = $6,
              material_value = $7, labor_value = $8, unit_total = $9,
              total_material = $10, total_labor = $11, total = $12,
              supplier_name = $13, manufacturer_name = $14,
              product_name = $15, material_name = $16,
              catalog_code = $17, render_id = $18, ambiente_id = $19,
              specification_outdated = FALSE,
              specification_revision = $20,
              specification_impact = NULL,
              updated_at = now()
        WHERE id = $1 AND budget_id = $2`,
      [
        budgetItemId, budget.id, spec.name, spec.description ?? null,
        quantity, spec.unit ?? "un", materialValue, laborValue, unitTotal,
        totalMaterial, totalLabor, total,
        spec.supplier_name ?? null, spec.manufacturer_name ?? null,
        spec.product_name ?? null, spec.material_name ?? null,
        spec.catalog_code ?? null, spec.render_id ?? null, spec.ambiente_id ?? null,
        spec.project_revision ?? null,
      ],
    );
  } else {
    budgetItemId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO arch_budget_items (
         id, tenant_id, budget_id, spec_object_id, project_id, ambiente_id, render_id,
         item, description, type, quantity, unit,
         material_value, labor_value, unit_total, total_material, total_labor, total,
         supplier_name, manufacturer_name, product_name, material_name, catalog_code,
         specification_outdated, specification_revision, specification_impact,
         visible_to_client, sort_order, created_at, updated_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,
         $8,$9,'product',$10,$11,
         $12,$13,$14,$15,$16,$17,
         $18,$19,$20,$21,$22,
         false,$23,NULL,
         true,0,now(),now()
       )`,
      [
        budgetItemId, effectiveTenantId, budget.id, spec.id, spec.project_id,
        spec.ambiente_id ?? null, spec.render_id ?? null,
        spec.name, spec.description ?? null, quantity, spec.unit ?? "un",
        materialValue, laborValue, unitTotal, totalMaterial, totalLabor, total,
        spec.supplier_name ?? null, spec.manufacturer_name ?? null,
        spec.product_name ?? null, spec.material_name ?? null, spec.catalog_code ?? null,
        spec.project_revision ?? null,
      ],
    );
  }

  const outdatedResult = await pool.query(
    `SELECT EXISTS(
       SELECT 1 FROM arch_budget_items
        WHERE budget_id=$1 AND deleted_at IS NULL AND specification_outdated=TRUE
     ) AS outdated`,
    [budget.id],
  );
  const stillOutdated = Boolean(outdatedResult.rows[0]?.outdated);
  await pool.query(
    `UPDATE arch_budgets
        SET specification_outdated=$2,
            specification_revision=$3,
            updated_at=now()
      WHERE id=$1`,
    [budget.id, stillOutdated, spec.project_revision ?? null],
  );

  const totals = await recalculateBudget(budget.id);
  return { budgetId: budget.id, budgetItemId, budgetCreated: ensured.created, totals, specificationOutdated: stillOutdated };
}
