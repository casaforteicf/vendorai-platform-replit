import type {
  ApiResult,
  CreatePostSaleFromProductionPayload,
  DeliveryChecklistPayload,
  DeliveryTermPayload,
  FinalDocumentPayload,
  FutureOpportunityPayload,
  PostSaleBundleResponse,
  SatisfactionSurveyPayload,
} from "./postSaleTypes";
import {
  getAuthHeaders,
  normalizeChecklistItem,
  normalizeDelivery,
  normalizeDocument,
  normalizeEvent,
  normalizeOpportunity,
} from "./postSaleUtils";

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

function normalizeBundle(raw: any): PostSaleBundleResponse {
  const deliveryRaw = raw?.delivery || raw?.data?.delivery || null;
  const checklist = raw?.checklist || raw?.data?.checklist || [];
  const terms = raw?.terms || raw?.deliveryTerms || raw?.data?.terms || [];
  const documents = raw?.documents || raw?.finalDocuments || raw?.data?.documents || [];
  const surveys = raw?.surveys || raw?.satisfactionSurveys || raw?.data?.surveys || [];
  const testimonialRequests = raw?.testimonialRequests || raw?.testimonials || raw?.data?.testimonialRequests || [];
  const opportunities = raw?.opportunities || raw?.futureOpportunities || raw?.data?.opportunities || [];
  const events = raw?.events || raw?.timeline || raw?.data?.events || [];

  return {
    delivery: deliveryRaw ? normalizeDelivery(deliveryRaw) : null,
    checklist: checklist.map(normalizeChecklistItem),
    terms,
    documents: documents.map(normalizeDocument),
    surveys,
    testimonialRequests,
    opportunities: opportunities.map(normalizeOpportunity),
    events: events.map(normalizeEvent),
  };
}

export async function fetchPostSaleBundle(projectId: string): Promise<ApiResult<PostSaleBundleResponse>> {
  const query = new URLSearchParams();
  query.set("projectId", projectId);

  const response = await fetch(`/api/arch/pos-venda?${query.toString()}`, {
    method: "GET",
    headers: getAuthHeaders(),
  });

  const result = await parseResponse<any>(response);
  if (result.error) return { error: result.error };

  return { data: normalizeBundle(result.data) };
}

export async function createPostSaleFromProduction(payload: CreatePostSaleFromProductionPayload): Promise<ApiResult<PostSaleBundleResponse>> {
  const response = await fetch("/api/arch/pos-venda/from-production", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });

  const result = await parseResponse<any>(response);
  if (result.error) return { error: result.error };

  return { data: normalizeBundle(result.data) };
}

export async function createChecklistItem(payload: DeliveryChecklistPayload): Promise<ApiResult<any>> {
  const response = await fetch("/api/arch/pos-venda/delivery-checklist", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });

  return parseResponse<any>(response);
}

export async function updateChecklistItem(id: string, payload: Partial<DeliveryChecklistPayload>): Promise<ApiResult<any>> {
  const response = await fetch(`/api/arch/pos-venda/delivery-checklist/${id}`, {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });

  return parseResponse<any>(response);
}

export async function createDeliveryTerm(payload: DeliveryTermPayload): Promise<ApiResult<any>> {
  const response = await fetch("/api/arch/pos-venda/delivery-term", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });

  return parseResponse<any>(response);
}

export async function acceptDeliveryTerm(termId: string, payload: { acceptedBy?: string; signatureUrl?: string }): Promise<ApiResult<any>> {
  const response = await fetch(`/api/arch/pos-venda/delivery-term/${termId}/accept`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });

  return parseResponse<any>(response);
}

export async function createFinalDocument(payload: FinalDocumentPayload): Promise<ApiResult<any>> {
  const response = await fetch("/api/arch/pos-venda/final-documents", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });

  return parseResponse<any>(response);
}

export async function sendSatisfactionSurvey(payload: SatisfactionSurveyPayload): Promise<ApiResult<any>> {
  const response = await fetch("/api/arch/pos-venda/satisfaction", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });

  return parseResponse<any>(response);
}

export async function requestTestimonial(payload: { deliveryId: string; projectId: string; channel: "portal" | "email" | "whatsapp" | "manual"; message: string }): Promise<ApiResult<any>> {
  const response = await fetch("/api/arch/pos-venda/testimonial-request", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });

  return parseResponse<any>(response);
}

export async function createFutureOpportunity(payload: FutureOpportunityPayload): Promise<ApiResult<any>> {
  const response = await fetch("/api/arch/pos-venda/opportunities", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });

  return parseResponse<any>(response);
}

export async function updateFutureOpportunity(id: string, payload: Partial<FutureOpportunityPayload>): Promise<ApiResult<any>> {
  const response = await fetch(`/api/arch/pos-venda/opportunities/${id}`, {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });

  return parseResponse<any>(response);
}
