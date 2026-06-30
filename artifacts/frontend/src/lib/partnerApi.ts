import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

function authHeaders() {
  const token = localStorage.getItem("vendorai_token");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: authHeaders() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Dashboard ──────────────────────────────────────────────────────────────

export interface PartnerIndicator {
  id: string;
  partnerId: string;
  mesReferencia: string;
  totalClientesAtivos: number;
  totalComissao: string;
}

export interface PartnerDashboardData {
  partner: { id: string; nomeFantasia: string; nivel: number; status: string };
  cards: {
    totalClientesAtivos: number;
    comissaoMes: string;
    nivelAtual: number;
    leadsEmNegociacao: number;
  };
  grafico: PartnerIndicator[];
}

export function usePartnerDashboard(partnerId: string | undefined) {
  return useQuery<PartnerDashboardData>({
    queryKey: ["partner-dashboard", partnerId],
    queryFn: () => apiFetch(`/api/partners/${partnerId}/dashboard`),
    enabled: !!partnerId,
  });
}

// ── Dashboard V2 (GET /api/partner/dashboard) ──────────────────────────────

export interface PartnerTenantSummary {
  id: string;
  name: string;
  slug: string;
  status: string;
  vertical: string | null;
  setupCompletedAt: string | null;
  createdAt: string;
}

export interface PartnerCommissionRecord {
  id: string;
  partnerId: string;
  tenantId: string;
  valor: string;
  dataReferencia: string;
  status: string;
  dataPagamento: string | null;
  descricao: string | null;
}

export interface PartnerDashboardV2Data {
  summary: {
    activeTenants: number;
    commissionThisMonth: number;
    commissionThisYear: number;
    nextPaymentDate: string;
  };
  tenants: PartnerTenantSummary[];
  commissions: PartnerCommissionRecord[];
}

export function usePartnerDashboardV2() {
  return useQuery<PartnerDashboardV2Data>({
    queryKey: ["partner-dashboard-v2"],
    queryFn: () => apiFetch("/api/partner/dashboard"),
  });
}

// ── Leads ──────────────────────────────────────────────────────────────────

export interface PartnerLead {
  id: string;
  nome: string;
  telefone: string | null;
  email: string | null;
  empresa: string | null;
  status: string;
  tenantId: string;
  tenantName: string;
  source: string;
  createdAt: string;
  updatedAt: string;
}

export function usePartnerLeads() {
  return useQuery<PartnerLead[]>({
    queryKey: ["partner-leads"],
    queryFn: () => apiFetch("/api/partners/leads"),
  });
}

export interface PartnerLeadDetail {
  lead: Record<string, unknown>;
  conversations: Record<string, unknown>[];
  deals: Record<string, unknown>[];
  activities: Record<string, unknown>[];
}

export function usePartnerLeadDetail(id: string | undefined) {
  return useQuery<PartnerLeadDetail>({
    queryKey: ["partner-lead", id],
    queryFn: () => apiFetch(`/api/partners/leads/${id}`),
    enabled: !!id,
  });
}

// ── Comissões ──────────────────────────────────────────────────────────────

export interface PartnerCommission {
  id: string;
  partnerId: string;
  tenantId: string;
  tipo: string | null;
  valorBase: string | null;
  percentual: string | null;
  valor: string | null;
  dataReferencia: string | null;
  status: string;
  createdAt: string;
}

export function usePartnerCommissions(
  partnerId: string | undefined,
  filters: { mes?: string; status?: string } = {}
) {
  const params = new URLSearchParams();
  if (filters.mes) params.set("mes", filters.mes);
  if (filters.status) params.set("status", filters.status);
  const qs = params.toString();

  return useQuery<PartnerCommission[]>({
    queryKey: ["partner-commissions", partnerId, filters],
    queryFn: () =>
      apiFetch(`/api/partners/${partnerId}/commissions${qs ? `?${qs}` : ""}`),
    enabled: !!partnerId,
  });
}

export interface CommissionSummaryRow {
  status: string;
  count: number;
  total: string;
}

export function usePartnerCommissionsSummary() {
  return useQuery<CommissionSummaryRow[]>({
    queryKey: ["partner-commissions-summary"],
    queryFn: () => apiFetch("/api/partners/commissions/summary"),
  });
}

// ── Indicação ──────────────────────────────────────────────────────────────

export interface IndicateLeadPayload {
  tenantId: string;
  nome: string;
  telefone?: string;
  email?: string;
  empresa?: string;
  objetivo?: string;
}

export function useIndicateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: IndicateLeadPayload) => {
      const res = await fetch("/api/partners/indicate", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any).error ?? "Erro ao indicar cliente");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partner-leads"] });
    },
  });
}
