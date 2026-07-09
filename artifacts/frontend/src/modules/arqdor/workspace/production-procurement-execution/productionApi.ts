import type {
  ApiResult,
  CreateFromApprovalPayload,
  ProductionBundleResponse,
  SupplierOrderPayload,
  WorkOrder,
  WorkOrderPayload,
} from "./productionTypes";
import {
  getAuthHeaders,
  normalizeEvent,
  normalizeSupplierOrder,
  normalizeWorkOrder,
} from "./productionUtils";

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

function normalizeBundle(raw: any): ProductionBundleResponse {
  const workOrders = raw?.workOrders || raw?.work_orders || raw?.orders || [];
  const supplierOrders = raw?.supplierOrders || raw?.supplier_orders || raw?.suppliers || [];
  const installationTasks = raw?.installationTasks || raw?.installation_tasks || [];
  const qualityChecks = raw?.qualityChecks || raw?.quality_checks || [];
  const events = raw?.events || raw?.timeline || [];

  return {
    workOrders: workOrders.map(normalizeWorkOrder),
    supplierOrders: supplierOrders.map(normalizeSupplierOrder),
    installationTasks,
    qualityChecks,
    events: events.map(normalizeEvent),
  };
}

export async function fetchProductionBundle(projectId: string): Promise<ApiResult<ProductionBundleResponse>> {
  const query = new URLSearchParams();
  query.set("projectId", projectId);

  const response = await fetch(`/api/arch/producao?${query.toString()}`, {
    method: "GET",
    headers: getAuthHeaders(),
  });

  const result = await parseResponse<any>(response);
  if (result.error) return { error: result.error };

  return { data: normalizeBundle(result.data) };
}

export async function createOrdersFromApproval(payload: CreateFromApprovalPayload): Promise<ApiResult<ProductionBundleResponse>> {
  const response = await fetch("/api/arch/producao/from-approval", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });

  const result = await parseResponse<any>(response);
  if (result.error) return { error: result.error };

  return { data: normalizeBundle(result.data) };
}

export async function createWorkOrder(payload: WorkOrderPayload): Promise<ApiResult<WorkOrder>> {
  const response = await fetch("/api/arch/producao/work-orders", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });

  const result = await parseResponse<any>(response);
  if (result.error) return { error: result.error };

  return { data: normalizeWorkOrder(result.data?.workOrder || result.data?.data || result.data) };
}

export async function updateWorkOrder(id: string, payload: Partial<WorkOrderPayload>): Promise<ApiResult<WorkOrder>> {
  const response = await fetch(`/api/arch/producao/work-orders/${id}`, {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });

  const result = await parseResponse<any>(response);
  if (result.error) return { error: result.error };

  return { data: normalizeWorkOrder(result.data?.workOrder || result.data?.data || result.data) };
}

export async function createSupplierOrder(payload: SupplierOrderPayload): Promise<ApiResult<any>> {
  const response = await fetch("/api/arch/producao/supplier-orders", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });

  const result = await parseResponse<any>(response);
  if (result.error) return { error: result.error };

  return { data: normalizeSupplierOrder(result.data?.supplierOrder || result.data?.data || result.data) };
}

export async function updateSupplierOrder(id: string, payload: Partial<SupplierOrderPayload>): Promise<ApiResult<any>> {
  const response = await fetch(`/api/arch/producao/supplier-orders/${id}`, {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });

  const result = await parseResponse<any>(response);
  if (result.error) return { error: result.error };

  return { data: normalizeSupplierOrder(result.data?.supplierOrder || result.data?.data || result.data) };
}
