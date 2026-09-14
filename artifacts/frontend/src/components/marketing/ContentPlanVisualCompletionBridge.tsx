import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ImagePlus, Loader2 } from "lucide-react";

const USER_CACHE_KEY = "vendorai_user_cache";
const OVERRIDE_KEY = "vendorai_sa_tenant_override";
const HOST_ATTR = "data-vendorai-content-visual-completion";
const RETRYABLE_IMAGE_STATUSES = new Set([429, 502, 503, 504]);
const MAX_IMAGE_ATTEMPTS = 3;

const CALENDAR_VISUAL_TYPES = new Set(["feed", "stories", "carrossel", "linkedin_post"]);
const GENERATOR_VISUAL_TYPES = new Set(["feed", "stories", "linkedin"]);

type CachedUser = { tenantId?: string | null };
type CachedOverride = { id?: string | null };

type CalendarItem = {
  id: string;
  tipo: string;
  status: string;
  contentGenerationId?: string | null;
  variationIdx?: number | null;
};

type GenerationVariation = Record<string, unknown>;
type ContentGeneration = {
  id: string;
  result?: { variations?: GenerationVariation[] } | null;
};

type ContentHistory = {
  items?: ContentGeneration[];
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
  const token = localStorage.getItem("vendorai_token") ?? "";
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

function variationHasVisual(variation: unknown): boolean {
  if (!variation || typeof variation !== "object" || Array.isArray(variation)) return false;
  const value = variation as Record<string, unknown>;
  if (typeof value.imageUrl === "string" && value.imageUrl.trim()) return true;
  if (Array.isArray(value.imageUrls) && value.imageUrls.some((url) => typeof url === "string" && url.trim())) return true;
  return false;
}

function generationHasVisual(generation: ContentGeneration | null | undefined, variationIdx = 0): boolean {
  const variations = Array.isArray(generation?.result?.variations) ? generation!.result!.variations! : [];
  return variationHasVisual(variations[variationIdx] ?? variations[0]);
}

function desiredImageCount(calendarType: string, requested?: unknown): number {
  if (calendarType === "carrossel") return 4;
  const parsed = typeof requested === "number" ? requested : Number(requested ?? 1);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(calendarType === "stories" ? 1 : 4, Math.trunc(parsed)));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function regenerateVisual(
  fetcher: typeof window.fetch,
  tenantId: string,
  contentId: string,
  imageCount: number,
  referenceImageUrl?: string,
): Promise<string[]> {
  let lastError = "A geração visual não retornou imagem.";

  for (let attempt = 1; attempt <= MAX_IMAGE_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetcher(`/api/tenants/${tenantId}/content/${contentId}/variations/0/regenerate-image`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({
          imageCount,
          ...(referenceImageUrl ? { referenceImageUrl } : {}),
          observations: "Criativo visual do Plano de Mídia. Preserve produto, marca e contexto do briefing; produza imagem profissional pronta para publicação, sem texto inventado nem marca d'água.",
        }),
      });
      const payload = await response.json().catch(() => ({})) as { imageUrls?: string[]; error?: string };
      if (response.ok && Array.isArray(payload.imageUrls) && payload.imageUrls.length > 0) {
        return payload.imageUrls;
      }

      lastError = payload.error || `A geração visual falhou (HTTP ${response.status}).`;
      if (!RETRYABLE_IMAGE_STATUSES.has(response.status) || attempt === MAX_IMAGE_ATTEMPTS) {
        break;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Falha de rede ao gerar imagem.";
      if (attempt === MAX_IMAGE_ATTEMPTS) break;
    }

    await sleep(700 * (2 ** (attempt - 1)));
  }

  throw new Error(lastError);
}

function patchGenerationPayload(payload: ContentGeneration, imageUrls: string[]): ContentGeneration {
  const variations = Array.isArray(payload.result?.variations)
    ? payload.result!.variations!.map((variation) => ({ ...variation }))
    : [];
  if (variations.length === 0) return payload;
  variations[0] = {
    ...variations[0],
    imageUrl: imageUrls[0],
    imageUrls: imageUrls.length > 1 ? imageUrls : undefined,
  };
  return { ...payload, result: { ...(payload.result ?? {}), variations } };
}

function refreshProductionView() {
  const refreshButton = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (button) => (button.textContent ?? "").replace(/\s+/g, " ").trim() === "Atualizar",
  );
  refreshButton?.click();
}

export function ContentPlanVisualCompletionBridge() {
  const tenantId = currentTenantId();
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const [search, setSearch] = useState(() => window.location.search);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [incomplete, setIncomplete] = useState<CalendarItem[]>([]);
  const [repairing, setRepairing] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, failed: 0 });
  const [lastError, setLastError] = useState("");
  const nativeFetchRef = useRef<typeof window.fetch | null>(null);

  const onPlanContent = useMemo(() => {
    if (pathname !== "/content") return false;
    const params = new URLSearchParams(search);
    return params.get("mode") !== "avulso";
  }, [pathname, search]);

  useEffect(() => {
    const update = () => {
      setPathname(window.location.pathname);
      setSearch(window.location.search);
    };
    window.addEventListener("popstate", update);
    const timer = window.setInterval(update, 350);
    return () => {
      window.removeEventListener("popstate", update);
      window.clearInterval(timer);
    };
  }, []);

  const loadIncomplete = useCallback(async () => {
    if (!tenantId || !onPlanContent) {
      setIncomplete([]);
      return;
    }
    try {
      const [calendarResponse, contentResponse] = await Promise.all([
        fetch(`/api/tenants/${tenantId}/content-calendar`, { headers: authHeaders() }),
        fetch(`/api/tenants/${tenantId}/content`, { headers: authHeaders() }),
      ]);
      if (!calendarResponse.ok || !contentResponse.ok) return;
      const calendarPayload = await calendarResponse.json().catch(() => []) as CalendarItem[];
      const historyPayload = await contentResponse.json().catch(() => ({})) as ContentHistory;
      const generationById = new Map((historyPayload.items ?? []).map((entry) => [entry.id, entry]));
      const next = (Array.isArray(calendarPayload) ? calendarPayload : []).filter((item) => {
        if (item.status !== "gerado" || !item.contentGenerationId || !CALENDAR_VISUAL_TYPES.has(item.tipo)) return false;
        const generation = generationById.get(item.contentGenerationId);
        // O endpoint de histórico é resumido. Ausência no recorte não significa imagem ausente.
        // Só sinalizamos pendência quando a geração está realmente presente e sem visual.
        if (!generation) return false;
        return !generationHasVisual(generation, item.variationIdx ?? 0);
      });
      setIncomplete(next);
    } catch {
      // Best-effort: a fila principal continua funcionando mesmo sem o contador auxiliar.
    }
  }, [onPlanContent, tenantId]);

  useEffect(() => {
    void loadIncomplete();
    if (!onPlanContent) return;
    const timer = window.setInterval(() => { void loadIncomplete(); }, 12000);
    return () => window.clearInterval(timer);
  }, [loadIncomplete, onPlanContent]);

  // Próximas peças do Plano de Mídia: se o gerador textual voltar sem imagem,
  // completa o criativo ANTES de devolver a resposta para a fila. Assim a
  // revisão automática recebe uma peça realmente pronta, não só a legenda.
  useEffect(() => {
    const previousFetch = window.fetch.bind(window);
    nativeFetchRef.current = previousFetch;

    const visualAwareFetch: typeof window.fetch = async (input, init = {}) => {
      const response = await previousFetch(input, init);
      try {
        const requestUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        const url = new URL(requestUrl, window.location.origin);
        const method = (init.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
        const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined));
        const calendarItemId = headers.get("x-vendorai-calendar-item-id");
        const isPlanGeneration = method === "POST"
          && Boolean(calendarItemId)
          && /^\/api\/tenants\/[^/]+\/content\/generate\/?$/.test(url.pathname)
          && response.ok
          && typeof init.body === "string";
        if (!isPlanGeneration) return response;

        const requestBody = JSON.parse(init.body as string) as Record<string, unknown>;
        const generatorType = typeof requestBody.type === "string" ? requestBody.type : "";
        if (!GENERATOR_VISUAL_TYPES.has(generatorType)) return response;

        const payload = await response.clone().json() as ContentGeneration;
        if (!payload?.id || generationHasVisual(payload, 0)) return response;

        const materialUrls = Array.isArray(requestBody.postMaterialUrls)
          ? requestBody.postMaterialUrls.filter((value): value is string => typeof value === "string" && value.length > 0)
          : [];
        if (materialUrls.length > 0) return response;

        const referenceUrls = Array.isArray(requestBody.imageUrls)
          ? requestBody.imageUrls.filter((value): value is string => typeof value === "string" && value.length > 0)
          : [];
        const count = Math.max(1, Math.min(4, Number(requestBody.imageCount ?? 1) || 1));
        const generatedUrls = await regenerateVisual(previousFetch, tenantId || url.pathname.split("/")[3] || "", payload.id, count, referenceUrls[0]);
        const completedPayload = patchGenerationPayload(payload, generatedUrls);
        const nextHeaders = new Headers(response.headers);
        nextHeaders.set("content-type", "application/json");
        window.setTimeout(() => { void loadIncomplete(); }, 250);
        return new Response(JSON.stringify(completedPayload), {
          status: response.status,
          statusText: response.statusText,
          headers: nextHeaders,
        });
      } catch {
        return response;
      }
    };

    window.fetch = visualAwareFetch;
    return () => {
      if (window.fetch === visualAwareFetch) window.fetch = previousFetch;
    };
  }, [loadIncomplete, tenantId]);

  useEffect(() => {
    if (!onPlanContent) {
      setHost(null);
      return;
    }
    let portalHost = document.querySelector<HTMLElement>(`[${HOST_ATTR}]`);
    if (!portalHost) {
      portalHost = document.createElement("div");
      portalHost.setAttribute(HOST_ATTR, "true");
      portalHost.className = "inline-flex";
    }

    const attach = () => {
      const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button"));
      const anchor = buttons.find((button) => {
        const text = (button.textContent ?? "").trim().toLowerCase();
        return text.includes("adicionar mídias") || text.includes("adicionar/organizar mídias");
      }) ?? buttons.find((button) => (button.textContent ?? "").trim() === "Atualizar");
      const parent = anchor?.parentElement;
      if (!parent || !portalHost) return;
      if (portalHost.parentElement !== parent) parent.appendChild(portalHost);
      setHost((current) => current === portalHost ? current : portalHost);
    };

    attach();
    const timer = window.setInterval(attach, 500);
    return () => {
      window.clearInterval(timer);
      portalHost?.remove();
    };
  }, [onPlanContent]);

  const repairAll = useCallback(async () => {
    if (!tenantId || incomplete.length === 0 || repairing) return;
    const totalImages = incomplete.reduce((sum, item) => sum + desiredImageCount(item.tipo), 0);
    const confirmed = window.confirm(
      `Gerar imagens para ${incomplete.length} peça(s) sem criativo? A IA vai gerar aproximadamente ${totalImages} imagem(ns), reaproveitando os textos já prontos.`,
    );
    if (!confirmed) return;

    setLastError("");
    setRepairing(true);
    setProgress({ done: 0, total: incomplete.length, failed: 0 });
    let failed = 0;
    let firstError = "";
    const fetcher = nativeFetchRef.current ?? window.fetch.bind(window);

    for (let index = 0; index < incomplete.length; index += 1) {
      const item = incomplete[index]!;
      try {
        await regenerateVisual(fetcher, tenantId, item.contentGenerationId!, desiredImageCount(item.tipo));
      } catch (error) {
        failed += 1;
        if (!firstError) {
          firstError = error instanceof Error ? error.message : "Falha desconhecida ao gerar imagem.";
        }
      }
      setProgress({ done: index + 1, total: incomplete.length, failed });
    }

    await loadIncomplete();
    refreshProductionView();
    setRepairing(false);

    if (failed > 0) {
      setLastError(
        `${failed} de ${incomplete.length} peça(s) permaneceram sem imagem após as tentativas automáticas. ${firstError} Os textos e as imagens concluídas foram preservados.`,
      );
    }
  }, [incomplete, loadIncomplete, repairing, tenantId]);

  if (!host || incomplete.length === 0) return null;

  return createPortal(
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        data-vendorai-visual-completion-action="true"
        onClick={() => void repairAll()}
        disabled={repairing}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
        title="Gera apenas as imagens que faltam, preservando os textos já criados"
      >
        {repairing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
        {repairing
          ? `Gerando ${progress.done}/${progress.total}${progress.failed ? ` · ${progress.failed} pendente(s)` : ""}`
          : `Gerar imagens faltantes (${incomplete.length})`}
      </button>
      {lastError ? (
        <p className="max-w-xl text-xs font-medium text-destructive" role="alert">
          {lastError}
        </p>
      ) : null}
    </div>,
    host,
  );
}
