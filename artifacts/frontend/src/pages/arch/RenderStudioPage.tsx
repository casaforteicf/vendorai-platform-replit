import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
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

const ENVIRONMENTS = new Set([
  "Sala de Estar",
  "Quarto Master",
  "Cozinha",
  "Banheiro",
  "Escritório",
  "Varanda",
  "Hall de Entrada",
]);

const SHELL_STYLES = `
  .arqdor-studio-v3 {
    position: relative;
    height: 100vh;
    overflow: hidden;
    background: #060911;
  }

  .arqdor-studio-v3 .arqdor-back-btn {
    position: fixed;
    top: 8px;
    left: 10px;
    z-index: 1200;
    height: 31px;
    padding: 0 11px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border-radius: 7px;
    border: 1px solid #253347;
    background: rgba(12,17,32,.97);
    color: #dbe5f0;
    font: 700 11px/1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    cursor: pointer;
    box-shadow: 0 6px 20px rgba(0,0,0,.24);
    transition: background .15s ease, border-color .15s ease, transform .15s ease;
  }

  .arqdor-studio-v3 .arqdor-back-btn:hover {
    background: #111827;
    border-color: #7c3aed;
    transform: translateY(-1px);
  }

  .arqdor-studio-v3 .arqdor-legacy-topbar {
    height: 48px !important;
    min-height: 48px !important;
    padding-left: 94px !important;
    padding-right: 12px !important;
    box-shadow: 0 1px 0 rgba(255,255,255,.02);
  }

  .arqdor-studio-v3 .arqdor-legacy-topbar .arqdor-shell-hidden {
    display: none !important;
  }

  .arqdor-studio-v3 .arqdor-legacy-topbar .arqdor-topbar-brand {
    margin-right: 10px !important;
  }

  .arqdor-studio-v3 .arqdor-legacy-sidebar {
    width: 184px !important;
    min-width: 184px !important;
  }

  .arqdor-studio-v3 .arqdor-legacy-sidebar > div:first-child {
    padding: 9px 10px !important;
  }

  .arqdor-studio-v3 .arqdor-sidebar-hidden-group {
    display: none !important;
  }

  .arqdor-studio-v3 .arqdor-legacy-sidebar > div:nth-child(2) {
    overflow: hidden !important;
    padding-top: 5px !important;
  }

  .arqdor-studio-v3 .arqdor-studio-step {
    min-height: 36px;
    padding-top: 7px !important;
    padding-bottom: 7px !important;
  }

  .arqdor-studio-v3 .arqdor-studio-step::after {
    content: attr(data-step-number);
    margin-left: auto;
    min-width: 18px;
    height: 18px;
    border-radius: 999px;
    border: 1px solid #1e2a3a;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #52657b;
    font-size: 8px;
    font-weight: 800;
  }

  .arqdor-studio-v3 .arqdor-studio-step[aria-current="step"]::after {
    color: #c4b5fd;
    border-color: rgba(124,58,237,.65);
    background: rgba(124,58,237,.15);
  }

  .arqdor-studio-v3 .arqdor-canvas-toolbar {
    top: 10px !important;
    padding: 3px !important;
    gap: 2px !important;
    border-radius: 9px !important;
    background: rgba(12,17,32,.84) !important;
    backdrop-filter: blur(10px);
    box-shadow: 0 8px 24px rgba(0,0,0,.2);
  }

  .arqdor-studio-v3 .arqdor-canvas-toolbar button {
    min-height: 27px;
    padding: 4px 9px !important;
  }

  .arqdor-studio-v3 .arqdor-legacy-right-panel > div {
    width: 280px !important;
  }

  .arqdor-studio-v3 .arqdor-legacy-right-panel .arqdor-properties-scroll {
    padding: 10px !important;
    gap: 9px !important;
  }

  .arqdor-studio-v3 .arqdor-environment-picker {
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 7px !important;
  }

  .arqdor-studio-v3 .arqdor-environment-picker > div:first-child,
  .arqdor-studio-v3 .arqdor-environment-picker > input,
  .arqdor-studio-v3 .arqdor-environment-picker > .arqdor-env-cta {
    grid-column: 1 / -1;
  }

  .arqdor-studio-v3 .arqdor-environment-picker > button:not(.arqdor-env-cta) {
    min-height: 38px;
    padding: 7px 8px !important;
    text-align: center !important;
    line-height: 1.25;
  }

  .arqdor-studio-v3 .arqdor-environment-picker > input {
    margin-top: 2px;
  }

  .arqdor-studio-v3 .arqdor-env-cta {
    margin-top: 3px;
    min-height: 38px;
  }

  .arqdor-studio-v3 .arqdor-legacy-bottom-panel {
    box-shadow: 0 -12px 30px rgba(0,0,0,.18);
    border-top-color: rgba(37,51,71,.9) !important;
  }

  .arqdor-studio-v3 .arqdor-legacy-bottom-panel > div:first-child {
    min-height: 36px;
    background: rgba(12,17,32,.98);
  }

  .arqdor-studio-v3 .arqdor-legacy-bottom-panel input[aria-label="Filtrar versões"] {
    height: 26px;
  }

  .arqdor-studio-v3 .arqdor-step-confirm-banner {
    display: none !important;
  }

  .arqdor-studio-v3 .arqdor-approved-badge {
    position: fixed;
    right: 296px;
    top: 56px;
    z-index: 240;
    max-width: 360px;
    padding: 7px 10px;
    border-radius: 8px;
    background: rgba(6,78,59,.94);
    border: 1px solid rgba(16,185,129,.55);
    box-shadow: 0 8px 24px rgba(0,0,0,.28);
    color: #d1fae5;
    font-size: 10px;
    font-weight: 700;
    pointer-events: none;
  }

  @media (max-width: 1180px) {
    .arqdor-studio-v3 .arqdor-legacy-sidebar {
      width: 166px !important;
      min-width: 166px !important;
    }
    .arqdor-studio-v3 .arqdor-legacy-right-panel > div {
      width: 258px !important;
    }
    .arqdor-studio-v3 .arqdor-approved-badge {
      right: 274px;
    }
  }

  @media (max-width: 899px) {
    .arqdor-studio-v3 .arqdor-back-btn {
      display: none;
    }
  }
`;

function textOf(el: Element | null) {
  return (el?.textContent ?? "").replace(/\s+/g, " ").trim();
}

function tagStudioChrome(root: HTMLElement) {
  const divChildren = Array.from(root.children).filter((el): el is HTMLElement => el instanceof HTMLElement && el.tagName === "DIV");
  const topbar = divChildren[0];
  const workspace = divChildren[1];

  if (topbar) {
    topbar.classList.add("arqdor-legacy-topbar");
    const topbarChildren = Array.from(topbar.children).filter((el): el is HTMLElement => el instanceof HTMLElement);
    topbarChildren[0]?.classList.add("arqdor-topbar-brand");
    topbar.querySelectorAll<HTMLElement>('[aria-disabled="true"]').forEach((el) => el.classList.add("arqdor-shell-hidden"));
  }

  if (!workspace) return;
  workspace.classList.add("arqdor-legacy-workspace");
  const workspaceDivs = Array.from(workspace.children).filter((el): el is HTMLElement => el instanceof HTMLElement && el.tagName === "DIV");
  const sidebar = workspaceDivs[0];
  const rightPanel = workspaceDivs[workspaceDivs.length - 1];
  const centerPanel = workspaceDivs.length >= 2 ? workspaceDivs[workspaceDivs.length - 2] : undefined;

  if (sidebar) {
    sidebar.classList.add("arqdor-legacy-sidebar");
    const nav = sidebar.children[1];
    if (nav instanceof HTMLElement) {
      Array.from(nav.children).forEach((group, groupIndex) => {
        if (!(group instanceof HTMLElement)) return;
        if (groupIndex > 0) {
          group.classList.add("arqdor-sidebar-hidden-group");
          return;
        }
        Array.from(group.querySelectorAll<HTMLButtonElement>("button")).forEach((button, index) => {
          button.classList.add("arqdor-studio-step");
          button.dataset.stepNumber = String(index + 1).padStart(2, "0");
        });
      });
    }
  }

  if (rightPanel) {
    rightPanel.classList.add("arqdor-legacy-right-panel");
    const innerPanel = Array.from(rightPanel.children).find((el): el is HTMLElement => el instanceof HTMLElement);
    if (innerPanel) {
      const scrollAreas = Array.from(innerPanel.children).filter((el): el is HTMLElement => el instanceof HTMLElement);
      const propsScroll = scrollAreas.find((el) => el.style.overflowY === "auto");
      propsScroll?.classList.add("arqdor-properties-scroll");

      rightPanel.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
        if (!ENVIRONMENTS.has(textOf(button))) return;
        const picker = button.parentElement;
        if (!picker) return;
        picker.classList.add("arqdor-environment-picker");
        Array.from(picker.children).forEach((child) => {
          if (!(child instanceof HTMLElement)) return;
          if (child.tagName === "BUTTON" && textOf(child).includes("Continuar")) child.classList.add("arqdor-env-cta");
        });
      });
    }
  }

  if (centerPanel instanceof HTMLElement) {
    const canvasToolbarButton = centerPanel.querySelector<HTMLElement>("[data-canvas-action]");
    canvasToolbarButton?.parentElement?.classList.add("arqdor-canvas-toolbar");

    const bottomPanel = Array.from(centerPanel.children).find((el) =>
      el instanceof HTMLElement && el.querySelector('button[aria-label="Recolher"], button[aria-label="Expandir"]')
    );
    if (bottomPanel instanceof HTMLElement) bottomPanel.classList.add("arqdor-legacy-bottom-panel");
  }

  const confirmBanner = Array.from(root.querySelectorAll<HTMLElement>('[role="alertdialog"]')).find((el) => textOf(el).startsWith("Voltar para"));
  if (confirmBanner) {
    confirmBanner.classList.add("arqdor-step-confirm-banner");
    if (confirmBanner.dataset.autoConfirmed !== "true") {
      confirmBanner.dataset.autoConfirmed = "true";
      const confirmButton = Array.from(confirmBanner.querySelectorAll<HTMLButtonElement>("button")).find((button) => textOf(button) === "Confirmar");
      window.queueMicrotask(() => confirmButton?.click());
    }
  }
}

function getActiveStudioStep(root: HTMLElement): string {
  const active = root.querySelector<HTMLElement>('.arqdor-studio-step[aria-current="step"]');
  return textOf(active).replace(/^✓\s*/, "");
}

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
 * session cache from the backend before mounting it. The visual shell below
 * only reorganizes chrome around the canvas and keeps render/version logic intact.
 */
export default function RenderStudioPage() {
  const shellRef = useRef<HTMLDivElement>(null);
  const initialDrawerHandledRef = useRef(false);
  const previousStepRef = useRef("");
  const [, setLocation] = useLocation();
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

  useEffect(() => {
    if (hydratedKey !== targetKey) return;

    const enhance = () => {
      const shell = shellRef.current;
      if (!shell) return;
      const root = Array.from(shell.querySelectorAll<HTMLElement>("div")).find((el) =>
        el.style.height === "100vh" && el.style.display === "flex" && el.style.flexDirection === "column"
      );
      if (!root) return;

      tagStudioChrome(root);

      const activeStep = getActiveStudioStep(root);
      const collapseBottom = root.querySelector<HTMLButtonElement>('button[aria-label="Recolher"]');
      const expandBottom = root.querySelector<HTMLButtonElement>('button[aria-label="Expandir"]');

      if (!initialDrawerHandledRef.current) {
        initialDrawerHandledRef.current = true;
        collapseBottom?.click();
      }

      if (activeStep && activeStep !== previousStepRef.current) {
        if (activeStep.includes("Versões")) expandBottom?.click();
        previousStepRef.current = activeStep;
      }
    };

    const timer = window.setTimeout(enhance, 50);
    const observer = new MutationObserver(() => window.requestAnimationFrame(enhance));
    if (shellRef.current) {
      observer.observe(shellRef.current, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["aria-current", "aria-label"],
      });
    }

    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [hydratedKey, targetKey, approvalRedirectEpoch]);

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

  function handleBack() {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    setLocation("/arch/projetos");
  }

  return (
    <div ref={shellRef} className="arqdor-studio-v3">
      <style>{SHELL_STYLES}</style>
      <button className="arqdor-back-btn" onClick={handleBack} aria-label="Voltar para a tela anterior" title="Voltar para a tela anterior">
        <span aria-hidden="true">←</span>
        Voltar
      </button>

      <LegacyRenderStudioPage key={`${targetKey}:${approvalRedirectEpoch}`} />

      {approvedVersion && (
        <div role="status" title={approvalTitle} className="arqdor-approved-badge">
          ✓ Versão aprovada · {approvedVersion.approvedBy ?? "usuário autenticado"}
          {approvedAt ? ` · ${approvedAt.toLocaleDateString("pt-BR")}` : ""}
        </div>
      )}
    </div>
  );
}
