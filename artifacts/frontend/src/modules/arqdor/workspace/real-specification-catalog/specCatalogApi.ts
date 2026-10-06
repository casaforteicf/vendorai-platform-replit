import type {
  ApiResult,
  BulkFromRenderPayload,
  CatalogItem,
  CatalogItemType,
  CatalogResponse,
  SpecObject,
  SpecObjectPayload,
  SpecObjectsResponse,
  SpecApproval,
  SpecApprovalContext,
  SpecApprovalDecision,
} from "./specCatalogTypes";
import { getAuthHeaders, normalizeCatalogItem, normalizeSpecObject } from "./specCatalogUtils";

const jsonHeaders = () => ({
  "Content-Type": "application/json",
  ...getAuthHeaders(),
});

async function parseResponse<T>(response: Response): Promise<ApiResult<T>> {
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    return {
      error: payload?.message || payload?.error || `Erro HTTP ${response.status}`,
    };
  }

  return { data: payload as T };
}

export async function fetchCatalog(params: {
  type?: CatalogItemType | "all";
  query?: string;
  projectId?: string;
}): Promise<ApiResult<CatalogResponse>> {
  const query = new URLSearchParams();
  if (params.type && params.type !== "all") query.set("type", params.type);
  if (params.query) query.set("q", params.query);
  if (params.projectId) query.set("projectId", params.projectId);

  const response = await fetch(`/api/arch/catalogo?${query.toString()}`, {
    method: "GET",
    headers: getAuthHeaders(),
  });

  const result = await parseResponse<any>(response);
  if (result.error) return { error: result.error };

  const raw = result.data;
  const items = Array.isArray(raw) ? raw : raw?.items || raw?.data || raw?.catalog || [];

  return {
    data: {
      items: items.map(normalizeCatalogItem),
      total: raw?.total || items.length,
    },
  };
}

export async function fetchSpecObjects(params: {
  projectId: string;
  renderId?: string;
}): Promise<ApiResult<SpecObjectsResponse>> {
  const query = new URLSearchParams();
  query.set("projectId", params.projectId);
  if (params.renderId) query.set("renderId", params.renderId);

  const response = await fetch(`/api/arch/spec-objects?${query.toString()}`, {
    method: "GET",
    headers: getAuthHeaders(),
  });

  const result = await parseResponse<any>(response);
  if (result.error) return { error: result.error };

  const raw = result.data;
  const items = Array.isArray(raw) ? raw : raw?.items || raw?.data || raw?.objects || [];

  return {
    data: {
      items: items.map(normalizeSpecObject),
      total: raw?.total || items.length,
    },
  };
}

export async function syncSpecObjectsFromProject(projectId: string): Promise<ApiResult<SpecObjectsResponse & { sync?: Record<string, unknown> }>> {
  const response = await fetch("/api/arch/spec-objects/sync-project", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ projectId }),
  });

  const result = await parseResponse<any>(response);
  if (result.error) return { error: result.error };
  const raw = result.data;
  const items = raw?.items || [];
  return { data: { items: items.map(normalizeSpecObject), total: raw?.total || items.length, sync: raw?.sync } };
}

export async function createSpecObject(payload: SpecObjectPayload): Promise<ApiResult<SpecObject>> {
  const response = await fetch("/api/arch/spec-objects", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });

  const result = await parseResponse<any>(response);
  if (result.error) return { error: result.error };

  return { data: normalizeSpecObject(result.data?.item || result.data?.data || result.data) };
}

export async function updateSpecObject(id: string, payload: Partial<SpecObjectPayload>): Promise<ApiResult<SpecObject>> {
  const response = await fetch(`/api/arch/spec-objects/${id}`, {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });

  const result = await parseResponse<any>(response);
  if (result.error) return { error: result.error };

  return { data: normalizeSpecObject(result.data?.item || result.data?.data || result.data) };
}

export async function createSpecObjectsFromRender(payload: BulkFromRenderPayload): Promise<ApiResult<SpecObjectsResponse>> {
  const response = await fetch("/api/arch/spec-objects/bulk-from-render", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });

  const result = await parseResponse<any>(response);
  if (result.error) return { error: result.error };

  const raw = result.data;
  const items = Array.isArray(raw) ? raw : raw?.items || raw?.data || raw?.objects || [];

  return {
    data: {
      items: items.map(normalizeSpecObject),
      total: raw?.total || items.length,
    },
  };
}

export async function fetchSpecObjectApprovals(id: string): Promise<ApiResult<{ approvals: SpecApproval[] }>> {
  const response = await fetch(`/api/arch/spec-objects/${id}/approvals`, {
    method: "GET",
    headers: getAuthHeaders(),
  });
  const result = await parseResponse<any>(response);
  if (result.error) return { error: result.error };
  const approvals = (result.data?.approvals || []).map((item: any) => ({
    id: String(item.id),
    specObjectId: String(item.spec_object_id || item.specObjectId || id),
    context: item.approval_context || item.context,
    decision: item.decision,
    actorId: item.actor_id || item.actorId || null,
    actorName: item.actor_name || item.actorName || null,
    note: item.note || null,
    projectRevision: item.project_revision || item.projectRevision || null,
    createdAt: item.created_at || item.createdAt || null,
  }));
  return { data: { approvals } };
}

export async function decideSpecObjectApproval(
  id: string,
  payload: { context: SpecApprovalContext; decision: SpecApprovalDecision; note?: string | null },
): Promise<ApiResult<{ item: SpecObject; approvals: SpecApproval[] }>> {
  const response = await fetch(`/api/arch/spec-objects/${id}/approvals`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const result = await parseResponse<any>(response);
  if (result.error) return { error: result.error };
  return {
    data: {
      item: normalizeSpecObject(result.data?.item),
      approvals: (result.data?.approvals || []).map((entry: any) => ({
        id: String(entry.id),
        specObjectId: String(entry.spec_object_id || id),
        context: entry.approval_context,
        decision: entry.decision,
        actorId: entry.actor_id || null,
        actorName: entry.actor_name || null,
        note: entry.note || null,
        projectRevision: entry.project_revision || null,
        createdAt: entry.created_at || null,
      })),
    },
  };
}

export async function sendSpecObjectToBudget(id: string): Promise<ApiResult<{ ok: boolean; budgetItemId?: string }>> {
  const response = await fetch(`/api/arch/spec-objects/${id}/send-to-budget`, {
    method: "POST",
    headers: jsonHeaders(),
  });

  return parseResponse<{ ok: boolean; budgetItemId?: string }>(response);
}

export function applyCatalogItemToSpecObject(object: SpecObject, item: CatalogItem): SpecObjectPayload {
  const materialValue = Number(item.price ?? object.materialValue ?? 0);
  const laborValue = Number(item.laborPrice ?? object.laborValue ?? 0);
  const quantity = Number(object.quantity || 1);

  // Política de governança:
  // - item já enviado ao orçamento permanece sent-to-budget para disparar a sincronização no backend;
  // - item aprovado que sofreu alteração volta para specified e precisa ser aprovado novamente;
  // - demais estados passam a specified.
  const nextStatus = object.status === "sent-to-budget" ? "sent-to-budget" : "specified";

  return {
    projectId: object.projectId,
    ambienteId: object.ambienteId,
    cenaId: object.cenaId,
    renderId: object.renderId,
    name: object.name,
    description: object.description,
    category: object.category || item.category,
    region: object.region,
    quantity,
    unit: item.unit || object.unit || "un",
    quantitySource: object.quantitySource,
    widthMm: object.widthMm,
    heightMm: object.heightMm,
    depthMm: object.depthMm,
    lengthMm: object.lengthMm,
    areaM2: object.areaM2,
    perimeterM: object.perimeterM,
    volumeM3: object.volumeM3,
    measurementSource: object.measurementSource,
    measurementRevision: object.measurementRevision,
    wasteFactor: object.wasteFactor,
    purchaseQuantity: object.purchaseQuantity,
    packageYield: object.packageYield,
    purchaseMode: object.purchaseMode,
    purchaseUnit: object.purchaseUnit,
    catalogProductId: item.type === "product" || item.type === "component" ? item.id : object.catalogProductId,
    catalogMaterialId: item.type === "material" || item.type === "finish" ? item.id : object.catalogMaterialId,
    manufacturerId: item.type === "manufacturer" ? item.id : object.manufacturerId,
    supplierId: item.type === "supplier" ? item.id : object.supplierId,
    productName: item.type === "product" || item.type === "component" ? item.name : object.productName,
    materialName: item.type === "material" || item.type === "finish" ? item.name : item.material || object.materialName,
    manufacturerName: item.type === "manufacturer" ? item.name : item.manufacturer || object.manufacturerName,
    supplierName: item.type === "supplier" ? item.name : item.supplier || object.supplierName,
    materialValue,
    laborValue,
    notes: object.notes,
    status: nextStatus,
  };
}
