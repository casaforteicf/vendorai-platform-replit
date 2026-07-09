// RenderStudioPage — Layout premium para /arch/render
// Standalone (não usa ArqWorkspace shell): topbar própria + sidebar esquerda +
// canvas central + painel direito + barra de status inferior.

import { useState, useEffect } from "react";
import { useArqProject } from "@/modules/arqdor/hooks/useArqProject";
import { WorkspaceProvider } from "@/modules/arqdor/workspace/WorkspaceContext";
import { ArqdorThemeProvider } from "@/modules/arqdor/theme/ArqdorThemeProvider";

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

const CANVAS_TABS = ["Storyboard", "Versões", "Comentários", "Memória", "Histórico", "IA"] as const;

const STORYBOARD_ITEMS = [
  { id: "01", label: "Conceito inicial",    date: "12/05/2024", active: false },
  { id: "02", label: "Estudo de layout",    date: "18/05/2024", active: false },
  { id: "03", label: "Materiais definidos", date: "25/05/2024", active: false },
  { id: "04", label: "Prévia iluminação",   date: "02/06/2024", active: false },
  { id: "05", label: "Atual",               date: "08/06/2024", active: true  },
] as const;

// ─── Sub-components ───────────────────────────────────────────────────────────

function TopBar({ projectName, environmentName }: { projectName: string; environmentName: string }) {
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
        <button style={{
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
        <button style={{ padding: "6px 10px", background: "none", border: "none", cursor: "pointer", color: "#64748B", fontSize: 15, borderRadius: 6, display: "flex", alignItems: "center", gap: 5 }}>
          <span>🔍</span>
        </button>

        {/* ⌘K */}
        <button style={{
          padding: "4px 8px", background: "#1E2330", border: `1px solid ${C.topbarBorder}`,
          borderRadius: 6, cursor: "pointer", color: "#94A3B8", fontSize: 9, fontWeight: 600,
          display: "flex", alignItems: "center", gap: 4, fontFamily: "monospace",
        }}>
          ⌘K
        </button>

        {/* Copilot */}
        <button style={{ position: "relative", padding: "6px 10px", background: "none", border: "none", cursor: "pointer", color: "#94A3B8", fontSize: 18, borderRadius: 6 }}>
          🤖
          <span style={{
            position: "absolute", top: 4, right: 4, width: 8, height: 8,
            borderRadius: "50%", background: C.purple, border: "1px solid #0A0C10",
          }} />
        </button>

        {/* Notifications */}
        <button style={{ position: "relative", padding: "6px 10px", background: "none", border: "none", cursor: "pointer", color: "#94A3B8", fontSize: 18, borderRadius: 6 }}>
          🔔
          <span style={{
            position: "absolute", top: 4, right: 4, width: 8, height: 8,
            borderRadius: "50%", background: "#EF4444", border: "1px solid #0A0C10",
          }} />
        </button>

        {/* Avatar */}
        <div style={{
          width: 30, height: 30, borderRadius: "50%", background: "linear-gradient(135deg, #7C3AED, #A78BFA)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, fontWeight: 700, color: "#fff", cursor: "pointer", flexShrink: 0,
          border: "2px solid #2D3348",
        }}>MV</div>

        <div style={{ marginLeft: 4 }}>
          <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: "#E2E8F0", lineHeight: 1 }}>Marcos Vinicius</p>
          <p style={{ margin: 0, fontSize: 8, color: "#64748B" }}>Arquiteto</p>
        </div>
      </div>
    </div>
  );
}

function LeftSidebar({ activeNav, onNavigate }: { activeNav: string; onNavigate: (id: string) => void }) {
  return (
    <div style={{
      width: 168, flexShrink: 0, background: C.sidebar, borderRight: `1px solid ${C.sidebarBdr}`,
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* Project selector */}
      <div style={{ padding: "12px 12px 8px", borderBottom: `1px solid ${C.border}` }}>
        <p style={{ margin: 0, fontSize: 9, fontWeight: 700, color: C.textDim, letterSpacing: "0.08em", textTransform: "uppercase" }}>Projeto</p>
        <button style={{
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
        <button style={{
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

function CanvasToolbar() {
  return (
    <div style={{
      height: 40, flexShrink: 0, display: "flex", alignItems: "center", gap: 2,
      padding: "0 12px", background: C.surface, borderBottom: `1px solid ${C.border}`,
    }}>
      {/* Navigation */}
      {["←", "→"].map(icon => (
        <button key={icon} style={toolBtn}>{icon}</button>
      ))}
      <div style={divider} />
      {/* Undo/Redo */}
      {["↺", "↻"].map(icon => (
        <button key={icon} style={toolBtn}>{icon}</button>
      ))}
      <div style={divider} />
      {/* Tools */}
      {["⊡", "⤢"].map(icon => (
        <button key={icon} style={toolBtn}>{icon}</button>
      ))}
      <div style={divider} />

      <div style={{ flex: 1 }} />

      {/* HD dropdown */}
      <button style={{
        ...toolBtn,
        display: "flex", alignItems: "center", gap: 4, padding: "4px 10px",
        border: `1px solid ${C.border}`, borderRadius: 6,
      }}>
        <span style={{ fontSize: 10, fontWeight: 700 }}>HD</span>
        <span style={{ fontSize: 9 }}>▾</span>
      </button>

      {/* Camera */}
      <button style={toolBtn}>📷</button>

      {/* Fullscreen */}
      <button style={toolBtn}>⛶</button>
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

function RenderCanvas({ renderUrl }: { renderUrl?: string }) {
  const [tooltip, setTooltip] = useState(true);

  return (
    <div style={{
      flex: 1, background: C.canvas, borderRadius: 16, overflow: "hidden",
      position: "relative", minHeight: 0, margin: "12px",
    }}>
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
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "#64748B", lineHeight: 1.5 }}>
              Selecione um objeto no render para ativar materiais, fornecedores e produção
            </p>
          </div>
        </div>
      )}

      {/* Tooltip overlay */}
      {tooltip && (
        <div style={{
          position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)",
          background: "rgba(15,23,42,0.85)", backdropFilter: "blur(6px)",
          border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12,
          padding: "10px 16px", color: "#fff", fontSize: 11, fontWeight: 500,
          textAlign: "center", pointerEvents: "none",
          boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
        }}>
          Clique em um objeto para editar ou alterar
          <div style={{
            width: 20, height: 20, borderRadius: "50%", background: C.purple,
            border: "3px solid rgba(124,58,237,0.4)", position: "absolute",
            top: -10, left: -10,
          }} />
        </div>
      )}
    </div>
  );
}

function CanvasTabs({ activeTab, onTab }: { activeTab: string; onTab: (t: string) => void }) {
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
        <div style={{
          width: 32, height: 18, borderRadius: 9, background: C.border, position: "relative", cursor: "pointer",
        }}>
          <div style={{
            width: 14, height: 14, borderRadius: "50%", background: "#fff",
            position: "absolute", top: 2, left: 2, transition: "left 0.2s ease",
            boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
          }} />
        </div>
      </div>
    </div>
  );
}

function StoryboardGrid() {
  const [selected, setSelected] = useState("05");

  return (
    <div style={{
      height: 128, flexShrink: 0, background: C.surface, borderTop: `1px solid ${C.border}`,
      display: "flex", alignItems: "center", gap: 8, padding: "0 12px", overflowX: "auto",
    }}>
      {/* New storyboard */}
      <button style={{
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

function RightPanel() {
  const [tab, setTab] = useState<"propriedades" | "camadas">("propriedades");
  const [visible, setVisible] = useState(true);

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
            {["↺", "⧉", "⬇", "🗑", "⋯"].map((icon, i) => (
              <button key={i} style={{
                flex: 1, height: 28, border: `1px solid ${C.border}`, background: C.inputBg,
                borderRadius: 6, cursor: "pointer", fontSize: 12, color: C.textSub,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>{icon}</button>
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
          <button style={{
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
            <button style={{
              flex: 1, padding: "6px", border: "none", borderRadius: 6,
              background: C.purple, color: "#fff", fontSize: 10, fontWeight: 700, cursor: "pointer",
            }}>Testar</button>
            <button style={{
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
              placeholder="Pergunte algo ou dê um comando…"
              style={{
                flex: 1, border: "none", background: "transparent", outline: "none",
                fontSize: 9, color: C.text, minWidth: 0,
              }}
            />
            <button style={{
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

function StatusBar({ environmentName }: { environmentName: string }) {
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
      <button style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 10, color: C.textSub, padding: 0 }}>Atalhos</button>
      <div style={{ width: 1, height: 12, background: C.border, margin: "0 10px" }} />
      <button style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 10, color: C.textSub, padding: 0 }}>? Ajuda</button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
function RenderStudioInner() {
  const arqState = useArqProject();
  const [activeNav, setActiveNav] = useState("studio");
  const [activeTab, setActiveTab] = useState("Storyboard");

  const projectName = arqState.projectMeta?.titulo || arqState.projects[0]?.titulo || "Residência Silva";
  const environmentName = "Sala de Estar";

  return (
    <div style={{
      height: "100vh", display: "flex", flexDirection: "column",
      fontFamily: 'system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      overflow: "hidden", background: C.bg,
      boxSizing: "border-box",
    }}>
      {/* Top bar */}
      <TopBar projectName={projectName} environmentName={environmentName} />

      {/* Body row */}
      <div style={{ flex: 1, display: "flex", flexDirection: "row", overflow: "hidden", minHeight: 0 }}>
        {/* Left sidebar */}
        <LeftSidebar activeNav={activeNav} onNavigate={setActiveNav} />

        {/* Center: toolbar + canvas + tabs + storyboard */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0, background: C.bg }}>
          <CanvasToolbar />
          <RenderCanvas />
          <CanvasTabs activeTab={activeTab} onTab={setActiveTab} />
          <StoryboardGrid />
        </div>

        {/* Right panel */}
        <RightPanel />
      </div>

      {/* Status bar */}
      <StatusBar environmentName={environmentName} />
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
