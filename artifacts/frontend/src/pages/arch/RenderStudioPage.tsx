// ARQDOR Render Studio — /arch/render
// Layout premium escuro: Topbar | Sidebar | Canvas | Painel Direito | Bottom | Rodapé
// Lógica de API preservada da Sprint 039. Apenas o visual foi redesenhado.

import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { useArqProject } from "@/modules/arqdor/hooks/useArqProject";
import { WorkspaceProvider } from "@/modules/arqdor/workspace/WorkspaceContext";
import { ArqdorThemeProvider } from "@/modules/arqdor/theme/ArqdorThemeProvider";
import { useAuth } from "@/contexts/AuthContext";
import { useRealRenderGallery } from "@/modules/arqdor/workspace/real-render-gallery/useRealRenderGallery";

// ─── Types ─────────────────────────────────────────────────────────────────────

type Step =
  | "projeto"
  | "ambiente"
  | "imagem"
  | "render"
  | "melhoria"
  | "versao"
  | "aprovar"
  | "especificacao";

const STEPS: { id: Step; label: string; icon: string }[] = [
  { id: "projeto",       label: "Projeto",        icon: "◈" },
  { id: "ambiente",      label: "Ambiente",        icon: "⬡" },
  { id: "imagem",        label: "Imagem base",     icon: "⬜" },
  { id: "render",        label: "Render IA",       icon: "✦" },
  { id: "melhoria",      label: "Melhoria",        icon: "◎" },
  { id: "versao",        label: "Versões",         icon: "⧉" },
  { id: "aprovar",       label: "Aprovar",         icon: "✓" },
  { id: "especificacao", label: "Especificação",   icon: "≡" },
];

function stepIndex(s: Step) {
  return STEPS.findIndex((x) => x.id === s);
}

// ─── API helpers ───────────────────────────────────────────────────────────────

function authHeader(): Record<string, string> {
  const tok = localStorage.getItem("vendorai_token") ?? "";
  return tok ? { Authorization: `Bearer ${tok}` } : {};
}

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

async function apiPost(path: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader() } as Record<string, string>,
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any).error ?? `Erro ${res.status}`);
  return data;
}

async function apiGet(path: string) {
  const res = await fetch(`${BASE}${path}`, { headers: authHeader() as HeadersInit });
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  return res.json();
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function waitForRenderCompletion(renderId: string, timeoutAttempts = 90) {
  let attempts = 0;
  while (attempts < timeoutAttempts) {
    await new Promise((r) => setTimeout(r, 2000));
    const data = await apiGet(`/api/arch/ai-render/${renderId}`);
    if (data.status === "concluido" && data.result_image_url) return data;
    if (data.status === "erro") throw new Error(data.erro_msg ?? "Erro no processamento do render");
    attempts++;
  }
  throw new Error("Tempo esgotado aguardando o render.");
}

// ─── Design tokens (dark premium) ──────────────────────────────────────────────

const D = {
  bg:          "#060911",
  surface:     "#0C1120",
  card:        "#111827",
  cardHov:     "#182030",
  border:      "#1E2A3A",
  borderLight: "#253347",
  purple:      "#7C3AED",
  purpleHov:   "#6D28D9",
  purpleMid:   "#9F6BF1",
  purpleGlow:  "rgba(124,58,237,0.18)",
  purpleText:  "#A78BFA",
  text:        "#EDF2F7",
  muted:       "#7B8EA5",
  dim:         "#3D4F62",
  green:       "#10B981",
  greenDim:    "rgba(16,185,129,0.15)",
  red:         "#EF4444",
  amber:       "#F59E0B",
  inputBg:     "#0B1122",
  overlay:     "rgba(6,9,17,0.88)",
} as const;

// ─── Small shared UI ───────────────────────────────────────────────────────────

function DkBtn({
  children, onClick, disabled, variant = "primary", small,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success";
  small?: boolean;
}) {
  const styles: Record<string, React.CSSProperties> = {
    primary:   { background: D.purple, color: "#fff", border: `1px solid ${D.purpleHov}` },
    secondary: { background: D.card, color: D.text, border: `1px solid ${D.border}` },
    ghost:     { background: "transparent", color: D.muted, border: "none" },
    danger:    { background: D.red, color: "#fff", border: "none" },
    success:   { background: D.green, color: "#fff", border: "none" },
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: small ? "6px 14px" : "8px 20px",
        borderRadius: 8,
        fontSize: small ? 11 : 12,
        fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        transition: "all 0.15s",
        letterSpacing: "0.02em",
        display: "flex",
        alignItems: "center",
        gap: 6,
        whiteSpace: "nowrap",
        ...styles[variant],
      }}
    >
      {children}
    </button>
  );
}

function DkSpinner({ size = 28 }: { size?: number }) {
  return (
    <>
      <div style={{
        width: size, height: size, borderRadius: "50%",
        border: `2px solid ${D.border}`, borderTopColor: D.purple,
        animation: "arq-spin 0.7s linear infinite", flexShrink: 0,
      }} />
      <style>{`@keyframes arq-spin{to{transform:rotate(360deg)}}`}</style>
    </>
  );
}

function DkErr({ msg }: { msg: string }) {
  return (
    <div style={{
      padding: "8px 12px", borderRadius: 7, fontSize: 11, fontWeight: 600,
      background: "rgba(239,68,68,0.12)", border: `1px solid rgba(239,68,68,0.3)`,
      color: D.red, lineHeight: 1.4,
    }}>
      {msg}
    </div>
  );
}

function Badge({ label, color = D.purple }: { label: string; color?: string }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 4,
      background: `${color}22`, color, border: `1px solid ${color}44`,
      letterSpacing: "0.06em", textTransform: "uppercase",
    }}>
      {label}
    </span>
  );
}

// ─── Topbar ────────────────────────────────────────────────────────────────────

function Topbar({
  step, projectTitle, ambiente, onNextStep, onBack, userName,
}: {
  step: Step;
  projectTitle: string | null;
  ambiente: string;
  onNextStep: () => void;
  onBack: () => void;
  userName: string;
}) {
  const nextLabels: Partial<Record<Step, string>> = {
    projeto:       "→ Definir Ambiente",
    ambiente:      "→ Carregar Imagem",
    imagem:        "→ Gerar Render",
    render:        "→ Melhorar",
    melhoria:      "→ Ver Versões",
    versao:        "→ Aprovar",
    aprovar:       "→ Especificação",
    especificacao: "✓ Concluído",
  };
  const breadcrumbs = [
    "Studio",
    ambiente || "Ambiente",
  ].filter(Boolean);

  return (
    <div style={{
      height: 52, display: "flex", alignItems: "center", padding: "0 16px",
      background: D.surface, borderBottom: `1px solid ${D.border}`, flexShrink: 0,
      gap: 0, zIndex: 100, position: "relative",
    }}>
      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 16, flexShrink: 0 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 6, background: D.purple,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 13, fontWeight: 900, color: "#fff", letterSpacing: "-0.03em",
        }}>A</div>
        <span style={{ fontSize: 12, fontWeight: 800, color: D.text, letterSpacing: "0.08em" }}>
          ARQDOR<span style={{ color: D.purpleMid, fontSize: 10 }}>.ai</span>
        </span>
      </div>

      <div style={{ width: 1, height: 20, background: D.border, marginRight: 16 }} />

      {/* Search */}
      <div style={{
        display: "flex", alignItems: "center", gap: 6, background: D.inputBg,
        border: `1px solid ${D.border}`, borderRadius: 7, padding: "5px 10px",
        marginRight: 16, minWidth: 180,
      }}>
        <span style={{ fontSize: 11, color: D.dim }}>⌕</span>
        <span style={{ fontSize: 11, color: D.dim }}>Buscar...</span>
      </div>

      {/* Project + breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginRight: 16 }}>
        {projectTitle && (
          <span style={{ fontSize: 11, fontWeight: 600, color: D.muted }}>{projectTitle}</span>
        )}
        {breadcrumbs.map((b, i) => (
          <span key={b} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, color: D.dim }}>›</span>
            <span style={{
              fontSize: 11, fontWeight: i === breadcrumbs.length - 1 ? 700 : 400,
              color: i === breadcrumbs.length - 1 ? D.purpleText : D.muted,
            }}>{b}</span>
          </span>
        ))}
      </div>

      <div style={{ flex: 1 }} />

      {/* Next step CTA */}
      <button
        onClick={onNextStep}
        style={{
          background: `linear-gradient(135deg, ${D.purple}, #6D28D9)`,
          color: "#fff", border: "none", borderRadius: 8,
          padding: "7px 18px", fontSize: 12, fontWeight: 700,
          cursor: "pointer", letterSpacing: "0.02em",
          boxShadow: `0 0 16px ${D.purpleGlow}`,
          marginRight: 12,
        }}
      >
        {nextLabels[step] ?? "Próxima Etapa"}
      </button>

      {/* AI Copilot */}
      <button style={{
        background: D.card, border: `1px solid ${D.border}`, borderRadius: 7,
        padding: "6px 12px", fontSize: 11, fontWeight: 700, color: D.purpleText,
        cursor: "pointer", marginRight: 8, display: "flex", alignItems: "center", gap: 5,
      }}>
        <span style={{ fontSize: 12 }}>✦</span> Copilot
      </button>

      {/* Notifications */}
      <button style={{
        background: "none", border: "none", cursor: "pointer", padding: "6px 8px",
        color: D.muted, fontSize: 16, borderRadius: 6, marginRight: 4,
        position: "relative",
      }}>
        🔔
        <span style={{
          position: "absolute", top: 4, right: 4, width: 6, height: 6,
          borderRadius: "50%", background: D.purple,
        }} />
      </button>

      {/* Profile */}
      <div style={{
        width: 28, height: 28, borderRadius: "50%", background: D.purple,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 11, fontWeight: 800, color: "#fff", cursor: "pointer", flexShrink: 0,
      }}>
        {(userName?.[0] ?? "U").toUpperCase()}
      </div>
    </div>
  );
}

// ─── Left Sidebar ──────────────────────────────────────────────────────────────

const SIDEBAR_NAV = [
  { group: "Studio", items: STEPS.map((s) => ({ id: s.id, label: s.label, icon: s.icon })) },
  { group: "Workspace", items: [
    { id: "biblioteca",    label: "Biblioteca",    icon: "▦" },
    { id: "especificacoes", label: "Especificações", icon: "≡" },
    { id: "producao",      label: "Produção",       icon: "⚙" },
    { id: "execucao",      label: "Execução",       icon: "▷" },
    { id: "entrega",       label: "Entrega",        icon: "✈" },
    { id: "evolucao",      label: "Evolução",       icon: "↑" },
  ]},
  { group: "CRM", items: [
    { id: "crm",       label: "CRM",       icon: "⊞" },
    { id: "clientes",  label: "Clientes",  icon: "◉" },
    { id: "propostas", label: "Propostas", icon: "◻" },
    { id: "contratos", label: "Contratos", icon: "◈" },
    { id: "financeiro",label: "Financeiro",icon: "₿" },
    { id: "agenda",    label: "Agenda",    icon: "⬡" },
  ]},
  { group: "Gestão", items: [
    { id: "relatorios", label: "Relatórios", icon: "⊟" },
    { id: "marketing",  label: "Marketing",  icon: "◎" },
    { id: "config",     label: "Configurações", icon: "⚙" },
  ]},
];

function LeftSidebar({
  step, projectTitle, onStepClick,
}: {
  step: Step;
  projectTitle: string | null;
  onStepClick: (s: Step) => void;
}) {
  const ci = stepIndex(step);
  return (
    <div style={{
      width: 220, flexShrink: 0, background: D.surface, borderRight: `1px solid ${D.border}`,
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* Project chip */}
      <div style={{
        padding: "10px 12px", borderBottom: `1px solid ${D.border}`, flexShrink: 0,
      }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: D.dim, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>
          Projeto atual
        </div>
        <div style={{
          display: "flex", alignItems: "center", gap: 6, padding: "6px 8px",
          background: D.card, borderRadius: 7, border: `1px solid ${D.border}`,
        }}>
          <span style={{ fontSize: 12, color: D.purple }}>◈</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: D.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {projectTitle ?? "Nenhum projeto"}
          </span>
        </div>
      </div>

      {/* Nav groups */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 0", scrollbarWidth: "none" }}>
        {SIDEBAR_NAV.map((group) => (
          <div key={group.group} style={{ marginBottom: 4 }}>
            <div style={{
              padding: "6px 14px 4px", fontSize: 9, fontWeight: 700,
              color: D.dim, letterSpacing: "0.08em", textTransform: "uppercase",
            }}>
              {group.group}
            </div>
            {group.items.map((item, idx) => {
              const isStep = group.group === "Studio";
              const stepId = isStep ? item.id as Step : null;
              const stepIdx = stepId ? stepIndex(stepId) : -1;
              const isActive = isStep && item.id === step;
              const isDone = isStep && stepIdx < ci;
              const isClickable = isStep && (stepIdx <= ci + 1);

              return (
                <button
                  key={item.id}
                  onClick={() => {
                    if (stepId && isClickable) onStepClick(stepId);
                  }}
                  style={{
                    width: "100%", textAlign: "left", background: isActive ? `${D.purple}22` : "none",
                    border: "none", borderLeft: isActive ? `2px solid ${D.purple}` : "2px solid transparent",
                    padding: "7px 14px 7px 12px", cursor: isClickable || !isStep ? "pointer" : "default",
                    display: "flex", alignItems: "center", gap: 8,
                    borderRadius: "0 6px 6px 0",
                    transition: "background 0.12s",
                  }}
                >
                  <span style={{
                    fontSize: 12, color: isActive ? D.purple : isDone ? D.green : D.dim,
                    width: 14, flexShrink: 0, textAlign: "center",
                  }}>
                    {isDone ? "✓" : item.icon}
                  </span>
                  <span style={{
                    fontSize: 11, fontWeight: isActive ? 700 : 400,
                    color: isActive ? D.purpleText : isDone ? D.text : D.muted,
                  }}>
                    {item.label}
                  </span>
                  {isActive && (
                    <span style={{ marginLeft: "auto", width: 5, height: 5, borderRadius: "50%", background: D.purple }} />
                  )}
                  {isStep && idx === 0 && !isActive && !isDone && (
                    <Badge label="Atual" />
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Central Canvas ────────────────────────────────────────────────────────────

function CentralCanvas({
  step, imageDataUrl, renderUrl, loading, onUpload, onStartRender,
}: {
  step: Step;
  imageDataUrl: string | null;
  renderUrl: string | null;
  loading: boolean;
  onUpload: () => void;
  onStartRender: () => void;
}) {
  const showRender = !!renderUrl;
  const showOriginal = !!imageDataUrl && !renderUrl && step !== "imagem";
  const showUpload = !imageDataUrl || step === "imagem";
  const showImage = showRender || showOriginal;
  const displayUrl = renderUrl ?? imageDataUrl;

  return (
    <div style={{
      flex: 1, overflow: "hidden", position: "relative", background: "#03050A",
      display: "flex", flexDirection: "column",
    }}>
      {/* View controls */}
      <div style={{
        position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)",
        zIndex: 10, display: "flex", gap: 4, background: `${D.surface}EE`,
        border: `1px solid ${D.border}`, borderRadius: 8, padding: "4px",
      }}>
        {["1:1", "Ajustar", "Comparar", "Grade"].map((label) => (
          <button key={label} style={{
            padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600,
            background: label === "Ajustar" ? `${D.purple}33` : "none",
            color: label === "Ajustar" ? D.purpleText : D.muted,
            border: label === "Ajustar" ? `1px solid ${D.purple}55` : "none",
            cursor: "pointer",
          }}>
            {label}
          </button>
        ))}
      </div>

      {/* Main canvas area */}
      <div style={{
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
        overflow: "hidden", position: "relative",
      }}>
        {loading && (
          <div style={{
            position: "absolute", inset: 0, zIndex: 20,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            background: `${D.overlay}`,
            gap: 16,
          }}>
            <DkSpinner size={48} />
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: D.text, marginBottom: 4 }}>
                Processando com IA...
              </div>
              <div style={{ fontSize: 12, color: D.muted }}>Aguarde, isso pode levar alguns segundos</div>
            </div>
          </div>
        )}

        {showImage && displayUrl && (
          <>
            <img
              src={displayUrl}
              alt="render"
              style={{
                maxWidth: "100%", maxHeight: "100%",
                objectFit: "contain",
                boxShadow: "0 8px 64px rgba(0,0,0,0.6)",
              }}
            />
            {/* Overlay instruction */}
            {showRender && !loading && (
              <div style={{
                position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)",
                background: `${D.surface}CC`, border: `1px solid ${D.border}`,
                borderRadius: 8, padding: "6px 14px", fontSize: 11, color: D.muted,
                backdropFilter: "blur(8px)",
              }}>
                Clique em um objeto para editar ou alterar
              </div>
            )}
          </>
        )}

        {showUpload && !loading && (
          <div
            onClick={onUpload}
            style={{
              border: `2px dashed ${imageDataUrl ? D.purple : D.border}`,
              borderRadius: 16, padding: "48px 40px", cursor: "pointer",
              background: imageDataUrl ? `${D.purple}08` : `${D.card}88`,
              display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
              transition: "all 0.2s", maxWidth: 420, width: "100%",
            }}
          >
            {imageDataUrl ? (
              <>
                <img src={imageDataUrl} alt="base" style={{
                  maxHeight: 260, maxWidth: "100%", borderRadius: 10,
                  objectFit: "contain", boxShadow: "0 4px 32px rgba(0,0,0,0.4)",
                }} />
                <span style={{ fontSize: 11, color: D.purpleText, fontWeight: 600 }}>
                  Clique para trocar a imagem
                </span>
              </>
            ) : (
              <>
                <div style={{
                  width: 64, height: 64, borderRadius: 16, background: `${D.purple}22`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 28, color: D.purple,
                }}>
                  ⬜
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: D.text, marginBottom: 6 }}>
                    Carregar imagem do ambiente
                  </div>
                  <div style={{ fontSize: 12, color: D.muted }}>
                    JPG, PNG, WEBP — máx. 10 MB<br />
                    Clique ou arraste aqui
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Empty placeholder when no image and not on imagem step */}
        {!showImage && !showUpload && !loading && (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: 14,
            color: D.dim,
          }}>
            <div style={{ fontSize: 48, opacity: 0.3 }}>✦</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: D.muted }}>
              Aguardando imagem base
            </div>
            <div style={{ fontSize: 12, color: D.dim }}>
              Complete os passos anteriores para gerar o render
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Right Panel ───────────────────────────────────────────────────────────────

function RightPanel({
  step, arq, ambiente, setAmbiente, imageFile, renderUrl, versions, loading, err,
  melhoriaPrompt, setMelhoriaPrompt, melhoriaMode, setMelhoriaMode,
  approved, specDone,
  onSelectProject, onCreateProject, onGo, onStartRender, onApplyMelhoria, onApprove, onSendToSpec,
  fileRef, onUpload,
}: any) {
  const [tab, setTab] = useState<"propriedades" | "camadas">("propriedades");

  const AMBIENTE_OPTIONS = ["Sala de Estar", "Quarto Master", "Cozinha", "Banheiro", "Escritório", "Varanda", "Hall de Entrada"];
  const MELHORIA_MODES: { id: string; label: string; icon: string }[] = [
    { id: "improve", label: "Melhorar qualidade", icon: "✨" },
    { id: "change-material", label: "Trocar material", icon: "🎨" },
    { id: "change-lighting", label: "Ajustar iluminação", icon: "💡" },
  ];

  return (
    <div style={{
      width: 300, flexShrink: 0, background: D.surface, borderLeft: `1px solid ${D.border}`,
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* Tabs */}
      <div style={{
        display: "flex", borderBottom: `1px solid ${D.border}`, flexShrink: 0,
      }}>
        {(["propriedades", "camadas"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1, padding: "10px 0", fontSize: 11, fontWeight: tab === t ? 700 : 400,
              color: tab === t ? D.purpleText : D.muted,
              background: "none", border: "none", borderBottom: tab === t ? `2px solid ${D.purple}` : "2px solid transparent",
              cursor: "pointer", textTransform: "capitalize", letterSpacing: "0.02em",
              marginBottom: -1,
            }}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Panel content */}
      <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 12 }}>

        {tab === "camadas" && (
          <div style={{ color: D.muted, fontSize: 12, textAlign: "center", padding: 24 }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>⧉</div>
            Camadas disponíveis após gerar o render
          </div>
        )}

        {tab === "propriedades" && (
          <>
            {/* Step: Projeto */}
            {step === "projeto" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <PanelLabel>Selecionar Projeto</PanelLabel>
                {arq.projectsLoading ? (
                  <div style={{ display: "flex", justifyContent: "center", padding: 16 }}>
                    <DkSpinner size={20} />
                  </div>
                ) : arq.projects.length === 0 ? (
                  <div style={{ textAlign: "center", padding: 16 }}>
                    <p style={{ margin: "0 0 10px", fontSize: 12, color: D.muted }}>Nenhum projeto.</p>
                    <DkBtn small onClick={onCreateProject}>+ Criar projeto</DkBtn>
                  </div>
                ) : (
                  arq.projects.map((p: any) => {
                    const active = p.id === arq.projectId;
                    return (
                      <button key={p.id} onClick={() => onSelectProject(p.id)} style={{
                        padding: "8px 10px", borderRadius: 7, textAlign: "left",
                        border: `1px solid ${active ? D.purple : D.border}`,
                        background: active ? `${D.purple}22` : D.card,
                        cursor: "pointer", transition: "all 0.12s",
                      }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: D.text }}>{p.titulo}</div>
                        {p.clienteNome && <div style={{ fontSize: 10, color: D.muted }}>Cliente: {p.clienteNome}</div>}
                      </button>
                    );
                  })
                )}
                <DkBtn small variant="ghost" onClick={onCreateProject}>+ Novo projeto</DkBtn>
              </div>
            )}

            {/* Step: Ambiente */}
            {step === "ambiente" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <PanelLabel>Ambiente</PanelLabel>
                {AMBIENTE_OPTIONS.map((opt) => (
                  <button key={opt} onClick={() => setAmbiente(opt)} style={{
                    padding: "7px 10px", borderRadius: 6, textAlign: "left",
                    border: `1px solid ${ambiente === opt ? D.purple : D.border}`,
                    background: ambiente === opt ? `${D.purple}22` : D.card,
                    cursor: "pointer", fontSize: 11, fontWeight: ambiente === opt ? 700 : 400,
                    color: ambiente === opt ? D.purpleText : D.text,
                  }}>{opt}</button>
                ))}
                <input
                  value={AMBIENTE_OPTIONS.includes(ambiente) ? "" : ambiente}
                  onChange={(e) => setAmbiente(e.target.value)}
                  placeholder="Outro ambiente..."
                  style={inputStyle}
                />
                {ambiente.trim() && (
                  <DkBtn onClick={() => onGo("imagem")}>→ Continuar</DkBtn>
                )}
              </div>
            )}

            {/* Step: Imagem */}
            {step === "imagem" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <PanelLabel>Imagem base</PanelLabel>
                <InfoBox>
                  Ambiente: <strong style={{ color: D.text }}>{ambiente}</strong>
                </InfoBox>
                {imageFile && (
                  <div style={{ fontSize: 11, color: D.green, padding: "6px 8px", background: D.greenDim, borderRadius: 6 }}>
                    ✓ {imageFile.name}
                  </div>
                )}
                <DkBtn onClick={onUpload} variant={imageFile ? "secondary" : "primary"}>
                  {imageFile ? "↺ Trocar imagem" : "⬜ Carregar imagem"}
                </DkBtn>
                {imageFile && (
                  <DkBtn onClick={() => onGo("render")}>→ Continuar</DkBtn>
                )}
              </div>
            )}

            {/* Step: Render */}
            {step === "render" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <PanelLabel>Render IA</PanelLabel>
                <InfoBox>
                  {arq.projectMeta?.titulo} · {ambiente}
                </InfoBox>
                {!renderUrl && !loading && (
                  <>
                    <div style={{ fontSize: 11, color: D.muted, lineHeight: 1.5 }}>
                      Tempo estimado: 30–90 segundos
                    </div>
                    <DkBtn onClick={onStartRender} disabled={loading}>
                      ✦ Gerar Render com IA
                    </DkBtn>
                  </>
                )}
                {loading && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, color: D.muted, fontSize: 11 }}>
                    <DkSpinner size={14} /> Processando...
                  </div>
                )}
                {renderUrl && !loading && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ fontSize: 11, color: D.green, padding: "6px 8px", background: D.greenDim, borderRadius: 6 }}>
                      ✓ Render gerado com sucesso
                    </div>
                    <DkBtn variant="secondary" onClick={onStartRender} small>↺ Novo render</DkBtn>
                    <DkBtn onClick={() => onGo("melhoria")}>→ Melhorar</DkBtn>
                    <DkBtn variant="ghost" onClick={() => onGo("aprovar")} small>Pular melhoria →</DkBtn>
                  </div>
                )}
              </div>
            )}

            {/* Step: Melhoria */}
            {step === "melhoria" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <PanelLabel>Melhoria / Material</PanelLabel>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {MELHORIA_MODES.map((m) => (
                    <button key={m.id} onClick={() => setMelhoriaMode(m.id)} style={{
                      padding: "7px 10px", borderRadius: 6, textAlign: "left",
                      border: `1px solid ${melhoriaMode === m.id ? D.purple : D.border}`,
                      background: melhoriaMode === m.id ? `${D.purple}22` : D.card,
                      cursor: "pointer", fontSize: 11, fontWeight: 700,
                      color: melhoriaMode === m.id ? D.purpleText : D.muted,
                      display: "flex", alignItems: "center", gap: 6,
                    }}>
                      <span>{m.icon}</span> {m.label}
                    </button>
                  ))}
                </div>
                <textarea
                  value={melhoriaPrompt}
                  onChange={(e: any) => setMelhoriaPrompt(e.target.value)}
                  placeholder={
                    melhoriaMode === "change-material" ? "Ex: trocar piso de madeira por mármore..." :
                    melhoriaMode === "change-lighting" ? "Ex: iluminação natural, tarde, luz suave..." :
                    "Ex: melhorar texturas, sombras, acabamento..."
                  }
                  rows={3}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
                <DkBtn
                  disabled={!melhoriaPrompt.trim() || loading}
                  onClick={onApplyMelhoria}
                >
                  {loading ? "Aplicando..." : "✦ Aplicar melhoria"}
                </DkBtn>
              </div>
            )}

            {/* Step: Versão */}
            {step === "versao" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <PanelLabel>Versões da sessão</PanelLabel>
                {versions.length === 0 ? (
                  <div style={{ fontSize: 11, color: D.muted, textAlign: "center", padding: 12 }}>
                    Nenhuma versão gerada.
                  </div>
                ) : (
                  versions.map((v: any, i: number) => (
                    <div key={v.id} style={{
                      display: "flex", gap: 8, alignItems: "center", padding: "7px 8px",
                      borderRadius: 7, border: `1px solid ${i === 0 ? D.purple : D.border}`,
                      background: i === 0 ? `${D.purple}18` : D.card,
                    }}>
                      <img src={v.url} alt={v.label} style={{
                        width: 52, height: 38, objectFit: "cover", borderRadius: 4,
                      }} />
                      <div style={{ flex: 1, fontSize: 10, color: i === 0 ? D.purpleText : D.muted, fontWeight: i === 0 ? 700 : 400 }}>
                        {v.label}{i === 0 ? " · Atual" : ""}
                      </div>
                    </div>
                  ))
                )}
                <DkBtn onClick={() => onGo("aprovar")}>→ Aprovar render</DkBtn>
              </div>
            )}

            {/* Step: Aprovar */}
            {step === "aprovar" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <PanelLabel>Aprovação</PanelLabel>
                <div style={{
                  padding: "8px 10px", borderRadius: 7, fontSize: 11, lineHeight: 1.5,
                  background: D.greenDim, border: `1px solid ${D.green}44`, color: D.green,
                }}>
                  ✓ Aprove este render para liberar a geração da especificação técnica.
                </div>
                <DkBtn disabled={loading} onClick={onApprove} variant="success">
                  {loading ? "Aprovando..." : "✓ Aprovar este render"}
                </DkBtn>
              </div>
            )}

            {/* Step: Especificação */}
            {step === "especificacao" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <PanelLabel>Especificação técnica</PanelLabel>
                {specDone ? (
                  <div style={{
                    padding: "10px", borderRadius: 7, fontSize: 12, color: D.green,
                    background: D.greenDim, border: `1px solid ${D.green}44`,
                    textAlign: "center", lineHeight: 1.6,
                  }}>
                    ✅ Especificação gerada!<br />
                    <span style={{ fontSize: 10, color: D.muted }}>Materiais e objetos extraídos.</span>
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 11, color: D.muted, lineHeight: 1.5 }}>
                      ✦ Extrai materiais, acabamentos e objetos do render aprovado.
                    </div>
                    <DkBtn disabled={loading} onClick={onSendToSpec}>
                      {loading ? "Gerando..." : "✦ Gerar especificação"}
                    </DkBtn>
                  </>
                )}
              </div>
            )}

            {/* Object info (shown when render exists) */}
            {renderUrl && (
              <div style={{ marginTop: 4 }}>
                <PanelLabel>Objeto selecionado</PanelLabel>
                <div style={{
                  padding: 10, borderRadius: 7, background: D.card, border: `1px solid ${D.border}`,
                  display: "flex", flexDirection: "column", gap: 6,
                }}>
                  <div style={{ fontSize: 10, color: D.dim, textAlign: "center", padding: "8px 0" }}>
                    Clique em um objeto no canvas para inspecionar
                  </div>
                </div>
              </div>
            )}

            {/* AI suggestion */}
            <div style={{
              marginTop: "auto", padding: 10, borderRadius: 8,
              background: `${D.purple}12`, border: `1px solid ${D.purple}33`,
            }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: D.purple, letterSpacing: "0.06em", marginBottom: 6 }}>
                ✦ IA COPILOT
              </div>
              <div style={{ fontSize: 11, color: D.muted, lineHeight: 1.5, marginBottom: 8 }}>
                {step === "render" ? "Pronto para gerar o render com preservação de geometria e câmera." :
                 step === "melhoria" ? "Posso sugerir variações de material baseadas no estilo do projeto." :
                 step === "aprovar" ? "Este render está tecnicamente válido para extração de especificações." :
                 "Como posso ajudar neste ambiente?"}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <DkBtn small variant="secondary">Testar</DkBtn>
                <DkBtn small variant="ghost">Ignorar</DkBtn>
              </div>
            </div>

            {err && <DkErr msg={err} />}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Bottom Panel ──────────────────────────────────────────────────────────────

function BottomPanel({
  versions, projectId,
}: {
  versions: { id: string; url: string; label: string }[];
  projectId: string | null;
}) {
  const [tab, setTab] = useState<"storyboard" | "versoes" | "comentarios" | "historico" | "ia">("versoes");
  const gallery = useRealRenderGallery(projectId ?? "");

  const allVersions = [
    ...versions,
    ...(gallery.items ?? []).map((item) => ({
      id: item.id,
      url: item.imageUrl,
      label: item.title,
    })),
  ];

  const TABS = ["storyboard", "versoes", "comentarios", "historico", "ia"] as const;

  return (
    <div style={{
      height: 180, flexShrink: 0, borderTop: `1px solid ${D.border}`,
      background: D.surface, display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* Tabs */}
      <div style={{
        display: "flex", alignItems: "center", borderBottom: `1px solid ${D.border}`,
        padding: "0 12px", gap: 0, flexShrink: 0,
      }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "8px 14px", fontSize: 10, fontWeight: tab === t ? 700 : 400,
              color: tab === t ? D.purpleText : D.muted,
              background: "none", border: "none",
              borderBottom: tab === t ? `2px solid ${D.purple}` : "2px solid transparent",
              cursor: "pointer", textTransform: "capitalize", letterSpacing: "0.03em",
              marginBottom: -1,
            }}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button style={{
          padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700,
          background: `${D.purple}22`, color: D.purpleText, border: `1px solid ${D.purple}44`,
          cursor: "pointer", marginRight: 8,
        }}>
          + Novo Storyboard
        </button>
        <button style={{
          padding: "4px 10px", borderRadius: 6, fontSize: 10,
          background: D.card, color: D.muted, border: `1px solid ${D.border}`,
          cursor: "pointer",
        }}>
          Comparar
        </button>
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowX: "auto", overflowY: "hidden", padding: "8px 12px" }}>
        {tab === "versoes" && (
          <div style={{ display: "flex", gap: 8, height: "100%", alignItems: "center" }}>
            {gallery.loading && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: D.muted, fontSize: 11 }}>
                <DkSpinner size={14} /> Carregando galeria...
              </div>
            )}
            {allVersions.length === 0 && !gallery.loading && (
              <div style={{ fontSize: 11, color: D.dim, padding: "0 8px" }}>
                Nenhuma versão ainda. Gere o primeiro render.
              </div>
            )}
            {allVersions.map((v, i) => (
              <div key={v.id} style={{
                flexShrink: 0, width: 110, height: 114,
                background: D.card, border: `1px solid ${i === 0 ? D.purple : D.border}`,
                borderRadius: 8, overflow: "hidden", cursor: "pointer",
                display: "flex", flexDirection: "column",
                transition: "border-color 0.12s",
              }}>
                <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
                  <img src={v.url} alt={v.label} style={{
                    width: "100%", height: "100%", objectFit: "cover",
                  }} />
                  {i === 0 && (
                    <div style={{
                      position: "absolute", top: 4, right: 4, fontSize: 8, fontWeight: 800,
                      background: D.purple, color: "#fff", padding: "2px 5px", borderRadius: 3,
                    }}>
                      ATUAL
                    </div>
                  )}
                </div>
                <div style={{
                  padding: "5px 6px", fontSize: 9, color: D.muted,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  flexShrink: 0,
                }}>
                  {v.label}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "storyboard" && (
          <div style={{ fontSize: 11, color: D.dim, padding: "16px 0" }}>
            Storyboard visual do projeto estará disponível após o primeiro render aprovado.
          </div>
        )}

        {(tab === "comentarios" || tab === "historico" || tab === "ia") && (
          <div style={{ fontSize: 11, color: D.dim, padding: "16px 0" }}>
            {tab === "comentarios" ? "Nenhum comentário ainda." :
             tab === "historico" ? "Histórico de ações aparecerá aqui." :
             "Sugestões de IA aparecerão aqui."}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Footer ────────────────────────────────────────────────────────────────────

function Footer({ projectTitle, ambiente }: { projectTitle: string | null; ambiente: string }) {
  const [now] = useState(() => new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
  return (
    <div style={{
      height: 28, display: "flex", alignItems: "center", padding: "0 14px",
      background: D.bg, borderTop: `1px solid ${D.border}`, flexShrink: 0,
      gap: 16,
    }}>
      <span style={{ fontSize: 10, color: D.dim, display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: D.green, display: "inline-block" }} />
        Salvo automaticamente
      </span>
      <Sep />
      <span style={{ fontSize: 10, color: D.dim }}>Última alteração: {now}</span>
      {ambiente && <><Sep /><span style={{ fontSize: 10, color: D.dim }}>Ambiente: {ambiente}</span></>}
      {projectTitle && <><Sep /><span style={{ fontSize: 10, color: D.dim }}>{projectTitle}</span></>}
      <div style={{ flex: 1 }} />
      <span style={{ fontSize: 10, color: D.dim }}>? Ajuda</span>
      <Sep />
      <span style={{ fontSize: 10, color: D.dim }}>⌨ Atalhos</span>
    </div>
  );
}

function Sep() {
  return <span style={{ width: 1, height: 12, background: D.border }} />;
}

// ─── Small helpers ─────────────────────────────────────────────────────────────

function PanelLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 9, fontWeight: 800, color: D.dim, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2 }}>
      {children}
    </div>
  );
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: "6px 8px", borderRadius: 6, background: D.card, border: `1px solid ${D.border}`, fontSize: 11, color: D.muted }}>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "7px 10px", borderRadius: 6, fontSize: 11,
  border: `1px solid ${D.border}`, background: D.inputBg, color: D.text,
  outline: "none", fontFamily: "inherit", boxSizing: "border-box",
};

// ─── Main workspace inner ──────────────────────────────────────────────────────

function RenderStudioInner() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const arq = useArqProject();

  const [step, setStep]           = useState<Step>("projeto");
  const [ambiente, setAmbiente]   = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [renderId, setRenderId]   = useState<string | null>(null);
  const [renderUrl, setRenderUrl] = useState<string | null>(null);
  const [versions, setVersions]   = useState<{ id: string; url: string; label: string }[]>([]);
  const [approved, setApproved]   = useState(false);
  const [specDone, setSpecDone]   = useState(false);
  const [loading, setLoading]     = useState(false);
  const [err, setErr]             = useState<string | null>(null);
  const [melhoriaPrompt, setMelhoriaPrompt] = useState("");
  const [melhoriaMode, setMelhoriaMode] = useState<"improve" | "change-material" | "change-lighting">("improve");

  const fileRef = useRef<HTMLInputElement>(null);

  const go = useCallback((s: Step) => { setErr(null); setStep(s); }, []);

  // ── Auto-advance step when project is loaded ──
  useEffect(() => {
    if (arq.projectId && step === "projeto") go("ambiente");
  }, [arq.projectId]);

  // ── Step: Start render ───────────────────────────────────────────────────────
  async function startRender() {
    if (!imageDataUrl) return;
    setLoading(true);
    setErr(null);
    setRenderUrl(null);
    setRenderId(null);
    try {
      const { render_id } = await apiPost("/api/arch/ai-render", {
        project_id: arq.projectId ?? undefined,
        original_image_url: imageDataUrl,
        mode: "preservar",
        ambiente: ambiente.toLowerCase().replace(/\s+/g, "_"),
        user_notes: "Preservar absolutamente o projeto, medidas, câmera, perspectiva, layout, marcenaria, circulação, aberturas e proporções. Alterar somente a qualidade visual do render.",
      });
      setRenderId(render_id);
      const data = await waitForRenderCompletion(render_id);
      setRenderUrl(data.result_image_url);
      setVersions([{ id: render_id, url: data.result_image_url, label: "Versão 1 · Original" }]);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Erro ao gerar render.");
    } finally {
      setLoading(false);
    }
  }

  // ── Step: Apply melhoria ─────────────────────────────────────────────────────
  async function applyMelhoria() {
    if (!renderId || !melhoriaPrompt.trim()) return;
    setLoading(true);
    setErr(null);
    try {
      const { render_id } = await apiPost(`/api/arch/ai-render/${renderId}/adjust`, {
        ajuste_prompt: [
          melhoriaMode === "change-material" ? "Alteração de material solicitada." : null,
          melhoriaMode === "change-lighting" ? "Ajuste de iluminação solicitado." : null,
          melhoriaPrompt.trim(),
          "Preservar absolutamente medidas, câmera, perspectiva, layout, marcenaria, circulação e proporções. Criar nova versão sem substituir a original.",
        ].filter(Boolean).join(" "),
        mask_zones: melhoriaMode === "change-material" ? ["material"] : [],
        createNewVersion: true,
        preserveGeometry: true,
        preserveCamera: true,
      });
      const data = await waitForRenderCompletion(render_id);
      setRenderUrl(data.result_image_url);
      setRenderId(render_id);
      setVersions((v) => [
        {
          id: render_id,
          url: data.result_image_url,
          label: `Versão ${v.length + 1} · ${
            melhoriaMode === "change-material" ? "Material" :
            melhoriaMode === "change-lighting" ? "Iluminação" :
            "Melhoria"
          }`,
        },
        ...v,
      ]);
      go("versao");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Erro ao aplicar melhoria.");
    } finally {
      setLoading(false);
    }
  }

  // ── Step: Approve ────────────────────────────────────────────────────────────
  async function handleApprove() {
    if (!renderId || !arq.projectId) return;
    setLoading(true);
    setErr(null);
    try {
      await apiPost(`/api/arch/ai-render/${renderId}/approve`, {
        renderId,
        projectId: arq.projectId,
        notes: `Aprovado via ARQDOR — ${ambiente}`,
      });
      setApproved(true);
      go("especificacao");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Erro ao aprovar.");
    } finally {
      setLoading(false);
    }
  }

  // ── Step: Send to spec ───────────────────────────────────────────────────────
  async function handleSendToSpec() {
    if (!renderId || !arq.projectId || !renderUrl) return;
    setLoading(true);
    setErr(null);
    try {
      await apiPost(`/api/arch/specification/analyze`, {
        renderId,
        projetoId: arq.projectId,
        imageUrl: renderUrl,
      });
      setSpecDone(true);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Erro ao enviar para especificação.");
    } finally {
      setLoading(false);
    }
  }

  // ── Topbar next step handler ─────────────────────────────────────────────────
  function handleNextStep() {
    const si = stepIndex(step);
    const next = STEPS[si + 1];
    if (!next) return;

    // Validate before advancing
    if (step === "projeto" && !arq.projectId) return;
    if (step === "ambiente" && !ambiente.trim()) return;
    if (step === "imagem" && !imageDataUrl) return;
    if (step === "render" && !renderUrl) { void startRender(); return; }
    if (step === "melhoria") { go("versao"); return; }
    if (step === "aprovar") { void handleApprove(); return; }
    if (step === "especificacao") { void handleSendToSpec(); return; }

    go(next.id);
  }

  // ── Upload handler ───────────────────────────────────────────────────────────
  function handleUpload() {
    fileRef.current?.click();
  }

  const userName = (user as any)?.name ?? (user as any)?.email ?? "U";

  return (
    <div style={{
      height: "100vh", display: "flex", flexDirection: "column",
      background: D.bg,
      fontFamily: 'system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      boxSizing: "border-box", overflow: "hidden", color: D.text,
    }}>
      {/* Hidden file input */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setImageFile(f);
          setImageDataUrl(await fileToDataUrl(f));
          if (step === "imagem") go("render");
        }}
      />

      {/* 1. Topbar */}
      <Topbar
        step={step}
        projectTitle={arq.projectMeta?.titulo ?? null}
        ambiente={ambiente}
        onNextStep={handleNextStep}
        onBack={() => setLocation("/arch/projetos")}
        userName={userName}
      />

      {/* 2. Workspace row */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* 2a. Left sidebar */}
        <LeftSidebar
          step={step}
          projectTitle={arq.projectMeta?.titulo ?? null}
          onStepClick={(s) => go(s)}
        />

        {/* 2b. Center column (canvas + bottom panel) */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <CentralCanvas
            step={step}
            imageDataUrl={imageDataUrl}
            renderUrl={renderUrl}
            loading={loading}
            onUpload={handleUpload}
            onStartRender={startRender}
          />

          <BottomPanel
            versions={versions}
            projectId={arq.projectId}
          />
        </div>

        {/* 2c. Right panel */}
        <RightPanel
          step={step}
          arq={arq}
          ambiente={ambiente}
          setAmbiente={setAmbiente}
          imageFile={imageFile}
          renderUrl={renderUrl}
          versions={versions}
          loading={loading}
          err={err}
          melhoriaPrompt={melhoriaPrompt}
          setMelhoriaPrompt={setMelhoriaPrompt}
          melhoriaMode={melhoriaMode}
          setMelhoriaMode={setMelhoriaMode}
          approved={approved}
          specDone={specDone}
          onSelectProject={(id: string) => { void arq.selectProject(id); go("ambiente"); }}
          onCreateProject={() => {
            const name = prompt("Nome do projeto:");
            if (name?.trim()) void arq.createProject(name.trim()).then(() => go("ambiente"));
          }}
          onGo={go}
          onStartRender={startRender}
          onApplyMelhoria={applyMelhoria}
          onApprove={handleApprove}
          onSendToSpec={handleSendToSpec}
          fileRef={fileRef}
          onUpload={handleUpload}
        />
      </div>

      {/* 3. Footer */}
      <Footer projectTitle={arq.projectMeta?.titulo ?? null} ambiente={ambiente} />
    </div>
  );
}

// ─── Page export ───────────────────────────────────────────────────────────────

export default function RenderStudioPage() {
  return (
    <ArqdorThemeProvider>
      <WorkspaceProvider>
        <RenderStudioInner />
      </WorkspaceProvider>
    </ArqdorThemeProvider>
  );
}
