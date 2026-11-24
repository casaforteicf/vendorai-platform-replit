export type MaintenanceApi = ReturnType<typeof createMaintenanceApi>;

export function createMaintenanceApi(token: string | null | undefined, tenantId: string) {
  const base = `/api/tenants/${encodeURIComponent(tenantId)}/hotelaria/manutencao`;
  const headers = {
    Authorization: `Bearer ${token ?? ""}`,
    "Content-Type": "application/json",
  };

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${base}${path}`, {
      ...init,
      headers: { ...headers, ...(init?.headers ?? {}) },
      cache: "no-store",
    });
    if (response.status === 204) return undefined as T;
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error((body as { error?: string })?.error ?? "Não foi possível concluir a operação.");
    return body as T;
  }

  return {
    get: <T>(path: string) => request<T>(path),
    post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) }),
    patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body: JSON.stringify(body ?? {}) }),
    del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  };
}

export type Asset = {
  id: string;
  code: string;
  name: string;
  category: string;
  location_type: "room" | "area";
  room_id: string | null;
  room_code: string | null;
  area_name: string | null;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  status: "active" | "inactive";
  notes: string | null;
  planos_ativos: number;
  proxima_manutencao: string | null;
};

export type Plan = {
  id: string;
  asset_id: string;
  asset_name: string;
  asset_code: string;
  area_name: string | null;
  room_id: string | null;
  room_code: string | null;
  title: string;
  interval_days: number;
  last_done_on: string | null;
  next_due_on: string;
  active: boolean;
  notes: string | null;
};

export type WorkOrder = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  priority: "low" | "normal" | "high" | "urgent";
  status: "open" | "in_progress" | "waiting" | "done" | "cancelled";
  room_id: string | null;
  room_code: string | null;
  area_name: string | null;
  asset_id: string | null;
  asset_name: string | null;
  assigned_to: string | null;
  due_at: string | null;
  opened_at: string;
  completed_at: string | null;
  completion_notes: string | null;
};

export type ChecklistItem = { id: string; title: string; requiresNote?: boolean; status?: "pending" | "ok" | "problem"; notes?: string | null; workOrderId?: string | null };
export type ChecklistTemplate = {
  id: string;
  title: string;
  area_name: string;
  frequency: "daily" | "weekly" | "monthly";
  active: boolean;
  items: ChecklistItem[];
  feito_hoje: number;
};
export type ChecklistRun = {
  id: string;
  template_id: string;
  template_title: string;
  area_name: string;
  frequency: "daily" | "weekly" | "monthly";
  run_date: string;
  status: "open" | "done";
  items: ChecklistItem[];
  completed_at: string | null;
};

export type Meter = {
  id: string;
  name: string;
  kind: "water" | "gas" | "energy" | "temperature";
  unit: string;
  location: string | null;
  active: boolean;
  ultima_leitura: string | null;
  ultima_data: string | null;
  leitura_anterior: string | null;
  consumo: string | null;
};

export type MeterReading = { id: string; reading_date: string; value: string; notes: string | null; created_at: string };
export type MaintenanceDocument = {
  id: string;
  title: string;
  kind: string;
  issuer: string | null;
  valid_until: string | null;
  file_url: string | null;
  notes: string | null;
  dias_para_vencer: number | null;
};

export type Summary = {
  chamados: { abertos: number; atrasados: number; concluidos_mes: number };
  preventiva: { atrasados: number; proximos: number };
  checklist: { abertos: number; concluidos_hoje: number };
  equipamentos: { total: number; inativos: number };
  medidores: { total: number };
  documentos: { vencidos: number; vencendo: number };
  proximos: {
    chamados: Array<{ id: string; title: string; area_name: string | null; priority: string; status: string; due_at: string | null }>;
    preventivas: Array<{ id: string; title: string; next_due_on: string; asset_name: string; asset_code: string }>;
    documentos: Array<{ id: string; title: string; kind: string; valid_until: string | null }>;
  };
};
