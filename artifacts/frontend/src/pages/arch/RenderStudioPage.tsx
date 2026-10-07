import { useEffect, useMemo, useRef, useState } from "react";
import "./planner5d-reference.css";
import { useLocation } from "wouter";
import RenderStudioCore from "./RenderStudioCore";
import { useRenderStudioPersistentBootstrap } from "@/modules/arqdor/hooks/useRenderStudioPersistentBootstrap";
import type { RenderStudioVersion } from "@/modules/arqdor/hooks/renderStudioPersistentAdapter";

const SK = {
  step: "arq_studio_step",
  ambiente: "arq_studio_ambiente",
  renderId: "arq_studio_renderId",
  renderUrl: "arq_studio_renderUrl",
  imageUrl: "arq_studio_imageDataUrl",
  versions: "arq_studio_versions",
  approvedVersionId: "arq_studio_approvedVersionId",
  context: "arq_studio_context",
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
    background: #f7f8fa;
    color: #172033;
    color-scheme: light;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  .arqdor-studio-v3 button,
  .arqdor-studio-v3 input,
  .arqdor-studio-v3 select,
  .arqdor-studio-v3 textarea {
    font-family: inherit !important;
  }

  .arqdor-studio-v3 .arqdor-back-btn {
    position: fixed;
    top: 11px;
    left: 12px;
    z-index: 1200;
    height: 36px;
    padding: 0 13px;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    border-radius: 10px;
    border: 1px solid #e5e7eb;
    background: #ffffff;
    color: #475569;
    font-size: 12px;
    font-weight: 750;
    cursor: pointer;
    box-shadow: 0 3px 10px rgba(15,23,42,.06);
    transition: .16s ease;
  }

  .arqdor-studio-v3 .arqdor-back-btn:hover {
    border-color: #fb923c;
    background: #fff7ed;
    color: #c2410c;
    transform: translateY(-1px);
  }

  .arqdor-studio-v3 .arqdor-legacy-root,
  .arqdor-studio-v3 .arqdor-legacy-workspace {
    background: #f7f8fa !important;
    color: #172033 !important;
  }

  .arqdor-studio-v3 .arqdor-legacy-topbar {
    height: 58px !important;
    min-height: 58px !important;
    padding-left: 102px !important;
    padding-right: 16px !important;
    background: rgba(255,255,255,.98) !important;
    border-bottom: 1px solid #e8ebf0 !important;
    box-shadow: 0 1px 0 rgba(15,23,42,.03) !important;
    color: #172033 !important;
  }

  .arqdor-studio-v3 .arqdor-legacy-topbar .arqdor-shell-hidden {
    display: none !important;
  }

  .arqdor-studio-v3 .arqdor-legacy-topbar .arqdor-topbar-brand {
    margin-right: 14px !important;
  }

  .arqdor-studio-v3 .arqdor-legacy-topbar span {
    font-size: 12px !important;
  }

  .arqdor-studio-v3 .arqdor-legacy-topbar .arqdor-primary-action {
    min-height: 38px !important;
    padding: 0 18px !important;
    border-radius: 10px !important;
    background: #f97316 !important;
    color: #ffffff !important;
    border: 1px solid #ea580c !important;
    box-shadow: 0 5px 14px rgba(249,115,22,.18) !important;
    font-size: 12px !important;
    font-weight: 800 !important;
  }

  .arqdor-studio-v3 .arqdor-legacy-topbar .arqdor-primary-action:hover {
    background: #ea580c !important;
  }

  .arqdor-studio-v3 .arqdor-legacy-sidebar {
    width: 218px !important;
    min-width: 218px !important;
    background: #ffffff !important;
    border-right: 1px solid #e8ebf0 !important;
    box-shadow: none !important;
  }

  .arqdor-studio-v3 .arqdor-legacy-sidebar > div:first-child {
    padding: 15px 14px 13px !important;
    border-bottom: 1px solid #f0f2f5 !important;
  }

  .arqdor-studio-v3 .arqdor-legacy-sidebar > div:first-child > div:first-child {
    font-size: 10px !important;
    color: #94a3b8 !important;
    margin-bottom: 7px !important;
  }

  .arqdor-studio-v3 .arqdor-legacy-sidebar > div:first-child > div:last-child {
    min-height: 38px !important;
    border-radius: 10px !important;
    background: #f8fafc !important;
    border-color: #e5e7eb !important;
  }

  .arqdor-studio-v3 .arqdor-sidebar-hidden-group {
    display: none !important;
  }

  .arqdor-studio-v3 .arqdor-legacy-sidebar > div:nth-child(2) {
    overflow: hidden !important;
    padding: 11px 0 16px !important;
  }

  .arqdor-studio-v3 .arqdor-studio-step {
    min-height: 44px !important;
    margin: 3px 10px !important;
    padding: 9px 10px !important;
    border-radius: 10px !important;
    color: #475569 !important;
    border-left: 0 !important;
    transition: .16s ease !important;
  }

  .arqdor-studio-v3 .arqdor-studio-step span {
    font-size: 12px !important;
  }

  .arqdor-studio-v3 .arqdor-studio-step:hover:not(:disabled) {
    background: #fff7ed !important;
    color: #c2410c !important;
  }

  .arqdor-studio-v3 .arqdor-studio-step[aria-current="step"] {
    background: linear-gradient(90deg, #fff3e8 0%, #fff9f4 100%) !important;
    color: #c2410c !important;
    box-shadow: inset 3px 0 0 #f97316 !important;
  }

  .arqdor-studio-v3 .arqdor-studio-step::after {
    content: attr(data-step-number);
    margin-left: auto;
    min-width: 22px;
    height: 22px;
    border-radius: 999px;
    border: 1px solid #e5e7eb;
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
    border-color: #fdba74;
    background: #ffedd5;
  }

  .arqdor-studio-v3 .arqdor-center-panel {
    background: #f7f8fa !important;
  }

  .arqdor-studio-v3 .arqdor-canvas-stage {
    background: #f7f8fa !important;
    padding: 72px 34px 44px !important;
    gap: 24px !important;
  }

  .arqdor-studio-v3 .arqdor-flow-guide {
    width: min(560px, calc(100% - 40px)) !important;
    max-width: 560px !important;
    padding: 30px 32px !important;
    border-radius: 18px !important;
    border: 1px solid #e5e7eb !important;
    background: #ffffff !important;
    box-shadow: 0 14px 34px rgba(15,23,42,.07) !important;
    gap: 16px !important;
  }

  .arqdor-studio-v3 .arqdor-flow-guide > div:first-child {
    margin-bottom: -2px !important;
  }

  .arqdor-studio-v3 .arqdor-upload-card {
    width: min(590px, calc(100% - 40px)) !important;
    max-width: 590px !important;
    min-height: 300px !important;
    padding: 44px 48px !important;
    border-radius: 18px !important;
    border: 2px dashed #fdba74 !important;
    background: #ffffff !important;
    box-shadow: 0 14px 34px rgba(15,23,42,.07) !important;
    gap: 18px !important;
    justify-content: center !important;
  }

  .arqdor-studio-v3 .arqdor-upload-card:hover {
    border-color: #f97316 !important;
    background: #fffaf5 !important;
    transform: translateY(-1px);
  }

  .arqdor-studio-v3 .arqdor-upload-card > div:first-child {
    background: #fff1e8 !important;
    color: #f97316 !important;
    border: 1px solid #fed7aa !important;
  }

  .arqdor-studio-v3 .arqdor-legacy-root[data-arqdor-step="Projeto"] .arqdor-upload-card,
  .arqdor-studio-v3 .arqdor-legacy-root[data-arqdor-step="Ambiente"] .arqdor-upload-card {
    display: none !important;
  }

  .arqdor-studio-v3 .arqdor-canvas-toolbar {
    top: 14px !important;
    padding: 5px !important;
    gap: 3px !important;
    border-radius: 11px !important;
    background: rgba(255,255,255,.98) !important;
    border: 1px solid #e5e7eb !important;
    backdrop-filter: blur(12px);
    box-shadow: 0 8px 20px rgba(15,23,42,.08) !important;
  }

  .arqdor-studio-v3 .arqdor-canvas-toolbar button {
    min-height: 30px !important;
    padding: 5px 10px !important;
    border-radius: 8px !important;
    color: #64748b !important;
    font-size: 11px !important;
  }

  .arqdor-studio-v3 .arqdor-canvas-toolbar button[aria-pressed="true"] {
    background: #fff1e8 !important;
    color: #c2410c !important;
    border-color: #fdba74 !important;
  }

  .arqdor-studio-v3 .arqdor-legacy-root[data-arqdor-step="Projeto"] .arqdor-canvas-toolbar,
  .arqdor-studio-v3 .arqdor-legacy-root[data-arqdor-step="Ambiente"] .arqdor-canvas-toolbar {
    display: none !important;
  }

  .arqdor-studio-v3 .arqdor-legacy-right-panel {
    background: #f7f8fa !important;
    border-left: 0 !important;
    padding: 12px 12px 12px 0 !important;
  }

  .arqdor-studio-v3 .arqdor-legacy-right-panel > div {
    width: 324px !important;
    background: #ffffff !important;
    border: 1px solid #e5e7eb !important;
    border-radius: 16px !important;
    box-shadow: 0 10px 28px rgba(15,23,42,.06) !important;
    overflow: hidden !important;
  }

  .arqdor-studio-v3 .arqdor-legacy-right-panel > div > div:first-child {
    min-height: 46px !important;
    background: #ffffff !important;
    border-bottom-color: #eef0f3 !important;
  }

  .arqdor-studio-v3 .arqdor-legacy-right-panel > div > div:first-child button {
    font-size: 12px !important;
    font-weight: 700 !important;
    padding: 13px 0 !important;
  }

  .arqdor-studio-v3 .arqdor-legacy-right-panel .arqdor-properties-scroll {
    padding: 16px !important;
    gap: 12px !important;
    background: #ffffff !important;
  }

  .arqdor-studio-v3 .arqdor-legacy-right-panel input,
  .arqdor-studio-v3 .arqdor-legacy-right-panel select,
  .arqdor-studio-v3 .arqdor-legacy-right-panel textarea,
  .arqdor-studio-v3 .arqdor-legacy-bottom-panel input,
  .arqdor-studio-v3 .arqdor-legacy-bottom-panel select,
  .arqdor-studio-v3 .arqdor-legacy-bottom-panel textarea {
    background: #ffffff !important;
    color: #172033 !important;
    border-color: #d8dee8 !important;
    box-shadow: none !important;
    font-size: 12px !important;
  }

  .arqdor-studio-v3 .arqdor-legacy-right-panel input {
    min-height: 40px !important;
    border-radius: 9px !important;
  }

  .arqdor-studio-v3 .arqdor-legacy-right-panel input:focus,
  .arqdor-studio-v3 .arqdor-legacy-right-panel select:focus,
  .arqdor-studio-v3 .arqdor-legacy-right-panel textarea:focus {
    border-color: #fb923c !important;
    box-shadow: 0 0 0 3px rgba(249,115,22,.11) !important;
    outline: none !important;
  }

  .arqdor-studio-v3 .arqdor-environment-picker {
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 9px !important;
  }

  .arqdor-studio-v3 .arqdor-environment-picker > div:first-child,
  .arqdor-studio-v3 .arqdor-environment-picker > input,
  .arqdor-studio-v3 .arqdor-environment-picker > .arqdor-env-cta {
    grid-column: 1 / -1;
  }

  .arqdor-studio-v3 .arqdor-environment-picker > button:not(.arqdor-env-cta) {
    min-height: 44px !important;
    padding: 9px !important;
    border-radius: 10px !important;
    text-align: center !important;
    line-height: 1.25 !important;
    background: #ffffff !important;
    color: #334155 !important;
    border-color: #e2e8f0 !important;
    font-size: 12px !important;
  }

  .arqdor-studio-v3 .arqdor-environment-picker > button:not(.arqdor-env-cta):hover {
    background: #fff7ed !important;
    color: #c2410c !important;
    border-color: #fdba74 !important;
  }

  .arqdor-studio-v3 .arqdor-environment-picker > button:not(.arqdor-env-cta)[style*="249, 115, 22"],
  .arqdor-studio-v3 .arqdor-environment-picker > button:not(.arqdor-env-cta)[style*="#F97316"] {
    background: #fff1e8 !important;
    color: #c2410c !important;
    border-color: #fb923c !important;
  }

  .arqdor-studio-v3 .arqdor-env-cta,
  .arqdor-studio-v3 .arqdor-primary-action {
    min-height: 40px !important;
    border-radius: 10px !important;
    background: #f97316 !important;
    color: #ffffff !important;
    border-color: #ea580c !important;
    box-shadow: 0 5px 14px rgba(249,115,22,.16) !important;
    font-weight: 800 !important;
  }

  .arqdor-studio-v3 .arqdor-env-cta:hover,
  .arqdor-studio-v3 .arqdor-primary-action:hover {
    background: #ea580c !important;
  }

  .arqdor-studio-v3 .arqdor-copilot-strip {
    border-top-color: #eef0f3 !important;
    background: #fff !important;
  }

  .arqdor-studio-v3 .arqdor-legacy-root[data-arqdor-step="Projeto"] .arqdor-copilot-strip,
  .arqdor-studio-v3 .arqdor-legacy-root[data-arqdor-step="Ambiente"] .arqdor-copilot-strip,
  .arqdor-studio-v3 .arqdor-legacy-root[data-arqdor-step="Imagem base"] .arqdor-copilot-strip {
    display: none !important;
  }

  .arqdor-studio-v3 .arqdor-legacy-bottom-panel {
    background: #ffffff !important;
    border-top: 1px solid #e5e7eb !important;
    box-shadow: 0 -8px 22px rgba(15,23,42,.05) !important;
  }

  .arqdor-studio-v3 .arqdor-legacy-bottom-panel > div:first-child {
    min-height: 40px !important;
    background: #ffffff !important;
  }

  .arqdor-studio-v3 .arqdor-legacy-root[data-arqdor-step="Projeto"] .arqdor-legacy-bottom-panel,
  .arqdor-studio-v3 .arqdor-legacy-root[data-arqdor-step="Ambiente"] .arqdor-legacy-bottom-panel,
  .arqdor-studio-v3 .arqdor-legacy-root[data-arqdor-step="Imagem base"] .arqdor-legacy-bottom-panel,
  .arqdor-studio-v3 .arqdor-legacy-root[data-arqdor-step="Render IA"] .arqdor-legacy-bottom-panel,
  .arqdor-studio-v3 .arqdor-legacy-root[data-arqdor-step="Melhorar render"] .arqdor-legacy-bottom-panel {
    display: none !important;
  }

  .arqdor-studio-v3 .arqdor-step-confirm-banner {
    display: none !important;
  }

  .arqdor-studio-v3 .arqdor-studio-entry-btn {
    height: 38px;
    padding: 0 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    flex: 0 0 auto;
    border-radius: 10px;
    border: 1px solid #fdba74;
    background: #fff7ed;
    color: #c2410c;
    font-size: 12px;
    font-weight: 800;
    line-height: 1;
    white-space: nowrap;
    cursor: pointer;
    box-shadow: none;
    transition: background .16s ease, border-color .16s ease, color .16s ease;
  }

  .arqdor-studio-v3 .arqdor-studio-entry-btn:hover {
    background: #ffedd5;
    border-color: #fb923c;
    color: #9a3412;
  }

  @media (max-width: 1220px) {
    .arqdor-studio-v3 .arqdor-legacy-sidebar {
      width: 190px !important;
      min-width: 190px !important;
    }
    .arqdor-studio-v3 .arqdor-legacy-right-panel > div {
      width: 288px !important;
    }
  }

  @media (max-width: 899px) {
    .arqdor-studio-v3 .arqdor-back-btn {
      display: none;
    }
    .arqdor-studio-v3 .arqdor-legacy-topbar {
      padding-left: 12px !important;
    }
    .arqdor-studio-v3 .arqdor-legacy-sidebar {
      width: 154px !important;
      min-width: 154px !important;
    }
    .arqdor-studio-v3 .arqdor-studio-step {
      margin-left: 6px !important;
      margin-right: 6px !important;
      padding-left: 8px !important;
      padding-right: 8px !important;
    }
    .arqdor-studio-v3 .arqdor-legacy-right-panel {
      padding-right: 6px !important;
    }
    .arqdor-studio-v3 .arqdor-legacy-right-panel > div {
      width: 252px !important;
    }
    .arqdor-studio-v3 .arqdor-canvas-stage {
      padding-left: 18px !important;
      padding-right: 18px !important;
    }
    .arqdor-studio-v3 .arqdor-topbar-brand span {
      display: none;
    }
  }
`;

function clearRenderDraftSession() {
  try {
    [
      SK.step,
      SK.ambiente,
      SK.renderId,
      SK.renderUrl,
      SK.imageUrl,
      SK.versions,
      SK.approvedVersionId,
      SK.context,
    ].forEach((key) => sessionStorage.removeItem(key));
  } catch {
    // session cleanup is best effort
  }
}

function reviveDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function readCachedVersions(targetKey: string): RenderStudioVersion[] {
  const cachedContext = sessionStorage.getItem(SK.context);
  if (cachedContext !== targetKey) return [];
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
        surfaceKey: version.surfaceKey,
        approvedBy: version.approvedBy,
        approvedAt: reviveDate(version.approvedAt),
        approvalNote: version.approvalNote,
        costEstimateUsd: version.costEstimateUsd,
      }));
  } catch {
    return [];
  }
}

function findApprovedVersion(state: { versions: RenderStudioVersion[]; approvedVersionId: string | null }) {
  return state.versions.find((version) => version.id === state.approvedVersionId)
    ?? state.versions.find((version) => Boolean(version.approvedBy && version.approvedAt))
    ?? null;
}

function persistBootstrapState(state: {
  versions: RenderStudioVersion[];
  latestRenderId: string | null;
  latestRenderUrl: string | null;
  sourceImageUrl: string | null;
  approvedVersionId: string | null;
}, targetKey: string) {
  try {
    sessionStorage.setItem(SK.context, targetKey);
    sessionStorage.setItem(SK.versions, JSON.stringify(state.versions));
    if (state.latestRenderId) sessionStorage.setItem(SK.renderId, state.latestRenderId);
    else sessionStorage.removeItem(SK.renderId);
    if (state.latestRenderUrl) sessionStorage.setItem(SK.renderUrl, state.latestRenderUrl);
    else sessionStorage.removeItem(SK.renderUrl);
    if (state.sourceImageUrl) sessionStorage.setItem(SK.imageUrl, state.sourceImageUrl);
    else sessionStorage.removeItem(SK.imageUrl);
    if (state.approvedVersionId) sessionStorage.setItem(SK.approvedVersionId, state.approvedVersionId);
    else sessionStorage.removeItem(SK.approvedVersionId);

    const currentStep = sessionStorage.getItem(SK.step);
    if (currentStep === "especificacao") {
      // Migração de sessões antigas: especificação não faz mais parte do Render Studio.
      sessionStorage.setItem(SK.step, findApprovedVersion(state) ? "aprovar" : "versao");
    } else if (!state.latestRenderUrl && !state.sourceImageUrl && ["render", "melhoria", "versao", "aprovar"].includes(currentStep ?? "")) {
      sessionStorage.setItem(SK.step, "imagem");
    }
  } catch {
    // recovery cache is best effort
  }
}

export default function RenderStudioPage() {
  const shellRef = useRef<HTMLDivElement>(null);
  const [, setLocation] = useLocation();
  const [requestedRenderId] = useState(() => new URLSearchParams(window.location.search).get("render_id")?.trim() || null);
  const [freshStart] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("new") === "1";
    if (requested) clearRenderDraftSession();

    const requestedProjectId = params.get("project_id")?.trim();
    const requestedAmbiente = params.get("ambiente")?.trim();
    if (requestedProjectId) localStorage.setItem("arq_last_project_id", requestedProjectId);
    if (requestedAmbiente) sessionStorage.setItem(SK.ambiente, requestedAmbiente);

    return requested;
  });
  const [projectId, setProjectId] = useState<string | null>(() => {
    const requested = new URLSearchParams(window.location.search).get("project_id")?.trim();
    return requested || localStorage.getItem("arq_last_project_id");
  });
  const [ambiente, setAmbiente] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("ambiente")?.trim();
    if (requested) return requested;

    const cachedAmbiente = sessionStorage.getItem(SK.ambiente) || "";
    if (!cachedAmbiente) return "";

    const requestedProjectId = params.get("project_id")?.trim();
    const effectiveProjectId = requestedProjectId || localStorage.getItem("arq_last_project_id") || "no-project";
    const cachedContext = sessionStorage.getItem(SK.context);

    return cachedContext === `${effectiveProjectId}:${cachedAmbiente}`
      ? cachedAmbiente
      : "";
  });
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);
  const targetKey = `${projectId ?? "no-project"}:${ambiente}`;

  const recoveryCache = useMemo(() => {
    if (freshStart) return { versions: [], renderId: null, renderUrl: null, imageUrl: null };
    const cachedContext = sessionStorage.getItem(SK.context);
    if (cachedContext !== targetKey) {
      return { versions: [], renderId: null, renderUrl: null, imageUrl: null };
    }
    return {
      versions: readCachedVersions(targetKey),
      renderId: sessionStorage.getItem(SK.renderId),
      renderUrl: sessionStorage.getItem(SK.renderUrl),
      imageUrl: sessionStorage.getItem(SK.imageUrl),
    };
  }, [targetKey, freshStart]);

  const bootstrap = useRenderStudioPersistentBootstrap(projectId, ambiente, recoveryCache);

  useEffect(() => {
    if (!freshStart) return;
    window.history.replaceState(window.history.state, "", window.location.pathname);
  }, [freshStart]);

  useEffect(() => {
    function onProjectContext(event: Event) {
      const project = (event as CustomEvent<{ projectId?: string | null }>).detail?.projectId ?? null;
      setProjectId(project);
    }
    function onStudioContext(event: Event) {
      const detail = (event as CustomEvent<{ ambiente?: string }>).detail;
      if (typeof detail?.ambiente === "string") setAmbiente(detail.ambiente);
    }
    window.addEventListener("arqdor:project-context", onProjectContext as EventListener);
    window.addEventListener("arqdor:render-context", onStudioContext as EventListener);
    return () => {
      window.removeEventListener("arqdor:project-context", onProjectContext as EventListener);
      window.removeEventListener("arqdor:render-context", onStudioContext as EventListener);
    };
  }, []);

  useEffect(() => setHydratedKey(null), [projectId, ambiente]);

  useEffect(() => {
    if (freshStart) {
      setHydratedKey(targetKey);
      return;
    }
    if (!projectId) {
      setHydratedKey(targetKey);
      return;
    }
    const backendLoaded = bootstrap.loadedProjectId === projectId;
    const canUseRecovery = Boolean(bootstrap.error) || bootstrap.hasRecoveryOnly;
    if (!backendLoaded && !canUseRecovery) return;
    const requestedVersion = requestedRenderId
      ? bootstrap.state.versions.find((version) => version.id === requestedRenderId) ?? null
      : null;
    const stateToPersist = requestedVersion
      ? {
          ...bootstrap.state,
          latestRenderId: requestedVersion.id,
          latestRenderUrl: requestedVersion.url,
        }
      : bootstrap.state;

    persistBootstrapState(stateToPersist, targetKey);
    if (ambiente) sessionStorage.setItem(SK.ambiente, ambiente);
    else sessionStorage.removeItem(SK.ambiente);
    if (requestedVersion) {
      sessionStorage.setItem(SK.step, "render");
    }
    setHydratedKey(targetKey);
  }, [projectId, ambiente, targetKey, freshStart, requestedRenderId, bootstrap.loadedProjectId, bootstrap.error, bootstrap.hasRecoveryOnly, bootstrap.state]);

  if (hydratedKey !== targetKey) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f7f8fa", color: "#c2410c", fontFamily: "Inter, sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: "50%", border: "2px solid #e5e7eb", borderTopColor: "#f97316", animation: "arq-persistent-spin .7s linear infinite" }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: "#475569" }}>Carregando histórico do projeto…</span>
          <style>{`@keyframes arq-persistent-spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      </div>
    );
  }

  function handleBack() {
    if (projectId) {
      setLocation(`/arch/projetos/${projectId}`);
      return;
    }
    setLocation("/arch/projetos");
  }

  return (
    <div ref={shellRef} className="arqdor-reference-ui arqdor-studio-v3">
      <style>{SHELL_STYLES}</style>
      <button className="arqdor-back-btn" onClick={handleBack} aria-label="Voltar para a tela anterior" title="Voltar para a tela anterior">
        <span aria-hidden="true">←</span>
        Voltar
      </button>
      <RenderStudioCore key={targetKey} />
    </div>
  );
}
