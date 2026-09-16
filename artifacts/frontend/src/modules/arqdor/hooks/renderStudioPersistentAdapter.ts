import type { PersistentRenderVersion } from "./usePersistentRenderHistory";

export type RenderStudioVersion = {
  id: string;
  url: string;
  label: string;
  parentVersionId?: string;
  operationType: "initial" | "material" | "lighting" | "improve" | "approved";
  createdAt: Date;
  selectionLabel?: string;
  materialId?: string;
  materialName?: string;
  approvedBy?: string;
  approvedAt?: Date;
  approvalNote?: string;
  costEstimateUsd?: number;
};

export type RenderStudioPersistentState = {
  versions: RenderStudioVersion[];
  latestRenderId: string | null;
  latestRenderUrl: string | null;
  approvedVersionId: string | null;
};

type CachedVersion = Partial<RenderStudioVersion> & { id?: string; url?: string };

function normalizeOperationType(
  value: PersistentRenderVersion["operationType"],
  approved: boolean,
  parentRenderId: string | null,
): RenderStudioVersion["operationType"] {
  if (approved) return "approved";
  if (value === "material" || value === "lighting" || value === "improve" || value === "initial") return value;
  return parentRenderId ? "improve" : "initial";
}

function versionLabel(version: PersistentRenderVersion, operationType: RenderStudioVersion["operationType"]): string {
  const n = version.versionNumber || 1;
  if (operationType === "approved") return `Versão ${n} · Aprovada`;
  if (operationType === "material") return `Versão ${n} · ${version.materialName || "Material"}`;
  if (operationType === "lighting") return `Versão ${n} · Iluminação`;
  if (operationType === "improve") return `Versão ${n} · Melhoria`;
  return `Versão ${n} · Original`;
}

export function mapPersistentVersionToStudio(version: PersistentRenderVersion): RenderStudioVersion | null {
  if (!version.resultImageUrl || version.status !== "concluido") return null;

  const approved = Boolean(version.approvedAt || version.versionTag === "aprovado");
  const operationType = normalizeOperationType(version.operationType, approved, version.parentRenderId);

  return {
    id: version.id,
    url: version.resultImageUrl,
    label: versionLabel(version, operationType),
    parentVersionId: version.parentRenderId || undefined,
    operationType,
    createdAt: version.createdAt,
    selectionLabel: version.selectionLabel || undefined,
    materialId: version.materialId || undefined,
    materialName: version.materialName || undefined,
    approvedBy: version.approvedBy || undefined,
    approvedAt: version.approvedAt || undefined,
    approvalNote: version.approvalNote || undefined,
    costEstimateUsd: version.costEstimateUsd ?? undefined,
  };
}

/**
 * Converte o histórico do backend para o modelo já consumido pelo Render Studio.
 * A ordem visual atual do Studio é mais recente primeiro; a API mantém a ordem
 * cronológica para reconstrução da árvore, então fazemos a inversão somente aqui.
 */
export function buildRenderStudioPersistentState(
  persistentVersions: PersistentRenderVersion[],
): RenderStudioPersistentState {
  const chronological = persistentVersions
    .map(mapPersistentVersionToStudio)
    .filter((version): version is RenderStudioVersion => Boolean(version));

  const latest = chronological.at(-1) ?? null;
  const approved = [...chronological].reverse().find(version => Boolean(version.approvedAt) || version.operationType === "approved") ?? null;

  return {
    versions: [...chronological].reverse(),
    latestRenderId: latest?.id ?? null,
    latestRenderUrl: latest?.url ?? null,
    approvedVersionId: approved?.id ?? null,
  };
}

/**
 * Cache de recuperação somente. Nunca deve sobrescrever uma versão que já veio
 * do backend. É usado apenas quando a API ainda não devolveu histórico (offline,
 * job ainda não persistido ou recuperação de sessão interrompida).
 */
export function mergeRecoveryCache(
  persistentState: RenderStudioPersistentState,
  cachedVersions: CachedVersion[],
): RenderStudioPersistentState {
  if (persistentState.versions.length > 0) return persistentState;

  const recovered = cachedVersions
    .filter((version): version is CachedVersion & { id: string; url: string } => Boolean(version.id && version.url))
    .map((version, index): RenderStudioVersion => ({
      id: version.id,
      url: version.url,
      label: version.label || `Versão ${cachedVersions.length - index} · Recuperada`,
      parentVersionId: version.parentVersionId,
      operationType: version.operationType || (version.parentVersionId ? "improve" : "initial"),
      createdAt: version.createdAt ? new Date(version.createdAt) : new Date(0),
      selectionLabel: version.selectionLabel,
      materialId: version.materialId,
      materialName: version.materialName,
      approvedBy: version.approvedBy,
      approvedAt: version.approvedAt ? new Date(version.approvedAt) : undefined,
      approvalNote: version.approvalNote,
      costEstimateUsd: version.costEstimateUsd,
    }));

  const latest = recovered[0] ?? null;
  const approved = recovered.find(version => Boolean(version.approvedAt) || version.operationType === "approved") ?? null;

  return {
    versions: recovered,
    latestRenderId: latest?.id ?? null,
    latestRenderUrl: latest?.url ?? null,
    approvedVersionId: approved?.id ?? null,
  };
}
