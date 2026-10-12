import type { RenderStudioStep } from "./renderStudioModel";
import { StudioToolButton } from "../../../modules/arqdor/theme/ArqdorStudioComponents";
import { RENDER_STUDIO_COLORS as C, RENDER_STUDIO_STEPS, renderStudioStepIndex } from "./renderStudioModel";

export function RenderStudioTopbar({
  step,
  projectTitle,
  ambiente,
  onNextStep,
  onOpenStudio,
  userName,
  onHelp: _onHelp,
  onShortcuts: _onShortcuts,
}: {
  step: RenderStudioStep;
  projectTitle: string | null;
  ambiente: string;
  onNextStep: () => void;
  onOpenStudio: () => void;
  userName: string;
  onHelp?: () => void;
  onShortcuts?: () => void;
}) {
  const nextLabels: Partial<Record<RenderStudioStep, string>> = {
    projeto: "→ Definir Ambiente",
    ambiente: "→ Carregar Imagem",
    imagem: "→ Gerar Render",
    render: "→ Melhorar render",
    melhoria: "→ Ver Versões",
    versao: "→ Aprovar",
  };
  const breadcrumbs = ["Studio", ambiente || "Ambiente"].filter(Boolean);

  return (
    <div className="arqdor-legacy-topbar" style={{ height: 52, display: "flex", alignItems: "center", padding: "0 16px", background: C.surface, borderBottom: `1px solid ${C.border}`, flexShrink: 0, gap: 0, zIndex: 100 }}>
      <div className="arqdor-topbar-brand" style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 16, flexShrink: 0 }}>
        <div style={{ width: 28, height: 28, borderRadius: 6, background: C.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 900, color: "#fff" }}>A</div>
        <span style={{ fontSize: 12, fontWeight: 800, color: C.text, letterSpacing: "0.08em" }}>
          ARQDOR<span style={{ color: C.accentMid, fontSize: 10 }}>.ai</span>
        </span>
      </div>

      <div style={{ width: 1, height: 20, background: C.border, marginRight: 16 }} />

      <div style={{ display: "flex", alignItems: "center", gap: 6, marginRight: 16 }}>
        {projectTitle && <span style={{ fontSize: 11, fontWeight: 600, color: C.muted }}>{projectTitle}</span>}
        {breadcrumbs.map((label, index) => (
          <span key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, color: C.dim }}>›</span>
            <span style={{ fontSize: 11, fontWeight: index === breadcrumbs.length - 1 ? 700 : 400, color: index === breadcrumbs.length - 1 ? C.accentText : C.muted }}>{label}</span>
          </span>
        ))}
      </div>

      <div style={{ flex: 1 }} />

      {(step === "versao" || step === "aprovar") && (
        <StudioToolButton
          onClick={onOpenStudio}
          aria-label="Melhorar render"
          title="Materiais, iluminação, ajustes e versões"
          className="arqdor-render-improve-action"
        >
          ✦ Melhorar render
        </StudioToolButton>
      )}

      {step !== "aprovar" && (
        <StudioToolButton
          onClick={onNextStep}
          aria-label={nextLabels[step] ?? "Próxima Etapa"}
          className="arqdor-render-next-action"
        >
          {nextLabels[step] ?? "Próxima Etapa"}
        </StudioToolButton>
      )}

      <button type="button" onClick={_onHelp} aria-label="Ajuda da etapa" title="Ajuda da etapa" style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, color: C.muted, cursor: "pointer", marginRight: 6 }}>?</button>
      <button type="button" onClick={_onShortcuts} aria-label="Atalhos do Render Studio" title="Atalhos do Render Studio" style={{ height: 30, borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, color: C.muted, cursor: "pointer", padding: "0 8px", fontSize: 10, marginRight: 8 }}>⌨</button>
      <div aria-label={`Usuário: ${userName}`} style={{ width: 28, height: 28, borderRadius: "50%", background: C.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "#fff", flexShrink: 0 }}>
        {(userName?.[0] ?? "U").toUpperCase()}
      </div>
    </div>
  );
}

export function RenderStudioSidebar({
  step,
  projectTitle,
  onStepClick,
  onProjectClick,
}: {
  step: RenderStudioStep;
  projectTitle: string | null;
  onStepClick: (step: RenderStudioStep) => void;
  onProjectClick?: () => void;
}) {
  const currentIndex = renderStudioStepIndex(step);

  return (
    <div className="arqdor-legacy-sidebar" style={{ width: 220, flexShrink: 0, background: C.surface, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: C.dim, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>Projeto atual</div>
        <button
          type="button"
          onClick={onProjectClick}
          disabled={!projectTitle || !onProjectClick}
          title={projectTitle ? "Abrir dados do projeto" : "Nenhum projeto selecionado"}
          style={{ width: "100%", display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", background: C.card, borderRadius: 7, border: `1px solid ${C.border}`, cursor: projectTitle && onProjectClick ? "pointer" : "default", textAlign: "left" }}
        >
          <span style={{ fontSize: 12, color: C.accent }}>◈</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{projectTitle ?? "Nenhum projeto"}</span>
          {projectTitle && onProjectClick ? <span style={{ marginLeft: "auto", fontSize: 10, color: C.dim }}>↗</span> : null}
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "8px 0", scrollbarWidth: "none" }}>
        <div style={{ padding: "6px 14px 4px", fontSize: 9, fontWeight: 700, color: C.dim, letterSpacing: "0.08em", textTransform: "uppercase" }}>Studio</div>
        {RENDER_STUDIO_STEPS.map((item, index) => {
          const active = item.id === step;
          const done = index < currentIndex;
          const clickable = index <= currentIndex;
          return (
            <button
              className="arqdor-studio-step"
              data-step-number={String(index + 1).padStart(2, "0")}
              key={item.id}
              onClick={() => { if (clickable) onStepClick(item.id); }}
              aria-current={active ? "step" : undefined}
              disabled={!clickable}
              title={!clickable ? "Complete as etapas anteriores primeiro" : done ? `Voltar para ${item.label}` : undefined}
              style={{ width: "100%", textAlign: "left", background: active ? `${C.accent}18` : "none", border: "none", borderLeft: active ? `2px solid ${C.accent}` : "2px solid transparent", padding: "7px 14px 7px 12px", cursor: clickable ? "pointer" : "default", display: "flex", alignItems: "center", gap: 8, borderRadius: "0 6px 6px 0", transition: "background 0.12s", opacity: clickable ? 1 : 0.35 }}
            >
              <span style={{ fontSize: 12, color: active ? C.accent : done ? C.green : C.dim, width: 14, flexShrink: 0, textAlign: "center" }}>{done ? "✓" : item.icon}</span>
              <span style={{ fontSize: 11, fontWeight: active ? 700 : 400, color: active ? C.accentText : done ? C.text : C.muted }}>{item.label}</span>
              {active && <span style={{ marginLeft: "auto", width: 5, height: 5, borderRadius: "50%", background: C.accent }} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
