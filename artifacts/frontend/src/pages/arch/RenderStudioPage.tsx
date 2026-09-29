import { useEffect, useMemo, useRef, useState } from "react";
import "./planner5d-reference.css";
import { useLocation } from "wouter";
import LegacyRenderStudioPage from "./RenderStudioPageLegacy";
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
  .arqdor-studio-v3 .arqdor-legacy-root[data-arqdor-step="Melhoria"] .arqdor-legacy-bottom-panel {
    display: none !important;
  }

  .arqdor-studio-v3 .arqdor-step-confirm-banner {
    display: none !important;
  }

  .arqdor-studio-v3 .arqdor-approved-badge {
    position: fixed;
    right: 350px;
    top: 68px;
    z-index: 240;
    max-width: 360px;
    padding: 9px 12px;
    border-radius: 10px;
    background: #ecfdf5;
    border: 1px solid #a7f3d0;
    box-shadow: 0 8px 24px rgba(15,23,42,.08);
    color: #047857;
    font-size: 11px;
    font-weight: 750;
    pointer-events: none;
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
    .arqdor-studio-v3 .arqdor-approved-badge {
      right: 314px;
    }
  }

  @media (max-width: 899px) {
    .arqdor-studio-v3 .arqdor-back-btn {
      display: none;
    }
  }
`;

const INLINE_PALETTE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/#060911/gi, "#F7F8FA"],
  [/#03050A/gi, "#F7F8FA"],
  [/#0C1120/gi, "#FFFFFF"],
  [/#111827/gi, "#FFFFFF"],
  [/#0B1122/gi, "#FFFFFF"],
  [/#1E2A3A/gi, "#E5E7EB"],
  [/#253347/gi, "#D8DEE8"],
  [/#7C3AED/gi, "#F97316"],
  [/#6D28D9/gi, "#EA580C"],
  [/#9F6BF1/gi, "#FB923C"],
  [/#A78BFA/gi, "#C2410C"],
  [/#EDF2F7/gi, "#172033"],
  [/#7B8EA5/gi, "#64748B"],
  [/#3D4F62/gi, "#94A3B8"],
  [/rgb\(\s*6,\s*9,\s*17\s*\)/gi, "rgb(247, 248, 250)"],
  [/rgb\(\s*3,\s*5,\s*10\s*\)/gi, "rgb(247, 248, 250)"],
  [/rgb\(\s*12,\s*17,\s*32\s*\)/gi, "rgb(255, 255, 255)"],
  [/rgb\(\s*17,\s*24,\s*39\s*\)/gi, "rgb(255, 255, 255)"],
  [/rgb\(\s*11,\s*17,\s*34\s*\)/gi, "rgb(255, 255, 255)"],
  [/rgb\(\s*30,\s*42,\s*58\s*\)/gi, "rgb(229, 231, 235)"],
  [/rgb\(\s*37,\s*51,\s*71\s*\)/gi, "rgb(216, 222, 232)"],
  [/rgb\(\s*124,\s*58,\s*237\s*\)/gi, "rgb(249, 115, 22)"],
  [/rgb\(\s*109,\s*40,\s*217\s*\)/gi, "rgb(234, 88, 12)"],
  [/rgb\(\s*167,\s*139,\s*250\s*\)/gi, "rgb(194, 65, 12)"],
  [/rgb\(\s*237,\s*242,\s*247\s*\)/gi, "rgb(23, 32, 51)"],
  [/rgb\(\s*123,\s*142,\s*165\s*\)/gi, "rgb(100, 116, 139)"],
  [/rgb\(\s*61,\s*79,\s*98\s*\)/gi, "rgb(148, 163, 184)"],
  [/rgba\(\s*124,\s*58,\s*237,/gi, "rgba(249,115,22,"],
  [/rgba\(\s*6,\s*9,\s*17,/gi, "rgba(247,248,250,"],
  [/rgba\(\s*3,\s*5,\s*10,/gi, "rgba(247,248,250,"],
  [/rgba\(\s*12,\s*17,\s*32,/gi, "rgba(255,255,255,"],
  [/rgba\(\s*17,\s*24,\s*39,/gi, "rgba(255,255,255,"],
  [/rgba\(\s*11,\s*17,\s*34,/gi, "rgba(255,255,255,"],
  [/rgba\(\s*30,\s*42,\s*58,/gi, "rgba(229,231,235,"],
  [/rgba\(\s*37,\s*51,\s*71,/gi, "rgba(216,222,232,"],
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
    for (const [pattern, replacement] of INLINE_PALETTE_REPLACEMENTS) next = next.replace(pattern, replacement);
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
      if (/Carregar Imagem|Continuar|Gerar Render|Melhorar|Ver Versões|Aprovar|Especificação/.test(label)) button.classList.add("arqdor-primary-action");
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
        if (/Continuar|Gerar Render|Gerar render|Aprovar|Carregar Imagem|Confirmar|Salvar/.test(label)) button.classList.add("arqdor-primary-action");
        if (label.includes("IA COPILOT")) button.parentElement?.classList.add("arqdor-copilot-strip");
      });
    }
  }

  if (centerPanel instanceof HTMLElement) {
    centerPanel.classList.add("arqdor-center-panel");
    const canvasToolbarButton = centerPanel.querySelector<HTMLElement>("[data-canvas-action]");
    canvasToolbarButton?.parentElement?.classList.add("arqdor-canvas-toolbar");

    const uploadCard = centerPanel.querySelector<HTMLElement>('[aria-label^="Carregar imagem"]');
    if (uploadCard) {
      uploadCard.classList.add("arqdor-upload-card");
      const stage = uploadCard.parentElement;
      if (stage) {
        stage.classList.add("arqdor-canvas-stage");
        Array.from(stage.children).forEach((child) => {
          if (!(child instanceof HTMLElement) || child === uploadCard) return;
          const label = textOf(child);
          if (/Etapa \d+ de 8|Escolha o tipo de ambiente|Selecione ou crie um projeto/.test(label)) child.classList.add("arqdor-flow-guide");
        });
      }
    }

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
    if (findApprovedVersion(state) && currentStep === "aprovar") {
      sessionStorage.setItem(SK.step, "especificacao");
    } else if (!state.latestRenderUrl && !state.sourceImageUrl && ["render", "melhoria", "versao", "aprovar", "especificacao"].includes(currentStep ?? "")) {
      sessionStorage.setItem(SK.step, "imagem");
    }
  } catch {
    // recovery cache is best effort
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
  const targetKey = `${projectId ?? "no-project"}:${ambiente}`;

  const recoveryCache = useMemo(() => {
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
  }, [targetKey]);

  const bootstrap = useRenderStudioPersistentBootstrap(projectId, ambiente, recoveryCache);
  const approvedVersion = useMemo(() => findApprovedVersion(bootstrap.state), [bootstrap.state]);

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

  useEffect(() => setHydratedKey(null), [projectId, ambiente]);

  useEffect(() => {
    if (!projectId) {
      setHydratedKey(targetKey);
      return;
    }
    const backendLoaded = bootstrap.loadedProjectId === projectId;
    const canUseRecovery = Boolean(bootstrap.error) || bootstrap.hasRecoveryOnly;
    if (!backendLoaded && !canUseRecovery) return;
    persistBootstrapState(bootstrap.state, targetKey);
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

      // Studio IA pertence ao fluxo do Render IA. A ação é inserida no
      // mesmo container do botão "Carregar Imagem", em vez de usar
      // posicionamento fixo sobre a área de marca/breadcrumb.
      const topbar = root.querySelector<HTMLElement>(".arqdor-legacy-topbar");
      const loadImageButton = topbar
        ? Array.from(topbar.querySelectorAll<HTMLButtonElement>("button"))
            .find((button) => /Carregar Imagem/i.test(textOf(button)))
        : undefined;
      if (loadImageButton && !topbar?.querySelector('[data-arqdor-studio-entry="true"]')) {
        const studioButton = document.createElement("button");
        studioButton.type = "button";
        studioButton.dataset.arqdorStudioEntry = "true";
        studioButton.className = "arqdor-studio-entry-btn";
        studioButton.setAttribute("aria-label", "Abrir Studio IA");
        studioButton.title = "Studio IA — materiais, iluminação, variações e versões";
        studioButton.innerHTML = '<span aria-hidden="true">✦</span><span>Studio IA</span>';
        studioButton.addEventListener("click", () => setLocation("/arch/studio"));
        loadImageButton.insertAdjacentElement("beforebegin", studioButton);
      }

      const activeStep = getActiveStudioStep(root);
      if (activeStep) root.dataset.arqdorStep = activeStep;

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

    const timer = window.setTimeout(enhance, 40);
    const observer = new MutationObserver(() => window.requestAnimationFrame(enhance));
    if (shellRef.current) observer.observe(shellRef.current, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-current", "aria-label", "style"],
    });

    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [hydratedKey, targetKey, approvalRedirectEpoch]);

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
    <div ref={shellRef} className="arqdor-reference-ui arqdor-studio-v3">
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
