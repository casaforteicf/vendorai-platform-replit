import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import LegacyRenderStudioPage from "./RenderStudioLegacyPage";

const SHELL_STYLES = `
  .arqdor-studio-v2 {
    position: relative;
    height: 100vh;
    overflow: hidden;
    background: #060911;
  }

  .arqdor-studio-v2 .arqdor-back-btn {
    position: fixed;
    top: 9px;
    left: 12px;
    z-index: 1200;
    height: 30px;
    padding: 0 11px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border-radius: 7px;
    border: 1px solid #253347;
    background: rgba(12,17,32,.96);
    color: #dbe5f0;
    font: 700 11px/1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    cursor: pointer;
    box-shadow: 0 6px 20px rgba(0,0,0,.24);
    transition: background .15s ease, border-color .15s ease, transform .15s ease;
  }

  .arqdor-studio-v2 .arqdor-back-btn:hover {
    background: #111827;
    border-color: #7c3aed;
    transform: translateY(-1px);
  }

  .arqdor-studio-v2 .arqdor-legacy-topbar {
    height: 48px !important;
    padding-left: 102px !important;
  }

  .arqdor-studio-v2 .arqdor-legacy-topbar > .arqdor-shell-hidden {
    display: none !important;
  }

  .arqdor-studio-v2 .arqdor-legacy-sidebar {
    width: 184px !important;
  }

  .arqdor-studio-v2 .arqdor-legacy-sidebar > div:first-child {
    padding: 9px 10px !important;
  }

  .arqdor-studio-v2 .arqdor-sidebar-hidden-group {
    display: none !important;
  }

  .arqdor-studio-v2 .arqdor-legacy-sidebar > div:nth-child(2) {
    overflow: hidden !important;
    padding-top: 6px !important;
  }

  .arqdor-studio-v2 .arqdor-legacy-right-panel > div {
    width: 280px !important;
  }

  .arqdor-studio-v2 .arqdor-legacy-bottom-panel {
    box-shadow: 0 -10px 28px rgba(0,0,0,.16);
  }

  @media (max-width: 899px) {
    .arqdor-studio-v2 .arqdor-back-btn {
      display: none;
    }
  }
`;

function tagStudioChrome(root: HTMLElement) {
  const divChildren = Array.from(root.children).filter((el): el is HTMLElement => el instanceof HTMLElement && el.tagName === "DIV");
  const topbar = divChildren[0];
  const workspace = divChildren[1];

  if (topbar) {
    topbar.classList.add("arqdor-legacy-topbar");
    const children = Array.from(topbar.children).filter((el): el is HTMLElement => el instanceof HTMLElement);
    [children[2], children[6], children[7]].forEach((el) => el?.classList.add("arqdor-shell-hidden"));
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
      Array.from(nav.children).slice(1).forEach((group) => {
        if (group instanceof HTMLElement) group.classList.add("arqdor-sidebar-hidden-group");
      });
    }
  }

  if (rightPanel) rightPanel.classList.add("arqdor-legacy-right-panel");

  if (centerPanel instanceof HTMLElement) {
    const bottomPanel = Array.from(centerPanel.children).find((el) =>
      el instanceof HTMLElement && el.querySelector('button[aria-label="Recolher"], button[aria-label="Expandir"]')
    );
    if (bottomPanel instanceof HTMLElement) bottomPanel.classList.add("arqdor-legacy-bottom-panel");
  }
}

export default function RenderStudioPage() {
  const shellRef = useRef<HTMLDivElement>(null);
  const [, setLocation] = useLocation();

  useEffect(() => {
    const enhance = () => {
      const shell = shellRef.current;
      if (!shell) return;
      const root = Array.from(shell.querySelectorAll<HTMLElement>("div")).find((el) =>
        el.style.height === "100vh" && el.style.display === "flex" && el.style.flexDirection === "column"
      );
      if (!root) return;

      root.classList.add("arqdor-legacy-root");
      tagStudioChrome(root);

      const collapseBottom = root.querySelector<HTMLButtonElement>('button[aria-label="Recolher"]');
      if (collapseBottom) collapseBottom.click();
    };

    const timer = window.setTimeout(enhance, 120);
    return () => window.clearTimeout(timer);
  }, []);

  function handleBack() {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    setLocation("/arch/projetos");
  }

  return (
    <div ref={shellRef} className="arqdor-studio-v2">
      <style>{SHELL_STYLES}</style>
      <button className="arqdor-back-btn" onClick={handleBack} aria-label="Voltar para a tela anterior" title="Voltar para a tela anterior">
        <span aria-hidden="true">←</span>
        Voltar
      </button>
      <LegacyRenderStudioPage />
    </div>
  );
}
