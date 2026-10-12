import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type PersistentRenderOperationType = "initial" | "material" | "lighting" | "improve" | "approved";

export type PersistentRenderSelection = {
  id?: string;
  label?: string;
  surfaceKey?: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type PersistentRenderVersion = {
  id: string;
  projectId: string | null;
  parentRenderId: string | null;
  ambiente: string;
  mode: string;
  status: string | null;
  versionTag: string | null;
  operationType: PersistentRenderOperationType | null;
  materialId: string | null;
  materialName: string | null;
  selectionMetadata: PersistentRenderSelection[];
  costEstimateUsd: string | null;
  approvalNote: string | null;
  prompt: string | null;
  motor: string | null;
  originalImageUrl: string | null;
  resultImageUrl: string | null;
  displayUrl: string | null;
  fileAvailable: boolean;
  maskZones: string[];
  maskFileUrl: string | null;
  composited: boolean;
  segmentationConfidence: Record<string, number> | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  completedAt: Date | null;
  versionNumber: number;
};

type ApiRenderVersion = {
  id: string;
  project_id?: string | null;
  parent_render_id?: string | null;
  ambiente?: string | null;
  mode?: string | null;
  status?: string | null;
  version_tag?: string | null;
  operation_type?: PersistentRenderOperationType | null;
  material_id?: string | null;
  material_name?: string | null;
  selection_metadata?: PersistentRenderSelection[] | null;
  cost_estimate_usd?: string | number | null;
  approval_note?: string | null;
  prompt?: string | null;
  motor?: string | null;
  original_image_url?: string | null;
  result_image_url?: string | null;
  display_url?: string | null;
  file_available?: boolean | null;
  mask_zones?: string[] | null;
  mask_file_url?: string | null;
  composited?: boolean | null;
  segmentation_confidence?: Record<string, number> | null;
  approved_by?: string | null;
  approved_at?: string | null;
  created_at?: string | null;
  concluido_em?: string | null;
  version_number?: number | null;
};

type HistoryResponse = {
  success?: boolean;
  versions?: ApiRenderVersion[];
};

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("vendorai_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function mapVersion(v: ApiRenderVersion, index: number): PersistentRenderVersion {
  return {
    id: v.id,
    projectId: v.project_id ?? null,
    parentRenderId: v.parent_render_id ?? null,
    ambiente: v.ambiente ?? "",
    mode: v.mode ?? "preservar",
    status: v.status ?? null,
    versionTag: v.version_tag ?? null,
    operationType: v.operation_type ?? null,
    materialId: v.material_id ?? null,
    materialName: v.material_name ?? null,
    selectionMetadata: Array.isArray(v.selection_metadata) ? v.selection_metadata : [],
    costEstimateUsd: v.cost_estimate_usd == null ? null : String(v.cost_estimate_usd),
    approvalNote: v.approval_note ?? null,
    prompt: v.prompt ?? null,
    motor: v.motor ?? null,
    originalImageUrl: v.original_image_url ?? null,
    resultImageUrl: v.result_image_url ?? null,
    displayUrl: v.display_url ?? v.result_image_url ?? null,
    fileAvailable: v.file_available !== false,
    maskZones: Array.isArray(v.mask_zones) ? v.mask_zones : [],
    maskFileUrl: v.mask_file_url ?? null,
    composited: Boolean(v.composited),
    segmentationConfidence: v.segmentation_confidence ?? null,
    approvedBy: v.approved_by ?? null,
    approvedAt: v.approved_at ? new Date(v.approved_at) : null,
    createdAt: v.created_at ? new Date(v.created_at) : new Date(0),
    completedAt: v.concluido_em ? new Date(v.concluido_em) : null,
    versionNumber: v.version_number ?? index + 1,
  };
}

/**
 * Fonte oficial do histórico de versões do Render Studio.
 *
 * O backend (arch_ai_renders) é a fonte de verdade. sessionStorage/localStorage
 * podem continuar sendo usados pelo Studio apenas como cache/recovery de UI.
 */
export function usePersistentRenderHistory(projectId: string | null | undefined, ambiente?: string) {
  const [versions, setVersions] = useState<PersistentRenderVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedProjectId, setLoadedProjectId] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const normalizedAmbiente = useMemo(
    () => (ambiente ?? "").trim().toLowerCase().replace(/\s+/g, "_"),
    [ambiente],
  );

  const reload = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (!projectId) {
      setVersions([]);
      setLoadedProjectId(null);
      setError(null);
      return [] as PersistentRenderVersion[];
    }

    setLoading(true);
    setError(null);
    setVersions([]);
    setLoadedProjectId(null);
    try {
      const params = new URLSearchParams({ project_id: projectId });
      if (normalizedAmbiente) params.set("ambiente", normalizedAmbiente);

      const response = await fetch(`/api/arch/ai-renders?${params.toString()}`, {
        headers: authHeaders(),
      });
      const payload = (await response.json().catch(() => ({}))) as HistoryResponse & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || `Erro ${response.status} ao carregar histórico de renders`);
      }

      const mapped = (payload.versions ?? []).map(mapVersion);
      if (requestId !== requestIdRef.current) return [] as PersistentRenderVersion[];
      setVersions(mapped);
      setLoadedProjectId(projectId);
      return mapped;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Não foi possível carregar o histórico de renders";
      if (requestId === requestIdRef.current) setError(message);
      return [] as PersistentRenderVersion[];
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [projectId, normalizedAmbiente]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const completedVersions = useMemo(
    () => versions.filter(v => v.status === "concluido" && v.fileAvailable && Boolean(v.displayUrl || v.resultImageUrl)),
    [versions],
  );

  const approvedVersion = useMemo(
    () => [...versions].reverse().find(v => v.fileAvailable && (v.operationType === "approved" || v.versionTag === "aprovado" || Boolean(v.approvedAt))) ?? null,
    [versions],
  );

  const latestVersion = useMemo(
    () => [...versions].reverse().find(v => v.status === "concluido" && v.fileAvailable && Boolean(v.displayUrl || v.resultImageUrl)) ?? null,
    [versions],
  );

  const versionsByParent = useMemo(() => {
    const tree = new Map<string | null, PersistentRenderVersion[]>();
    for (const version of versions) {
      const key = version.parentRenderId ?? null;
      const children = tree.get(key) ?? [];
      children.push(version);
      tree.set(key, children);
    }
    return tree;
  }, [versions]);

  return {
    versions,
    completedVersions,
    approvedVersion,
    latestVersion,
    versionsByParent,
    loading,
    error,
    loadedProjectId,
    reload,
  };
}
