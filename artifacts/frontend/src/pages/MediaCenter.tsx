import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  Music2,
  FileText,
  Upload,
  RefreshCw,
  WandSparkles,
  Scissors,
  Maximize2,
  Eraser,
  Sparkles,
  Film,
  Loader2,
  CheckSquare,
  Square,
  Link2,
} from "lucide-react";

type MediaType = "image" | "video" | "audio" | "document";
type FilterType = "all" | MediaType;
type MediaContextType = "none" | "client" | "event" | "campaign" | "product" | "project" | "other";

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

type Capabilities = {
  provider: "vendorai";
  capabilities: Record<string, "ready" | "building">;
};

type AssetContext = {
  type: MediaContextType;
  label: string;
};

const CONTEXT_LABELS: Record<MediaContextType, string> = {
  none: "Sem vínculo",
  client: "Cliente",
  event: "Evento",
  campaign: "Campanha",
  product: "Produto",
  project: "Obra / Projeto",
  other: "Outro",
};

const CONTEXT_PLACEHOLDERS: Record<Exclude<MediaContextType, "none">, string> = {
  client: "Nome do cliente",
  event: "Nome do evento",
  campaign: "Nome da campanha",
  product: "Nome do produto",
  project: "Nome da obra ou projeto",
  other: "Descrição do vínculo",
};

function authHeaders(json = false): Record<string, string> {
  const token = localStorage.getItem("vendorai_token") ?? "";
  return {
    Authorization: `Bearer ${token}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

function mediaUrl(storageUrl: string): string {
  if (!storageUrl) return "";
  if (storageUrl.startsWith("/objects/")) return `/api/storage${storageUrl}`;
  return storageUrl;
}

function inferType(file: File): MediaType | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type === "application/pdf" || file.type.startsWith("text/")) return "document";
  return null;
}

function bytes(value?: number | null): string {
  if (!value) return "";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function assetContext(asset: MediaAsset): AssetContext | null {
  const raw = asset.metadata?.context;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type : "other";
  const label = typeof record.label === "string" ? record.label.trim() : "";
  if (!label) return null;
  const safeType: MediaContextType = type in CONTEXT_LABELS ? type as MediaContextType : "other";
  return { type: safeType, label };
}

export default function MediaCenter() {
  const { user, tenantOverride } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [filter, setFilter] = useState<FilterType>("all");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [running, setRunning] = useState<string | null>(null);
  const [uploadContextType, setUploadContextType] = useState<MediaContextType>("none");
  const [uploadContextLabel, setUploadContextLabel] = useState("");

  const selectedAssets = useMemo(
    () => assets.filter((asset) => selected.includes(asset.id)),
    [assets, selected],
  );
  const selectedImages = selectedAssets.filter((asset) => asset.type === "image");

  async function loadAll() {
    if (!tenantId) return;
    setLoading(true);
    try {
      const [assetsRes, capsRes] = await Promise.all([
        fetch(`/api/tenants/${tenantId}/media/assets?limit=150`, { headers: authHeaders() }),
        fetch(`/api/tenants/${tenantId}/media-engine/capabilities`, { headers: authHeaders() }),
      ]);
      if (!assetsRes.ok) throw new Error("Não foi possível carregar a biblioteca");
      const assetsBody = await assetsRes.json();
      setAssets(Array.isArray(assetsBody.assets) ? assetsBody.assets : []);
      if (capsRes.ok) setCapabilities(await capsRes.json());
    } catch (error) {
      toast({ title: "Erro ao carregar Mídias", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadAll(); }, [tenantId]);

  async function uploadFiles(files: FileList | File[]) {
    if (!tenantId || !files.length) return;
    const contextLabel = uploadContextLabel.trim();
    if (uploadContextType !== "none" && !contextLabel) {
      toast({
        title: "Informe o vínculo do upload",
        description: `Preencha ${CONTEXT_LABELS[uploadContextType].toLowerCase()} antes de enviar os arquivos.`,
        variant: "destructive",
      });
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setUploading(true);
    let success = 0;
    try {
      for (const file of Array.from(files)) {
        const type = inferType(file);
        if (!type) {
          toast({ title: `Formato não suportado: ${file.name}`, variant: "destructive" });
          continue;
        }
        const requestRes = await fetch(`/api/tenants/${tenantId}/media/assets/request-upload`, {
          method: "POST",
          headers: authHeaders(true),
          body: JSON.stringify({ name: file.name, contentType: file.type || "application/octet-stream", type, size: file.size }),
        });
        const requestBody = await requestRes.json();
        if (!requestRes.ok) throw new Error(requestBody.error || `Falha ao preparar ${file.name}`);

        const uploadRes = await fetch(requestBody.uploadURL, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!uploadRes.ok) throw new Error(`Falha ao enviar ${file.name}`);

        const registerRes = await fetch(`/api/tenants/${tenantId}/media/assets`, {
          method: "POST",
          headers: authHeaders(true),
          body: JSON.stringify({
            type,
            role: "source",
            source: "upload",
            storageUrl: requestBody.objectPath,
            originalFilename: file.name,
            mimeType: file.type || null,
            fileSize: file.size,
            metadata: {
              uploadedFrom: "media_center",
              uploadedAt: new Date().toISOString(),
              ...(uploadContextType !== "none" ? {
                context: {
                  type: uploadContextType,
                  label: contextLabel,
                },
              } : {}),
            },
          }),
        });
        const registerBody = await registerRes.json();
        if (!registerRes.ok) throw new Error(registerBody.error || `Falha ao registrar ${file.name}`);
        success += 1;
      }
      if (success) {
        const contextDescription = uploadContextType !== "none"
          ? ` Vinculado a ${CONTEXT_LABELS[uploadContextType].toLowerCase()}: ${contextLabel}.`
          : "";
        toast({ title: `${success} arquivo(s) adicionado(s) à Central de Mídias.`, description: contextDescription || undefined });
        setSelected([]);
        setUploadContextType("none");
        setUploadContextLabel("");
      }
      await loadAll();
    } catch (error) {
      toast({ title: "Falha no upload", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function toggle(assetId: string) {
    setSelected((current) => current.includes(assetId) ? current.filter((id) => id !== assetId) : [...current, assetId]);
  }

  function ready(operation: string): boolean {
    return capabilities?.capabilities?.[operation] === "ready";
  }

  async function runJob(operation: string, context: Record<string, unknown>, title: string) {
    if (!tenantId) return;
    setRunning(operation);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/media-engine/jobs`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ operation, title, context }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Falha ao iniciar ferramenta");
      toast({ title: "Processamento iniciado", description: `${title} foi enviado ao Media Engine.` });
      setSelected([]);
      setTimeout(() => void loadAll(), 2500);
    } catch (error) {
      toast({ title: "Não foi possível iniciar", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setRunning(null);
    }
  }

  async function runNativeImage(operation: "image_resize" | "image_crop" | "image_optimize" | "image_enhance" | "image_convert") {
    const asset = selectedImages[0];
    if (!asset || !tenantId) return;
    const defaults: Record<string, Record<string, unknown>> = {
      image_resize: { width: 1080, fit: "inside", quality: 90 },
      image_crop: { left: 0, top: 0, width: 1080, height: 1080, quality: 90 },
      image_optimize: { width: 1920, fit: "inside", quality: 82, format: "webp" },
      image_enhance: { brightness: 1.04, saturation: 1.05, sharpen: 0.8, quality: 92 },
      image_convert: { format: "webp", quality: 90 },
    };
    setRunning(operation);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/media-engine/image-tools`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ assetId: asset.id, operation, title: `${asset.originalFilename || "Imagem"} — ${operation}`, options: defaults[operation] }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Falha no tratamento");
      toast({ title: "Nova versão criada", description: "O original foi preservado na biblioteca." });
      setSelected([]);
      await loadAll();
    } catch (error) {
      toast({ title: "Falha no tratamento", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setRunning(null);
    }
  }

  const visible = filter === "all" ? assets : assets.filter((asset) => asset.type === filter);

  const tabs: Array<{ id: FilterType; label: string }> = [
    { id: "all", label: "Todos" },
    { id: "image", label: "Fotos" },
    { id: "video", label: "Vídeos" },
    { id: "audio", label: "Áudios" },
    { id: "document", label: "Arquivos" },
  ];

  const oneImage = selectedImages.length === 1 && selected.length === 1;
  const multiImages = selectedImages.length >= 2 && selectedImages.length === selected.length;

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 space-y-5">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mídias</h1>
          <p className="text-sm text-muted-foreground">Biblioteca oficial do tenant para fotos, vídeos, áudios e arquivos.</p>
        </div>
        <div className="flex flex-col gap-2 md:flex-row md:items-end">
          <div className="min-w-[170px]">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Vincular upload a</label>
            <select
              value={uploadContextType}
              onChange={(event) => {
                const next = event.target.value as MediaContextType;
                setUploadContextType(next);
                if (next === "none") setUploadContextLabel("");
              }}
              disabled={uploading}
              className="h-9 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
            >
              {Object.entries(CONTEXT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          {uploadContextType !== "none" && (
            <div className="min-w-[220px] md:min-w-[260px]">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">{CONTEXT_LABELS[uploadContextType]}</label>
              <input
                value={uploadContextLabel}
                onChange={(event) => setUploadContextLabel(event.target.value)}
                disabled={uploading}
                placeholder={CONTEXT_PLACEHOLDERS[uploadContextType]}
                className="h-9 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
              />
            </div>
          )}
          <div className="flex items-center gap-2">
            <button onClick={() => void loadAll()} className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm hover:bg-muted">
              <RefreshCw className="h-4 w-4" /> Atualizar
            </button>
            <input ref={inputRef} type="file" multiple className="hidden" onChange={(event) => event.target.files && void uploadFiles(event.target.files)} />
            <button disabled={uploading} onClick={() => inputRef.current?.click()} className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload
            </button>
          </div>
        </div>
      </div>

      {uploadContextType !== "none" && uploadContextLabel.trim() && (
        <div className="inline-flex items-center gap-2 rounded-full border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
          <Link2 className="h-3.5 w-3.5" />
          Os próximos arquivos serão vinculados a <strong className="text-foreground">{CONTEXT_LABELS[uploadContextType]} · {uploadContextLabel.trim()}</strong>
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map((tab) => (
          <button key={tab.id} onClick={() => setFilter(tab.id)} className={`rounded-full border px-4 py-1.5 text-sm whitespace-nowrap ${filter === tab.id ? "bg-foreground text-background" : "bg-background hover:bg-muted"}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {selected.length > 0 && (
        <div className="rounded-xl border bg-card p-3 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium mr-1">{selected.length} selecionado(s)</span>
          {oneImage && <>
            <button disabled={!!running || !ready("image_enhance")} onClick={() => void runNativeImage("image_enhance")} className="tool-btn"><WandSparkles className="h-4 w-4" /> Melhorar</button>
            <button disabled={!!running || !ready("image_resize")} onClick={() => void runNativeImage("image_resize")} className="tool-btn"><Maximize2 className="h-4 w-4" /> Redimensionar</button>
            <button disabled={!!running || !ready("image_crop")} onClick={() => void runNativeImage("image_crop")} className="tool-btn"><Scissors className="h-4 w-4" /> Cortar 1:1</button>
            <button disabled={!!running || !ready("image_remove_background")} onClick={() => void runJob("image_remove_background", { assetId: selectedImages[0].id }, "Remover fundo")} className="tool-btn"><Eraser className="h-4 w-4" /> Remover fundo</button>
            <button disabled={!!running || !ready("image_variations")} onClick={() => void runJob("image_variations", { assetId: selectedImages[0].id, count: 3 }, "Criar variações")} className="tool-btn"><Sparkles className="h-4 w-4" /> 3 variações</button>
          </>}
          {multiImages && <>
            <button disabled={!!running || !ready("photo_video")} onClick={() => void runJob("photo_video", { assetIds: selectedImages.map((a) => a.id), secondsPerImage: 3, format: "9:16" }, "Vídeo a partir de fotos")} className="tool-btn"><Film className="h-4 w-4" /> Criar vídeo 9:16</button>
            <button disabled={!!running || !ready("media_batch")} onClick={() => void runJob("media_batch", { items: selectedImages.map((a) => ({ assetId: a.id, operation: "image_optimize", options: { width: 1920, fit: "inside", quality: 82, format: "webp" } })) }, "Otimizar imagens em lote")} className="tool-btn"><WandSparkles className="h-4 w-4" /> Otimizar lote</button>
          </>}
          <button onClick={() => setSelected([])} className="ml-auto text-xs text-muted-foreground hover:text-foreground">Limpar seleção</button>
        </div>
      )}

      {loading ? (
        <div className="py-24 flex justify-center"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed py-24 text-center">
          <Upload className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
          <p className="font-medium">Nenhuma mídia encontrada</p>
          <p className="text-sm text-muted-foreground mt-1">Envie arquivos ou gere conteúdos pelo Media Engine.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {visible.map((asset) => {
            const isSelected = selected.includes(asset.id);
            const url = mediaUrl(asset.storageUrl);
            const context = assetContext(asset);
            return (
              <button key={asset.id} onClick={() => toggle(asset.id)} className={`group overflow-hidden rounded-xl border bg-card text-left transition ${isSelected ? "ring-2 ring-primary border-primary" : "hover:border-foreground/25"}`}>
                <div className="relative aspect-square bg-muted flex items-center justify-center overflow-hidden">
                  {asset.type === "image" ? <img src={url} alt={asset.originalFilename || "Imagem"} className="h-full w-full object-cover" loading="lazy" /> : null}
                  {asset.type === "video" ? <video src={url} className="h-full w-full object-cover" muted preload="metadata" /> : null}
                  {asset.type === "audio" ? <Music2 className="h-10 w-10 text-muted-foreground" /> : null}
                  {asset.type === "document" ? <FileText className="h-10 w-10 text-muted-foreground" /> : null}
                  <span className="absolute right-2 top-2 rounded bg-background/85 p-1 shadow-sm">
                    {isSelected ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4 text-muted-foreground" />}
                  </span>
                  <span className="absolute left-2 bottom-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white uppercase">{asset.type}</span>
                </div>
                <div className="p-2.5">
                  <p className="truncate text-sm font-medium" title={asset.originalFilename || asset.id}>{asset.originalFilename || "Mídia"}</p>
                  {context && (
                    <div className="mt-1 flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground" title={`${CONTEXT_LABELS[context.type]} · ${context.label}`}>
                      <Link2 className="h-3 w-3 shrink-0" />
                      <span className="truncate">{CONTEXT_LABELS[context.type]} · {context.label}</span>
                    </div>
                  )}
                  <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{asset.source === "generated" ? "Gerada" : asset.source === "upload" ? "Upload" : asset.source || "Mídia"}</span>
                    <span>{bytes(asset.fileSize)}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <style>{`.tool-btn{display:inline-flex;align-items:center;gap:.4rem;border:1px solid hsl(var(--border));border-radius:.5rem;padding:.45rem .65rem;font-size:.8rem;background:hsl(var(--background));transition:.15s}.tool-btn:hover:not(:disabled){background:hsl(var(--muted))}.tool-btn:disabled{opacity:.45;cursor:not-allowed}`}</style>
    </div>
  );
}
