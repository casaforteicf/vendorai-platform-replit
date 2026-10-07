import type {
  ApiResult,
  Budget,
  BudgetItem,
  BudgetItemPayload,
  BudgetPayload,
  BudgetResponse,
  CreateBudgetFromSpecPayload,
} from "./budgetTypes";
import {
  calculateBudgetTotals,
  getAuthHeaders,
  normalizeBudget,
  normalizeBudgetItem,
} from "./budgetUtils";

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

function normalizeBudgetResponse(raw: any): BudgetResponse {
  const budget = raw?.budget ? normalizeBudget(raw.budget) : raw?.id ? normalizeBudget(raw) : null;
  const rawItems = raw?.items || raw?.data?.items || raw?.budgetItems || [];
  const items = rawItems.map(normalizeBudgetItem);
  const totals = raw?.totals || calculateBudgetTotals(items, budget);

  return {
    budget,
    items,
    totals,
  };
}

export async function fetchBudget(projectId: string): Promise<ApiResult<BudgetResponse>> {
  const query = new URLSearchParams();
  query.set("projectId", projectId);

  const response = await fetch(`/api/arch/orcamento?${query.toString()}`, {
    method: "GET",
    headers: getAuthHeaders(),
  });

  const result = await parseResponse<any>(response);
  if (result.error) return { error: result.error };

  return { data: normalizeBudgetResponse(result.data) };
}

export async function createBudget(payload: BudgetPayload): Promise<ApiResult<BudgetResponse>> {
  const response = await fetch("/api/arch/orcamento", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });

  const result = await parseResponse<any>(response);
  if (result.error) return { error: result.error };

  return { data: normalizeBudgetResponse(result.data) };
}

export async function createBudgetFromSpecObjects(payload: CreateBudgetFromSpecPayload): Promise<ApiResult<BudgetResponse>> {
  const response = await fetch("/api/arch/orcamento/from-spec-objects", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });

  const result = await parseResponse<any>(response);
  if (result.error) return { error: result.error };

  return { data: normalizeBudgetResponse(result.data) };
}

export async function updateBudget(id: string, payload: Partial<BudgetPayload>): Promise<ApiResult<Budget>> {
  const response = await fetch(`/api/arch/orcamento/budget/${id}`, {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });

  const result = await parseResponse<any>(response);
  if (result.error) return { error: result.error };

  return { data: normalizeBudget(result.data?.budget || result.data?.data || result.data) };
}

export async function createBudgetItem(payload: BudgetItemPayload): Promise<ApiResult<BudgetItem>> {
  const response = await fetch(`/api/arch/orcamento/${payload.budgetId}/items`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });

  const result = await parseResponse<any>(response);
  if (result.error) return { error: result.error };

  return { data: normalizeBudgetItem(result.data?.item || result.data?.data || result.data) };
}

export async function updateBudgetItem(id: string, payload: Partial<BudgetItemPayload>): Promise<ApiResult<BudgetItem>> {
  const response = await fetch(`/api/arch/orcamento/items/${id}`, {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });

  const result = await parseResponse<any>(response);
  if (result.error) return { error: result.error };

  return { data: normalizeBudgetItem(result.data?.item || result.data?.data || result.data) };
}

export async function deleteBudgetItem(id: string): Promise<ApiResult<{ ok: boolean }>> {
  const response = await fetch(`/api/arch/orcamento/items/${id}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });

  return parseResponse<{ ok: boolean }>(response);
}

export async function markBudgetSent(id: string): Promise<ApiResult<Budget>> {
  return updateBudget(id, { status: "sent" });
}

export async function approveBudget(id: string): Promise<ApiResult<Budget>> {
  return updateBudget(id, { status: "approved" });
}
