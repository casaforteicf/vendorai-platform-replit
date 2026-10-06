import { Router } from "express";
import { createHash } from "node:crypto";
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
  revisionImpact?: string | null;
  geometryHash?: string | null;
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
    revisionImpact: "revision_impact",
    geometryHash: "geometry_hash",
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


type ProjectSpecElement = {
  sourceObjectId: string;
  name: string;
  description?: string | null;
  category: string;
  region?: string | null;
  quantity: number;
  unit: string;
  widthMm?: number | null;
  heightMm?: number | null;
  depthMm?: number | null;
  lengthMm?: number | null;
  areaM2?: number | null;
  perimeterM?: number | null;
  volumeM3?: number | null;
  catalogProductId?: string | null;
  materialName?: string | null;
  supplierName?: string | null;
};

function round(value: number, decimals = 4) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function elementHash(element: ProjectSpecElement) {
  return createHash("sha256")
    .update(JSON.stringify({
      sourceObjectId: element.sourceObjectId,
      quantity: element.quantity,
      unit: element.unit,
      widthMm: element.widthMm ?? null,
      heightMm: element.heightMm ?? null,
      depthMm: element.depthMm ?? null,
      lengthMm: element.lengthMm ?? null,
      areaM2: element.areaM2 ?? null,
      perimeterM: element.perimeterM ?? null,
      volumeM3: element.volumeM3 ?? null,
    }))
    .digest("hex");
}

function buildProjectElements(concept: any): { revision: string; elements: ProjectSpecElement[] } {
  const configuration = concept?.configuration || {};
  const master = configuration?.projectMaster || null;
  const revision = String(configuration?.revisionNumber ?? master?.version ?? 1);
  const rooms = Array.isArray(master?.rooms) ? master.rooms : Array.isArray(concept?.rooms) ? concept.rooms : [];
  const walls = Array.isArray(master?.customWalls) ? master.customWalls : Array.isArray(configuration?.customWalls) ? configuration.customWalls : [];
  const openings = Array.isArray(master?.customOpenings) ? master.customOpenings : Array.isArray(configuration?.customOpenings) ? configuration.customOpenings : [];
  const objects = Array.isArray(master?.objects) ? master.objects : Array.isArray(configuration?.objects) ? configuration.objects : [];
  const wallMaterials = master?.wallMaterials || configuration?.wallMaterials || {};
  const wallHeightM = Number(configuration?.wallHeight ?? master?.wallHeight ?? 2.8);
  const openingAreaByWall = new Map<string, number>();
  for (const opening of openings) {
    const wallId = String(opening?.wallId || "");
    if (!wallId) continue;
    const width = Number(opening?.width || 0);
    const height = Number(opening?.height || 0);
    const area = width > 0 && height > 0 ? width * height : 0;
    openingAreaByWall.set(wallId, (openingAreaByWall.get(wallId) || 0) + area);
  }
  const elements: ProjectSpecElement[] = [];

  for (const room of rooms) {
    const width = Number(room?.width || 0);
    const depth = Number(room?.depth || 0);
    const area = round(width * depth);
    const perimeter = round((width + depth) * 2);
    const region = room?.label || room?.kind || `Pavimento ${Number(room?.floor || 0) + 1}`;

    elements.push({
      sourceObjectId: `room:${room.id}:floor`,
      name: `Piso — ${region}`,
      description: "Superfície de piso originada da geometria do projeto.",
      category: "revestimento",
      region,
      quantity: area,
      unit: "m²",
      widthMm: round(width * 1000, 1),
      depthMm: round(depth * 1000, 1),
      areaM2: area,
      perimeterM: perimeter,
      materialName: room?.floorMaterialId || null,
    });
    elements.push({
      sourceObjectId: `room:${room.id}:ceiling`,
      name: `Forro/Teto — ${region}`,
      description: "Superfície de teto originada da geometria do projeto.",
      category: "forro",
      region,
      quantity: area,
      unit: "m²",
      widthMm: round(width * 1000, 1),
      depthMm: round(depth * 1000, 1),
      areaM2: area,
      perimeterM: perimeter,
    });
  }

  for (const wall of walls) {
    const x1 = Number(wall?.x1 || 0), y1 = Number(wall?.y1 || 0);
    const x2 = Number(wall?.x2 || 0), y2 = Number(wall?.y2 || 0);
    const lengthM = round(Math.hypot(x2 - x1, y2 - y1));
    const grossAreaM2 = round(lengthM * wallHeightM);
    const openingAreaM2 = round(openingAreaByWall.get(String(wall.id)) || 0);
    const netAreaM2 = round(Math.max(0, grossAreaM2 - openingAreaM2));

    elements.push({
      sourceObjectId: `wall:${wall.id}`,
      name: `Parede ${wall.id}`,
      description: "Elemento linear de parede originado da geometria do projeto.",
      category: "parede",
      region: `Pavimento ${Number(wall?.floor || 0) + 1}`,
      quantity: lengthM,
      unit: "m",
      lengthMm: round(lengthM * 1000, 1),
      heightMm: round(wallHeightM * 1000, 1),
      depthMm: wall?.thickness != null ? round(Number(wall.thickness) * 1000, 1) : null,
      areaM2: grossAreaM2,
      materialName: wallMaterials?.[wall.id] || null,
    });

    elements.push({
      sourceObjectId: `surface:${wall.id}:net`,
      name: `Revestimento/Pintura — Parede ${wall.id}`,
      description: openingAreaM2 > 0
        ? `Área líquida da parede: ${grossAreaM2} m² brutos menos ${openingAreaM2} m² de vãos.`
        : `Área líquida da parede sem vãos descontáveis: ${grossAreaM2} m².`,
      category: "superficie_parede",
      region: `Pavimento ${Number(wall?.floor || 0) + 1}`,
      quantity: netAreaM2,
      unit: "m²",
      lengthMm: round(lengthM * 1000, 1),
      heightMm: round(wallHeightM * 1000, 1),
      areaM2: netAreaM2,
      materialName: wallMaterials?.[wall.id] || null,
    });
  }

  for (const opening of openings) {
    const widthM = Number(opening?.width || 0);
    const heightM = Number(opening?.height || 0);
    const type = opening?.type === "door" ? "Porta" : "Janela";
    elements.push({
      sourceObjectId: `opening:${opening.id}`,
      name: `${type} ${opening.id}`,
      description: `${type} vinculada à parede ${opening?.wallId || "não identificada"}.`,
      category: opening?.type === "door" ? "porta" : "esquadria",
      region: `Pavimento ${Number(opening?.floor || 0) + 1}`,
      quantity: 1,
      unit: "un",
      widthMm: widthM ? round(widthM * 1000, 1) : null,
      heightMm: heightM ? round(heightM * 1000, 1) : null,
      areaM2: widthM && heightM ? round(widthM * heightM) : null,
      catalogProductId: opening?.catalogProductId || null,
      supplierName: opening?.manufacturer || null,
    });
  }

  for (const object of objects) {
    const widthM = Number(object?.width || 0);
    const depthM = Number(object?.depth || 0);
    elements.push({
      sourceObjectId: `object:${object.id}`,
      name: object?.label || object?.kind || `Objeto ${object.id}`,
      description: "Objeto técnico originado do modelo do projeto.",
      category: object?.kind || "objeto",
      region: `Pavimento ${Number(object?.floor || 0) + 1}`,
      quantity: 1,
      unit: "un",
      widthMm: widthM ? round(widthM * 1000, 1) : null,
      depthMm: depthM ? round(depthM * 1000, 1) : null,
      areaM2: widthM && depthM ? round(widthM * depthM) : null,
      catalogProductId: object?.catalogProductId || null,
      supplierName: object?.supplier || null,
    });
  }

  return { revision, elements };
}

async function findConceptForProject(tId: string | null, projectId: string) {
  const values: unknown[] = [projectId];
  let sql = `SELECT id, tenant_id, arch_projeto_id, configuration, rooms, updated_at
               FROM arch_concept_projects
               WHERE (arch_projeto_id = $1 OR id = $1)`;
  if (tId) {
    values.push(tId);
    sql += ` AND tenant_id = ${values.length}`;
  }
  sql += ` ORDER BY updated_at DESC LIMIT 1`;
  const result = await pool.query(sql, values);
  return result.rows[0] ?? null;
}

async function syncProjectSpecification(tId: string | null, projectId: string) {
  const concept = await findConceptForProject(tId, projectId);
  if (!concept) return { found: false, revision: null, created: 0, updated: 0, removed: 0, unchanged: 0 };

  const { revision, elements } = buildProjectElements(concept);
  const currentResult = await pool.query(
    `SELECT * FROM arch_spec_objects
      WHERE project_id=$1
        AND source_type='project'
        AND ($2::text IS NULL OR tenant_id::text=$2::text)`,
    [projectId, tId],
  );
  const currentBySource = new Map<string, any>(
    currentResult.rows.filter((row: any) => row.source_object_id).map((row: any) => [String(row.source_object_id), row]),
  );
  const seen = new Set<string>();
  let created = 0, updated = 0, unchanged = 0, removed = 0;
  const impactedSpecIds: string[] = [];
  const now = new Date();

  for (const element of elements) {
    seen.add(element.sourceObjectId);
    const geometryHash = elementHash(element);
    const current = currentBySource.get(element.sourceObjectId);
    if (!current) {
      await pool.query(
        `INSERT INTO arch_spec_objects (
          id, tenant_id, project_id, source_object_id, source_type, project_revision, revision_impact, geometry_hash,
          name, description, category, region, quantity, unit, quantity_source,
          width_mm, height_mm, depth_mm, length_mm, area_m2, perimeter_m, volume_m3,
          measurement_source, measurement_revision, catalog_product_id, material_name, supplier_name,
          material_value, labor_value, total_value, notes, status, last_project_sync_at, created_at, updated_at
        ) VALUES (
          $1,$2,$3,$4,'project',$5,'new',$6,$7,$8,$9,$10,$11,$12,'project',
          $13,$14,$15,$16,$17,$18,$19,'project',$20,$21,$22,$23,0,0,0,$24,'identified',$25,$25,$25
        )`,
        [
          crypto.randomUUID(), tId, projectId, element.sourceObjectId, revision, geometryHash,
          element.name, element.description ?? null, element.category, element.region ?? null,
          element.quantity, element.unit,
          element.widthMm ?? null, element.heightMm ?? null, element.depthMm ?? null, element.lengthMm ?? null,
          element.areaM2 ?? null, element.perimeterM ?? null, element.volumeM3 ?? null,
          revision, element.catalogProductId ?? null, element.materialName ?? null, element.supplierName ?? null,
          "Sincronizado automaticamente da geometria do projeto.", now,
        ],
      );
      created += 1;
      continue;
    }

    const changed = current.geometry_hash !== geometryHash;
    const quantityChanged = Number(current.quantity ?? 0) !== Number(element.quantity ?? 0);
    const impact = changed ? (quantityChanged ? "quantity_changed" : "geometry_changed") : "unchanged";
    await pool.query(
      `UPDATE arch_spec_objects SET
        project_revision=$1, revision_impact=$2, geometry_hash=$3,
        name=$4, description=$5, category=$6, region=$7,
        quantity=$8, unit=$9, quantity_source='project',
        width_mm=$10, height_mm=$11, depth_mm=$12, length_mm=$13,
        area_m2=$14, perimeter_m=$15, volume_m3=$16,
        measurement_source='project', measurement_revision=$1,
        removed_from_project_at=NULL, last_project_sync_at=$17, updated_at=$17
       WHERE id=$18`,
      [
        revision, impact, geometryHash, element.name, element.description ?? null, element.category, element.region ?? null,
        element.quantity, element.unit, element.widthMm ?? null, element.heightMm ?? null, element.depthMm ?? null,
        element.lengthMm ?? null, element.areaM2 ?? null, element.perimeterM ?? null, element.volumeM3 ?? null, now, current.id,
      ],
    );
    if (changed) {
      updated += 1;
      impactedSpecIds.push(String(current.id));
    } else unchanged += 1;
  }

  for (const row of currentResult.rows) {
    const source = String(row.source_object_id || "");
    if (!source || seen.has(source)) continue;
    const wasAlreadyRemoved = row.revision_impact === "removed" && row.removed_from_project_at;
    await pool.query(
      `UPDATE arch_spec_objects
          SET revision_impact='removed', removed_from_project_at=COALESCE(removed_from_project_at,$1),
              last_project_sync_at=$1, updated_at=$1
        WHERE id=$2`,
      [now, row.id],
    );
    if (!wasAlreadyRemoved) {
      impactedSpecIds.push(String(row.id));
      removed += 1;
    }
  }

  if (impactedSpecIds.length) {
    await pool.query(
      `UPDATE arch_budget_items
          SET specification_outdated=TRUE,
              specification_revision=$2,
              specification_impact=aso.revision_impact,
              updated_at=now()
         FROM arch_spec_objects aso
        WHERE arch_budget_items.spec_object_id=aso.id
          AND aso.id = ANY($1::uuid[])
          AND arch_budget_items.deleted_at IS NULL`,
      [impactedSpecIds, revision],
    );

    await pool.query(
      `UPDATE arch_budgets b
          SET specification_outdated=TRUE,
              specification_revision=$2,
              updated_at=now()
        WHERE EXISTS (
          SELECT 1 FROM arch_budget_items bi
           WHERE bi.budget_id=b.id
             AND bi.spec_object_id = ANY($1::uuid[])
             AND bi.deleted_at IS NULL
        )`,
      [impactedSpecIds, revision],
    );

    await pool.query(
      `UPDATE compras_obras
          SET cotacao_desatualizada=TRUE,
              escopo_versao=escopo_versao+1,
              updated_at=now()
        WHERE spec_object_id = ANY($1::uuid[])`,
      [impactedSpecIds],
    ).catch(() => undefined);
  }

  return {
    found: true,
    conceptProjectId: concept.id,
    revision,
    created,
    updated,
    removed,
    unchanged,
    impacted: impactedSpecIds.length,
  };
}

const archSpecObjectsRouter = Router();

archSpecObjectsRouter.post("/arch/spec-objects/sync-project", async (req, res, next) => {
  try {
    const projectId = String(req.body?.projectId ?? "");
    if (!projectId) {
      res.status(400).json({ error: "projectId é obrigatório" });
      return;
    }
    const result = await syncProjectSpecification(tenantId(req), projectId);
    if (!result.found) {
      res.status(404).json({ error: "Pré-projeto/Project Master não encontrado para este projeto" });
      return;
    }
    const items = await listSpecObjects({ tenantId: tenantId(req), projectId });
    res.json({ ok: true, sync: result, items, total: items.length });
  } catch (err) {
    logger.error({ err }, "arch/spec-objects/sync-project error");
    next(err);
  }
});

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
