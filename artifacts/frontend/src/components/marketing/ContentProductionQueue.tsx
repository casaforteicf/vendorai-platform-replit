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
  Eye,
  Film,
  Image as ImageIcon,
  Layers3,
  Library,
  Loader2,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

const ACTIVE_BRIEFING_KEY = "vendorai_active_marketing_briefing_v1";
const MEDIA_PLAN_EXECUTION_KEY = "vendorai_media_plan_execution_v1";

const DIRECT_GENERATOR_TYPES = new Set(["feed", "stories", "carrossel", "linkedin_post"]);
const VIDEO_TYPES = new Set(["reels", "youtube_short", "youtube_video", "tiktok"]);
const FINAL_STATUSES = new Set(["recusado", "pulado", "publicado"]);

const EDITABLE_CONTENT_TYPES = [
  ["feed", "Feed"],
  ["stories", "Stories"],
  ["reels", "Reels"],
  ["carrossel", "Carrossel"],
  ["meta_ad", "Meta Ads"],
  ["search_ad", "Google Search"],
  ["display_ad", "Google Display"],
  ["performance_max", "Performance Max"],
  ["youtube_short", "YouTube Short"],
  ["youtube_video", "YouTube Vídeo"],
  ["tiktok", "TikTok"],
  ["linkedin_post", "LinkedIn"],
  ["whatsapp", "WhatsApp"],
  ["email", "E-mail"],
  ["blog", "Blog / SEO"],
  ["landing_page", "Landing Page"],
  ["site", "Site"],
  ["sms", "SMS"],
] as const;

type AssetType = "image" | "video" | string;

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

interface CalendarItemDraft {
  temaSugerido: string;
  dataAgendada: string;
  canal: string;
  tipo: string;
  contentPillar: string;
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
  type: AssetType;
  role: string;
  storageUrl: string;
  originalFilename?: string | null;
  mimeType?: string | null;
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

function normalizeMediaUrl(storageUrl: string) {
  if (storageUrl.startsWith("/objects/")) return `/api/storage${storageUrl}`;
  return storageUrl;
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
  if (VIDEO_TYPES.has(type)) return type === "youtube_video" ? "video" : "reel";
  return "feed";
}

function campaignForItem(plan: MediaPlan | null, item: CalendarItem | null | undefined) {
  if (!plan || !item) return null;
  const campaignName = campaignNameFromPilar(item.pilar);
  return (plan.conteudo.campanhas ?? []).find(
    (campaign) => normalize(campaign.nome) === normalize(campaignName),
  ) ?? null;
}

function textTokens(value: string) {
  const stop = new Set([
    "para", "como", "com", "uma", "das", "dos", "por", "que", "seu", "sua", "seus", "suas",
    "de", "do", "da", "em", "no", "na", "nos", "nas", "the", "and", "mais", "campanha", "periodo",
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
  allowedTypes: AssetType[] = ["image"],
) {
  if (!campaign) return [];
  const keywords = textTokens([
    campaign.nome,
    campaign.produtoServico,
    campaign.publico,
    campaign.mensagemCentral,
    item.temaSugerido,
    item.canal,
  ].join(" "));
  const allowed = new Set(allowedTypes);

  return assets
    .filter((asset) => allowed.has(asset.type) && (asset.source === "upload" || asset.source === "imported"))
    .map((asset) => {
      let metadata = "";
      try { metadata = JSON.stringify(asset.metadata ?? {}); } catch { metadata = ""; }
      const haystack = normalize(`${asset.originalFilename ?? ""} ${asset.role ?? ""} ${metadata}`);
      const score = keywords.reduce((sum, keyword) => sum + (haystack.includes(keyword) ? 2 : 0), 0)
        + (normalize(asset.role ?? "").includes("product") ? 1 : 0);
      return { asset, score };
    })
    .sort((a, b) => b.score - a.score)
    .filter((entry, index) => entry.score > 0 || index < 2)
    .slice(0, limit)
    .map((entry) => entry.asset);
}

function referenceMediaForItem(assets: MediaAsset[], campaign: MediaPlanCampaign | null, item: CalendarItem) {
  if (VIDEO_TYPES.has(item.tipo)) {
    return selectRelevantOwnedMedia(assets, campaign, item, 6, ["video", "image"]);
  }
  if (DIRECT_GENERATOR_TYPES.has(item.tipo)) {
    return selectRelevantOwnedMedia(assets, campaign, item, item.tipo === "carrossel" ? 6 : 3, ["image"]);
  }
  return selectRelevantOwnedMedia(assets, campaign, item, 5, ["image", "video"]);
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
    const hasMedia = serialized.includes("imageurl") || selectedMedia.some((asset) => asset.type === "image");
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

function previewData(generation: ContentGeneration | undefined, variationIdx = 0) {
  const variations = Array.isArray(generation?.result?.variations) ? generation!.result!.variations! : [];
  const raw = variations[variationIdx] ?? variations[0];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const imageUrls = [
    ...(Array.isArray(value.imageUrls) ? value.imageUrls.filter((url): url is string => typeof url === "string") : []),
    typeof value.imageUrl === "string" ? value.imageUrl : "",
  ].filter(Boolean);
  const text = [
    typeof value.hook === "string" ? value.hook : "",
    typeof value.caption === "string" ? value.caption : "",
    typeof value.text === "string" ? value.text : "",
    typeof value.cta === "string" ? `CTA: ${value.cta}` : "",
  ].filter(Boolean).join("\n\n");
  const hashtags = Array.isArray(value.hashtags)
    ? value.hashtags.filter((tag): tag is string => typeof tag === "string").join(" ")
    : "";
  return { imageUrls, text, hashtags };
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
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editorDraft, setEditorDraft] = useState<CalendarItemDraft | null>(null);

  const planRef = useRef<MediaPlan | null>(null);
  const calendarRef = useRef<CalendarItem[]>([]);
  const assetsRef = useRef<MediaAsset[]>([]);
  const projectsRef = useRef<MediaProject[]>([]);

  const query = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const requestedCalendarItemId = query.get("calendarItemId")?.trim() ?? "";
  const requestedCampaignId = query.get("campaignId")?.trim() ?? "";
  const requestedMediaPlanId = query.get("mediaPlanId")?.trim() ?? "";
  const fromMediaCalendar = query.get("from") === "media-calendar";

  const load = useCallback(async () => {
    if (!tenantId) return;
    try {
      const headers = authHeaders();
      const [planResponse, calendarResponse, contentResponse, imageResponse, videoResponse, projectsResponse] = await Promise.all([
        fetch(`/api/tenants/${tenantId}/media-plan`, { headers }),
        fetch(`/api/tenants/${tenantId}/content-calendar`, { headers }),
        fetch(`/api/tenants/${tenantId}/content`, { headers }),
        fetch(`/api/tenants/${tenantId}/media/assets?type=image&limit=150`, { headers }),
        fetch(`/api/tenants/${tenantId}/media/assets?type=video&limit=150`, { headers }),
        fetch(`/api/tenants/${tenantId}/media/projects?limit=100`, { headers }),
      ]);

      const nextPlan = planResponse.ok ? await planResponse.json() as MediaPlan | null : null;
      const rawCalendar = calendarResponse.ok ? await calendarResponse.json() as CalendarItem[] : [];
      const nextHistory = contentResponse.ok ? await contentResponse.json() as ContentHistory : null;
      const imagePayload = imageResponse.ok ? await imageResponse.json() as { assets?: MediaAsset[] } : {};
      const videoPayload = videoResponse.ok ? await videoResponse.json() as { assets?: MediaAsset[] } : {};
      const projectPayload = projectsResponse.ok ? await projectsResponse.json() as { projects?: MediaProject[] } : {};
      const nextAssets = [...(imagePayload.assets ?? []), ...(videoPayload.assets ?? [])];
      const nextCalendar = nextPlan
        ? rawCalendar.filter((item) => item.mediaPlanId === nextPlan.id)
        : [];
      const nextProjects = (projectPayload.projects ?? []).filter((project) =>
        project.source === "content_generator" || project.context?.["calendarItemId"],
      );

      setPlan(nextPlan);
      setCalendar(nextCalendar);
      setHistory(nextHistory);
      setAssets(nextAssets);
      setProjects(nextProjects);
      planRef.current = nextPlan;
      calendarRef.current = nextCalendar;
      assetsRef.current = nextAssets;
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

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  useEffect(() => {
    if (!tenantId || !plan) return;
    const timer = window.setInterval(() => { void load(); }, 12000);
    return () => window.clearInterval(timer);
  }, [tenantId, plan?.id, load]);

  const patchCalendar = useCallback(async (itemId: string, patch: Record<string, unknown>) => {
    const response = await fetch(`/api/content-calendar/${itemId}`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      throw new Error(payload?.error || "Falha ao sincronizar a produção com o Plano de Mídia.");
    }
    const updated = await response.json() as CalendarItem;
    const next = calendarRef.current.map((item) => item.id === itemId ? updated : item);
    calendarRef.current = next;
    setCalendar(next);
    return updated;
  }, []);

  const ensureMediaProject = useCallback(async (item: CalendarItem, campaign: MediaPlanCampaign | null) => {
    const existing = projectsRef.current.find((project) => project.context?.["calendarItemId"] === item.id);
    if (existing) return existing;

    const response = await fetch(`/api/tenants/${tenantId}/media/projects`, {
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
    const project = await ensureMediaProject(item, campaign);
    const currentContext = { ...(project.context ?? {}) };
    const currentVersions = Number(currentContext["versionCount"] ?? 0);
    const currentAttempts = Number(currentContext["attemptCount"] ?? 0);
    const currentFailures = Number(currentContext["failureCount"] ?? 0);
    const isSuccessfulGeneration = event.operation === "content_generation";
    const isFailure = event.operation === "generation_failed";
    const versionNumber = isSuccessfulGeneration ? currentVersions + 1 : currentVersions;

    const versionResponse = await fetch(`/api/tenants/${tenantId}/media/projects/${project.id}/versions`, {
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
            type: asset.type,
            source: asset.source,
            role: asset.role,
            filename: asset.originalFilename,
          })),
          recordedAt: new Date().toISOString(),
        },
      }),
    });
    if (!versionResponse.ok) return;

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
    const projectResponse = await fetch(`/api/tenants/${tenantId}/media/projects/${project.id}`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ status: event.status === "failed" ? project.status : "ready", context: nextContext }),
    });
    if (projectResponse.ok) {
      const payload = await projectResponse.json() as { project: MediaProject };
      projectsRef.current = projectsRef.current.map((entry) => entry.id === project.id ? payload.project : entry);
      setProjects(projectsRef.current);
    }
  }, [ensureMediaProject, tenantId]);

  const visibleItems = useMemo(() => {
    if (!plan) return [];
    if (!requestedCampaignId) return calendar;
    const campaign = (plan.conteudo.campanhas ?? []).find((entry) => entry.id === requestedCampaignId);
    if (!campaign) return [];
    return calendar.filter((item) => normalize(campaignNameFromPilar(item.pilar)) === normalize(campaign.nome));
  }, [calendar, plan, requestedCampaignId]);

  const currentItem = useMemo(
    () => calendar.find((item) => item.id === requestedCalendarItemId) ?? null,
    [calendar, requestedCalendarItemId],
  );
  const currentCampaign = campaignForItem(plan, currentItem);

  const generationById = useMemo(() => {
    const map = new Map<string, ContentGeneration>();
    (history?.items ?? []).forEach((item) => map.set(item.id, item));
    return map;
  }, [history]);

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

  const ownImages = assets.filter((asset) => asset.type === "image" && ["upload", "imported"].includes(asset.source));
  const ownVideos = assets.filter((asset) => asset.type === "video" && ["upload", "imported"].includes(asset.source));

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

  function prepareExecutionContext(item: CalendarItem, campaign: MediaPlanCampaign) {
    const marketingContext = buildMarketingContext(campaign, item);
    const references = referenceMediaForItem(assetsRef.current, campaign, item);
    sessionStorage.setItem(ACTIVE_BRIEFING_KEY, JSON.stringify({
      tenantId,
      campaignId: campaign.id,
      campaignName: campaign.nome,
      marketingContext,
    }));
    sessionStorage.setItem(MEDIA_PLAN_EXECUTION_KEY, JSON.stringify({
      source: "media-calendar",
      tenantId,
      mediaPlanId: planRef.current?.id,
      periodoDias: planRef.current?.conteudo.periodoDias,
      campaign,
      calendarItem: item,
      marketingContext,
      referenceMedia: references.map((asset, index) => ({
        assetId: asset.id,
        type: asset.type,
        role: asset.role || "auto",
        importance: index === 0 ? "preferred" : "reference",
        order: index,
        originalFilename: asset.originalFilename,
        storageUrl: asset.storageUrl,
        mimeType: asset.mimeType,
        metadata: asset.metadata,
      })),
      savedAt: new Date().toISOString(),
    }));
    return references;
  }

  async function generateDirectItem(item: CalendarItem, silent = false) {
    const currentPlan = planRef.current;
    if (!currentPlan || currentPlan.conteudo.statusPlanejamento !== "aprovado") {
      if (!silent) toast({ title: "Aprove o Plano de Mídia antes da produção", variant: "destructive" });
      return false;
    }
    const campaign = campaignForItem(currentPlan, item);
    const generatedType = calendarTypeToGenerator(item.tipo);
    if (!campaign || !generatedType) {
      if (!silent) {
        toast({
          title: "Campanha não identificada",
          description: "A geração foi bloqueada para evitar usar contexto de outra campanha.",
          variant: "destructive",
        });
      }
      return false;
    }
    if (!["aprovado", "gerado"].includes(item.status)) return false;

    setActionBusy(item.id);
    const previousStatus = item.status;
    const previousGenerationId = item.contentGenerationId ?? null;
    const selectedMedia = selectRelevantOwnedMedia(
      assetsRef.current,
      campaign,
      item,
      item.tipo === "carrossel" ? 6 : 3,
      ["image"],
    );
    const siblingThemes = calendarRef.current
      .filter((entry) => entry.id !== item.id && campaignNameFromPilar(entry.pilar) === campaignNameFromPilar(item.pilar) && entry.contentGenerationId)
      .slice(-4)
      .map((entry) => entry.temaSugerido);
    const channel = campaign.canais.find((entry) => normalize(entry.canal) === normalize(item.canal));
    const direction = [
      item.temaSugerido,
      `Campanha: ${campaign.nome}`,
      `Objetivo: ${campaign.objetivo}`,
      `Produto/serviço: ${campaign.produtoServico}`,
      `Público: ${campaign.publico}`,
      `Oferta: ${campaign.oferta}`,
      `Mensagem central: ${campaign.mensagemCentral}`,
      `Canal: ${item.canal}`,
      channel?.funcao ? `Função desta mídia: ${channel.funcao}` : "",
      `Pilar: ${contentPillarFromPilar(item.pilar)}`,
      `KPI: ${channel?.kpiPrincipal || campaign.kpiPrincipal}`,
      `Regra de comunicação: ${campaign.regraComunicacaoGeografica}`,
      siblingThemes.length > 0 ? `Evite repetir ganchos e abordagens: ${siblingThemes.join(" / ")}` : "",
    ].filter(Boolean).join(" | ");

    prepareExecutionContext(item, campaign);

    try {
      await patchCalendar(item.id, { status: "gerado" });
      const response = await fetch(`/api/tenants/${tenantId}/content/generate`, {
        method: "POST",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
          "x-vendorai-calendar-item-id": item.id,
          "x-vendorai-media-plan-id": currentPlan.id,
          "x-vendorai-campaign-id": campaign.id,
        },
        body: JSON.stringify({
          type: generatedType,
          theme: direction,
          variations: 1,
          imageCount: item.tipo === "carrossel" ? 4 : 1,
          contentFormat: item.tipo === "stories" ? "stories" : "feed_portrait",
          aspectRatio: item.tipo === "stories" ? "9:16" : "4:5",
          postObjective: campaign.objetivo,
          postMaterialUrls: selectedMedia.map((asset) => normalizeMediaUrl(asset.storageUrl)),
        }),
      });
      const payload = await response.json().catch(() => ({})) as ContentGeneration & { error?: string };
      if (!response.ok || !payload.id) {
        throw new Error(payload.error ?? "Não foi possível gerar esta peça.");
      }

      const review = runAutomaticReview(item, campaign, payload, selectedMedia);
      await patchCalendar(item.id, {
        status: "gerado",
        contentGenerationId: payload.id,
        variationIdx: 0,
      });
      await recordProjectEvent(item, campaign, {
        operation: "content_generation",
        label: `Versão de conteúdo · ${item.temaSugerido}`,
        status: "generated",
        contentGenerationId: payload.id,
        variationIndex: 0,
        review,
        selectedMedia,
        generatedType: payload.type,
      }).catch(() => undefined);
      await load();
      setExpandedItemId(item.id);
      if (!silent) {
        toast({
          title: "Peça gerada automaticamente",
          description: selectedMedia.length > 0
            ? `O briefing do plano foi usado com ${selectedMedia.length} referência(s) da Central de Mídias.`
            : "O briefing completo do Plano de Mídia foi usado. Revise a peça antes de aprovar.",
        });
      }
      return true;
    } catch (error) {
      await patchCalendar(item.id, {
        status: previousStatus,
        contentGenerationId: previousGenerationId,
      }).catch(() => undefined);
      await recordProjectEvent(item, campaign, {
        operation: "generation_failed",
        label: `Falha de geração · ${item.temaSugerido}`,
        status: "failed",
        error: error instanceof Error ? error.message : "Falha desconhecida",
        selectedMedia,
      }).catch(() => undefined);
      if (!silent) toast({ title: "Não foi possível gerar", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
      return false;
    } finally {
      setActionBusy(null);
    }
  }

  function openExecutor(item: CalendarItem) {
    const currentPlan = planRef.current;
    // Revisar/abrir uma ação que já foi aprovada ou gerada não deve depender do
    // status global do plano. Um novo lote pode estar em revisão enquanto os
    // materiais dos lotes anteriores continuam disponíveis para conferência.
    // Itens novos continuam protegidos pelo status individual "planejado".
    if (!currentPlan) {
      toast({ title: "Plano de Mídia não encontrado", variant: "destructive" });
      return;
    }
    if (!["aprovado", "gerado"].includes(item.status)) {
      toast({ title: "Esta ação ainda precisa ser aprovada no lote atual", variant: "destructive" });
      return;
    }
    const campaign = campaignForItem(currentPlan, item);
    if (!campaign) {
      toast({
        title: "Campanha não identificada",
        description: "Esta ação não será aberta até o vínculo com a campanha correta ser confirmado.",
        variant: "destructive",
      });
      return;
    }

    if (DIRECT_GENERATOR_TYPES.has(item.tipo)) {
      void generateDirectItem(item);
      return;
    }

    const references = prepareExecutionContext(item, campaign);
    const commonParams = new URLSearchParams({
      from: "media-calendar",
      mediaPlanId: currentPlan.id,
      campaignId: campaign.id,
      calendarItemId: item.id,
    });
    const bestVideo = references.find((asset) => asset.type === "video");
    if (bestVideo) commonParams.set("mediaAssetId", bestVideo.id);
    const common = commonParams.toString();

    if (VIDEO_TYPES.has(item.tipo)) {
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
    toast({ title: "Executor não identificado", description: "A peça permanece no Plano de Mídia sem perder o briefing." });
  }

  function openItemEditor(item: CalendarItem) {
    setExpandedItemId(null);
    setEditingItemId(item.id);
    setEditorDraft({
      temaSugerido: item.temaSugerido,
      dataAgendada: item.dataAgendada,
      canal: item.canal,
      tipo: item.tipo,
      contentPillar: contentPillarFromPilar(item.pilar),
    });
  }

  function closeItemEditor() {
    setEditingItemId(null);
    setEditorDraft(null);
  }

  async function persistItemEditor(item: CalendarItem, approveAfterSave = false) {
    if (!editorDraft || editingItemId !== item.id) return;
    const temaSugerido = editorDraft.temaSugerido.trim();
    const canal = editorDraft.canal.trim();
    const contentPillar = editorDraft.contentPillar.trim();

    if (!temaSugerido || !editorDraft.dataAgendada || !canal || !contentPillar) {
      toast({
        title: "Preencha os campos obrigatórios",
        description: "Tema, data, canal e direcionamento precisam estar preenchidos.",
        variant: "destructive",
      });
      return;
    }
    if (approveAfterSave && planRef.current?.conteudo.statusPlanejamento !== "aprovado") {
      toast({
        title: "Planejamento ainda não aprovado",
        description: "Aprove primeiro a direção do Plano de Mídia. Você pode salvar esta edição agora sem liberar a produção.",
        variant: "destructive",
      });
      return;
    }

    setActionBusy(item.id);
    try {
      const campaignName = campaignNameFromPilar(item.pilar);
      await patchCalendar(item.id, {
        temaSugerido,
        dataAgendada: editorDraft.dataAgendada,
        canal,
        tipo: editorDraft.tipo,
        pilar: `${campaignName} · ${contentPillar}`,
        ...(approveAfterSave ? { status: "aprovado" } : {}),
      });
      toast({
        title: approveAfterSave ? "Item salvo e aprovado" : "Alterações salvas",
        description: approveAfterSave
          ? "O conteúdo foi atualizado e está liberado para produção."
          : "O mesmo item do planejamento foi atualizado, sem criar uma cópia.",
      });
      closeItemEditor();
    } catch (error) {
      toast({
        title: approveAfterSave ? "Não foi possível aprovar" : "Não foi possível salvar",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setActionBusy(null);
    }
  }

  async function removePlannedItem(item: CalendarItem) {
    const confirmed = window.confirm(`Remover "${item.temaSugerido}" deste planejamento?`);
    if (!confirmed) return;

    setActionBusy(item.id);
    try {
      const response = await fetch(`/api/content-calendar/${item.id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error || "Falha ao remover o item do planejamento.");
      }
      const next = calendarRef.current.filter((calendarItem) => calendarItem.id !== item.id);
      calendarRef.current = next;
      setCalendar(next);
      closeItemEditor();
      toast({ title: "Item removido", description: "A ação foi retirada deste planejamento." });
    } catch (error) {
      toast({
        title: "Não foi possível remover",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setActionBusy(null);
    }
  }

  async function approveContent(item: CalendarItem) {
    if (!item.contentGenerationId) return;
    const campaign = campaignForItem(planRef.current, item);
    setActionBusy(item.id);
    try {
      const updated = await patchCalendar(item.id, { status: "aprovado" });
      await recordProjectEvent(updated, campaign, {
        operation: "content_approval",
        label: `Conteúdo aprovado · ${item.temaSugerido}`,
        status: "approved",
        contentGenerationId: item.contentGenerationId,
        variationIndex: item.variationIdx ?? 0,
      }).catch(() => undefined);
      toast({ title: "Conteúdo aprovado", description: "O status voltou para o Plano de Mídia e ficou registrado no histórico." });
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
      const ok = await generateDirectItem(item, true);
      if (!ok) failed += 1;
      setBatchProgress({ done: index + 1, total: batchEligible.length, failed });
      if ((history?.monthlyLimit ?? 50) > 0 && (history?.monthlyUsed ?? 0) + index + 1 >= (history?.monthlyLimit ?? 50)) break;
    }
    setBatchRunning(false);
    await load();
    toast({
      title: failed === 0 ? "Produção automática concluída" : "Produção concluída com pendências",
      description: failed === 0
        ? "As peças compatíveis foram criadas com o briefing do plano e estão prontas para revisão."
        : `${failed} peça(s) permaneceram prontas para nova tentativa.`,
      variant: failed === 0 ? "default" : "destructive",
    });
  }

  if (loading) {
    return (
      <div className="px-4 pt-4 md:px-6">
        <Card><CardContent className="py-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando produção do Plano de Mídia…</CardContent></Card>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="px-4 pt-4 md:px-6">
        <Card className="border-dashed">
          <CardContent className="py-5 flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-3">
              <Sparkles className="h-4 w-4 mt-0.5 text-primary" />
              <div>
                <p className="text-sm font-medium">Nenhum Plano de Mídia ativo</p>
                <p className="text-xs text-muted-foreground mt-0.5">Você pode criar um plano com IA ou usar o Gerador em modo avulso.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => navigate("/content?tab=planejamento")}>Criar planejamento</Button>
              <Button size="sm" onClick={() => navigate("/content?tab=gerador&mode=avulso")}><Plus className="h-3.5 w-3.5 mr-1" />Criar avulso</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const planApproved = plan.conteudo.statusPlanejamento === "aprovado";
  const currentProject = currentItem ? projectByItem.get(currentItem.id) : undefined;
  const planMismatch = Boolean(requestedMediaPlanId && requestedMediaPlanId !== plan.id);

  return (
    <div className="px-4 pt-4 md:px-6 space-y-3">
      {planMismatch && (
        <Card className="border-amber-300 bg-amber-50/50">
          <CardContent className="py-3 text-sm text-amber-800">Este link pertence a uma versão anterior do plano. A fila abaixo mostra o planejamento atual.</CardContent>
        </Card>
      )}

      <Card className="border-primary/20 bg-primary/[0.02]">
        <CardContent className="py-4 space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="gap-1"><Layers3 className="h-3 w-3" />Conteúdos do plano</Badge>
                <Badge className={planApproved ? "bg-emerald-600" : ""}>{planApproved ? "Plano aprovado" : "Novo lote em revisão"}</Badge>
                <span className="text-xs text-muted-foreground">{plan.conteudo.periodoDias ?? 30} dias</span>
              </div>
              <p className="mt-2 text-sm font-semibold">Conteúdos da campanha</p>
              <p className="text-xs text-muted-foreground mt-0.5 max-w-3xl">
                O Vendi usa somente o briefing da campanha vinculada a cada ação. Revise, aprove ou gere novamente sem preencher tudo outra vez.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button type="button" variant="outline" size="sm" onClick={() => navigate("/content?tab=gerador&mode=avulso")}>
                <Plus className="h-3.5 w-3.5 mr-1" />Criação avulsa
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
                <RefreshCw className="h-3.5 w-3.5 mr-1" />Atualizar
              </Button>
              {batchEligible.length > 0 && planApproved && (
                <Button type="button" size="sm" onClick={() => void runBatch()} disabled={batchRunning}>
                  {batchRunning ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
                  {batchRunning ? `${batchProgress.done}/${batchProgress.total}` : `Gerar conteúdos (${batchEligible.length})`}
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

          <div className="grid gap-2 md:grid-cols-[1fr_auto] items-center rounded-lg border bg-background/70 px-3 py-2.5">
            <div>
              <p className="text-xs font-medium flex items-center gap-1.5"><Library className="h-3.5 w-3.5 text-primary" />Referências reais do negócio</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {ownImages.length} foto(s) e {ownVideos.length} vídeo(s) disponíveis. A IA prioriza correspondência com produto, campanha e tema antes de criar material genérico.
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => navigate("/midias")}>
              Adicionar/organizar mídias <ExternalLink className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
            <span>{history?.monthlyUsed ?? 0}/{history?.monthlyLimit ?? 20} gerações usadas no período de consumo atual.</span>
            <span>Feed, Stories, Carrossel e LinkedIn são gerados aqui; vídeos, anúncios, LPs, blog e mensagens abrem seus executores reais já com briefing e referências preenchidos.</span>
          </div>
        </CardContent>
      </Card>

      {fromMediaCalendar && currentItem && (
        <Card className="border-primary/30">
          <CardContent className="py-3 space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
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
            </div>
            {currentCampaign && (() => {
              const refs = referenceMediaForItem(assets, currentCampaign, currentItem);
              const imageCount = refs.filter((asset) => asset.type === "image").length;
              const videoCount = refs.filter((asset) => asset.type === "video").length;
              return (
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap border-t pt-2">
                  {imageCount > 0 && <span className="inline-flex items-center gap-1"><ImageIcon className="h-3.5 w-3.5" />{imageCount} foto(s) relacionada(s)</span>}
                  {videoCount > 0 && <span className="inline-flex items-center gap-1"><Film className="h-3.5 w-3.5" />{videoCount} vídeo(s) relacionado(s)</span>}
                  {refs.length === 0 && <span>Nenhuma referência específica encontrada; a IA pode criar o visual e você pode complementar pela Central de Mídias.</span>}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {visibleItems.map((item) => {
          const status = derivedStatus(item);
          const project = projectByItem.get(item.id);
          const versionCount = Number(project?.context?.["versionCount"] ?? 0);
          const failureCount = Number(project?.context?.["failureCount"] ?? 0);
          const reviewWarning = project?.context?.["lastReviewStatus"] === "warning";
          const isDirect = DIRECT_GENERATOR_TYPES.has(item.tipo);
          const generation = item.contentGenerationId ? generationById.get(item.contentGenerationId) : undefined;
          const preview = previewData(generation, item.variationIdx ?? 0);
          const expanded = expandedItemId === item.id;
          const itemCampaign = campaignForItem(plan, item);
          const refs = itemCampaign ? referenceMediaForItem(assets, itemCampaign, item) : [];
          return (
            <div key={item.id} className={`rounded-lg border bg-background px-3 py-2.5 ${item.id === requestedCalendarItemId ? "ring-1 ring-primary/40" : ""}`}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="outline" className="text-[10px]">{item.canal}</Badge>
                    <Badge variant="outline" className="text-[10px]">{item.tipo.replaceAll("_", " ")}</Badge>
                    <Badge variant="outline" className={`text-[10px] ${statusClass(status.tone)}`}>{status.label}</Badge>
                    {refs.length > 0 && <span className="text-[10px] text-muted-foreground">{refs.length} ref.</span>}
                    {versionCount > 0 && <span className="text-[10px] text-muted-foreground">v{versionCount}</span>}
                    {failureCount > 0 && <span className="text-[10px] text-amber-700">{failureCount} falha(s)</span>}
                    {reviewWarning && <span className="inline-flex items-center gap-1 text-[10px] text-amber-700"><AlertTriangle className="h-3 w-3" />revisar alertas</span>}
                  </div>
                  <p className="mt-1.5 text-sm font-medium">{item.temaSugerido}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{campaignNameFromPilar(item.pilar)} · {new Date(`${item.dataAgendada}T12:00:00`).toLocaleDateString("pt-BR")}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {item.contentGenerationId && isDirect && (
                    <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setExpandedItemId(expanded ? null : item.id)}>
                      <Eye className="h-3 w-3 mr-1" />{expanded ? "Fechar" : "Revisar"}
                    </Button>
                  )}
                  {item.status === "gerado" && item.contentGenerationId && (
                    <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={actionBusy === item.id} onClick={() => void approveContent(item)}>
                      {actionBusy === item.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}Aprovar
                    </Button>
                  )}
                  {["aprovado", "gerado"].includes(item.status) && (
                    <Button type="button" size="sm" variant={item.contentGenerationId ? "ghost" : "outline"} className="h-7 text-xs" disabled={actionBusy === item.id} onClick={() => openExecutor(item)}>
                      {actionBusy === item.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Play className="h-3 w-3 mr-1" />}
                      {isDirect ? (item.contentGenerationId ? "Nova versão" : "Gerar automático") : (item.contentGenerationId ? "Ver / revisar" : "Abrir executor")}
                    </Button>
                  )}
                  {["planejado", "aprovado"].includes(item.status) && !item.contentGenerationId && (
                    <Button
                      type="button"
                      size="sm"
                      variant={item.status === "planejado" ? "default" : "outline"}
                      className="h-7 text-xs"
                      disabled={actionBusy === item.id}
                      onClick={() => openItemEditor(item)}
                    >
                      <Pencil className="h-3 w-3 mr-1" />
                      {item.status === "planejado" ? "Abrir / Editar" : "Editar planejamento"}
                    </Button>
                  )}
                </div>
              </div>

              {editingItemId === item.id && editorDraft && (
                <div className="mt-3 rounded-lg border bg-muted/20 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold flex items-center gap-2">
                        <Pencil className="h-4 w-4 text-primary" />Editar conteúdo planejado
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Altere este item antes da produção. Salvar atualiza o mesmo planejamento e não cria uma nova peça.
                      </p>
                    </div>
                    <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={closeItemEditor} aria-label="Fechar editor">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <label className="md:col-span-2">
                      <span className="text-xs font-medium">Tema / título *</span>
                      <textarea
                        className="mt-1 min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                        value={editorDraft.temaSugerido}
                        onChange={(event) => setEditorDraft((current) => current ? { ...current, temaSugerido: event.target.value } : current)}
                      />
                    </label>

                    <label>
                      <span className="text-xs font-medium">Data planejada *</span>
                      <input
                        type="date"
                        className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                        value={editorDraft.dataAgendada}
                        onChange={(event) => setEditorDraft((current) => current ? { ...current, dataAgendada: event.target.value } : current)}
                      />
                    </label>

                    <label>
                      <span className="text-xs font-medium">Canal *</span>
                      <input
                        className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                        value={editorDraft.canal}
                        onChange={(event) => setEditorDraft((current) => current ? { ...current, canal: event.target.value } : current)}
                        placeholder="Ex.: Instagram, Google Search, Blog/SEO"
                      />
                    </label>

                    <label>
                      <span className="text-xs font-medium">Formato *</span>
                      <select
                        className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                        value={editorDraft.tipo}
                        onChange={(event) => setEditorDraft((current) => current ? { ...current, tipo: event.target.value } : current)}
                      >
                        {EDITABLE_CONTENT_TYPES.map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </label>

                    <label>
                      <span className="text-xs font-medium">Campanha</span>
                      <input
                        className="mt-1 h-9 w-full rounded-md border bg-muted px-3 text-sm text-muted-foreground"
                        value={campaignNameFromPilar(item.pilar)}
                        readOnly
                      />
                    </label>

                    <label className="md:col-span-2">
                      <span className="text-xs font-medium">Direcionamento / pilar *</span>
                      <textarea
                        className="mt-1 min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                        value={editorDraft.contentPillar}
                        onChange={(event) => setEditorDraft((current) => current ? { ...current, contentPillar: event.target.value } : current)}
                        placeholder="Ex.: Educação, prova social, conversão, demonstração do produto"
                      />
                    </label>
                  </div>

                  {itemCampaign && (
                    <div className="mt-4 grid gap-2 rounded-md border bg-background p-3 text-xs md:grid-cols-2 xl:grid-cols-4">
                      <div><span className="text-muted-foreground">Produto/serviço: </span><span className="font-medium">{itemCampaign.produtoServico}</span></div>
                      <div><span className="text-muted-foreground">Objetivo: </span><span className="font-medium">{itemCampaign.objetivo}</span></div>
                      <div><span className="text-muted-foreground">Público: </span><span className="font-medium">{itemCampaign.publico}</span></div>
                      <div><span className="text-muted-foreground">Oferta/CTA: </span><span className="font-medium">{itemCampaign.oferta}</span></div>
                      <div className="md:col-span-2 xl:col-span-4"><span className="text-muted-foreground">Mensagem central: </span><span className="font-medium">{itemCampaign.mensagemCentral}</span></div>
                    </div>
                  )}

                  <div className="mt-4 flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <CircleDashed className="h-3.5 w-3.5" />
                      {item.status === "planejado" ? "Ainda aguardando sua aprovação." : "Já aprovado; você ainda pode ajustar antes da geração."}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        disabled={actionBusy === item.id}
                        onClick={() => void removePlannedItem(item)}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" />Remover
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={actionBusy === item.id}
                        onClick={() => void persistItemEditor(item, false)}
                      >
                        {actionBusy === item.id ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                        Salvar
                      </Button>
                      {item.status === "planejado" && (
                        <Button
                          type="button"
                          size="sm"
                          disabled={actionBusy === item.id || !planApproved}
                          onClick={() => void persistItemEditor(item, true)}
                          title={!planApproved ? "Aprove primeiro a direção do Plano de Mídia" : undefined}
                        >
                          {actionBusy === item.id ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
                          Aprovar e liberar
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {expanded && item.contentGenerationId && (
                <div className="mt-3 border-t pt-3">
                  {preview ? (
                    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
                      <div className="space-y-2">
                        <p className="text-xs font-semibold">Prévia da versão atual</p>
                        {preview.text && <p className="whitespace-pre-wrap text-sm leading-relaxed">{preview.text}</p>}
                        {preview.hashtags && <p className="text-xs text-muted-foreground">{preview.hashtags}</p>}
                        {!preview.text && !preview.hashtags && <p className="text-xs text-muted-foreground">A geração foi concluída, mas esta versão não possui texto estruturado para prévia rápida.</p>}
                      </div>
                      <div className="grid grid-cols-2 gap-2 md:grid-cols-1">
                        {preview.imageUrls.slice(0, 2).map((url) => (
                          <img key={url} src={url} alt="Prévia do conteúdo" className="w-full max-h-48 rounded-md border object-cover" />
                        ))}
                        {preview.imageUrls.length === 0 && (
                          <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">Sem imagem na prévia</div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">O conteúdo foi gerado, mas a prévia não está mais no histórico carregado. O vínculo e a versão continuam preservados na Central de Mídias.</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {visibleItems.length === 0 && (
          <div className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">Nenhuma ação de produção encontrada para este plano.</div>
        )}
      </div>

      <div className="flex items-center gap-2 text-[11px] text-muted-foreground px-1 pb-2">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
        Conteúdos do plano usam o briefing aprovado automaticamente. O formulário de Estratégia da divulgação fica reservado à Criação avulsa.
      </div>
    </div>
  );
}
