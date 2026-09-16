import { useEffect, useMemo, useState } from "react";
import LegacyRenderStudioPage from "./RenderStudioPageLegacy";
import { useRenderStudioPersistentBootstrap } from "@/modules/arqdor/hooks/useRenderStudioPersistentBootstrap";
import type { RenderStudioVersion } from "@/modules/arqdor/hooks/renderStudioPersistentAdapter";

const SK = {
  ambiente: "arq_studio_ambiente",
  renderId: "arq_studio_renderId",
  renderUrl: "arq_studio_renderUrl",
  versions: "arq_studio_versions",
  approvedVersionId: "arq_studio_approvedVersionId",
} as const;

function readCachedVersions(): RenderStudioVersion[] {
  const raw = sessionStorage.getItem(SK.versions);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Array<Partial<RenderStudioVersion>>;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((version): version is Partial<RenderStudioVersion> & { id: string; url: string } => Boolean(version?.id && version?.url))
      .map((version) => ({
        id: version.id,
        url: version.url,
        label: version.label ?? "Versão recuperada",
        parentVersionId: version.parentVersionId,
        operationType: version.operationType ?? (version.parentVersionId ? "improve" : "initial"),
        createdAt: version.createdAt ? new Date(version.createdAt) : new Date(0),
        selectionLabel: version.selectionLabel,
        materialId: version.materialId,
        materialName: version.materialName,
        approvedBy: version.approvedBy,
        approvedAt: version.approvedAt ? new Date(version.approvedAt) : undefined,
        approvalNote: version.approvalNote,
        costEstimateUsd: version.costEstimateUsd,
      }));
  } catch {
    return [];
  }
}

function persistBootstrapState(state: {
  versions: RenderStudioVersion[];
  latestRenderId: string | null;
  latestRenderUrl: string | null;
  approvedVersionId: string | null;
}) {
  try {
    sessionStorage.setItem(SK.versions, JSON.stringify(state.versions));
    if (state.latestRenderId) sessionStorage.setItem(SK.renderId, state.latestRenderId);
    else sessionStorage.removeItem(SK.renderId);
    if (state.latestRenderUrl) sessionStorage.setItem(SK.renderUrl, state.latestRenderUrl);
    else sessionStorage.removeItem(SK.renderUrl);
    if (state.approvedVersionId) sessionStorage.setItem(SK.approvedVersionId, state.approvedVersionId);
    else sessionStorage.removeItem(SK.approvedVersionId);
  } catch {
    // Recovery cache is best-effort only. Backend remains the source of truth.
  }
}

/**
 * Persistent entry point for Render Studio.
 *
 * The existing Studio stays untouched. This wrapper hydrates its legacy
 * session cache from the backend before mounting it. When the active project
 * or environment changes, it re-hydrates and remounts the Studio with the
 * persisted version history.
 */
export default function RenderStudioPage() {
  const [projectId, setProjectId] = useState<string | null>(() => localStorage.getItem("arq_last_project_id"));
  const [ambiente, setAmbiente] = useState(() => sessionStorage.getItem(SK.ambiente) ?? "");
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);

  const recoveryCache = useMemo(() => ({
    versions: readCachedVersions(),
    renderId: sessionStorage.getItem(SK.renderId),
    renderUrl: sessionStorage.getItem(SK.renderUrl),
  }), [projectId, ambiente]);

  const bootstrap = useRenderStudioPersistentBootstrap(projectId, ambiente, recoveryCache);
  const targetKey = `${projectId ?? "no-project"}:${ambiente}`;

  useEffect(() => {
    const interval = window.setInterval(() => {
      const nextProjectId = localStorage.getItem("arq_last_project_id");
      const nextAmbiente = sessionStorage.getItem(SK.ambiente) ?? "";
      setProjectId((current) => current === nextProjectId ? current : nextProjectId);
      setAmbiente((current) => current === nextAmbiente ? current : nextAmbiente);
    }, 400);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    setHydratedKey(null);
  }, [projectId, ambiente]);

  useEffect(() => {
    if (!projectId) {
      setHydratedKey(targetKey);
      return;
    }

    const backendLoaded = bootstrap.loadedProjectId === projectId;
    const canUseRecovery = Boolean(bootstrap.error) || bootstrap.hasRecoveryOnly;
    if (!backendLoaded && !canUseRecovery) return;

    persistBootstrapState(bootstrap.state);
    setHydratedKey(targetKey);
  }, [projectId, targetKey, bootstrap.loadedProjectId, bootstrap.error, bootstrap.hasRecoveryOnly, bootstrap.state]);

  if (hydratedKey !== targetKey) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#060911", color: "#A78BFA", fontFamily: "Inter, sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", border: "2px solid #253347", borderTopColor: "#7C3AED", animation: "arq-persistent-spin .7s linear infinite" }} />
          <span style={{ fontSize: 12, fontWeight: 700 }}>Carregando histórico do projeto…</span>
          <style>{`@keyframes arq-persistent-spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      </div>
    );
  }

  return <LegacyRenderStudioPage key={targetKey} />;
}
