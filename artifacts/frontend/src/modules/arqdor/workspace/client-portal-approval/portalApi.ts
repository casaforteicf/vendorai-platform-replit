import type {
  ActivatePortalPayload,
  ApiResult,
  ClientApprovalPayload,
  ClientItemApprovalPayload,
  CreateProposalFromBudgetPayload,
  Proposal,
  ProposalResponse,
  SendProposalPayload,
} from "./portalTypes";
import {
  getAuthHeaders,
  normalizeProposal,
  normalizeProposalEvent,
  normalizeProposalItem,
} from "./portalUtils";

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

function normalizeProposalResponse(raw: any): ProposalResponse {
  const proposalRaw = raw?.proposal || raw?.data?.proposal || raw;
  const itemsRaw = raw?.items || raw?.data?.items || raw?.proposalItems || [];
  const eventsRaw = raw?.events || raw?.data?.events || raw?.timeline || [];

  return {
    proposal: proposalRaw ? normalizeProposal(proposalRaw) : null,
    items: itemsRaw.map(normalizeProposalItem),
    events: eventsRaw.map(normalizeProposalEvent),
    deliveries: raw?.deliveries || [],
  };
}

export async function fetchProposalByProject(projectId: string): Promise<ApiResult<ProposalResponse>> {
  const query = new URLSearchParams();
  query.set("projectId", projectId);

  const response = await fetch(`/api/arch/propostas?${query.toString()}`, {
    method: "GET",
    headers: getAuthHeaders(),
  });

  const result = await parseResponse<any>(response);
  if (result.error) return { error: result.error };

  return { data: normalizeProposalResponse(result.data) };
}

export async function createProposalFromBudget(payload: CreateProposalFromBudgetPayload): Promise<ApiResult<ProposalResponse>> {
  const response = await fetch("/api/arch/propostas/from-budget", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });

  const result = await parseResponse<any>(response);
  if (result.error) return { error: result.error };

  return { data: normalizeProposalResponse(result.data) };
}

export async function activatePortal(payload: ActivatePortalPayload): Promise<ApiResult<Proposal>> {
  const response = await fetch(`/api/arch/propostas/${payload.proposalId}/portal/ativar`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });

  const result = await parseResponse<any>(response);
  if (result.error) return { error: result.error };

  return { data: normalizeProposal(result.data?.proposal || result.data?.data || result.data) };
}

export async function sendProposal(payload: SendProposalPayload): Promise<ApiResult<ProposalResponse>> {
  const response = await fetch(`/api/arch/propostas/${payload.proposalId}/send`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });

  const result = await parseResponse<any>(response);
  if (result.error) return { error: result.error };

  return { data: normalizeProposalResponse(result.data) };
}

export async function fetchPublicProposal(token: string): Promise<ApiResult<ProposalResponse>> {
  const response = await fetch(`/api/arch/portal/proposta/${token}`, {
    method: "GET",
  });

  const result = await parseResponse<any>(response);
  if (result.error) return { error: result.error };

  return { data: normalizeProposalResponse(result.data) };
}

export async function submitClientDecision(payload: ClientApprovalPayload): Promise<ApiResult<ProposalResponse>> {
  const response = await fetch(`/api/arch/portal/proposta/${payload.token}/decision`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const result = await parseResponse<any>(response);
  if (result.error) return { error: result.error };

  return { data: normalizeProposalResponse(result.data) };
}

export async function submitClientItemDecision(payload: ClientItemApprovalPayload): Promise<ApiResult<ProposalResponse>> {
  const response = await fetch(`/api/arch/portal/proposta/${payload.token}/items/${payload.itemId}/decision`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const result = await parseResponse<any>(response);
  if (result.error) return { error: result.error };

  return { data: normalizeProposalResponse(result.data) };
}
