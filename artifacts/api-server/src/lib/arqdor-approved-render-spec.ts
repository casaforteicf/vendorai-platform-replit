import { pool } from "@workspace/db";

interface RenderChainRow {
  id: string;
  parent_render_id: string | null;
  project_id: string | null;
  ambiente: string | null;
  operation_type: string | null;
  material_id: string | null;
  material_name: string | null;
  selection_metadata: unknown;
  approved_at?: string | Date | null;
  version_tag?: string | null;
  created_at: string | Date;
}

function selectionLabel(metadata: unknown): string | null {
  if (!Array.isArray(metadata)) return null;
  const labels = metadata
    .map((item) => item && typeof item === "object" && "label" in item ? String((item as any).label ?? "").trim() : "")
    .filter(Boolean);
  return labels.length ? [...new Set(labels)].join(", ") : null;
}

function dedupeKey(row: RenderChainRow) {
  return [row.material_id ?? "", row.material_name ?? "", selectionLabel(row.selection_metadata) ?? ""].join("::");
}

export async function syncApprovedRenderSpecifications(params: {
  tenantId: string;
  renderId: string;
}) {
  const { tenantId, renderId } = params;

  const approvedResult = await pool.query(
    `SELECT id, project_id, ambiente, approved_at, version_tag, operation_type
       FROM arch_ai_renders
      WHERE id = $1 AND tenant_id = $2
      LIMIT 1`,
    [renderId, tenantId],
  );
  const approved = approvedResult.rows[0] as RenderChainRow | undefined;
  if (!approved?.project_id) return { created: 0, skipped: 0, reason: "render-sem-projeto" };

  const isApproved = Boolean(approved.approved_at) || approved.version_tag === "aprovado" || approved.operation_type === "approved";
  if (!isApproved) return { created: 0, skipped: 0, reason: "render-nao-aprovado" };

  const chainResult = await pool.query(
    `WITH RECURSIVE render_chain AS (
       SELECT id, parent_render_id, project_id, ambiente, operation_type,
              material_id, material_name, selection_metadata, created_at
         FROM arch_ai_renders
        WHERE id = $1 AND tenant_id = $2
       UNION ALL
       SELECT parent.id, parent.parent_render_id, parent.project_id, parent.ambiente,
              parent.operation_type, parent.material_id, parent.material_name,
              parent.selection_metadata, parent.created_at
         FROM arch_ai_renders parent
         JOIN render_chain child ON child.parent_render_id = parent.id
        WHERE parent.tenant_id = $2
     )
     SELECT * FROM render_chain ORDER BY created_at ASC`,
    [renderId, tenantId],
  );

  const seen = new Set<string>();
  const materialRows = (chainResult.rows as RenderChainRow[])
    .filter((row) => row.operation_type === "material" || row.material_id || row.material_name)
    .filter((row) => {
      if (!row.material_id && !row.material_name) return false;
      const key = dedupeKey(row);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  let created = 0;
  let skipped = 0;

  for (const row of materialRows) {
    const region = selectionLabel(row.selection_metadata);
    const name = row.material_name || "Material especificado";
    const sourceObjectId = row.material_id ? `material:${row.material_id}` : `material-name:${name.toLowerCase()}`;

    const existing = await pool.query(
      `SELECT id FROM arch_spec_objects
        WHERE tenant_id = $1 AND project_id = $2 AND render_id = $3
          AND source_object_id = $4
          AND COALESCE(region, '') = COALESCE($5, '')
          AND status != 'archived'
        LIMIT 1`,
      [tenantId, approved.project_id, renderId, sourceObjectId, region],
    );
    if (existing.rows.length) {
      skipped += 1;
      continue;
    }

    await pool.query(
      `INSERT INTO arch_spec_objects (
        id, tenant_id, project_id, ambiente_id, cena_id, render_id, source_object_id,
        name, description, category, region, quantity, unit,
        catalog_product_id, catalog_material_id, manufacturer_id, supplier_id,
        product_name, material_name, manufacturer_name, supplier_name,
        material_value, labor_value, total_value, notes, status, created_at, updated_at
      ) VALUES (
        $1,$2,$3,$4,null,$5,$6,
        $7,$8,$9,$10,1,'un',
        null,$11,null,null,
        null,$12,null,null,
        0,0,0,$13,'identified',now(),now()
      )`,
      [
        crypto.randomUUID(),
        tenantId,
        approved.project_id,
        approved.ambiente ?? null,
        renderId,
        sourceObjectId,
        name,
        `Material aplicado e preservado no histórico da versão aprovada ${renderId}.`,
        "material",
        region,
        row.material_id ?? null,
        row.material_name ?? null,
        "Gerado automaticamente a partir de metadados persistidos do render aprovado. Completar quantidade, produto/fornecedor e valores antes do orçamento.",
      ],
    );
    created += 1;
  }

  return {
    created,
    skipped,
    totalMaterialDecisions: materialRows.length,
    reason: materialRows.length ? null : "sem-material-estruturado",
  };
}
