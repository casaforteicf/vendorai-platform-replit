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

async function proposalForBudget(budgetId: string) {
  const result = await pool.query(
    `SELECT id, status, version, grand_total, created_at
       FROM arch_proposals
      WHERE budget_id = $1 AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1`,
    [budgetId],
  );
  return result.rows[0] ?? null;
}

async function cloneBudgetForRevision(source: any, tenantId: string | null) {
  const id = crypto.randomUUID();
  const nextVersion = Number(source.version ?? 1) + 1;
  const inserted = await pool.query(
    `INSERT INTO arch_budgets (
       id, tenant_id, project_id, ambiente_id, render_id,
       title, client_name, status, version,
       discount_type, discount_value, discount_total,
       subtotal_material, subtotal_labor, subtotal, grand_total,
       notes, client_notes, internal_notes, created_at, updated_at
     ) VALUES (
       $1,$2,$3,$4,$5,
       $6,$7,'in-review',$8,
       $9,$10,$11,
       $12,$13,$14,$15,
       $16,$17,$18,now(),now()
     ) RETURNING *`,
    [
      id,
      tenantId ?? source.tenant_id,
      source.project_id,
      source.ambiente_id ?? null,
      source.render_id ?? null,
      `${source.title ?? "Orçamento"} — revisão ${nextVersion}`,
      source.client_name ?? null,
      nextVersion,
      source.discount_type ?? "fixed",
      Number(source.discount_value ?? 0),
      Number(source.discount_total ?? 0),
      Number(source.subtotal_material ?? 0),
      Number(source.subtotal_labor ?? 0),
      Number(source.subtotal ?? 0),
      Number(source.grand_total ?? 0),
      source.notes ?? null,
      source.client_notes ?? null,
      source.internal_notes ?? null,
    ],
  );

  const oldItems = await pool.query(
    `SELECT * FROM arch_budget_items WHERE budget_id = $1 AND deleted_at IS NULL ORDER BY sort_order ASC, created_at ASC`,
    [source.id],
  );

  for (const item of oldItems.rows) {
    await pool.query(
      `INSERT INTO arch_budget_items (
         id, tenant_id, budget_id, spec_object_id, project_id, ambiente_id, render_id,
         item, description, type, quantity, unit,
         material_value, labor_value, unit_total, total_material, total_labor, total,
         supplier_name, manufacturer_name, product_name, material_name,
         visible_to_client, sort_order, created_at, updated_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,
         $8,$9,$10,$11,$12,
         $13,$14,$15,$16,$17,$18,
         $19,$20,$21,$22,
         $23,$24,now(),now()
       )`,
      [
        crypto.randomUUID(), tenantId ?? item.tenant_id, id, item.spec_object_id ?? null,
        item.project_id, item.ambiente_id ?? null, item.render_id ?? null,
        item.item, item.description ?? null, item.type ?? "product",
        Number(item.quantity ?? 1), item.unit ?? "un",
        Number(item.material_value ?? 0), Number(item.labor_value ?? 0),
        Number(item.unit_total ?? 0), Number(item.total_material ?? 0),
        Number(item.total_labor ?? 0), Number(item.total ?? 0),
        item.supplier_name ?? null, item.manufacturer_name ?? null,
        item.product_name ?? null, item.material_name ?? null,
        item.visible_to_client !== false, Number(item.sort_order ?? 0),
      ],
    );
  }

  return inserted.rows[0];
}

async function ensureWorkingBudget(
  tenantId: string | null,
  projectId: string,
  renderId: string | null,
  ambienteId: string | null,
) {
  const values: unknown[] = [projectId];
  let tenantWhere = "";
  if (tenantId) {
    values.push(tenantId);
    tenantWhere = ` AND b.tenant_id = $${values.length}`;
  }

  // Um orçamento pode ser alterado automaticamente somente enquanto ainda não virou
  // snapshot de proposta. Depois disso, trabalhamos em uma nova revisão.
  const mutable = await pool.query(
    `SELECT b.*
       FROM arch_budgets b
      WHERE b.project_id = $1
        ${tenantWhere}
        AND b.deleted_at IS NULL
        AND b.status IN ('draft','in-review')
        AND NOT EXISTS (
          SELECT 1 FROM arch_proposals p
           WHERE p.budget_id = b.id AND p.deleted_at IS NULL
        )
      ORDER BY b.version DESC, b.created_at DESC
      LIMIT 1`,
    values,
  );
  if (mutable.rows[0]) {
    return { budget: mutable.rows[0], created: false, revisionCreated: false, sourceBudget: null, proposalSnapshot: null };
  }

  const sourceValues: unknown[] = [projectId];
  let sourceTenantWhere = "";
  if (tenantId) {
    sourceValues.push(tenantId);
    sourceTenantWhere = ` AND tenant_id = $${sourceValues.length}`;
  }
  const latest = await pool.query(
    `SELECT * FROM arch_budgets
      WHERE project_id = $1 ${sourceTenantWhere} AND deleted_at IS NULL
      ORDER BY version DESC, created_at DESC LIMIT 1`,
    sourceValues,
  );
  const source = latest.rows[0] ?? null;

  if (source) {
    const proposal = await proposalForBudget(source.id);
    // Se o orçamento já foi apresentado em proposta — ou deixou de ser draft/review —
    // preserve o snapshot e abra revisão em vez de alterar o valor anterior.
    if (proposal || !["draft", "in-review"].includes(String(source.status))) {
      const revision = await cloneBudgetForRevision(source, tenantId);
      return {
        budget: revision,
        created: true,
        revisionCreated: true,
        sourceBudget: source,
        proposalSnapshot: proposal,
      };
    }
  }

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
  return { budget: inserted.rows[0], created: true, revisionCreated: false, sourceBudget: null, proposalSnapshot: null };
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

  const ensured = await ensureWorkingBudget(params.tenantId, spec.project_id, spec.render_id ?? null, spec.ambiente_id ?? null);
  const budget = ensured.budget;

  const quantity = Number(spec.quantity ?? 1);
  const materialValue = Number(spec.material_value ?? 0);
  const laborValue = Number(spec.labor_value ?? 0);
  const unitTotal = materialValue + laborValue;
  const totalMaterial = quantity * materialValue;
  const totalLabor = quantity * laborValue;
  const total = totalMaterial + totalLabor;

  const previousItem = ensured.sourceBudget
    ? await pool.query(
        `SELECT id, total FROM arch_budget_items
          WHERE budget_id = $1 AND spec_object_id = $2 AND deleted_at IS NULL LIMIT 1`,
        [ensured.sourceBudget.id, spec.id],
      ).then(result => result.rows[0] ?? null)
    : null;

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
              render_id = $17, ambiente_id = $18, updated_at = now()
        WHERE id = $1 AND budget_id = $2`,
      [
        budgetItemId, budget.id, spec.name, spec.description ?? null,
        quantity, spec.unit ?? "un", materialValue, laborValue, unitTotal,
        totalMaterial, totalLabor, total,
        spec.supplier_name ?? null, spec.manufacturer_name ?? null,
        spec.product_name ?? null, spec.material_name ?? null,
        spec.render_id ?? null, spec.ambiente_id ?? null,
      ],
    );
  } else {
    budgetItemId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO arch_budget_items (
         id, tenant_id, budget_id, spec_object_id, project_id, ambiente_id, render_id,
         item, description, type, quantity, unit,
         material_value, labor_value, unit_total, total_material, total_labor, total,
         supplier_name, manufacturer_name, product_name, material_name,
         visible_to_client, sort_order, created_at, updated_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,
         $8,$9,'product',$10,$11,
         $12,$13,$14,$15,$16,$17,
         $18,$19,$20,$21,
         true,0,now(),now()
       )`,
      [
        budgetItemId, params.tenantId, budget.id, spec.id, spec.project_id,
        spec.ambiente_id ?? null, spec.render_id ?? null,
        spec.name, spec.description ?? null, quantity, spec.unit ?? "un",
        materialValue, laborValue, unitTotal, totalMaterial, totalLabor, total,
        spec.supplier_name ?? null, spec.manufacturer_name ?? null,
        spec.product_name ?? null, spec.material_name ?? null,
      ],
    );
  }

  const totals = await recalculateBudget(budget.id);
  const previousTotal = Number(previousItem?.total ?? 0);
  const financialImpact = ensured.revisionCreated
    ? {
        sourceBudgetId: ensured.sourceBudget?.id ?? null,
        sourceBudgetVersion: Number(ensured.sourceBudget?.version ?? 0),
        proposalId: ensured.proposalSnapshot?.id ?? null,
        proposalStatus: ensured.proposalSnapshot?.status ?? null,
        previousItemTotal: previousTotal,
        revisedItemTotal: total,
        delta: total - previousTotal,
        requiresReview: true,
      }
    : null;

  return {
    budgetId: budget.id,
    budgetItemId,
    budgetCreated: ensured.created,
    revisionCreated: ensured.revisionCreated,
    financialImpact,
    totals,
  };
}
