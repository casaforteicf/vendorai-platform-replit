import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AudioLines,
  Ban,
  CheckCircle2,
  CheckSquare,
  FileText,
  Film,
  Image as ImageIcon,
  Library,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Square,
  X,
} from "lucide-react";

const USER_CACHE_KEY = "vendorai_user_cache";
const OVERRIDE_KEY = "vendorai_sa_tenant_override";
const EXECUTION_KEY = "vendorai_media_plan_execution_v1";
const AI_CACHE_KEY = "vendorai_media_ai_base_v1";

type MediaType = "image" | "video" | "audio" | "document" | string;
type AiUsage = "approved" | "blocked" | "manual";
type AiRole = "visual_reference" | "final_material" | "product" | "environment" | "video_base" | "audio_base" | "brand";
type Filter = "all" | AiUsage;

type MediaAsset = {
  id: string;
  type: MediaType;
  role?: string | null;
  storageUrl: string;
  accessUrl?: string | null;
  originalFilename?: string | null;
  source?: string | null;
  metadata?: Record<string, unknown> | null;
};

type CachedUser = { tenantId?: string | null };
type CachedOverride = { id?: string | null };

type CachedApproved = {
  tenantId: string;
  ids: string[];
  urls: string[];
  updatedAt: string;
};

const AI_ROLE_LABELS: Record<AiRole, string> = {
  visual_reference: "Referência visual",
  final_material: "Material final",
  product: "Produto",
  environment: "Ambiente / obra",
  video_base: "Vídeo base",
  audio_base: "Áudio base",
  brand: "Marca / identidade",
};

function currentTenantId(): string {
  try {
    const overrideRaw = localStorage.getItem(OVERRIDE_KEY);
    if (overrideRaw) {
      const override = JSON.parse(overrideRaw) as CachedOverride;
      if (override?.id) return override.id;
    }
  } catch {
    // Ignora cache inválido.
  }
  try {
    const userRaw = localStorage.getItem(USER_CACHE_KEY);
    if (!userRaw) return "";
    const user = JSON.parse(userRaw) as CachedUser;
    return user?.tenantId ?? "";
  } catch {
    return "";
  }
}

function authHeaders(json = false): Record<string, string> {
  return {
    Authorization: `Bearer ${localStorage.getItem("vendorai_token") ?? ""}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

function mediaUrl(storageUrl: string): string {
  return storageUrl.startsWith("/objects/") ? `/api/storage${storageUrl}` : storageUrl;
}

function assetAccessUrl(asset: MediaAsset): string {
  return asset.accessUrl || assetAccessUrl(asset);
}

function aiUsage(asset: MediaAsset): AiUsage {
  const value = asset.metadata?.aiUsage;
  if (value === "approved" || value === "blocked" || value === "manual") return value;
  return "manual";
}

function aiRole(asset: MediaAsset): AiRole {
  const value = asset.metadata?.aiRole;
  return typeof value === "string" && value in AI_ROLE_LABELS ? value as AiRole : "visual_reference";
}

function folderLabel(asset: MediaAsset): string {
  const value = asset.metadata?.folderPath;
  return typeof value === "string" ? value.trim() : "";
}

function typeIcon(type: MediaType) {
  if (type === "image") return ImageIcon;
  if (type === "video") return Film;
  if (type === "audio") return AudioLines;
  return FileText;
}

function readApprovedCache(tenantId: string): CachedApproved | null {
  try {
    const raw = sessionStorage.getItem(AI_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedApproved;
    return parsed.tenantId === tenantId ? parsed : null;
  } catch {
    return null;
  }
}

function sanitizeExecutionValue(value: string, approvedIds: Set<string>, approvedUrls: Set<string>): string {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const references = Array.isArray(parsed.referenceMedia) ? parsed.referenceMedia : [];
    parsed.referenceMedia = references.filter((raw) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
      const item = raw as Record<string, unknown>;
      const id = typeof item.assetId === "string" ? item.assetId : "";
      const storageUrl = typeof item.storageUrl === "string" ? item.storageUrl : "";
      return approvedIds.has(id) || approvedUrls.has(storageUrl) || approvedUrls.has(mediaUrl(storageUrl));
    });
    return JSON.stringify(parsed);
  } catch {
    return value;
  }
}

export function MediaAiBaseBridge() {
  const tenantId = currentTenantId();
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const [searchParams, setSearchParams] = useState(() => window.location.search);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedRole, setSelectedRole] = useState<AiRole>("visual_reference");

  const approvedIdsRef = useRef<Set<string>>(new Set(readApprovedCache(tenantId)?.ids ?? []));
  const approvedUrlsRef = useRef<Set<string>>(new Set(readApprovedCache(tenantId)?.urls ?? []));

  const syncApprovedCache = useCallback((nextAssets: MediaAsset[]) => {
    const approved = nextAssets.filter((asset) => aiUsage(asset) === "approved");
    const ids = approved.map((asset) => asset.id);
    const urls = Array.from(new Set(approved.flatMap((asset) => [asset.storageUrl, mediaUrl(asset.storageUrl), assetAccessUrl(asset)])));
    approvedIdsRef.current = new Set(ids);
    approvedUrlsRef.current = new Set(urls);
    try {
      sessionStorage.setItem(AI_CACHE_KEY, JSON.stringify({ tenantId, ids, urls, updatedAt: new Date().toISOString() } satisfies CachedApproved));
      const execution = sessionStorage.getItem(EXECUTION_KEY);
      if (execution) {
        sessionStorage.setItem(EXECUTION_KEY, sanitizeExecutionValue(execution, approvedIdsRef.current, approvedUrlsRef.current));
      }
    } catch {
      // A regra continua em memória mesmo se storage estiver indisponível.
    }
  }, [tenantId]);

  const loadAssets = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const types = ["image", "video", "audio", "document"];
      const responses = await Promise.all(types.map((type) =>
        fetch(`/api/tenants/${tenantId}/media/assets?type=${type}&limit=150`, { headers: authHeaders() }),
      ));
      const collected: MediaAsset[] = [];
      for (const response of responses) {
        if (!response.ok) continue;
        const body = await response.json().catch(() => ({})) as { assets?: MediaAsset[] };
        if (Array.isArray(body.assets)) collected.push(...body.assets);
      }
      const unique = Array.from(new Map(collected.map((asset) => [asset.id, asset])).values());
      setAssets(unique);
      syncApprovedCache(unique);
    } finally {
      setLoading(false);
    }
  }, [syncApprovedCache, tenantId]);

  useEffect(() => {
    const updateLocation = () => {
      setPathname(window.location.pathname);
      setSearchParams(window.location.search);
    };
    window.addEventListener("popstate", updateLocation);
    const timer = window.setInterval(updateLocation, 350);
    return () => {
      window.removeEventListener("popstate", updateLocation);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    void loadAssets();
  }, [loadAssets]);

  // Segurança de execução: quando o Plano de Mídia cria o contexto para outro executor,
  // somente referências explicitamente liberadas na Base IA permanecem no handoff.
  useEffect(() => {
    const nativeSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(key: string, value: string) {
      if (key === EXECUTION_KEY) {
        value = sanitizeExecutionValue(value, approvedIdsRef.current, approvedUrlsRef.current);
      }
      return nativeSetItem.call(this, key, value);
    };
    return () => {
      if (Storage.prototype.setItem !== nativeSetItem) Storage.prototype.setItem = nativeSetItem;
    };
  }, []);

  // Segurança de geração: em produção automática do plano, referências visuais fora
  // da Base IA são removidas do payload antes de chegar ao gerador.
  useEffect(() => {
    const previousFetch = window.fetch.bind(window);
    const guardedFetch: typeof window.fetch = async (input, init = {}) => {
      const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(rawUrl, window.location.origin);
      const method = (init.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined));
      const calendarItemId = headers.get("x-vendorai-calendar-item-id");
      const pageParams = new URLSearchParams(window.location.search);
      const automaticMediaContext =
        (window.location.pathname === "/content" && pageParams.get("mode") !== "avulso")
        || pageParams.get("from") === "media-calendar";

      if (method === "POST" && calendarItemId && /\/api\/tenants\/[^/]+\/content\/generate\/?$/.test(url.pathname) && typeof init.body === "string") {
        try {
          const body = JSON.parse(init.body) as Record<string, unknown>;
          for (const key of ["postMaterialUrls", "imageUrls"] as const) {
            if (!Array.isArray(body[key])) continue;
            body[key] = (body[key] as unknown[]).filter((value) =>
              typeof value === "string" && approvedUrlsRef.current.has(value),
            );
          }
          return previousFetch(input, { ...init, body: JSON.stringify(body) });
        } catch {
          return previousFetch(input, init);
        }
      }

      const response = await previousFetch(input, init);
      if (
        response.ok
        && method === "GET"
        && automaticMediaContext
        && /\/api\/tenants\/[^/]+\/media\/assets\/?$/.test(url.pathname)
        && (url.searchParams.get("type") === "image" || url.searchParams.get("type") === "video")
      ) {
        try {
          const body = await response.clone().json() as { assets?: MediaAsset[] };
          if (Array.isArray(body.assets)) {
            body.assets = body.assets.filter((asset) => approvedIdsRef.current.has(asset.id));
            const nextHeaders = new Headers(response.headers);
            nextHeaders.set("content-type", "application/json");
            return new Response(JSON.stringify(body), {
              status: response.status,
              statusText: response.statusText,
              headers: nextHeaders,
            });
          }
        } catch {
          // Se não for JSON compatível, devolve resposta original.
        }
      }
      return response;
    };

    window.fetch = guardedFetch;
    return () => {
      if (window.fetch === guardedFetch) window.fetch = previousFetch;
    };
  }, []);

  // Evita handoff de vídeo não autorizado em links do calendário.
  useEffect(() => {
    const id = new URLSearchParams(searchParams).get("mediaAssetId");
    const fromCalendar = new URLSearchParams(searchParams).get("from") === "media-calendar";
    if (!id || !fromCalendar || approvedIdsRef.current.has(id)) return;
    const next = new URL(window.location.href);
    next.searchParams.delete("mediaAssetId");
    window.history.replaceState(window.history.state, "", `${next.pathname}${next.search}${next.hash}`);
  }, [pathname, searchParams, assets]);

  const counts = useMemo(() => ({
    approved: assets.filter((asset) => aiUsage(asset) === "approved").length,
    blocked: assets.filter((asset) => aiUsage(asset) === "blocked").length,
    manual: assets.filter((asset) => aiUsage(asset) === "manual").length,
  }), [assets]);

  const visible = useMemo(() => assets.filter((asset) => {
    if (filter !== "all" && aiUsage(asset) !== filter) return false;
    const term = search.trim().toLowerCase();
    if (!term) return true;
    let metadata = "";
    try { metadata = JSON.stringify(asset.metadata ?? {}); } catch { metadata = ""; }
    return `${asset.originalFilename ?? ""} ${folderLabel(asset)} ${metadata}`.toLowerCase().includes(term);
  }), [assets, filter, search]);

  const selectedAssets = useMemo(() => assets.filter((asset) => selected.includes(asset.id)), [assets, selected]);

  const patchSelection = useCallback(async (usage: AiUsage) => {
    if (!tenantId || selectedAssets.length === 0) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      await Promise.all(selectedAssets.map(async (asset) => {
        const metadata: Record<string, unknown> = {
          aiUsage: usage,
          aiUsageUpdatedAt: now,
          aiCollection: usage === "approved" ? "Base IA da Empresa" : "",
        };
        if (usage === "approved") metadata.aiRole = selectedRole;
        const response = await fetch(`/api/tenants/${tenantId}/media/assets/${asset.id}`, {
          method: "PATCH",
          headers: authHeaders(true),
          body: JSON.stringify({ metadata }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({})) as { error?: string };
          throw new Error(body.error ?? "Falha ao atualizar a mídia");
        }
      }));
      setSelected([]);
      await loadAssets();
    } catch (error) {
      console.error("media-ai-base: falha ao atualizar seleção", error);
      window.alert(error instanceof Error ? error.message : "Não foi possível atualizar a Base IA.");
    } finally {
      setSaving(false);
    }
  }, [loadAssets, selectedAssets, selectedRole, tenantId]);

  if (!tenantId || pathname !== "/midias") return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 left-4 z-[75] inline-flex h-11 items-center gap-2 rounded-full border border-emerald-200 bg-background/95 px-4 text-xs font-semibold text-emerald-700 shadow-lg backdrop-blur md:left-[250px]"
        title="Gerenciar quais mídias a IA pode usar automaticamente"
      >
        <ShieldCheck className="h-4 w-4" />
        Base IA
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">{counts.approved}</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/45 p-3 md:p-6" role="dialog" aria-modal="true" aria-label="Base IA da Empresa">
          <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b p-4 md:p-5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-emerald-600" />
                  <h2 className="text-lg font-semibold">Base IA da Empresa</h2>
                </div>
                <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
                  A produção automática do Plano de Mídia só pode usar arquivos liberados aqui. Itens não classificados ou marcados como “Não usar na IA” ficam fora das referências automáticas.
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>

            <div className="border-b bg-muted/20 p-4">
              <div className="grid gap-2 sm:grid-cols-3">
                <button type="button" onClick={() => setFilter("approved")} className={`rounded-xl border p-3 text-left ${filter === "approved" ? "border-emerald-300 bg-emerald-50" : "bg-background"}`}>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Base IA</p><p className="mt-1 text-xl font-semibold text-emerald-700">{counts.approved}</p>
                </button>
                <button type="button" onClick={() => setFilter("manual")} className={`rounded-xl border p-3 text-left ${filter === "manual" ? "border-amber-300 bg-amber-50" : "bg-background"}`}>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Não classificados</p><p className="mt-1 text-xl font-semibold">{counts.manual}</p>
                </button>
                <button type="button" onClick={() => setFilter("blocked")} className={`rounded-xl border p-3 text-left ${filter === "blocked" ? "border-rose-300 bg-rose-50" : "bg-background"}`}>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Não usar na IA</p><p className="mt-1 text-xl font-semibold text-rose-700">{counts.blocked}</p>
                </button>
              </div>

              <div className="mt-3 flex flex-col gap-2 lg:flex-row lg:items-center">
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por arquivo, pasta, produto, obra..." className="h-10 min-w-0 flex-1 rounded-xl border bg-background px-3 text-sm" />
                <button type="button" onClick={() => setFilter("all")} className="h-10 rounded-xl border bg-background px-3 text-xs font-medium">Mostrar todos</button>
                <button type="button" disabled={loading} onClick={() => void loadAssets()} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border bg-background px-3 text-xs font-medium"><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Atualizar</button>
              </div>
            </div>

            {selected.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 border-b bg-primary/5 p-3 md:px-4">
                <span className="mr-1 text-sm font-semibold">{selected.length} selecionada(s)</span>
                <select value={selectedRole} onChange={(event) => setSelectedRole(event.target.value as AiRole)} className="h-9 rounded-lg border bg-background px-2 text-xs">
                  {(Object.keys(AI_ROLE_LABELS) as AiRole[]).map((value) => <option key={value} value={value}>{AI_ROLE_LABELS[value]}</option>)}
                </select>
                <button disabled={saving} type="button" onClick={() => void patchSelection("approved")} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white disabled:opacity-50"><CheckCircle2 className="h-3.5 w-3.5" />Adicionar à Base IA</button>
                <button disabled={saving} type="button" onClick={() => void patchSelection("blocked")} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-rose-200 bg-background px-3 text-xs font-semibold text-rose-700 disabled:opacity-50"><Ban className="h-3.5 w-3.5" />Não usar na IA</button>
                <button disabled={saving} type="button" onClick={() => void patchSelection("manual")} className="h-9 rounded-lg border bg-background px-3 text-xs font-medium disabled:opacity-50">Retirar da Base IA</button>
                {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                <button type="button" onClick={() => setSelected([])} className="ml-auto text-xs text-muted-foreground hover:text-foreground">Limpar</button>
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {loading && assets.length === 0 ? (
                <div className="flex min-h-[300px] items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Carregando mídias...</div>
              ) : visible.length === 0 ? (
                <div className="flex min-h-[300px] flex-col items-center justify-center text-center"><Library className="h-9 w-9 text-muted-foreground" /><p className="mt-3 text-sm font-medium">Nenhuma mídia neste filtro</p></div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {visible.map((asset) => {
                    const Icon = typeIcon(asset.type);
                    const usage = aiUsage(asset);
                    const isSelected = selected.includes(asset.id);
                    return (
                      <button
                        key={asset.id}
                        type="button"
                        onClick={() => setSelected((current) => current.includes(asset.id) ? current.filter((id) => id !== asset.id) : [...current, asset.id])}
                        className={`overflow-hidden rounded-xl border bg-background text-left shadow-sm transition ${isSelected ? "border-primary ring-2 ring-primary/20" : "hover:border-primary/30"}`}
                      >
                        <div className="relative aspect-[4/3] bg-muted">
                          {asset.type === "image" ? <img src={assetAccessUrl(asset)} alt={asset.originalFilename ?? "Mídia"} className="h-full w-full object-cover" />
                            : asset.type === "video" ? <video src={assetAccessUrl(asset)} className="h-full w-full object-cover" muted preload="metadata" />
                            : <div className="flex h-full items-center justify-center"><Icon className="h-9 w-9 text-muted-foreground" /></div>}
                          <span className="absolute right-2 top-2 rounded-md bg-background/90 p-1.5 shadow-sm">{isSelected ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4 text-muted-foreground" />}</span>
                          {usage === "approved" && <span className="absolute bottom-2 left-2 rounded-full bg-emerald-600 px-2 py-1 text-[9px] font-bold text-white">BASE IA</span>}
                          {usage === "blocked" && <span className="absolute bottom-2 left-2 rounded-full bg-rose-600 px-2 py-1 text-[9px] font-bold text-white">BLOQUEADA</span>}
                        </div>
                        <div className="p-2.5">
                          <p className="truncate text-xs font-semibold">{asset.originalFilename || "Mídia sem nome"}</p>
                          <p className="mt-1 truncate text-[10px] text-muted-foreground">{folderLabel(asset) || "Sem pasta"}</p>
                          {usage === "approved" && <p className="mt-1 text-[10px] font-medium text-emerald-700">{AI_ROLE_LABELS[aiRole(asset)]}</p>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 border-t bg-muted/20 p-4 text-[11px] text-muted-foreground md:flex-row md:items-center md:justify-between">
              <span><Sparkles className="mr-1 inline h-3.5 w-3.5 text-emerald-600" />Regra segura: arquivo sem aprovação explícita não entra automaticamente em campanhas, posts ou vídeos do Plano de Mídia.</span>
              <span>{visible.length} arquivo(s) neste filtro</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
