import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  ExternalLink,
  Layers3,
  Loader2,
  Play,
  RefreshCw,
  Sparkles,
} from "lucide-react";

const ACTIVE_BRIEFING_KEY = "vendorai_active_marketing_briefing_v1";
const MEDIA_PLAN_EXECUTION_KEY = "vendorai_media_plan_execution_v1";

const DIRECT_GENERATOR_TYPES = new Set(["feed", "stories", "carrossel", "linkedin_post"]);
const FINAL_STATUSES = new Set(["recusado", "pulado", "publicado"]);

interface CampaignChannel {
  canal: string;
  funcao: string;
  etapaFunil: string;
  formatos: string[];
  frequencia: string;
  quantidadeMateriais: number;
  kpiPrincipal: string;
}

interface MediaPlanCampaign {
  id: string;
  nome: string;
  objetivo: string;
  produtoServico: string;
  publico: string;
  regiao?: string;
  oferta: string;
  mensagemCentral: string;
  regraComunicacaoGeografica: string;
  canais: CampaignChannel[];
  kpiPrincipal: string;
  metaPrincipal: string;
}

interface MediaPlan {
  id: string;
  conteudo: {
    periodoDias?: 30 | 60 | 90;
    statusPlanejamento?: "gerado" | "em_revisao" | "aprovado";
    campanhas?: MediaPlanCampaign[];
  };
}

interface CalendarItem {
  id: string;
  mediaPlanId?: string | null;
  dataAgendada: string;
  pilar: string;
  temaSugerido: string;
  tipo: string;
  canal: string;
  status: string;
  contentGenerationId?: string | null;
  variationIdx?: number | null;
  contentIdPublicado?: string | null;
}

interface ContentGeneration {
  id: string;
  type: string;
  theme: string;
  result?: { variations?: unknown[] } | null;
  createdAt: string;
}

interface ContentHistory {
  items: ContentGeneration[];
  monthlyUsed: number;
  monthlyLimit: number;
}

interface MediaAsset {
  id: string;
  type: string;
  role: string;
  storageUrl: string;
  originalFilename?: string | null;
  source: string;
  metadata?: Record<string, unknown> | null;
}

interface MediaProject {
  id: string;
  title: string;
  kind: string;
  status: string;
  source: string;
  context?: Record<string, unknown> | null;
}

interface AutomaticReview {
  status: "ok" | "warning";
  checks: string[];
  warnings: string[];
  reviewedAt: string;
}

function authHeaders() {
  const token = localStorage.getItem("vendorai_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function campaignNameFromPilar(pilar: string) {
  const [campaign] = pilar.split(" · ");
  return campaign || "Campanha do período";
}

function contentPillarFromPilar(pilar: string) {
  const parts = pilar.split(" · ");
  return parts.length > 1 ? parts.slice(1).join(" · ") : pilar;
}

function calendarTypeToGenerator(type: string): "feed" | "stories" | "linkedin" | null {
  if (type === "feed" || type === "carrossel") return "feed";
  if (type === "stories") return "stories";
  if (type === "linkedin_post") return "linkedin";
  return null;
}

function mediaProjectKind(type: string) {
  if (type === "stories") return "story";
  if (type === "reels" || type === "youtube_short" || type === "tiktok") return "reel";
  if (type === "youtube_video") return "video";
  return "feed";
}

function normalizeMediaUrl(storageUrl: string) {
  if (storageUrl.startsWith("/objects/")) return `/api/storage${storageUrl}`;
  return storageUrl;
}

function campaignForItem(plan: MediaPlan | null, item: CalendarItem | null | undefined) {
  if (!plan || !item) return null;
  const campaignName = campaignNameFromPilar(item.pilar);
  return (plan.conteudo.campanhas ?? []).find(
    (campaign) => normalize(campaign.nome) === normalize(campaignName),
  ) ?? (plan.conteudo.campanhas ?? [])[0] ?? null;
}

function textTokens(value: string) {
  const stop = new Set([
    "para", "como", "com", "uma", "das", "dos", "por", "que", "seu", "sua", "seus", "suas",
    "de", "do", "da", "em", "no", "na", "nos", "nas", "the", "and", "com", "mais", "campanha",
  ]);
  return Array.from(new Set(
    normalize(value)
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length >= 4 && !stop.has(word)),
  ));
}

function selectRelevantOwnedMedia(
  assets: MediaAsset[],
  campaign: MediaPlanCampaign | null,
  item: CalendarItem,
  limit: number,
) {
  if (!campaign) return [];
  const keywords = textTokens(`${campaign.nome} ${campaign.produtoServico} ${item.temaSugerido}`);
  if (keywords.length === 0) return [];

  return assets
    .filter((asset) => asset.type === "image" && (asset.source === "upload" || asset.source === "imported"))
    .map((asset) => {
      let metadata = "";
      try { metadata = JSON.stringify(asset.metadata ?? {}); } catch { metadata = ""; }
      const haystack = normalize(`${asset.originalFilename ?? ""} ${metadata}`);
      const score = keywords.reduce((sum, keyword) => sum + (haystack.includes(keyword) ? 1 : 0), 0);
      return { asset, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.asset);
}

function runAutomaticReview(
  item: CalendarItem,
  campaign: MediaPlanCampaign | null,
  generated: ContentGeneration,
  selectedMedia: MediaAsset[],
): AutomaticReview {
  const checks: string[] = [];
  const warnings: string[] = [];
  const variations = Array.isArray(generated.result?.variations) ? generated.result!.variations! : [];
  const serialized = normalize(JSON.stringify(generated.result ?? {}));

  if (variations.length > 0) checks.push(`${variations.length} variação(ões) gerada(s)`);
  else warnings.push("A geração retornou sem variações de conteúdo.");

  if (serialized.length >= 80) checks.push("Conteúdo possui corpo suficiente para revisão");
  else warnings.push("O conteúdo gerado parece curto ou incompleto.");

  if (item.tipo === "stories") {
    if (serialized.includes("cta")) checks.push("CTA estruturado presente");
    else warnings.push("Stories sem CTA estruturado identificado.");
  }

  if (["feed", "stories", "carrossel"].includes(item.tipo)) {
    const hasMedia = serialized.includes("imageurl") || selectedMedia.length > 0;
    if (hasMedia) checks.push(selectedMedia.length > 0 ? "Mídia própria priorizada" : "Criativo visual presente");
    else warnings.push("Nenhuma mídia visual foi identificada na peça.");
  }

  if (campaign?.produtoServico) {
    const productTerms = textTokens(campaign.produtoServico).slice(0, 3);
    if (productTerms.length === 0 || productTerms.some((term) => serialized.includes(term))) {
      checks.push("Conteúdo coerente com o produto/serviço do plano");
    } else {
      warnings.push("Revise se o produto/serviço principal está suficientemente claro.");
    }
  }

  return {
    status: warnings.length > 0 ? "warning" : "ok",
    checks,
    warnings,
    reviewedAt: new Date().toISOString(),
  };
}

function derivedStatus(item: CalendarItem) {
  if (item.status === "publicado") return { label: "Publicado", tone: "success" as const };
  if (item.status === "recusado") return { label: "Recusado", tone: "muted" as const };
  if (item.status === "pulado") return { label: "Ignorado", tone: "muted" as const };
  if (item.status === "planejado") return { label: "Aguardando aprovação", tone: "muted" as const };
  if (item.status === "gerado" && item.contentGenerationId) return { label: "Em revisão", tone: "warning" as const };
  if (item.status === "gerado") return { label: "Em produção", tone: "warning" as const };
  if (item.status === "aprovado" && item.contentGenerationId) return { label: "Conteúdo aprovado", tone: "success" as const };
  if (item.status === "aprovado") return { label: "Pronto para produzir", tone: "ready" as const };
  return { label: item.status, tone: "muted" as const };
}

function statusClass(tone: ReturnType<typeof derivedStatus>["tone"]) {
  if (tone === "success") return "border-emerald-300 bg-emerald-50 text-emerald-700";
  if (tone === "warning") return "border-amber-300 bg-amber-50 text-amber-700";
  if (tone === "ready") return "border-primary/30 bg-primary/5 text-primary";
  return "";
}

export default function ContentProductionQueue({ tenantId }: { tenantId: string }) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [plan, setPlan] = useState<MediaPlan | null>(null);
  const [calendar, setCalendar] = useState<CalendarItem[]>([]);
  const [history, setHistory] = useState<ContentHistory | null>(null);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [projects, setProjects] = useState<MediaProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0, failed: 0 });
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const planRef = useRef<MediaPlan | null>(null);
  const calendarRef = useRef<CalendarItem[]>([]);
  const assetsRef = useRef<MediaAsset[]>([]);
  const projectsRef = useRef<MediaProject[]>([]);
  const historyRef = useRef<ContentHistory | null>(null);
  const refreshRef = useRef<() => Promise<void>>(async () => {});

  const query = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const requestedCalendarItemId = query.get("calendarItemId")?.trim() ?? "";
  const requestedCampaignId = query.get("campaignId")?.trim() ?? "";
  const requestedMediaPlanId = query.get("mediaPlanId")?.trim() ?? "";
  const fromMediaCalendar = query.get("from") === "media-calendar";

  const load = useCallback(async () => {
    if (!tenantId) return;
    try {
      const headers = authHeaders();
      const [planResponse, calendarResponse, contentResponse, assetsResponse, projectsResponse] = await Promise.all([
        fetch(`/api/tenants/${tenantId}/media-plan`, { headers }),
        fetch(`/api/tenants/${tenantId}/content-calendar`, { headers }),
        fetch(`/api/tenants/${tenantId}/content`, { headers }),
        fetch(`/api/tenants/${tenantId}/media/assets?type=image&limit=100`, { headers }),
        fetch(`/api/tenants/${tenantId}/media/projects?limit=100`, { headers }),
      ]);

      const nextPlan = planResponse.ok ? await planResponse.json() as MediaPlan | null : null;
      const rawCalendar = calendarResponse.ok ? await calendarResponse.json() as CalendarItem[] : [];
      const nextHistory = contentResponse.ok ? await contentResponse.json() as ContentHistory : null;
      const mediaPayload = assetsResponse.ok ? await assetsResponse.json() as { assets?: MediaAsset[] } : {};
      const projectPayload = projectsResponse.ok ? await projectsResponse.json() as { projects?: MediaProject[] } : {};
      const nextCalendar = nextPlan
        ? rawCalendar.filter((item) => item.mediaPlanId === nextPlan.id)
        : [];
      const nextProjects = (projectPayload.projects ?? []).filter((project) =>
        project.source === "content_generator" || project.context?.["calendarItemId"],
      );

      setPlan(nextPlan);
      setCalendar(nextCalendar);
      setHistory(nextHistory);
      setAssets(mediaPayload.assets ?? []);
      setProjects(nextProjects);
      planRef.current = nextPlan;
      calendarRef.current = nextCalendar;
      historyRef.current = nextHistory;
      assetsRef.current = mediaPayload.assets ?? [];
      projectsRef.current = nextProjects;
    } catch (error) {
      toast({
        title: "Não foi possível carregar a fila de produção",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [tenantId, toast]);

  refreshRef.current = load;

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  useEffect(() => {
    if (!tenantId || !plan) return;
    const timer = window.setInterval(() => { void load(); }, 8000);
    return () => window.clearInterval(timer);
  }, [tenantId, plan?.id, load]);

  const patchCalendarNative = useCallback(async (
    nativeFetch: typeof window.fetch,
    itemId: string,
    patch: Record<string, unknown>,
  ) => {
    const response = await nativeFetch(`/api/content-calendar/${itemId}`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!response.ok) throw new Error("Falha ao sincronizar a produção com o Plano de Mídia.");
    const updated = await response.json() as CalendarItem;
    const next = calendarRef.current.map((item) => item.id === itemId ? updated : item);
    calendarRef.current = next;
    setCalendar(next);
    return updated;
  }, []);

  const ensureMediaProject = useCallback(async (
    nativeFetch: typeof window.fetch,
    item: CalendarItem,
    campaign: MediaPlanCampaign | null,
  ) => {
    const existing = projectsRef.current.find((project) => project.context?.["calendarItemId"] === item.id);
    if (existing) return existing;

    const response = await nativeFetch(`/api/tenants/${tenantId}/media/projects`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `${campaign?.nome ?? "Plano de Mídia"} · ${item.temaSugerido}`,
        kind: mediaProjectKind(item.tipo),
        source: "content_generator",
        context: {
          source: "media-plan",
          mediaPlanId: item.mediaPlanId ?? planRef.current?.id,
          campaignId: campaign?.id,
          campaignName: campaign?.nome,
          calendarItemId: item.id,
          channel: item.canal,
          contentType: item.tipo,
          versionCount: 0,
          attemptCount: 0,
          failureCount: 0,
          lastStatus: "planned",
        },
      }),
    });
    if (!response.ok) throw new Error("Falha ao criar o histórico de versões na Central de Mídias.");
    const payload = await response.json() as { project: MediaProject };
    projectsRef.current = [payload.project, ...projectsRef.current];
    setProjects(projectsRef.current);
    return payload.project;
  }, [tenantId]);

  const recordProjectEvent = useCallback(async (
    nativeFetch: typeof window.fetch,
    item: CalendarItem,
    campaign: MediaPlanCampaign | null,
    event: {
      operation: string;
      label: string;
      status: string;
      contentGenerationId?: string;
      variationIndex?: number;
      review?: AutomaticReview;
      error?: string;
      selectedMedia?: MediaAsset[];
      generatedType?: string;
    },
  ) => {
    const project = await ensureMediaProject(nativeFetch, item, campaign);
    const currentContext = { ...(project.context ?? {}) };
    const currentVersions = Number(currentContext["versionCount"] ?? 0);
    const currentAttempts = Number(currentContext["attemptCount"] ?? 0);
    const currentFailures = Number(currentContext["failureCount"] ?? 0);
    const isSuccessfulGeneration = event.operation === "content_generation";
    const isFailure = event.operation === "generation_failed";
    const versionNumber = isSuccessfulGeneration ? currentVersions + 1 : currentVersions;

    const versionResponse = await nativeFetch(`/api/tenants/${tenantId}/media/projects/${project.id}/versions`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: event.operation,
        label: event.label,
        metadata: {
          source: "media-plan",
          mediaPlanId: item.mediaPlanId ?? planRef.current?.id,
          campaignId: campaign?.id,
          campaignName: campaign?.nome,
          calendarItemId: item.id,
          contentGenerationId: event.contentGenerationId,
          variationIndex: event.variationIndex ?? 0,
          contentVersion: versionNumber,
          channel: item.canal,
          contentType: item.tipo,
          generatedType: event.generatedType,
          scheduledDate: item.dataAgendada,
          theme: item.temaSugerido,
          status: event.status,
          automaticReview: event.review,
          error: event.error,
          mediaProvenance: (event.selectedMedia ?? []).map((asset) => ({
            assetId: asset.id,
            source: asset.source,
            role: asset.role,
            filename: asset.originalFilename,
          })),
          recordedAt: new Date().toISOString(),
        },
      }),
    });
    if (!versionResponse.ok) throw new Error("Falha ao registrar a versão do conteúdo.");

    const nextContext = {
      ...currentContext,
      versionCount: versionNumber,
      attemptCount: currentAttempts + (isSuccessfulGeneration || isFailure ? 1 : 0),
      failureCount: currentFailures + (isFailure ? 1 : 0),
      lastStatus: event.status,
      lastContentGenerationId: event.contentGenerationId ?? currentContext["lastContentGenerationId"],
      lastReviewStatus: event.review?.status ?? currentContext["lastReviewStatus"],
      lastReviewWarnings: event.review?.warnings ?? currentContext["lastReviewWarnings"],
      updatedFromPlanAt: new Date().toISOString(),
    };
    const projectResponse = await nativeFetch(`/api/tenants/${tenantId}/media/projects/${project.id}`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        status: event.status === "failed" ? project.status : "ready",
        context: nextContext,
      }),
    });
    if (projectResponse.ok) {
      const payload = await projectResponse.json() as { project: MediaProject };
      projectsRef.current = projectsRef.current.map((entry) => entry.id === project.id ? payload.project : entry);
      setProjects(projectsRef.current);
    }
  }, [ensureMediaProject, tenantId]);

  useEffect(() => {
    if (!tenantId || typeof window === "undefined") return;
    const nativeFetch = window.fetch.bind(window);

    const wrappedFetch: typeof window.fetch = async (input, init) => {
      const rawUrl = typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      const requestHeaders = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      const currentQuery = new URLSearchParams(window.location.search);
      const headerItemId = requestHeaders.get("x-vendorai-calendar-item-id")?.trim() ?? "";
      const calendarItemId = headerItemId || currentQuery.get("calendarItemId")?.trim() || "";
      const isGenerate = method === "POST" && rawUrl.includes(`/api/tenants/${tenantId}/content/generate`);
      const publishMatch = rawUrl.match(new RegExp(`/api/tenants/${tenantId}/content/([^/?]+)/publish-instagram`));
      const deleteMatch = method === "DELETE" ? rawUrl.match(new RegExp(`/api/tenants/${tenantId}/content/([^/?]+)$`)) : null;

      if (isGenerate && calendarItemId) {
        const item = calendarRef.current.find((entry) => entry.id === calendarItemId);
        if (!item) throw new Error("Esta ação não pertence mais ao Plano de Mídia atual. Atualize a fila antes de gerar.");
        if (["planejado", "recusado", "pulado", "publicado"].includes(item.status)) {
          throw new Error("Esta ação precisa estar aprovada e disponível para produção antes de gerar conteúdo.");
        }
        const campaign = campaignForItem(planRef.current, item);
        if (!campaign) throw new Error("A campanha vinculada a esta ação não foi encontrada.");

        let body: Record<string, unknown> = {};
        try {
          if (typeof init?.body === "string") body = JSON.parse(init.body) as Record<string, unknown>;
        } catch {
          body = {};
        }
        const previousStatus = item.status;
        const previousGenerationId = item.contentGenerationId ?? null;
        const siblingThemes = calendarRef.current
          .filter((entry) => entry.id !== item.id && campaignNameFromPilar(entry.pilar) === campaignNameFromPilar(item.pilar) && entry.contentGenerationId)
          .slice(-4)
          .map((entry) => entry.temaSugerido);
        const baseTheme = typeof body["theme"] === "string" && body["theme"].trim()
          ? String(body["theme"]).trim()
          : item.temaSugerido;
        const direction = [
          `Ação aprovada do Plano de Mídia: ${item.temaSugerido}`,
          `Campanha: ${campaign.nome}`,
          `Objetivo: ${campaign.objetivo}`,
          `Produto/serviço: ${campaign.produtoServico}`,
          `Público: ${campaign.publico}`,
          `Oferta: ${campaign.oferta}`,
          `Mensagem central: ${campaign.mensagemCentral}`,
          `Canal: ${item.canal}`,
          `Pilar: ${contentPillarFromPilar(item.pilar)}`,
          `Regra de comunicação: ${campaign.regraComunicacaoGeografica}`,
          siblingThemes.length > 0 ? `Evite repetir ganchos e abordagens já usados nestas ações: ${siblingThemes.join(" / ")}` : "",
        ].filter(Boolean).join(" | ");
        body["theme"] = `${baseTheme} | ${direction}`;
        if (!body["postObjective"]) body["postObjective"] = campaign.objetivo;

        let selectedMedia: MediaAsset[] = [];
        const userMaterial = Array.isArray(body["postMaterialUrls"]) && (body["postMaterialUrls"] as unknown[]).length > 0;
        if (!userMaterial && ["feed", "stories", "carrossel"].includes(item.tipo)) {
          selectedMedia = selectRelevantOwnedMedia(
            assetsRef.current,
            campaign,
            item,
            item.tipo === "carrossel" ? 4 : 1,
          );
          if (selectedMedia.length > 0) {
            body["postMaterialUrls"] = selectedMedia.map((asset) => normalizeMediaUrl(asset.storageUrl));
          }
        }

        await patchCalendarNative(nativeFetch, item.id, { status: "gerado" }).catch(() => undefined);
        const nextInit: RequestInit = {
          ...init,
          headers: requestHeaders,
          body: JSON.stringify(body),
        };
        const response = await nativeFetch(input, nextInit);
        let payload: (ContentGeneration & { error?: string }) | null = null;
        try { payload = await response.clone().json() as ContentGeneration & { error?: string }; } catch { payload = null; }

        if (response.ok && payload?.id) {
          const generated: ContentGeneration = payload;
          const review = runAutomaticReview(item, campaign, generated, selectedMedia);
          await patchCalendarNative(nativeFetch, item.id, {
            status: "gerado",
            contentGenerationId: generated.id,
            variationIdx: 0,
          });
          await recordProjectEvent(nativeFetch, item, campaign, {
            operation: "content_generation",
            label: `Versão de conteúdo · ${item.temaSugerido}`,
            status: "generated",
            contentGenerationId: generated.id,
            variationIndex: 0,
            review,
            selectedMedia,
            generatedType: generated.type,
          }).catch(() => undefined);
          window.setTimeout(() => { void refreshRef.current(); }, 150);
        } else {
          await patchCalendarNative(nativeFetch, item.id, {
            status: previousStatus,
            contentGenerationId: previousGenerationId,
          }).catch(() => undefined);
          await recordProjectEvent(nativeFetch, item, campaign, {
            operation: "generation_failed",
            label: `Falha de geração · ${item.temaSugerido}`,
            status: "failed",
            error: payload?.error ?? `HTTP ${response.status}`,
            selectedMedia,
          }).catch(() => undefined);
        }
        return response;
      }

      const response = await nativeFetch(input, init);

      if (method === "POST" && publishMatch && response.ok) {
        const contentGenerationId = publishMatch[1] ?? "";
        const item = calendarRef.current.find((entry) => entry.contentGenerationId === contentGenerationId);
        if (item) {
          const campaign = campaignForItem(planRef.current, item);
          await patchCalendarNative(nativeFetch, item.id, { status: "publicado" }).catch(() => undefined);
          await recordProjectEvent(nativeFetch, item, campaign, {
            operation: "publication",
            label: `Publicado · ${item.temaSugerido}`,
            status: "published",
            contentGenerationId,
            variationIndex: item.variationIdx ?? 0,
          }).catch(() => undefined);
          window.setTimeout(() => { void refreshRef.current(); }, 150);
        }
      }

      if (deleteMatch && response.ok) {
        const contentGenerationId = deleteMatch[1] ?? "";
        const item = calendarRef.current.find((entry) => entry.contentGenerationId === contentGenerationId);
        if (item) {
          const campaign = campaignForItem(planRef.current, item);
          await patchCalendarNative(nativeFetch, item.id, {
            status: "aprovado",
            contentGenerationId: null,
            variationIdx: null,
          }).catch(() => undefined);
          await recordProjectEvent(nativeFetch, item, campaign, {
            operation: "content_removed",
            label: `Versão removida · ${item.temaSugerido}`,
            status: "ready_for_production",
            contentGenerationId,
          }).catch(() => undefined);
          window.setTimeout(() => { void refreshRef.current(); }, 150);
        }
      }

      return response;
    };

    window.fetch = wrappedFetch;
    return () => {
      if (window.fetch === wrappedFetch) window.fetch = nativeFetch;
    };
  }, [patchCalendarNative, recordProjectEvent, tenantId]);

  const visibleItems = useMemo(() => {
    if (!plan) return [];
    if (!requestedCampaignId) return calendar;
    const campaign = (plan.conteudo.campanhas ?? []).find((entry) => entry.id === requestedCampaignId);
    if (!campaign) return calendar;
    return calendar.filter((item) => normalize(campaignNameFromPilar(item.pilar)) === normalize(campaign.nome));
  }, [calendar, plan, requestedCampaignId]);

  const currentItem = useMemo(
    () => calendar.find((item) => item.id === requestedCalendarItemId) ?? null,
    [calendar, requestedCalendarItemId],
  );
  const currentCampaign = campaignForItem(plan, currentItem);

  const projectByItem = useMemo(() => {
    const map = new Map<string, MediaProject>();
    projects.forEach((project) => {
      const itemId = typeof project.context?.["calendarItemId"] === "string" ? String(project.context?.["calendarItemId"]) : "";
      if (itemId) map.set(itemId, project);
    });
    return map;
  }, [projects]);

  const productionSummary = useMemo(() => {
    const values = { ready: 0, review: 0, approved: 0, published: 0, pending: 0 };
    visibleItems.forEach((item) => {
      const status = derivedStatus(item).label;
      if (status === "Pronto para produzir") values.ready += 1;
      else if (status === "Em revisão" || status === "Em produção") values.review += 1;
      else if (status === "Conteúdo aprovado") values.approved += 1;
      else if (status === "Publicado") values.published += 1;
      else if (!FINAL_STATUSES.has(item.status)) values.pending += 1;
    });
    return values;
  }, [visibleItems]);

  const batchEligible = useMemo(
    () => visibleItems.filter((item) => item.status === "aprovado" && !item.contentGenerationId && DIRECT_GENERATOR_TYPES.has(item.tipo)),
    [visibleItems],
  );

  function buildMarketingContext(campaign: MediaPlanCampaign, item: CalendarItem) {
    const channel = campaign.canais.find((entry) => normalize(entry.canal) === normalize(item.canal));
    return {
      nicheId: `media-plan:${campaign.id}`,
      nicheName: `${item.canal} · ${item.temaSugerido}`,
      productIds: [`custom:media-plan:${campaign.id}`],
      productNames: [campaign.produtoServico],
      audienceSegment: campaign.publico,
      audienceNiche: campaign.publico,
      campaignGoal: `${item.temaSugerido}. Objetivo da campanha: ${campaign.objetivo}. Direção: ${campaign.mensagemCentral}`,
      locationRegion: campaign.regiao,
      projectName: campaign.nome,
      specificDetails: [
        `Ação do calendário: ${item.temaSugerido}`,
        `Canal: ${item.canal}`,
        `Formato: ${item.tipo.replaceAll("_", " ")}`,
        `Pilar: ${contentPillarFromPilar(item.pilar)}`,
        `Oferta: ${campaign.oferta}`,
        channel?.funcao ? `Função desta mídia: ${channel.funcao}` : "",
      ].filter(Boolean).join(" | "),
      mandatoryDifferentiators: campaign.mensagemCentral,
      restrictions: campaign.regraComunicacaoGeografica,
      primaryKpi: channel?.kpiPrincipal || campaign.kpiPrincipal,
      campaignId: campaign.id,
      campaignName: campaign.nome,
    };
  }

  function openExecutor(item: CalendarItem) {
    if (!plan || plan.conteudo.statusPlanejamento !== "aprovado") {
      toast({ title: "Aprove o Plano de Mídia antes da produção", variant: "destructive" });
      return;
    }
    if (!["aprovado", "gerado"].includes(item.status)) {
      toast({ title: "Esta ação não está disponível para produção", variant: "destructive" });
      return;
    }
    const campaign = campaignForItem(plan, item);
    if (!campaign) return;
    const marketingContext = buildMarketingContext(campaign, item);
    sessionStorage.setItem(ACTIVE_BRIEFING_KEY, JSON.stringify({
      tenantId,
      campaignId: campaign.id,
      campaignName: campaign.nome,
      marketingContext,
    }));
    sessionStorage.setItem(MEDIA_PLAN_EXECUTION_KEY, JSON.stringify({
      source: "media-calendar",
      tenantId,
      mediaPlanId: plan.id,
      periodoDias: plan.conteudo.periodoDias,
      campaign,
      calendarItem: item,
      marketingContext,
      savedAt: new Date().toISOString(),
    }));

    const common = new URLSearchParams({
      from: "media-calendar",
      mediaPlanId: plan.id,
      campaignId: campaign.id,
      calendarItemId: item.id,
    }).toString();
    if (["reels", "youtube_short", "youtube_video", "tiktok"].includes(item.tipo)) {
      navigate(`/content-studio/video?${common}`);
      return;
    }
    if (["meta_ad", "search_ad", "display_ad", "performance_max"].includes(item.tipo)) {
      navigate(`/ads?${common}`);
      return;
    }
    if (["landing_page", "site"].includes(item.tipo)) {
      navigate(`/content?tab=campanhas&view=lp&${common}`);
      return;
    }
    if (item.tipo === "blog") {
      navigate(`/content-autopilot?${common}`);
      return;
    }
    if (["whatsapp", "email"].includes(item.tipo)) {
      navigate(`/content?tab=campanhas&view=organicas&${common}`);
      return;
    }
    if (item.tipo === "sms") {
      toast({
        title: "SMS ainda não tem executor nativo",
        description: "A ação continua preservada no plano até existir uma integração real de SMS.",
      });
      return;
    }
    navigate(`/content?tab=gerador&${common}`);
  }

  async function approveContent(item: CalendarItem) {
    if (!item.contentGenerationId) return;
    const campaign = campaignForItem(plan, item);
    setActionBusy(item.id);
    try {
      const response = await fetch(`/api/content-calendar/${item.id}`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ status: "aprovado" }),
      });
      if (!response.ok) throw new Error("Falha ao aprovar o conteúdo.");
      const updated = await response.json() as CalendarItem;
      setCalendar((current) => current.map((entry) => entry.id === item.id ? updated : entry));
      calendarRef.current = calendarRef.current.map((entry) => entry.id === item.id ? updated : entry);
      const nativeFetch = window.fetch.bind(window);
      await recordProjectEvent(nativeFetch, updated, campaign, {
        operation: "content_approval",
        label: `Conteúdo aprovado · ${item.temaSugerido}`,
        status: "approved",
        contentGenerationId: item.contentGenerationId,
        variationIndex: item.variationIdx ?? 0,
      }).catch(() => undefined);
      toast({ title: "Conteúdo aprovado", description: "O status voltou para o Plano de Mídia e a aprovação foi registrada no histórico." });
      await load();
    } catch (error) {
      toast({ title: "Não foi possível aprovar", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
    } finally {
      setActionBusy(null);
    }
  }

  async function runBatch() {
    if (!plan || batchEligible.length === 0) return;
    setBatchRunning(true);
    setBatchProgress({ done: 0, total: batchEligible.length, failed: 0 });
    let failed = 0;
    for (let index = 0; index < batchEligible.length; index += 1) {
      const item = batchEligible[index]!;
      const campaign = campaignForItem(plan, item);
      const generatedType = calendarTypeToGenerator(item.tipo);
      if (!campaign || !generatedType) continue;
      try {
        const response = await fetch(`/api/tenants/${tenantId}/content/generate`, {
          method: "POST",
          headers: {
            ...authHeaders(),
            "Content-Type": "application/json",
            "x-vendorai-calendar-item-id": item.id,
            "x-vendorai-media-plan-id": plan.id,
            "x-vendorai-campaign-id": campaign.id,
          },
          body: JSON.stringify({
            type: generatedType,
            theme: item.temaSugerido,
            variations: 1,
            imageCount: item.tipo === "carrossel" ? 4 : 1,
            contentFormat: item.tipo === "stories" ? "stories" : "feed_portrait",
            aspectRatio: item.tipo === "stories" ? "9:16" : "4:5",
            postObjective: campaign.objetivo,
          }),
        });
        if (!response.ok) {
          failed += 1;
          if (response.status === 402) {
            const payload = await response.json().catch(() => ({ error: "Limite de gerações atingido." })) as { error?: string };
            throw new Error(payload.error ?? "Limite de gerações atingido.");
          }
        }
      } catch (error) {
        failed += 1;
        if (error instanceof Error && error.message.toLowerCase().includes("limite")) {
          toast({ title: "Lote interrompido", description: error.message, variant: "destructive" });
          setBatchProgress({ done: index + 1, total: batchEligible.length, failed });
          break;
        }
      }
      setBatchProgress({ done: index + 1, total: batchEligible.length, failed });
    }
    setBatchRunning(false);
    await load();
    toast({
      title: failed === 0 ? "Lote enviado para revisão" : "Lote concluído com pendências",
      description: failed === 0
        ? "As peças compatíveis com o Gerador foram criadas e vinculadas ao Plano de Mídia."
        : `${failed} peça(s) não foram geradas; elas permaneceram aprovadas para nova tentativa.`,
      variant: failed === 0 ? "default" : "destructive",
    });
  }

  if (loading) {
    return (
      <div className="px-4 pt-4 md:px-6">
        <Card><CardContent className="py-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando fila do Plano de Mídia…</CardContent></Card>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="px-4 pt-4 md:px-6">
        <Card className="border-dashed">
          <CardContent className="py-4 flex items-start gap-3">
            <Sparkles className="h-4 w-4 mt-0.5 text-primary" />
            <div>
              <p className="text-sm font-medium">Criação avulsa</p>
              <p className="text-xs text-muted-foreground mt-0.5">Nenhum Plano de Mídia ativo foi encontrado. O Gerador continua disponível normalmente abaixo.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const planApproved = plan.conteudo.statusPlanejamento === "aprovado";
  const currentProject = currentItem ? projectByItem.get(currentItem.id) : undefined;

  return (
    <div className="px-4 pt-4 md:px-6 space-y-3">
      <Card className="border-primary/20 bg-primary/[0.02]">
        <CardContent className="py-4 space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="gap-1"><Layers3 className="h-3 w-3" />Conteúdos do plano</Badge>
                <Badge className={planApproved ? "bg-emerald-600" : ""}>{planApproved ? "Plano aprovado" : "Plano em revisão"}</Badge>
                <span className="text-xs text-muted-foreground">{plan.conteudo.periodoDias ?? 30} dias</span>
              </div>
              <p className="mt-2 text-sm font-semibold">Fila oficial de produção</p>
              <p className="text-xs text-muted-foreground mt-0.5 max-w-3xl">
                Cada ação aprovada mantém campanha, público, oferta, canal, data, KPI e direção criativa. Mídias próprias relevantes são priorizadas; novas versões, aprovações, falhas e publicações ficam registradas na Central de Mídias.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
                <RefreshCw className="h-3.5 w-3.5 mr-1" />Atualizar
              </Button>
              {batchEligible.length > 0 && planApproved && (
                <Button type="button" size="sm" onClick={() => void runBatch()} disabled={batchRunning}>
                  {batchRunning ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
                  {batchRunning ? `${batchProgress.done}/${batchProgress.total}` : `Gerar lote (${batchEligible.length})`}
                </Button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {[
              ["Prontos", productionSummary.ready],
              ["Em revisão", productionSummary.review],
              ["Aprovados", productionSummary.approved],
              ["Publicados", productionSummary.published],
              ["Outros", productionSummary.pending],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-md border bg-background px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
                <p className="text-lg font-semibold mt-0.5">{value}</p>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
            <span>{history?.monthlyUsed ?? 0}/{history?.monthlyLimit ?? 20} gerações usadas no período de consumo atual.</span>
            {batchEligible.length > 0 && <span>O lote usa até {batchEligible.length} geração(ões); vídeos, anúncios, LPs e mensagens continuam nos executores próprios.</span>}
            {assets.filter((asset) => asset.type === "image" && ["upload", "imported"].includes(asset.source)).length > 0 && (
              <span>Central de Mídias conectada: materiais próprios só entram automaticamente quando houver correspondência com produto/tema.</span>
            )}
          </div>
        </CardContent>
      </Card>

      {fromMediaCalendar && currentItem && (
        <Card className="border-primary/30">
          <CardContent className="py-3 flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary">Executando agora</Badge>
                <Badge variant="outline">{currentItem.canal}</Badge>
                <Badge variant="outline">{currentItem.tipo.replaceAll("_", " ")}</Badge>
                <Badge variant="outline" className={statusClass(derivedStatus(currentItem).tone)}>{derivedStatus(currentItem).label}</Badge>
              </div>
              <p className="mt-2 text-sm font-medium">{currentItem.temaSugerido}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{currentCampaign?.nome} · previsto para {new Date(`${currentItem.dataAgendada}T12:00:00`).toLocaleDateString("pt-BR")}</p>
              {currentProject && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  {Number(currentProject.context?.["versionCount"] ?? 0)} versão(ões) · {Number(currentProject.context?.["failureCount"] ?? 0)} falha(s) registrada(s)
                  {currentProject.context?.["lastReviewStatus"] === "warning" ? " · revisão automática com alerta" : currentProject.context?.["lastReviewStatus"] === "ok" ? " · revisão automática OK" : ""}
                </p>
              )}
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => navigate("/content?tab=planejamento")}>
              Ver no planejamento <ExternalLink className="h-3.5 w-3.5 ml-1" />
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {visibleItems.slice(0, requestedCampaignId ? 20 : 12).map((item) => {
          const status = derivedStatus(item);
          const project = projectByItem.get(item.id);
          const versionCount = Number(project?.context?.["versionCount"] ?? 0);
          const failureCount = Number(project?.context?.["failureCount"] ?? 0);
          const reviewWarning = project?.context?.["lastReviewStatus"] === "warning";
          return (
            <div key={item.id} className={`rounded-lg border bg-background px-3 py-2.5 ${item.id === requestedCalendarItemId ? "ring-1 ring-primary/40" : ""}`}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="outline" className="text-[10px]">{item.canal}</Badge>
                    <Badge variant="outline" className="text-[10px]">{item.tipo.replaceAll("_", " ")}</Badge>
                    <Badge variant="outline" className={`text-[10px] ${statusClass(status.tone)}`}>{status.label}</Badge>
                    {versionCount > 0 && <span className="text-[10px] text-muted-foreground">v{versionCount}</span>}
                    {failureCount > 0 && <span className="text-[10px] text-amber-700">{failureCount} tentativa(s) com falha</span>}
                    {reviewWarning && <span className="inline-flex items-center gap-1 text-[10px] text-amber-700"><AlertTriangle className="h-3 w-3" />revisar alertas</span>}
                  </div>
                  <p className="mt-1.5 text-sm font-medium line-clamp-2">{item.temaSugerido}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{campaignNameFromPilar(item.pilar)} · {new Date(`${item.dataAgendada}T12:00:00`).toLocaleDateString("pt-BR")}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {item.status === "gerado" && item.contentGenerationId && (
                    <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={actionBusy === item.id} onClick={() => void approveContent(item)}>
                      {actionBusy === item.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}Aprovar
                    </Button>
                  )}
                  {["aprovado", "gerado"].includes(item.status) && (
                    <Button type="button" size="sm" variant={item.contentGenerationId ? "ghost" : "outline"} className="h-7 text-xs" onClick={() => openExecutor(item)}>
                      {item.contentGenerationId ? <RefreshCw className="h-3 w-3 mr-1" /> : <Play className="h-3 w-3 mr-1" />}
                      {item.contentGenerationId ? "Nova versão" : "Produzir"}
                    </Button>
                  )}
                  {item.status === "planejado" && <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><CircleDashed className="h-3 w-3" />aprovar no plano</span>}
                </div>
              </div>
            </div>
          );
        })}
        {visibleItems.length === 0 && (
          <div className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">Nenhuma ação de produção encontrada para este plano.</div>
        )}
      </div>

      <div className="flex items-center gap-2 text-[11px] text-muted-foreground px-1">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
        O Gerador abaixo fica vinculado à ação selecionada quando você entra por “Produzir”. Sem uma ação selecionada, ele funciona como criação avulsa e não altera o Plano de Mídia.
      </div>
    </div>
  );
}
