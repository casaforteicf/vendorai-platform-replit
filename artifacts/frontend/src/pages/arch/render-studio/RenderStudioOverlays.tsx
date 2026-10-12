import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
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

type MaterialLibraryImage = {
  id: string;
  storageUrl: string;
  originalFilename?: string | null;
  width?: number | null;
  height?: number | null;
  qualityScore?: string | number | null;
};

type MaterialLibraryItem = {
  id: string;
  nome: string;
  fabricante: string;
  linha: string;
  referencia?: string | null;
  categoria: string;
  subcategoria?: string | null;
  cor?: string | null;
  acabamento?: string | null;
  compartilhamento: "privado" | "parceiros" | "publico";
  status: string;
  primaryImageId?: string | null;
  coverImageUrl?: string | null;
  images: MaterialLibraryImage[];
};

export function RenderStudioMaterialLibraryModal({ isOpen, onClose, onSelect }: {
  isOpen: boolean; onClose: () => void; onSelect: (item: CatalogItem) => void;
}) {
  const [items, setItems] = useState<MaterialLibraryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [categoria, setCategoria] = useState("");
  const [showImporter, setShowImporter] = useState(false);
  const [materialName, setMaterialName] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [line, setLine] = useState("");
  const [reference, setReference] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [materialCategory, setMaterialCategory] = useState("Tecido");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [savingMaterial, setSavingMaterial] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importInfo, setImportInfo] = useState<string | null>(null);
  const [managingMaterial, setManagingMaterial] = useState<MaterialLibraryItem | null>(null);
  const [primaryBusy, setPrimaryBusy] = useState<string | null>(null);
  const [addingReferences, setAddingReferences] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const referenceInputRef = useRef<HTMLInputElement>(null);

  const categorias = ["Tecido", "Madeira", "MDF", "Pedra", "Porcelanato", "Cerâmica", "Pintura", "Metal", "Vidro", "Concreto", "Revestimento", "Outros"];

  async function loadItems() {
    setLoading(true);
    setLoadError(false);
    const params = new URLSearchParams({ limit: "100" });
    if (search) params.set("busca", search);
    if (categoria) params.set("categoria", categoria);
    try {
      const data = await apiGet(`/api/arch/materials?${params}`) as MaterialLibraryItem[];
      setItems(data);
      if (managingMaterial) {
        setManagingMaterial(data.find((item) => item.id === managingMaterial.id) ?? null);
      }
    } catch {
      setItems([]);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isOpen) return;
    void loadItems();
  }, [isOpen, search, categoria]);

  useEffect(() => {
    function k(e: globalThis.KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (managingMaterial) {
        setManagingMaterial(null);
      } else if (showImporter) {
        setShowImporter(false);
        setImportError(null);
      } else {
        onClose();
      }
    }
    if (isOpen) document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [isOpen, onClose, showImporter, managingMaterial]);

  function resetImporter() {
    previews.forEach((url) => URL.revokeObjectURL(url));
    setMaterialName("");
    setManufacturer("");
    setLine("");
    setReference("");
    setSubcategory("");
    setMaterialCategory(categoria || "Tecido");
    setFiles([]);
    setPreviews([]);
    setImportError(null);
    setImportInfo(null);
  }

  function closeImporter() {
    resetImporter();
    setShowImporter(false);
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const incoming = Array.from(e.target.files ?? [])
      .filter((file) => ["image/jpeg", "image/png", "image/webp"].includes(file.type))
      .slice(0, Math.max(0, 5 - files.length));
    if (!incoming.length) {
      e.target.value = "";
      return;
    }
    setFiles((current) => [...current, ...incoming].slice(0, 5));
    setPreviews((current) => [...current, ...incoming.map((file) => URL.createObjectURL(file))].slice(0, 5));
    setImportError(null);
    setImportInfo(null);
    e.target.value = "";
  }

  function removeFile(index: number) {
    const url = previews[index];
    if (url) URL.revokeObjectURL(url);
    setFiles((current) => current.filter((_, i) => i !== index));
    setPreviews((current) => current.filter((_, i) => i !== index));
  }

  async function saveImportedMaterial() {
    const name = materialName.trim();
    const maker = manufacturer.trim();
    const materialLine = line.trim();
    if (!name || !maker || !materialLine || !materialCategory) {
      setImportError("Nome, fabricante, linha e categoria são obrigatórios.");
      return;
    }
    if (!files.length) {
      setImportError("Adicione pelo menos uma imagem do material.");
      return;
    }

    setSavingMaterial(true);
    setImportError(null);
    setImportInfo(null);
    try {
      const token = localStorage.getItem("vendorai_token");
      const createRes = await fetch("/api/arch/materials", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          nome: name,
          fabricante: maker,
          linha: materialLine,
          referencia: reference.trim() || undefined,
          categoria: materialCategory,
          subcategoria: subcategory.trim() || undefined,
          compartilhamento: "publico",
        }),
      });
      const created = await createRes.json() as MaterialLibraryItem & { duplicate?: boolean; error?: string };
      if (!createRes.ok) throw new Error(created.error || "Não foi possível cadastrar o material.");

      const formData = new FormData();
      files.forEach((file) => formData.append("imagens", file));
      const uploadRes = await fetch(`/api/arch/materials/${created.id}/images`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const uploadData = await uploadRes.json() as { error?: string };
      if (!uploadRes.ok) throw new Error(uploadData.error || "Não foi possível importar as imagens.");

      const wasDuplicate = Boolean(created.duplicate);
      resetImporter();
      setShowImporter(false);
      setImportInfo(wasDuplicate
        ? "Material já existia. As novas imagens foram adicionadas ao mesmo cadastro."
        : "Material cadastrado. A melhor imagem foi definida automaticamente como principal.");
      await loadItems();
    } catch (error: unknown) {
      setImportError(error instanceof Error ? error.message : "Falha ao importar material.");
    } finally {
      setSavingMaterial(false);
    }
  }

  async function addReferenceImages(e: ChangeEvent<HTMLInputElement>) {
    if (!managingMaterial) return;
    const newFiles = Array.from(e.target.files ?? []).slice(0, 5);
    e.target.value = "";
    if (!newFiles.length) return;

    const token = localStorage.getItem("vendorai_token");
    setAddingReferences(true);
    setImportError(null);
    try {
      const formData = new FormData();
      newFiles.forEach((file) => formData.append("imagens", file));
      const response = await fetch(`/api/arch/materials/${managingMaterial.id}/images`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível adicionar as novas imagens.");
      setImportInfo("Novas referências adicionadas. A biblioteca reavaliou automaticamente a melhor imagem.");
      await loadItems();
    } catch (error: unknown) {
      setImportError(error instanceof Error ? error.message : "Falha ao adicionar imagens.");
    } finally {
      setAddingReferences(false);
    }
  }

  async function setPrimaryImage(materialId: string, imageId: string) {
    const token = localStorage.getItem("vendorai_token");
    setPrimaryBusy(imageId);
    try {
      const response = await fetch(`/api/arch/materials/${materialId}/primary-image`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ imageId }),
      });
      if (!response.ok) throw new Error("Não foi possível selecionar a imagem principal.");
      await loadItems();
    } catch (error: unknown) {
      setImportError(error instanceof Error ? error.message : "Falha ao selecionar a imagem.");
    } finally {
      setPrimaryBusy(null);
    }
  }

  function imageSrc(url: string) {
    if (/^(https?:|data:|blob:)/.test(url)) return url;
    const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
    return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
  }

  function primaryImage(item: MaterialLibraryItem) {
    return item.images.find((image) => image.id === item.primaryImageId) ?? item.images[0] ?? null;
  }

  function selectMaterial(item: MaterialLibraryItem) {
    const image = primaryImage(item);
    const selectedImageUrl = image?.storageUrl ?? item.coverImageUrl ?? null;
    onSelect({
      id: item.id,
      nome: item.nome,
      categoria: item.categoria,
      fornecedor: item.fabricante,
      referencia: item.referencia ?? undefined,
      imagens: selectedImageUrl ? [selectedImageUrl] : [],
    } as CatalogItem);
    onClose();
  }

  if (!isOpen) return null;

  return (
    <div role="dialog" aria-modal="true" aria-label="Biblioteca de materiais"
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(6,9,17,0.84)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: D.surface, border: `1px solid ${D.border}`, borderRadius: 12, padding: 0, width: 860, maxHeight: "88vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 80px rgba(0,0,0,0.6)", overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${D.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: D.text }}>▦ Biblioteca de Materiais</div>
            <div style={{ marginTop: 2, fontSize: 10, color: D.dim }}>Somente materiais e texturas. Produtos e mobiliário permanecem no Catálogo.</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={() => {
                if (showImporter) closeImporter();
                else {
                  resetImporter();
                  setMaterialCategory(categoria || "Tecido");
                  setShowImporter(true);
                }
              }}
              style={{ padding: "7px 12px", borderRadius: 7, fontSize: 10, fontWeight: 800, background: showImporter ? D.card : D.purple, color: showImporter ? D.text : "#fff", border: `1px solid ${showImporter ? D.border : D.purple}`, cursor: "pointer" }}>
              {showImporter ? "Cancelar importação" : "＋ Importar material"}
            </button>
            <button onClick={onClose} aria-label="Fechar" style={{ background: "none", border: "none", color: D.muted, cursor: "pointer", fontSize: 18, padding: 4 }}>✕</button>
          </div>
        </div>

        {showImporter && (
          <div style={{ padding: "14px 20px", background: D.card, borderBottom: `1px solid ${D.border}`, display: "flex", flexDirection: "column", gap: 10, flexShrink: 0 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", gap: 8 }}>
              <input value={materialName} onChange={(e) => { setMaterialName(e.target.value); setImportError(null); }} placeholder="Nome do material *" aria-label="Nome do material" style={{ ...inputStyle, width: "100%" }} />
              <input value={manufacturer} onChange={(e) => { setManufacturer(e.target.value); setImportError(null); }} placeholder="Fabricante *" aria-label="Fabricante" style={{ ...inputStyle, width: "100%" }} />
              <input value={line} onChange={(e) => { setLine(e.target.value); setImportError(null); }} placeholder="Linha / coleção *" aria-label="Linha" style={{ ...inputStyle, width: "100%" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <select value={materialCategory} onChange={(e) => setMaterialCategory(e.target.value)} aria-label="Categoria do material" style={{ ...inputStyle, width: "100%" }}>
                {categorias.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
              </select>
              <input value={subcategory} onChange={(e) => setSubcategory(e.target.value)} placeholder="Subcategoria" aria-label="Subcategoria" style={{ ...inputStyle, width: "100%" }} />
              <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Referência / código" aria-label="Referência" style={{ ...inputStyle, width: "100%" }} />
            </div>

            <div style={{ padding: "8px 10px", borderRadius: 8, background: D.inputBg, border: `1px solid ${D.border}`, fontSize: 9, color: D.dim, lineHeight: 1.5 }}>
              Qualidade automática: JPG, PNG ou WebP. Imagens abaixo de 1024 px no menor lado não são bloqueadas: o sistema melhora e amplia automaticamente para uso no render, preservando proporção, cores e desenho do material. 2048 px ou mais continua recomendado.
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "stretch", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={files.length >= 5 || savingMaterial}
                style={{ minWidth: 190, padding: "10px 12px", borderRadius: 8, border: `1px dashed ${D.borderLight}`, background: D.inputBg, color: D.text, cursor: files.length >= 5 ? "not-allowed" : "pointer", opacity: files.length >= 5 ? 0.6 : 1, textAlign: "left" }}>
                <div style={{ fontSize: 11, fontWeight: 800 }}>↑ Upload de imagens</div>
                <div style={{ marginTop: 2, fontSize: 9, color: D.dim }}>Até 5 por envio · novas referências podem ser adicionadas depois</div>
              </button>
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={handleFileChange} style={{ display: "none" }} />

              {previews.map((src, index) => (
                <div key={src} style={{ width: 62, height: 62, borderRadius: 8, overflow: "hidden", border: `1px solid ${D.border}`, position: "relative", background: D.inputBg }}>
                  <img src={src} alt={`Prévia ${index + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  <button type="button" onClick={() => removeFile(index)} aria-label={`Remover imagem ${index + 1}`}
                    style={{ position: "absolute", top: 3, right: 3, width: 18, height: 18, borderRadius: 9, border: "none", background: "rgba(0,0,0,0.72)", color: "#fff", fontSize: 10, lineHeight: "18px", cursor: "pointer" }}>✕</button>
                </div>
              ))}

              <button
                type="button"
                onClick={() => void saveImportedMaterial()}
                disabled={savingMaterial || !materialName.trim() || !manufacturer.trim() || !line.trim() || files.length === 0}
                style={{ marginLeft: "auto", alignSelf: "center", minWidth: 132, padding: "9px 12px", borderRadius: 8, fontSize: 10, fontWeight: 800, border: "none", background: D.purple, color: "#fff", cursor: savingMaterial ? "wait" : "pointer", opacity: savingMaterial || !materialName.trim() || !manufacturer.trim() || !line.trim() || files.length === 0 ? 0.55 : 1, display: "flex", justifyContent: "center", alignItems: "center", gap: 6 }}>
                {savingMaterial ? <><DkSpinner size={12} /> Importando…</> : "Salvar material"}
              </button>
            </div>

            {importError && <div role="alert" style={{ fontSize: 10, color: D.red }}>{importError}</div>}
          </div>
        )}

        {importInfo && (
          <div style={{ padding: "8px 20px", borderBottom: `1px solid ${D.border}`, fontSize: 10, color: D.purpleText, background: `${D.purple}12` }}>
            {importInfo}
          </div>
        )}

        {managingMaterial ? (
          <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: D.text }}>{managingMaterial.nome}</div>
                <div style={{ fontSize: 10, color: D.dim }}>{managingMaterial.fabricante} · {managingMaterial.linha} · {managingMaterial.categoria}</div>
                <div style={{ fontSize: 9, color: D.dim, marginTop: 3 }}>Selecione manualmente a melhor referência. A importação nova nunca cria outro material igual.</div>
              </div>
              <div style={{ display: "flex", gap: 7 }}>
                <button onClick={() => referenceInputRef.current?.click()} disabled={addingReferences}
                  style={{ padding: "6px 10px", borderRadius: 7, background: D.purple, color: "#fff", border: "none", cursor: addingReferences ? "wait" : "pointer", fontSize: 10, fontWeight: 800 }}>
                  {addingReferences ? "Enviando…" : "＋ Adicionar imagens"}
                </button>
                <input ref={referenceInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={addReferenceImages} style={{ display: "none" }} />
                <button onClick={() => setManagingMaterial(null)} style={{ padding: "6px 10px", borderRadius: 7, background: D.card, color: D.text, border: `1px solid ${D.border}`, cursor: "pointer", fontSize: 10 }}>← Voltar</button>
              </div>
            </div>
            {importError && <div role="alert" style={{ marginBottom: 10, fontSize: 10, color: D.red }}>{importError}</div>}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
              {managingMaterial.images.map((image) => {
                const isPrimary = image.id === managingMaterial.primaryImageId;
                return (
                  <div key={image.id} style={{ border: `1px solid ${isPrimary ? D.purple : D.border}`, borderRadius: 10, overflow: "hidden", background: D.card }}>
                    <div style={{ height: 130, background: D.inputBg }}>
                      <img src={imageSrc(image.storageUrl)} alt={managingMaterial.nome} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </div>
                    <div style={{ padding: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 9, color: D.dim }}>
                        <span>{image.width ?? "?"} × {image.height ?? "?"} px</span>
                        <span>Qualidade {Math.round(Number(image.qualityScore ?? 0))}%</span>
                      </div>
                      <button
                        onClick={() => void setPrimaryImage(managingMaterial.id, image.id)}
                        disabled={isPrimary || primaryBusy === image.id}
                        style={{ marginTop: 7, width: "100%", padding: "6px 8px", borderRadius: 6, fontSize: 9, fontWeight: 800, border: `1px solid ${isPrimary ? D.purple : D.border}`, background: isPrimary ? `${D.purple}22` : D.inputBg, color: isPrimary ? D.purpleText : D.text, cursor: isPrimary ? "default" : "pointer" }}>
                        {isPrimary ? "✓ Imagem principal" : primaryBusy === image.id ? "Salvando…" : "Definir como melhor imagem"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <>
            <div style={{ padding: "10px 20px", borderBottom: `1px solid ${D.border}`, display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar nome, fabricante ou linha…" aria-label="Buscar material"
                style={{ ...inputStyle, width: 250, flexShrink: 0 }} />
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button onClick={() => setCategoria("")} style={{ padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700, background: !categoria ? `${D.purple}33` : D.card, color: !categoria ? D.purpleText : D.muted, border: `1px solid ${!categoria ? D.purple : D.border}`, cursor: "pointer" }}>Todos</button>
                {categorias.map((cat) => (
                  <button key={cat} onClick={() => setCategoria(cat === categoria ? "" : cat)}
                    style={{ padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700, background: categoria === cat ? `${D.purple}33` : D.card, color: categoria === cat ? D.purpleText : D.muted, border: `1px solid ${categoria === cat ? D.purple : D.border}`, cursor: "pointer" }}>
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
              {loading && <div style={{ display: "flex", justifyContent: "center", padding: 32 }}><DkSpinner size={32} /></div>}
              {!loading && loadError && (
                <div role="alert" style={{ textAlign: "center", padding: 24, color: D.muted }}>
                  <p>Não foi possível carregar a Biblioteca de Materiais.</p>
                  <button type="button" onClick={() => void loadItems()} style={{ marginTop: 12, color: "#4AC59A", cursor: "pointer" }}>Tentar novamente</button>
                </div>
              )}
              {!loading && !loadError && items.length === 0 && (
                <div style={{ textAlign: "center", padding: 32, color: D.muted }}>
                  <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.3 }}>▦</div>
                  <div style={{ fontSize: 13, marginBottom: 4 }}>Nenhum material encontrado</div>
                  <div style={{ fontSize: 11, color: D.dim }}>Importe a primeira textura com fabricante, linha e categoria.</div>
                </div>
              )}
              {!loading && items.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))", gap: 12 }}>
                  {items.map((item) => {
                    const image = primaryImage(item);
                    const coverUrl = image?.storageUrl ?? item.coverImageUrl ?? null;
                    return (
                      <div key={item.id} style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 10, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                        <button onClick={() => selectMaterial(item)} title={item.nome}
                          style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", textAlign: "left", color: "inherit" }}>
                          <div style={{ height: 96, background: D.inputBg, position: "relative", overflow: "hidden" }}>
                            {coverUrl ? (
                              <img src={imageSrc(coverUrl)} alt={item.nome} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            ) : (
                              <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, color: D.dim }}>▦</div>
                            )}
                            <div style={{ position: "absolute", top: 6, right: 6, padding: "2px 5px", borderRadius: 5, background: "rgba(6,9,17,0.78)", color: "#fff", fontSize: 8 }}>
                              {item.images.length > 0 ? `${item.images.length} ref.` : coverUrl ? "capa" : "sem imagem"}
                            </div>
                          </div>
                          <div style={{ padding: "8px 8px 5px" }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: D.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.nome}</div>
                            <div style={{ fontSize: 9, color: D.dim, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.fabricante} · {item.linha}</div>
                            <div style={{ fontSize: 9, color: D.dim }}>{item.categoria}{item.referencia ? ` · ${item.referencia}` : ""}</div>
                          </div>
                        </button>
                        <button onClick={() => setManagingMaterial(item)}
                          style={{ margin: "0 8px 8px", padding: "5px 7px", borderRadius: 6, border: `1px solid ${D.border}`, background: D.inputBg, color: D.muted, cursor: "pointer", fontSize: 9, fontWeight: 700 }}>
                          Gerenciar imagens
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        <div style={{ padding: "9px 20px", borderTop: `1px solid ${D.border}`, flexShrink: 0, display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div style={{ fontSize: 9, color: D.dim }}>O material é salvo automaticamente na Biblioteca de Materiais compartilhada da empresa.</div>
          <div style={{ fontSize: 9, color: D.dim }}>Novas fotos melhoram o mesmo material; a principal pode ser trocada a qualquer momento.</div>
        </div>
      </div>
    </div>
  );
}

