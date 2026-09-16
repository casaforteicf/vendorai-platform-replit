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
    background: #f8fafc;
    color: #0f172a;
    color-scheme: light;
  }

  .arqdor-studio-v3 .arqdor-back-btn {
    position: fixed;
    top: 8px;
    left: 10px;
    z-index: 1200;
    height: 32px;
    padding: 0 12px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border-radius: 9px;
    border: 1px solid #e2e8f0;
    background: rgba(255,255,255,.98);
    color: #334155;
    font: 700 11px/1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    cursor: pointer;
    box-shadow: 0 4px 14px rgba(15,23,42,.08);
    transition: background .15s ease, border-color .15s ease, color .15s ease, transform .15s ease;
  }

  .arqdor-studio-v3 .arqdor-back-btn:hover {
    background: #fff7ed;
    border-color: #fb923c;
    color: #c2410c;
    transform: translateY(-1px);
  }

  .arqdor-studio-v3 .arqdor-legacy-root,
  .arqdor-studio-v3 .arqdor-legacy-workspace {
    background: #f8fafc !important;
    color: #0f172a !important;
  }

  .arqdor-studio-v3 .arqdor-legacy-topbar {
    height: 50px !important;
    min-height: 50px !important;
    padding-left: 96px !important;
    padding-right: 14px !important;
    background: rgba(255,255,255,.98) !important;
    border-bottom: 1px solid #e2e8f0 !important;
    box-shadow: 0 1px 3px rgba(15,23,42,.04) !important;
    color: #0f172a !important;
  }

  .arqdor-studio-v3 .arqdor-legacy-topbar .arqdor-shell-hidden {
    display: none !important;
  }

  .arqdor-studio-v3 .arqdor-legacy-topbar .arqdor-topbar-brand {
    margin-right: 10px !important;
  }

  .arqdor-studio-v3 .arqdor-legacy-sidebar {
    width: 190px !important;
    min-width: 190px !important;
    background: #ffffff !important;
    border-right: 1px solid #e2e8f0 !important;
    box-shadow: 4px 0 18px rgba(15,23,42,.025) !important;
  }

  .arqdor-studio-v3 .arqdor-legacy-sidebar > div:first-child {
    padding: 10px 11px !important;
    border-bottom-color: #f1f5f9 !important;
  }

  .arqdor-studio-v3 .arqdor-sidebar-hidden-group {
    display: none !important;
  }

  .arqdor-studio-v3 .arqdor-legacy-sidebar > div:nth-child(2) {
    overflow: hidden !important;
    padding-top: 7px !important;
  }

  .arqdor-studio-v3 .arqdor-studio-step {
    min-height: 38px;
    margin: 2px 8px !important;
    padding: 8px 9px !important;
    border-radius: 9px !important;
    color: #475569 !important;
    transition: background .15s ease, color .15s ease, box-shadow .15s ease;
  }

  .arqdor-studio-v3 .arqdor-studio-step:hover {
    background: #fffaf5 !important;
    color: #c2410c !important;
  }

  .arqdor-studio-v3 .arqdor-studio-step[aria-current="step"] {
    background: #fff7ed !important;
    color: #c2410c !important;
    box-shadow: inset 3px 0 0 #f97316 !important;
  }

  .arqdor-studio-v3 .arqdor-studio-step::after {
    content: attr(data-step-number);
    margin-left: auto;
    min-width: 20px;
    height: 20px;
    border-radius: 999px;
    border: 1px solid #e2e8f0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: #ffffff;
    color: #94a3b8;
    font-size: 8px;
    font-weight: 800;
  }

  .arqdor-studio-v3 .arqdor-studio-step[aria-current="step"]::after {
    color: #c2410c;
    border-color: #fed7aa;
    background: #ffedd5;
  }

  .arqdor-studio-v3 .arqdor-center-panel {
    background: #f1f5f9 !important;
  }

  .arqdor-studio-v3 .arqdor-canvas-toolbar {
    top: 10px !important;
    padding: 4px !important;
    gap: 2px !important;
    border-radius: 10px !important;
    background: rgba(255,255,255,.94) !important;
    border: 1px solid #e2e8f0 !important;
    backdrop-filter: blur(12px);
    box-shadow: 0 8px 24px rgba(15,23,42,.10) !important;
  }

  .arqdor-studio-v3 .arqdor-canvas-toolbar button {
    min-height: 28px;
    padding: 4px 9px !important;
    border-radius: 7px !important;
    color: #475569 !important;
  }

  .arqdor-studio-v3 .arqdor-canvas-toolbar button:hover {
    background: #fff7ed !important;
    color: #c2410c !important;
  }

  .arqdor-studio-v3 .arqdor-legacy-right-panel {
    background: #ffffff !important;
    border-left: 1px solid #e2e8f0 !important;
  }

  .arqdor-studio-v3 .arqdor-legacy-right-panel > div {
    width: 292px !important;
    background: #ffffff !important;
  }

  .arqdor-studio-v3 .arqdor-legacy-right-panel .arqdor-properties-scroll {
    padding: 12px !important;
    gap: 10px !important;
    background: #ffffff !important;
  }

  .arqdor-studio-v3 .arqdor-legacy-right-panel input,
  .arqdor-studio-v3 .arqdor-legacy-right-panel select,
  .arqdor-studio-v3 .arqdor-legacy-right-panel textarea,
  .arqdor-studio-v3 .arqdor-legacy-bottom-panel input,
  .arqdor-studio-v3 .arqdor-legacy-bottom-panel select,
  .arqdor-studio-v3 .arqdor-legacy-bottom-panel textarea {
    background: #ffffff !important;
    color: #0f172a !important;
    border-color: #cbd5e1 !important;
    box-shadow: inset 0 1px 1px rgba(15,23,42,.02) !important;
  }

  .arqdor-studio-v3 .arqdor-legacy-right-panel input:focus,
  .arqdor-studio-v3 .arqdor-legacy-right-panel select:focus,
  .arqdor-studio-v3 .arqdor-legacy-right-panel textarea:focus {
    border-color: #fb923c !important;
    box-shadow: 0 0 0 3px rgba(249,115,22,.12) !important;
    outline: none !important;
  }

  .arqdor-studio-v3 .arqdor-environment-picker {
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px !important;
  }

  .arqdor-studio-v3 .arqdor-environment-picker > div:first-child,
  .arqdor-studio-v3 .arqdor-environment-picker > input,
  .arqdor-studio-v3 .arqdor-environment-picker > .arqdor-env-cta {
    grid-column: 1 / -1;
  }

  .arqdor-studio-v3 .arqdor-environment-picker > button:not(.arqdor-env-cta) {
    min-height: 40px;
    padding: 8px !important;
    text-align: center !important;
    line-height: 1.25;
    background: #ffffff !important;
    color: #334155 !important;
    border-color: #e2e8f0 !important;
  }

  .arqdor-studio-v3 .arqdor-environment-picker > button:not(.arqdor-env-cta):hover {
    background: #fff7ed !important;
    color: #c2410c !important;
    border-color: #fdba74 !important;
  }

  .arqdor-studio-v3 .arqdor-env-cta,
  .arqdor-studio-v3 .arqdor-primary-action {
    margin-top: 3px;
    min-height: 38px;
    background: #f97316 !important;
    color: #ffffff !important;
    border-color: #ea580c !important;
    box-shadow: 0 6px 14px rgba(249,115,22,.16) !important;
  }

  .arqdor-studio-v3 .arqdor-env-cta:hover,
  .arqdor-studio-v3 .arqdor-primary-action:hover {
    background: #ea580c !important;
  }

  .arqdor-studio-v3 .arqdor-legacy-bottom-panel {
    background: #ffffff !important;
    border-top: 1px solid #e2e8f0 !important;
    box-shadow: 0 -10px 28px rgba(15,23,42,.08) !important;
  }

  .arqdor-studio-v3 .arqdor-legacy-bottom-panel > div:first-child {
    min-height: 38px;
    background: rgba(255,255,255,.98) !important;
  }

  .arqdor-studio-v3 .arqdor-legacy-bottom-panel input[aria-label="Filtrar versões"] {
    height: 28px;
  }

  .arqdor-studio-v3 .arqdor-step-confirm-banner {
    display: none !important;
  }

  .arqdor-studio-v3 .arqdor-approved-badge {
    position: fixed;
    right: 308px;
    top: 58px;
    z-index: 240;
    max-width: 360px;
    padding: 8px 11px;
    border-radius: 9px;
    background: rgba(236,253,245,.97);
    border: 1px solid #a7f3d0;
    box-shadow: 0 8px 24px rgba(15,23,42,.10);
    color: #047857;
    font-size: 10px;
    font-weight: 700;
    pointer-events: none;
  }

  @media (max-width: 1180px) {
    .arqdor-studio-v3 .arqdor-legacy-sidebar {
      width: 170px !important;
      min-width: 170px !important;
    }
    .arqdor-studio-v3 .arqdor-legacy-right-panel > div {
      width: 266px !important;
    }
    .arqdor-studio-v3 .arqdor-approved-badge {
      right: 282px;
    }
  }

  @media (max-width: 899px) {
    .arqdor-studio-v3 .arqdor-back-btn {
      display: none;
    }
  }
`;

const INLINE_PALETTE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/#060911/gi, "#F8FAFC"],
  [/#03050A/gi, "#F1F5F9"],
  [/#0C1120/gi, "#FFFFFF"],
  [/#111827/gi, "#FFFFFF"],
  [/#0B1122/gi, "#FFFFFF"],
  [/#1E2A3A/gi, "#E2E8F0"],
  [/#253347/gi, "#CBD5E1"],
  [/#7C3AED/gi, "#F97316"],
  [/#6D28D9/gi, "#EA580C"],
  [/#9F6BF1/gi, "#FB923C"],
  [/#A78BFA/gi, "#C2410C"],
  [/#EDF2F7/gi, "#0F172A"],
  [/#7B8EA5/gi, "#64748B"],
  [/#3D4F62/gi, "#94A3B8"],
  [/rgb\(\s*6,\s*9,\s*17\s*\)/gi, "rgb(248, 250, 252)"],
  [/rgb\(\s*3,\s*5,\s*10\s*\)/gi, "rgb(241, 245, 249)"],
  [/rgb\(\s*12,\s*17,\s*32\s*\)/gi, "rgb(255, 255, 255)"],
  [/rgb\(\s*17,\s*24,\s*39\s*\)/gi, "rgb(255, 255, 255)"],
  [/rgb\(\s*11,\s*17,\s*34\s*\)/gi, "rgb(255, 255, 255)"],
  [/rgb\(\s*30,\s*42,\s*58\s*\)/gi, "rgb(226, 232, 240)"],
  [/rgb\(\s*37,\s*51,\s*71\s*\)/gi, "rgb(203, 213, 225)"],
  [/rgb\(\s*124,\s*58,\s*237\s*\)/gi, "rgb(249, 115, 22)"],
  [/rgb\(\s*109,\s*40,\s*217\s*\)/gi, "rgb(234, 88, 12)"],
  [/rgb\(\s*167,\s*139,\s*250\s*\)/gi, "rgb(194, 65, 12)"],
  [/rgb\(\s*237,\s*242,\s*247\s*\)/gi, "rgb(15, 23, 42)"],
  [/rgb\(\s*123,\s*142,\s*165\s*\)/gi, "rgb(100, 116, 139)"],
  [/rgb\(\s*61,\s*79,\s*98\s*\)/gi, "rgb(148, 163, 184)"],
  [/rgba\(\s*124,\s*58,\s*237,/gi, "rgba(249,115,22,"],
  [/rgba\(\s*6,\s*9,\s*17,/gi, "rgba(248,250,252,"],
  [/rgba\(\s*12,\s*17,\s*32,/gi, "rgba(255,255,255,"],
];

function textOf(el: Element | null) {
  return (el?.textContent ?? "").replace(/\s+/g, " ").trim();
}

function applyVendorAiPalette(root: HTMLElement) {
  const styled = [root, ...Array.from(root.querySelectorAll<HTMLElement>("[style]"))];
  for (const el of styled) {
    const current = el.getAttribute("style");
    if (!current) continue;
    let next = current;
    for (const [pattern, replacement] of INLINE_PALETTE_REPLACEMENTS) {
      next = next.replace(pattern, replacement);
    }
    if (next !== current) el.setAttribute("style", next);
  }
}

function tagStudioChrome(root: HTMLElement) {
  root.classList.add("arqdor-legacy-root");
  const divChildren = Array.from(root.children).filter((el): el is HTMLElement => el instanceof HTMLElement && el.tagName === "DIV");
  const topbar = divChildren[0];
  const workspace = divChildren[1];

  if (topbar) {
    topbar.classList.add("arqdor-legacy-topbar");
    const topbarChildren = Array.from(topbar.children).filter((el): el is HTMLElement => el instanceof HTMLElement);
    topbarChildren[0]?.classList.add("arqdor-topbar-brand");
    topbar.querySelectorAll<HTMLElement>('[aria-disabled="true"]').forEach((el) => el.classList.add("arqdor-shell-hidden"));
    topbar.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
      const label = textOf(button);
      if (label.includes("Carregar Imagem") || label.includes("Continuar")) button.classList.add("arqdor-primary-action");
    });
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
        const label = textOf(button);
        if (ENVIRONMENTS.has(label)) {
          const picker = button.parentElement;
          if (picker) {
            picker.classList.add("arqdor-environment-picker");
            Array.from(picker.children).forEach((child) => {
              if (!(child instanceof HTMLElement)) return;
              if (child.tagName === "BUTTON" && textOf(child).includes("Continuar")) child.classList.add("arqdor-env-cta");
            });
          }
        }
        if (/Continuar|Gerar Render|Gerar render|Aprovar|Carregar Imagem|Confirmar|Salvar/.test(label)) {
          button.classList.add("arqdor-primary-action");
        }
      });
    }
  }

  if (centerPanel instanceof HTMLElement) {
    centerPanel.classList.add("arqdor-center-panel");
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

      applyVendorAiPalette(root);
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
        attributeFilter: ["aria-current", "aria-label", "style"],
      });
    }

    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [hydratedKey, targetKey, approvalRedirectEpoch]);

  if (hydratedKey !== targetKey) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f8fafc", color: "#c2410c", fontFamily: "Inter, sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", border: "2px solid #e2e8f0", borderTopColor: "#f97316", animation: "arq-persistent-spin .7s linear infinite" }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>Carregando histórico do projeto…</span>
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
