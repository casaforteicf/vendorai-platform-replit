import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { RenderStudioCatalogItem as CatalogItem, RenderStudioStep as Step } from "./renderStudioModel";
import { RENDER_STUDIO_STEPS as STEPS } from "./renderStudioModel";
import { renderApiGet as apiGet } from "./renderStudioApi";
import { RENDER_STUDIO_THEME as D, renderStudioInputStyle as inputStyle } from "./renderStudioTheme";
import {
  RenderStudioSpinner as DkSpinner,
  RenderStudioBadge as Badge,
} from "./RenderStudioPrimitives";

// ─── P0-1: CreateProjectModal ─────────────────────────────────────────────────

export function RenderStudioCreateProjectModal({ isOpen, onClose, onCreate }: {
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

export function RenderStudioNavConfirmBanner({ targetStep, onConfirm, onCancel }: { targetStep: Step; onConfirm: () => void; onCancel: () => void }) {
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

export function RenderStudioHelpModal({ isOpen, onClose, currentStep }: { isOpen: boolean; onClose: () => void; currentStep: Step }) {
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

export function RenderStudioShortcutsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
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

export function RenderStudioMaterialLibraryModal({ isOpen, onClose, onSelect }: {
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

