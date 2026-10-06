import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, ChevronDown, ChevronUp, Loader2, Play, RefreshCw, TriangleAlert } from "lucide-react";

const USER_CACHE_KEY = "vendorai_user_cache";
const OVERRIDE_KEY = "vendorai_sa_tenant_override";
const HOST_ATTR = "data-vendorai-plan-production";
const AUTO_KEY_PREFIX = "vendorai_media_plan_auto_production_v2:";

const DIRECT_TYPES = new Set(["feed", "stories", "carrossel", "linkedin_post"]);
const VIDEO_TYPES = new Set(["reels", "youtube_short", "youtube_video", "tiktok"]);
const AD_TYPES = new Set(["meta_ad", "search_ad", "display_ad", "performance_max"]);
const SITE_TYPES = new Set(["landing_page", "site"]);
const MESSAGE_TYPES = new Set(["whatsapp", "email", "blog", "sms"]);
const FINAL_STATUSES = new Set(["recusado", "pulado", "publicado"]);

type CachedUser = { tenantId?: string | null };
type CachedOverride = { id?: string | null };

type CampaignChannel = {
  canal: string;
  funcao?: string;
  etapaFunil?: string;
  formatos?: string[];
  kpiPrincipal?: string;
};

type MediaPlanCampaign = {
  id: string;
  nome: string;
  objetivo: string;
  produtoServico: string;
  publico: string;
  regiao?: string;
  oferta: string;
  mensagemCentral: string;
  regraComunicacaoGeografica?: string;
  canais?: CampaignChannel[];
  kpiPrincipal?: string;
  metaPrincipal?: string;
  duracaoDias?: number;
};

type MediaPlan = {
  id: string;
  conteudo: {
    periodoDias?: number;
    statusPlanejamento?: string;
    campanhas?: MediaPlanCampaign[];
  };
};

type CalendarItem = {
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
};

type MediaAsset = {
  id: string;
  type: string;
  role?: string | null;
  storageUrl: string;
  originalFilename?: string | null;
  source?: string | null;
  metadata?: Record<string, unknown> | null;
};

type MediaProject = {
  id: string;
  title: string;
  kind: string;
  status: string;
  source: string;
  context?: Record<string, unknown> | null;
};

type GenerationVariation = Record<string, unknown>;
type ContentGeneration = {
  id: string;
  type?: string;
  result?: { variations?: GenerationVariation[] } | null;
};

type ProductionResult = {
  itemId: string;
  status: "ready" | "processing" | "failed";
  kind: string;
  label: string;
  executorUrl?: string;
  detail?: string;
};

function currentTenantId(): string {
  try {
    const raw = localStorage.getItem(OVERRIDE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CachedOverride;
      if (parsed?.id) return parsed.id;
    }
  } catch {}
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY);
    if (!raw) return "";
    return (JSON.parse(raw) as CachedUser)?.tenantId ?? "";
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

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function mediaUrl(value: string) {
  return value.startsWith("/objects/") ? `/api/storage${value}` : value;
}

function campaignNameFromPilar(pilar: string) {
  return pilar.split(" · ")[0] || "Campanha do período";
}

function campaignForItem(plan: MediaPlan, item: CalendarItem) {
  const campaigns = plan.conteudo.campanhas ?? [];
  const name = normalize(campaignNameFromPilar(item.pilar));
  return campaigns.find((campaign) => normalize(campaign.nome) === name) ?? campaigns[0] ?? null;
}

function contentPillar(item: CalendarItem) {
  const parts = item.pilar.split(" · ");
  return parts.length > 1 ? parts.slice(1).join(" · ") : item.pilar;
}

function textTokens(value: string) {
  const stop = new Set(["para", "como", "com", "uma", "das", "dos", "por", "que", "seu", "sua", "de", "do", "da", "em", "no", "na", "mais", "campanha"]);
  return Array.from(new Set(normalize(value).replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((word) => word.length >= 4 && !stop.has(word))));
}

function selectMedia(assets: MediaAsset[], campaign: MediaPlanCampaign, item: CalendarItem, types: string[], limit: number) {
  const keywords = textTokens([campaign.nome, campaign.produtoServico, campaign.publico, campaign.mensagemCentral, item.temaSugerido, item.canal].join(" "));
  const allowed = new Set(types);
  return assets
    .filter((asset) => allowed.has(asset.type))
    .map((asset) => {
      let metadata = "";
      try { metadata = JSON.stringify(asset.metadata ?? {}); } catch {}
      const haystack = normalize(`${asset.originalFilename ?? ""} ${asset.role ?? ""} ${metadata}`);
      const score = keywords.reduce((sum, keyword) => sum + (haystack.includes(keyword) ? 2 : 0), 0);
      return { asset, score };
    })
    .sort((a, b) => b.score - a.score)
    .filter((entry, index) => entry.score > 0 || index < 2)
    .slice(0, limit)
    .map((entry) => entry.asset);
}

function marketingContext(plan: MediaPlan, campaign: MediaPlanCampaign, item: CalendarItem) {
  const channel = campaign.canais?.find((entry) => normalize(entry.canal) === normalize(item.canal));
  return {
    nicheId: `media-plan:${campaign.id}`,
    nicheName: `${item.canal} · ${item.temaSugerido}`,
    productIds: [`custom:media-plan:${campaign.id}`],
    productNames: [campaign.produtoServico],
    audienceSegment: campaign.publico,
    audienceNiche: campaign.publico,
    campaignGoal: `${item.temaSugerido}. Objetivo: ${campaign.objetivo}. Direção: ${campaign.mensagemCentral}`,
    locationRegion: campaign.regiao,
    projectName: campaign.nome,
    specificDetails: [
      `Canal: ${item.canal}`,
      `Formato: ${item.tipo.replaceAll("_", " ")}`,
      `Pilar: ${contentPillar(item)}`,
      `Oferta: ${campaign.oferta}`,
      channel?.funcao ? `Função desta mídia: ${channel.funcao}` : "",
    ].filter(Boolean).join(" | "),
    mandatoryDifferentiators: campaign.mensagemCentral,
    restrictions: campaign.regraComunicacaoGeografica,
    primaryKpi: [channel?.kpiPrincipal, campaign.kpiPrincipal, campaign.metaPrincipal].filter(Boolean).join(" · "),
    campaignId: campaign.id,
    campaignName: campaign.nome,
    mediaPlanId: plan.id,
    calendarItemId: item.id,
  };
}

function directionText(campaign: MediaPlanCampaign, item: CalendarItem) {
  const channel = campaign.canais?.find((entry) => normalize(entry.canal) === normalize(item.canal));
  return [
    item.temaSugerido,
    `Campanha: ${campaign.nome}`,
    `Objetivo: ${campaign.objetivo}`,
    `Produto/serviço: ${campaign.produtoServico}`,
    `Público: ${campaign.publico}`,
    campaign.oferta ? `Oferta/CTA: ${campaign.oferta}` : "",
    campaign.mensagemCentral ? `Mensagem central: ${campaign.mensagemCentral}` : "",
    item.canal ? `Canal: ${item.canal}` : "",
    channel?.funcao ? `Função desta mídia: ${channel.funcao}` : "",
    campaign.regiao ? `Região: ${campaign.regiao}` : "",
    campaign.regraComunicacaoGeografica ? `Regra geográfica: ${campaign.regraComunicacaoGeografica}` : "",
  ].filter(Boolean).join("\n");
}

function generatorTypeFor(item: CalendarItem): "feed" | "stories" | "reels" | "linkedin" | "youtube" {
  if (item.tipo === "stories" || item.tipo === "whatsapp" || item.tipo === "sms") return "stories";
  if (item.tipo === "linkedin_post" || item.tipo === "email" || item.tipo === "blog") return "linkedin";
  if (item.tipo === "youtube_video") return "youtube";
  if (VIDEO_TYPES.has(item.tipo)) return "reels";
  return "feed";
}

function specialPrompt(item: CalendarItem, base: string) {
  if (item.tipo === "whatsapp") return `${base}\n\nENTREGA: mensagem de WhatsApp pronta para envio, curta, humana, sem parágrafos longos. Use o campo CTA como próximo passo comercial.`;
  if (item.tipo === "email") return `${base}\n\nENTREGA: trate o hook como assunto do e-mail e a caption como corpo completo do e-mail. Linguagem clara, comercial e pronta para envio.`;
  if (item.tipo === "blog") return `${base}\n\nENTREGA: use hook como título e caption como um rascunho de artigo educativo completo, com introdução, desenvolvimento em parágrafos curtos e conclusão. Não invente estatísticas.`;
  if (item.tipo === "sms") return `${base}\n\nENTREGA: SMS de no máximo 300 caracteres. Texto direto e CTA curto.`;
  return base;
}

function variationHasVisual(variation: GenerationVariation | undefined) {
  if (!variation) return false;
  if (typeof variation.imageUrl === "string" && variation.imageUrl.trim()) return true;
  return Array.isArray(variation.imageUrls) && variation.imageUrls.some((value) => typeof value === "string" && value.trim());
}

function extractImages(variation: GenerationVariation | undefined) {
  if (!variation) return [];
  const values = Array.isArray(variation.imageUrls)
    ? variation.imageUrls.filter((value): value is string => typeof value === "string" && Boolean(value))
    : [];
  if (values.length > 0) return values;
  return typeof variation.imageUrl === "string" && variation.imageUrl ? [variation.imageUrl] : [];
}

function addDays(dateIso: string, days: number) {
  const date = new Date(`${dateIso}T12:00:00`);
  date.setDate(date.getDate() + Math.max(1, days));
  return date.toISOString().slice(0, 10);
}

function specialAdCategory(text: string) {
  const value = normalize(text);
  if (/\b(vaga|emprego|recrutamento|contratando)\b/.test(value)) return "EMPLOYMENT";
  if (/\b(imovel|apartamento|casa a venda|aluguel|locacao residencial|loteamento)\b/.test(value)) return "HOUSING";
  if (/\b(emprestimo|credito|cartao de credito|financiamento|consorcio)\b/.test(value)) return "CREDIT";
  if (/\b(candidato|eleicao|partido politico|campanha eleitoral)\b/.test(value)) return "ISSUES_ELECTIONS_POLITICS";
  return "NONE";
}

function mediaProjectKind(type: string) {
  if (VIDEO_TYPES.has(type)) return "video";
  if (SITE_TYPES.has(type)) return "site";
  if (AD_TYPES.has(type)) return "ad";
  if (MESSAGE_TYPES.has(type)) return "message";
  if (type === "stories") return "story";
  return "feed";
}

export function MediaPlanAutoProductionBridge() {
  const tenantId = currentTenantId();
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const [search, setSearch] = useState(() => window.location.search);
  const [plan, setPlan] = useState<MediaPlan | null>(null);
  const [calendar, setCalendar] = useState<CalendarItem[]>([]);
  const [projects, setProjects] = useState<MediaProject[]>([]);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [running, setRunning] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, failed: 0 });
  const [results, setResults] = useState<ProductionResult[]>([]);
  const startingRef = useRef(false);

  const onPlanQueue = useMemo(() => {
    if (pathname !== "/content") return false;
    return new URLSearchParams(search).get("mode") !== "avulso";
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

  const load = useCallback(async () => {
    if (!tenantId || !onPlanQueue) return;
    try {
      const [planRes, calendarRes, projectsRes, imageRes, videoRes] = await Promise.all([
        fetch(`/api/tenants/${tenantId}/media-plan`, { headers: authHeaders(), cache: "no-store" }),
        fetch(`/api/tenants/${tenantId}/content-calendar`, { headers: authHeaders(), cache: "no-store" }),
        fetch(`/api/tenants/${tenantId}/media/projects?limit=200`, { headers: authHeaders(), cache: "no-store" }),
        fetch(`/api/tenants/${tenantId}/media/assets?type=image&limit=150`, { headers: authHeaders(), cache: "no-store" }),
        fetch(`/api/tenants/${tenantId}/media/assets?type=video&limit=150`, { headers: authHeaders(), cache: "no-store" }),
      ]);
      if (planRes.ok) setPlan(await planRes.json() as MediaPlan);
      if (calendarRes.ok) {
        const data = await calendarRes.json();
        setCalendar(Array.isArray(data) ? data : []);
      }
      if (projectsRes.ok) {
        const data = await projectsRes.json() as { projects?: MediaProject[] };
        setProjects(data.projects ?? []);
      }
      const nextAssets: MediaAsset[] = [];
      for (const response of [imageRes, videoRes]) {
        if (!response.ok) continue;
        const data = await response.json().catch(() => ({})) as { assets?: MediaAsset[] };
        if (Array.isArray(data.assets)) nextAssets.push(...data.assets);
      }
      setAssets(Array.from(new Map(nextAssets.map((asset) => [asset.id, asset])).values()));
    } catch (error) {
      console.warn("media-plan-auto-production: falha ao carregar contexto", error);
    }
  }, [onPlanQueue, tenantId]);

  useEffect(() => {
    void load();
    if (!onPlanQueue) return;
    const timer = window.setInterval(() => { if (!running) void load(); }, 12_000);
    return () => window.clearInterval(timer);
  }, [load, onPlanQueue, running]);

  const projectByItem = useMemo(() => {
    const map = new Map<string, MediaProject>();
    for (const project of projects) {
      const id = typeof project.context?.calendarItemId === "string" ? project.context.calendarItemId : "";
      if (id && !map.has(id)) map.set(id, project);
    }
    return map;
  }, [projects]);

  const relevantCalendar = useMemo(() => {
    if (!plan) return [];
    return calendar.filter((item) => (!item.mediaPlanId || item.mediaPlanId === plan.id) && !FINAL_STATUSES.has(item.status));
  }, [calendar, plan]);

  const missing = useMemo(() => relevantCalendar.filter((item) => {
    if (item.contentGenerationId) return false;
    const evidence = projectByItem.get(item.id)?.context ?? {};
    const materialStatus = String(evidence.materializationStatus ?? evidence.lastStatus ?? "");
    if (["processing", "draft_ready", "ready", "review", "approved"].includes(materialStatus)) return false;
    return item.status === "aprovado" || item.status === "gerado";
  }), [projectByItem, relevantCalendar]);

  const evidenceResults = useMemo<ProductionResult[]>(() => relevantCalendar.flatMap((item) => {
    const project = projectByItem.get(item.id);
    if (!project) return [];
    const context = project.context ?? {};
    const rawStatus = String(context.materializationStatus ?? context.lastStatus ?? "");
    if (!rawStatus || rawStatus === "planned") return [];
    return [{
      itemId: item.id,
      status: rawStatus === "failed" ? "failed" : rawStatus === "processing" ? "processing" : "ready",
      kind: String(context.executorKind ?? item.tipo),
      label: item.temaSugerido,
      executorUrl: typeof context.executorUrl === "string" ? context.executorUrl : undefined,
      detail: typeof context.executorDetail === "string" ? context.executorDetail : undefined,
    }];
  }), [projectByItem, relevantCalendar]);

  useEffect(() => {
    if (!onPlanQueue) {
      setHost(null);
      return;
    }
    let portalHost = document.querySelector<HTMLElement>(`[${HOST_ATTR}]`);
    if (!portalHost) {
      portalHost = document.createElement("div");
      portalHost.setAttribute(HOST_ATTR, "true");
      portalHost.className = "inline-flex items-center gap-2";
    }
    const attach = () => {
      const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button"));
      const anchor = buttons.find((button) => (button.textContent ?? "").trim().toLowerCase().includes("criação avulsa"))
        ?? buttons.find((button) => (button.textContent ?? "").trim() === "Atualizar");
      const parent = anchor?.parentElement;
      if (!parent || !portalHost) return;
      if (portalHost.parentElement !== parent) parent.prepend(portalHost);
      setHost((current) => current === portalHost ? current : portalHost);
    };
    attach();
    const timer = window.setInterval(attach, 450);
    return () => {
      window.clearInterval(timer);
      portalHost?.remove();
    };
  }, [onPlanQueue]);

  const patchCalendar = useCallback(async (itemId: string, patch: Record<string, unknown>) => {
    const response = await fetch(`/api/content-calendar/${itemId}`, {
      method: "PATCH",
      headers: authHeaders(true),
      body: JSON.stringify(patch),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error ?? "Não foi possível atualizar a ação do calendário.");
    setCalendar((current) => current.map((item) => item.id === itemId ? body as CalendarItem : item));
    return body as CalendarItem;
  }, []);

  const ensureProject = useCallback(async (item: CalendarItem, campaign: MediaPlanCampaign) => {
    const existing = projectByItem.get(item.id);
    if (existing) return existing;
    const response = await fetch(`/api/tenants/${tenantId}/media/projects`, {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({
        title: `${campaign.nome} · ${item.temaSugerido}`,
        kind: mediaProjectKind(item.tipo),
        source: "content_generator",
        context: {
          source: "media-plan",
          mediaPlanId: plan?.id,
          campaignId: campaign.id,
          campaignName: campaign.nome,
          calendarItemId: item.id,
          channel: item.canal,
          contentType: item.tipo,
          materializationStatus: "planned",
        },
      }),
    });
    const body = await response.json().catch(() => ({})) as { project?: MediaProject; error?: string };
    if (!response.ok || !body.project) throw new Error(body.error ?? "Não foi possível criar o registro da produção.");
    setProjects((current) => [body.project!, ...current]);
    return body.project;
  }, [plan?.id, projectByItem, tenantId]);

  const updateProject = useCallback(async (project: MediaProject, patch: Record<string, unknown>) => {
    const nextContext = { ...(project.context ?? {}), ...patch, updatedFromPlanAt: new Date().toISOString() };
    const response = await fetch(`/api/tenants/${tenantId}/media/projects/${project.id}`, {
      method: "PATCH",
      headers: authHeaders(true),
      body: JSON.stringify({ status: patch.materializationStatus === "failed" ? project.status : "ready", context: nextContext }),
    });
    const body = await response.json().catch(() => ({})) as { project?: MediaProject };
    const updated = body.project ?? { ...project, context: nextContext };
    setProjects((current) => current.map((entry) => entry.id === project.id ? updated : entry));
    return updated;
  }, [tenantId]);

  const recordVersion = useCallback(async (project: MediaProject, item: CalendarItem, metadata: Record<string, unknown>) => {
    await fetch(`/api/tenants/${tenantId}/media/projects/${project.id}/versions`, {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({ operation: "media_plan_materialized", label: "Rascunho criado pelo Plano de Mídia", metadata: { ...metadata, calendarItemId: item.id, recordedAt: new Date().toISOString() } }),
    }).catch(() => null);
  }, [tenantId]);

  const generateContent = useCallback(async (
    item: CalendarItem,
    campaign: MediaPlanCampaign,
    options: { generatorType?: "feed" | "stories" | "reels" | "linkedin" | "youtube"; imageCount?: number; visual?: boolean; prompt?: string } = {},
  ) => {
    const generatorType = options.generatorType ?? generatorTypeFor(item);
    const direction = options.prompt ?? specialPrompt(item, directionText(campaign, item));
    const selectedImages = selectMedia(assets, campaign, item, ["image"], item.tipo === "carrossel" ? 6 : 3);
    const finalMaterials = selectedImages.filter((asset) => asset.metadata?.aiRole === "final_material");
    const referenceImages = selectedImages.filter((asset) => asset.metadata?.aiRole !== "final_material");
    const response = await fetch(`/api/tenants/${tenantId}/content/generate`, {
      method: "POST",
      headers: {
        ...authHeaders(true),
        "x-vendorai-calendar-item-id": item.id,
        "x-vendorai-media-plan-id": plan?.id ?? "",
        "x-vendorai-campaign-id": campaign.id,
      },
      body: JSON.stringify({
        type: generatorType,
        theme: direction.slice(0, 8000),
        variations: 1,
        imageCount: Math.max(1, options.imageCount ?? (item.tipo === "carrossel" ? 4 : 1)),
        postObjective: campaign.objetivo,
        desiredCta: campaign.oferta,
        postMaterialUrls: finalMaterials.map((asset) => mediaUrl(asset.storageUrl)),
      }),
    });
    const payload = await response.json().catch(() => ({})) as ContentGeneration & { error?: string };
    if (!response.ok || !payload.id) throw new Error(payload.error ?? "O gerador não criou o rascunho.");

    let variation = (payload.result?.variations ?? [])[0] as GenerationVariation | undefined;
    const needsVisual = options.visual === true;
    if (needsVisual && !variationHasVisual(variation)) {
      const visualResponse = await fetch(`/api/tenants/${tenantId}/content/${payload.id}/variations/0/regenerate-image`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({
          imageCount: Math.max(1, options.imageCount ?? (item.tipo === "carrossel" ? 4 : 1)),
          ...(referenceImages[0] ? { referenceImageUrl: mediaUrl(referenceImages[0].storageUrl) } : {}),
          observations: `Plano de Mídia: ${campaign.mensagemCentral}. Preserve a identidade e o assunto real do negócio; gere um criativo profissional pronto para revisão, sem texto inventado nem marca d'água.`,
        }),
      });
      const visual = await visualResponse.json().catch(() => ({})) as { imageUrls?: string[]; error?: string };
      if (!visualResponse.ok || !Array.isArray(visual.imageUrls) || visual.imageUrls.length === 0) {
        throw new Error(visual.error ?? "O texto foi criado, mas o criativo visual não foi concluído.");
      }
      variation = { ...(variation ?? {}), imageUrl: visual.imageUrls[0], imageUrls: visual.imageUrls.length > 1 ? visual.imageUrls : undefined };
    }

    return { generation: payload, variation, selectedImages };
  }, [assets, tenantId]);

  const materializeDirect = useCallback(async (item: CalendarItem, campaign: MediaPlanCampaign, project: MediaProject) => {
    const generated = await generateContent(item, campaign, {
      visual: ["feed", "stories", "carrossel", "linkedin_post"].includes(item.tipo),
      imageCount: item.tipo === "carrossel" ? 4 : 1,
    });
    await patchCalendar(item.id, { status: "gerado", contentGenerationId: generated.generation.id, variationIdx: 0 });
    const updated = await updateProject(project, {
      materializationStatus: "draft_ready",
      executorKind: "content",
      executorDraftId: generated.generation.id,
      executorUrl: `/content?tab=gerador&calendarItemId=${encodeURIComponent(item.id)}`,
      executorDetail: "Texto e criativo visual gerados",
      contentGenerationId: generated.generation.id,
    });
    await recordVersion(updated, item, { kind: "content", contentGenerationId: generated.generation.id, mediaCount: generated.selectedImages.length });
    return { itemId: item.id, status: "ready", kind: "content", label: item.temaSugerido, executorUrl: `/content?tab=gerador&calendarItemId=${encodeURIComponent(item.id)}`, detail: "Conteúdo completo criado" } satisfies ProductionResult;
  }, [generateContent, patchCalendar, recordVersion, updateProject]);

  const materializeMessage = useCallback(async (item: CalendarItem, campaign: MediaPlanCampaign, project: MediaProject) => {
    const generated = await generateContent(item, campaign, { visual: false });
    await patchCalendar(item.id, { status: "gerado", contentGenerationId: generated.generation.id, variationIdx: 0 });
    const updated = await updateProject(project, {
      materializationStatus: "draft_ready",
      executorKind: item.tipo,
      executorDraftId: generated.generation.id,
      executorUrl: `/content?tab=gerador&calendarItemId=${encodeURIComponent(item.id)}`,
      executorDetail: `${item.tipo.toUpperCase()} criado para revisão`,
      contentGenerationId: generated.generation.id,
    });
    await recordVersion(updated, item, { kind: item.tipo, contentGenerationId: generated.generation.id });
    return { itemId: item.id, status: "ready", kind: item.tipo, label: item.temaSugerido, executorUrl: `/content?tab=gerador&calendarItemId=${encodeURIComponent(item.id)}`, detail: "Rascunho textual criado" } satisfies ProductionResult;
  }, [generateContent, patchCalendar, recordVersion, updateProject]);

  const materializeVideo = useCallback(async (item: CalendarItem, campaign: MediaPlanCampaign) => {
    const script = await generateContent(item, campaign, { generatorType: item.tipo === "youtube_video" ? "youtube" : "reels", visual: false });
    const references = selectMedia(assets, campaign, item, ["video", "image"], 6);
    const prompt = `${directionText(campaign, item)}\n\nCrie o vídeo final respeitando essa direção, com cenas naturais, ritmo adequado ao canal, CTA compatível com o funil e sem inventar características do produto.`;
    const response = await fetch(`/api/tenants/${tenantId}/media-engine/jobs`, {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({
        operation: "video_generate",
        title: `${campaign.nome} · ${item.temaSugerido}`.slice(0, 120),
        context: {
          prompt: prompt.slice(0, 4000),
          style: item.tipo === "youtube_video" ? "cinematic, premium, photorealistic, polished commercial production" : "dynamic social media reel, energetic camera language, punchy modern composition",
          aspectRatio: item.tipo === "youtube_video" ? "landscape" : "portrait",
          duration: item.tipo === "youtube_video" ? 30 : 16,
          generationMode: references.length > 0 ? "hybrid" : "ai_only",
          mediaInputs: references.map((asset, index) => ({ assetId: asset.id, type: asset.type, role: asset.metadata?.aiRole ?? asset.role ?? "reference", importance: "high", order: index })),
          effects: {
            preset: item.tipo === "youtube_video" ? "cinematic" : "social",
            intensity: item.tipo === "youtube_video" ? "soft" : "medium",
            transition: item.tipo === "youtube_video" ? "smooth" : "whip",
            motion: item.tipo === "youtube_video" ? "ken_burns" : "punch",
            color: item.tipo === "youtube_video" ? "cinematic" : "vibrant",
            grain: item.tipo === "youtube_video",
            vignette: false,
            sharpen: true,
            beatSync: item.tipo !== "youtube_video",
            bpm: item.tipo === "youtube_video" ? 105 : 128,
            sfx: item.tipo === "youtube_video" ? "none" : "whoosh",
          },
          source: "media-plan",
          mediaPlanId: plan?.id,
          campaignId: campaign.id,
          campaignName: campaign.nome,
          calendarItemId: item.id,
          channel: item.canal,
          contentType: item.tipo,
          materializationStatus: "processing",
          executorKind: "video",
          scriptContentGenerationId: script.generation.id,
        },
      }),
    });
    const body = await response.json().catch(() => ({})) as { projectId?: string; jobId?: string; error?: string };
    if (!response.ok || !body.projectId || !body.jobId) throw new Error(body.error ?? "Não foi possível iniciar o vídeo real.");
    await patchCalendar(item.id, { status: "gerado", contentGenerationId: script.generation.id, variationIdx: 0 });
    const projectResponse = await fetch(`/api/tenants/${tenantId}/media/projects/${body.projectId}`, { headers: authHeaders() });
    let project: MediaProject | undefined;
    if (projectResponse.ok) {
      const data = await projectResponse.json().catch(() => ({})) as { project?: MediaProject };
      project = data.project;
    }
    if (project) {
      await updateProject(project, {
        materializationStatus: "processing",
        executorKind: "video",
        executorJobId: body.jobId,
        executorProjectId: body.projectId,
        executorUrl: "/content-studio/video",
        executorDetail: "Vídeo em geração no Media Engine",
        contentGenerationId: script.generation.id,
      });
      await recordVersion(project, item, { kind: "video", projectId: body.projectId, jobId: body.jobId, scriptContentGenerationId: script.generation.id });
    }
    return { itemId: item.id, status: "processing", kind: "video", label: item.temaSugerido, executorUrl: "/content-studio/video", detail: "Vídeo em geração" } satisfies ProductionResult;
  }, [assets, generateContent, patchCalendar, plan?.id, recordVersion, tenantId, updateProject]);

  const materializeAd = useCallback(async (item: CalendarItem, campaign: MediaPlanCampaign, project: MediaProject) => {
    const visual = item.tipo !== "search_ad";
    const source = await generateContent(item, campaign, { generatorType: visual ? "feed" : "linkedin", visual, imageCount: item.tipo === "performance_max" ? 3 : 1 });
    const variation = source.variation ?? {};
    const caption = String(variation.caption ?? variation.text ?? item.temaSugerido);
    const hook = String(variation.hook ?? caption.split(/[.!?\n]/)[0] ?? item.temaSugerido).trim();
    const images = extractImages(variation);
    if (visual && images.length === 0) throw new Error("O criativo do anúncio ficou sem imagem.");
    const startDate = item.dataAgendada;
    const endDate = addDays(startDate, Math.min(30, Math.max(1, campaign.duracaoDias ?? 7)));
    const specialCategory = specialAdCategory(`${campaign.produtoServico} ${campaign.nome} ${item.temaSugerido}`);
    const context = marketingContext(plan!, campaign, item);
    const adResponse = await fetch(`/api/tenants/${tenantId}/ads/campaigns`, {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({
        plataforma: item.tipo === "meta_ad" ? "meta" : "google",
        tipoAnuncio: item.tipo === "meta_ad" || item.tipo === "display_ad" ? "imagem" : "rsa_pmax",
        vertical: "Marketing",
        itemTipo: "livre",
        itemLabel: item.temaSugerido.slice(0, 180),
        modo: "unico",
        destinoClique: "formulario_lead",
        orcamentoDiario: "0.00",
        segmentacao: {
          marketingContext: context,
          campaignControl: {
            objective: "awareness",
            startDate,
            endDate,
            totalBudget: 0,
            specialAdCategory: specialCategory,
            conversionTracking: { mode: "clicks", confirmed: true },
            automation: { autoPauseNoResults: true, allowBudgetIncrease: false },
          },
          mediaPlanDraft: { source: "media-plan", requiresBudgetBeforePublish: true, generatedAt: new Date().toISOString() },
        },
        creativeDraft: {
          headlines: [hook, item.temaSugerido, campaign.produtoServico].filter(Boolean).slice(0, 8),
          descriptions: [caption, campaign.mensagemCentral].filter(Boolean).slice(0, 4),
          imagens: images.slice(0, 10),
        },
      }),
    });
    const ad = await adResponse.json().catch(() => ({})) as { id?: string; error?: unknown };
    if (!adResponse.ok || !ad.id) throw new Error(typeof ad.error === "string" ? ad.error : "Não foi possível criar o rascunho real do anúncio.");
    await patchCalendar(item.id, { status: "gerado", contentGenerationId: source.generation.id, variationIdx: 0 });
    const updated = await updateProject(project, {
      materializationStatus: "draft_ready",
      executorKind: "ad",
      executorDraftId: ad.id,
      executorUrl: `/ads?campaignId=${encodeURIComponent(ad.id)}&from=media-plan`,
      executorDetail: "Campanha e criativo criados como rascunho; orçamento continua zerado até revisão",
      contentGenerationId: source.generation.id,
    });
    await recordVersion(updated, item, { kind: "ad", adCampaignId: ad.id, contentGenerationId: source.generation.id, images: images.length });
    return { itemId: item.id, status: "ready", kind: "ad", label: item.temaSugerido, executorUrl: `/ads?campaignId=${encodeURIComponent(ad.id)}&from=media-plan`, detail: "Rascunho de anúncio criado" } satisfies ProductionResult;
  }, [generateContent, patchCalendar, plan, recordVersion, tenantId, updateProject]);

  const materializeSite = useCallback(async (item: CalendarItem, campaign: MediaPlanCampaign, project: MediaProject) => {
    const copy = await generateContent(item, campaign, {
      generatorType: "linkedin",
      visual: false,
      prompt: `${directionText(campaign, item)}\n\nCrie a direção textual da ${item.tipo === "landing_page" ? "landing page" : "página institucional"}: headline, proposta de valor, principais seções, benefícios e CTA. Esse texto será usado como apoio ao gerador de site.`,
    });
    const references = selectMedia(assets, campaign, item, ["image", "video"], 8);
    const images = references.filter((asset) => asset.type === "image").map((asset) => mediaUrl(asset.storageUrl));
    const videos = references.filter((asset) => asset.type === "video").map((asset) => mediaUrl(asset.storageUrl));
    const response = await fetch(`/api/tenants/${tenantId}/site-generator/generate`, {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({
        type: item.tipo === "landing_page" ? "landing" : "institutional",
        name: `${campaign.nome} — ${item.temaSugerido}`.slice(0, 140),
        sector: campaign.produtoServico.slice(0, 120) || "Serviços",
        desc: `${campaign.mensagemCentral}\n${item.temaSugerido}`,
        pain: campaign.objetivo,
        tone: "profissional, claro, confiável e orientado à conversão",
        cta: campaign.oferta || "Fale com nossa equipe",
        color: "#4F46E5",
        products: [],
        images,
        videos,
        servicos: campaign.produtoServico,
        headline: item.temaSugerido,
        nicheId: `media-plan:${campaign.id}`,
        nicheName: campaign.publico,
        productIds: [`custom:media-plan:${campaign.id}`],
        productNames: [campaign.produtoServico],
      }),
    });
    const body = await response.json().catch(() => ({})) as { jobId?: string; error?: string };
    if (!response.ok || !body.jobId) throw new Error(body.error ?? "Não foi possível iniciar a geração da página.");
    await patchCalendar(item.id, { status: "gerado", contentGenerationId: copy.generation.id, variationIdx: 0 });
    let updated = await updateProject(project, {
      materializationStatus: "processing",
      executorKind: "site",
      executorJobId: body.jobId,
      executorUrl: `/content?tab=campanhas&view=lp&source=media-plan&mediaPlanId=${encodeURIComponent(plan!.id)}&campaignId=${encodeURIComponent(campaign.id)}`,
      executorDetail: "Página em geração",
      contentGenerationId: copy.generation.id,
    });
    await recordVersion(updated, item, { kind: "site", siteJobId: body.jobId, contentGenerationId: copy.generation.id, images: images.length, videos: videos.length });

    const deadline = Date.now() + 12 * 60 * 1000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => window.setTimeout(resolve, 3000));
      const poll = await fetch(`/api/tenants/${tenantId}/site-generator/jobs/${body.jobId}`, { headers: authHeaders(), cache: "no-store" });
      const job = await poll.json().catch(() => ({})) as { status?: string; result?: { id?: string; siteSlug?: string }; error?: string };
      if (!poll.ok && ![429, 502, 503, 504].includes(poll.status)) throw new Error(job.error ?? "Falha ao acompanhar a página.");
      if (job.status === "error") throw new Error(job.error ?? "O gerador da página falhou.");
      if (job.status === "done") {
        const siteId = job.result?.id;
        updated = await updateProject(updated, {
          materializationStatus: "draft_ready",
          executorKind: "site",
          executorDraftId: siteId,
          executorSiteSlug: job.result?.siteSlug,
          executorUrl: `/content?tab=campanhas&view=lp&source=media-plan&mediaPlanId=${encodeURIComponent(plan!.id)}&campaignId=${encodeURIComponent(campaign.id)}${siteId ? `&siteId=${encodeURIComponent(siteId)}` : ""}`,
          executorDetail: "Landing page/site gerado e salvo como rascunho",
        });
        return { itemId: item.id, status: "ready", kind: "site", label: item.temaSugerido, executorUrl: String(updated.context?.executorUrl ?? ""), detail: "Página gerada" } satisfies ProductionResult;
      }
    }
    return { itemId: item.id, status: "processing", kind: "site", label: item.temaSugerido, executorUrl: String(updated.context?.executorUrl ?? ""), detail: "Página continua em geração" } satisfies ProductionResult;
  }, [assets, generateContent, patchCalendar, plan, recordVersion, tenantId, updateProject]);

  const materializeOne = useCallback(async (item: CalendarItem): Promise<ProductionResult> => {
    if (!plan) throw new Error("Plano não carregado.");
    const campaign = campaignForItem(plan, item);
    if (!campaign) throw new Error("Campanha do item não encontrada.");
    if (VIDEO_TYPES.has(item.tipo)) return materializeVideo(item, campaign);
    const project = await ensureProject(item, campaign);
    await updateProject(project, { materializationStatus: "processing", executorKind: item.tipo, executorDetail: "Produção iniciada" });
    try {
      if (DIRECT_TYPES.has(item.tipo)) return await materializeDirect(item, campaign, project);
      if (AD_TYPES.has(item.tipo)) return await materializeAd(item, campaign, project);
      if (SITE_TYPES.has(item.tipo)) return await materializeSite(item, campaign, project);
      if (MESSAGE_TYPES.has(item.tipo)) return await materializeMessage(item, campaign, project);
      throw new Error(`Formato ${item.tipo} ainda não possui executor materializável.`);
    } catch (error) {
      await updateProject(project, {
        materializationStatus: "failed",
        executorKind: item.tipo,
        executorDetail: error instanceof Error ? error.message : "Falha na produção",
      }).catch(() => null);
      throw error;
    }
  }, [ensureProject, materializeAd, materializeDirect, materializeMessage, materializeSite, materializeVideo, plan, updateProject]);

  const runAll = useCallback(async () => {
    if (!plan || plan.conteudo.statusPlanejamento !== "aprovado" || running || startingRef.current) return;
    const queue = missing.filter((item) => item.status === "aprovado" || item.status === "gerado");
    if (queue.length === 0) return;
    startingRef.current = true;
    setRunning(true);
    setProgress({ done: 0, total: queue.length, failed: 0 });
    setResults([]);
    try {
      sessionStorage.setItem(`${AUTO_KEY_PREFIX}${plan.id}`, new Date().toISOString());
    } catch {}

    let nextIndex = 0;
    let done = 0;
    let failed = 0;
    const output: ProductionResult[] = [];
    const worker = async () => {
      while (true) {
        const index = nextIndex++;
        if (index >= queue.length) return;
        const item = queue[index]!;
        try {
          const result = await materializeOne(item);
          output.push(result);
        } catch (error) {
          failed += 1;
          output.push({ itemId: item.id, status: "failed", kind: item.tipo, label: item.temaSugerido, detail: error instanceof Error ? error.message : "Falha na produção" });
        }
        done += 1;
        setProgress({ done, total: queue.length, failed });
        setResults([...output]);
      }
    };

    await Promise.all([worker(), worker()]);
    setRunning(false);
    startingRef.current = false;
    await load();
  }, [load, materializeOne, missing, plan, running]);

  // O plano aprovado é a autorização para produzir rascunhos. A primeira abertura
  // da fila dispara uma única execução automática; falhas ficam visíveis para retry.
  useEffect(() => {
    if (!onPlanQueue || !plan || plan.conteudo.statusPlanejamento !== "aprovado" || missing.length === 0 || running || startingRef.current) return;
    let alreadyStarted = false;
    try { alreadyStarted = Boolean(sessionStorage.getItem(`${AUTO_KEY_PREFIX}${plan.id}`)); } catch {}
    if (alreadyStarted) return;
    const timer = window.setTimeout(() => { void runAll(); }, 1200);
    return () => window.clearTimeout(timer);
  }, [missing.length, onPlanQueue, plan, runAll, running]);

  const shownResults = results.length > 0 ? results : evidenceResults;
  const readyCount = shownResults.filter((item) => item.status === "ready").length;
  const processingCount = shownResults.filter((item) => item.status === "processing").length;
  const failedCount = shownResults.filter((item) => item.status === "failed").length;

  if (!host || !plan || plan.conteudo.statusPlanejamento !== "aprovado") return null;

  return (
    <>
      {createPortal(
        <div className="flex items-center gap-2">
          {running ? (
            <button type="button" disabled className="inline-flex h-8 items-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-3 text-xs font-semibold text-indigo-800">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Produzindo {progress.done}/{progress.total}{progress.failed ? ` · ${progress.failed} falha(s)` : ""}
            </button>
          ) : missing.length > 0 ? (
            <button type="button" onClick={() => void runAll()} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
              <Play className="h-3.5 w-3.5" /> Produzir plano completo ({missing.length})
            </button>
          ) : (
            <span className="inline-flex h-8 items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-800">
              <CheckCircle2 className="h-3.5 w-3.5" /> Produção iniciada/completa
            </span>
          )}
          <button type="button" onClick={() => setShowDetails((value) => !value)} className="inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-xs font-medium hover:bg-muted">
            Produção real {showDetails ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          <button type="button" onClick={() => void load()} disabled={running} className="inline-flex h-8 w-8 items-center justify-center rounded-md border hover:bg-muted disabled:opacity-50" title="Atualizar produção">
            <RefreshCw className={`h-3.5 w-3.5 ${running ? "animate-spin" : ""}`} />
          </button>
        </div>,
        host,
      )}

      {showDetails && createPortal(
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowDetails(false); }}>
          <div className="max-h-[80vh] w-full max-w-3xl overflow-hidden rounded-2xl border bg-background shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b p-4">
              <div>
                <h3 className="font-semibold">Produção real do Plano de Mídia</h3>
                <p className="mt-1 text-xs text-muted-foreground">Cada linha abaixo representa uma criação real ou um job real no executor correspondente.</p>
              </div>
              <button type="button" className="rounded-md border px-2.5 py-1 text-xs" onClick={() => setShowDetails(false)}>Fechar</button>
            </div>
            <div className="flex gap-2 border-b px-4 py-3 text-xs">
              <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-800">{readyCount} rascunho(s) criado(s)</span>
              <span className="rounded-full bg-indigo-100 px-2 py-1 text-indigo-800">{processingCount} processando</span>
              {failedCount > 0 && <span className="rounded-full bg-red-100 px-2 py-1 text-red-800">{failedCount} falha(s)</span>}
              {missing.length > 0 && <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-800">{missing.length} pendente(s)</span>}
            </div>
            <div className="max-h-[60vh] overflow-auto p-3 space-y-2">
              {shownResults.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">A produção ainda não foi iniciada.</p>
              ) : shownResults.map((item) => (
                <div key={`${item.itemId}-${item.kind}`} className="flex items-center justify-between gap-3 rounded-xl border p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold uppercase text-muted-foreground">{item.kind.replaceAll("_", " ")}</span>
                      {item.status === "ready" ? <span className="text-xs text-emerald-700">Rascunho criado</span> : item.status === "processing" ? <span className="text-xs text-indigo-700">Processando</span> : <span className="inline-flex items-center gap-1 text-xs text-red-700"><TriangleAlert className="h-3.5 w-3.5" />Falhou</span>}
                    </div>
                    <p className="mt-1 truncate text-sm font-medium">{item.label}</p>
                    {item.detail && <p className="mt-0.5 text-xs text-muted-foreground">{item.detail}</p>}
                  </div>
                  {item.executorUrl && (
                    <button type="button" onClick={() => { window.location.href = item.executorUrl!; }} className="shrink-0 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted">Abrir rascunho</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
