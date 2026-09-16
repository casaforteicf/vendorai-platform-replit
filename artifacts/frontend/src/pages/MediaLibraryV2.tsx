import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  AudioLines,
  Bot,
  ChevronDown,
  Download,
  FileText,
  Film,
  Folder,
  FolderOpen,
  Grid3X3,
  Image as ImageIcon,
  Loader2,
  MoreHorizontal,
  Plus,
  Search,
  Sparkles,
  Star,
  Trash2,
  Upload,
  X,
} from "lucide-react";

type MediaType = "image" | "video" | "audio" | "document";
type Filter = "all" | MediaType | "favorites";

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
  if (file.type === "application/pdf" || file.type.startsWith("text/")) return "document";
  return null;
}

function label(type: MediaType) {
  return type === "image" ? "Imagem" : type === "video" ? "Vídeo" : type === "audio" ? "Áudio" : "Documento";
}

function folderOf(asset: MediaAsset) {
  const value = asset.metadata?.folderPath;
  return typeof value === "string" && value.trim() ? value.trim() : "Sem pasta";
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

function Preview({ asset, className = "" }: { asset: MediaAsset; className?: string }) {
  const url = mediaUrl(asset.storageUrl);
  if (asset.type === "image") return <img src={url} alt={asset.originalFilename ?? "Mídia"} className={`h-full w-full object-cover ${className}`} />;
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
  const [filter, setFilter] = useState<Filter>("all");
  const [folder, setFolder] = useState("Todas as mídias");
  const [search, setSearch] = useState("");
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [description, setDescription] = useState("");
  const [tagDraft, setTagDraft] = useState("");

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
  useEffect(() => { if (inspected) setDescription(descriptionOf(inspected)); }, [inspected?.id]);

  const folders = useMemo(() => {
    const counts = new Map<string, number>();
    for (const asset of assets) counts.set(folderOf(asset), (counts.get(folderOf(asset)) ?? 0) + 1);
    const preferred = ["Institucional", "Produtos", "Campanhas", "Redes sociais", "Apresentações"];
    const dynamic = Array.from(counts.keys()).filter((item) => item !== "Sem pasta" && !preferred.includes(item)).sort((a, b) => a.localeCompare(b, "pt-BR"));
    return ["Todas as mídias", ...preferred, ...dynamic];
  }, [assets]);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return assets.filter((asset) => {
      if (filter !== "all" && filter !== "favorites" && asset.type !== filter) return false;
      if (filter === "favorites" && !isFavorite(asset)) return false;
      if (folder !== "Todas as mídias" && folderOf(asset) !== folder) return false;
      if (!term) return true;
      const haystack = [asset.originalFilename ?? "", descriptionOf(asset), folderOf(asset), ...tagsOf(asset)].join(" ").toLocaleLowerCase("pt-BR");
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
    { id: "all", label: "Todas", icon: Grid3X3 }, { id: "image", label: "Imagens", icon: ImageIcon }, { id: "video", label: "Vídeos", icon: Film },
    { id: "audio", label: "Áudios", icon: AudioLines }, { id: "document", label: "Documentos", icon: FileText }, { id: "favorites", label: "Favoritos", icon: Star },
  ];

  return (
    <div className="mx-auto w-full max-w-[1500px] p-4 pb-24 sm:p-6 lg:p-8">
      <input ref={inputRef} type="file" multiple className="hidden" accept="image/*,video/*,audio/*,.pdf,.txt" onChange={(event) => void upload(event.target.files)} />

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Biblioteca de Mídias</h1>
          <p className="mt-1 text-sm text-muted-foreground">Organize, encontre e use suas mídias em conteúdos, campanhas, sites e materiais de marketing.</p>
        </div>
        <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 font-semibold text-white shadow-sm transition hover:bg-orange-600 disabled:opacity-60">
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Adicionar mídia<ChevronDown className="h-4 w-4" />
        </button>
      </div>

      <div className={`grid gap-5 ${inspected ? "xl:grid-cols-[minmax(0,1fr)_360px]" : ""}`}>
        <main className="min-w-0">
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
            {filterTabs.map(({ id, label: tabLabel, icon: Icon }) => (
              <button key={id} type="button" onClick={() => setFilter(id)} className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border px-3 text-sm font-medium ${filter === id ? "border-orange-300 bg-orange-50 text-orange-700" : "bg-background text-muted-foreground hover:text-foreground"}`}>
                <Icon className="h-4 w-4" />{tabLabel}
              </button>
            ))}
          </div>

          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar na biblioteca…" className="h-11 w-full rounded-xl border bg-background pl-10 pr-3 text-sm outline-none focus:border-orange-300" />
            </label>
            <select value={folder} onChange={(event) => setFolder(event.target.value)} className="h-11 rounded-xl border bg-background px-3 text-sm"><option value="Todas as mídias">Todas as pastas</option>{folders.slice(1).map((item) => <option key={item}>{item}</option>)}</select>
            <button type="button" onClick={() => void load()} className="h-11 rounded-xl border bg-background px-4 text-sm font-medium">Atualizar</button>
          </div>

          <section className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
            {folders.slice(0, 6).map((item, index) => {
              const count = item === "Todas as mídias" ? assets.length : assets.filter((asset) => folderOf(asset) === item).length;
              return <button key={item} type="button" onClick={() => setFolder(item)} className={`rounded-2xl border p-3 text-left transition ${folder === item ? "border-orange-300 bg-orange-50" : "bg-card hover:border-slate-300"}`}>
                <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${folder === item ? "bg-orange-100 text-orange-600" : "bg-slate-100 text-slate-500"}`}>{index === 0 ? <FolderOpen className="h-5 w-5" /> : <Folder className="h-5 w-5" />}</div>
                <p className="truncate text-sm font-semibold">{item}</p><p className="mt-1 text-xs text-muted-foreground">{count} itens</p>
              </button>;
            })}
          </section>

          {loading ? <div className="flex min-h-[360px] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div> : filtered.length === 0 ? (
            <div className="rounded-3xl border border-dashed p-12 text-center"><ImageIcon className="mx-auto h-10 w-10 text-muted-foreground" /><p className="mt-3 font-semibold">Nenhuma mídia encontrada</p><p className="mt-1 text-sm text-muted-foreground">Ajuste os filtros ou adicione uma nova mídia.</p></div>
          ) : (
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
              {filtered.map((asset) => (
                <article key={asset.id} onClick={() => setInspectedId(asset.id)} className={`group cursor-pointer overflow-hidden rounded-2xl border bg-card transition hover:-translate-y-0.5 hover:shadow-md ${inspectedId === asset.id ? "border-orange-400 ring-2 ring-orange-100" : ""}`}>
                  <div className="relative aspect-[4/3] overflow-hidden bg-muted"><Preview asset={asset} /><div className="absolute left-2 top-2 rounded-lg bg-black/55 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur">{label(asset.type)}</div>{asset.type === "video" && <div className="absolute inset-0 flex items-center justify-center"><div className="rounded-full bg-black/55 p-3 text-white"><Film className="h-5 w-5" /></div></div>}</div>
                  <div className="p-3"><p className="truncate text-sm font-semibold">{asset.originalFilename || "Mídia sem nome"}</p><div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground"><span>{label(asset.type)} · {bytes(asset.fileSize)}</span><MoreHorizontal className="h-4 w-4" /></div></div>
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
              <div><h2 className="break-words text-lg font-semibold">{inspected.originalFilename || "Mídia sem nome"}</h2><p className="mt-1 text-xs text-muted-foreground">{label(inspected.type)} · {bytes(inspected.fileSize)} · {inspected.createdAt ? new Date(inspected.createdAt).toLocaleDateString("pt-BR") : ""}</p></div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void patchAsset(inspected, { aiUsage: "approved", aiCollection: "Base IA da Empresa" })} className="inline-flex h-9 items-center gap-2 rounded-lg bg-orange-500 px-3 text-sm font-semibold text-white"><Sparkles className="h-4 w-4" />Usar na IA</button>
                <a href={mediaUrl(inspected.storageUrl)} download={inspected.originalFilename ?? undefined} className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium"><Download className="h-4 w-4" />Baixar</a>
                <button type="button" onClick={() => void patchAsset(inspected, { favorite: !isFavorite(inspected) })} className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium ${isFavorite(inspected) ? "text-amber-600" : ""}`}><Star className="h-4 w-4" />Favorito</button>
              </div>
              <div className="border-t pt-4"><p className="mb-3 text-sm font-semibold text-orange-600">Informações</p><label className="block text-xs font-medium text-muted-foreground">Descrição<textarea value={description} onChange={(event) => setDescription(event.target.value)} onBlur={() => void patchAsset(inspected, { description })} rows={3} placeholder="Descreva esta mídia para facilitar a busca e o uso pela IA." className="mt-1 w-full resize-none rounded-xl border bg-background p-3 text-sm text-foreground outline-none focus:border-orange-300" /></label></div>
              <div><p className="text-xs font-medium text-muted-foreground">Pasta</p><div className="mt-2 flex flex-wrap gap-2"><span className="rounded-full bg-muted px-3 py-1.5 text-xs">{folderOf(inspected)}</span>{folders.slice(1, 5).filter((item) => item !== folderOf(inspected)).map((item) => <button key={item} type="button" onClick={() => void patchAsset(inspected, { folderPath: item })} className="rounded-full border px-3 py-1.5 text-xs">+ {item}</button>)}</div></div>
              <div><p className="text-xs font-medium text-muted-foreground">Tags</p><div className="mt-2 flex flex-wrap gap-2">{tagsOf(inspected).map((tag) => <button key={tag} type="button" onClick={() => void patchAsset(inspected, { tags: tagsOf(inspected).filter((item) => item !== tag) })} className="rounded-full bg-muted px-3 py-1.5 text-xs">{tag} ×</button>)}</div><div className="mt-2 flex gap-2"><input value={tagDraft} onChange={(event) => setTagDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && tagDraft.trim()) { event.preventDefault(); void patchAsset(inspected, { tags: Array.from(new Set([...tagsOf(inspected), tagDraft.trim()])) }); setTagDraft(""); } }} placeholder="Adicionar tag" className="h-9 min-w-0 flex-1 rounded-lg border bg-background px-3 text-xs" /><button type="button" onClick={() => { if (!tagDraft.trim()) return; void patchAsset(inspected, { tags: Array.from(new Set([...tagsOf(inspected), tagDraft.trim()])) }); setTagDraft(""); }} className="rounded-lg border px-3 text-xs font-medium">Adicionar</button></div></div>
              <div className="rounded-2xl border bg-muted/30 p-3"><div className="flex items-start gap-2"><Bot className="mt-0.5 h-4 w-4 text-orange-500" /><div><p className="text-sm font-semibold">Uso pela IA</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">A Biblioteca é a fonte de referência para conteúdos, sites e campanhas. Marque apenas mídias que a IA pode reutilizar.</p></div></div></div>
              <button type="button" onClick={() => void remove(inspected)} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-red-200 text-sm font-semibold text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" />Excluir mídia</button>
              {saving && <p className="text-center text-xs text-muted-foreground">Salvando…</p>}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
