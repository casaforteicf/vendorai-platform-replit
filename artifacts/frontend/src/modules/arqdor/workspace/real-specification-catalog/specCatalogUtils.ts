import type { CatalogItem, SpecObject, SpecObjectStatus } from "./specCatalogTypes";

export function getProjectId(arqState: any): string {
  const project =
    arqState?.currentProject ||
    arqState?.selectedProject ||
    arqState?.project ||
    arqState?.projects?.[0] ||
    arqState?.projetos?.[0];

  return String(project?.id || project?._id || project?.projectId || "");
}

export function getProjectTitle(arqState: any): string {
  const project =
    arqState?.currentProject ||
    arqState?.selectedProject ||
    arqState?.project ||
    arqState?.projects?.[0] ||
    arqState?.projetos?.[0];

  return project?.titulo || project?.title || project?.name || "Projeto ARQDOR";
}

export function getAuthHeaders(): HeadersInit {
  const token =
    localStorage.getItem("token") ||
    localStorage.getItem("authToken") ||
    localStorage.getItem("access_token") ||
    localStorage.getItem("vendorai_token") ||
    "";

  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function money(value?: number | null) {
  const n = Number(value || 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function statusLabel(status: SpecObjectStatus) {
  const labels: Record<SpecObjectStatus, string> = {
    draft: "Rascunho",
    identified: "Identificado",
    specified: "Especificado",
    priced: "Precificado",
    approved: "Aprovado",
    "sent-to-budget": "Enviado ao orçamento",
    archived: "Arquivado",
  };
  return labels[status];
}

export function statusClass(status: SpecObjectStatus) {
  const classes: Record<SpecObjectStatus, string> = {
    draft: "bg-slate-100 text-slate-600",
    identified: "bg-blue-50 text-blue-700",
    specified: "bg-violet-50 text-violet-700",
    priced: "bg-amber-50 text-amber-700",
    approved: "bg-emerald-50 text-emerald-700",
    "sent-to-budget": "bg-slate-950 text-white",
    archived: "bg-slate-200 text-slate-600",
  };
  return classes[status];
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeCatalogItem(raw: any): CatalogItem {
  return {
    id: String(raw?.id || raw?._id || raw?.catalogId || crypto.randomUUID()),
    type: raw?.type || raw?.itemType || raw?.kind || "product",
    name: raw?.name || raw?.nome || raw?.title || "Item de catálogo",
    code: raw?.code || raw?.sku || raw?.codigo || null,
    category: raw?.category || raw?.categoria || null,
    manufacturer: raw?.manufacturer || raw?.fabricante || raw?.manufacturerName || null,
    supplier: raw?.supplier || raw?.fornecedor || raw?.supplierName || null,
    material: raw?.material || raw?.materialName || null,
    unit: raw?.unit || raw?.unidade || "un",
    price: Number(raw?.price ?? raw?.valor ?? raw?.materialValue ?? 0),
    laborPrice: Number(raw?.laborPrice ?? raw?.maoDeObra ?? raw?.laborValue ?? 0),
    imageUrl: raw?.imageUrl || raw?.image_url || raw?.url || null,
    description: raw?.description || raw?.descricao || null,
    metadata: raw?.metadata || raw,
  };
}

export function normalizeSpecObject(raw: any): SpecObject {
  const materialValue = Number(raw?.materialValue ?? raw?.material_value ?? raw?.valorMaterial ?? 0);
  const laborValue = Number(raw?.laborValue ?? raw?.labor_value ?? raw?.valorMaoDeObra ?? 0);
  const quantity = Number(raw?.quantity ?? raw?.quantidade ?? 1);
  const totalValue = Number(raw?.totalValue ?? raw?.total_value ?? (materialValue + laborValue) * quantity);

  return {
    id: String(raw?.id || raw?._id || raw?.specObjectId || crypto.randomUUID()),
    tenantId: raw?.tenantId || raw?.tenant_id || null,
    projectId: String(raw?.projectId || raw?.project_id || raw?.projetoId || ""),
    ambienteId: raw?.ambienteId || raw?.ambiente_id || null,
    cenaId: raw?.cenaId || raw?.cena_id || null,
    renderId: raw?.renderId || raw?.render_id || null,
    sourceObjectId: raw?.sourceObjectId || raw?.source_object_id || null,
    sourceType: raw?.sourceType || raw?.source_type || "manual",
    projectRevision: raw?.projectRevision || raw?.project_revision || null,
    revisionImpact: raw?.revisionImpact || raw?.revision_impact || "unchanged",
    geometryHash: raw?.geometryHash || raw?.geometry_hash || null,
    removedFromProjectAt: raw?.removedFromProjectAt || raw?.removed_from_project_at || null,
    name: raw?.name || raw?.nome || raw?.title || "Objeto especificável",
    description: raw?.description || raw?.descricao || null,
    category: raw?.category || raw?.categoria || null,
    region: raw?.region || raw?.regiao || null,
    quantity,
    unit: raw?.unit || raw?.unidade || "un",
    quantitySource: raw?.quantitySource || raw?.quantity_source || "pending",
    widthMm: nullableNumber(raw?.widthMm ?? raw?.width_mm),
    heightMm: nullableNumber(raw?.heightMm ?? raw?.height_mm),
    depthMm: nullableNumber(raw?.depthMm ?? raw?.depth_mm),
    lengthMm: nullableNumber(raw?.lengthMm ?? raw?.length_mm),
    areaM2: nullableNumber(raw?.areaM2 ?? raw?.area_m2),
    perimeterM: nullableNumber(raw?.perimeterM ?? raw?.perimeter_m),
    volumeM3: nullableNumber(raw?.volumeM3 ?? raw?.volume_m3),
    measurementSource: raw?.measurementSource || raw?.measurement_source || "pending",
    measurementRevision: raw?.measurementRevision || raw?.measurement_revision || null,
    lastProjectSyncAt: raw?.lastProjectSyncAt || raw?.last_project_sync_at || null,
    measurementConfirmedAt: raw?.measurementConfirmedAt || raw?.measurement_confirmed_at || null,
    measurementConfirmedBy: raw?.measurementConfirmedBy || raw?.measurement_confirmed_by || null,
    wasteFactor: nullableNumber(raw?.wasteFactor ?? raw?.waste_factor) ?? 0,
    purchaseQuantity: nullableNumber(raw?.purchaseQuantity ?? raw?.purchase_quantity),
    packageYield: nullableNumber(raw?.packageYield ?? raw?.package_yield),
    purchaseMode: raw?.purchaseMode || raw?.purchase_mode || "same_unit",
    purchaseUnit: raw?.purchaseUnit || raw?.purchase_unit || raw?.unit || raw?.unidade || "un",
    catalogProductId: raw?.catalogProductId || raw?.catalog_product_id || null,
    catalogMaterialId: raw?.catalogMaterialId || raw?.catalog_material_id || null,
    manufacturerId: raw?.manufacturerId || raw?.manufacturer_id || null,
    supplierId: raw?.supplierId || raw?.supplier_id || null,
    productName: raw?.productName || raw?.product_name || raw?.produtoNome || null,
    materialName: raw?.materialName || raw?.material_name || raw?.materialNome || null,
    manufacturerName: raw?.manufacturerName || raw?.manufacturer_name || raw?.fabricanteNome || null,
    supplierName: raw?.supplierName || raw?.supplier_name || raw?.fornecedorNome || null,
    materialValue,
    laborValue,
    totalValue,
    notes: raw?.notes || raw?.observacoes || null,
    technicalApprovalStatus: raw?.technicalApprovalStatus || raw?.technical_approval_status || "pending",
    technicalApprovedAt: raw?.technicalApprovedAt || raw?.technical_approved_at || null,
    technicalApprovedBy: raw?.technicalApprovedBy || raw?.technical_approved_by || null,
    technicalApprovalNote: raw?.technicalApprovalNote || raw?.technical_approval_note || null,
    status: raw?.status || "draft",
    createdAt: raw?.createdAt || raw?.created_at || null,
    updatedAt: raw?.updatedAt || raw?.updated_at || null,
  };
}
