import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import ImageAdvisorPanel from "@/components/media/ImageAdvisorPanel";
import {
  Archive,
  AudioLines,
  Bot,
  CheckSquare,
  ChevronRight,
  CircleAlert,
  Clapperboard,
  Download,
  Eraser,
  FileText,
  Film,
  FolderKanban,
  Grid3X3,
  Image as ImageIcon,
  Layers3,
  Link2,
  Loader2,
  Maximize2,
  Music2,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Square,
  Upload,
  WandSparkles,
  X,
} from "lucide-react";

type MediaType = "image" | "video" | "audio" | "document";
type FilterType = "all" | MediaType;
type MediaContextType = "none" | "client" | "event" | "campaign" | "product" | "project" | "other";
type WorkspaceSection = "library" | "projects" | "ai" | "production";

type MediaAsset = {
  id: string;
  tenantId: string;
  projectId?: string | null;
  type: MediaType;
  role?: string | null;
  storageUrl: string;
  mimeType?: string | null;
  fileSize?: number | null;
  originalFilename?: string | null;
  source?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string | null;
};

type MediaProject = { id: string; title: string; kind: string; status: string; updatedAt?: string | null; source?: string | null };
type WorkerStatus = { configured: boolean; ready: boolean; checkedAt: string };
type Capabilities = {
  provider: "vendorai";
  capabilities: Record<string, "ready" | "building">;
  workers?: Partial<Record<"voice" | "lipsync" | "music", WorkerStatus>>;
};
type AssetContext = { type: MediaContextType; label: string };

const CONTEXT_LABELS: Record<MediaContextType, string> = {
  none: "Sem vínculo", client: "Cliente", event: "Evento", campaign: "Campanha", product: "Produto", project: "Obra / Projeto", other: "Outro",
};
const CONTEXT_PLACEHOLDERS: Record<Exclude<MediaContextType, "none">, string> = {
  client: "Nome do cliente", event: "Nome do evento", campaign: "Nome da campanha", product: "Nome do produto", project: "Nome da obra ou projeto", other: "Descrição do vínculo",
};
const TYPE_LABELS: Record<MediaType, string> = { image: "Foto", video: "Vídeo", audio: "Áudio", document: "Arquivo" };

function authHeaders(json = false): Record<string, string> {
  const token = localStorage.getItem("vendorai_token") ?? "";
  return { Authorization: `Bearer ${token}`, ...(json ? { "Content-Type": "application/json" } : {}) };
}
function mediaUrl(storageUrl: string): string { return storageUrl.startsWith("/objects/") ? `/api/storage${storageUrl}` : storageUrl; }
function inferType(file: File): MediaType | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type === "application/pdf" || file.type.startsWith("text/")) return "document";
  return null;
}
function bytes(value?: number | null): string {
  if (!value) return "—";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
function dateLabel(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}
function assetContext(asset: MediaAsset): AssetContext | null {
  const raw = asset.metadata?.context;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const type = typeof record.type === "string" && record.type in CONTEXT_LABELS ? record.type as MediaContextType : "other";
  const label = typeof record.label === "string" ? record.label.trim() : "";
  return label ? { type, label } : null;
}
function sourceLabel(asset: MediaAsset): string {
  if (asset.source === "generated") return "Gerada por IA";
  if (asset.source === "imported") return "Importada";
  if (asset.source === "external") return "Externa";
  return "Upload";
}
function typeIcon(type: MediaType) { return type === "image" ? ImageIcon : type === "video" ? Film : type === "audio" ? AudioLines : FileText; }

export default function MediaCenter() {
  const [, navigate] = useLocation();
  const { user, tenantOverride } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [projects, setProjects] = useState<MediaProject[]>([]);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [section, setSection] = useState<WorkspaceSection>("library");
  const [filter, setFilter] = useState<FilterType>("all");
  const [contextFilter, setContextFilter] = useState<MediaContextType>("none");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [uploadContextType, setUploadContextType] = useState<MediaContextType>("none");
  const [uploadContextLabel, setUploadContextLabel] = useState("");

  const selectedAssets = useMemo(() => assets.filter((asset) => selected.includes(asset.id)), [assets, selected]);
  const selectedImages = selectedAssets.filter((asset) => asset.type === "image");
  const inspected = assets.find((asset) => asset.id === inspectedId) ?? null;

  async function loadAll() {
    if (!tenantId) return;
    setLoading(true);
    try {
      const [assetsRes, projectsRes, capsRes] = await Promise.all([
        fetch(`/api/tenants/${tenantId}/media/assets?limit=150`, { headers: authHeaders() }),
        fetch(`/api/tenants/${tenantId}/media/projects?limit=20`, { headers: authHeaders() }),
        fetch(`/api/tenants/${tenantId}/media-engine/capabilities`, { headers: authHeaders() }),
      ]);
      if (!assetsRes.ok) throw new Error("Não foi possível carregar a biblioteca");
      const assetsBody = await assetsRes.json();
      setAssets(Array.isArray(assetsBody.assets) ? assetsBody.assets : []);
      if (projectsRes.ok) { const body = await projectsRes.json(); setProjects(Array.isArray(body.projects) ? body.projects : []); }
      if (capsRes.ok) setCapabilities(await capsRes.json());
    } catch (error) {
      toast({ title: "Erro ao carregar Mídias", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally { setLoading(false); }
  }
  useEffect(() => { void loadAll(); }, [tenantId]);

  async function uploadFiles(files: FileList | File[]) {
    if (!tenantId || !files.length) return;
    const contextLabel = uploadContextLabel.trim();
    if (uploadContextType !== "none" && !contextLabel) {
      toast({ title: "Informe o vínculo do upload", description: `Preencha ${CONTEXT_LABELS[uploadContextType].toLowerCase()} antes de enviar.`, variant: "destructive" });
      return;
    }
    setUploading(true);
    let success = 0;
    try {
      for (const file of Array.from(files)) {
        const type = inferType(file);
        if (!type) continue;
        const requestRes = await fetch(`/api/tenants/${tenantId}/media/assets/request-upload`, {
          method: "POST", headers: authHeaders(true), body: JSON.stringify({ name: file.name, contentType: file.type || "application/octet-stream", type, size: file.size }),
        });
        const requestBody = await requestRes.json();
        if (!requestRes.ok) throw new Error(requestBody.error || `Falha ao preparar ${file.name}`);
        const uploadRes = await fetch(requestBody.uploadURL, { method: "PUT", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
        if (!uploadRes.ok) throw new Error(`Falha ao enviar ${file.name}`);
        const registerRes = await fetch(`/api/tenants/${tenantId}/media/assets`, {
          method: "POST", headers: authHeaders(true), body: JSON.stringify({
            type, role: "source", source: "upload", storageUrl: requestBody.objectPath, originalFilename: file.name, mimeType: file.type || null, fileSize: file.size,
            metadata: { uploadedFrom: "media_hub", uploadedAt: new Date().toISOString(), ...(uploadContextType !== "none" ? { context: { type: uploadContextType, label: contextLabel } } : {}) },
          }),
        });
        const registerBody = await registerRes.json();
        if (!registerRes.ok) throw new Error(registerBody.error || `Falha ao registrar ${file.name}`);
        success += 1;
      }
      if (success) toast({ title: `${success} arquivo(s) adicionados`, description: uploadContextType !== "none" ? `Vinculados a ${CONTEXT_LABELS[uploadContextType]}: ${contextLabel}.` : "Disponíveis na Biblioteca." });
      setSelected([]); setUploadContextType("none"); setUploadContextLabel(""); await loadAll();
    } catch (error) {
      toast({ title: "Falha no upload", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally { setUploading(false); if (inputRef.current) inputRef.current.value = ""; }
  }

  function toggle(assetId: string) { setSelected((current) => current.includes(assetId) ? current.filter((id) => id !== assetId) : [...current, assetId]); }
  function ready(operation: string): boolean { return capabilities?.capabilities?.[operation] === "ready"; }

  async function runJob(operation: string, context: Record<string, unknown>, title: string) {
    if (!tenantId) return;
    setRunning(operation);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/media-engine/jobs`, { method: "POST", headers: authHeaders(true), body: JSON.stringify({ operation, title, context }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Falha ao iniciar ferramenta");
      toast({ title: "Processamento iniciado", description: `${title} foi enviado ao Media Engine.` });
      window.setTimeout(() => void loadAll(), 3000);
    } catch (error) { toast({ title: "Não foi possível iniciar", description: error instanceof Error ? error.message : undefined, variant: "destructive" }); }
    finally { setRunning(null); }
  }

  async function runNativeImage(operation: "image_resize" | "image_crop" | "image_optimize" | "image_enhance" | "image_convert") {
    const asset = selectedImages[0] ?? (inspected?.type === "image" ? inspected : null);
    if (!asset || !tenantId) return;
    const defaults: Record<string, Record<string, unknown>> = {
      image_resize: { width: 1080, fit: "inside", quality: 90 }, image_crop: { left: 0, top: 0, width: 1080, height: 1080, quality: 90 },
      image_optimize: { width: 1920, fit: "inside", quality: 82, format: "webp" }, image_enhance: { brightness: 1.04, saturation: 1.05, sharpen: 0.8, quality: 92 }, image_convert: { format: "webp", quality: 90 },
    };
    setRunning(operation);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/media-engine/image-tools`, { method: "POST", headers: authHeaders(true), body: JSON.stringify({ assetId: asset.id, operation, title: `${asset.originalFilename || "Imagem"} — ${operation}`, options: defaults[operation] }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Falha no tratamento");
      toast({ title: "Nova versão criada", description: "O original foi preservado." }); await loadAll();
    } catch (error) { toast({ title: "Falha no tratamento", description: error instanceof Error ? error.message : undefined, variant: "destructive" }); }
    finally { setRunning(null); }
  }

  const counts = useMemo(() => ({ all: assets.length, image: assets.filter((a) => a.type === "image").length, video: assets.filter((a) => a.type === "video").length, audio: assets.filter((a) => a.type === "audio").length, document: assets.filter((a) => a.type === "document").length }), [assets]);
  const visible = useMemo(() => assets.filter((asset) => {
    if (filter !== "all" && asset.type !== filter) return false;
    if (sourceFilter !== "all" && asset.source !== sourceFilter) return false;
    const context = assetContext(asset);
    if (contextFilter !== "none" && context?.type !== contextFilter) return false;
    const term = search.trim().toLowerCase();
    return !term || [asset.originalFilename, context?.label, asset.role, sourceLabel(asset), TYPE_LABELS[asset.type]].filter(Boolean).some((value) => String(value).toLowerCase().includes(term));
  }), [assets, filter, sourceFilter, contextFilter, search]);

  const oneImage = selectedImages.length === 1 && selected.length === 1;
  const multiImages = selectedImages.length >= 2 && selectedImages.length === selected.length;
  const productVideoImages = selectedImages.length >= 1 && selectedImages.length <= 8 && selectedImages.length === selected.length;
  const workerCards = [
    { key: "voice" as const, label: "Voz IA", icon: AudioLines }, { key: "lipsync" as const, label: "Lip-sync", icon: Clapperboard }, { key: "music" as const, label: "Música IA", icon: Music2 },
  ];

  return <div className="min-h-screen bg-[#f7f8fa] dark:bg-background">
    <div className="border-b bg-background/95 px-5 py-4 backdrop-blur md:px-7">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div><div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground"><Layers3 className="h-4 w-4" /> Media Hub</div><h1 className="mt-1 text-2xl font-semibold">Mídias</h1><p className="mt-1 text-sm text-muted-foreground">Organize, analise, trate, crie e reutilize toda a mídia do negócio.</p></div>
        <div className="flex flex-wrap gap-2"><button onClick={() => navigate("/content-studio/video")} className="top-btn"><Film className="h-4 w-4" /> Studio de Vídeo</button><button onClick={() => setSection("ai")} className="top-btn"><Sparkles className="h-4 w-4" /> Criar com IA</button><input ref={inputRef} type="file" multiple className="hidden" onChange={(event) => event.target.files && void uploadFiles(event.target.files)} /><button disabled={uploading} onClick={() => inputRef.current?.click()} className="top-btn bg-primary text-primary-foreground">{uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Adicionar mídia</button></div>
      </div>
    </div>

    <div className="grid min-h-[calc(100vh-118px)] grid-cols-1 xl:grid-cols-[220px_minmax(0,1fr)_380px]">
      <aside className="hidden border-r bg-background p-4 xl:block">
        <p className="side-title">Workspace</p>
        {[{ id: "library" as const, label: "Biblioteca", icon: Grid3X3 }, { id: "projects" as const, label: "Projetos", icon: FolderKanban }, { id: "production" as const, label: "Produção", icon: SlidersHorizontal }, { id: "ai" as const, label: "Criar com IA", icon: Bot }].map((item) => { const Icon = item.icon; return <button key={item.id} onClick={() => setSection(item.id)} className={`side-btn ${section === item.id ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground"}`}><Icon className="h-4 w-4" /> {item.label}</button>; })}
        <div className="my-5 border-t" /><p className="side-title">Tipos</p>
        {([ ["all", "Todos", Layers3], ["image", "Fotos", ImageIcon], ["video", "Vídeos", Film], ["audio", "Áudios", AudioLines], ["document", "Arquivos", FileText] ] as const).map(([id, label, Icon]) => <button key={id} onClick={() => { setFilter(id); setSection("library"); }} className={`side-btn justify-between ${filter === id && section === "library" ? "bg-muted font-medium" : "text-muted-foreground"}`}><span className="flex items-center gap-3"><Icon className="h-4 w-4" /> {label}</span><span className="text-xs">{counts[id]}</span></button>)}
        <div className="my-5 border-t" /><div className="rounded-xl border bg-muted/30 p-3"><p className="text-xs font-semibold">Media Engine</p><div className="mt-3 space-y-2">{workerCards.map(({ key, label, icon: Icon }) => { const worker = capabilities?.workers?.[key]; const active = worker?.ready === true; return <div key={key} className="flex items-center justify-between text-xs"><span className="flex items-center gap-2 text-muted-foreground"><Icon className="h-3.5 w-3.5" /> {label}</span><span className={`h-2 w-2 rounded-full ${active ? "bg-emerald-500" : worker?.configured ? "bg-amber-500" : "bg-slate-300"}`} /></div>; })}</div></div>
      </aside>

      <main className="min-w-0 p-4 md:p-6">
        {section === "library" && <>
          <div className="grid gap-3 md:grid-cols-4">{[{ label: "Total", value: counts.all, icon: Archive }, { label: "Fotos", value: counts.image, icon: ImageIcon }, { label: "Vídeos", value: counts.video, icon: Film }, { label: "Áudios", value: counts.audio, icon: AudioLines }].map(({ label, value, icon: Icon }) => <div key={label} className="rounded-2xl border bg-background p-4 shadow-sm"><div className="flex justify-between"><span className="text-xs text-muted-foreground">{label}</span><Icon className="h-4 w-4 text-muted-foreground" /></div><p className="mt-2 text-2xl font-semibold">{value}</p></div>)}</div>
          <div className="mt-5 rounded-2xl border bg-background p-3 shadow-sm"><div className="flex flex-col gap-3 lg:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, cliente, evento, produto..." className="h-10 w-full rounded-xl border bg-muted/20 pl-9 pr-3 text-sm" /></div><select value={contextFilter} onChange={(e) => setContextFilter(e.target.value as MediaContextType)} className="filter-select"><option value="none">Todos os vínculos</option><option value="client">Clientes</option><option value="event">Eventos</option><option value="campaign">Campanhas</option><option value="product">Produtos</option><option value="project">Obras / Projetos</option><option value="other">Outros</option></select><select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className="filter-select"><option value="all">Todas as origens</option><option value="upload">Uploads</option><option value="generated">Geradas por IA</option><option value="imported">Importadas</option><option value="external">Externas</option></select><button onClick={() => void loadAll()} className="top-btn"><RefreshCw className="h-4 w-4" /> Atualizar</button></div></div>
          <div className="mt-4 rounded-2xl border bg-background p-4 shadow-sm">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"><div className="flex flex-wrap items-end gap-2"><div><label className="tiny-label">Vincular novo upload a</label><select value={uploadContextType} onChange={(e) => { const next = e.target.value as MediaContextType; setUploadContextType(next); if (next === "none") setUploadContextLabel(""); }} className="h-9 rounded-lg border bg-background px-3 text-sm">{Object.entries(CONTEXT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>{uploadContextType !== "none" && <div><label className="tiny-label">{CONTEXT_LABELS[uploadContextType]}</label><input value={uploadContextLabel} onChange={(e) => setUploadContextLabel(e.target.value)} placeholder={CONTEXT_PLACEHOLDERS[uploadContextType]} className="h-9 min-w-[220px] rounded-lg border px-3 text-sm" /></div>}</div><p className="text-xs text-muted-foreground">{visible.length} item(ns)</p></div>
            {selected.length > 0 && <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3"><span className="mr-2 text-sm font-semibold">{selected.length} selecionada(s)</span>{oneImage && <><button onClick={() => setInspectedId(selectedImages[0]!.id)} className="action-pill"><WandSparkles className="h-3.5 w-3.5" /> Analisar e melhorar</button><button disabled={!ready("image_remove_background")} onClick={() => void runJob("image_remove_background", { assetId: selectedImages[0]?.id }, "Remover fundo")} className="action-pill"><Eraser className="h-3.5 w-3.5" /> Remover fundo</button><button disabled={!ready("image_variations")} onClick={() => void runJob("image_variations", { assetId: selectedImages[0]?.id, count: 3 }, "Criar variações")} className="action-pill"><Sparkles className="h-3.5 w-3.5" /> Variações</button></>}{multiImages && <><button disabled={!ready("photo_video")} onClick={() => void runJob("photo_video", { assetIds: selectedImages.map((a) => a.id), secondsPerImage: 3, format: "9:16" }, "Criar vídeo com fotos")} className="action-pill"><Film className="h-3.5 w-3.5" /> Criar vídeo</button><button disabled={!ready("media_batch")} onClick={() => void runJob("media_batch", { items: selectedImages.map((a) => ({ assetId: a.id, operation: "image_optimize", options: { width: 1920, fit: "inside", format: "webp", quality: 82 } })) }, "Otimizar imagens")} className="action-pill"><Layers3 className="h-3.5 w-3.5" /> Otimizar lote</button></>}{productVideoImages && <button onClick={() => navigate(`/content-studio/video/produto?mediaAssetIds=${encodeURIComponent(selectedImages.map((a) => a.id).join(","))}`)} className="action-pill"><Film className="h-3.5 w-3.5" /> Vídeo de Produto</button>}<button onClick={() => setSelected([])} className="ml-auto text-xs text-muted-foreground">Limpar</button></div>}
            {loading ? <div className="flex h-64 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando...</div> : visible.length === 0 ? <div className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 p-8 text-center"><ImageIcon className="h-9 w-9 text-muted-foreground" /><h3 className="mt-3 font-semibold">Nenhuma mídia encontrada</h3><button onClick={() => inputRef.current?.click()} className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground">Adicionar mídia</button></div> : <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-4">{visible.map((asset) => { const Icon = typeIcon(asset.type); const context = assetContext(asset); const isSelected = selected.includes(asset.id); return <article key={asset.id} onClick={() => setInspectedId(asset.id)} className={`group overflow-hidden rounded-xl border bg-background shadow-sm hover:shadow-md ${inspectedId === asset.id ? "ring-2 ring-primary/30" : ""} ${isSelected ? "border-primary" : ""}`}><div className="relative aspect-[4/3] bg-muted">{asset.type === "image" ? <img src={mediaUrl(asset.storageUrl)} alt={asset.originalFilename || "Mídia"} className="h-full w-full object-cover" /> : asset.type === "video" ? <video src={mediaUrl(asset.storageUrl)} className="h-full w-full object-cover" muted preload="metadata" /> : <div className="flex h-full items-center justify-center"><Icon className="h-10 w-10 text-muted-foreground" /></div>}<button onClick={(e) => { e.stopPropagation(); toggle(asset.id); }} className="absolute right-2 top-2 rounded-md bg-background/90 p-1.5 shadow-sm">{isSelected ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4 text-muted-foreground" />}</button><span className="absolute bottom-2 left-2 rounded-md bg-black/65 px-2 py-1 text-[10px] font-semibold uppercase text-white">{TYPE_LABELS[asset.type]}</span></div><div className="p-3"><p className="truncate text-sm font-medium">{asset.originalFilename || "Mídia sem nome"}</p><div className="mt-2 flex flex-wrap gap-1.5"><span className="rounded-full bg-muted px-2 py-1 text-[10px] text-muted-foreground">{sourceLabel(asset)}</span>{context && <span className="max-w-full truncate rounded-full bg-primary/10 px-2 py-1 text-[10px] text-primary"><Link2 className="mr-1 inline h-3 w-3" />{CONTEXT_LABELS[context.type]} · {context.label}</span>}</div></div></article>; })}</div>}
          </div>
        </>}

        {section === "projects" && <div className="rounded-2xl border bg-background p-5 shadow-sm"><h2 className="text-lg font-semibold">Projetos de mídia</h2><p className="text-sm text-muted-foreground">Histórico de gerações, edições e composições.</p><div className="mt-5 divide-y rounded-xl border">{projects.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">Nenhum projeto encontrado.</p> : projects.map((project) => <div key={project.id} className="flex items-center gap-4 p-4"><div className="rounded-xl bg-muted p-2.5"><FolderKanban className="h-5 w-5" /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{project.title}</p><p className="text-xs text-muted-foreground">{project.kind} · {project.status} · {dateLabel(project.updatedAt)}</p></div><ChevronRight className="h-4 w-4 text-muted-foreground" /></div>)}</div></div>}
        {section === "production" && <div className="grid gap-4 md:grid-cols-2"><button onClick={() => navigate("/content-studio/video")} className="hub-card"><Film className="h-6 w-6 text-primary" /><h3 className="mt-4 font-semibold">Studio de Vídeo</h3><p className="mt-1 text-sm text-muted-foreground">Editar, compor trilha, legendar e produzir versões.</p></button><button onClick={() => { setSection("library"); setFilter("image"); }} className="hub-card"><WandSparkles className="h-6 w-6 text-violet-600" /><h3 className="mt-4 font-semibold">Studio de Imagem</h3><p className="mt-1 text-sm text-muted-foreground">Análise visual, recomendações, ajustes finos e IA generativa.</p></button></div>}
        {section === "ai" && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[
          { title: "Analisar e melhorar imagem", desc: "A IA diagnostica e sugere melhorias reguláveis.", icon: WandSparkles, active: true, action: () => { setSection("library"); setFilter("image"); } },
          { title: "Fotos → Vídeo", desc: "Transforme várias fotos em vídeo.", icon: Film, active: ready("photo_video"), action: () => { setSection("library"); setFilter("image"); } },
          { title: "Música IA", desc: "Gere trilhas originais.", icon: Music2, active: ready("music_generate"), action: () => navigate("/content-studio/video") },
          { title: "Voz IA", desc: "Síntese com identidade autorizada.", icon: AudioLines, active: ready("voice_synthesize"), action: () => navigate("/content-studio/video") },
          { title: "Vídeo falado", desc: "Voz + rosto + lip-sync autorizados.", icon: Clapperboard, active: ready("avatar_lipsync"), action: () => navigate("/content-studio/video") },
        ].map(({ title, desc, icon: Icon, active, action }) => <button key={title} onClick={action} className="hub-card"><div className="flex justify-between"><Icon className="h-6 w-6 text-primary" /><span className={`rounded-full px-2 py-1 text-[10px] ${active ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{active ? "Disponível" : "Aguardando runtime"}</span></div><h3 className="mt-4 font-semibold">{title}</h3><p className="mt-1 text-sm text-muted-foreground">{desc}</p></button>)}</div>}
      </main>

      <aside className="hidden border-l bg-background xl:block">
        {inspected ? <div className="sticky top-0 max-h-screen overflow-y-auto p-5">
          <div className="flex items-start justify-between gap-3"><div><p className="side-title">Detalhes da mídia</p><h2 className="mt-1 break-words text-base font-semibold">{inspected.originalFilename || "Mídia sem nome"}</h2></div><button onClick={() => setInspectedId(null)} className="rounded-lg p-2 hover:bg-muted"><X className="h-4 w-4" /></button></div>
          <div className="mt-4 overflow-hidden rounded-xl border bg-muted">{inspected.type === "image" ? <img src={mediaUrl(inspected.storageUrl)} alt="Preview" className="max-h-72 w-full object-contain" /> : inspected.type === "video" ? <video controls src={mediaUrl(inspected.storageUrl)} className="max-h-72 w-full bg-black" /> : inspected.type === "audio" ? <div className="p-5"><AudioLines className="mx-auto mb-4 h-9 w-9 text-muted-foreground" /><audio controls src={mediaUrl(inspected.storageUrl)} className="w-full" /></div> : <div className="flex h-48 items-center justify-center"><FileText className="h-10 w-10 text-muted-foreground" /></div>}</div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs"><Info label="Tipo" value={TYPE_LABELS[inspected.type]} /><Info label="Tamanho" value={bytes(inspected.fileSize)} /><Info label="Origem" value={sourceLabel(inspected)} /><Info label="Criado" value={dateLabel(inspected.createdAt)} /></div>
          {assetContext(inspected) && <div className="mt-3 rounded-xl border bg-primary/5 p-3"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Link2 className="h-3.5 w-3.5" /> Vínculo</div><p className="mt-1 text-sm font-medium">{CONTEXT_LABELS[assetContext(inspected)!.type]} · {assetContext(inspected)!.label}</p></div>}
          {inspected.type === "image" && <ImageAdvisorPanel tenantId={tenantId} assetId={inspected.id} filename={inspected.originalFilename} canGenerateAi={ready("image_variations")} onUpdated={loadAll} />}
          <div className="mt-5 border-t pt-4"><p className="mb-3 text-xs font-semibold">Outras ações</p>{inspected.type === "image" && <><div className="grid grid-cols-2 gap-2"><button disabled={!ready("image_remove_background")} onClick={() => void runJob("image_remove_background", { assetId: inspected.id }, "Remover fundo")} className="inspector-action"><Eraser className="h-4 w-4" /> Remover fundo</button><button disabled={!ready("image_variations")} onClick={() => void runJob("image_variations", { assetId: inspected.id, count: 3 }, "Criar variações")} className="inspector-action"><Sparkles className="h-4 w-4" /> Variações</button><button onClick={() => { setSelected([inspected.id]); void runNativeImage("image_resize"); }} className="inspector-action"><Maximize2 className="h-4 w-4" /> Redimensionar</button><button onClick={() => { setSelected([inspected.id]); void runNativeImage("image_optimize"); }} className="inspector-action"><Layers3 className="h-4 w-4" /> Otimizar</button></div><button onClick={() => navigate(`/content-studio/video/produto?mediaAssetIds=${encodeURIComponent(inspected.id)}`)} className="mt-2 wide-action"><Film className="h-4 w-4" /> Usar no Vídeo de Produto <ChevronRight className="ml-auto h-4 w-4" /></button></>}{inspected.type === "video" && <button onClick={() => navigate(`/content-studio/video/edicao?mediaAssetId=${encodeURIComponent(inspected.id)}`)} className="wide-action"><Film className="h-4 w-4" /> Usar no Studio de Vídeo <ChevronRight className="ml-auto h-4 w-4" /></button>}{inspected.type === "audio" && inspected.role === "music" && <button onClick={() => navigate(`/content-studio/video/edicao?musicAssetId=${encodeURIComponent(inspected.id)}`)} className="wide-action"><Music2 className="h-4 w-4" /> Usar como trilha no vídeo <ChevronRight className="ml-auto h-4 w-4" /></button>}{inspected.type === "audio" && inspected.role !== "music" && <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-300">Este áudio não está classificado como trilha musical. Vozes e outros áudios permanecem separados para preservar consentimentos e direitos.</div>}<a href={mediaUrl(inspected.storageUrl)} target="_blank" rel="noreferrer" className="mt-2 wide-action"><Download className="h-4 w-4" /> Abrir arquivo</a></div>
        </div> : <div className="flex min-h-[500px] flex-col items-center justify-center p-8 text-center"><CircleAlert className="h-8 w-8 text-muted-foreground" /><p className="mt-3 text-sm font-medium">Selecione uma mídia</p><p className="mt-1 text-xs text-muted-foreground">Clique em um card para abrir análise, preview e ferramentas.</p></div>}
      </aside>
    </div>

    <style>{`
      .top-btn{display:inline-flex;height:40px;align-items:center;gap:8px;border:1px solid hsl(var(--border));border-radius:12px;padding:0 14px;font-size:14px;font-weight:500;background:hsl(var(--background))}.top-btn:hover{background:hsl(var(--muted))}
      .side-title{padding:0 8px 8px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:hsl(var(--muted-foreground))}.side-btn{margin-bottom:4px;display:flex;width:100%;align-items:center;gap:12px;border-radius:12px;padding:10px 12px;text-align:left;font-size:14px}.side-btn:hover{background:hsl(var(--muted));color:hsl(var(--foreground))}
      .filter-select{height:40px;border:1px solid hsl(var(--border));border-radius:12px;background:hsl(var(--background));padding:0 12px;font-size:14px}.tiny-label{margin-bottom:4px;display:block;font-size:11px;font-weight:500;color:hsl(var(--muted-foreground))}
      .action-pill{display:inline-flex;height:34px;align-items:center;gap:6px;border:1px solid hsl(var(--border));border-radius:10px;background:hsl(var(--background));padding:0 10px;font-size:12px;font-weight:500}.action-pill:hover{background:hsl(var(--muted))}.action-pill:disabled{opacity:.45;cursor:not-allowed}
      .inspector-action{display:flex;min-height:42px;align-items:center;justify-content:center;gap:7px;border:1px solid hsl(var(--border));border-radius:10px;font-size:12px;font-weight:500}.inspector-action:hover{background:hsl(var(--muted))}.inspector-action:disabled{opacity:.45}.wide-action{display:flex;width:100%;align-items:center;gap:8px;border:1px solid hsl(var(--border));border-radius:12px;padding:12px;font-size:14px;font-weight:500}.wide-action:hover{background:hsl(var(--muted))}.hub-card{border:1px solid hsl(var(--border));border-radius:16px;background:hsl(var(--background));padding:24px;text-align:left;box-shadow:0 1px 2px rgba(0,0,0,.04)}.hub-card:hover{border-color:hsl(var(--primary)/.3);box-shadow:0 4px 12px rgba(0,0,0,.06)}
    `}</style>
  </div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-muted/50 p-3"><p className="text-muted-foreground">{label}</p><p className="mt-1 font-medium">{value}</p></div>;
}
