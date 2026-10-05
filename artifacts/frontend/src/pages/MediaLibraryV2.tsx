import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  AudioLines,
  Bot,
  Download,
  FileText,
  Film,
  Folder,
  FolderOpen,
  Grid3X3,
  Image as ImageIcon,
  Loader2,
  MoreHorizontal,
  Search,
  Sparkles,
  Star,
  Trash2,
  Upload,
  X,
} from "lucide-react";

type MediaType = "image" | "video" | "audio" | "document";
type Filter = "all" | MediaType | "favorites" | "ai";

type MediaAsset = {
  id: string;
  tenantId: string;
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

const CORE_LIBRARY_CATEGORIES = [
  "Empresa e marca",
  "Produtos do catálogo",
  "Obras e projetos",
  "Equipe",
  "Campanhas",
  "Redes sociais",
  "Apresentações",
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
  return typeof value === "string" && value.trim() ? value.trim() : "Sem categoria";
}

function tagsOf(asset: MediaAsset): string[] {
  const tags = asset.metadata?.tags;
  return Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === "string" && Boolean(tag.trim())) : [];
}

function descriptionOf(asset: MediaAsset) {
  const value = asset.metadata?.description;
  return typeof value === "string" ? value : "";
}

function libraryFolderOf(asset: MediaAsset) {
  const value = asset.metadata?.libraryFolder;
  return typeof value === "string" && value.trim() ? value.trim() : "Sem pasta";
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
  const raw = (asset.originalFilename || "Mídia sem nome").replace(/\.[^.]+$/, "");
  const scene = raw.match(/video[-_ ]generate[-_ ]scene[-_ ]?(\d+)/i);
  if (scene) return `Cena gerada ${scene[1]}`;
  return raw
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function Preview({ asset, className = "" }: { asset: MediaAsset; className?: string }) {
  const url = mediaUrl(asset.storageUrl);
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
  const [uploading, setUploading] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importingUrl, setImportingUrl] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [folder, setFolder] = useState("Todas as mídias");
  const [search, setSearch] = useState("");
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [description, setDescription] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [moveFolderOpen, setMoveFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const inspected = assets.find((asset) => asset.id === inspectedId) ?? null;

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/media/assets?limit=150`, { headers: authHeaders(), cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Não foi possível carregar a Biblioteca de Mídias.");
      const next = Array.isArray(body.assets) ? body.assets as MediaAsset[] : [];
      setAssets(next);
      if (inspectedId && !next.some((asset) => asset.id === inspectedId)) setInspectedId(null);
    } catch (error) {
      toast({ title: "Biblioteca indisponível", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [tenantId]);
  useEffect(() => {
    if (inspected) setDescription(descriptionOf(inspected));
    setMoveFolderOpen(false);
    setNewFolderName("");
  }, [inspected?.id]);

  const folders = useMemo(() => {
    const counts = new Map<string, number>();
    for (const asset of assets) counts.set(folderOf(asset), (counts.get(folderOf(asset)) ?? 0) + 1);
    const dynamic = Array.from(counts.keys())
      .filter((item) => item !== "Sem categoria" && !CORE_LIBRARY_CATEGORIES.includes(item))
      .sort((a, b) => a.localeCompare(b, "pt-BR"));
    return ["Todas as mídias", ...CORE_LIBRARY_CATEGORIES, ...dynamic];
  }, [assets]);

  const libraryFolders = useMemo(() => {
    return Array.from(new Set(assets.map(libraryFolderOf).filter((item) => item !== "Sem pasta")))
      .sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [assets]);

  const counts = useMemo(() => ({
    all: assets.length,
    image: assets.filter((asset) => asset.type === "image").length,
    video: assets.filter((asset) => asset.type === "video").length,
    ai: assets.filter(isAiApproved).length,
  }), [assets]);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return assets.filter((asset) => {
      if (filter !== "all" && filter !== "favorites" && filter !== "ai" && asset.type !== filter) return false;
      if (filter === "favorites" && !isFavorite(asset)) return false;
      if (filter === "ai" && !isAiApproved(asset)) return false;
      if (folder !== "Todas as mídias" && folderOf(asset) !== folder) return false;
      if (!term) return true;
      const haystack = [friendlyName(asset), asset.originalFilename ?? "", descriptionOf(asset), folderOf(asset), ...tagsOf(asset)].join(" ").toLocaleLowerCase("pt-BR");
      return haystack.includes(term);
    });
  }, [assets, filter, folder, search]);

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
            metadata: { uploadedFrom: "media_library_v2", uploadedAt: new Date().toISOString(), folderPath: folder === "Todas as mídias" ? "" : folder },
          }),
        });
        if (!register.ok) throw new Error(`Falha ao registrar ${file.name}`);
        sent += 1;
      }
      toast({ title: `${sent} mídia(s) adicionada(s)` });
      await load();
    } catch (error) {
      toast({ title: "Falha no upload", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function importPresentationFromUrl() {
    if (!tenantId || !importUrl.trim()) return;
    setImportingUrl(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/media/assets/import-dropbox`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({
          url: importUrl.trim(),
          originalFilename: "VendorAI_MASTER_LOGO_CORRIGIDA_FINAL_V3-1.pptx",
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Falha ao importar apresentação");
      setImportUrl("");
      toast({ title: "Apresentação adicionada à Biblioteca" });
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
    } finally { setSaving(false); }
  }

  async function remove(asset: MediaAsset) {
    if (!window.confirm(`Excluir permanentemente “${asset.originalFilename ?? "esta mídia"}”?`)) return;
    const response = await fetch(`/api/tenants/${tenantId}/media/assets/${asset.id}`, { method: "DELETE", headers: authHeaders() });
    if (!response.ok) { toast({ title: "Não foi possível excluir", variant: "destructive" }); return; }
    setAssets((current) => current.filter((item) => item.id !== asset.id));
    setInspectedId(null);
    toast({ title: "Mídia excluída" });
  }

  const filterTabs: Array<{ id: Filter; label: string; icon: React.ElementType }> = [
    { id: "all", label: "Tudo", icon: Grid3X3 },
    { id: "image", label: "Imagens", icon: ImageIcon },
    { id: "video", label: "Vídeos", icon: Film },
    { id: "document", label: "Documentos", icon: FileText },
    { id: "favorites", label: "Favoritos", icon: Star },
    { id: "ai", label: "Base IA", icon: Sparkles },
  ];

  return (
    <div className="mx-auto w-full max-w-[1500px] px-3 pb-24 pt-4 sm:px-6 lg:px-8">
      <input ref={inputRef} type="file" multiple className="hidden" accept="image/*,video/*,audio/*,.pdf,.txt,.ppt,.pptx,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation" onChange={(event) => void upload(event.target.files)} />

      <header className="mb-5 rounded-3xl border bg-card p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Biblioteca da Empresa</h1>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">Centralize as referências que a IA deve conhecer: empresa e marca, produtos do catálogo, obras e projetos, equipe, campanhas, fotos, vídeos e documentos.</p>
          </div>
          <div className="flex w-full max-w-xl gap-2">
            <input value={importUrl} onChange={(event) => setImportUrl(event.target.value)} placeholder="URL temporária do documento" className="h-11 min-w-0 flex-1 rounded-xl border bg-background px-3 text-sm outline-none focus:border-orange-300" />
            <button type="button" onClick={() => void importPresentationFromUrl()} disabled={importingUrl || !importUrl.trim()} className="h-11 rounded-xl border bg-background px-4 text-sm font-medium disabled:opacity-50">
              {importingUrl ? "Importando..." : "Importar"}
            </button>
          </div>
          <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 font-semibold text-white shadow-sm transition hover:bg-orange-600 disabled:opacity-60">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}Adicionar mídia
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { key: "all", label: "Todas", value: counts.all, icon: Grid3X3 },
            { key: "image", label: "Imagens", value: counts.image, icon: ImageIcon },
            { key: "video", label: "Vídeos", value: counts.video, icon: Film },
            { key: "ai", label: "Base IA", value: counts.ai, icon: Sparkles },
          ].map(({ key, label: statLabel, value, icon: Icon }) => (
            <button key={key} type="button" onClick={() => setFilter(key as Filter)} className={`rounded-2xl border p-3 text-left transition ${filter === key ? "border-orange-300 bg-orange-50" : "bg-background hover:border-slate-300"}`}>
              <div className="flex items-center justify-between"><span className="text-xs font-medium text-muted-foreground">{statLabel}</span><Icon className={`h-4 w-4 ${key === "ai" ? "text-emerald-600" : "text-orange-500"}`} /></div>
              <p className="mt-2 text-xl font-semibold">{value}</p>
            </button>
          ))}
        </div>
      </header>

      <div className={`grid gap-5 ${inspected ? "xl:grid-cols-[minmax(0,1fr)_360px]" : ""}`}>
        <main className="min-w-0">
          <div className="mb-4 flex items-center gap-2">
            <label className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar produto, obra, equipe, campanha ou arquivo" className="h-11 w-full rounded-xl border bg-background pl-10 pr-3 text-sm outline-none focus:border-orange-300" />
            </label>
            <button type="button" onClick={() => void load()} className="h-11 shrink-0 rounded-xl border bg-background px-3 text-xs font-medium sm:px-4 sm:text-sm">Atualizar</button>
          </div>

          <section className="mb-4">
            <div className="mb-2 flex items-center justify-between"><div><h2 className="text-sm font-semibold">Referências da empresa</h2><p className="text-[11px] text-muted-foreground">Organize cada mídia pelo assunto que ela representa para a IA.</p></div><span className="text-xs text-muted-foreground">{folders.length - 1} categorias</span></div>
            <div className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {folders.map((item, index) => {
                const count = item === "Todas as mídias" ? assets.length : assets.filter((asset) => folderOf(asset) === item).length;
                return <button key={item} type="button" onClick={() => setFolder(item)} className={`min-w-[155px] shrink-0 rounded-2xl border p-3 text-left transition ${folder === item ? "border-orange-300 bg-orange-50" : "bg-card hover:border-slate-300"}`}>
                  <div className="flex items-center justify-between"><div className={`flex h-9 w-9 items-center justify-center rounded-xl ${folder === item ? "bg-orange-100 text-orange-600" : "bg-slate-100 text-slate-500"}`}>{index === 0 ? <FolderOpen className="h-4 w-4" /> : <Folder className="h-4 w-4" />}</div><span className="text-xs text-muted-foreground">{count}</span></div>
                  <p className="mt-3 line-clamp-2 text-sm font-semibold">{item}</p>
                </button>;
              })}
            </div>
          </section>

          <div className="mb-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {filterTabs.map(({ id, label: tabLabel, icon: Icon }) => (
              <button key={id} type="button" onClick={() => setFilter(id)} className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3 text-xs font-medium ${filter === id ? "border-orange-300 bg-orange-50 text-orange-700" : "bg-background text-muted-foreground hover:text-foreground"}`}>
                <Icon className="h-3.5 w-3.5" />{tabLabel}
              </button>
            ))}
          </div>

          {loading ? <div className="flex min-h-[360px] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div> : filtered.length === 0 ? (
            <div className="rounded-3xl border border-dashed p-10 text-center"><ImageIcon className="mx-auto h-10 w-10 text-muted-foreground" /><p className="mt-3 font-semibold">Nenhuma mídia encontrada</p><p className="mt-1 text-sm text-muted-foreground">Adicione fotos, vídeos ou documentos e classifique como empresa, produto, obra, equipe ou outra referência.</p></div>
          ) : (
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
              {filtered.map((asset) => (
                <article key={asset.id} onClick={() => setInspectedId(asset.id)} className={`group cursor-pointer overflow-hidden rounded-2xl border bg-card transition hover:-translate-y-0.5 hover:shadow-md ${inspectedId === asset.id ? "border-orange-400 ring-2 ring-orange-100" : ""}`}>
                  <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                    <Preview asset={asset} />
                    <div className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur">{label(asset.type)}</div>
                    {isAiApproved(asset) && <div className="absolute bottom-2 left-2 rounded-full bg-emerald-600 px-2 py-1 text-[9px] font-bold text-white">BASE IA</div>}
                    {asset.type === "video" && <div className="absolute inset-0 flex items-center justify-center"><div className="rounded-full bg-black/55 p-3 text-white"><Film className="h-5 w-5" /></div></div>}
                  </div>
                  <div className="p-3"><div className="flex items-start gap-2"><p className="min-w-0 flex-1 truncate text-sm font-semibold">{friendlyName(asset)}</p><MoreHorizontal className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /></div><p className="mt-1 truncate text-xs text-muted-foreground">{label(asset.type)} · {bytes(asset.fileSize)}</p>{folderOf(asset) !== "Sem categoria" && <p className="mt-1 truncate text-[10px] text-muted-foreground">{folderOf(asset)}</p>}</div>
                </article>
              ))}
            </section>
          )}
          <p className="mt-5 text-xs text-muted-foreground">Mostrando {filtered.length} de {assets.length} itens</p>
        </main>

        {inspected && (
          <aside className="h-fit overflow-hidden rounded-3xl border bg-card shadow-sm xl:sticky xl:top-4">
            <div className="relative aspect-[16/10] overflow-hidden bg-muted"><Preview asset={inspected} /><button type="button" onClick={() => setInspectedId(null)} className="absolute right-3 top-3 rounded-full bg-black/50 p-2 text-white backdrop-blur"><X className="h-4 w-4" /></button></div>
            <div className="space-y-5 p-4">
              <div><h2 className="break-words text-lg font-semibold">{friendlyName(inspected)}</h2><p className="mt-1 text-xs text-muted-foreground">{label(inspected.type)} · {bytes(inspected.fileSize)} · {inspected.createdAt ? new Date(inspected.createdAt).toLocaleDateString("pt-BR") : ""}</p><p className="mt-1 truncate text-[10px] text-muted-foreground">Arquivo: {inspected.originalFilename || "—"}</p></div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => void patchAsset(inspected, { aiUsage: isAiApproved(inspected) ? "manual" : "approved", aiCollection: isAiApproved(inspected) ? "" : "Base IA da Empresa" })} className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl text-sm font-semibold ${isAiApproved(inspected) ? "border border-emerald-200 bg-emerald-50 text-emerald-700" : "bg-orange-500 text-white"}`}><Sparkles className="h-4 w-4" />{isAiApproved(inspected) ? "Na Base IA" : "Usar na IA"}</button>
                <a href={mediaUrl(inspected.storageUrl)} download={inspected.originalFilename ?? undefined} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-medium"><Download className="h-4 w-4" />Baixar</a>
                <button type="button" onClick={() => void patchAsset(inspected, { favorite: !isFavorite(inspected) })} className={`col-span-2 inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-medium ${isFavorite(inspected) ? "text-amber-600" : ""}`}><Star className="h-4 w-4" />{isFavorite(inspected) ? "Favorito" : "Adicionar aos favoritos"}</button>
                <button type="button" onClick={() => setMoveFolderOpen((value) => !value)} className="col-span-2 inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-medium hover:bg-muted/50"><Folder className="h-4 w-4" />Mover para pasta</button>
              </div>
              {moveFolderOpen && (
                <div className="rounded-2xl border bg-muted/20 p-3">
                  <p className="text-xs font-medium text-muted-foreground">Escolher pasta</p>
                  <select
                    value={libraryFolderOf(inspected)}
                    onChange={(event) => void patchAsset(inspected, { libraryFolder: event.target.value === "Sem pasta" ? "" : event.target.value })}
                    className="mt-2 h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:border-orange-300"
                  >
                    <option>Sem pasta</option>
                    {libraryFolders.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                  <div className="mt-2 flex gap-2">
                    <input
                      value={newFolderName}
                      onChange={(event) => setNewFolderName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && newFolderName.trim()) {
                          event.preventDefault();
                          void patchAsset(inspected, { libraryFolder: newFolderName.trim() });
                          setNewFolderName("");
                        }
                      }}
                      placeholder="Nome da nova pasta"
                      className="h-10 min-w-0 flex-1 rounded-xl border bg-background px-3 text-sm outline-none focus:border-orange-300"
                    />
                    <button
                      type="button"
                      disabled={!newFolderName.trim()}
                      onClick={() => {
                        const nextFolder = newFolderName.trim();
                        if (!nextFolder) return;
                        void patchAsset(inspected, { libraryFolder: nextFolder });
                        setNewFolderName("");
                      }}
                      className="h-10 rounded-xl border bg-background px-3 text-xs font-semibold disabled:opacity-50"
                    >
                      + Nova pasta
                    </button>
                  </div>
                </div>
              )}
              <div className="border-t pt-4"><p className="mb-3 text-sm font-semibold text-orange-600">Informações</p><label className="block text-xs font-medium text-muted-foreground">Descrição<textarea value={description} onChange={(event) => setDescription(event.target.value)} onBlur={() => void patchAsset(inspected, { description })} rows={3} placeholder="Explique o que esta mídia representa: produto, obra, pessoa, ambiente, uso, benefício ou contexto." className="mt-1 w-full resize-none rounded-xl border bg-background p-3 text-sm text-foreground outline-none focus:border-orange-300" /></label></div>
              <div><p className="text-xs font-medium text-muted-foreground">Categoria da referência</p><div className="mt-2 flex flex-wrap gap-2"><span className="rounded-full bg-muted px-3 py-1.5 text-xs">{folderOf(inspected)}</span>{CORE_LIBRARY_CATEGORIES.filter((item) => item !== folderOf(inspected)).map((item) => <button key={item} type="button" onClick={() => void patchAsset(inspected, { folderPath: item })} className="rounded-full border px-3 py-1.5 text-xs">+ {item}</button>)}</div></div>
              <div><p className="text-xs font-medium text-muted-foreground">Pasta</p><div className="mt-2 flex items-center gap-2"><span className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-xs"><Folder className="h-3.5 w-3.5" />{libraryFolderOf(inspected)}</span><button type="button" onClick={() => setMoveFolderOpen(true)} className="rounded-full border px-3 py-1.5 text-xs">Alterar</button></div></div>
              <div><p className="text-xs font-medium text-muted-foreground">Tags</p><div className="mt-2 flex flex-wrap gap-2">{tagsOf(inspected).map((tag) => <button key={tag} type="button" onClick={() => void patchAsset(inspected, { tags: tagsOf(inspected).filter((item) => item !== tag) })} className="rounded-full bg-muted px-3 py-1.5 text-xs">{tag} ×</button>)}</div><div className="mt-2 flex gap-2"><input value={tagDraft} onChange={(event) => setTagDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && tagDraft.trim()) { event.preventDefault(); void patchAsset(inspected, { tags: Array.from(new Set([...tagsOf(inspected), tagDraft.trim()])) }); setTagDraft(""); } }} placeholder="Ex.: produto, obra, equipe, fachada" className="h-9 min-w-0 flex-1 rounded-lg border bg-background px-3 text-xs" /><button type="button" onClick={() => { if (!tagDraft.trim()) return; void patchAsset(inspected, { tags: Array.from(new Set([...tagsOf(inspected), tagDraft.trim()])) }); setTagDraft(""); }} className="rounded-lg border px-3 text-xs font-medium">Adicionar</button></div></div>
              <div className="rounded-2xl border bg-muted/30 p-3"><div className="flex items-start gap-2"><Bot className="mt-0.5 h-4 w-4 text-orange-500" /><div><p className="text-sm font-semibold">Como a IA usa esta biblioteca</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">A IA cruza estas mídias com os dados já cadastrados da empresa e do catálogo. Ao classificar produto, obra, equipe ou marca, a referência fica mais fácil de encontrar e reutilizar corretamente.</p></div></div></div>
              <button type="button" onClick={() => void remove(inspected)} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-red-200 text-sm font-semibold text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" />Excluir mídia</button>
              {saving && <p className="text-center text-xs text-muted-foreground">Salvando…</p>}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}