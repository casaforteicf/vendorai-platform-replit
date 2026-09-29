// ARQDOR Render Studio — /arch/render
// P0: modal projeto, itens honestos, drag-drop, avanço único, footer real, canvas controls, ajuda/atalhos
// P1: canvas útil nas etapas iniciais, navegação direta, progresso real, recovery, acessibilidade
// P2: seleção por região (canvas rect), biblioteca de materiais real, política de preservação,
//     versionamento imutável com parentVersionId, comparação lado a lado, aprovação com governança,
//     especificação rastreável, downloads

import { useState, useRef, useCallback, useEffect, type KeyboardEvent } from "react";
import { useLocation } from "wouter";
import { useArqProject } from "@/modules/arqdor/hooks/useArqProject";
import { WorkspaceProvider } from "@/modules/arqdor/workspace/WorkspaceContext";
import { ArqdorThemeProvider } from "@/modules/arqdor/theme/ArqdorThemeProvider";
import { useAuth } from "@/contexts/AuthContext";
import { MediaAssetPicker, mediaAssetUrl, type MediaPickerAsset } from "@/components/media/MediaAssetPicker";
import type { RenderStudioStep as Step } from "./render-studio/renderStudioModel";
import { RENDER_STUDIO_STEPS as STEPS, renderStudioStepIndex as stepIndex } from "./render-studio/renderStudioModel";
import { RenderStudioTopbar as Topbar, RenderStudioSidebar as LeftSidebar } from "./render-studio/RenderStudioNavigation";
import {
  RENDER_STAGES,
  categorizeRenderError as categorizeError,
  normalizeRenderMediaUrl,
  renderApiGet as apiGet,
  renderApiPatch as apiPatch,
  renderApiPost as apiPost,
  renderFileToDataUrl as fileToDataUrl,
  waitForRenderCompletion,
  waitForRenderVideoCompletion as waitForVideoCompletion,
} from "./render-studio/renderStudioApi";

// ─── Types ─────────────────────────────────────────────────────────────────────

type CanvasMode = "fit" | "1to1";
type SaveState  = "saved" | "unsaved" | "saving" | "error";
type RenderPreset =
  | "facade_exterior_preserve"
  | "interior_layout_preserve"
  | "material_detail_enhancer"
  | "distortion_correction"
  | "camera_perspective_lock"
  | "joinery_precision"
  | "roof_openings_lock"
  | "lighting_realism"
  | "landscape_controlled"
  | "pool_water_fidelity";
type VideoMovement =
  | "zoom_in_soft" | "zoom_out_soft" | "pan_left_soft" | "pan_right_soft"
  | "tilt_up_soft" | "tilt_down_soft" | "orbit_left_soft" | "orbit_right_soft"
  | "parallax_soft" | "cinematic_micro_movement";

// P2-13: selection rect (percentage coords of displayed image)
type SelectionRect = { x: number; y: number; w: number; h: number; label: string; id: string };

// P2-16: catalog material
type CatalogItem = {
  id: string; nome: string; categoria: string; fornecedor?: string;
  imagens?: string[]; propriedades?: Record<string, string>;
  preco?: number; referencia?: string;
};

// P2-18: immutable version with parent link
type RenderVersion = {
  id: string; url: string; label: string;
  parentVersionId?: string;
  operationType: "initial" | "material" | "lighting" | "improve" | "approved";
  createdAt: Date;
  selectionLabel?: string;
  materialId?: string;
  materialName?: string;
  approvedBy?: string; approvedAt?: Date; approvalNote?: string;
};

// P2-20: approval record
type ApprovalRecord = { by: string; at: Date; note: string };

// P3-25: copilot memory
type CopilotMessage = { role: "user" | "assistant"; content: string; timestamp: Date };
// P3-27: version comments
type Comment = { id: string; text: string; author: string; timestamp: Date };
// P3-28: event log
type EventLogEntry = { id: string; type: string; label: string; timestamp: Date };

// ─── Session persistence ───────────────────────────────────────────────────────

const SK = {
  step: "arq_studio_step", ambiente: "arq_studio_ambiente",
  renderId: "arq_studio_renderId", renderUrl: "arq_studio_renderUrl",
  versions: "arq_studio_versions", imageUrl: "arq_studio_imageDataUrl",
} as const;

// ─── API helpers ───────────────────────────────────────────────────────────────

function normalizeRenderVersion(version: RenderVersion): RenderVersion {
  const normalized = normalizeRenderMediaUrl(version.url);
  return normalized && normalized !== version.url ? { ...version, url: normalized } : version;
}

// ─── Design tokens ─────────────────────────────────────────────────────────────

const D = {
  bg: "#F7F8FA", surface: "#FFFFFF", card: "#FFFFFF",
  border: "#E5E7EB", borderLight: "#D8DEE8",
  purple: "#F97316", purpleHov: "#EA580C", purpleMid: "#FB923C",
  purpleGlow: "rgba(249,115,22,0.16)", purpleText: "#C2410C",
  text: "#172033", muted: "#64748B", dim: "#94A3B8",
  green: "#10B981", greenDim: "rgba(16,185,129,0.12)",
  red: "#EF4444", amber: "#F59E0B",
  inputBg: "#FFFFFF", overlay: "rgba(247,248,250,0.92)",
} as const;

// ─── UI atoms ─────────────────────────────────────────────────────────────────

function DkBtn({ children, onClick, disabled, variant = "primary", small, fullWidth = true }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success"; small?: boolean; fullWidth?: boolean;
}) {
  const S: Record<string, React.CSSProperties> = {
    primary:   { background: D.purple, color: "#fff", border: `1px solid ${D.purpleHov}` },
    secondary: { background: D.card,   color: D.text, border: `1px solid ${D.border}` },
    ghost:     { background: "transparent", color: D.muted, border: "none" },
    danger:    { background: D.red,    color: "#fff", border: "none" },
    success:   { background: D.green,  color: "#fff", border: "none" },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: small ? "5px 12px" : "8px 18px", borderRadius: 8,
      fontSize: small ? 11 : 12, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.45 : 1, transition: "all 0.15s", letterSpacing: "0.02em",
      display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
      width: fullWidth ? "100%" : "auto", justifyContent: "center", ...S[variant],
    }}>{children}</button>
  );
}
function DkSpinner({ size = 28 }: { size?: number }) {
  return (<><div style={{ width: size, height: size, borderRadius: "50%", border: `2px solid ${D.border}`, borderTopColor: D.purple, animation: "arq-spin 0.7s linear infinite", flexShrink: 0 }} /><style>{`@keyframes arq-spin{to{transform:rotate(360deg)}}`}</style></>);
}
function DkErr({ msg }: { msg: string }) {
  return <div role="status" aria-live="assertive" style={{ padding: "8px 12px", borderRadius: 7, fontSize: 11, fontWeight: 600, background: "rgba(239,68,68,0.12)", border: `1px solid rgba(239,68,68,0.3)`, color: D.red, lineHeight: 1.5 }}>{msg}</div>;
}
function Badge({ label, color = D.purple }: { label: string; color?: string }) {
  return <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 4, background: `${color}22`, color, border: `1px solid ${color}44`, letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</span>;
}
function PanelLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 9, fontWeight: 800, color: D.dim, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2 }}>{children}</div>;
}
function InfoBox({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: "6px 8px", borderRadius: 6, background: D.card, border: `1px solid ${D.border}`, fontSize: 11, color: D.muted }}>{children}</div>;
}
function Sep() { return <span style={{ width: 1, height: 12, background: D.border }} />; }

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "7px 10px", borderRadius: 6, fontSize: 11,
  border: `1px solid ${D.border}`, background: D.inputBg, color: D.text,
  outline: "none", fontFamily: "inherit", boxSizing: "border-box",
};

const GLOBAL_STYLES = `
  *:focus-visible { outline: 2px solid #7C3AED; outline-offset: 2px; border-radius: 4px; }
  button:disabled { pointer-events: none; }
  [aria-disabled="true"] { pointer-events: none; }
`;

// ─── P0-1: CreateProjectModal ─────────────────────────────────────────────────

function CreateProjectModal({ isOpen, onClose, onCreate }: {
  isOpen: boolean; onClose: () => void; onCreate: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (isOpen) { setName(""); setErr(null); setBusy(false); setTimeout(() => inputRef.current?.focus(), 60); } }, [isOpen]);
  async function handleSubmit() {
    const t = name.trim(); if (!t) { setErr("Nome obrigatório."); return; }
    setBusy(true); setErr(null);
    try { await onCreate(t); onClose(); } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Erro ao criar projeto."); } finally { setBusy(false); }
  }
  if (!isOpen) return null;
  return (
    <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(6,9,17,0.82)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: D.surface, border: `1px solid ${D.border}`, borderRadius: 12, padding: 24, width: 360, display: "flex", flexDirection: "column", gap: 16, boxShadow: "0 24px 80px rgba(0,0,0,0.5)" }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: D.text }}>Novo projeto</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: D.dim, letterSpacing: "0.06em", textTransform: "uppercase" }}>Nome do projeto *</label>
          <input ref={inputRef} value={name} onChange={(e) => { setName(e.target.value); setErr(null); }} onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") void handleSubmit(); if (e.key === "Escape") onClose(); }}
            placeholder="Ex: Apartamento Jardins – Sala" maxLength={120} disabled={busy} style={{ ...inputStyle, border: err ? `1px solid ${D.red}` : `1px solid ${D.border}` }} />
          {err && <div role="alert" style={{ fontSize: 11, color: D.red }}>{err}</div>}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} disabled={busy} style={{ padding: "6px 14px", borderRadius: 8, fontSize: 11, fontWeight: 700, background: "transparent", color: D.muted, border: "none", cursor: "pointer" }}>Cancelar</button>
          <button onClick={() => void handleSubmit()} disabled={busy || !name.trim()} style={{ padding: "6px 14px", borderRadius: 8, fontSize: 11, fontWeight: 700, background: D.purple, color: "#fff", border: "none", cursor: !name.trim() ? "not-allowed" : "pointer", opacity: !name.trim() ? 0.6 : 1, display: "flex", alignItems: "center", gap: 6 }}>
            {busy ? <><DkSpinner size={12} /> Criando…</> : "Criar projeto"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── P1-9: NavConfirmBanner ───────────────────────────────────────────────────

function NavConfirmBanner({ targetStep, onConfirm, onCancel }: { targetStep: Step; onConfirm: () => void; onCancel: () => void }) {
  const label = STEPS.find(s => s.id === targetStep)?.label ?? targetStep;
  return (
    <div role="alertdialog" style={{ position: "absolute", top: 60, left: "50%", transform: "translateX(-50%)", zIndex: 50, background: D.surface, border: `1px solid ${D.amber}55`, borderRadius: 10, padding: "10px 16px", display: "flex", alignItems: "center", gap: 14, boxShadow: "0 8px 32px rgba(0,0,0,0.4)", whiteSpace: "nowrap" }}>
      <span style={{ fontSize: 11, color: D.text }}>Voltar para <strong style={{ color: D.purpleText }}>{label}</strong> — versões atuais são preservadas.</span>
      <button onClick={onConfirm} style={{ padding: "4px 12px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: D.purple, color: "#fff", border: "none", cursor: "pointer" }}>Confirmar</button>
      <button onClick={onCancel} style={{ padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: "transparent", color: D.muted, border: "none", cursor: "pointer" }}>Cancelar</button>
    </div>
  );
}

// ─── P0-7: HelpModal ──────────────────────────────────────────────────────────

function HelpModal({ isOpen, onClose, currentStep }: { isOpen: boolean; onClose: () => void; currentStep: Step }) {
  useEffect(() => { function k(e: globalThis.KeyboardEvent) { if (e.key === "Escape") onClose(); } if (isOpen) document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k); }, [isOpen, onClose]);
  if (!isOpen) return null;
  const faq = [
    { q: "O render demorou mais de 2 minutos.", a: "Aguarde até 3 min. Ao recarregar, o render em andamento é detectado automaticamente." },
    { q: "Quero mudar apenas uma parte.", a: "Vá para 'Melhoria', ative o modo de seleção (⬚) e desenhe um retângulo sobre a área a alterar." },
    { q: "Posso voltar a uma etapa anterior?", a: "Sim — clique na etapa na sidebar. Suas versões são preservadas." },
    { q: "O que é 'versão imutável'?", a: "Cada render gerado cria uma nova versão filha sem apagar a origem. Você pode comparar e aprovar qualquer versão." },
  ];
  return (
    <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(6,9,17,0.82)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: D.surface, border: `1px solid ${D.border}`, borderRadius: 12, padding: 24, width: 520, maxHeight: "80vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 20, boxShadow: "0 24px 80px rgba(0,0,0,0.5)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: D.text }}>Como usar o Render Studio</div>
          <button onClick={onClose} aria-label="Fechar" style={{ background: "none", border: "none", color: D.muted, cursor: "pointer", fontSize: 18, padding: 4 }}>✕</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {STEPS.map((s) => {
            const isActive = s.id === currentStep;
            return (<div key={s.id} style={{ display: "flex", gap: 10, padding: "8px 10px", borderRadius: 7, background: isActive ? `${D.purple}18` : D.card, border: `1px solid ${isActive ? D.purple : D.border}` }}>
              <span style={{ fontSize: 14, color: isActive ? D.purple : D.dim, flexShrink: 0, width: 18 }}>{s.icon}</span>
              <div><div style={{ fontSize: 11, fontWeight: 700, color: isActive ? D.purpleText : D.text, marginBottom: 2 }}>{s.label} {isActive && <Badge label="atual" />}</div>
                <div style={{ fontSize: 11, color: D.muted, lineHeight: 1.5 }}>{s.hint}</div></div>
            </div>);
          })}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: D.dim, letterSpacing: "0.08em", textTransform: "uppercase" }}>Dúvidas frequentes</div>
          {faq.map((item, i) => (<div key={i} style={{ padding: "8px 10px", borderRadius: 7, background: D.card, border: `1px solid ${D.border}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: D.text, marginBottom: 4 }}>{item.q}</div>
            <div style={{ fontSize: 11, color: D.muted, lineHeight: 1.5 }}>{item.a}</div>
          </div>))}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}><button onClick={onClose} style={{ padding: "6px 16px", borderRadius: 8, fontSize: 11, fontWeight: 700, background: D.card, color: D.text, border: `1px solid ${D.border}`, cursor: "pointer" }}>Fechar</button></div>
      </div>
    </div>
  );
}

// ─── P0-7: ShortcutsModal ─────────────────────────────────────────────────────

function ShortcutsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  useEffect(() => { function k(e: globalThis.KeyboardEvent) { if (e.key === "Escape") onClose(); } if (isOpen) document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k); }, [isOpen, onClose]);
  if (!isOpen) return null;
  const shortcuts = [{ keys: "Esc", desc: "Fechar modal / cancelar seleção" }, { keys: "Enter", desc: "Confirmar ação em modais" }, { keys: "? / F1", desc: "Abrir ajuda" }];
  return (
    <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(6,9,17,0.82)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: D.surface, border: `1px solid ${D.border}`, borderRadius: 12, padding: 24, width: 380, display: "flex", flexDirection: "column", gap: 14, boxShadow: "0 24px 80px rgba(0,0,0,0.5)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: D.text }}>Atalhos de teclado</div>
          <button onClick={onClose} aria-label="Fechar" style={{ background: "none", border: "none", color: D.muted, cursor: "pointer", fontSize: 18, padding: 4 }}>✕</button>
        </div>
        {shortcuts.map((s) => (
          <div key={s.keys} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 10px", borderRadius: 7, background: D.card, border: `1px solid ${D.border}` }}>
            <kbd style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 5, background: D.surface, border: `1px solid ${D.borderLight}`, color: D.purpleText, fontFamily: "monospace", flexShrink: 0 }}>{s.keys}</kbd>
            <span style={{ fontSize: 11, color: D.muted }}>{s.desc}</span>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "6px 14px", borderRadius: 8, fontSize: 11, fontWeight: 700, background: D.card, color: D.text, border: `1px solid ${D.border}`, cursor: "pointer" }}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

// ─── P2-16: MaterialLibraryModal ─────────────────────────────────────────────

function MaterialLibraryModal({ isOpen, onClose, onSelect }: {
  isOpen: boolean; onClose: () => void; onSelect: (item: CatalogItem) => void;
}) {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [categoria, setCategoria] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    const params = new URLSearchParams({ limit: "40" });
    if (search) params.set("busca", search);
    if (categoria) params.set("categoria", categoria);
    apiGet(`/api/arch/catalogo?${params}`)
      .then((data: CatalogItem[]) => setItems(data))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [isOpen, search, categoria]);

  useEffect(() => {
    function k(e: globalThis.KeyboardEvent) { if (e.key === "Escape") onClose(); }
    if (isOpen) document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const categorias = ["Piso", "Parede", "Marcenaria", "Estofado", "Iluminação", "Decoração"];

  return (
    <div role="dialog" aria-modal="true" aria-label="Biblioteca de materiais"
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(6,9,17,0.84)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: D.surface, border: `1px solid ${D.border}`, borderRadius: 12, padding: 0, width: 680, maxHeight: "82vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 80px rgba(0,0,0,0.6)", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${D.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: D.text }}>▦ Biblioteca de Materiais</div>
          <button onClick={onClose} aria-label="Fechar" style={{ background: "none", border: "none", color: D.muted, cursor: "pointer", fontSize: 18, padding: 4 }}>✕</button>
        </div>
        {/* Search + filter */}
        <div style={{ padding: "10px 20px", borderBottom: `1px solid ${D.border}`, display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar material…" aria-label="Buscar material"
            style={{ ...inputStyle, width: 220, flexShrink: 0 }} />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button onClick={() => setCategoria("")} style={{ padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700, background: !categoria ? `${D.purple}33` : D.card, color: !categoria ? D.purpleText : D.muted, border: `1px solid ${!categoria ? D.purple : D.border}`, cursor: "pointer" }}>Todos</button>
            {categorias.map(c => (
              <button key={c} onClick={() => setCategoria(c === categoria ? "" : c)}
                style={{ padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700, background: categoria === c ? `${D.purple}33` : D.card, color: categoria === c ? D.purpleText : D.muted, border: `1px solid ${categoria === c ? D.purple : D.border}`, cursor: "pointer" }}>
                {c}
              </button>
            ))}
          </div>
        </div>
        {/* Grid */}
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          {loading && <div style={{ display: "flex", justifyContent: "center", padding: 32 }}><DkSpinner size={32} /></div>}
          {!loading && items.length === 0 && (
            <div style={{ textAlign: "center", padding: 32, color: D.muted }}>
              <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.3 }}>▦</div>
              <div style={{ fontSize: 13, marginBottom: 4 }}>Nenhum material no catálogo ainda</div>
              <div style={{ fontSize: 11, color: D.dim }}>Adicione materiais em Arquivo → Catálogo ou use instrução livre abaixo.</div>
            </div>
          )}
          {!loading && items.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
              {items.map((item) => (
                <button key={item.id} onClick={() => { onSelect(item); onClose(); }}
                  title={item.nome}
                  style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 10, overflow: "hidden", cursor: "pointer", textAlign: "left", transition: "border-color 0.15s", display: "flex", flexDirection: "column" }}>
                  <div style={{ height: 90, background: D.inputBg, position: "relative", overflow: "hidden" }}>
                    {(item.imagens ?? [])[0] ? (
                      <img src={(item.imagens ?? [])[0]} alt={item.nome} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, color: D.dim }}>▦</div>
                    )}
                  </div>
                  <div style={{ padding: "8px 8px 6px" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: D.text, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.nome}</div>
                    <div style={{ fontSize: 9, color: D.dim }}>{item.categoria}{item.fornecedor ? ` · ${item.fornecedor}` : ""}</div>
                    {item.referencia && <div style={{ fontSize: 9, color: D.dim }}>Ref: {item.referencia}</div>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        {/* Free-text option */}
        <div style={{ padding: "10px 20px", borderTop: `1px solid ${D.border}`, flexShrink: 0 }}>
          <div style={{ fontSize: 10, color: D.dim }}>
            Não encontrou o material? Use instrução livre no campo de texto (sem vínculo comercial).
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── P1-8: FlowGuide ─────────────────────────────────────────────────────────

function FlowGuide({ step, projectTitle, ambiente }: { step: Step; projectTitle: string | null; ambiente: string }) {
  const currentIdx = stepIndex(step);
  return (
    <div className="arqdor-flow-guide" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, maxWidth: 480, padding: "0 16px" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 32, color: D.purple, marginBottom: 8, opacity: 0.7 }}>{STEPS[currentIdx].icon}</div>
        <div style={{ fontSize: 16, fontWeight: 800, color: D.text, marginBottom: 6 }}>{STEPS[currentIdx].label}</div>
        <div style={{ fontSize: 12, color: D.muted, lineHeight: 1.6 }}>{STEPS[currentIdx].hint}</div>
      </div>
      {(projectTitle || ambiente) && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
          {projectTitle && <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 20, background: `${D.purple}18`, border: `1px solid ${D.purple}33`, fontSize: 11, color: D.purpleText }}><span>◈</span> {projectTitle}</div>}
          {ambiente && <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 20, background: D.card, border: `1px solid ${D.border}`, fontSize: 11, color: D.muted }}><span>⬡</span> {ambiente}</div>}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {STEPS.map((s, i) => {
          const done = i < currentIdx; const active = i === currentIdx;
          return (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div title={s.label} style={{ width: active ? 28 : 20, height: active ? 28 : 20, borderRadius: "50%", flexShrink: 0, transition: "all 0.2s", display: "flex", alignItems: "center", justifyContent: "center", background: done ? D.green : active ? D.purple : D.border, border: active ? `2px solid ${D.purpleMid}` : "none", fontSize: active ? 10 : 8, color: done || active ? "#fff" : D.dim, boxShadow: active ? `0 0 12px ${D.purpleGlow}` : "none" }}>
                {done ? "✓" : s.icon}
              </div>
              {i < STEPS.length - 1 && <div style={{ width: 16, height: 1, background: done ? D.green : D.border }} />}
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 10, color: D.dim, textAlign: "center" }}>Etapa {currentIdx + 1} de {STEPS.length} — use o painel direito ou a topbar para continuar</div>
    </div>
  );
}

// ─── P1-10: ProgressOverlay ───────────────────────────────────────────────────

function ProgressOverlay({ stage, elapsedSeconds, isRecovering }: { stage: string | null; elapsedSeconds: number; isRecovering: boolean }) {
  const mm = Math.floor(elapsedSeconds / 60).toString().padStart(2, "0");
  const ss = (elapsedSeconds % 60).toString().padStart(2, "0");
  const label = isRecovering ? "Verificando render em andamento…" : (stage ?? "Processando…");
  return (
    <div role="status" aria-live="polite" style={{ position: "absolute", inset: 0, zIndex: 20, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: D.overlay, gap: 16 }}>
      <DkSpinner size={48} />
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: D.text, marginBottom: 6 }}>{label}</div>
        {!isRecovering && <><div style={{ fontSize: 12, color: D.muted, marginBottom: 8 }}>{elapsedSeconds < 30 ? "Estimativa: 30–90 segundos" : elapsedSeconds < 90 ? "Processando — aguarde" : "Finalizando (processo lento)"}</div><div style={{ fontSize: 11, color: D.dim }}>⏱ {mm}:{ss} decorridos</div></>}
      </div>
      {!isRecovering && (
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          {["Preparando", "Enviando", "Gerando", "Salvando"].map((s, i) => {
            const thresholds = [0, 3, 8, 999]; const done = elapsedSeconds > thresholds[i];
            return (<div key={s} style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 6, height: 6, borderRadius: "50%", background: done ? D.green : D.dim }} /><span style={{ fontSize: 9, color: done ? D.green : D.dim }}>{s}</span></div>);
          })}
        </div>
      )}
    </div>
  );
}

// ─── P2-13: SelectionCanvas overlay ──────────────────────────────────────────

function SelectionCanvas({ isActive, renderUrl, onSelection, existingSelections, onClearSelection }: {
  isActive: boolean;
  renderUrl: string;
  onSelection: (sel: Omit<SelectionRect, "id" | "label">) => void;
  existingSelections: SelectionRect[];
  onClearSelection: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ active: boolean; startX: number; startY: number }>({ active: false, startX: 0, startY: 0 });
  const [currentRect, setCurrentRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // Redraw canvas on changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw existing selections
    existingSelections.forEach((sel) => {
      const x = (sel.x / 100) * canvas.width;
      const y = (sel.y / 100) * canvas.height;
      const w = (sel.w / 100) * canvas.width;
      const h = (sel.h / 100) * canvas.height;
      ctx.fillStyle = "rgba(124,58,237,0.15)";
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = "#7C3AED";
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = "#A78BFA";
      ctx.font = "bold 11px system-ui";
      ctx.fillText(sel.label || "Seleção", x + 6, y + 16);
    });

    // Draw current drag rect
    if (currentRect) {
      const x = (currentRect.x / 100) * canvas.width;
      const y = (currentRect.y / 100) * canvas.height;
      const w = (currentRect.w / 100) * canvas.width;
      const h = (currentRect.h / 100) * canvas.height;
      ctx.fillStyle = "rgba(124,58,237,0.12)";
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = "#7C3AED";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.strokeRect(x, y, w, h);
    }
  }, [currentRect, existingSelections]);

  function getRelativeCoords(e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * 100, y: ((e.clientY - rect.top) / rect.height) * 100 };
  }

  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!isActive) return;
    const pos = getRelativeCoords(e);
    dragRef.current = { active: true, startX: pos.x, startY: pos.y };
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!isActive || !dragRef.current.active) return;
    const pos = getRelativeCoords(e);
    const { startX, startY } = dragRef.current;
    setCurrentRect({ x: Math.min(startX, pos.x), y: Math.min(startY, pos.y), w: Math.abs(pos.x - startX), h: Math.abs(pos.y - startY) });
  }

  function handleMouseUp(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!isActive || !dragRef.current.active) return;
    const pos = getRelativeCoords(e);
    const { startX, startY } = dragRef.current;
    dragRef.current.active = false;
    const w = Math.abs(pos.x - startX); const h = Math.abs(pos.y - startY);
    // Minimum selection size (5% of image)
    if (w > 2 && h > 2) {
      onSelection({ x: Math.min(startX, pos.x), y: Math.min(startY, pos.y), w, h });
    }
    setCurrentRect(null);
  }

  // Resize canvas to match container
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ro = new ResizeObserver(([entry]) => {
      canvas.width  = entry.contentRect.width;
      canvas.height = entry.contentRect.height;
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={containerRef} style={{ position: "absolute", inset: 0, pointerEvents: isActive ? "auto" : "none" }}>
      <canvas ref={canvasRef} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", cursor: isActive ? "crosshair" : "default" }} />
      {isActive && existingSelections.length === 0 && !currentRect && (
        <div style={{ position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)", padding: "6px 14px", borderRadius: 20, background: `${D.surface}EE`, border: `1px solid ${D.purple}`, fontSize: 11, color: D.purpleText, pointerEvents: "none", whiteSpace: "nowrap" }}>
          Arraste para selecionar a região a alterar
        </div>
      )}
    </div>
  );
}

// ─── P2-19: Comparison view ───────────────────────────────────────────────────

function ComparisonView({ versionA, versionB, allVersions, onChangeA, onChangeB }: {
  versionA: RenderVersion; versionB: RenderVersion;
  allVersions: RenderVersion[];
  onChangeA: (id: string) => void; onChangeB: (id: string) => void;
}) {
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 15, background: "#03050A", display: "flex", flexDirection: "column" }}>
      {/* Pickers */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", background: `${D.surface}EE`, borderBottom: `1px solid ${D.border}`, flexShrink: 0 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: D.dim }}>Comparar:</span>
        <select value={versionA.id} onChange={(e) => onChangeA(e.target.value)} aria-label="Versão A" style={{ ...inputStyle, width: 200 }}>
          {allVersions.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
        </select>
        <span style={{ fontSize: 10, color: D.dim }}>vs</span>
        <select value={versionB.id} onChange={(e) => onChangeB(e.target.value)} aria-label="Versão B" style={{ ...inputStyle, width: 200 }}>
          {allVersions.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
        </select>
      </div>
      {/* Side by side */}
      <div style={{ flex: 1, display: "flex", gap: 0, overflow: "hidden" }}>
        {[versionA, versionB].map((v, i) => (
          <div key={v.id} style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", borderRight: i === 0 ? `1px solid ${D.border}` : "none" }}>
            <div style={{ padding: "6px 12px", background: `${D.surface}CC`, borderBottom: `1px solid ${D.border}`, fontSize: 10, fontWeight: 700, color: i === 0 ? D.purpleText : D.green, display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              <span style={{ padding: "1px 6px", borderRadius: 4, background: i === 0 ? `${D.purple}33` : `${D.green}33`, border: `1px solid ${i === 0 ? D.purple : D.green}44` }}>{i === 0 ? "A" : "B"}</span>
              {v.label}
              {v.approvedBy && <span style={{ marginLeft: "auto", fontSize: 9, color: D.green }}>✓ Aprovado</span>}
            </div>
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", padding: 12 }}>
              <img src={normalizeRenderMediaUrl(v.url)} alt={v.label} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
            </div>
            {/* P2-19: diff summary */}
            {v.operationType !== "initial" && (
              <div style={{ padding: "6px 12px", background: `${D.surface}CC`, borderTop: `1px solid ${D.border}`, fontSize: 10, color: D.muted, flexShrink: 0 }}>
                Operação: <strong style={{ color: D.text }}>{v.operationType === "material" ? "Troca de Material" : v.operationType === "lighting" ? "Ajuste de Iluminação" : "Melhoria Geral"}</strong>
                {v.materialName && <> · Material: <strong style={{ color: D.purpleText }}>{v.materialName}</strong></>}
                {v.selectionLabel && <> · Região: {v.selectionLabel}</>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── P3-23/24/25: CopilotPanel ────────────────────────────────────────────────

function CopilotPanel({ projectId, step, selections, onTestAction }: {
  projectId: string | null; step: Step; selections: SelectionRect[]; onTestAction: (prompt: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<CopilotMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [pendingActions, setPendingActions] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messagesEndRef.current) messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  async function sendMessage(overrideMsg?: string) {
    const msg = (overrideMsg ?? input).trim();
    if (!msg || busy) return;
    setInput("");
    const userMsg: CopilotMessage = { role: "user", content: msg, timestamp: new Date() };
    setHistory(prev => [...prev, userMsg]);
    setBusy(true);
    abortRef.current = new AbortController();
    try {
      const apiHistory = [...history.slice(-8), userMsg].map(m => ({ role: m.role, content: m.content }));
      const data = await apiPost("/api/arch/copilot/chat", {
        message: msg, projectId: projectId ?? undefined,
        history: apiHistory.slice(0, -1),
      });
      const reply: string = data.reply ?? data.message ?? data.content ?? data.resposta ?? "Sem resposta.";
      const actionMatch = reply.match(/ACTIONS:\s*\[([^\]]+)\]/i);
      if (actionMatch) {
        const parsed = actionMatch[1].split(",").map((a: string) => a.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
        setPendingActions(parsed);
      } else {
        setPendingActions([]);
      }
      const assistantMsg: CopilotMessage = { role: "assistant", content: reply.replace(/ACTIONS:\s*\[[^\]]+\]/i, "").trim(), timestamp: new Date() };
      setHistory(prev => [...prev, assistantMsg]);
    } catch {
      setHistory(prev => [...prev, { role: "assistant", content: "Erro ao consultar o Copilot. Tente novamente.", timestamp: new Date() }]);
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  const stepSuggestions: Partial<Record<Step, string>> = {
    render:   "Qual estilo de render você recomenda para este ambiente?",
    melhoria: selections.length > 0 ? `Que material sugere para a região "${selections[0].label}"?` : "Quais materiais combinam com este ambiente?",
    versao:   "Qual versão tem melhor aproveitamento da luz natural?",
    aprovar:  "Este render está pronto para aprovação do cliente?",
  };
  const suggestion = stepSuggestions[step];
  const unreadCount = history.filter(m => m.role === "assistant").length;

  return (
    <div className="arqdor-copilot-strip" style={{ borderTop: `1px solid ${D.border}`, background: `${D.surface}F8`, flexShrink: 0 }}>
      <button onClick={() => setIsOpen(o => !o)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }} aria-expanded={isOpen}>
        <span style={{ fontSize: 11, color: D.purple }}>✦</span>
        <span style={{ fontSize: 10, fontWeight: 800, color: D.purple, letterSpacing: "0.06em", flex: 1 }}>IA COPILOT</span>
        {unreadCount > 0 && !isOpen && <span style={{ fontSize: 9, fontWeight: 800, padding: "1px 5px", borderRadius: 10, background: D.purple, color: "#fff" }}>{unreadCount}</span>}
        <span style={{ fontSize: 9, color: D.dim }}>{isOpen ? "▲" : "▼"}</span>
      </button>
      {isOpen && (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {history.length > 0 && (
            <div style={{ overflowY: "auto", padding: "6px 12px", display: "flex", flexDirection: "column", gap: 6, maxHeight: 180 }}>
              {history.map((m, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start" }}>
                  <div style={{ maxWidth: "88%", padding: "6px 9px", borderRadius: m.role === "user" ? "12px 12px 3px 12px" : "12px 12px 12px 3px", background: m.role === "user" ? `${D.purple}33` : D.card, border: `1px solid ${m.role === "user" ? D.purple + "44" : D.border}`, fontSize: 11, color: D.text, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {m.content}
                  </div>
                  <span style={{ fontSize: 9, color: D.dim, marginTop: 2 }}>{m.timestamp.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              ))}
              {busy && <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0" }}><DkSpinner size={12} /><span style={{ fontSize: 10, color: D.muted }}>Copilot pensando…</span></div>}
              <div ref={messagesEndRef} />
            </div>
          )}
          {pendingActions.length > 0 && (
            <div style={{ padding: "6px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: D.dim, letterSpacing: "0.06em", textTransform: "uppercase" }}>Ações sugeridas</div>
              {pendingActions.map(action => (
                <div key={action} style={{ display: "flex", gap: 6, alignItems: "center", padding: "5px 8px", borderRadius: 6, background: `${D.purple}12`, border: `1px solid ${D.purple}33` }}>
                  <span style={{ fontSize: 10, color: D.purpleText, flex: 1 }}>{action}</span>
                  <button onClick={() => { onTestAction(action); setPendingActions(prev => prev.filter(a => a !== action)); }} style={{ padding: "2px 8px", borderRadius: 5, fontSize: 9, fontWeight: 700, background: D.purple, color: "#fff", border: "none", cursor: "pointer" }}>Testar</button>
                  <button onClick={() => setPendingActions(prev => prev.filter(a => a !== action))} style={{ padding: "2px 6px", borderRadius: 5, fontSize: 9, background: "transparent", color: D.dim, border: "none", cursor: "pointer" }}>Ignorar</button>
                </div>
              ))}
            </div>
          )}
          {suggestion && history.length === 0 && (
            <div style={{ padding: "4px 12px" }}>
              <button onClick={() => void sendMessage(suggestion)} style={{ padding: "4px 10px", borderRadius: 20, fontSize: 10, background: `${D.purple}18`, color: D.purpleText, border: `1px solid ${D.purple}33`, cursor: "pointer", maxWidth: "100%", textAlign: "left" }}>
                💡 {suggestion}
              </button>
            </div>
          )}
          <div style={{ display: "flex", gap: 6, padding: "8px 12px", borderTop: `1px solid ${D.border}` }}>
            <input value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(); } }}
              placeholder="Pergunte ao Copilot…" disabled={busy}
              aria-label="Mensagem para o Copilot" style={{ ...inputStyle, flex: 1, fontSize: 11 }} />
            <button onClick={() => void sendMessage()} disabled={busy || !input.trim()}
              style={{ padding: "5px 10px", borderRadius: 6, background: D.purple, color: "#fff", border: "none", cursor: busy || !input.trim() ? "not-allowed" : "pointer", opacity: busy || !input.trim() ? 0.45 : 1, fontWeight: 700, fontSize: 11 }}>
              {busy ? "…" : "→"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Central Canvas (P0-3, P0-6, P1-8, P1-10, P2-13, P2-19) ─────────────────

function CentralCanvas({ step, imageDataUrl, renderUrl, loading, isDragging, canvasMode, showGrid, processingStage, elapsedSeconds, isRecovering, onUpload, onDragOver, onDragLeave, onDrop, projectTitle, ambiente, selectionMode, selections, onSelection, onClearSelection, compareMode, compareVersionA, compareVersionB, allVersions, onCompareChangeA, onCompareChangeB, onRenderLoadError }: {
  step: Step; imageDataUrl: string | null; renderUrl: string | null;
  loading: boolean; isDragging: boolean; canvasMode: CanvasMode; showGrid: boolean;
  processingStage: string | null; elapsedSeconds: number; isRecovering: boolean;
  onUpload: () => void; onDragOver: (e: React.DragEvent) => void; onDragLeave: () => void; onDrop: (e: React.DragEvent) => void;
  projectTitle: string | null; ambiente: string;
  selectionMode: "off" | "rect"; selections: SelectionRect[]; onSelection: (sel: Omit<SelectionRect, "id" | "label">) => void; onClearSelection: () => void;
  compareMode: boolean; compareVersionA: RenderVersion | null; compareVersionB: RenderVersion | null;
  allVersions: RenderVersion[]; onCompareChangeA: (id: string) => void; onCompareChangeB: (id: string) => void;
  onRenderLoadError: () => void;
}) {
  const beforeRenderStep = stepIndex(step) < stepIndex("render");
  const showRender  = !beforeRenderStep && !!renderUrl;
  const showUpload  = step === "imagem";
  const showImage   = !beforeRenderStep && step !== "imagem" && (showRender || !!imageDataUrl);
  const displayUrl  = showRender ? renderUrl : imageDataUrl;
  const showFlowGuide = (step === "projeto" || step === "ambiente") && !loading;

  const imageStyle: React.CSSProperties = canvasMode === "1to1"
    ? { width: "auto", height: "auto", maxWidth: "none", maxHeight: "none", boxShadow: "0 8px 64px rgba(0,0,0,0.6)" }
    : { maxWidth: "100%", maxHeight: "100%", objectFit: "contain" as const, boxShadow: "0 8px 64px rgba(0,0,0,0.6)" };

  return (
    <div className="arqdor-center-panel" style={{ flex: 1, overflow: "hidden", position: "relative", background: D.bg, display: "flex", flexDirection: "column" }}>
      {/* P0-6: view controls */}
      <div className="arqdor-canvas-toolbar" style={{ position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)", zIndex: 10, display: "flex", gap: 4, background: `${D.surface}EE`, border: `1px solid ${D.border}`, borderRadius: 8, padding: "4px" }}>
        {(["1:1", "Ajustar", "Grade"] as const).map((label) => {
          const isActive = (label === "1:1" && canvasMode === "1to1") || (label === "Ajustar" && canvasMode === "fit") || (label === "Grade" && showGrid);
          return (
            <button key={label} data-canvas-action={label} title={label === "1:1" ? "Escala real" : label === "Ajustar" ? "Enquadrar na tela" : "Grade de referência"} aria-pressed={isActive}
              style={{ padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600, background: isActive ? `${D.purple}33` : "none", color: isActive ? D.purpleText : D.muted, border: isActive ? `1px solid ${D.purple}55` : "none", cursor: "pointer" }}>
              {label}
            </button>
          );
        })}
        {/* P2-13: selection mode toggle — available when render exists */}
        {showRender && (
          <button data-canvas-action="Selecionar" title={selectionMode === "rect" ? "Cancelar seleção (Esc)" : "Selecionar região para editar"} aria-pressed={selectionMode === "rect"}
            style={{ padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600, background: selectionMode === "rect" ? `${D.amber}33` : "none", color: selectionMode === "rect" ? D.amber : D.muted, border: selectionMode === "rect" ? `1px solid ${D.amber}55` : "none", cursor: "pointer" }}>
            ⬚ {selectionMode === "rect" ? "Selecionando…" : "Selecionar"}
          </button>
        )}
        {/* P2-19: Comparar — ativo quando 2+ versões */}
        {allVersions.length >= 2 ? (
          <button data-canvas-action="Comparar" title="Comparar versões lado a lado" aria-pressed={compareMode}
            style={{ padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600, background: compareMode ? `${D.green}33` : "none", color: compareMode ? D.green : D.muted, border: compareMode ? `1px solid ${D.green}55` : "none", cursor: "pointer" }}>
            Comparar
          </button>
        ) : (
          <button title="Comparação — disponível após gerar 2 versões" aria-disabled="true" tabIndex={-1} style={{ padding: "4px 10px", borderRadius: 6, fontSize: 10, color: D.dim, border: "none", cursor: "default", opacity: 0.35 }}>Comparar</button>
        )}
      </div>

      {/* P0-6: grid overlay */}
      {showGrid && showImage && (
        <div style={{ position: "absolute", inset: 0, zIndex: 5, pointerEvents: "none", backgroundImage: `linear-gradient(${D.border}66 1px, transparent 1px), linear-gradient(90deg, ${D.border}66 1px, transparent 1px)`, backgroundSize: "48px 48px" }} />
      )}

      {/* P2-19: comparison view */}
      {compareMode && compareVersionA && compareVersionB && (
        <ComparisonView versionA={compareVersionA} versionB={compareVersionB} allVersions={allVersions} onChangeA={onCompareChangeA} onChangeB={onCompareChangeB} />
      )}

      {/* Main area */}
      {!compareMode && (
        <div className="arqdor-canvas-stage" style={{ flex: 1, display: "flex", alignItems: canvasMode === "1to1" ? "flex-start" : "center", justifyContent: canvasMode === "1to1" ? "flex-start" : "center", overflow: canvasMode === "1to1" ? "auto" : "hidden", position: "relative", padding: canvasMode === "1to1" ? 24 : 0, outline: isDragging ? `2px dashed ${D.purple}` : undefined, transition: "outline 0.15s" }}
          onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
          {(loading || isRecovering) && <ProgressOverlay stage={processingStage} elapsedSeconds={elapsedSeconds} isRecovering={isRecovering} />}
          {isDragging && (
            <div style={{ position: "absolute", inset: 0, zIndex: 25, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: `${D.purple}18`, gap: 12, pointerEvents: "none" }}>
              <div style={{ fontSize: 36, color: D.purple }}>⬜</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: D.purpleText }}>Solte a imagem aqui</div>
            </div>
          )}
          {showFlowGuide && !isDragging && <FlowGuide step={step} projectTitle={projectTitle} ambiente={ambiente} />}
          {/* Image + P2-13 selection canvas */}
          {showImage && displayUrl && !isDragging && (
            <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: canvasMode === "1to1" ? "auto" : "100%", height: canvasMode === "1to1" ? "auto" : "100%" }}>
              <img
                src={normalizeRenderMediaUrl(displayUrl)}
                alt={renderUrl ? "render gerado" : "imagem base"}
                style={imageStyle}
                onError={(e) => {
                  const el = e.currentTarget;
                  el.style.display = "none";
                  el.parentElement?.setAttribute("data-render-load-error", "true");
                  if (showRender) onRenderLoadError();
                }}
              />
              {renderUrl && (
                <div style={{ position: "absolute", inset: 0, display: "none", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8, color: D.red, fontSize: 12, pointerEvents: "none" }}
                  ref={(el) => {
                    if (!el) return;
                    const parent = el.parentElement;
                    const sync = () => { el.style.display = parent?.getAttribute("data-render-load-error") === "true" ? "flex" : "none"; };
                    sync();
                  }}>
                  <strong>Imagem do render indisponível</strong>
                  <span style={{ color: D.muted }}>O arquivo não foi encontrado no Storage.</span>
                </div>
              )}
              {showRender && (
                <SelectionCanvas isActive={selectionMode === "rect"} renderUrl={renderUrl} onSelection={onSelection} existingSelections={selections} onClearSelection={onClearSelection} />
              )}
            </div>
          )}
          {showUpload && !loading && !isDragging && (
            <div className="arqdor-upload-card" onClick={onUpload} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} role="button" tabIndex={0} aria-label="Carregar imagem — clique ou arraste" onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onUpload(); }}
              style={{ border: `2px dashed ${imageDataUrl ? D.purple : D.border}`, borderRadius: 16, padding: "48px 40px", cursor: "pointer", background: imageDataUrl ? `${D.purple}08` : `${D.card}88`, display: "flex", flexDirection: "column", alignItems: "center", gap: 16, transition: "all 0.2s", maxWidth: 420, width: "100%" }}>
              {imageDataUrl ? (
                <><img src={imageDataUrl} alt="base" style={{ maxHeight: 260, maxWidth: "100%", borderRadius: 10, objectFit: "contain" }} /><span style={{ fontSize: 11, color: D.purpleText, fontWeight: 600 }}>Clique ou arraste para trocar</span></>
              ) : (
                <><div style={{ width: 64, height: 64, borderRadius: 16, background: `${D.purple}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, color: D.purple }}>⬜</div>
                  <div style={{ textAlign: "center" }}><div style={{ fontSize: 15, fontWeight: 700, color: D.text, marginBottom: 6 }}>Carregar imagem do ambiente</div><div style={{ fontSize: 12, color: D.muted }}>JPG, PNG, WEBP — máx. 10 MB<br />Clique ou arraste aqui</div></div></>
              )}
            </div>
          )}
          {!showFlowGuide && !showImage && !showUpload && !loading && !isDragging && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, color: D.dim }}>
              <div style={{ fontSize: 48, opacity: 0.3 }}>✦</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: D.muted }}>Aguardando imagem base</div>
            </div>
          )}
        </div>
      )}

      {/* P2-13: selection toolbar when active */}
      {selectionMode === "rect" && selections.length > 0 && (
        <div style={{ position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)", zIndex: 30, background: `${D.surface}EE`, border: `1px solid ${D.amber}`, borderRadius: 10, padding: "8px 14px", display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 11, color: D.amber }}>⬚ {selections.length} região(ões) selecionada(s)</span>
          <button onClick={onClearSelection} style={{ padding: "3px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700, background: "transparent", color: D.muted, border: `1px solid ${D.border}`, cursor: "pointer" }}>Limpar</button>
        </div>
      )}

      {/* P2-22: download render button */}
      {showRender && !loading && !compareMode && (
        <div style={{ position: "absolute", bottom: 12, right: 12, zIndex: 30 }}>
          <a href={renderUrl} target="_blank" rel="noopener noreferrer" download="render-arqdor.jpg"
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 8, background: `${D.surface}EE`, border: `1px solid ${D.border}`, fontSize: 10, fontWeight: 700, color: D.muted, textDecoration: "none", cursor: "pointer" }}>
            ⬇ Baixar render
          </a>
        </div>
      )}
    </div>
  );
}

// ─── Right Panel (P2-14/15/16/17/20/21) ──────────────────────────────────────

function RightPanel({
  step, arq, ambiente, setAmbiente, imageFile, imageDataUrl, renderUrl, versions, loading, err,
  melhoriaPrompt, setMelhoriaPrompt, melhoriaMode, setMelhoriaMode,
  approved, specDone, specData,
  specificationId, enviandoOrcamento, orcamentoMsg, onEnviarOrcamento,
  areaM2, setAreaM2, peDireitoM, setPeDireitoM, onSalvarMedidasAmbiente, onSalvarMedidasItem,
  onNextStep, onStartRender, onApplyMelhoria, onApprove, onSendToSpec,
  renderPreset, setRenderPreset, videoMovement, setVideoMovement, videoGenerating, renderVideoUrl, onGenerateVideo5s,
  onShowCreateModal, onUpload, onOpenMediaLibrary, mediaLibraryAvailable,
  selections, selectedMaterial, onOpenMaterialLib, onClearSelection, onRemoveSelection,
  approvalRecord, approvalNote, setApprovalNote,
  onTestCopilotAction,
  isOpen, onToggle,
}: {
  step: Step; arq: any; ambiente: string; setAmbiente: (v: string) => void;
  imageFile: File | null; imageDataUrl: string | null; renderUrl: string | null;
  versions: RenderVersion[]; loading: boolean; err: string | null;
  melhoriaPrompt: string; setMelhoriaPrompt: (v: string) => void;
  melhoriaMode: "improve" | "change-material" | "change-lighting"; setMelhoriaMode: (v: "improve" | "change-material" | "change-lighting") => void;
  approved: boolean; specDone: boolean; specData: any[];
  specificationId: string | null; enviandoOrcamento: boolean; orcamentoMsg: string | null; onEnviarOrcamento: () => void;
  areaM2: string; setAreaM2: (v: string) => void; peDireitoM: string; setPeDireitoM: (v: string) => void;
  onSalvarMedidasAmbiente: () => void;
  onSalvarMedidasItem: (itemId: string, patch: { larguraCm?: string; alturaCm?: string; profundidadeCm?: string }) => void;
  onNextStep: () => void; onStartRender: () => void;
  onApplyMelhoria: () => void; onApprove: () => void; onSendToSpec: () => void;
  renderPreset: RenderPreset; setRenderPreset: (v: RenderPreset) => void;
  videoMovement: VideoMovement; setVideoMovement: (v: VideoMovement) => void;
  videoGenerating: boolean; renderVideoUrl: string | null; onGenerateVideo5s: () => void;
  onShowCreateModal: () => void; onUpload: () => void; onOpenMediaLibrary: () => void; mediaLibraryAvailable: boolean;
  selections: SelectionRect[]; selectedMaterial: CatalogItem | null;
  onOpenMaterialLib: () => void; onClearSelection: () => void; onRemoveSelection: (id: string) => void;
  approvalRecord: ApprovalRecord | null; approvalNote: string; setApprovalNote: (v: string) => void;
  onTestCopilotAction: (prompt: string) => void;
  isOpen: boolean; onToggle: () => void;
}) {
  const [tab, setTab] = useState<"propriedades" | "camadas">("propriedades");
  const AMBIENTE_OPTIONS = ["Sala de Estar", "Quarto Master", "Cozinha", "Banheiro", "Escritório", "Varanda", "Hall de Entrada"];
  const MELHORIA_MODES: { id: "improve" | "change-material" | "change-lighting"; label: string; icon: string }[] = [
    { id: "improve", label: "Melhorar qualidade", icon: "✨" },
    { id: "change-material", label: "Trocar material", icon: "🎨" },
    { id: "change-lighting", label: "Ajustar iluminação", icon: "💡" },
  ];

  return (
    <div className="arqdor-legacy-right-panel" style={{ display: "flex", alignItems: "stretch", position: "relative" }}>
      {/* P1-12: toggle */}
      <button onClick={onToggle} aria-label={isOpen ? "Recolher painel direito" : "Expandir painel direito"} style={{ position: "absolute", left: -14, top: "50%", transform: "translateY(-50%)", zIndex: 10, width: 14, height: 32, borderRadius: "4px 0 0 4px", background: D.surface, border: `1px solid ${D.border}`, borderRight: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: D.dim, fontSize: 9 }}>{isOpen ? "›" : "‹"}</button>

      {isOpen && (
        <div style={{ width: 300, flexShrink: 0, background: D.surface, borderLeft: `1px solid ${D.border}`, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ display: "flex", borderBottom: `1px solid ${D.border}`, flexShrink: 0 }}>
            {(["propriedades", "camadas"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} aria-selected={tab === t} style={{ flex: 1, padding: "10px 0", fontSize: 11, fontWeight: tab === t ? 700 : 400, color: tab === t ? D.purpleText : D.muted, background: "none", border: "none", borderBottom: tab === t ? `2px solid ${D.purple}` : "2px solid transparent", cursor: "pointer", marginBottom: -1 }}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          <div className="arqdor-properties-scroll" style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>

            {/* P2-15: Camadas — dados reais */}
            {tab === "camadas" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <PanelLabel>Camadas</PanelLabel>
                {/* Base */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", borderRadius: 7, border: `1px solid ${D.border}`, background: D.card }}>
                  <span style={{ fontSize: 10, color: D.dim }}>⬜</span>
                  <span style={{ fontSize: 11, color: D.muted, flex: 1 }}>Imagem base</span>
                  <Badge label="imutável" color={D.dim} />
                </div>
                {/* Current render */}
                {renderUrl && versions.length > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", borderRadius: 7, border: `1px solid ${D.purple}`, background: `${D.purple}18` }}>
                    <span style={{ fontSize: 10, color: D.purple }}>✦</span>
                    <span style={{ fontSize: 11, color: D.purpleText, flex: 1 }}>{versions[0].label}</span>
                    {versions[0].approvedBy && <Badge label="aprovado" color={D.green} />}
                  </div>
                )}
                {/* Version history */}
                {versions.slice(1).map((v) => (
                  <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 7, border: `1px solid ${D.border}`, background: D.card, opacity: 0.75 }}>
                    <span style={{ fontSize: 10, color: D.dim }}>⧉</span>
                    <span style={{ fontSize: 10, color: D.muted, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.label}</span>
                  </div>
                ))}
                {/* P2-15: selections/masks */}
                {selections.map((sel) => (
                  <div key={sel.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 7, border: `1px solid ${D.amber}44`, background: `${D.amber}08` }}>
                    <span style={{ fontSize: 10, color: D.amber }}>⬚</span>
                    <span style={{ fontSize: 10, color: D.muted, flex: 1 }}>{sel.label || "Seleção"}</span>
                    <button onClick={() => onRemoveSelection(sel.id)} aria-label={`Remover seleção ${sel.label}`} style={{ background: "none", border: "none", color: D.dim, cursor: "pointer", fontSize: 10 }}>✕</button>
                  </div>
                ))}
                {!renderUrl && (
                  <div style={{ fontSize: 11, color: D.dim, textAlign: "center", padding: "8px 0" }}>Camadas visíveis após gerar o render</div>
                )}
              </div>
            )}

            {tab === "propriedades" && (
              <>
                {/* Projeto */}
                {step === "projeto" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <PanelLabel>Selecionar Projeto</PanelLabel>
                    {arq.projectsLoading ? <div style={{ display: "flex", justifyContent: "center", padding: 16 }}><DkSpinner size={20} /></div>
                      : arq.projects.length === 0 ? (
                        <div style={{ textAlign: "center", padding: 16 }}>
                          <p style={{ margin: "0 0 10px", fontSize: 12, color: D.muted }}>Nenhum projeto.</p>
                          <DkBtn small onClick={onShowCreateModal}>+ Criar projeto</DkBtn>
                        </div>
                      ) : arq.projects.map((p: any) => {
                        const active = p.id === arq.projectId;
                        return (
                          <button key={p.id} onClick={() => { void arq.selectProject(p.id); }} style={{ padding: "8px 10px", borderRadius: 7, textAlign: "left", border: `1px solid ${active ? D.purple : D.border}`, background: active ? `${D.purple}22` : D.card, cursor: "pointer" }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: D.text }}>{p.titulo}</div>
                            {p.clienteNome && <div style={{ fontSize: 10, color: D.muted }}>Cliente: {p.clienteNome}</div>}
                          </button>
                        );
                      })
                    }
                    <DkBtn small variant="ghost" onClick={onShowCreateModal}>+ Novo projeto</DkBtn>
                  </div>
                )}

                {/* Ambiente */}
                {step === "ambiente" && (
                  <div className="arqdor-environment-picker" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <PanelLabel>Ambiente</PanelLabel>
                    {AMBIENTE_OPTIONS.map((opt) => (
                      <button key={opt} onClick={() => setAmbiente(opt)} style={{ padding: "7px 10px", borderRadius: 6, textAlign: "left", border: `1px solid ${ambiente === opt ? D.purple : D.border}`, background: ambiente === opt ? `${D.purple}22` : D.card, cursor: "pointer", fontSize: 11, fontWeight: ambiente === opt ? 700 : 400, color: ambiente === opt ? D.purpleText : D.text }}>
                        {opt}
                      </button>
                    ))}
                    <input value={AMBIENTE_OPTIONS.includes(ambiente) ? "" : ambiente} onChange={(e) => setAmbiente(e.target.value)} placeholder="Outro ambiente…" aria-label="Tipo de ambiente personalizado" style={inputStyle} />
                    {ambiente.trim() && <div className="arqdor-env-cta"><DkBtn onClick={onNextStep}>→ Continuar</DkBtn></div>}
                  </div>
                )}

                {/* Imagem */}
                {step === "imagem" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <PanelLabel>Imagem base</PanelLabel>
                    <InfoBox>Ambiente: <strong style={{ color: D.text }}>{ambiente}</strong></InfoBox>
                    {imageDataUrl && <div style={{ fontSize: 11, color: D.green, padding: "6px 8px", background: D.greenDim, borderRadius: 6 }}>✓ {imageFile?.name ?? "Imagem base recuperada"}</div>}
                    <DkBtn onClick={onUpload} variant={imageDataUrl ? "secondary" : "primary"}>{imageDataUrl ? "↺ Trocar imagem" : "⬜ Carregar imagem"}</DkBtn>
                    <DkBtn onClick={onOpenMediaLibrary} variant="secondary" disabled={!mediaLibraryAvailable}>▦ Biblioteca de Mídias</DkBtn>
                    {imageDataUrl && <DkBtn onClick={onNextStep}>→ Continuar</DkBtn>}
                  </div>
                )}

                {/* Render */}
                {step === "render" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <PanelLabel>Render IA</PanelLabel>
                    <InfoBox>{arq.projectMeta?.titulo && arq.projectMeta.titulo.trim().toLowerCase() !== ambiente.trim().toLowerCase() ? `${arq.projectMeta.titulo} · ${ambiente}` : ambiente || arq.projectMeta?.titulo || "Ambiente"}</InfoBox>
                    {!renderUrl && !loading && (
                      <>
                        <div style={{ fontSize: 11, color: D.muted, lineHeight: 1.5 }}>Fidelidade automática ativa. Escolha apenas o objetivo principal.</div>
                        <select value={renderPreset} onChange={(e) => setRenderPreset(e.target.value as RenderPreset)} style={inputStyle}>
                          <option value="interior_layout_preserve">Interior · preservar layout</option>
                          <option value="facade_exterior_preserve">Fachada · preservar volumetria</option>
                          <option value="material_detail_enhancer">Detalhe · melhorar materiais</option>
                          <option value="distortion_correction">Corrigir distorções</option>
                          <option value="camera_perspective_lock">Travar câmera e perspectiva</option>
                          <option value="joinery_precision">Marcenaria de precisão</option>
                          <option value="roof_openings_lock">Cobertura e aberturas</option>
                          <option value="lighting_realism">Iluminação realista</option>
                          <option value="landscape_controlled">Paisagismo controlado</option>
                          <option value="pool_water_fidelity">Piscina e água</option>
                        </select>
                        <div style={{ fontSize: 11, color: D.muted, lineHeight: 1.5 }}>Tempo estimado: 30–90 segundos</div>
                        <DkBtn onClick={onStartRender} disabled={loading}>✦ Gerar Render com IA</DkBtn>
                      </>
                    )}
                    {loading && <div style={{ display: "flex", alignItems: "center", gap: 8, color: D.muted, fontSize: 11 }}><DkSpinner size={14} /> Processando…</div>}
                    {renderUrl && !loading && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <div style={{ fontSize: 11, color: D.green, padding: "6px 8px", background: D.greenDim, borderRadius: 6 }}>✓ Render gerado com sucesso</div>
                        <DkBtn variant="secondary" onClick={onStartRender} small>↺ Novo render</DkBtn>
                        <div style={{ display: "flex", flexDirection: "column", gap: 5, padding: "7px 8px", borderRadius: 7, background: D.card, border: `1px solid ${D.border}` }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: D.text }}>🎬 Gerar vídeo de 5s deste render</div>
                          <select value={videoMovement} onChange={(e) => setVideoMovement(e.target.value as VideoMovement)} style={inputStyle}>
                            <option value="cinematic_micro_movement">Movimento cinematográfico suave</option>
                            <option value="zoom_in_soft">Zoom in suave</option>
                            <option value="zoom_out_soft">Zoom out suave</option>
                            <option value="pan_left_soft">Pan para esquerda</option>
                            <option value="pan_right_soft">Pan para direita</option>
                            <option value="tilt_up_soft">Tilt para cima</option>
                            <option value="tilt_down_soft">Tilt para baixo</option>
                            <option value="orbit_left_soft">Órbita leve esquerda</option>
                            <option value="orbit_right_soft">Órbita leve direita</option>
                            <option value="parallax_soft">Parallax suave</option>
                          </select>
                          <DkBtn variant="secondary" onClick={onGenerateVideo5s} disabled={videoGenerating} small>
                            {videoGenerating ? "Gerando vídeo…" : "▶ Gerar vídeo 5s"}
                          </DkBtn>
                          {renderVideoUrl && <a href={renderVideoUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: D.green, textDecoration: "none" }}>✓ Abrir vídeo gerado</a>}
                        </div>
                        <DkBtn onClick={onNextStep}>→ Melhorar</DkBtn>
                        <DkBtn variant="ghost" onClick={onNextStep} small>Pular melhoria →</DkBtn>
                      </div>
                    )}
                  </div>
                )}

                {/* Melhoria — P2-13/14/16/17 */}
                {step === "melhoria" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <PanelLabel>Melhoria / Material</PanelLabel>

                    {/* P2-14: objeto selecionado */}
                    {selections.length > 0 && (
                      <div style={{ padding: "8px 10px", borderRadius: 7, background: `${D.amber}12`, border: `1px solid ${D.amber}44` }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: D.amber, marginBottom: 6 }}>⬚ REGIÃO SELECIONADA</div>
                        {selections.map((sel) => (
                          <div key={sel.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                            <span style={{ fontSize: 11, color: D.text, flex: 1 }}>{sel.label || "Seleção sem nome"}</span>
                            <button onClick={() => onRemoveSelection(sel.id)} aria-label="Remover seleção" style={{ background: "none", border: "none", color: D.dim, cursor: "pointer", fontSize: 10 }}>✕</button>
                          </div>
                        ))}
                      </div>
                    )}

                    {!renderUrl && (
                      <InfoBox>Gere o render primeiro para habilitar melhorias por região.</InfoBox>
                    )}

                    {renderUrl && (
                      <>
                        {/* P2-13: prompt to select region */}
                        {selections.length === 0 && (
                          <div style={{ padding: "8px 10px", borderRadius: 7, background: D.card, border: `1px solid ${D.border}`, fontSize: 11, color: D.muted }}>
                            Clique em <strong style={{ color: D.purpleText }}>⬚ Selecionar</strong> na barra do canvas para marcar a região a alterar, ou descreva a melhoria livremente abaixo.
                          </div>
                        )}

                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {MELHORIA_MODES.map((m) => (
                            <button key={m.id} onClick={() => setMelhoriaMode(m.id)} style={{ padding: "7px 10px", borderRadius: 6, textAlign: "left", border: `1px solid ${melhoriaMode === m.id ? D.purple : D.border}`, background: melhoriaMode === m.id ? `${D.purple}22` : D.card, cursor: "pointer", fontSize: 11, fontWeight: 700, color: melhoriaMode === m.id ? D.purpleText : D.muted, display: "flex", alignItems: "center", gap: 6 }}>
                              <span>{m.icon}</span> {m.label}
                            </button>
                          ))}
                        </div>

                        {/* P2-16: Material library */}
                        {melhoriaMode === "change-material" && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <button onClick={onOpenMaterialLib} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 7, background: D.card, border: `1px solid ${D.border}`, cursor: "pointer", fontSize: 11, color: D.text }}>
                              <span style={{ fontSize: 14 }}>▦</span>
                              {selectedMaterial ? (
                                <><span style={{ fontWeight: 700, flex: 1 }}>{selectedMaterial.nome}</span><span style={{ fontSize: 9, color: D.dim }}>{selectedMaterial.categoria}</span></>
                              ) : (
                                <span style={{ color: D.muted }}>Escolher material do catálogo →</span>
                              )}
                            </button>
                            {selectedMaterial && (
                              <div style={{ fontSize: 10, color: D.dim, padding: "4px 8px", borderRadius: 6, background: D.card, border: `1px solid ${D.border}` }}>
                                {selectedMaterial.fornecedor && <div>Fornecedor: {selectedMaterial.fornecedor}</div>}
                                {selectedMaterial.referencia && <div>Ref: {selectedMaterial.referencia}</div>}
                                <div style={{ marginTop: 2, color: D.amber, fontSize: 9 }}>Vínculo comercial registrado na versão ✓</div>
                              </div>
                            )}
                          </div>
                        )}

                        <textarea value={melhoriaPrompt} onChange={(e: any) => setMelhoriaPrompt(e.target.value)}
                          placeholder={melhoriaMode === "change-material" ? (selectedMaterial ? `Aplicar ${selectedMaterial.nome} na região selecionada…` : "Descreva o material desejado…") : melhoriaMode === "change-lighting" ? "Ex: iluminação natural, tarde, luz suave…" : "Ex: melhorar texturas, sombras, acabamento…"}
                          rows={3} aria-label="Instrução de melhoria" style={{ ...inputStyle, resize: "vertical" }} />

                        {/* P2-17: preservation locks summary */}
                        <div style={{ padding: "6px 8px", borderRadius: 6, background: `${D.green}08`, border: `1px solid ${D.green}22`, fontSize: 10, color: D.green }}>
                          🔒 Preservação ativa: câmera · geometria · vãos · marcenaria fora da seleção
                        </div>

                        <DkBtn disabled={!melhoriaPrompt.trim() || loading} onClick={onApplyMelhoria}>
                          {loading ? "Aplicando…" : "✦ Aplicar melhoria"}
                        </DkBtn>
                        {!loading && <DkBtn variant="ghost" small onClick={onNextStep}>Pular → Ver versões</DkBtn>}
                      </>
                    )}
                  </div>
                )}

                {/* Versão */}
                {step === "versao" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <PanelLabel>Versões ({versions.length})</PanelLabel>
                    {versions.length === 0 ? (
                      <div style={{ fontSize: 11, color: D.muted, textAlign: "center", padding: 12 }}>Nenhuma versão gerada.</div>
                    ) : versions.map((v, i) => (
                      <div key={v.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "7px 8px", borderRadius: 7, border: `1px solid ${v.approvedBy ? D.green : i === 0 ? D.purple : D.border}`, background: v.approvedBy ? `${D.green}12` : i === 0 ? `${D.purple}18` : D.card }}>
                        <img src={normalizeRenderMediaUrl(v.url)} alt={v.label} style={{ width: 52, height: 38, objectFit: "cover", borderRadius: 4 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: v.approvedBy ? D.green : i === 0 ? D.purpleText : D.muted }}>{v.label}</div>
                          {v.parentVersionId && <div style={{ fontSize: 9, color: D.dim }}>↳ versão filha</div>}
                          {v.materialName && <div style={{ fontSize: 9, color: D.dim }}>Material: {v.materialName}</div>}
                          {v.approvedBy && <div style={{ fontSize: 9, color: D.green }}>✓ {v.approvedBy}</div>}
                        </div>
                      </div>
                    ))}
                    <DkBtn onClick={onNextStep}>→ Aprovar render</DkBtn>
                  </div>
                )}

                {/* Aprovar — P2-20 governance */}
                {step === "aprovar" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <PanelLabel>Aprovação</PanelLabel>
                    {approvalRecord ? (
                      <div style={{ padding: "10px", borderRadius: 8, background: D.greenDim, border: `1px solid ${D.green}44` }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: D.green, marginBottom: 6 }}>✓ Render aprovado</div>
                        <div style={{ fontSize: 11, color: D.muted }}><div>Por: <strong style={{ color: D.text }}>{approvalRecord.by}</strong></div><div>Em: {approvalRecord.at.toLocaleDateString("pt-BR")} {approvalRecord.at.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div>{approvalRecord.note && <div>Obs: {approvalRecord.note}</div>}</div>
                      </div>
                    ) : (
                      <>
                        <div style={{ padding: "8px 10px", borderRadius: 7, fontSize: 11, lineHeight: 1.5, background: D.greenDim, border: `1px solid ${D.green}44`, color: D.green }}>
                          ✓ Aprovação libera a especificação técnica e é registrada com autor e data.
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <label style={{ fontSize: 10, fontWeight: 700, color: D.dim, letterSpacing: "0.06em", textTransform: "uppercase" }}>Observação (opcional)</label>
                          <textarea value={approvalNote} onChange={(e: any) => setApprovalNote(e.target.value)} placeholder="Ex: aprovado com ressalva de cor de piso…" rows={2} aria-label="Observação de aprovação" style={{ ...inputStyle, resize: "vertical" }} />
                        </div>
                        <DkBtn disabled={loading} onClick={onApprove} variant="success">
                          {loading ? "Aprovando…" : "✓ Aprovar este render"}
                        </DkBtn>
                      </>
                    )}
                  </div>
                )}

                {/* Especificação — P2-21 */}
                {step === "especificacao" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <PanelLabel>Especificação técnica</PanelLabel>
                    {specDone ? (
                      <>
                        <div style={{ padding: "8px", borderRadius: 7, background: D.greenDim, border: `1px solid ${D.green}44`, color: D.green, fontSize: 11, textAlign: "center" }}>✅ Especificação gerada</div>

                        {/* Medidas do ambiente — preenchimento manual */}
                        <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 9, color: D.muted, marginBottom: 3 }}>Área (m²)</div>
                            <input type="number" min={0} step={0.01} value={areaM2}
                              onChange={(e) => setAreaM2(e.target.value)}
                              onBlur={onSalvarMedidasAmbiente}
                              style={{ width: "100%", padding: "5px 7px", borderRadius: 6, border: `1px solid ${D.border}`, background: D.bg, color: D.text, fontSize: 11 }} />
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 9, color: D.muted, marginBottom: 3 }}>Pé-direito (m)</div>
                            <input type="number" min={0} step={0.01} value={peDireitoM}
                              onChange={(e) => setPeDireitoM(e.target.value)}
                              onBlur={onSalvarMedidasAmbiente}
                              style={{ width: "100%", padding: "5px 7px", borderRadius: 6, border: `1px solid ${D.border}`, background: D.bg, color: D.text, fontSize: 11 }} />
                          </div>
                        </div>

                        {specData.map((item, i) => (
                          <div key={i} style={{ padding: "7px 9px", borderRadius: 7, background: D.card, border: `1px solid ${D.border}`, fontSize: 11 }}>
                            <div style={{ fontWeight: 700, color: D.text, marginBottom: 2 }}>{item.nome ?? `Item ${i + 1}`}</div>
                            {item.material && <div style={{ fontSize: 10, color: D.muted }}>Material: {item.material}</div>}
                            {item.quantidade && <div style={{ fontSize: 10, color: D.muted }}>Qtd: {item.quantidade}</div>}
                            {/* Dimensões do item — preenchimento manual */}
                            {item.id && (
                              <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                                {(["larguraCm", "alturaCm", "profundidadeCm"] as const).map((campo) => (
                                  <input key={campo} type="number" min={0} step={0.5}
                                    placeholder={campo === "larguraCm" ? "L cm" : campo === "alturaCm" ? "A cm" : "P cm"}
                                    defaultValue={item[campo] ?? ""}
                                    onBlur={(e) => onSalvarMedidasItem(item.id, { [campo]: e.target.value || undefined })}
                                    style={{ width: 0, flex: 1, padding: "4px 5px", borderRadius: 5, border: `1px solid ${D.border}`, background: D.bg, color: D.text, fontSize: 10 }} />
                                ))}
                              </div>
                            )}
                            {/* P2-21: source attribution */}
                            <div style={{ marginTop: 4 }}>
                              <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: item.confirmedByUser ? `${D.green}22` : `${D.amber}22`, color: item.confirmedByUser ? D.green : D.amber, border: `1px solid ${item.confirmedByUser ? D.green : D.amber}44` }}>
                                {item.confirmedByUser ? "✓ Confirmado pelo usuário" : "~ Inferência IA"}
                              </span>
                            </div>
                          </div>
                        ))}
                        {/* P2-22: export */}
                        <DkBtn variant="secondary" small onClick={() => {
                          const content = JSON.stringify(specData, null, 2);
                          const blob = new Blob([content], { type: "application/json" });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url; a.download = `especificacao-${arq.projectMeta?.titulo ?? "arqdor"}-${new Date().toISOString().split("T")[0]}.json`;
                          a.click(); URL.revokeObjectURL(url);
                        }}>⬇ Exportar especificação</DkBtn>
                        {specificationId && (
                          <DkBtn disabled={enviandoOrcamento} onClick={onEnviarOrcamento}>
                            {enviandoOrcamento ? "Enviando…" : "→ Enviar para Orçamento"}
                          </DkBtn>
                        )}
                        {orcamentoMsg && (
                          <div style={{ padding: "8px", borderRadius: 7, background: D.greenDim, border: `1px solid ${D.green}44`, color: D.green, fontSize: 11, textAlign: "center" }}>✅ {orcamentoMsg}</div>
                        )}
                      </>
                    ) : (
                      <>
                        <div style={{ fontSize: 11, color: D.muted, lineHeight: 1.5 }}>✦ Extrai materiais, acabamentos e objetos do render aprovado.</div>
                        <DkBtn disabled={loading} onClick={onSendToSpec}>{loading ? "Gerando…" : "✦ Gerar especificação"}</DkBtn>
                      </>
                    )}
                  </div>
                )}

                {err && <DkErr msg={err} />}
              </>
            )}
          </div>
          <CopilotPanel
            projectId={arq.projectId}
            step={step}
            selections={selections}
            onTestAction={onTestCopilotAction}
          />
        </div>
      )}
    </div>
  );
}

// ─── Bottom Panel (P3-26 Storyboard, P3-27 Comments, P3-28 History, P3-29 Search) ─

function BottomPanel({ versions, projectId, isOpen, onToggle, eventLog, userName }: {
  versions: RenderVersion[]; projectId: string | null; isOpen: boolean; onToggle: () => void;
  eventLog: EventLogEntry[]; userName: string;
}) {
  const [tab, setTab] = useState<"versoes" | "storyboard" | "comentarios" | "historico">("versoes");
  const [storyboard, setStoryboard] = useState<RenderVersion[]>([]);
  const [comments, setComments] = useState<Record<string, Comment[]>>({});
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});
  const [expandedVersion, setExpandedVersion] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Fonte única do histórico nesta tela: versões persistidas/hidratadas pelo Render Studio.
  // A galeria real continua disponível em seus módulos próprios, mas não participa
  // mais da árvore de versões do editor para evitar duplicação e estados conflitantes.
  const allVersions: RenderVersion[] = versions;
  const filteredVersions = search.trim()
    ? allVersions.filter(v => v.label.toLowerCase().includes(search.toLowerCase()))
    : allVersions;

  function addToStoryboard(v: RenderVersion) {
    if (!storyboard.find(s => s.id === v.id)) setStoryboard(prev => [...prev, v]);
  }
  function moveStoryboardItem(idx: number, dir: -1 | 1) {
    setStoryboard(prev => {
      const arr = [...prev]; const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= arr.length) return prev;
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]]; return arr;
    });
  }

  function addComment(versionId: string) {
    const text = (commentDraft[versionId] ?? "").trim();
    if (!text) return;
    const c: Comment = { id: crypto.randomUUID(), text, author: userName, timestamp: new Date() };
    setComments(prev => ({ ...prev, [versionId]: [...(prev[versionId] ?? []), c] }));
    setCommentDraft(prev => ({ ...prev, [versionId]: "" }));
  }

  const TABS = ["versoes", "storyboard", "comentarios", "historico"] as const;
  const tabLabels: Record<string, string> = { versoes: "Versões", storyboard: "Storyboard", comentarios: "Comentários", historico: "Histórico" };

  return (
    <div className="arqdor-legacy-bottom-panel" style={{ flexShrink: 0, borderTop: `1px solid ${D.border}`, background: D.surface, display: "flex", flexDirection: "column", overflow: "hidden", transition: "height 0.2s", height: isOpen ? 188 : 36 }}>
      <div style={{ display: "flex", alignItems: "center", borderBottom: isOpen ? `1px solid ${D.border}` : "none", padding: "0 12px", height: 36, flexShrink: 0 }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} aria-selected={tab === t} style={{ padding: "6px 14px", fontSize: 10, fontWeight: tab === t ? 700 : 400, color: tab === t ? D.purpleText : D.muted, background: "none", border: "none", borderBottom: tab === t ? `2px solid ${D.purple}` : "2px solid transparent", cursor: "pointer", letterSpacing: "0.03em", marginBottom: -1, whiteSpace: "nowrap" }}>
            {tabLabels[t]}
            {t === "comentarios" && Object.values(comments).flat().length > 0 && (
              <span style={{ marginLeft: 4, fontSize: 9, background: D.purple, color: "#fff", padding: "1px 4px", borderRadius: 8 }}>{Object.values(comments).flat().length}</span>
            )}
            {t === "historico" && eventLog.length > 0 && (
              <span style={{ marginLeft: 4, fontSize: 9, background: D.dim, color: "#fff", padding: "1px 4px", borderRadius: 8 }}>{eventLog.length}</span>
            )}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        {/* P3-29: search filter */}
        {tab === "versoes" && (
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filtrar versões…"
            aria-label="Filtrar versões" style={{ ...inputStyle, width: 130, fontSize: 10, padding: "3px 8px", marginRight: 8 }} />
        )}
        <button onClick={onToggle} aria-label={isOpen ? "Recolher" : "Expandir"} style={{ padding: "2px 8px", borderRadius: 5, fontSize: 11, background: "none", border: "none", color: D.dim, cursor: "pointer" }}>{isOpen ? "▼" : "▲"}</button>
      </div>

      {isOpen && (
        <div style={{ flex: 1, overflowX: tab !== "historico" && tab !== "comentarios" ? "auto" : "hidden", overflowY: tab === "historico" || tab === "comentarios" ? "auto" : "hidden", padding: "8px 12px" }}>

          {/* P3-29: versões com search */}
          {tab === "versoes" && (
            <div style={{ display: "flex", gap: 8, height: "100%", alignItems: "center" }}>
              {filteredVersions.length === 0 && <div style={{ fontSize: 11, color: D.dim }}>{search ? "Nenhuma versão encontrada." : "Nenhuma versão ainda."}</div>}
              {filteredVersions.map((v, i) => {
                const vComments = comments[v.id] ?? [];
                return (
                  <div key={v.id} onClick={() => setExpandedVersion(expandedVersion === v.id ? null : v.id)} style={{ flexShrink: 0, width: 110, height: 138, background: D.card, border: `1px solid ${v.approvedBy ? D.green : i === 0 ? D.purple : D.border}`, borderRadius: 8, overflow: "hidden", cursor: "pointer", display: "flex", flexDirection: "column" }}>
                    <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
                      <img src={normalizeRenderMediaUrl(v.url)} alt={v.label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      {i === 0 && !v.approvedBy && <div style={{ position: "absolute", top: 4, right: 4, fontSize: 8, fontWeight: 800, background: D.purple, color: "#fff", padding: "2px 5px", borderRadius: 3 }}>ATUAL</div>}
                      {v.approvedBy && <div style={{ position: "absolute", top: 4, right: 4, fontSize: 8, fontWeight: 800, background: D.green, color: "#fff", padding: "2px 5px", borderRadius: 3 }}>✓</div>}
                      {v.parentVersionId && <div style={{ position: "absolute", bottom: 4, left: 4, fontSize: 7, color: D.purpleText }}>↳</div>}
                      {vComments.length > 0 && <div style={{ position: "absolute", bottom: 4, right: 4, fontSize: 8, background: D.amber, color: "#fff", padding: "1px 4px", borderRadius: 8 }}>{vComments.length}</div>}
                    </div>
                    <div style={{ padding: "4px 6px", fontSize: 9, color: D.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.label}</div>
                    {/* P3-26: add to storyboard */}
                    <button onClick={(e) => { e.stopPropagation(); addToStoryboard(v); }} title="Adicionar ao storyboard" style={{ padding: "3px", fontSize: 9, background: "none", border: "none", color: storyboard.find(s => s.id === v.id) ? D.green : D.dim, cursor: "pointer", borderTop: `1px solid ${D.border}` }}>
                      {storyboard.find(s => s.id === v.id) ? "✓ Story" : "+ Story"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* P3-26: Storyboard funcional */}
          {tab === "storyboard" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, height: "100%" }}>
              {storyboard.length === 0 ? (
                <div style={{ fontSize: 11, color: D.dim, padding: "12px 0" }}>
                  Clique em "+ Story" nas versões para montar a sequência de apresentação.
                </div>
              ) : (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {storyboard.map((v, i) => (
                    <div key={v.id} style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                        <button onClick={() => moveStoryboardItem(i, -1)} disabled={i === 0} style={{ padding: "1px 5px", fontSize: 9, background: D.card, border: `1px solid ${D.border}`, borderRadius: 4, cursor: i === 0 ? "default" : "pointer", color: i === 0 ? D.dim : D.text, opacity: i === 0 ? 0.3 : 1 }}>←</button>
                        <div style={{ width: 90, height: 68, background: D.card, borderRadius: 6, overflow: "hidden", position: "relative", border: `1px solid ${D.border}` }}>
                          <img src={normalizeRenderMediaUrl(v.url)} alt={v.label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          <div style={{ position: "absolute", top: 3, left: 3, fontSize: 8, fontWeight: 800, background: D.purple, color: "#fff", padding: "1px 4px", borderRadius: 3 }}>{i + 1}</div>
                        </div>
                        <button onClick={() => moveStoryboardItem(i, 1)} disabled={i === storyboard.length - 1} style={{ padding: "1px 5px", fontSize: 9, background: D.card, border: `1px solid ${D.border}`, borderRadius: 4, cursor: i === storyboard.length - 1 ? "default" : "pointer", color: i === storyboard.length - 1 ? D.dim : D.text, opacity: i === storyboard.length - 1 ? 0.3 : 1 }}>→</button>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{ fontSize: 9, color: D.dim, maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.label}</span>
                        <button onClick={() => setStoryboard(prev => prev.filter(s => s.id !== v.id))} style={{ fontSize: 8, background: "none", border: "none", color: D.dim, cursor: "pointer" }}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* P3-27: Comentários por versão */}
          {tab === "comentarios" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {allVersions.length === 0 && <div style={{ fontSize: 11, color: D.dim }}>Nenhuma versão gerada.</div>}
              {allVersions.map((v) => {
                const vComments = comments[v.id] ?? [];
                return (
                  <div key={v.id} style={{ display: "flex", flexDirection: "column", gap: 6, padding: "8px 10px", borderRadius: 8, background: D.card, border: `1px solid ${D.border}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <img src={normalizeRenderMediaUrl(v.url)} alt={v.label} style={{ width: 36, height: 26, objectFit: "cover", borderRadius: 4 }} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: D.text, flex: 1 }}>{v.label}</span>
                      <span style={{ fontSize: 9, color: D.dim }}>{vComments.length} coment.</span>
                    </div>
                    {vComments.map(c => (
                      <div key={c.id} style={{ padding: "5px 8px", borderRadius: 6, background: D.surface, border: `1px solid ${D.border}`, fontSize: 11 }}>
                        <div style={{ color: D.text }}>{c.text}</div>
                        <div style={{ fontSize: 9, color: D.dim, marginTop: 2 }}>{c.author} · {c.timestamp.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div>
                      </div>
                    ))}
                    <div style={{ display: "flex", gap: 6 }}>
                      <input value={commentDraft[v.id] ?? ""} onChange={(e) => setCommentDraft(prev => ({ ...prev, [v.id]: e.target.value }))}
                        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") addComment(v.id); }}
                        placeholder="Adicionar comentário…" aria-label="Novo comentário" style={{ ...inputStyle, flex: 1, fontSize: 11, padding: "5px 8px" }} />
                      <button onClick={() => addComment(v.id)} disabled={!(commentDraft[v.id] ?? "").trim()} style={{ padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700, background: D.purple, color: "#fff", border: "none", cursor: "pointer", opacity: !(commentDraft[v.id] ?? "").trim() ? 0.45 : 1 }}>+</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* P3-28: Histórico de eventos */}
          {tab === "historico" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {eventLog.length === 0 && <div style={{ fontSize: 11, color: D.dim, padding: "8px 0" }}>Nenhum evento registrado ainda.</div>}
              {[...eventLog].reverse().map((e) => (
                <div key={e.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "6px 8px", borderRadius: 7, background: D.card, border: `1px solid ${D.border}` }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, marginTop: 5, background: e.type === "render_created" ? D.purple : e.type === "version_created" ? D.green : e.type === "approved" ? D.green : e.type === "spec_generated" ? D.amber : D.muted }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: D.text }}>{e.label}</div>
                    <div style={{ fontSize: 9, color: D.dim }}>{e.timestamp.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function Footer({ projectTitle, ambiente, saveState, lastSavedAt, onHelp, onShortcuts }: {
  projectTitle: string | null; ambiente: string; saveState: SaveState; lastSavedAt: Date | null;
  onHelp: () => void; onShortcuts: () => void;
}) {
  const dotColor = saveState === "saved" ? D.green : saveState === "saving" ? D.amber : saveState === "error" ? D.red : D.amber;
  const saveLabel = saveState === "saving" ? "Salvando…" : saveState === "error" ? "Falha ao salvar" : saveState === "unsaved" ? "Alterações locais" : lastSavedAt ? `Salvo às ${lastSavedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : "Salvo automaticamente";
  return (
    <div style={{ height: 28, display: "flex", alignItems: "center", padding: "0 14px", background: D.bg, borderTop: `1px solid ${D.border}`, flexShrink: 0, gap: 16 }}>
      <span role="status" style={{ fontSize: 10, color: D.dim, display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor, display: "inline-block" }} />
        {saveLabel}
      </span>
      {ambiente && <><Sep /><span style={{ fontSize: 10, color: D.dim }}>Ambiente: {ambiente}</span></>}
      {projectTitle && <><Sep /><span style={{ fontSize: 10, color: D.dim }}>{projectTitle}</span></>}
      <div style={{ flex: 1 }} />
      <button onClick={onHelp} aria-label="Abrir ajuda" style={{ fontSize: 10, color: D.muted, background: "none", border: "none", cursor: "pointer", padding: "2px 6px", borderRadius: 4 }}>? Ajuda</button>
      <Sep />
      <button onClick={onShortcuts} aria-label="Atalhos de teclado" style={{ fontSize: 10, color: D.muted, background: "none", border: "none", cursor: "pointer", padding: "2px 6px", borderRadius: 4 }}>⌨ Atalhos</button>
    </div>
  );
}

// ─── Main workspace inner ──────────────────────────────────────────────────────

function RenderStudioInner() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const arq = useArqProject();

  // Core
  const [step, setStep] = useState<Step>("projeto");
  const [ambiente, setAmbiente] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [renderId, setRenderId] = useState<string | null>(null);
  const [renderUrl, setRenderUrl] = useState<string | null>(null);
  const [versions, setVersions] = useState<RenderVersion[]>([]);
  const [approved, setApproved] = useState(false);
  const [specDone, setSpecDone] = useState(false);
  const [specData, setSpecData] = useState<any[]>([]);
  const [specificationId, setSpecificationId] = useState<string | null>(null);
  const [enviandoOrcamento, setEnviandoOrcamento] = useState(false);
  const [orcamentoMsg, setOrcamentoMsg] = useState<string | null>(null);
  const [areaM2, setAreaM2] = useState<string>("");
  const [peDireitoM, setPeDireitoM] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [melhoriaPrompt, setMelhoriaPrompt] = useState("");
  const [melhoriaMode, setMelhoriaMode] = useState<"improve" | "change-material" | "change-lighting">("improve");
  const [renderPreset, setRenderPreset] = useState<RenderPreset>("interior_layout_preserve");
  const [videoMovement, setVideoMovement] = useState<VideoMovement>("cinematic_micro_movement");
  const [videoGenerating, setVideoGenerating] = useState(false);
  const [renderVideoUrl, setRenderVideoUrl] = useState<string | null>(null);

  // P0/P1 modals & UI
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [canvasMode, setCanvasMode] = useState<CanvasMode>("fit");
  const [showGrid, setShowGrid] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [pendingNavStep, setPendingNavStep] = useState<Step | null>(null);
  const [processingStage, setProcessingStage] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isRecovering, setIsRecovering] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [bottomPanelOpen, setBottomPanelOpen] = useState(false);

  useEffect(() => {
    if (step === "versao" && !bottomPanelOpen) setBottomPanelOpen(true);
  }, [step, bottomPanelOpen]);

  // P2 state
  const [selectionMode, setSelectionMode] = useState<"off" | "rect">("off");
  const [selections, setSelections] = useState<SelectionRect[]>([]);
  const [selectedMaterial, setSelectedMaterial] = useState<CatalogItem | null>(null);
  const [showMaterialLib, setShowMaterialLib] = useState(false);
  const [showMediaLibrary, setShowMediaLibrary] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [compareVersionAId, setCompareVersionAId] = useState<string | null>(null);
  const [compareVersionBId, setCompareVersionBId] = useState<string | null>(null);
  const [approvalNote, setApprovalNote] = useState("");
  const [approvalRecord, setApprovalRecord] = useState<ApprovalRecord | null>(null);

  // P3-28: event log
  const [eventLog, setEventLog] = useState<EventLogEntry[]>([]);
  function logEvent(type: string, label: string) {
    setEventLog(prev => [...prev, { id: crypto.randomUUID(), type, label, timestamp: new Date() }]);
  }

  // P3-24: copilot test action handler
  function handleTestCopilotAction(prompt: string) {
    setMelhoriaPrompt(prompt);
    if (step !== "melhoria") go("melhoria");
  }

  const fileRef = useRef<HTMLInputElement>(null);
  const stageTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const userName = (user as any)?.name ?? (user as any)?.email ?? "Usuário";
  const tenantId = (user as any)?.tenantId ?? "";

  // Derived comparison versions
  const compareVersionA = versions.find(v => v.id === compareVersionAId) ?? versions[0] ?? null;
  const compareVersionB = versions.find(v => v.id === compareVersionBId) ?? versions[1] ?? null;

  // When comparison mode activates, default A/B to first two versions
  useEffect(() => {
    if (compareMode && versions.length >= 2) {
      if (!compareVersionAId) setCompareVersionAId(versions[0].id);
      if (!compareVersionBId) setCompareVersionBId(versions[1].id);
    }
  }, [compareMode, versions]);

  // Save state sync
  const prevSavingRef = useRef(false);
  useEffect(() => {
    if (arq.saving && !prevSavingRef.current) setSaveState("saving");
    else if (!arq.saving && prevSavingRef.current) { setSaveState("saved"); setLastSavedAt(new Date()); }
    prevSavingRef.current = arq.saving;
  }, [arq.saving]);

  // Session restore
  useEffect(() => {
    const ss = sessionStorage.getItem(SK.step) as Step | null;
    const sa = sessionStorage.getItem(SK.ambiente);
    const sri = sessionStorage.getItem(SK.renderId);
    const sru = sessionStorage.getItem(SK.renderUrl);
    const sv = sessionStorage.getItem(SK.versions);
    const siu = sessionStorage.getItem(SK.imageUrl);
    if (sa)  setAmbiente(sa);
    if (sri) setRenderId(sri);
    if (sru) setRenderUrl(normalizeRenderMediaUrl(sru));
    if (sv)  try {
      const restored = JSON.parse(sv) as RenderVersion[];
      const normalized = Array.isArray(restored) ? restored.map(normalizeRenderVersion) : [];
      setVersions(normalized);
      const approvedVersion = normalized.find((version) => Boolean(version.approvedBy && version.approvedAt) || version.operationType === "approved");
      if (approvedVersion) {
        const approvedAt = approvedVersion.approvedAt ? new Date(approvedVersion.approvedAt) : new Date();
        setApproved(true);
        setApprovalRecord({
          by: approvedVersion.approvedBy ?? "usuário autenticado",
          at: approvedAt,
          note: approvedVersion.approvalNote ?? "",
        });
        if (ss === "aprovar") setStep("especificacao");
      }
    } catch {}
    if (siu) setImageDataUrl(siu);
    if (ss && ss !== "aprovar") setStep(ss);
    // P1-11: orphan job recovery
    if (sri && !sru) {
      setIsRecovering(true);
      apiGet(`/api/arch/ai-render/${sri}`)
        .then((data) => {
          if (data.status === "concluido" && data.file_available !== false && (data.display_url || data.result_image_url)) {
            const recoveredUrl = data.display_url || data.result_image_url;
            setRenderUrl(normalizeRenderMediaUrl(recoveredUrl));
            const v: RenderVersion = { id: sri, url: normalizeRenderMediaUrl(recoveredUrl), label: "Versão 1 · Original", operationType: "initial", createdAt: new Date() };
            setVersions([v]);
            sessionStorage.setItem(SK.renderUrl, normalizeRenderMediaUrl(recoveredUrl));
            setSaveState("saved"); setLastSavedAt(new Date());
          }
        })
        .catch(() => {}).finally(() => setIsRecovering(false));
    }
  }, []);

  useEffect(() => { sessionStorage.setItem(SK.step, step); }, [step]);
  useEffect(() => { if (ambiente) sessionStorage.setItem(SK.ambiente, ambiente); }, [ambiente]);
  useEffect(() => { if (renderId) sessionStorage.setItem(SK.renderId, renderId); }, [renderId]);
  useEffect(() => { if (renderUrl) sessionStorage.setItem(SK.renderUrl, renderUrl); }, [renderUrl]);
  useEffect(() => { try { sessionStorage.setItem(SK.versions, JSON.stringify(versions)); } catch {} }, [versions]);
  useEffect(() => { if (imageDataUrl) { try { sessionStorage.setItem(SK.imageUrl, imageDataUrl); } catch {} } }, [imageDataUrl]);

  // Elapsed time
  useEffect(() => {
    if (!loading) { setElapsedSeconds(0); return; }
    const i = setInterval(() => setElapsedSeconds(s => s + 1), 1000);
    return () => clearInterval(i);
  }, [loading]);

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (showCreateModal || showHelp || showShortcuts || showMaterialLib) return;
      if (e.key === "?" || e.key === "F1") { e.preventDefault(); setShowHelp(true); }
      if (e.key === "Escape") { setSelectionMode("off"); setCompareMode(false); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showCreateModal, showHelp, showShortcuts, showMaterialLib]);

  const go = useCallback((s: Step) => { setErr(null); setStep(s); }, []);
  useEffect(() => { if (arq.projectId && step === "projeto") go("ambiente"); }, [arq.projectId]);

  // Canvas control clicks (event delegation)
  function handleCanvasControlClick(e: React.MouseEvent<HTMLDivElement>) {
    const action = (e.target as HTMLElement).closest("[data-canvas-action]")?.getAttribute("data-canvas-action");
    if (!action) return;
    if (action === "Ajustar")    { setCanvasMode("fit"); setShowGrid(false); }
    if (action === "1:1")        { setCanvasMode("1to1"); }
    if (action === "Grade")      { setShowGrid(g => !g); }
    if (action === "Selecionar") { setSelectionMode(m => m === "rect" ? "off" : "rect"); }
    if (action === "Comparar")   { setCompareMode(m => !m); }
  }

  // Progress stages
  function startProgressStages() {
    stageTimersRef.current.forEach(clearTimeout);
    stageTimersRef.current = [];
    RENDER_STAGES.forEach(({ label, afterMs }) => {
      const t = setTimeout(() => setProcessingStage(label), afterMs);
      stageTimersRef.current.push(t);
    });
    setProcessingStage(RENDER_STAGES[0].label);
  }
  function clearProgressStages() { stageTimersRef.current.forEach(clearTimeout); stageTimersRef.current = []; setProcessingStage(null); }

  // File handling
  async function handleFileSelect(file: File) {
    if (file.size > 10 * 1024 * 1024) { setErr("Arquivo muito grande. Máximo 10 MB."); return; }
    if (!file.type.startsWith("image/")) { setErr("Formato não suportado. Use JPG, PNG ou WEBP."); return; }
    setErr(null); setImageFile(file);
    const dataUrl = await fileToDataUrl(file);
    setImageDataUrl(dataUrl);
    if (step === "imagem") go("render");
  }
  function handleDragOver(e: React.DragEvent) { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }
  function handleDragLeave() { setIsDragging(false); }
  async function handleDrop(e: React.DragEvent) { e.preventDefault(); e.stopPropagation(); setIsDragging(false); const f = e.dataTransfer.files?.[0]; if (f) await handleFileSelect(f); }
  function handleUpload() { fileRef.current?.click(); }

  function handleMediaLibraryConfirm(assets: MediaPickerAsset[]) {
    const asset = assets.find((item) => item.type === "image");
    if (!asset) return;
    const url = mediaAssetUrl(asset.storageUrl);
    setErr(null);
    setImageFile(null);
    setImageDataUrl(url);
    try { sessionStorage.setItem(SK.imageUrl, url); } catch {}
    logEvent("image_source_selected", "Imagem base selecionada da Biblioteca de Mídias");
    if (step === "imagem") go("render");
  }

  // Start render
  async function startRender() {
    if (!imageDataUrl) { setErr("Carregue uma imagem antes de gerar o render."); return; }
    if (loading) return;
    const previousRenderId = renderId;
    const nextVersionNumber = versions.length + 1;
    setLoading(true); setErr(null); setRenderUrl(null); setRenderId(null); setSaveState("saving");
    startProgressStages();
    try {
      const { render_id } = await apiPost("/api/arch/ai-render", {
        project_id: arq.projectId ?? undefined, original_image_url: imageDataUrl, mode: "preservar",
        ambiente: ambiente.toLowerCase().replace(/\s+/g, "_"),
        render_presets: [renderPreset],
        user_notes: "Preservar absolutamente o projeto, medidas, câmera, perspectiva, layout, marcenaria, circulação, aberturas e proporções.",
      });
      setRenderId(render_id); setProcessingStage("Gerando render…");
      const data = await waitForRenderCompletion(render_id);
      setProcessingStage("Finalizando e salvando versão…");
      const v: RenderVersion = {
        id: render_id,
        url: normalizeRenderMediaUrl(data.result_image_url),
        label: versions.length === 0 ? "Versão 1 · Original" : `Versão ${nextVersionNumber} · Novo render`,
        operationType: "initial",
        parentVersionId: previousRenderId ?? undefined,
        createdAt: new Date(),
      };
      setRenderUrl(normalizeRenderMediaUrl(data.result_image_url));
      setVersions((current) => [v, ...current.filter((item) => item.id !== render_id)]);
      logEvent("render_created", `Render inicial gerado · ${ambiente}`);
      setSaveState("saved"); setLastSavedAt(new Date());
    } catch (e: unknown) { setErr(categorizeError(e)); setSaveState("error"); }
    finally { clearProgressStages(); setLoading(false); }
  }

  async function generateRenderVideo5s() {
    if (!renderId || videoGenerating) return;
    setVideoGenerating(true); setErr(null); setRenderVideoUrl(null);
    try {
      const created = await apiPost(`/api/arch/ai-render/${renderId}/video-5s`, {
        movement: videoMovement,
        aspect_ratio: "16:9",
      });
      const done = await waitForVideoCompletion(created.video_job_id);
      setRenderVideoUrl(done.video_url);
      logEvent("render_video_created", `Vídeo 5s gerado · ${videoMovement}`);
    } catch (e: unknown) {
      setErr(categorizeError(e));
    } finally {
      setVideoGenerating(false);
    }
  }

  // Apply melhoria (P2-17: structured preservation; P2-18: parentVersionId)
  async function applyMelhoria() {
    if (!renderId || !melhoriaPrompt.trim()) return;
    if (loading) return;
    setLoading(true); setErr(null); setSaveState("saving");
    startProgressStages();
    const currentRenderId = renderId;
    try {
      // P2-17: structured preservation policy
      const preservationLocks = {
        camera:         true,
        geometry:       true,
        vãos:           true,
        marcenaria:     true,
        circulacao:     true,
        iluminacao_global: melhoriaMode !== "change-lighting",
        regioes_fora_da_selecao: selections.length > 0,
      };

      const { render_id } = await apiPost(`/api/arch/ai-render/${currentRenderId}/adjust`, {
        ajuste_prompt: [
          melhoriaMode === "change-material" ? "Alteração de material." : null,
          melhoriaMode === "change-lighting" ? "Ajuste de iluminação." : null,
          selectedMaterial ? `Material selecionado: ${selectedMaterial.nome} (${selectedMaterial.categoria}${selectedMaterial.fornecedor ? `, ${selectedMaterial.fornecedor}` : ""}).` : null,
          selections.length > 0 ? `Aplicar somente na região selecionada: ${selections.map(s => s.label || "seleção").join(", ")}.` : null,
          melhoriaPrompt.trim(),
          "Preservar absolutamente medidas, câmera, perspectiva, layout, marcenaria, circulação e proporções. Criar nova versão sem substituir a original.",
        ].filter(Boolean).join(" "),
        mask_zones:       [...selections.map(s => s.label || "selecao"), melhoriaMode === "change-material" ? "material" : ""].filter(Boolean),
        mask_coordinates: selections.length > 0 ? selections.map(s => ({ x: s.x, y: s.y, w: s.w, h: s.h })) : undefined,
        createNewVersion: true,
        preserveGeometry: preservationLocks.geometry,
        preserveCamera:   preservationLocks.camera,
        preservation_policy: preservationLocks,
        parent_render_id: currentRenderId, // P2-18
        material_id:      selectedMaterial?.id,
      });
      const data = await waitForRenderCompletion(render_id);
      const newVersion: RenderVersion = {
        id: render_id, url: normalizeRenderMediaUrl(data.result_image_url),
        label: `Versão ${versions.length + 1} · ${melhoriaMode === "change-material" ? selectedMaterial?.nome ?? "Material" : melhoriaMode === "change-lighting" ? "Iluminação" : "Melhoria"}`,
        operationType: melhoriaMode === "change-material" ? "material" : melhoriaMode === "change-lighting" ? "lighting" : "improve",
        parentVersionId: currentRenderId, // P2-18: imutável, rastreável
        createdAt: new Date(),
        selectionLabel: selections[0]?.label,
        materialId: selectedMaterial?.id,
        materialName: selectedMaterial?.nome,
      };
      setRenderUrl(normalizeRenderMediaUrl(data.result_image_url)); setRenderId(render_id);
      setVersions(v => [newVersion, ...v]);
      logEvent("version_created", `${newVersion.label} criada`);
      // Update comparison B automatically
      if (compareMode) setCompareVersionBId(render_id);
      setSaveState("saved"); setLastSavedAt(new Date());
      setSelections([]); setSelectionMode("off"); setSelectedMaterial(null); setMelhoriaPrompt("");

      // Conecta troca de material com a especificação, se já existir uma
      // gerada — casa a região selecionada (label) com o item de
      // especificação correspondente (por categoria/descrição, comparação
      // solta já que não existe vínculo direto entre seleção e item).
      if (melhoriaMode === "change-material" && selectedMaterial && specificationId && specData.length > 0) {
        const selecaoLabel = (selections[0]?.label ?? "").toLowerCase().trim();
        const itemCorrespondente = selecaoLabel
          ? specData.find((item: any) =>
              item.categoria?.toLowerCase().includes(selecaoLabel) ||
              item.descricao?.toLowerCase().includes(selecaoLabel) ||
              selecaoLabel.includes(item.categoria?.toLowerCase() ?? "__none__"))
          : undefined;

        if (itemCorrespondente?.id) {
          try {
            await apiPatch(`/api/arch/specification/item/${itemCorrespondente.id}`, {
              catalogoItemId: selectedMaterial.id,
              overrideNome: null,
              overrideFornecedor: null,
              overridePreco: null,
              status: "especificado",
            });
            setSpecData(prev => prev.map((item: any) =>
              item.id === itemCorrespondente.id
                ? { ...item, catalogoItemId: selectedMaterial.id, nome: selectedMaterial.nome, material: selectedMaterial.nome, confirmedByUser: true, status: "especificado" }
                : item));
            logEvent("spec_material_synced", `Item "${itemCorrespondente.descricao}" atualizado com material "${selectedMaterial.nome}"`);
          } catch {
            // Não trava o fluxo de render por causa disso — a especificação
            // pode ser corrigida manualmente depois se a sincronização falhar.
          }
        }
      }

      go("versao");
    } catch (e: unknown) { setErr(categorizeError(e)); setSaveState("error"); }
    finally { clearProgressStages(); setLoading(false); }
  }

  // Approve (P2-20: governance)
  async function handleApprove() {
    if (!renderId || !arq.projectId) return;
    setLoading(true); setErr(null); setSaveState("saving");
    try {
      await apiPost(`/api/arch/ai-render/${renderId}/approve`, {
        renderId, projectId: arq.projectId,
        notes: approvalNote || `Aprovado via ARQDOR — ${ambiente}`,
        approvedBy: userName,
      });
      const record: ApprovalRecord = { by: userName, at: new Date(), note: approvalNote };
      setApprovalRecord(record);
      setApproved(true);
      logEvent("approved", `Versão aprovada por ${userName}`);
      // P2-20: mark version as approved
      setVersions(vs => vs.map((v) => v.id === renderId
        ? { ...v, approvedBy: userName, approvedAt: record.at, approvalNote, operationType: "approved" }
        : v));
      setSaveState("saved"); setLastSavedAt(new Date()); go("especificacao");
    } catch (e: unknown) { setErr(categorizeError(e)); setSaveState("error"); }
    finally { setLoading(false); }
  }

  // Send to spec (P2-21: source attribution)
  async function handleSendToSpec() {
    if (!renderId || !arq.projectId || !renderUrl) return;
    setLoading(true); setErr(null); setSaveState("saving");
    try {
      const data = await apiPost(`/api/arch/specification/analyze`, { renderId, projetoId: arq.projectId, imageUrl: renderUrl });
      // P2-21: mark items from material library as user-confirmed
      const materialIds = new Set(versions.map(v => v.materialId).filter(Boolean));
      const specItems = (data.items ?? data.materiais ?? []).map((item: any) => ({
        ...item,
        confirmedByUser: item.materialId ? materialIds.has(item.materialId) : false,
      }));
      setSpecData(specItems); setSpecDone(true);
      setSpecificationId(data.spec?.id ?? null);
      logEvent("spec_generated", `Especificação gerada · ${specItems.length} itens`);
      setSaveState("saved"); setLastSavedAt(new Date());
    } catch (e: unknown) { setErr(categorizeError(e)); setSaveState("error"); }
    finally { setLoading(false); }
  }

  // Medidas manuais (ambiente e item) — não estimadas por IA, preenchidas
  // e salvas pelo usuário na tela de especificação.
  async function handleSalvarMedidasAmbiente() {
    if (!specificationId) return;
    try {
      await apiPatch(`/api/arch/specification/${specificationId}`, {
        areaM2: areaM2 || null,
        peDireitoM: peDireitoM || null,
      });
      logEvent("spec_room_measurements_saved", `Medidas do ambiente salvas (${areaM2 || "?"}m² · pé-direito ${peDireitoM || "?"}m)`);
    } catch (e: unknown) { setErr(categorizeError(e)); }
  }

  async function handleSalvarMedidasItem(itemId: string, patch: { larguraCm?: string; alturaCm?: string; profundidadeCm?: string }) {
    setSpecData(prev => prev.map((item: any) => item.id === itemId ? { ...item, ...patch } : item));
    try {
      await apiPatch(`/api/arch/specification/item/${itemId}`, patch);
    } catch (e: unknown) { setErr(categorizeError(e)); }
  }

  // Enviar especificação pro orçamento — ponte real (antes só existia render
  // → especificação; especificação → orçamento nunca tinha sido conectada).
  async function handleEnviarOrcamento() {
    if (!specificationId) return;
    setEnviandoOrcamento(true); setErr(null); setOrcamentoMsg(null);
    try {
      const data = await apiPost(`/api/arch/specification/${specificationId}/enviar-orcamento`, {});
      logEvent("spec_sent_to_budget", `Especificação enviada pro orçamento · ${data.itensCriados} itens`);
      setOrcamentoMsg(`${data.itensCriados} item(ns) enviado(s) pro orçamento.`);
    } catch (e: unknown) {
      setErr(categorizeError(e));
    } finally {
      setEnviandoOrcamento(false);
    }
  }

  function handleRenderLoadError() {
    if (!renderUrl) return;
    const failedUrl = normalizeRenderMediaUrl(renderUrl);
    setRenderUrl(null);
    setRenderId(null);
    setApproved(false);
    setApprovalRecord(null);
    setCompareMode(false);
    setSelectionMode("off");
    setVersions(prev => prev.filter(v => normalizeRenderMediaUrl(v.url) !== failedUrl));
    sessionStorage.removeItem(SK.renderUrl);
    sessionStorage.removeItem(SK.renderId);
    try {
      const raw = sessionStorage.getItem(SK.versions);
      if (raw) {
        const restored = JSON.parse(raw) as RenderVersion[];
        sessionStorage.setItem(SK.versions, JSON.stringify(
          Array.isArray(restored) ? restored.filter(v => normalizeRenderMediaUrl(v.url) !== failedUrl) : [],
        ));
      }
    } catch {
      sessionStorage.removeItem(SK.versions);
    }
    setErr("A versão antiga aponta para um arquivo que não existe mais no Storage. A referência quebrada foi removida; use a imagem base para gerar uma nova versão.");
    setSaveState("error");
  }

  // P0-4 unified handleNextStep
  function handleNextStep() {
    const si = stepIndex(step); const next = STEPS[si + 1]; if (!next) return;
    if (step === "projeto"  && !arq.projectId)  { setErr("Selecione ou crie um projeto para continuar."); return; }
    if (step === "ambiente" && !ambiente.trim()) { setErr("Selecione ou escreva o tipo de ambiente."); return; }
    if (step === "imagem"   && !imageDataUrl)    { setErr("Carregue uma imagem para continuar."); return; }
    if (step === "render"   && !renderUrl)        { void startRender(); return; }
    if (step === "melhoria")                      { go("versao"); return; }
    if (step === "aprovar")                        { void handleApprove(); return; }
    if (step === "especificacao")                  { void handleSendToSpec(); return; }
    go(next.id);
  }

  // P1-9: step click with confirmation guard
  function handleStepClick(s: Step) {
    if (stepIndex(s) < stepIndex("render") && renderUrl) { setPendingNavStep(s); return; }
    if (s === "aprovar" && approved) { go("especificacao"); return; }
    go(s);
  }

  // P0-1: create project
  async function handleCreateProject(name: string) { await arq.createProject(name); go("ambiente"); }

  // P2-13: handle new selection from canvas
  function handleNewSelection(sel: Omit<SelectionRect, "id" | "label">) {
    const newSel: SelectionRect = { ...sel, id: crypto.randomUUID(), label: `Região ${selections.length + 1}` };
    setSelections(prev => [...prev, newSel]);
    if (step !== "melhoria") go("melhoria");
  }

  return (
    <div className="arqdor-legacy-root" data-arqdor-step={STEPS[stepIndex(step)]?.label ?? step} style={{ height: "100vh", display: "flex", flexDirection: "column", background: D.bg, fontFamily: 'system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', boxSizing: "border-box", overflow: "hidden", color: D.text }}
      onClick={handleCanvasControlClick}>
      <style>{GLOBAL_STYLES}</style>

      {/* Modals */}
      <CreateProjectModal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} onCreate={handleCreateProject} />
      <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} currentStep={step} />
      <ShortcutsModal isOpen={showShortcuts} onClose={() => setShowShortcuts(false)} />
      <MaterialLibraryModal isOpen={showMaterialLib} onClose={() => setShowMaterialLib(false)} onSelect={mat => { setSelectedMaterial(mat); setMelhoriaMode("change-material"); }} />
      {tenantId && (
        <MediaAssetPicker
          tenantId={tenantId}
          open={showMediaLibrary}
          onOpenChange={setShowMediaLibrary}
          allowedTypes={["image"]}
          maxSelection={1}
          title="Escolher imagem base da Biblioteca"
          confirmLabel="Usar como imagem base"
          onConfirm={handleMediaLibraryConfirm}
        />
      )}

      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }}
        onChange={async (e) => { const f = e.target.files?.[0]; if (f) await handleFileSelect(f); e.target.value = ""; }} />

      <Topbar step={step} projectTitle={arq.projectMeta?.titulo ?? null} ambiente={ambiente} onNextStep={handleNextStep} onOpenStudio={() => setLocation("/arch/studio")} userName={userName} onHelp={() => setShowHelp(true)} onShortcuts={() => setShowShortcuts(true)} />

      <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
        <LeftSidebar step={step} projectTitle={arq.projectMeta?.titulo ?? null} onStepClick={handleStepClick} />

        {pendingNavStep && <NavConfirmBanner targetStep={pendingNavStep} onConfirm={() => { go(pendingNavStep); setPendingNavStep(null); }} onCancel={() => setPendingNavStep(null)} />}

        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <CentralCanvas
            step={step} imageDataUrl={imageDataUrl} renderUrl={renderUrl}
            loading={loading} isDragging={isDragging} canvasMode={canvasMode} showGrid={showGrid}
            processingStage={processingStage} elapsedSeconds={elapsedSeconds} isRecovering={isRecovering}
            onUpload={handleUpload} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
            projectTitle={arq.projectMeta?.titulo ?? null} ambiente={ambiente}
            selectionMode={selectionMode} selections={selections}
            onSelection={handleNewSelection} onClearSelection={() => setSelections([])}
            compareMode={compareMode} compareVersionA={compareVersionA} compareVersionB={compareVersionB}
            allVersions={versions}
            onCompareChangeA={(id) => setCompareVersionAId(id)} onCompareChangeB={(id) => setCompareVersionBId(id)}
            onRenderLoadError={handleRenderLoadError}
          />
          <BottomPanel versions={versions} projectId={arq.projectId} isOpen={bottomPanelOpen} onToggle={() => setBottomPanelOpen(o => !o)} eventLog={eventLog} userName={userName} />
        </div>

        <RightPanel
          step={step} arq={arq} ambiente={ambiente}
          setAmbiente={(v) => { setAmbiente(v); setSaveState("unsaved"); }}
          imageFile={imageFile} imageDataUrl={imageDataUrl} renderUrl={renderUrl} versions={versions}
          loading={loading} err={err}
          melhoriaPrompt={melhoriaPrompt} setMelhoriaPrompt={setMelhoriaPrompt}
          melhoriaMode={melhoriaMode} setMelhoriaMode={setMelhoriaMode}
          approved={approved} specDone={specDone} specData={specData}
          specificationId={specificationId} enviandoOrcamento={enviandoOrcamento}
          orcamentoMsg={orcamentoMsg} onEnviarOrcamento={handleEnviarOrcamento}
          areaM2={areaM2} setAreaM2={setAreaM2} peDireitoM={peDireitoM} setPeDireitoM={setPeDireitoM}
          onSalvarMedidasAmbiente={handleSalvarMedidasAmbiente} onSalvarMedidasItem={handleSalvarMedidasItem}
          onNextStep={handleNextStep} onStartRender={startRender}
          onApplyMelhoria={applyMelhoria} onApprove={handleApprove} onSendToSpec={handleSendToSpec}
          renderPreset={renderPreset} setRenderPreset={setRenderPreset}
          videoMovement={videoMovement} setVideoMovement={setVideoMovement}
          videoGenerating={videoGenerating} renderVideoUrl={renderVideoUrl} onGenerateVideo5s={generateRenderVideo5s}
          onShowCreateModal={() => setShowCreateModal(true)} onUpload={handleUpload} onOpenMediaLibrary={() => setShowMediaLibrary(true)} mediaLibraryAvailable={Boolean(tenantId)}
          selections={selections} selectedMaterial={selectedMaterial}
          onOpenMaterialLib={() => setShowMaterialLib(true)}
          onClearSelection={() => setSelections([])}
          onRemoveSelection={(id) => setSelections(prev => prev.filter(s => s.id !== id))}
          approvalRecord={approvalRecord} approvalNote={approvalNote} setApprovalNote={setApprovalNote}
          isOpen={rightPanelOpen} onToggle={() => setRightPanelOpen(o => !o)}
          onTestCopilotAction={handleTestCopilotAction}
        />
      </div>

      <Footer projectTitle={arq.projectMeta?.titulo ?? null} ambiente={ambiente} saveState={saveState} lastSavedAt={lastSavedAt} onHelp={() => setShowHelp(true)} onShortcuts={() => setShowShortcuts(true)} />
    </div>
  );
}

// ─── Page export ───────────────────────────────────────────────────────────────

export default function RenderStudioCore() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 900);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  if (isMobile) {
    return (
      <ArqdorThemeProvider>
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, textAlign: "center", background: "#0f1117", color: "#fff", gap: 16 }}>
          <div style={{ fontSize: 48 }}>🖥️</div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>ARQDOR Render Studio</h1>
          <p style={{ fontSize: 14, opacity: 0.6, maxWidth: 300, lineHeight: 1.6, margin: 0 }}>
            Este módulo requer uma tela maior. Abra em um computador ou tablet para usar todos os recursos do Render Studio.
          </p>
        </div>
      </ArqdorThemeProvider>
    );
  }

  return (
    <ArqdorThemeProvider>
      <WorkspaceProvider>
        <RenderStudioInner />
      </WorkspaceProvider>
    </ArqdorThemeProvider>
  );
}
