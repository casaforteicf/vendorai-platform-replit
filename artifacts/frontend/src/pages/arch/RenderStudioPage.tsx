// RenderStudioPage — Layout premium para /arch/render
// Standalone (não usa ArqWorkspace shell): topbar própria + sidebar esquerda +
// canvas central + painel direito + barra de status inferior.

import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useArqProject } from "@/modules/arqdor/hooks/useArqProject";
import { WorkspaceProvider } from "@/modules/arqdor/workspace/WorkspaceContext";
import { ArqdorThemeProvider } from "@/modules/arqdor/theme/ArqdorThemeProvider";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

// ─── Tokens ──────────────────────────────────────────────────────────────────
const C = {
  bg:          "#F7F7F8",
  surface:     "#FFFFFF",
  topbar:      "#0A0C10",
  topbarBorder:"#1E2330",
  sidebar:     "#FFFFFF",
  sidebarBdr:  "#E5E7EB",
  canvas:      "#0B0D12",
  canvasBdr:   "#1F2937",
  rightPanel:  "#FFFFFF",
  rightBdr:    "#E5E7EB",
  purple:      "#7C3AED",
  purpleLight: "#EDE9FE",
  purpleText:  "#6D28D9",
  text:        "#0F172A",
  textSub:     "#64748B",
  textDim:     "#94A3B8",
  border:      "#E5E7EB",
  green:       "#10B981",
  amber:       "#F59E0B",
  inputBg:     "#F8FAFC",
  inputBdr:    "#E2E8F0",
  statusBar:   "#F1F5F9",
  statusBdr:   "#E2E8F0",
  activeNavBg: "#EDE9FE",
  activeNavTx: "#6D28D9",
} as const;

// ─── Nav items ────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: "studio",         label: "Studio",         icon: "✦" },
  { id: "ambientes",      label: "Ambientes",       icon: "🏠" },
  { id: "storyboard",     label: "Storyboard",      icon: "🎬" },
  { id: "biblioteca",     label: "Biblioteca",      icon: "🖼️" },
  { id: "especificacoes", label: "Especificações",  icon: "📋" },
  { id: "producao",       label: "Produção",        icon: "🏭" },
  { id: "execucao",       label: "Execução",        icon: "⚙️" },
  { id: "entrega",        label: "Entrega",         icon: "📦" },
  { id: "evolucao",       label: "Evolução",        icon: "📈" },
] as const;

const ESCRITORIO_ITEMS = [
  { id: "crm",       label: "CRM",       icon: "💼" },
  { id: "clientes",  label: "Clientes",  icon: "👤" },
  { id: "propostas", label: "Propostas", icon: "📄" },
  { id: "contratos", label: "Contratos", icon: "✍️" },
  { id: "financeiro",label: "Financeiro",icon: "💰" },
  { id: "agenda",    label: "Agenda",    icon: "📅" },
  { id: "relatorios",label: "Relatórios",icon: "📊" },
  { id: "marketing", label: "Marketing", icon: "📣" },
] as const;

// Route map for ESCRITÓRIO items
const ESCRITORIO_ROUTES: Record<string, string> = {
  crm:       "/leads",
  clientes:  "/leads",
  propostas: "/propostas",
  contratos: "/propostas",
  financeiro:"/financeiro",
  agenda:    "/agenda",
  relatorios:"/analytics",
  marketing: "/leads",
};

// Route map for studio NAV_ITEMS that have dedicated pages
const STUDIO_ROUTES: Record<string, string> = {
  biblioteca:     "/arch/catalogo",
  especificacoes: "/arch/projetos",
  producao:       "/arch/projetos",
  entrega:        "/arch/projetos",
};

const CANVAS_TABS = ["Storyboard", "Versões", "Comentários", "Memória", "Histórico", "IA"] as const;

// ─── Tab panel data ────────────────────────────────────────────────────────────
const VERSOES_ITEMS = [
  { id: "v3", label: "v3 — Render final revisado",  date: "08/06/2024", tag: "Atual",     tagColor: "#10B981" },
  { id: "v2", label: "v2 — Ajuste de iluminação",   date: "02/06/2024", tag: "Aprovada",  tagColor: "#7C3AED" },
  { id: "v1", label: "v1 — Conceito inicial",        date: "25/05/2024", tag: "Arquivada", tagColor: "#94A3B8" },
] as const;

const COMENTARIOS_ITEMS = [
  { id: "c1", autor: "Cliente",     msg: "Adorei a poltrona, mas a cor da parede ficou muito escura.", hora: "10:23", avatar: "👤" },
  { id: "c2", autor: "Marcos V.",   msg: "Pode clarear sim, vou gerar uma variação com tom mais quente.", hora: "10:45", avatar: "🏛️" },
  { id: "c3", autor: "Cliente",     msg: "Ótimo! E o piso também pode ser mais claro?", hora: "11:02", avatar: "👤" },
] as const;

const MEMORIA_ITEMS = [
  { icon: "🎨", label: "Paleta",    val: "Neutros + rosé gold" },
  { icon: "🪑", label: "Mobiliário", val: "Contemporâneo minimalista" },
  { icon: "💡", label: "Iluminação", val: "Indireta + spots embutidos" },
  { icon: "🪵", label: "Materiais",  val: "Madeira clara, mármore, linho" },
] as const;

const HISTORICO_ITEMS = [
  { icon: "✨", label: "Render gerado",          det: "v3 — Sala de Estar",      hora: "08/06 14:32" },
  { icon: "🎨", label: "Material alterado",       det: "Poltrona: Linho Bege",    hora: "08/06 14:10" },
  { icon: "↺",  label: "Versão restaurada",       det: "v2 — Iluminação",         hora: "02/06 11:45" },
  { icon: "📋", label: "Especificação exportada", det: "PDF Sala de Estar",        hora: "25/05 09:20" },
] as const;

const IA_SUGESTOES = [
  { icon: "💡", titulo: "Iluminação de realce",  desc: "A parede de mármore ficará mais valorizada com luz indireta acima do painel.", cta: "Testar" },
  { icon: "🎨", titulo: "Harmonia de cores",     desc: "Um tapete em bege-areia harmonizaria o piso com a poltrona.",                   cta: "Ver sugestão" },
  { icon: "🪑", titulo: "Objeto alternativo",    desc: "Identificamos uma mesa de centro que complementa o estilo contemporâneo.",      cta: "Substituir" },
] as const;

// ─── Nav module placeholders ──────────────────────────────────────────────────
const MODULE_PLACEHOLDERS: Record<string, { icon: string; title: string; desc: string; action: string }> = {
  ambientes:  { icon: "🏠", title: "Ambientes", desc: "Configure ambientes como sala, cozinha, suíte e área gourmet.", action: "Criar ambiente" },
  execucao:   { icon: "⚙️", title: "Execução",  desc: "Acompanhe o cronograma de obra e tarefas dos executores.", action: "Ver cronograma" },
  evolucao:   { icon: "📈", title: "Evolução",   desc: "Veja o histórico de alterações e evolução do projeto.", action: "Ver histórico" },
};

const STORYBOARD_ITEMS = [
  { id: "01", label: "Conceito inicial",    date: "12/05/2024", active: false },
  { id: "02", label: "Estudo de layout",    date: "18/05/2024", active: false },
  { id: "03", label: "Materiais definidos", date: "25/05/2024", active: false },
  { id: "04", label: "Prévia iluminação",   date: "02/06/2024", active: false },
  { id: "05", label: "Atual",               date: "08/06/2024", active: true  },
] as const;

// ─── Sub-components ───────────────────────────────────────────────────────────

function TopBar({
  projectName,
  environmentName,
  onNextStep,
  onSearch,
  onCopilot,
  onNotifications,
}: {
  projectName: string;
  environmentName: string;
  onNextStep: () => void;
  onSearch: () => void;
  onCopilot: () => void;
  onNotifications: () => void;
}) {
  return (
    <div style={{
      height: 48, flexShrink: 0, display: "flex", alignItems: "center", gap: 0,
      background: C.topbar, borderBottom: `1px solid ${C.topbarBorder}`,
      zIndex: 200, position: "relative",
    }}>
      {/* Logo */}
      <div style={{
        width: 160, flexShrink: 0, display: "flex", alignItems: "center", gap: 8,
        padding: "0 16px", borderRight: `1px solid ${C.topbarBorder}`, height: "100%",
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8, flexShrink: 0,
          background: "linear-gradient(135deg, #7C3AED 0%, #A78BFA 100%)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 13, boxShadow: "0 2px 8px rgba(124,58,237,0.4)",
        }}>🏛️</div>
        <div>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 900, color: "#fff", letterSpacing: "-0.02em", lineHeight: 1 }}>
            arqdor<span style={{ color: "#A78BFA" }}>.ai</span>
          </p>
          <p style={{ margin: 0, fontSize: 8, color: "#64748B", letterSpacing: "0.1em", fontWeight: 600 }}>by vendor.ai</p>
        </div>
      </div>

      {/* Breadcrumb */}
      <div style={{ padding: "0 16px", display: "flex", alignItems: "center", gap: 6, color: "#94A3B8", fontSize: 12 }}>
        <span style={{ color: "#CBD5E1", fontWeight: 500 }}>{projectName}</span>
        <span style={{ color: "#475569" }}>›</span>
        <span style={{ color: "#CBD5E1" }}>Studio</span>
        <span style={{ color: "#475569" }}>›</span>
        <span style={{ color: "#E2E8F0", fontWeight: 600 }}>{environmentName}</span>
      </div>

      {/* CTA */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <button
          onClick={onNextStep}
          style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            background: C.purple, border: "none", borderRadius: 10, cursor: "pointer",
            padding: "6px 20px", gap: 1, boxShadow: "0 2px 12px rgba(124,58,237,0.45)",
          }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: "#fff", letterSpacing: "0.01em" }}>✦ Próxima Etapa</span>
          <span style={{ fontSize: 9, color: "#C4B5FD", fontWeight: 500 }}>Gerar Storyboard</span>
        </button>
      </div>

      {/* Right actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "0 16px", height: "100%", borderLeft: `1px solid ${C.topbarBorder}` }}>
        {/* Search */}
        <button
          onClick={onSearch}
          style={{ padding: "6px 10px", background: "none", border: "none", cursor: "pointer", color: "#64748B", fontSize: 15, borderRadius: 6, display: "flex", alignItems: "center", gap: 5 }}>
          <span>🔍</span>
        </button>

        {/* ⌘K */}
        <button
          onClick={onSearch}
          style={{
            padding: "4px 8px", background: "#1E2330", border: `1px solid ${C.topbarBorder}`,
            borderRadius: 6, cursor: "pointer", color: "#94A3B8", fontSize: 9, fontWeight: 600,
            display: "flex", alignItems: "center", gap: 4, fontFamily: "monospace",
          }}>
          ⌘K
        </button>

        {/* Copilot */}
        <button
          onClick={onCopilot}
          style={{ position: "relative", padding: "6px 10px", background: "none", border: "none", cursor: "pointer", color: "#94A3B8", fontSize: 18, borderRadius: 6 }}>
          🤖
          <span style={{
            position: "absolute", top: 4, right: 4, width: 8, height: 8,
            borderRadius: "50%", background: C.purple, border: "1px solid #0A0C10",
          }} />
        </button>

        {/* Notifications */}
        <button
          onClick={onNotifications}
          style={{ position: "relative", padding: "6px 10px", background: "none", border: "none", cursor: "pointer", color: "#94A3B8", fontSize: 18, borderRadius: 6 }}>
          🔔
          <span style={{
            position: "absolute", top: 4, right: 4, width: 8, height: 8,
            borderRadius: "50%", background: "#EF4444", border: "1px solid #0A0C10",
          }} />
        </button>

        {/* Avatar */}
        <button
          onClick={onNotifications}
          style={{
            width: 30, height: 30, borderRadius: "50%", background: "linear-gradient(135deg, #7C3AED, #A78BFA)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 12, fontWeight: 700, color: "#fff", cursor: "pointer", flexShrink: 0,
            border: "2px solid #2D3348",
          }}>MV</button>

        <div style={{ marginLeft: 4 }}>
          <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: "#E2E8F0", lineHeight: 1 }}>Marcos Vinicius</p>
          <p style={{ margin: 0, fontSize: 8, color: "#64748B" }}>Arquiteto</p>
        </div>
      </div>
    </div>
  );
}

function LeftSidebar({
  activeNav,
  onNavigate,
}: {
  activeNav: string;
  onNavigate: (id: string) => void;
}) {
  const { toast } = useToast();
  return (
    <div style={{
      width: 168, flexShrink: 0, background: C.sidebar, borderRight: `1px solid ${C.sidebarBdr}`,
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* Project selector */}
      <div style={{ padding: "12px 12px 8px", borderBottom: `1px solid ${C.border}` }}>
        <p style={{ margin: 0, fontSize: 9, fontWeight: 700, color: C.textDim, letterSpacing: "0.08em", textTransform: "uppercase" }}>Projeto</p>
        <button
          onClick={() => toast({ description: "Seleção de projeto em desenvolvimento" })}
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
            padding: "6px 8px", borderRadius: 8, background: C.inputBg, border: `1px solid ${C.inputBdr}`,
            cursor: "pointer", marginTop: 4,
          }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: C.text }}>Residência Silva</span>
          <span style={{ fontSize: 9, color: C.textDim }}>▾</span>
        </button>
      </div>

      {/* Navegação */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 8px" }}>
        <p style={{ margin: "0 0 4px 4px", fontSize: 9, fontWeight: 700, color: C.textDim, letterSpacing: "0.08em", textTransform: "uppercase" }}>Navegação</p>
        {NAV_ITEMS.map(item => {
          const isActive = activeNav === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%",
                padding: "7px 8px", borderRadius: 8, border: "none", cursor: "pointer",
                background: isActive ? C.activeNavBg : "transparent",
                color: isActive ? C.activeNavTx : C.textSub,
                fontSize: 12, fontWeight: isActive ? 700 : 500,
                marginBottom: 1, textAlign: "left",
                transition: "all 0.1s ease",
              }}
            >
              <span style={{ fontSize: 12, opacity: isActive ? 1 : 0.7 }}>{item.icon}</span>
              {item.label}
            </button>
          );
        })}

        <div style={{ height: 1, background: C.border, margin: "8px 4px" }} />

        <p style={{ margin: "0 0 4px 4px", fontSize: 9, fontWeight: 700, color: C.textDim, letterSpacing: "0.08em", textTransform: "uppercase" }}>Escritório</p>
        {ESCRITORIO_ITEMS.map(item => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            style={{
              display: "flex", alignItems: "center", gap: 8, width: "100%",
              padding: "7px 8px", borderRadius: 8, border: "none", cursor: "pointer",
              background: "transparent", color: C.textSub,
              fontSize: 12, fontWeight: 500, marginBottom: 1, textAlign: "left",
              transition: "all 0.1s ease",
            }}
          >
            <span style={{ fontSize: 11, opacity: 0.7 }}>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>

      {/* Bottom: Config */}
      <div style={{ padding: "8px", borderTop: `1px solid ${C.border}` }}>
        <button
          onClick={() => toast({ description: "Configurações do projeto em desenvolvimento" })}
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
            padding: "7px 8px", borderRadius: 8, border: "none", cursor: "pointer",
            background: "transparent", color: C.textSub, fontSize: 12,
          }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12 }}>⚙️</span>
            Configurações
          </span>
          <span style={{ fontSize: 11, color: C.textDim }}>✕</span>
        </button>
      </div>
    </div>
  );
}

function CanvasToolbar({ onAction }: { onAction: (action: string) => void }) {
  return (
    <div style={{
      height: 40, flexShrink: 0, display: "flex", alignItems: "center", gap: 2,
      padding: "0 12px", background: C.surface, borderBottom: `1px solid ${C.border}`,
    }}>
      {/* Navigation */}
      {(["←", "→"] as const).map(icon => (
        <button key={icon} onClick={() => onAction(icon === "←" ? "back" : "forward")} style={toolBtn}>{icon}</button>
      ))}
      <div style={divider} />
      {/* Undo/Redo */}
      {(["↺", "↻"] as const).map(icon => (
        <button key={icon} onClick={() => onAction(icon === "↺" ? "undo" : "redo")} style={toolBtn}>{icon}</button>
      ))}
      <div style={divider} />
      {/* Tools */}
      {(["⊡", "⤢"] as const).map(icon => (
        <button key={icon} onClick={() => onAction("tool")} style={toolBtn}>{icon}</button>
      ))}
      <div style={divider} />

      <div style={{ flex: 1 }} />

      {/* HD dropdown */}
      <button
        onClick={() => onAction("quality")}
        style={{
          ...toolBtn,
          display: "flex", alignItems: "center", gap: 4, padding: "4px 10px",
          border: `1px solid ${C.border}`, borderRadius: 6,
        }}>
        <span style={{ fontSize: 10, fontWeight: 700 }}>HD</span>
        <span style={{ fontSize: 9 }}>▾</span>
      </button>

      {/* Camera */}
      <button onClick={() => onAction("screenshot")} style={toolBtn}>📷</button>

      {/* Fullscreen */}
      <button
        onClick={() => {
          if (document.fullscreenElement) {
            void document.exitFullscreen();
          } else {
            void document.documentElement.requestFullscreen();
          }
        }}
        style={toolBtn}>⛶</button>
    </div>
  );
}

const toolBtn: React.CSSProperties = {
  width: 30, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
  border: "none", background: "transparent", cursor: "pointer",
  borderRadius: 6, fontSize: 14, color: C.textSub,
};
const divider: React.CSSProperties = {
  width: 1, height: 18, background: C.border, margin: "0 4px",
};

function RenderCanvas({
  renderUrl,
  onGenerate,
  onImageUpload,
  isGenerating,
}: {
  renderUrl?: string;
  onGenerate: () => void;
  onImageUpload: (file: File) => void;
  isGenerating: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div style={{
      flex: 1, background: C.canvas, borderRadius: 16, overflow: "hidden",
      position: "relative", minHeight: 0, margin: "12px",
    }}>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) onImageUpload(file);
          e.target.value = "";
        }}
      />

      {/* Image or placeholder */}
      {renderUrl ? (
        <img src={renderUrl} alt="Render atual" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <div style={{
          width: "100%", height: "100%",
          background: "linear-gradient(160deg, #0F1A2E 0%, #111827 40%, #1E2537 70%, #0B1629 100%)",
          display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16,
        }}>
          {/* Simulated room render */}
          <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
            {/* Floor */}
            <div style={{
              position: "absolute", bottom: 0, left: 0, right: 0, height: "40%",
              background: "linear-gradient(0deg, #2D1F0E 0%, #3D2A12 100%)",
              opacity: 0.8,
            }} />
            {/* Window light */}
            <div style={{
              position: "absolute", top: 0, right: "20%", width: "35%", height: "70%",
              background: "linear-gradient(180deg, rgba(255,220,140,0.15) 0%, transparent 100%)",
            }} />
            {/* Wall panels */}
            <div style={{
              position: "absolute", top: 0, left: 0, width: "25%", height: "80%",
              background: "linear-gradient(90deg, #1A1008 0%, #231608 100%)",
              opacity: 0.9,
            }} />
            {/* Ceiling light strip */}
            <div style={{
              position: "absolute", top: "15%", left: "10%", right: "10%", height: 2,
              background: "linear-gradient(90deg, transparent, rgba(255,220,140,0.6), transparent)",
              boxShadow: "0 0 20px rgba(255,220,140,0.3)",
            }} />
          </div>

          <div style={{ position: "relative", zIndex: 1, textAlign: "center", padding: "0 32px" }}>
            <div style={{
              width: 56, height: 56, borderRadius: 16, margin: "0 auto 12px",
              background: "rgba(124,58,237,0.2)", border: "2px solid rgba(124,58,237,0.4)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24,
            }}>✨</div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#E2E8F0" }}>Sala de Estar — Render principal</p>
            <p style={{ margin: "6px 0 16px", fontSize: 12, color: "#64748B", lineHeight: 1.5 }}>
              Selecione um objeto no render para ativar materiais, fornecedores e produção
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <button
                onClick={() => fileRef.current?.click()}
                style={{
                  padding: "8px 16px", borderRadius: 8, border: `1px solid rgba(255,255,255,0.2)`,
                  background: "rgba(255,255,255,0.08)", color: "#E2E8F0", fontSize: 11,
                  fontWeight: 600, cursor: "pointer",
                }}>
                📁 Carregar Imagem
              </button>
              <button
                onClick={onGenerate}
                disabled={isGenerating}
                style={{
                  padding: "8px 16px", borderRadius: 8, border: "none",
                  background: isGenerating ? "#4B5563" : C.purple, color: "#fff", fontSize: 11,
                  fontWeight: 700, cursor: isGenerating ? "not-allowed" : "pointer",
                  boxShadow: isGenerating ? "none" : "0 2px 12px rgba(124,58,237,0.45)",
                }}>
                {isGenerating ? "⏳ Gerando..." : "✨ Gerar Render"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Overlay actions when render exists */}
      {renderUrl && (
        <div style={{
          position: "absolute", bottom: 12, right: 12,
          display: "flex", gap: 6,
        }}>
          <button
            onClick={() => fileRef.current?.click()}
            style={{
              padding: "6px 12px", borderRadius: 8, border: `1px solid rgba(255,255,255,0.2)`,
              background: "rgba(15,23,42,0.75)", backdropFilter: "blur(6px)",
              color: "#E2E8F0", fontSize: 10, fontWeight: 600, cursor: "pointer",
            }}>
            📁 Nova Imagem
          </button>
          <button
            onClick={onGenerate}
            disabled={isGenerating}
            style={{
              padding: "6px 12px", borderRadius: 8, border: "none",
              background: isGenerating ? "#4B5563" : C.purple, color: "#fff", fontSize: 10,
              fontWeight: 700, cursor: isGenerating ? "not-allowed" : "pointer",
            }}>
            {isGenerating ? "⏳ Gerando..." : "✨ Melhorar Render"}
          </button>
        </div>
      )}
    </div>
  );
}

function CanvasTabs({ activeTab, onTab }: { activeTab: string; onTab: (t: string) => void }) {
  const { toast } = useToast();
  const [compareOn, setCompareOn] = useState(false);

  return (
    <div style={{
      height: 36, flexShrink: 0, display: "flex", alignItems: "center", gap: 0,
      padding: "0 12px", background: C.surface, borderBottom: `1px solid ${C.border}`,
    }}>
      {CANVAS_TABS.map(tab => {
        const isActive = activeTab === tab;
        return (
          <button
            key={tab}
            onClick={() => onTab(tab)}
            style={{
              padding: "0 12px", height: "100%", border: "none", background: "transparent",
              cursor: "pointer", fontSize: 11, fontWeight: isActive ? 700 : 500,
              color: isActive ? C.purple : C.textSub,
              borderBottom: `2px solid ${isActive ? C.purple : "transparent"}`,
              display: "flex", alignItems: "center", gap: 5,
              transition: "all 0.1s ease",
            }}
          >
            {tab}
            {tab === "Comentários" && (
              <span style={{
                background: "#EF4444", color: "#fff", borderRadius: 10,
                fontSize: 8, fontWeight: 700, padding: "1px 5px",
              }}>12</span>
            )}
          </button>
        );
      })}

      <div style={{ flex: 1 }} />

      {/* Compare toggle */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 10, color: C.textSub }}>Comparar</span>
        <div
          onClick={() => {
            setCompareOn(v => !v);
            toast({ description: compareOn ? "Modo comparação desativado" : "Modo comparação ativado" });
          }}
          style={{
            width: 32, height: 18, borderRadius: 9,
            background: compareOn ? C.purple : C.border,
            position: "relative", cursor: "pointer",
            transition: "background 0.2s ease",
          }}>
          <div style={{
            width: 14, height: 14, borderRadius: "50%", background: "#fff",
            position: "absolute", top: 2, left: compareOn ? 16 : 2,
            transition: "left 0.2s ease",
            boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
          }} />
        </div>
      </div>
    </div>
  );
}

function StoryboardGrid({ onNewStoryboard }: { onNewStoryboard: () => void }) {
  const [selected, setSelected] = useState("05");

  return (
    <div style={{
      height: 128, flexShrink: 0, background: C.surface, borderTop: `1px solid ${C.border}`,
      display: "flex", alignItems: "center", gap: 8, padding: "0 12px", overflowX: "auto",
    }}>
      {/* New storyboard */}
      <button
        onClick={onNewStoryboard}
        style={{
          flexShrink: 0, width: 88, height: 96, borderRadius: 12,
          border: `2px dashed ${C.border}`, background: C.inputBg,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          cursor: "pointer", gap: 4, color: C.textDim,
        }}>
        <span style={{ fontSize: 20, color: C.purple }}>+</span>
        <span style={{ fontSize: 9, fontWeight: 600, textAlign: "center", lineHeight: 1.3 }}>
          Novo<br />Storyboard
        </span>
      </button>

      {/* Storyboard items */}
      {STORYBOARD_ITEMS.map(item => {
        const isSelected = selected === item.id;
        return (
          <button
            key={item.id}
            onClick={() => setSelected(item.id)}
            style={{
              flexShrink: 0, width: 108, height: 96, borderRadius: 12,
              border: `2px solid ${isSelected ? C.purple : C.border}`,
              background: isSelected ? C.activeNavBg : C.inputBg,
              cursor: "pointer", padding: 0, overflow: "hidden",
              position: "relative", display: "flex", flexDirection: "column",
            }}
          >
            {/* Thumbnail */}
            <div style={{
              flex: 1, background: isSelected
                ? "linear-gradient(135deg, #1E1B4B 0%, #2D1F5E 100%)"
                : "linear-gradient(135deg, #1A1A2E 0%, #222233 100%)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <span style={{ fontSize: 16, opacity: 0.6 }}>🏠</span>
            </div>

            {/* Label */}
            <div style={{ padding: "4px 6px", background: C.surface }}>
              <p style={{ margin: 0, fontSize: 9, fontWeight: 700, color: C.textDim }}>{item.id}</p>
              <p style={{ margin: 0, fontSize: 9, fontWeight: 600, color: C.text, lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.label}</p>
              <p style={{ margin: 0, fontSize: 8, color: C.textDim }}>{item.date}</p>
            </div>

            {/* Active checkmark */}
            {item.active && (
              <div style={{
                position: "absolute", top: 5, right: 5,
                width: 16, height: 16, borderRadius: "50%",
                background: C.purple, display: "flex", alignItems: "center",
                justifyContent: "center", fontSize: 8, color: "#fff", fontWeight: 700,
              }}>✓</div>
            )}
          </button>
        );
      })}
    </div>
  );
}

function DimInput({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ flex: 1 }}>
      <p style={{ margin: "0 0 2px", fontSize: 8, fontWeight: 700, color: C.textDim }}>{label}</p>
      <div style={{
        padding: "4px 6px", background: C.inputBg, border: `1px solid ${C.inputBdr}`,
        borderRadius: 6, fontSize: 10, color: C.text, fontWeight: 600,
      }}>{value}</div>
    </div>
  );
}

function RightPanel({ onSubstituir, onTestar, onIgnorar }: {
  onSubstituir: () => void;
  onTestar: () => void;
  onIgnorar: () => void;
}) {
  const { toast } = useToast();
  const [tab, setTab] = useState<"propriedades" | "camadas">("propriedades");
  const [visible, setVisible] = useState(true);
  const [copilotMsg, setCopilotMsg] = useState("");

  const objActions: { icon: string; label: string; action: string }[] = [
    { icon: "↺", label: "Rotacionar", action: "rotate" },
    { icon: "⧉", label: "Duplicar", action: "duplicate" },
    { icon: "⬇", label: "Baixar", action: "download" },
    { icon: "🗑", label: "Excluir", action: "delete" },
    { icon: "⋯", label: "Mais opções", action: "more" },
  ];

  function handleObjAction(action: string) {
    const labels: Record<string, string> = {
      rotate: "Rotação do objeto em desenvolvimento",
      duplicate: "Objeto duplicado",
      download: "Download do objeto em desenvolvimento",
      delete: "Exclusão de objeto em desenvolvimento",
      more: "Mais opções em desenvolvimento",
    };
    toast({ description: labels[action] ?? "Ação em desenvolvimento" });
  }

  function sendCopilot() {
    if (!copilotMsg.trim()) return;
    toast({ description: `Copilot: "${copilotMsg}" — processando...` });
    setCopilotMsg("");
  }

  return (
    <div style={{
      width: 220, flexShrink: 0, background: C.rightPanel, borderLeft: `1px solid ${C.rightBdr}`,
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        {(["propriedades", "camadas"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1, padding: "9px 4px", border: "none", background: "transparent", cursor: "pointer",
              fontSize: 10, fontWeight: tab === t ? 700 : 500,
              color: tab === t ? C.purple : C.textSub,
              borderBottom: `2px solid ${tab === t ? C.purple : "transparent"}`,
              textTransform: "capitalize",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {/* Objeto selecionado */}
        <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}` }}>
          <p style={{ margin: "0 0 8px", fontSize: 9, fontWeight: 700, color: C.textDim, letterSpacing: "0.06em", textTransform: "uppercase" }}>Objeto selecionado</p>

          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            {/* Thumbnail */}
            <div style={{
              width: 48, height: 48, borderRadius: 8, flexShrink: 0,
              background: "linear-gradient(135deg, #1E293B 0%, #334155 100%)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
            }}>🪑</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: C.text }}>Poltrona Lisboa</p>
              <p style={{ margin: "2px 0 0", fontSize: 9, color: C.textSub }}>Estofados Casa</p>
              <p style={{ margin: "1px 0 0", fontSize: 9, color: C.textDim }}>Código: EST-001-LIS</p>
              <a href="#" style={{ fontSize: 9, color: C.purple, textDecoration: "none", fontWeight: 500 }}>Ver no fabricante ↗</a>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 4, marginTop: 10 }}>
            {objActions.map((a) => (
              <button
                key={a.action}
                title={a.label}
                onClick={() => handleObjAction(a.action)}
                style={{
                  flex: 1, height: 28, border: `1px solid ${C.border}`, background: C.inputBg,
                  borderRadius: 6, cursor: "pointer", fontSize: 12, color: C.textSub,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>{a.icon}</button>
            ))}
          </div>
        </div>

        {/* Dimensões */}
        <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}` }}>
          <p style={{ margin: "0 0 6px", fontSize: 9, fontWeight: 700, color: C.textDim, letterSpacing: "0.06em", textTransform: "uppercase" }}>Dimensões</p>
          <div style={{ display: "flex", gap: 4 }}>
            <DimInput label="L" value="0,78 m" />
            <DimInput label="P" value="0,82 m" />
            <DimInput label="A" value="0,85 m" />
          </div>
        </div>

        {/* Posição */}
        <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}` }}>
          <p style={{ margin: "0 0 6px", fontSize: 9, fontWeight: 700, color: C.textDim, letterSpacing: "0.06em", textTransform: "uppercase" }}>Posição</p>
          <div style={{ display: "flex", gap: 4 }}>
            <DimInput label="X" value="2,45 m" />
            <DimInput label="Y" value="1,20 m" />
            <DimInput label="Z" value="0,00 m" />
          </div>
        </div>

        {/* Rotação + Escala */}
        <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <p style={{ margin: "0 0 6px", fontSize: 9, fontWeight: 700, color: C.textDim, letterSpacing: "0.06em", textTransform: "uppercase" }}>Rotação</p>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 11, color: C.textSub }}>🔄</span>
                <div style={{ flex: 1, padding: "4px 6px", background: C.inputBg, border: `1px solid ${C.inputBdr}`, borderRadius: 6, fontSize: 10, color: C.text }}>0°</div>
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ margin: "0 0 6px", fontSize: 9, fontWeight: 700, color: C.textDim, letterSpacing: "0.06em", textTransform: "uppercase" }}>Escala</p>
              <div style={{ padding: "4px 6px", background: C.inputBg, border: `1px solid ${C.inputBdr}`, borderRadius: 6, fontSize: 10, color: C.text }}>100%</div>
            </div>
          </div>
        </div>

        {/* Material */}
        <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}` }}>
          <p style={{ margin: "0 0 6px", fontSize: 9, fontWeight: 700, color: C.textDim, letterSpacing: "0.06em", textTransform: "uppercase" }}>Material / Acabamento</p>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 24, height: 24, borderRadius: 4, background: "#4B3728", flexShrink: 0 }} />
            <div>
              <p style={{ margin: 0, fontSize: 10, fontWeight: 600, color: C.text }}>Tecido Linho Bege</p>
              <p style={{ margin: 0, fontSize: 9, color: C.textSub }}>Acabamento</p>
            </div>
          </div>
        </div>

        {/* Visibilidade */}
        <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <p style={{ margin: 0, fontSize: 9, fontWeight: 700, color: C.textDim, letterSpacing: "0.06em", textTransform: "uppercase" }}>Visibilidade</p>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12 }}>👁</span>
            <div
              onClick={() => setVisible(v => !v)}
              style={{
                width: 32, height: 18, borderRadius: 9,
                background: visible ? C.purple : C.border,
                position: "relative", cursor: "pointer", transition: "background 0.2s ease",
              }}
            >
              <div style={{
                width: 14, height: 14, borderRadius: "50%", background: "#fff",
                position: "absolute", top: 2, left: visible ? 16 : 2,
                transition: "left 0.2s ease", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
              }} />
            </div>
          </div>
        </div>

        {/* Substituir objeto */}
        <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}` }}>
          <button
            onClick={onSubstituir}
            style={{
              width: "100%", padding: "8px", border: `1px solid ${C.border}`,
              borderRadius: 8, background: C.surface, cursor: "pointer",
              fontSize: 11, fontWeight: 600, color: C.text,
            }}>
            Substituir objeto
          </button>
        </div>

        {/* IA Copilot */}
        <div style={{ padding: "10px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <div style={{
              width: 22, height: 22, borderRadius: "50%", background: C.activeNavBg,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0,
            }}>🤖</div>
            <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: C.purple }}>IA Copilot</p>
          </div>

          <p style={{ margin: "0 0 10px", fontSize: 10, color: C.textSub, lineHeight: 1.5 }}>
            Percebi que a iluminação da parede de mármore pode ser aprimorada.
            Deseja testar uma iluminação de realce mais suave?
          </p>

          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            <button
              onClick={onTestar}
              style={{
                flex: 1, padding: "6px", border: "none", borderRadius: 6,
                background: C.purple, color: "#fff", fontSize: 10, fontWeight: 700, cursor: "pointer",
              }}>Testar</button>
            <button
              onClick={onIgnorar}
              style={{
                flex: 1, padding: "6px", border: `1px solid ${C.border}`, borderRadius: 6,
                background: C.surface, color: C.textSub, fontSize: 10, cursor: "pointer",
              }}>Ignorar</button>
          </div>

          {/* Input */}
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 8px",
            background: C.inputBg,
          }}>
            <input
              value={copilotMsg}
              onChange={e => setCopilotMsg(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") sendCopilot(); }}
              placeholder="Pergunte algo ou dê um comando…"
              style={{
                flex: 1, border: "none", background: "transparent", outline: "none",
                fontSize: 9, color: C.text, minWidth: 0,
              }}
            />
            <button
              onClick={sendCopilot}
              style={{
                width: 20, height: 20, border: "none", borderRadius: "50%",
                background: C.purple, color: "#fff", fontSize: 10, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>→</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBar({
  environmentName,
  onShortcuts,
  onHelp,
}: {
  environmentName: string;
  onShortcuts: () => void;
  onHelp: () => void;
}) {
  const now = new Date();
  const timeStr = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div style={{
      height: 28, flexShrink: 0, display: "flex", alignItems: "center", gap: 0,
      background: C.statusBar, borderTop: `1px solid ${C.statusBdr}`,
      padding: "0 12px", fontSize: 10, color: C.textSub, overflow: "hidden",
    }}>
      {/* Auto-save */}
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.green, flexShrink: 0 }} />
        <span style={{ fontWeight: 500, color: C.text }}>Salvo automaticamente</span>
      </div>
      <div style={{ width: 1, height: 12, background: C.border, margin: "0 10px" }} />
      <span>Última alteração: Marcos Vinicius, hoje às {timeStr}</span>

      <div style={{ flex: 1 }} />

      {/* Environment info */}
      <span>Ambiente: <strong style={{ color: C.text }}>{environmentName}</strong></span>
      <div style={{ width: 1, height: 12, background: C.border, margin: "0 10px" }} />
      <span>Área: <strong style={{ color: C.text }}>48,72 m²</strong></span>
      <div style={{ width: 1, height: 12, background: C.border, margin: "0 10px" }} />
      <span>Pé direito: <strong style={{ color: C.text }}>2,80 m</strong></span>
      <div style={{ width: 1, height: 12, background: C.border, margin: "0 10px" }} />
      <button onClick={onShortcuts} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 10, color: C.textSub, padding: 0 }}>Atalhos</button>
      <div style={{ width: 1, height: 12, background: C.border, margin: "0 10px" }} />
      <button onClick={onHelp} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 10, color: C.textSub, padding: 0 }}>? Ajuda</button>
    </div>
  );
}

// ─── Tab panel — switches bottom panel based on active tab ───────────────────
function TabPanel({
  activeTab,
  onNewStoryboard,
  onTestarIA,
}: {
  activeTab: string;
  onNewStoryboard: () => void;
  onTestarIA: () => void;
}) {
  const panelBase: React.CSSProperties = {
    flexShrink: 0, background: C.surface, borderTop: `1px solid ${C.border}`,
    overflowX: "auto", overflowY: "auto",
  };

  if (activeTab === "Storyboard") {
    return <StoryboardGrid onNewStoryboard={onNewStoryboard} />;
  }

  if (activeTab === "Versões") {
    return (
      <div style={{ ...panelBase, height: 128, padding: "10px 16px" }}>
        <p style={{ margin: "0 0 6px", fontSize: 9, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.07em" }}>Versões do Render</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {VERSOES_ITEMS.map(v => (
            <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: v.tagColor, flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 10, color: C.text, fontWeight: 500 }}>{v.label}</span>
              <span style={{ fontSize: 9, color: C.textDim }}>{v.date}</span>
              <span style={{
                padding: "1px 7px", borderRadius: 8, fontSize: 8, fontWeight: 700,
                background: v.tagColor === "#10B981" ? "#D1FAE5" : v.tagColor === "#7C3AED" ? C.activeNavBg : C.inputBg,
                color: v.tagColor,
              }}>{v.tag}</span>
              <button style={{ padding: "2px 8px", fontSize: 8, border: `1px solid ${C.border}`, borderRadius: 5, cursor: "pointer", background: C.inputBg, color: C.textSub }}>Restaurar</button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (activeTab === "Comentários") {
    return (
      <div style={{ ...panelBase, height: 128, padding: "10px 16px", overflowX: "hidden" }}>
        <p style={{ margin: "0 0 6px", fontSize: 9, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.07em" }}>Comentários e Revisões</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {COMENTARIOS_ITEMS.map(c => (
            <div key={c.id} style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
              <div style={{
                width: 22, height: 22, borderRadius: "50%", background: C.activeNavBg, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11,
              }}>{c.avatar}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 4, alignItems: "baseline" }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: C.purple }}>{c.autor}</span>
                  <span style={{ fontSize: 8, color: C.textDim }}>{c.hora}</span>
                </div>
                <p style={{ margin: 0, fontSize: 9, color: C.text, lineHeight: 1.4 }}>{c.msg}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (activeTab === "Memória") {
    return (
      <div style={{ ...panelBase, height: 96, display: "flex", alignItems: "center", gap: 10, padding: "0 16px" }}>
        <p style={{ margin: 0, fontSize: 9, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.07em", flexShrink: 0 }}>Memória IA</p>
        <div style={{ width: 1, height: 32, background: C.border, flexShrink: 0 }} />
        {MEMORIA_ITEMS.map(m => (
          <div key={m.label} style={{
            flexShrink: 0, padding: "7px 12px", background: C.activeNavBg,
            borderRadius: 9, border: `1px solid ${C.purpleLight}`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
              <span style={{ fontSize: 13 }}>{m.icon}</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: C.purpleText }}>{m.label}</span>
            </div>
            <p style={{ margin: 0, fontSize: 9, color: C.textSub }}>{m.val}</p>
          </div>
        ))}
      </div>
    );
  }

  if (activeTab === "Histórico") {
    return (
      <div style={{ ...panelBase, height: 128, padding: "10px 16px", overflowX: "hidden" }}>
        <p style={{ margin: "0 0 6px", fontSize: 9, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.07em" }}>Histórico de Ações</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {HISTORICO_ITEMS.map(h => (
            <div key={h.hora} style={{ display: "flex", alignItems: "center", gap: 7, padding: "3px 0" }}>
              <span style={{ fontSize: 12, flexShrink: 0 }}>{h.icon}</span>
              <span style={{ flex: 1, fontSize: 9, color: C.text, fontWeight: 500 }}>{h.label}</span>
              <span style={{ fontSize: 9, color: C.textSub }}>{h.det}</span>
              <span style={{ fontSize: 8, color: C.textDim, flexShrink: 0 }}>{h.hora}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (activeTab === "IA") {
    return (
      <div style={{ ...panelBase, height: 120, display: "flex", alignItems: "stretch", gap: 8, padding: "8px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", flexShrink: 0, marginRight: 4 }}>
          <p style={{ margin: 0, fontSize: 9, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.07em", writingMode: "vertical-rl", transform: "rotate(180deg)" }}>Sugestões da IA</p>
        </div>
        {IA_SUGESTOES.map(s => (
          <div key={s.titulo} style={{
            flexShrink: 0, width: 210, padding: "9px 12px", background: C.activeNavBg,
            borderRadius: 10, border: `1px solid ${C.purpleLight}`,
            display: "flex", flexDirection: "column", gap: 5,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 15 }}>{s.icon}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: C.purpleText }}>{s.titulo}</span>
            </div>
            <p style={{ margin: 0, fontSize: 9, color: C.textSub, lineHeight: 1.45, flex: 1 }}>{s.desc}</p>
            <button
              onClick={onTestarIA}
              style={{
                padding: "4px 10px", borderRadius: 6, border: "none",
                background: C.purple, color: "#fff", fontSize: 9, fontWeight: 700,
                cursor: "pointer", alignSelf: "flex-start",
              }}>{s.cta}</button>
          </div>
        ))}
      </div>
    );
  }

  return null;
}

// ─── Canvas area content switcher ────────────────────────────────────────────
function NavContent({
  activeNav,
  renderUrl,
  onGenerate,
  onImageUpload,
  isGenerating,
}: {
  activeNav: string;
  renderUrl?: string;
  onGenerate: () => void;
  onImageUpload: (file: File) => void;
  isGenerating: boolean;
}) {
  if (activeNav === "studio" || activeNav === "storyboard") {
    return (
      <RenderCanvas
        renderUrl={renderUrl}
        onGenerate={onGenerate}
        onImageUpload={onImageUpload}
        isGenerating={isGenerating}
      />
    );
  }
  const ph = MODULE_PLACEHOLDERS[activeNav];
  return (
    <div style={{
      flex: 1, margin: "12px", borderRadius: 16,
      background: C.surface, border: `1px solid ${C.border}`,
      display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 14,
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: 18, background: C.activeNavBg,
        border: `2px solid ${C.purpleLight}`, display: "flex", alignItems: "center",
        justifyContent: "center", fontSize: 28,
      }}>{ph?.icon ?? "🏗️"}</div>
      <div style={{ textAlign: "center" }}>
        <p style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 800, color: C.text }}>
          Módulo {ph?.title ?? activeNav}
        </p>
        <p style={{ margin: 0, fontSize: 12, color: C.textSub, maxWidth: 320, lineHeight: 1.6 }}>
          {ph?.desc ?? "Este módulo está em desenvolvimento e será disponibilizado em breve."}
        </p>
      </div>
      <button style={{
        padding: "9px 20px", border: "none", borderRadius: 10,
        background: C.purple, color: "#fff", fontSize: 12, fontWeight: 700,
        cursor: "pointer", boxShadow: "0 2px 12px rgba(124,58,237,0.35)",
      }}>
        {ph?.action ?? "Em breve"}
      </button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
function RenderStudioInner() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const arqState = useArqProject();
  const { user } = useAuth();
  const [activeNav, setActiveNav] = useState("studio");
  const [activeTab, setActiveTab] = useState("Storyboard");
  const [renderUrl, setRenderUrl] = useState<string | undefined>();
  const [imageUrl, setImageUrl] = useState<string | undefined>();
  const [isGenerating, setIsGenerating] = useState(false);
  const [showNextStepModal, setShowNextStepModal] = useState(false);
  const [showSubstituirModal, setShowSubstituirModal] = useState(false);
  const [substituirSearch, setSubstituirSearch] = useState("");

  const projectName = arqState.projectMeta?.titulo || arqState.projects[0]?.titulo || "Residência Silva";
  const environmentName = "Sala de Estar";

  function handleNavigate(id: string) {
    if (id in ESCRITORIO_ROUTES) {
      setLocation(ESCRITORIO_ROUTES[id]!);
      return;
    }
    if (id in STUDIO_ROUTES) {
      setLocation(STUDIO_ROUTES[id]!);
      return;
    }
    // Local nav — just switch the active module; content changes visually
    setActiveNav(id);
    if (id === "storyboard") {
      setActiveTab("Storyboard");
    }
  }

  function handleToolAction(action: string) {
    const messages: Record<string, string> = {
      back:       "Navegação: voltar",
      forward:    "Navegação: avançar",
      undo:       "Desfazer em desenvolvimento",
      redo:       "Refazer em desenvolvimento",
      tool:       "Ferramenta de seleção em desenvolvimento",
      quality:    "Qualidade de render em desenvolvimento",
      screenshot: "Captura de tela em desenvolvimento",
    };
    toast({ description: messages[action] ?? "Ferramenta em desenvolvimento" });
  }

  function handleImageUpload(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      setImageUrl(e.target?.result as string);
      setRenderUrl(undefined);
      toast({ description: "Imagem carregada. Clique em Gerar Render para continuar." });
    };
    reader.readAsDataURL(file);
  }

  async function handleGenerate() {
    if (!imageUrl && !renderUrl) {
      toast({ variant: "destructive", description: "Carregue uma imagem primeiro." });
      return;
    }
    const tenantId = user?.tenantId;
    if (!tenantId) {
      toast({ variant: "destructive", description: "Tenant não identificado." });
      return;
    }
    setIsGenerating(true);
    try {
      const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
      const token = localStorage.getItem("vendorai_token") ?? "";
      const res = await fetch(`${base}/api/arch/ai-render`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          original_image_url: renderUrl ?? imageUrl,
          mode: "preservar",
          ambiente: "sala",
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any).error ?? `Erro ${res.status}`);
      }
      const { render_id } = await res.json();
      let attempts = 0;
      while (attempts < 90) {
        await new Promise(r => setTimeout(r, 2000));
        const poll = await fetch(`${base}/api/arch/ai-render/${render_id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!poll.ok) break;
        const data = await poll.json();
        if (data.status === "concluido" && data.result_image_url) {
          setRenderUrl(data.result_image_url);
          toast({ description: "✨ Render concluído!" });
          return;
        }
        if (data.status === "erro") throw new Error(data.erro_msg ?? "Erro no render");
        attempts++;
      }
      throw new Error("Tempo esgotado aguardando o render.");
    } catch (err: unknown) {
      toast({ variant: "destructive", description: err instanceof Error ? err.message : "Erro ao gerar render." });
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div style={{
      height: "100vh", display: "flex", flexDirection: "column",
      fontFamily: 'system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      overflow: "hidden", background: C.bg,
      boxSizing: "border-box",
    }}>
      {/* Top bar */}
      <TopBar
        projectName={projectName}
        environmentName={environmentName}
        onNextStep={() => setShowNextStepModal(true)}
        onSearch={() => toast({ description: "Busca em desenvolvimento" })}
        onCopilot={() => toast({ description: "Copilot: aberto no painel direito" })}
        onNotifications={() => toast({ description: "Nenhuma notificação no momento" })}
      />

      {/* Body row */}
      <div style={{ flex: 1, display: "flex", flexDirection: "row", overflow: "hidden", minHeight: 0 }}>
        {/* Left sidebar */}
        <LeftSidebar activeNav={activeNav} onNavigate={handleNavigate} />

        {/* Center: toolbar + canvas + tabs + tab panel */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0, background: C.bg }}>
          <CanvasToolbar onAction={handleToolAction} />
          <NavContent
            activeNav={activeNav}
            renderUrl={renderUrl}
            onGenerate={handleGenerate}
            onImageUpload={handleImageUpload}
            isGenerating={isGenerating}
          />
          <CanvasTabs activeTab={activeTab} onTab={setActiveTab} />
          <TabPanel
            activeTab={activeTab}
            onNewStoryboard={() => toast({ description: "Novo storyboard em desenvolvimento" })}
            onTestarIA={() => { toast({ description: "✨ Aplicando sugestão IA..." }); void handleGenerate(); }}
          />
        </div>

        {/* Right panel */}
        <RightPanel
          onSubstituir={() => setShowSubstituirModal(true)}
          onTestar={() => {
            toast({ description: "✨ Testando sugestão IA — aguarde..." });
            void handleGenerate();
          }}
          onIgnorar={() => toast({ description: "Sugestão IA descartada" })}
        />
      </div>

      {/* Status bar */}
      <StatusBar
        environmentName={environmentName}
        onShortcuts={() => toast({
          description: "Atalhos: ⌘Z desfazer · ⌘Y refazer · ⌘S salvar · F11 tela cheia",
        })}
        onHelp={() => toast({ description: "Documentação disponível em arqdor.ai/docs" })}
      />

      {/* ── Modal: Próxima Etapa ────────────────────────────────────────────── */}
      {showNextStepModal && (
        <div
          onClick={() => setShowNextStepModal(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 18, padding: 28, width: 460, boxShadow: "0 24px 64px rgba(0,0,0,0.3)", fontFamily: "inherit" }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: C.text }}>✦ Próxima Etapa</h2>
              <button onClick={() => setShowNextStepModal(false)} style={{ border: "none", background: "transparent", fontSize: 18, color: C.textDim, cursor: "pointer" }}>✕</button>
            </div>
            <p style={{ margin: "0 0 20px", fontSize: 12, color: C.textSub }}>Avançar o projeto para a fase de Storyboard</p>

            {/* Step flow */}
            <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 22 }}>
              {(["Studio", "Storyboard", "Produção", "Entrega"] as const).map((step, i) => (
                <div key={step} style={{ flex: 1, display: "flex", alignItems: "center" }}>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: "50%",
                      background: i === 0 ? C.purple : i === 1 ? C.activeNavBg : C.inputBg,
                      border: `2px solid ${i <= 1 ? C.purple : C.border}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, fontWeight: 800, color: i === 0 ? "#fff" : i === 1 ? C.purple : C.textDim,
                    }}>{i === 0 ? "✓" : i + 1}</div>
                    <span style={{ fontSize: 9, color: i <= 1 ? C.purple : C.textDim, fontWeight: i <= 1 ? 700 : 400 }}>{step}</span>
                  </div>
                  {i < 3 && <div style={{ width: 24, height: 2, background: i === 0 ? C.purple : C.border, flexShrink: 0, marginBottom: 16 }} />}
                </div>
              ))}
            </div>

            <p style={{ margin: "0 0 22px", fontSize: 12, color: C.textSub, lineHeight: 1.65, background: C.activeNavBg, padding: "12px 14px", borderRadius: 10, borderLeft: `3px solid ${C.purple}` }}>
              O <strong>Studio</strong> foi concluído. O próximo passo é criar o <strong>Storyboard</strong> com versões e variações do ambiente para aprovação do cliente.
            </p>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowNextStepModal(false)}
                style={{ padding: "9px 18px", border: `1px solid ${C.border}`, borderRadius: 9, background: "transparent", color: C.textSub, fontSize: 12, cursor: "pointer" }}>
                Cancelar
              </button>
              <button
                onClick={() => { setActiveNav("storyboard"); setActiveTab("Storyboard"); setShowNextStepModal(false); }}
                style={{ padding: "9px 18px", border: "none", borderRadius: 9, background: C.purple, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", boxShadow: "0 2px 12px rgba(124,58,237,0.4)" }}>
                Ir para Storyboard →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Substituir Objeto ────────────────────────────────────────── */}
      {showSubstituirModal && (
        <div
          onClick={() => setShowSubstituirModal(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 18, padding: 24, width: 500, boxShadow: "0 24px 64px rgba(0,0,0,0.3)", fontFamily: "inherit" }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: C.text }}>Substituir objeto</h2>
                <p style={{ margin: 0, fontSize: 11, color: C.textSub }}>Poltrona Lisboa — selecione um substituto</p>
              </div>
              <button onClick={() => setShowSubstituirModal(false)} style={{ border: "none", background: "transparent", fontSize: 18, color: C.textDim, cursor: "pointer" }}>✕</button>
            </div>

            {/* Search */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", background: C.inputBg, border: `1px solid ${C.inputBdr}`, borderRadius: 9, marginBottom: 14 }}>
              <span style={{ fontSize: 13 }}>🔍</span>
              <input
                value={substituirSearch}
                onChange={e => setSubstituirSearch(e.target.value)}
                placeholder="Buscar na biblioteca de objetos..."
                style={{ flex: 1, border: "none", background: "transparent", outline: "none", fontSize: 11, color: C.text }}
              />
            </div>

            {/* Items grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 18 }}>
              {[
                { icon: "🪑", name: "Poltrona Oslo",  brand: "Tok&Stok",      price: "R$ 2.890", tag: "Estoque" },
                { icon: "🛋️", name: "Poltrona Loft",  brand: "MadeiraMadeira", price: "R$ 1.990", tag: "Popular" },
                { icon: "🪑", name: "Poltrona Egg",   brand: "Design Italia",  price: "R$ 8.500", tag: "Premium" },
              ].map(item => (
                <div
                  key={item.name}
                  style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", cursor: "pointer", transition: "border-color 0.15s" }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = C.purple)}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
                >
                  <div style={{ height: 70, background: "linear-gradient(135deg, #1E293B, #334155)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>{item.icon}</div>
                  <div style={{ padding: "8px 10px" }}>
                    <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: C.text }}>{item.name}</p>
                    <p style={{ margin: "1px 0", fontSize: 9, color: C.textSub }}>{item.brand}</p>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: C.purple }}>{item.price}</p>
                      <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 6, background: C.activeNavBg, color: C.purpleText, fontWeight: 600 }}>{item.tag}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowSubstituirModal(false)}
                style={{ padding: "9px 18px", border: `1px solid ${C.border}`, borderRadius: 9, background: "transparent", color: C.textSub, fontSize: 12, cursor: "pointer" }}>
                Cancelar
              </button>
              <button
                onClick={() => { toast({ description: "✨ Objeto substituído no render" }); setShowSubstituirModal(false); }}
                style={{ padding: "9px 18px", border: "none", borderRadius: 9, background: C.purple, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", boxShadow: "0 2px 12px rgba(124,58,237,0.4)" }}>
                Aplicar substituição
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function RenderStudioPage() {
  return (
    <ArqdorThemeProvider>
      <WorkspaceProvider>
        <RenderStudioInner />
      </WorkspaceProvider>
    </ArqdorThemeProvider>
  );
}
