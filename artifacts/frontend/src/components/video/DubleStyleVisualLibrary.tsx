import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  Check,
  ImagePlus,
  Loader2,
  RefreshCw,
  Shirt,
  Sparkles,
  Trash2,
  Upload,
  Wallpaper,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type ReferenceType = "scenario" | "outfit" | "environment";

type MediaAsset = {
  id: string;
  storageUrl: string;
  originalFilename?: string | null;
  mimeType?: string | null;
  createdAt?: string | null;
  metadata?: Record<string, unknown> | null;
};

type Props = {
  tenantId: string;
  identityId: string;
  identityName: string;
};

type ReferenceConfig = {
  key: ReferenceType;
  title: string;
  subtitle: string;
  placeholder: string;
  icon: typeof Wallpaper;
  accent: string;
};

const CONFIGS: ReferenceConfig[] = [
  {
    key: "environment",
    title: "Ambiente real",
    subtitle: "Fotos reais do escritório, loja, fábrica, showroom, obra ou outro local do cliente.",
    placeholder: "Ex.: Showroom principal",
    icon: Building2,
    accent: "border-emerald-500/25 bg-emerald-500/5 text-emerald-200",
  },
  {
    key: "scenario",
    title: "Cenário / inspiração",
    subtitle: "Referência visual para composição, decoração, profundidade, paleta e clima da cena.",
    placeholder: "Ex.: Escritório executivo clean",
    icon: Wallpaper,
    accent: "border-fuchsia-500/25 bg-fuchsia-500/5 text-fuchsia-200",
  },
  {
    key: "outfit",
    title: "Roupa / look",
    subtitle: "Foto do estilo de roupa que deve ser adaptado ao corpo do Dublê sem copiar outra pessoa.",
    placeholder: "Ex.: Blazer azul + camiseta",
    icon: Shirt,
    accent: "border-cyan-500/25 bg-cyan-500/5 text-cyan-200",
  },
];

function authHeaders(json = false): HeadersInit {
  const token = localStorage.getItem("vendorai_token");
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

async function responseJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = (data as { error?: string })?.error ?? `Falha na solicitação (${response.status})`;
    throw new Error(message);
  }
  return data as T;
}

function metadata(asset: MediaAsset): Record<string, unknown> {
  return asset.metadata && typeof asset.metadata === "object" ? asset.metadata : {};
}

function referenceType(asset: MediaAsset): ReferenceType | null {
  const value = metadata(asset)["referenceType"];
  return value === "scenario" || value === "outfit" || value === "environment" ? value : null;
}

function isActive(asset: MediaAsset): boolean {
  return metadata(asset)["active"] !== false;
}

function labelFor(asset: MediaAsset): string {
  const value = metadata(asset)["label"];
  return typeof value === "string" && value.trim() ? value.trim() : asset.originalFilename || "Referência visual";
}

function previewUrl(storageUrl: string): string {
  if (storageUrl.startsWith("/objects/")) {
    return `/api/storage/objects${storageUrl.replace(/^\/objects/, "")}`;
  }
  return storageUrl;
}

export default function DubleStyleVisualLibrary({ tenantId, identityId, identityName }: Props) {
  const { toast } = useToast();
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<ReferenceType | null>(null);
  const [changing, setChanging] = useState<string | null>(null);
  const [labels, setLabels] = useState<Record<ReferenceType, string>>({
    scenario: "",
    outfit: "",
    environment: "",
  });

  const references = useMemo(() => assets.filter((asset) => {
    const meta = metadata(asset);
    return meta["usage"] === "duble_style_visual_reference"
      && meta["identityId"] === identityId
      && Boolean(referenceType(asset));
  }), [assets, identityId]);

  const grouped = useMemo(() => Object.fromEntries(CONFIGS.map((config) => [
    config.key,
    references.filter((asset) => referenceType(asset) === config.key),
  ])) as Record<ReferenceType, MediaAsset[]>, [references]);

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/media/assets?type=image&limit=150`, {
        headers: authHeaders(),
      });
      const data = await responseJson<{ assets?: MediaAsset[] }>(response);
      setAssets(data.assets ?? []);
    } catch (error) {
      toast({
        title: "Não foi possível carregar a Biblioteca de Estilo",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, identityId]);

  const patchAsset = async (assetId: string, nextMetadata: Record<string, unknown>) => {
    const response = await fetch(`/api/tenants/${tenantId}/media/assets/${assetId}`, {
      method: "PATCH",
      headers: authHeaders(true),
      body: JSON.stringify({ metadata: nextMetadata }),
    });
    await responseJson(response);
  };

  const deactivateType = async (type: ReferenceType, exceptAssetId?: string) => {
    const active = grouped[type].filter((asset) => asset.id !== exceptAssetId && isActive(asset));
    await Promise.all(active.map((asset) => patchAsset(asset.id, { active: false })));
  };

  const selectReference = async (asset: MediaAsset) => {
    const type = referenceType(asset);
    if (!type) return;
    setChanging(asset.id);
    try {
      await deactivateType(type, asset.id);
      await patchAsset(asset.id, { active: true, approvedForGeneration: true, selectedAt: new Date().toISOString() });
      await load(true);
      toast({
        title: "Referência aplicada ao Dublê",
        description: `${labelFor(asset)} será usada como base visual nas próximas gerações.`,
      });
    } catch (error) {
      toast({
        title: "Não foi possível aplicar a referência",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setChanging(null);
    }
  };

  const clearType = async (type: ReferenceType) => {
    setChanging(`clear-${type}`);
    try {
      await deactivateType(type);
      await load(true);
      toast({ title: "Referência automática", description: "O Dublê voltou a usar somente o catálogo e a seleção inteligente para esta categoria." });
    } catch (error) {
      toast({ title: "Não foi possível remover a seleção", description: error instanceof Error ? error.message : "Erro desconhecido", variant: "destructive" });
    } finally {
      setChanging(null);
    }
  };

  const deleteReference = async (asset: MediaAsset) => {
    if (!window.confirm(`Excluir a referência “${labelFor(asset)}”?`)) return;
    setChanging(asset.id);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/media/assets/${asset.id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      await responseJson(response);
      await load(true);
      toast({ title: "Referência excluída" });
    } catch (error) {
      toast({ title: "Não foi possível excluir", description: error instanceof Error ? error.message : "Erro desconhecido", variant: "destructive" });
    } finally {
      setChanging(null);
    }
  };

  const uploadReference = async (type: ReferenceType, file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Arquivo inválido", description: "Envie uma imagem JPG, PNG ou WebP.", variant: "destructive" });
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: "Imagem muito grande", description: "Use uma imagem de até 20 MB.", variant: "destructive" });
      return;
    }

    const fallbackLabel = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
    const referenceLabel = labels[type].trim() || fallbackLabel || CONFIGS.find((item) => item.key === type)?.title || "Referência";
    setUploading(type);
    try {
      const requestResponse = await fetch(`/api/tenants/${tenantId}/media/assets/request-upload`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ name: file.name, contentType: file.type || "image/jpeg", type: "image", size: file.size }),
      });
      const request = await responseJson<{ uploadURL: string; objectPath: string }>(requestResponse);

      const upload = await fetch(request.uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!upload.ok) throw new Error("Falha ao enviar a imagem para a Biblioteca Audiovisual");

      await deactivateType(type);

      const registerResponse = await fetch(`/api/tenants/${tenantId}/media/assets`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({
          type: "image",
          role: "reference",
          source: "upload",
          storageUrl: request.objectPath,
          originalFilename: file.name,
          mimeType: file.type || null,
          fileSize: file.size,
          metadata: {
            usage: "duble_style_visual_reference",
            identityId,
            identityName,
            referenceType: type,
            label: referenceLabel,
            active: true,
            approvedForGeneration: true,
            source: "duble_style_library",
            uploadedAt: new Date().toISOString(),
          },
        }),
      });
      await responseJson(registerResponse);

      setLabels((current) => ({ ...current, [type]: "" }));
      await load(true);
      toast({
        title: "Referência visual adicionada",
        description: `${referenceLabel} já será priorizada nas próximas imagens e vídeos do Dublê.`,
      });
    } catch (error) {
      toast({
        title: "Não foi possível adicionar a referência",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setUploading(null);
    }
  };

  return (
    <section className="rounded-2xl border border-fuchsia-500/20 bg-gradient-to-br from-fuchsia-500/[0.07] via-white/[0.02] to-cyan-500/[0.05] p-4 sm:p-5 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-fuchsia-300" />
            <h3 className="text-sm font-bold text-white">Biblioteca visual do Dublê</h3>
            <span className="rounded-full border border-fuchsia-500/20 bg-fuchsia-500/10 px-2 py-0.5 text-[10px] text-fuchsia-200">Realismo</span>
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-gray-400">
            Adicione fotos de ambientes reais, cenários e roupas. A próxima geração usa essas imagens junto da referência facial — a pessoa continua sendo a mesma, enquanto roupa e ambiente seguem as referências selecionadas.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-gray-300 hover:bg-white/5 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Atualizar
        </button>
      </div>

      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2.5 text-[11px] leading-5 text-emerald-100/80">
        <strong className="text-emerald-200">Prioridade visual:</strong> ambiente real → cenário/inspiração → catálogo automático. A roupa de referência afeta somente vestimenta. Rostos ou pessoas presentes nas imagens de estilo nunca devem substituir a identidade autorizada.
      </div>

      {loading ? (
        <div className="flex min-h-36 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-fuchsia-300" /></div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-3">
          {CONFIGS.map((config) => {
            const Icon = config.icon;
            const items = grouped[config.key];
            const selected = items.find(isActive) ?? null;
            const busy = uploading === config.key;
            return (
              <div key={config.key} className="rounded-xl border border-white/10 bg-black/15 p-3.5 space-y-3">
                <div className="flex items-start gap-2.5">
                  <div className={cn("rounded-lg border p-2", config.accent)}><Icon className="h-4 w-4" /></div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white">{config.title}</p>
                    <p className="mt-0.5 text-[10px] leading-4 text-gray-500">{config.subtitle}</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <input
                    value={labels[config.key]}
                    onChange={(event) => setLabels((current) => ({ ...current, [config.key]: event.target.value }))}
                    placeholder={config.placeholder}
                    className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/20 px-2.5 py-2 text-[11px] text-gray-200 outline-none placeholder:text-gray-600 focus:border-fuchsia-500/40"
                  />
                  <label className={cn(
                    "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-fuchsia-600 px-2.5 py-2 text-[11px] font-semibold text-white hover:bg-fuchsia-500",
                    busy && "pointer-events-none opacity-60",
                  )}>
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    Foto
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      disabled={busy}
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null;
                        event.currentTarget.value = "";
                        void uploadReference(config.key, file);
                      }}
                    />
                  </label>
                </div>

                {items.length === 0 ? (
                  <div className="flex min-h-28 flex-col items-center justify-center rounded-lg border border-dashed border-white/10 bg-white/[0.015] px-3 text-center">
                    <ImagePlus className="h-5 w-5 text-gray-600" />
                    <p className="mt-2 text-[10px] leading-4 text-gray-500">Nenhuma referência própria ainda. O modo automático continua funcionando normalmente.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {items.map((asset) => {
                      const active = isActive(asset);
                      const itemBusy = changing === asset.id;
                      return (
                        <div key={asset.id} className={cn(
                          "group overflow-hidden rounded-lg border bg-white/[0.02]",
                          active ? "border-emerald-500/40 ring-1 ring-emerald-500/10" : "border-white/10",
                        )}>
                          <div className="relative aspect-[4/3] overflow-hidden bg-black/30">
                            <img src={previewUrl(asset.storageUrl)} alt={labelFor(asset)} className="h-full w-full object-cover" />
                            {active && <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-600/90 px-1.5 py-0.5 text-[9px] font-semibold text-white"><Check className="h-2.5 w-2.5" /> Em uso</span>}
                          </div>
                          <div className="p-2">
                            <p className="truncate text-[10px] font-medium text-gray-200" title={labelFor(asset)}>{labelFor(asset)}</p>
                            <div className="mt-1.5 flex gap-1">
                              {!active ? (
                                <button type="button" disabled={itemBusy} onClick={() => void selectReference(asset)} className="flex-1 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-1 text-[9px] font-medium text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50">Usar</button>
                              ) : (
                                <button type="button" disabled={changing === `clear-${config.key}`} onClick={() => void clearType(config.key)} className="flex-1 rounded-md border border-white/10 px-1.5 py-1 text-[9px] text-gray-400 hover:bg-white/5 disabled:opacity-50">Automático</button>
                              )}
                              <button type="button" disabled={itemBusy} onClick={() => void deleteReference(asset)} className="rounded-md border border-red-500/15 px-1.5 py-1 text-red-300/70 hover:bg-red-500/10 disabled:opacity-50" aria-label={`Excluir ${labelFor(asset)}`}><Trash2 className="h-3 w-3" /></button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="flex items-center justify-between border-t border-white/5 pt-2 text-[9px] text-gray-600">
                  <span>{items.length} referência(s)</span>
                  <span>{selected ? `Ativa: ${labelFor(selected)}` : "Seleção automática"}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
