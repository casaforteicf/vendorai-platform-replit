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
import type {
  RenderStudioStep as Step,
  RenderStudioCanvasMode as CanvasMode,
  RenderStudioSelectionRect as SelectionRect,
  RenderStudioVersion as RenderVersion,
  RenderStudioEventLogEntry as EventLogEntry,
  RenderStudioPreset as RenderPreset,
  RenderStudioVideoMovement as VideoMovement,
  RenderStudioImprovementMode,
  RenderStudioCatalogItem as CatalogItem,
  RenderStudioApprovalRecord as ApprovalRecord,
} from "./render-studio/renderStudioModel";
import { RENDER_STUDIO_STEPS as STEPS, renderStudioStepIndex as stepIndex } from "./render-studio/renderStudioModel";
import { RenderStudioTopbar as Topbar, RenderStudioSidebar as LeftSidebar } from "./render-studio/RenderStudioNavigation";
import { RenderStudioCanvas as CentralCanvas } from "./render-studio/RenderStudioCanvas";
import { RenderStudioBottomPanel as BottomPanel } from "./render-studio/RenderStudioBottomPanel";
import { RenderStudioFooter as Footer, type RenderStudioSaveState as SaveState } from "./render-studio/RenderStudioFooter";
import { RenderStudioRightPanel as RightPanel } from "./render-studio/RenderStudioRightPanel";
import {
  RenderStudioSpinner as DkSpinner,
  RenderStudioBadge as Badge,
  RenderStudioPanelLabel as PanelLabel,
  RenderStudioInfoBox as InfoBox,
} from "./render-studio/RenderStudioPrimitives";
import { RENDER_STUDIO_THEME as D, RENDER_STUDIO_GLOBAL_STYLES as GLOBAL_STYLES, renderStudioInputStyle as inputStyle } from "./render-studio/renderStudioTheme";
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


// P2-13: selection rect (percentage coords of displayed image)
// P2-16: catalog material

// P2-18: immutable version with parent link
// P2-20: approval record

// P3-25: copilot memory
// P3-27: version comments
// P3-28: event log

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
  const [melhoriaMode, setMelhoriaMode] = useState<RenderStudioImprovementMode>("improve");
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
        ? { ...v, approvedBy: userName, approvedAt: record.at, approvalNote }
        : { ...v, approvedBy: undefined, approvedAt: undefined, approvalNote: undefined }));
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
