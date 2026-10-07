import { useEffect, useMemo, useRef, useState, type ElementType } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import ImageAdvisorPanel from "@/components/media/ImageAdvisorPanel";
import {
  AudioLines,
  Bot,
  Download,
  FileText,
  Film,
  Folder,
  Grid3X3,
  Image as ImageIcon,
  Link2,
  List,
  Loader2,
  MoreHorizontal,
  Search,
  Sparkles,
  Star,
  Tags,
  Trash2,
  Upload,
  WandSparkles,
  X,
} from "lucide-react";

type MediaType = "image" | "video" | "audio" | "document";
type Filter = "all" | MediaType | "favorites" | "ai";
type SortMode = "newest" | "oldest" | "name";

type MediaAsset = {
  id: string;
  tenantId: string;
  type: MediaType;
  role?: string | null;
  storageUrl: string;
  accessUrl?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  originalFilename?: string | null;
  source?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string | null;
};

const CORE_LIBRARY_CATEGORIES = [
  "Empresa e marca",
  "Produtos do catálogo",
  "Obras e projetos",
  "Equipe",
  "Campanhas",
  "Manuais e documentos",
  "Outras",
];

function authHeaders(json = false): Record<string, string> {
  const token = localStorage.getItem("vendorai_token") ?? "";
  return { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(json ? { "Content-Type": "application/json" } : {}) };
}

function mediaUrl(value: string) {
  return value.startsWith("/objects/") ? `/api/storage${value}` : value;
}

function bytes(value?: number | null) {
  if (!value) return "—";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function inferType(file: File): MediaType | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  if (
    file.type === "application/pdf"
    || file.type === "application/vnd.ms-powerpoint"
    || file.type === "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    || file.name.toLowerCase().endsWith(".ppt")
    || file.name.toLowerCase().endsWith(".pptx")
    || file.type.startsWith("text/")
  ) return "document";
  return null;
}

function label(type: MediaType) {
  return type === "image" ? "Imagem" : type === "video" ? "Vídeo" : type === "audio" ? "Áudio" : "Documento";
}

function folderOf(asset: MediaAsset) {
  const value = asset.metadata?.folderPath;
  return typeof value === "string" && value.trim() ? value.trim() : "Outras";
}

function tagsOf(asset: MediaAsset): string[] {
  const tags = asset.metadata?.tags;
  return Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === "string" && Boolean(tag.trim())) : [];
}

function descriptionOf(asset: MediaAsset) {
  const value = asset.metadata?.description;
  return typeof value === "string" ? value : "";
}

function isFavorite(asset: MediaAsset) {
  return asset.metadata?.favorite === true;
}

function isAiApproved(asset: MediaAsset) {
  return asset.metadata?.aiUsage === "approved";
}

function friendlyName(asset: MediaAsset) {
  const explicit = asset.metadata?.displayName;
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim();
  return (asset.originalFilename || "Mídia sem nome")
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function assetAccessUrl(asset: MediaAsset) {
  return asset.accessUrl || mediaUrl(asset.storageUrl);
}

function Preview({ asset, className = "" }: { asset: MediaAsset; className?: string }) {
  const url = assetAccessUrl(asset);
  if (asset.type === "image") return <img src={url} alt={friendlyName(asset)} className={`h-full w-full object-cover ${className}`} />;
  if (asset.type === "video") return <video src={url} muted playsInline preload="metadata" className={`h-full w-full object-cover ${className}`} />;
  if (asset.type === "audio") return <div className={`flex h-full w-full items-center justify-center bg-slate-950 text-white ${className}`}><AudioLines className="h-12 w-12" /></div>;
  return <div className={`flex h-full w-full flex-col items-center justify-center gap-2 bg-slate-100 text-slate-600 ${className}`}><FileText className="h-12 w-12" /><span className="text-xs font-medium">Documento</span></div>;
}

export default function MediaLibraryV2() {
  const { user, tenantOverride } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [urlOpen, setUrlOpen] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importingUrl, setImportingUrl] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [folder, setFolder] = useState("Todas");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortMode>("newest");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [description, setDescription] = useState("");
  const [tagDraft, setTagDraft] = useState("");

  const inspected = assets.find((asset) => asset.id === inspectedId) ?? null;

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch(`/api/tenants/${tenantId}/media/assets?limit=150`, { headers: authHeaders(), cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Não foi possível carregar a Biblioteca.");
      const next = Array.isArray(body.assets) ? body.assets as MediaAsset[] : [];
      setAssets(next);
      if (inspectedId && !next.some((asset) => asset.id === inspectedId)) setInspectedId(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tente novamente.";
      setLoadError(message);
      toast({ title: "Biblioteca indisponível", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [tenantId]);
  useEffect(() => {
    if (inspected) setDescription(descriptionOf(inspected));
  }, [inspected?.id]);

  const folders = useMemo(() => {
    const counts = new Map<string, number>();
    for (const asset of assets) counts.set(folderOf(asset), (counts.get(folderOf(asset)) ?? 0) + 1);
    const dynamic = Array.from(counts.keys()).filter((item) => !CORE_LIBRARY_CATEGORIES.includes(item)).sort((a, b) => a.localeCompare(b, "pt-BR"));
    return ["Todas", ...CORE_LIBRARY_CATEGORIES, ...dynamic];
  }, [assets]);

  const counts = useMemo(() => ({
    all: assets.length,
    image: assets.filter((asset) => asset.type === "image").length,
    video: assets.filter((asset) => asset.type === "video").length,
    document: assets.filter((asset) => asset.type === "document").length,
    favorites: assets.filter(isFavorite).length,
    ai: assets.filter(isAiApproved).length,
  }), [assets]);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    const next = assets.filter((asset) => {
      if (filter !== "all" && filter !== "favorites" && filter !== "ai" && asset.type !== filter) return false;
      if (filter === "favorites" && !isFavorite(asset)) return false;
      if (filter === "ai" && !isAiApproved(asset)) return false;
      if (folder !== "Todas" && folderOf(asset) !== folder) return false;
      if (!term) return true;
      const haystack = [friendlyName(asset), asset.originalFilename ?? "", descriptionOf(asset), folderOf(asset), ...tagsOf(asset)].join(" ").toLocaleLowerCase("pt-BR");
      return haystack.includes(term);
    });
    next.sort((a, b) => {
      if (sort === "name") return friendlyName(a).localeCompare(friendlyName(b), "pt-BR");
      const av = new Date(a.createdAt ?? 0).getTime();
      const bv = new Date(b.createdAt ?? 0).getTime();
      return sort === "oldest" ? av - bv : bv - av;
    });
    return next;
  }, [assets, filter, folder, search, sort]);

  async function upload(files: FileList | null) {
    if (!files?.length || !tenantId) return;
    setUploading(true);
    let sent = 0;
    try {
      for (const file of Array.from(files)) {
        const type = inferType(file);
        if (!type) continue;
        const request = await fetch(`/api/tenants/${tenantId}/media/assets/request-upload`, {
          method: "POST", headers: authHeaders(true), body: JSON.stringify({ name: file.name, contentType: file.type || "application/octet-stream", type, size: file.size }),
        });
        const prepared = await request.json().catch(() => ({}));
        if (!request.ok) throw new Error(prepared.error || `Falha ao preparar ${file.name}`);
        const put = await fetch(prepared.uploadURL, { method: "PUT", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
        if (!put.ok) throw new Error(`Falha ao enviar ${file.name}`);
        const register = await fetch(`/api/tenants/${tenantId}/media/assets`, {
          method: "POST", headers: authHeaders(true), body: JSON.stringify({
            type, role: "source", source: "upload", storageUrl: prepared.objectPath, originalFilename: file.name, mimeType: file.type || null, fileSize: file.size,
            metadata: { uploadedFrom: "media_library_v2", uploadedAt: new Date().toISOString(), folderPath: folder === "Todas" ? "" : folder },
          }),
        });
        if (!register.ok) throw new Error(`Falha ao registrar ${file.name}`);
        sent += 1;
      }
      toast({ title: `${sent} conteúdo(s) adicionado(s)` });
      await load();
    } catch (error) {
      toast({ title: "Falha no upload", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function importFromUrl() {
    if (!tenantId || !importUrl.trim()) return;
    setImportingUrl(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/media/assets/import-dropbox`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ url: importUrl.trim(), originalFilename: importUrl.split("/").pop() || "documento-importado" }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Falha ao importar conteúdo.");
      setImportUrl("");
      setUrlOpen(false);
      toast({ title: "Conteúdo adicionado à Biblioteca" });
      await load();
    } catch (error) {
      toast({ title: "Falha na importação", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setImportingUrl(false);
    }
  }

  async function patchAsset(asset: MediaAsset, metadataPatch: Record<string, unknown>) {
    setSaving(true);
    try {
      const metadata = { ...(asset.metadata ?? {}), ...metadataPatch };
      const response = await fetch(`/api/tenants/${tenantId}/media/assets/${asset.id}`, {
        method: "PATCH", headers: authHeaders(true), body: JSON.stringify({ metadata }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Não foi possível salvar.");
      setAssets((current) => current.map((item) => item.id === asset.id ? { ...item, metadata } : item));
    } catch (error) {
      toast({ title: "Não foi possível salvar", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function smartClassify(asset: MediaAsset) {
    const name = friendlyName(asset).toLocaleLowerCase("pt-BR");
    let category = folderOf(asset);
    if (category === "Outras") {
      if (/fachada|obra|projeto|planta|ambiente|casa|piscina/.test(name)) category = "Obras e projetos";
      else if (/produto|catálogo|catalogo|material|paleta/.test(name)) category = "Produtos do catálogo";
      else if (/marca|logo|empresa|institucional/.test(name)) category = "Empresa e marca";
      else if (/manual|proposta|contrato|documento/.test(name)) category = "Manuais e documentos";
    }
    const autoTags = Array.from(new Set([
      ...tagsOf(asset),
      asset.type,
      ...name.split(" ").filter((part) => part.length > 4).slice(0, 4),
    ]));
    await patchAsset(asset, {
      folderPath: category,
      tags: autoTags,
      aiUsage: "approved",
      smartClassifiedAt: new Date().toISOString(),
    });
    toast({ title: "Classificação inteligente aplicada" });
  }

  async function smartClassifyVisible() {
    const items = filtered.filter((asset) => !asset.metadata?.smartClassifiedAt).slice(0, 25);
    if (!items.length) {
      toast({ title: "Tudo certo", description: "Os itens visíveis já estão classificados." });
      return;
    }
    for (const asset of items) await smartClassify(asset);
  }

  async function remove(asset: MediaAsset) {
    if (!window.confirm(`Excluir permanentemente “${asset.originalFilename ?? "este conteúdo"}”?`)) return;
    const response = await fetch(`/api/tenants/${tenantId}/media/assets/${asset.id}`, { method: "DELETE", headers: authHeaders() });
    if (!response.ok) { toast({ title: "Não foi possível excluir", variant: "destructive" }); return; }
    setAssets((current) => current.filter((item) => item.id !== asset.id));
    setInspectedId(null);
    toast({ title: "Conteúdo excluído" });
  }

  const stats: Array<{ id: Filter; label: string; value: number; icon: ElementType }> = [
    { id: "all", label: "Tudo", value: counts.all, icon: Grid3X3 },
    { id: "image", label: "Imagens", value: counts.image, icon: ImageIcon },
    { id: "video", label: "Vídeos", value: counts.video, icon: Film },
    { id: "document", label: "Documentos", value: counts.document, icon: FileText },
    { id: "favorites", label: "Favoritos", value: counts.favorites, icon: Star },
    { id: "ai", label: "Conhecimento da IA", value: counts.ai, icon: Sparkles },
  ];

  return (
    <div className="mx-auto w-full max-w-[1700px] px-3 pb-24 pt-4 sm:px-6 lg:px-8">
      <input ref={inputRef} type="file" multiple className="hidden" accept="image/*,video/*,audio/*,.pdf,.txt,.ppt,.pptx,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation" onChange={(event) => void upload(event.target.files)} />

      <header className="mb-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">Biblioteca da Empresa</h1>
            <p className="mt-1 text-sm text-muted-foreground">Conteúdos usados pela equipe e pela IA. Centralize imagens, vídeos, documentos e referências da empresa.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setUrlOpen((value) => !value)} className="inline-flex h-11 items-center gap-2 rounded-xl border bg-background px-4 text-sm font-semibold shadow-sm hover:bg-muted/40">
              <Link2 className="h-4 w-4 text-blue-600" /> Importar por URL
            </button>
            <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading} className="inline-flex h-11 items-center gap-2 rounded-xl bg-orange-500 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-600 disabled:opacity-60">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Adicionar conteúdo
            </button>
          </div>
        </div>

        {urlOpen && (
          <div className="mt-3 flex max-w-2xl gap-2 rounded-2xl border bg-card p-3 shadow-sm">
            <input value={importUrl} onChange={(event) => setImportUrl(event.target.value)} placeholder="Cole a URL temporária do documento" className="h-10 min-w-0 flex-1 rounded-xl border bg-background px-3 text-sm outline-none focus:border-orange-300" />
            <button type="button" onClick={() => void importFromUrl()} disabled={importingUrl || !importUrl.trim()} className="h-10 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white disabled:opacity-50">
              {importingUrl ? "Importando..." : "Importar"}
            </button>
          </div>
        )}

        <div className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          {stats.map(({ id, label: statLabel, value, icon: Icon }) => (
            <button key={id} type="button" onClick={() => setFilter(id)} className={`rounded-2xl border p-3 text-left transition ${filter === id ? "border-orange-400 bg-orange-50 shadow-sm" : "bg-card hover:border-slate-300"}`}>
              <div className="flex items-center justify-between gap-2"><span className={`text-xs font-medium ${filter === id ? "text-orange-600" : "text-muted-foreground"}`}>{statLabel}</span><Icon className={`h-4 w-4 ${id === "ai" ? "text-emerald-600" : id === "favorites" ? "text-amber-500" : "text-blue-600"}`} /></div>
              <p className="mt-1 text-xl font-bold">{loadError ? "—" : value}</p>
            </button>
          ))}
        </div>
      </header>

      <div className={`grid gap-4 ${inspected ? "xl:grid-cols-[240px_minmax(0,1fr)_360px]" : "xl:grid-cols-[240px_minmax(0,1fr)]"}`}>
        <aside className="h-fit rounded-2xl border bg-card p-3 xl:sticky xl:top-4">
          <div className="mb-2 flex items-center justify-between px-1"><h2 className="text-base font-bold">Categorias</h2><span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground">+</span></div>
          <div className="space-y-1">
            {folders.map((item) => {
              const count = item === "Todas" ? assets.length : assets.filter((asset) => folderOf(asset) === item).length;
              return (
                <button key={item} type="button" onClick={() => setFolder(item)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${folder === item ? "bg-orange-50 font-semibold text-orange-600" : "text-slate-600 hover:bg-muted/60"}`}>
                  <Folder className="h-4 w-4 shrink-0" /><span className="min-w-0 flex-1 truncate">{item}</span><span className="text-xs text-muted-foreground">{loadError ? "—" : count}</span>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="min-w-0">
          <div className="rounded-2xl border bg-card p-3">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
              <label className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar na biblioteca (nome, categoria, tipo, descrição...)" className="h-11 w-full rounded-xl border bg-background pl-10 pr-3 text-sm outline-none focus:border-orange-300" />
              </label>
              <select value={folder} onChange={(event) => setFolder(event.target.value)} className="h-11 rounded-xl border bg-background px-3 text-sm lg:w-40">
                {folders.map((item) => <option key={item}>{item}</option>)}
              </select>
              <select value={filter} onChange={(event) => setFilter(event.target.value as Filter)} className="h-11 rounded-xl border bg-background px-3 text-sm lg:w-36">
                <option value="all">Todos os tipos</option>
                <option value="image">Imagens</option>
                <option value="video">Vídeos</option>
                <option value="document">Documentos</option>
                <option value="favorites">Favoritos</option>
                <option value="ai">Conhecimento IA</option>
              </select>
              <select value={sort} onChange={(event) => setSort(event.target.value as SortMode)} className="h-11 rounded-xl border bg-background px-3 text-sm lg:w-40">
                <option value="newest">Mais recentes</option>
                <option value="oldest">Mais antigos</option>
                <option value="name">Nome A–Z</option>
              </select>
              <div className="flex h-11 rounded-xl border bg-background p-1">
                <button type="button" onClick={() => setView("grid")} className={`rounded-lg px-3 ${view === "grid" ? "bg-blue-50 text-blue-600" : "text-muted-foreground"}`}><Grid3X3 className="h-4 w-4" /></button>
                <button type="button" onClick={() => setView("list")} className={`rounded-lg px-3 ${view === "list" ? "bg-blue-50 text-blue-600" : "text-muted-foreground"}`}><List className="h-4 w-4" /></button>
              </div>
            </div>
          </div>

          {!loadError && !loading && assets.length > 0 && (
            <div className="mt-3 flex flex-col gap-2 rounded-2xl border border-violet-200 bg-violet-50/70 p-3 lg:flex-row lg:items-center">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <WandSparkles className="mt-0.5 h-5 w-5 shrink-0 text-violet-600" />
                <div><p className="text-sm font-semibold text-violet-950">Sugestões da IA</p><p className="text-xs text-violet-700">Organize, classifique e prepare os conteúdos para reutilização pelos agentes.</p></div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void smartClassifyVisible()} disabled={saving} className="inline-flex h-9 items-center gap-2 rounded-lg border border-violet-200 bg-white px-3 text-xs font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-50"><Sparkles className="h-3.5 w-3.5" /> Classificar automaticamente</button>
                <button type="button" onClick={() => setFilter("ai")} className="inline-flex h-9 items-center gap-2 rounded-lg border border-violet-200 bg-white px-3 text-xs font-semibold text-violet-700 hover:bg-violet-50"><Tags className="h-3.5 w-3.5" /> Ver conhecimento IA</button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex min-h-[420px] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-orange-500" /></div>
          ) : loadError ? (
            <div className="mt-4 rounded-3xl border border-red-200 bg-red-50 p-10 text-center">
              <Bot className="mx-auto h-10 w-10 text-red-500" />
              <h3 className="mt-3 text-base font-bold text-red-900">Não foi possível carregar a Biblioteca</h3>
              <p className="mx-auto mt-2 max-w-xl text-sm text-red-700">Seus arquivos não foram apagados. Houve uma falha ao consultar a Biblioteca. {loadError}</p>
              <button type="button" onClick={() => void load()} className="mt-5 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700">Tentar novamente</button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="mt-4 rounded-3xl border border-dashed p-10 text-center"><ImageIcon className="mx-auto h-10 w-10 text-muted-foreground" /><p className="mt-3 font-semibold">Nenhum conteúdo encontrado</p><p className="mt-1 text-sm text-muted-foreground">Adicione imagens, vídeos ou documentos, ou ajuste os filtros.</p></div>
          ) : view === "grid" ? (
            <section className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
              {filtered.map((asset) => (
                <article key={asset.id} onClick={() => setInspectedId(asset.id)} className={`group cursor-pointer overflow-hidden rounded-2xl border bg-card transition hover:-translate-y-0.5 hover:shadow-md ${inspectedId === asset.id ? "border-orange-400 ring-2 ring-orange-100" : ""}`}>
                  <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                    <Preview asset={asset} />
                    <div className="absolute left-2 top-2 rounded-md bg-black/60 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur">{asset.type === "document" ? "PDF" : label(asset.type)}</div>
                    {asset.metadata?.smartClassifiedAt ? <div className="absolute bottom-2 left-2 rounded-md bg-violet-600 px-2 py-1 text-[9px] font-bold text-white">Classificado pela IA</div> : isAiApproved(asset) ? <div className="absolute bottom-2 left-2 rounded-md bg-blue-600 px-2 py-1 text-[9px] font-bold text-white">IA</div> : null}
                    <button type="button" onClick={(event) => { event.stopPropagation(); void patchAsset(asset, { favorite: !isFavorite(asset) }); }} className="absolute right-2 top-2 rounded-full bg-white/90 p-1.5 shadow-sm">{isFavorite(asset) ? <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> : <Star className="h-3.5 w-3.5 text-slate-500" />}</button>
                  </div>
                  <div className="p-3"><div className="flex items-start gap-2"><p className="min-w-0 flex-1 truncate text-sm font-semibold">{friendlyName(asset)}</p><MoreHorizontal className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /></div><p className="mt-1 truncate text-xs text-muted-foreground">{folderOf(asset)}</p><p className="mt-2 text-[10px] text-muted-foreground">{asset.createdAt ? new Date(asset.createdAt).toLocaleDateString("pt-BR") : ""}</p></div>
                </article>
              ))}
            </section>
          ) : (
            <section className="mt-3 overflow-hidden rounded-2xl border bg-card">
              {filtered.map((asset) => (
                <button key={asset.id} type="button" onClick={() => setInspectedId(asset.id)} className="flex w-full items-center gap-3 border-b p-3 text-left last:border-0 hover:bg-muted/30">
                  <div className="h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-muted"><Preview asset={asset} /></div>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{friendlyName(asset)}</p><p className="mt-1 text-xs text-muted-foreground">{folderOf(asset)} · {label(asset.type)} · {bytes(asset.fileSize)}</p></div>
                  {isAiApproved(asset) && <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">IA</span>}
                </button>
              ))}
            </section>
          )}
          {!loading && !loadError && <p className="mt-4 text-xs text-muted-foreground">Mostrando {filtered.length} de {assets.length} itens</p>}
        </main>

        {inspected && (
          <aside className="h-fit overflow-hidden rounded-2xl border bg-card shadow-sm xl:sticky xl:top-4">
            <div className="relative aspect-[16/10] overflow-hidden bg-muted"><Preview asset={inspected} /><button type="button" onClick={() => setInspectedId(null)} className="absolute right-3 top-3 rounded-full bg-black/50 p-2 text-white backdrop-blur"><X className="h-4 w-4" /></button></div>
            <div className="space-y-4 p-4">
              <div className="flex items-start gap-2"><div className="min-w-0 flex-1"><h2 className="break-words text-lg font-bold">{friendlyName(inspected)}</h2><div className="mt-2 flex flex-wrap gap-1.5">{inspected.metadata?.smartClassifiedAt && <span className="rounded-full bg-violet-50 px-2 py-1 text-[10px] font-semibold text-violet-700">Classificado pela IA</span>}{isAiApproved(inspected) && <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700">Conhecimento IA</span>}</div></div><button type="button" onClick={() => void patchAsset(inspected, { favorite: !isFavorite(inspected) })}>{isFavorite(inspected) ? <Star className="h-5 w-5 fill-amber-400 text-amber-400" /> : <Star className="h-5 w-5 text-amber-500" />}</button></div>

              <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 text-xs">
                <dt className="text-muted-foreground">Tipo</dt><dd>{label(inspected.type)} {inspected.mimeType ? `(${inspected.mimeType.split("/").pop()?.toUpperCase()})` : ""}</dd>
                <dt className="text-muted-foreground">Categoria</dt><dd>{folderOf(inspected)}</dd>
                <dt className="text-muted-foreground">Tamanho</dt><dd>{bytes(inspected.fileSize)}</dd>
                <dt className="text-muted-foreground">Data</dt><dd>{inspected.createdAt ? new Date(inspected.createdAt).toLocaleString("pt-BR") : "—"}</dd>
                <dt className="text-muted-foreground">Usado pela IA</dt><dd>{isAiApproved(inspected) ? <span className="font-semibold text-emerald-600">● Sim</span> : "Não"}</dd>
              </dl>

              <div>
                <div className="mb-1 flex items-center justify-between"><p className="text-xs font-semibold">Descrição</p></div>
                <textarea value={description} onChange={(event) => setDescription(event.target.value)} onBlur={() => void patchAsset(inspected, { description })} rows={3} placeholder="Descrição do conteúdo e contexto de uso." className="w-full resize-none rounded-xl border bg-background p-3 text-xs outline-none focus:border-orange-300" />
              </div>

              <div className="rounded-xl border border-violet-200 bg-violet-50 p-3">
                <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-violet-600" /><p className="text-xs font-bold text-violet-950">Insights da IA</p></div>
                <p className="mt-2 text-xs leading-relaxed text-violet-800">{descriptionOf(inspected) || "A IA pode classificar este item, sugerir tags e prepará-lo para uso em propostas, campanhas e agentes."}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => void smartClassify(inspected)} className="rounded-lg bg-white px-3 py-2 text-[11px] font-semibold text-violet-700 shadow-sm">Classificar e sugerir tags</button>
                  <button type="button" onClick={() => void patchAsset(inspected, { aiUsage: isAiApproved(inspected) ? "manual" : "approved" })} className="rounded-lg bg-white px-3 py-2 text-[11px] font-semibold text-violet-700 shadow-sm">{isAiApproved(inspected) ? "Remover da IA" : "Usar na IA"}</button>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold">Tags</p>
                <div className="mt-2 flex flex-wrap gap-1.5">{tagsOf(inspected).map((tag) => <button key={tag} type="button" onClick={() => void patchAsset(inspected, { tags: tagsOf(inspected).filter((item) => item !== tag) })} className="rounded-full bg-blue-50 px-2 py-1 text-[10px] text-blue-700">{tag} ×</button>)}</div>
                <div className="mt-2 flex gap-2"><input value={tagDraft} onChange={(event) => setTagDraft(event.target.value)} placeholder="Adicionar tag" className="h-9 min-w-0 flex-1 rounded-lg border bg-background px-3 text-xs" /><button type="button" onClick={() => { if (!tagDraft.trim()) return; void patchAsset(inspected, { tags: Array.from(new Set([...tagsOf(inspected), tagDraft.trim()])) }); setTagDraft(""); }} className="rounded-lg border px-3 text-xs font-medium">+</button></div>
              </div>

              {inspected.type === "image" && (
                <ImageAdvisorPanel tenantId={tenantId} assetId={inspected.id} filename={inspected.originalFilename} canGenerateAi={true} onUpdated={load} />
              )}

              <div className="grid grid-cols-[1fr_auto] gap-2">
                <a href={assetAccessUrl(inspected)} download={inspected.originalFilename ?? undefined} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 text-sm font-semibold text-white hover:bg-orange-600"><Download className="h-4 w-4" /> Baixar</a>
                <button type="button" onClick={() => void remove(inspected)} className="inline-flex h-11 items-center justify-center rounded-xl border border-red-200 px-3 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
              </div>
              {saving && <p className="text-center text-xs text-muted-foreground">Salvando…</p>}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
