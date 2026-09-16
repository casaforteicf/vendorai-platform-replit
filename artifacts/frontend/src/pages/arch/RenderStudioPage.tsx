import { useEffect, useMemo, useState } from "react";
import LegacyRenderStudioPage from "./RenderStudioPageLegacy";
import { useRenderStudioPersistentBootstrap } from "@/modules/arqdor/hooks/useRenderStudioPersistentBootstrap";
import type { RenderStudioVersion } from "@/modules/arqdor/hooks/renderStudioPersistentAdapter";

const SK = {
  step: "arq_studio_step",
  ambiente: "arq_studio_ambiente",
  renderId: "arq_studio_renderId",
  renderUrl: "arq_studio_renderUrl",
  versions: "arq_studio_versions",
  approvedVersionId: "arq_studio_approvedVersionId",
} as const;

function reviveDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

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
        createdAt: reviveDate(version.createdAt) ?? new Date(0),
        selectionLabel: version.selectionLabel,
        materialId: version.materialId,
        materialName: version.materialName,
        approvedBy: version.approvedBy,
        approvedAt: reviveDate(version.approvedAt),
        approvalNote: version.approvalNote,
        costEstimateUsd: version.costEstimateUsd,
      }));
  } catch {
    return [];
  }
}

function findApprovedVersion(state: {
  versions: RenderStudioVersion[];
  approvedVersionId: string | null;
}) {
  return state.versions.find((version) => version.id === state.approvedVersionId)
    ?? state.versions.find((version) => Boolean(version.approvedBy && version.approvedAt))
    ?? null;
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

    // The legacy Studio still keeps approval UI state locally. Until that
    // monolith is retired, never remount an already-approved render on the
    // approval action itself: hydrate directly into Specification instead.
    if (findApprovedVersion(state) && sessionStorage.getItem(SK.step) === "aprovar") {
      sessionStorage.setItem(SK.step, "especificacao");
    }
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
 *
 * Approval is also restored from the persisted version. Because the legacy
 * inner Studio still owns a local approvalRecord, approved renders are kept
 * out of the approval action and a persisted approval badge remains visible.
 */
export default function RenderStudioPage() {
  const [projectId, setProjectId] = useState<string | null>(() => localStorage.getItem("arq_last_project_id"));
  const [ambiente, setAmbiente] = useState(() => sessionStorage.getItem(SK.ambiente) ?? "");
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);
  const [approvalRedirectEpoch, setApprovalRedirectEpoch] = useState(0);

  const recoveryCache = useMemo(() => ({
    versions: readCachedVersions(),
    renderId: sessionStorage.getItem(SK.renderId),
    renderUrl: sessionStorage.getItem(SK.renderUrl),
  }), [projectId, ambiente]);

  const bootstrap = useRenderStudioPersistentBootstrap(projectId, ambiente, recoveryCache);
  const targetKey = `${projectId ?? "no-project"}:${ambiente}`;
  const approvedVersion = useMemo(
    () => findApprovedVersion(bootstrap.state),
    [bootstrap.state],
  );

  useEffect(() => {
    const interval = window.setInterval(() => {
      const nextProjectId = localStorage.getItem("arq_last_project_id");
      const nextAmbiente = sessionStorage.getItem(SK.ambiente) ?? "";
      setProjectId((current) => current === nextProjectId ? current : nextProjectId);
      setAmbiente((current) => current === nextAmbiente ? current : nextAmbiente);
    }, 400);
    return () => window.clearInterval(interval);
  }, []);

  // If an already-approved version is reopened and the legacy sidebar sends
  // the user back to "Aprovar", move back to Specification and remount. This
  // prevents duplicate approval requests while the backend approval remains
  // the source of truth.
  useEffect(() => {
    if (!approvedVersion) return;
    const interval = window.setInterval(() => {
      if (sessionStorage.getItem(SK.step) !== "aprovar") return;
      sessionStorage.setItem(SK.step, "especificacao");
      setApprovalRedirectEpoch((value) => value + 1);
    }, 250);
    return () => window.clearInterval(interval);
  }, [approvedVersion?.id]);

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

  const approvedAt = reviveDate(approvedVersion?.approvedAt);
  const approvalTitle = approvedVersion
    ? [
        `Aprovado por ${approvedVersion.approvedBy ?? "usuário autenticado"}`,
        approvedAt ? approvedAt.toLocaleString("pt-BR") : null,
        approvedVersion.approvalNote || null,
      ].filter(Boolean).join(" · ")
    : "";

  return (
    <>
      <LegacyRenderStudioPage key={`${targetKey}:${approvalRedirectEpoch}`} />
      {approvedVersion && (
        <div
          role="status"
          title={approvalTitle}
          style={{
            position: "fixed",
            right: 316,
            top: 60,
            zIndex: 240,
            maxWidth: 360,
            padding: "7px 10px",
            borderRadius: 8,
            background: "rgba(6, 78, 59, 0.94)",
            border: "1px solid rgba(16, 185, 129, 0.55)",
            boxShadow: "0 8px 24px rgba(0,0,0,.28)",
            color: "#D1FAE5",
            fontSize: 10,
            fontWeight: 700,
            pointerEvents: "none",
          }}
        >
          ✓ Versão aprovada · {approvedVersion.approvedBy ?? "usuário autenticado"}
          {approvedAt ? ` · ${approvedAt.toLocaleDateString("pt-BR")}` : ""}
        </div>
      )}
    </>
  );
}
