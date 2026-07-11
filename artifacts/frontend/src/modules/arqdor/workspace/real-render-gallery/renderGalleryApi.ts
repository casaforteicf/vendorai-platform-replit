import type {
  AdjustRenderPayload,
  ApiResult,
  ApproveRenderPayload,
  RenderGalleryItem,
  RenderGalleryResponse,
  SendToSpecificationPayload,
} from "./renderGalleryTypes";
import { getAuthHeaders } from "./renderGalleryUtils";

const jsonHeaders = () => ({
  "Content-Type": "application/json",
  ...getAuthHeaders(),
});

async function parseResponse<T>(response: Response): Promise<ApiResult<T>> {
  const text = await response.text();
  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    return { error: `Erro HTTP ${response.status}` };
  }

  if (!response.ok) {
    return {
      error: payload?.message || payload?.error || `Erro HTTP ${response.status}`,
    };
  }

  return { data: payload as T };
}

export async function fetchRenderGallery(projectId: string): Promise<ApiResult<RenderGalleryResponse>> {
  const query = new URLSearchParams();
  if (projectId) query.set("projectId", projectId);

  const response = await fetch(`/arch/renders/gallery?${query.toString()}`, {
    method: "GET",
    headers: getAuthHeaders(),
  });

  const result = await parseResponse<any>(response);

  if (result.error) return { error: result.error };

  const raw = result.data;
  const items = Array.isArray(raw) ? raw : raw?.items || raw?.renders || raw?.data || [];

  return {
    data: {
      items: items.map(normalizeRenderItem),
      total: raw?.total || items.length,
    },
  };
}

export async function adjustRender(
  renderId: string,
  payload: AdjustRenderPayload,
): Promise<ApiResult<RenderGalleryItem>> {
  const response = await fetch(`/arch/ai-render/${renderId}/adjust`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({
      ...payload,
      createNewVersion: true,
      preserveGeometry: payload.preserveGeometry ?? true,
      preserveCamera: payload.preserveCamera ?? true,
    }),
  });

  const result = await parseResponse<any>(response);
  if (result.error) return { error: result.error };

  return { data: normalizeRenderItem(result.data?.render || result.data?.data || result.data) };
}

export async function approveRender(payload: ApproveRenderPayload): Promise<ApiResult<RenderGalleryItem>> {
  const response = await fetch(`/arch/ai-render/${payload.renderId}/approve`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });

  const result = await parseResponse<any>(response);
  if (result.error) return { error: result.error };

  return { data: normalizeRenderItem(result.data?.render || result.data?.data || result.data) };
}

export async function sendRenderToSpecification(payload: SendToSpecificationPayload): Promise<ApiResult<{ ok: boolean; specificationId?: string }>> {
  const response = await fetch(`/arch/ai-render/${payload.renderId}/send-to-specification`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });

  return parseResponse<{ ok: boolean; specificationId?: string }>(response);
}

export function normalizeRenderItem(raw: any): RenderGalleryItem {
  return {
    id: String(raw?.id || raw?._id || raw?.renderId || crypto.randomUUID()),
    projectId: String(raw?.projectId || raw?.projetoId || raw?.project_id || ""),
    ambienteId: raw?.ambienteId || raw?.ambiente_id || null,
    cenaId: raw?.cenaId || raw?.cena_id || null,
    parentRenderId: raw?.parentRenderId || raw?.parent_render_id || raw?.parentId || null,
    kind: raw?.kind || raw?.type || "original",
    status: raw?.status || "completed",
    title: raw?.title || raw?.name || raw?.label || "Render",
    prompt: raw?.prompt || raw?.inputPrompt || null,
    imageUrl: raw?.imageUrl || raw?.image_url || raw?.url || raw?.outputUrl || raw?.renderUrl || "",
    thumbUrl: raw?.thumbUrl || raw?.thumbnailUrl || raw?.thumb_url || null,
    createdAt: raw?.createdAt || raw?.created_at || new Date().toISOString(),
    updatedAt: raw?.updatedAt || raw?.updated_at || null,
    engine: raw?.engine || raw?.provider || null,
    materialChanges: raw?.materialChanges || raw?.material_changes || [],
    metadata: raw?.metadata || raw,
  };
}
