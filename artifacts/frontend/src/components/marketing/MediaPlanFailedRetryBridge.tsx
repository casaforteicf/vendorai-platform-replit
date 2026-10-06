import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, RefreshCw } from "lucide-react";

const USER_CACHE_KEY = "vendorai_user_cache";
const OVERRIDE_KEY = "vendorai_sa_tenant_override";
const HOST_ATTR = "data-vendorai-plan-production";
const VIDEO_TYPES = new Set(["reels", "youtube_short", "youtube_video", "tiktok"]);
const AD_TYPES = new Set(["meta_ad", "search_ad", "display_ad", "performance_max"]);
const SITE_TYPES = new Set(["landing_page", "site"]);
const DIRECT_TYPES = new Set(["feed", "stories", "carrossel", "linkedin_post"]);
const MESSAGE_TYPES = new Set(["whatsapp", "email", "blog", "sms"]);

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
  duracaoDias?: number;
};

type MediaPlan = {
  id: string;
  conteudo: { statusPlanejamento?: string; campanhas?: MediaPlanCampaign[] };
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
};

type MediaProject = {
  id: string;
  context?: Record<string, unknown> | null;
};

type Generation = {
  id: string;
  result?: { variations?: Array<Record<string, unknown>> } | null;
};

function tenantId() {
  try {
    const override = JSON.parse(localStorage.getItem(OVERRIDE_KEY) ?? "null") as { id?: string } | null;
    if (override?.id) return override.id;
  } catch {}
  try {
    const user = JSON.parse(localStorage.getItem(USER_CACHE_KEY) ?? "null") as { tenantId?: string } | null;
    return user?.tenantId ?? "";
  } catch {
    return "";
  }
}

function headers(json = false): Record<string, string> {
  const token = localStorage.getItem("vendorai_token") ?? "";
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function campaignFor(plan: MediaPlan, item: CalendarItem) {
  const name = normalize(item.pilar.split(" · ")[0] || "");
  const campaigns = plan.conteudo.campanhas ?? [];
  return campaigns.find((campaign) => normalize(campaign.nome) === name) ?? campaigns[0] ?? null;
}

function generatorType(item: CalendarItem): "feed" | "stories" | "reels" | "linkedin" | "youtube" {
  if (item.tipo === "stories" || item.tipo === "whatsapp" || item.tipo === "sms") return "stories";
  if (item.tipo === "linkedin_post" || item.tipo === "email" || item.tipo === "blog") return "linkedin";
  if (item.tipo === "youtube_video") return "youtube";
  if (VIDEO_TYPES.has(item.tipo)) return "reels";
  return "feed";
}

function promptFor(campaign: MediaPlanCampaign, item: CalendarItem) {
  const delivery = item.tipo === "whatsapp"
    ? "ENTREGA: mensagem de WhatsApp curta, humana e pronta para envio, com CTA claro."
    : item.tipo === "email"
      ? "ENTREGA: hook como assunto e caption como corpo completo do e-mail."
      : item.tipo === "blog"
        ? "ENTREGA: hook como título e caption como artigo educativo completo, sem inventar estatísticas."
        : item.tipo === "sms"
          ? "ENTREGA: SMS com até 300 caracteres e CTA curto."
          : "";
  return [
    item.temaSugerido,
    `Campanha: ${campaign.nome}`,
    `Objetivo: ${campaign.objetivo}`,
    `Produto/serviço: ${campaign.produtoServico}`,
    `Público: ${campaign.publico}`,
    campaign.oferta ? `Oferta/CTA: ${campaign.oferta}` : "",
    campaign.mensagemCentral ? `Mensagem central: ${campaign.mensagemCentral}` : "",
    item.canal ? `Canal: ${item.canal}` : "",
    campaign.regiao ? `Região: ${campaign.regiao}` : "",
    campaign.regraComunicacaoGeografica ? `Regra geográfica: ${campaign.regraComunicacaoGeografica}` : "",
    delivery,
  ].filter(Boolean).join("\n");
}

function extractImages(variation: Record<string, unknown> | undefined) {
  if (!variation) return [] as string[];
  if (Array.isArray(variation.imageUrls)) return variation.imageUrls.filter((value): value is string => typeof value === "string" && Boolean(value));
  return typeof variation.imageUrl === "string" && variation.imageUrl ? [variation.imageUrl] : [];
}

export function MediaPlanFailedRetryBridge() {
  const tid = tenantId();
  const [plan, setPlan] = useState<MediaPlan | null>(null);
  const [calendar, setCalendar] = useState<CalendarItem[]>([]);
  const [projects, setProjects] = useState<MediaProject[]>([]);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, failed: 0 });

  const onContent = window.location.pathname === "/content";

  const load = useCallback(async () => {
    if (!tid || !onContent) return;
    const [planRes, calendarRes, projectsRes] = await Promise.all([
      fetch(`/api/tenants/${tid}/media-plan`, { headers: headers(), cache: "no-store" }),
      fetch(`/api/tenants/${tid}/content-calendar`, { headers: headers(), cache: "no-store" }),
      fetch(`/api/tenants/${tid}/media/projects?limit=200`, { headers: headers(), cache: "no-store" }),
    ]);
    if (planRes.ok) setPlan(await planRes.json() as MediaPlan);
    if (calendarRes.ok) {
      const value = await calendarRes.json();
      setCalendar(Array.isArray(value) ? value : []);
    }
    if (projectsRes.ok) {
      const value = await projectsRes.json() as { projects?: MediaProject[] };
      setProjects(value.projects ?? []);
    }
  }, [onContent, tid]);

  useEffect(() => {
    void load();
    if (!onContent) return;
    const timer = window.setInterval(() => { if (!running) void load(); }, 8000);
    return () => window.clearInterval(timer);
  }, [load, onContent, running]);

  useEffect(() => {
    if (!onContent) return;
    const attach = () => {
      const current = document.querySelector<HTMLElement>(`[${HOST_ATTR}]`);
      setHost(current?.parentElement ?? null);
    };
    attach();
    const timer = window.setInterval(attach, 500);
    return () => window.clearInterval(timer);
  }, [onContent]);

  const projectByItem = useMemo(() => {
    const map = new Map<string, MediaProject>();
    projects.forEach((project) => {
      const id = typeof project.context?.calendarItemId === "string" ? project.context.calendarItemId : "";
      if (id && !map.has(id)) map.set(id, project);
    });
    return map;
  }, [projects]);

  const failedItems = useMemo(() => {
    if (!plan) return [];
    return calendar.filter((item) => {
      if (item.mediaPlanId && item.mediaPlanId !== plan.id) return false;
      if (item.contentGenerationId) return false;
      const project = projectByItem.get(item.id);
      const status = String(project?.context?.materializationStatus ?? project?.context?.lastStatus ?? "");
      return status === "failed" && (item.status === "aprovado" || item.status === "gerado");
    });
  }, [calendar, plan, projectByItem]);

  const patchCalendar = useCallback(async (item: CalendarItem, generationId: string) => {
    const response = await fetch(`/api/content-calendar/${item.id}`, {
      method: "PATCH",
      headers: headers(true),
      body: JSON.stringify({ status: "gerado", contentGenerationId: generationId, variationIdx: 0 }),
    });
    if (!response.ok) throw new Error("Falha ao sincronizar o rascunho com o calendário.");
  }, []);

  const patchProject = useCallback(async (project: MediaProject, patch: Record<string, unknown>) => {
    const context = { ...(project.context ?? {}), ...patch, updatedFromPlanAt: new Date().toISOString() };
    const response = await fetch(`/api/tenants/${tid}/media/projects/${project.id}`, {
      method: "PATCH",
      headers: headers(true),
      body: JSON.stringify({ status: "ready", context }),
    });
    if (!response.ok) throw new Error("Falha ao atualizar o histórico da produção.");
  }, [plan?.id, tid]);

  const generate = useCallback(async (item: CalendarItem, campaign: MediaPlanCampaign, visual: boolean) => {
    const response = await fetch(`/api/tenants/${tid}/content/generate`, {
      method: "POST",
      headers: {
        ...headers(true),
        "x-vendorai-calendar-item-id": item.id,
        "x-vendorai-media-plan-id": plan?.id ?? "",
        "x-vendorai-campaign-id": campaign.id,
      },
      body: JSON.stringify({
        type: generatorType(item),
        theme: promptFor(campaign, item).slice(0, 8000),
        variations: 1,
        imageCount: item.tipo === "carrossel" ? 4 : 1,
        postObjective: campaign.objetivo,
        desiredCta: campaign.oferta,
      }),
    });
    const generation = await response.json().catch(() => ({})) as Generation & { error?: string };
    if (!response.ok || !generation.id) throw new Error(generation.error ?? "O gerador não criou o rascunho.");
    let variation = generation.result?.variations?.[0];
    if (visual && extractImages(variation).length === 0) {
      const imageResponse = await fetch(`/api/tenants/${tid}/content/${generation.id}/variations/0/regenerate-image`, {
        method: "POST",
        headers: headers(true),
        body: JSON.stringify({ imageCount: item.tipo === "performance_max" ? 3 : item.tipo === "carrossel" ? 4 : 1, observations: `Plano de Mídia: ${campaign.mensagemCentral}. Gere criativo profissional pronto para revisão.` }),
      });
      const imagePayload = await imageResponse.json().catch(() => ({})) as { imageUrls?: string[]; error?: string };
      if (!imageResponse.ok || !imagePayload.imageUrls?.length) throw new Error(imagePayload.error ?? "O criativo visual não foi concluído.");
      variation = { ...(variation ?? {}), imageUrl: imagePayload.imageUrls[0], imageUrls: imagePayload.imageUrls };
    }
    return { generation, variation };
  }, [tid]);

  const retryOne = useCallback(async (item: CalendarItem) => {
    if (!plan) throw new Error("Plano não carregado.");
    const project = projectByItem.get(item.id);
    if (!project) throw new Error("Histórico da falha não encontrado.");
    const campaign = campaignFor(plan, item);
    if (!campaign) throw new Error("Campanha não encontrada.");
    await patchProject(project, { materializationStatus: "processing", executorDetail: "Nova tentativa iniciada" });

    try {
      if (DIRECT_TYPES.has(item.tipo) || MESSAGE_TYPES.has(item.tipo)) {
        const visual = DIRECT_TYPES.has(item.tipo) && item.tipo !== "linkedin_post";
        const { generation } = await generate(item, campaign, visual);
        await patchCalendar(item, generation.id);
        await patchProject(project, {
          materializationStatus: "draft_ready",
          executorKind: DIRECT_TYPES.has(item.tipo) ? "content" : item.tipo,
          executorDraftId: generation.id,
          executorUrl: `/content?tab=gerador&calendarItemId=${encodeURIComponent(item.id)}`,
          executorDetail: DIRECT_TYPES.has(item.tipo) ? "Conteúdo criado após nova tentativa" : `${item.tipo.toUpperCase()} criado após nova tentativa`,
          contentGenerationId: generation.id,
        });
        return;
      }

      if (AD_TYPES.has(item.tipo)) {
        const visual = item.tipo !== "search_ad";
        const { generation, variation } = await generate(item, campaign, visual);
        const caption = String(variation?.caption ?? variation?.text ?? item.temaSugerido);
        const hook = String(variation?.hook ?? caption.split(/[.!?\n]/)[0] ?? item.temaSugerido).trim();
        const images = extractImages(variation);
        const response = await fetch(`/api/tenants/${tid}/ads/campaigns`, {
          method: "POST",
          headers: headers(true),
          body: JSON.stringify({
            plataforma: item.tipo === "meta_ad" ? "meta" : "google",
            tipoAnuncio: item.tipo === "meta_ad" || item.tipo === "display_ad" ? "imagem" : "rsa_pmax",
            vertical: "Marketing",
            itemTipo: "livre",
            itemLabel: item.temaSugerido.slice(0, 180),
            modo: "unico",
            destinoClique: "formulario_lead",
            orcamentoDiario: "0.00",
            segmentacao: { mediaPlanDraft: { source: "media-plan", requiresBudgetBeforePublish: true, generatedAt: new Date().toISOString() } },
            creativeDraft: { headlines: [hook, item.temaSugerido, campaign.produtoServico].filter(Boolean), descriptions: [caption, campaign.mensagemCentral].filter(Boolean), imagens: images.slice(0, 10) },
          }),
        });
        const ad = await response.json().catch(() => ({})) as { id?: string; error?: string };
        if (!response.ok || !ad.id) throw new Error(ad.error ?? "Não foi possível recriar o rascunho do anúncio.");
        await patchCalendar(item, generation.id);
        await patchProject(project, { materializationStatus: "draft_ready", executorKind: "ad", executorDraftId: ad.id, executorUrl: `/ads?campaignId=${encodeURIComponent(ad.id)}&from=media-plan`, executorDetail: "Rascunho de anúncio criado após nova tentativa", contentGenerationId: generation.id });
        return;
      }

      if (VIDEO_TYPES.has(item.tipo)) {
        const { generation } = await generate(item, campaign, false);
        const response = await fetch(`/api/tenants/${tid}/media-engine/jobs`, {
          method: "POST",
          headers: headers(true),
          body: JSON.stringify({ operation: "video_generate", title: `${campaign.nome} · ${item.temaSugerido}`.slice(0, 120), context: { prompt: promptFor(campaign, item).slice(0, 4000), aspectRatio: item.tipo === "youtube_video" ? "landscape" : "portrait", duration: item.tipo === "youtube_video" ? 30 : 16, source: "media-plan", mediaPlanId: plan.id, campaignId: campaign.id, calendarItemId: item.id, contentType: item.tipo, scriptContentGenerationId: generation.id } }),
        });
        const job = await response.json().catch(() => ({})) as { projectId?: string; jobId?: string; error?: string };
        if (!response.ok || !job.projectId || !job.jobId) throw new Error(job.error ?? "Não foi possível reiniciar o vídeo.");
        await patchCalendar(item, generation.id);
        await patchProject(project, { materializationStatus: "processing", executorKind: "video", executorJobId: job.jobId, executorProjectId: job.projectId, executorUrl: "/content-studio/video", executorDetail: "Vídeo reiniciado após falha", contentGenerationId: generation.id });
        return;
      }

      if (SITE_TYPES.has(item.tipo)) {
        const { generation } = await generate(item, campaign, false);
        const response = await fetch(`/api/tenants/${tid}/site-generator/generate`, {
          method: "POST",
          headers: headers(true),
          body: JSON.stringify({ type: item.tipo === "landing_page" ? "landing" : "institutional", name: `${campaign.nome} — ${item.temaSugerido}`.slice(0, 140), sector: campaign.produtoServico.slice(0, 120) || "Serviços", desc: `${campaign.mensagemCentral}\n${item.temaSugerido}`, pain: campaign.objetivo, tone: "profissional, claro, confiável e orientado à conversão", cta: campaign.oferta || "Fale com nossa equipe", color: "#4F46E5", products: [], images: [], videos: [], servicos: campaign.produtoServico, headline: item.temaSugerido }),
        });
        const job = await response.json().catch(() => ({})) as { jobId?: string; error?: string };
        if (!response.ok || !job.jobId) throw new Error(job.error ?? "Não foi possível reiniciar a página.");
        await patchCalendar(item, generation.id);
        await patchProject(project, { materializationStatus: "processing", executorKind: "site", executorJobId: job.jobId, executorUrl: `/content?tab=campanhas&view=lp&source=media-plan&mediaPlanId=${encodeURIComponent(plan.id)}&campaignId=${encodeURIComponent(campaign.id)}`, executorDetail: "Página reiniciada após falha", contentGenerationId: generation.id });
        return;
      }

      throw new Error(`Formato ${item.tipo} não é elegível para retry automático.`);
    } catch (error) {
      await patchProject(project, { materializationStatus: "failed", executorKind: item.tipo, executorDetail: error instanceof Error ? error.message : "Falha na nova tentativa" }).catch(() => undefined);
      throw error;
    }
  }, [generate, patchCalendar, patchProject, plan, projectByItem, tid]);

  const retryAll = useCallback(async () => {
    if (running || failedItems.length === 0) return;
    setRunning(true);
    setProgress({ done: 0, total: failedItems.length, failed: 0 });
    let nextIndex = 0;
    let done = 0;
    let failed = 0;
    const worker = async () => {
      while (true) {
        const index = nextIndex++;
        if (index >= failedItems.length) return;
        try {
          await retryOne(failedItems[index]!);
        } catch {
          failed += 1;
        }
        done += 1;
        setProgress({ done, total: failedItems.length, failed });
      }
    };
    await Promise.all([worker(), worker()]);
    setRunning(false);
    await load();
  }, [failedItems, load, retryOne, running]);

  if (!host || !plan || plan.conteudo.statusPlanejamento !== "aprovado" || failedItems.length === 0) return null;

  return createPortal(
    <button
      type="button"
      disabled={running}
      onClick={() => void retryAll()}
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
      title="Reprocessa somente itens que falharam, sem recriar rascunhos já concluídos"
    >
      {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
      {running ? `Refazendo ${progress.done}/${progress.total}${progress.failed ? ` · ${progress.failed} falha(s)` : ""}` : `Reprocessar falhas (${failedItems.length})`}
    </button>,
    host,
  );
}
