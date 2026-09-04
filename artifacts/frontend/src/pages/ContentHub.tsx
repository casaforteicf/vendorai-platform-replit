import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Content from "@/pages/Content";
import Campanhas from "@/pages/Campanhas";
import CampanhasHub from "@/pages/CampanhasHub";
import PlanoMidia from "@/pages/PlanoMidia";
import SiteGenerator from "@/pages/SiteGenerator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  Globe2,
  Images,
  Loader2,
  Megaphone,
  MessageCircle,
  Radio,
  Sparkles,
  Target,
  Video,
} from "lucide-react";

const REDUNDANT_CHILD_TITLES = new Set([
  "Criar conteúdo",
  "Campanhas",
  "Campanhas e Variedades Praça.ai",
]);

const COPY_REPLACEMENTS: Array<[string, string]> = [
  ["Objetivo da peça", "Ângulo da peça"],
  ["O que você quer publicar?", "Instruções adicionais para a IA"],
  ["Criar estratégia com IA", "Preparar conteúdo com IA"],
  ["Produto interno VendorAI", "Funcionalidade VendorAI"],
  ["Patrocinar este conteúdo", "Criar campanha"],
];

const ACTIVE_BRIEFING_KEY = "vendorai_active_marketing_briefing_v1";
const MEDIA_PLAN_EXECUTION_KEY = "vendorai_media_plan_execution_v1";

type PlannerChannel = {
  canal: string;
  funcao: string;
  etapaFunil: string;
  formatos: string[];
  frequencia: string;
  quantidadeMateriais: number;
  kpiPrincipal: string;
};

type PlannerCampaign = {
  id: string;
  nome: string;
  objetivo: string;
  produtoServico: string;
  publico: string;
  regiao?: string;
  oferta: string;
  mensagemCentral: string;
  regraComunicacaoGeografica: string;
  canais: PlannerChannel[];
  kpiPrincipal: string;
  metaPrincipal: string;
};

type PlannerPlan = {
  id: string;
  conteudo: {
    periodoDias?: 30 | 60 | 90;
    statusPlanejamento?: "gerado" | "em_revisao" | "aprovado";
    campanhas?: PlannerCampaign[];
  };
};

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` };
}

function normalizeChannel(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function applyMarketingRedundancyFilter(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>("h1").forEach((heading) => {
    const label = heading.textContent?.replace(/\s+/g, " ").trim() ?? "";
    if (REDUNDANT_CHILD_TITLES.has(label) && !heading.hidden) {
      heading.hidden = true;
    }
  });

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text);

  textNodes.forEach((node) => {
    let next = node.nodeValue ?? "";
    COPY_REPLACEMENTS.forEach(([from, to]) => {
      if (next.includes(from)) next = next.replace(from, to);
    });
    if (next !== node.nodeValue) node.nodeValue = next;
  });

  root.querySelectorAll<HTMLElement>("[title]").forEach((element) => {
    const title = element.getAttribute("title") ?? "";
    if (title.includes("Patrocinar este conteúdo")) {
      element.setAttribute(
        "title",
        "Leva este conteúdo para a aba Campanhas, preservando texto, imagens e contexto da divulgação.",
      );
    }
  });
}

export default function ContentHub() {
  const rootRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const [location, setLocation] = useLocation();
  const queryString = location.includes("?") ? location.split("?")[1] ?? "" : "";
  const params = new URLSearchParams(queryString);
  const mediaPlanSource = params.get("source") === "media-plan" || params.get("from") === "media-plan";
  // Compatibilidade: o atalho lateral "Gerador de Conteúdo" continua apontando
  // para /content. O Planejamento é a primeira aba visual, mas /content abre o
  // gerador como antes; /content?tab=planejamento abre o Planejador explicitamente.
  const requestedTab = params.get("tab") ?? "gerador";
  const requestedMediaPlanId = params.get("mediaPlanId")?.trim() ?? "";
  const requestedPlannerCampaignId = params.get("campaignId")?.trim() ?? "";

  const [plannerPlan, setPlannerPlan] = useState<PlannerPlan | null>(null);
  const [plannerLoading, setPlannerLoading] = useState(false);
  const [plannerError, setPlannerError] = useState<string | null>(null);

  // Compatibilidade: o antigo ?tab=variedades agora abre a modalidade Praça.ai
  // dentro de Campanhas, sem manter uma terceira área paralela no Marketing.
  const legacyPracaView = requestedTab === "variedades";
  const activeTab = requestedTab === "campanhas" || legacyPracaView
    ? "campanhas"
    : requestedTab === "gerador"
      ? "gerador"
      : "planejamento";
  const campaignView = legacyPracaView ? "praca" : params.get("view") ?? "overview";

  const plannerCampaigns = plannerPlan?.conteudo.campanhas ?? [];
  const selectedPlannerCampaign = useMemo(() => {
    if (plannerCampaigns.length === 0) return null;
    if (requestedPlannerCampaignId) {
      const exact = plannerCampaigns.find((campaign) => campaign.id === requestedPlannerCampaignId);
      if (exact) return exact;
    }
    return plannerCampaigns[0] ?? null;
  }, [plannerCampaigns, requestedPlannerCampaignId]);

  const plannerApproved = plannerPlan?.conteudo.statusPlanejamento === "aprovado";

  const executorAvailability = useMemo(() => {
    const channels = selectedPlannerCampaign?.canais.map((channel) => normalizeChannel(channel.canal)) ?? [];
    const has = (terms: string[]) => channels.some((channel) => terms.some((term) => channel.includes(term)));
    return {
      content: has(["instagram", "facebook", "linkedin", "tiktok", "youtube"]),
      ads: has(["meta ads", "facebook ads", "google search", "google display", "performance max", "pmax"]),
      owned: has(["landing", "site", "blog", "seo"]),
      messaging: has(["whatsapp", "email", "e-mail", "sms"]),
      video: has(["instagram", "youtube", "tiktok"]),
    };
  }, [selectedPlannerCampaign]);

  function plannerUrl(extra: Record<string, string | undefined> = {}) {
    const next = new URLSearchParams();
    next.set("source", "media-plan");
    const mediaPlanId = plannerPlan?.id ?? requestedMediaPlanId;
    if (mediaPlanId) next.set("mediaPlanId", mediaPlanId);
    if (selectedPlannerCampaign?.id) next.set("campaignId", selectedPlannerCampaign.id);
    Object.entries(extra).forEach(([key, value]) => {
      if (value) next.set(key, value);
    });
    return `/content?${next.toString()}`;
  }

  function handleTabChange(nextTab: string) {
    if (nextTab === "planejamento") {
      setLocation("/content?tab=planejamento");
      return;
    }
    if (mediaPlanSource) {
      if (nextTab === "gerador") {
        setLocation(plannerUrl());
        return;
      }
      setLocation(plannerUrl({ tab: nextTab }));
      return;
    }
    if (nextTab === "gerador") {
      setLocation("/content?tab=gerador");
      return;
    }
    setLocation(`/content?tab=${nextTab}`);
  }

  useEffect(() => {
    if (!mediaPlanSource || !tenantId) {
      setPlannerPlan(null);
      setPlannerError(null);
      return;
    }

    let cancelled = false;
    setPlannerLoading(true);
    setPlannerError(null);
    fetch(`/api/tenants/${tenantId}/media-plan`, { headers: authHeaders() })
      .then(async (response) => {
        if (!response.ok) throw new Error("Não foi possível carregar o planejamento de mídia.");
        return response.json() as Promise<PlannerPlan | null>;
      })
      .then((plan) => {
        if (cancelled) return;
        if (!plan) throw new Error("Nenhum planejamento de mídia foi encontrado.");
        if (requestedMediaPlanId && plan.id !== requestedMediaPlanId) {
          throw new Error("Este link aponta para uma versão anterior do planejamento. Abra o Plano de Mídia atual para continuar.");
        }
        setPlannerPlan(plan);
      })
      .catch((error) => {
        if (!cancelled) {
          setPlannerPlan(null);
          setPlannerError(error instanceof Error ? error.message : "Falha ao carregar o planejamento.");
        }
      })
      .finally(() => { if (!cancelled) setPlannerLoading(false); });

    return () => { cancelled = true; };
  }, [mediaPlanSource, requestedMediaPlanId, tenantId]);

  useEffect(() => {
    if (!mediaPlanSource || !tenantId || !plannerPlan || !selectedPlannerCampaign) return;

    const channelDirection = selectedPlannerCampaign.canais
      .map((channel) => `${channel.canal}: ${channel.funcao}`)
      .join(" | ");
    const nicheSummary = [
      `Público: ${selectedPlannerCampaign.publico}`,
      `Oferta: ${selectedPlannerCampaign.oferta}`,
      `Mensagem: ${selectedPlannerCampaign.mensagemCentral}`,
      channelDirection && `Função das mídias: ${channelDirection}`,
    ].filter(Boolean).join(" | ");

    const marketingContext = {
      nicheId: `media-plan:${selectedPlannerCampaign.id}`,
      nicheName: nicheSummary,
      productIds: [`custom:media-plan:${selectedPlannerCampaign.id}`],
      productNames: [selectedPlannerCampaign.produtoServico],
      audienceSegment: selectedPlannerCampaign.publico,
      audienceNiche: selectedPlannerCampaign.publico,
      campaignGoal: `${selectedPlannerCampaign.objetivo}. Direção: ${selectedPlannerCampaign.mensagemCentral}`,
      locationRegion: selectedPlannerCampaign.regiao,
      projectName: selectedPlannerCampaign.nome,
      specificDetails: `Oferta: ${selectedPlannerCampaign.oferta}. ${channelDirection}`,
      mandatoryDifferentiators: selectedPlannerCampaign.mensagemCentral,
      restrictions: selectedPlannerCampaign.regraComunicacaoGeografica,
      primaryKpi: `${selectedPlannerCampaign.kpiPrincipal}${selectedPlannerCampaign.metaPrincipal ? ` · ${selectedPlannerCampaign.metaPrincipal}` : ""}`,
      campaignId: selectedPlannerCampaign.id,
      campaignName: selectedPlannerCampaign.nome,
    };

    sessionStorage.setItem(ACTIVE_BRIEFING_KEY, JSON.stringify({
      tenantId,
      campaignId: selectedPlannerCampaign.id,
      campaignName: selectedPlannerCampaign.nome,
      marketingContext,
    }));
    sessionStorage.setItem(MEDIA_PLAN_EXECUTION_KEY, JSON.stringify({
      source: "media-plan",
      tenantId,
      mediaPlanId: plannerPlan.id,
      periodoDias: plannerPlan.conteudo.periodoDias,
      campaign: selectedPlannerCampaign,
      savedAt: new Date().toISOString(),
    }));
  }, [mediaPlanSource, plannerPlan, selectedPlannerCampaign, tenantId]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const apply = () => applyMarketingRedundancyFilter(root);
    apply();

    const observer = new MutationObserver(() => apply());
    observer.observe(root, { childList: true, characterData: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={rootRef} className="min-w-0">
      <div className="px-4 pt-4 md:px-6 md:pt-6">
        <div className="mb-4">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" /> Marketing
          </h1>
          <p className="text-sm text-muted-foreground">Planeje primeiro, aprove a direção e depois produza cada mídia no executor correto.</p>
        </div>

        {mediaPlanSource && (
          <div className="mb-4">
            {plannerLoading ? (
              <Card><CardContent className="py-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando a direção do Plano de Mídia…</CardContent></Card>
            ) : plannerError ? (
              <Card className="border-amber-300 bg-amber-50/50">
                <CardContent className="py-4 flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-sm text-amber-800">{plannerError}</p>
                  <Button size="sm" variant="outline" onClick={() => setLocation("/content?tab=planejamento")}>Abrir Planejamento</Button>
                </CardContent>
              </Card>
            ) : selectedPlannerCampaign ? (
              <Card className="border-primary/25 bg-primary/[0.03]">
                <CardContent className="py-4 space-y-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={plannerApproved ? "bg-emerald-600" : ""}>{plannerApproved ? "Direção aprovada" : "Plano em revisão"}</Badge>
                        <span className="text-xs text-muted-foreground">Plano de {plannerPlan?.conteudo.periodoDias ?? 30} dias</span>
                      </div>
                      <p className="mt-2 font-semibold flex items-center gap-2"><Target className="h-4 w-4 text-primary" />{selectedPlannerCampaign.nome}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{selectedPlannerCampaign.objetivo}</p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setLocation("/content?tab=planejamento")}><ArrowLeft className="h-3.5 w-3.5 mr-1" />Voltar ao planejamento</Button>
                  </div>

                  {plannerCampaigns.length > 1 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] text-muted-foreground mr-1">Campanha:</span>
                      {plannerCampaigns.map((campaign) => (
                        <Button
                          key={campaign.id}
                          type="button"
                          size="sm"
                          variant={campaign.id === selectedPlannerCampaign.id ? "secondary" : "ghost"}
                          className="h-7 text-xs"
                          onClick={() => setLocation(`/content?source=media-plan&mediaPlanId=${encodeURIComponent(plannerPlan!.id)}&campaignId=${encodeURIComponent(campaign.id)}`)}
                        >
                          {campaign.nome}
                        </Button>
                      ))}
                    </div>
                  )}

                  <div className="grid gap-2 md:grid-cols-3">
                    <div className="rounded-md border bg-background/80 p-2.5">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Produto / oferta</p>
                      <p className="text-xs font-medium mt-1">{selectedPlannerCampaign.produtoServico}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{selectedPlannerCampaign.oferta}</p>
                    </div>
                    <div className="rounded-md border bg-background/80 p-2.5">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Público</p>
                      <p className="text-xs font-medium mt-1">{selectedPlannerCampaign.publico}</p>
                      {selectedPlannerCampaign.regiao && <p className="text-xs text-muted-foreground mt-0.5">Segmentação: {selectedPlannerCampaign.regiao}</p>}
                    </div>
                    <div className="rounded-md border bg-background/80 p-2.5">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Mensagem / KPI</p>
                      <p className="text-xs font-medium mt-1 line-clamp-2">{selectedPlannerCampaign.mensagemCentral}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{selectedPlannerCampaign.kpiPrincipal}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Radio className="h-3.5 w-3.5 text-primary" />
                    {selectedPlannerCampaign.canais.map((channel) => (
                      <Badge key={channel.canal} variant="outline" className="text-[10px]">{channel.canal}</Badge>
                    ))}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap border-t pt-3">
                    <span className="text-xs font-medium mr-1">Executar esta direção em:</span>
                    <Button size="sm" variant="outline" disabled={!plannerApproved || !executorAvailability.content} onClick={() => handleTabChange("gerador")}><Images className="h-3.5 w-3.5 mr-1" />Conteúdo orgânico</Button>
                    <Button size="sm" variant="outline" disabled={!plannerApproved || !executorAvailability.ads} onClick={() => setLocation(`/ads?from=media-plan&mediaPlanId=${encodeURIComponent(plannerPlan!.id)}&campaignId=${encodeURIComponent(selectedPlannerCampaign.id)}`)}><Megaphone className="h-3.5 w-3.5 mr-1" />Mídia paga</Button>
                    <Button size="sm" variant="outline" disabled={!plannerApproved || !executorAvailability.owned} onClick={() => setLocation(plannerUrl({ tab: "campanhas", view: "lp" }))}><Globe2 className="h-3.5 w-3.5 mr-1" />Site / LP / SEO</Button>
                    <Button size="sm" variant="outline" disabled={!plannerApproved || !executorAvailability.video} onClick={() => setLocation(`/content-studio/video?from=media-plan&mediaPlanId=${encodeURIComponent(plannerPlan!.id)}&campaignId=${encodeURIComponent(selectedPlannerCampaign.id)}`)}><Video className="h-3.5 w-3.5 mr-1" />Vídeo com IA</Button>
                    <Button size="sm" variant="outline" disabled={!plannerApproved || !executorAvailability.messaging} onClick={() => setLocation(plannerUrl({ tab: "campanhas", view: "organicas" }))}><MessageCircle className="h-3.5 w-3.5 mr-1" />WhatsApp / E-mail</Button>
                  </div>

                  {plannerApproved && (
                    <div className="flex items-center gap-1.5 text-[11px] text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      A direção estratégica desta campanha fica preservada no briefing compartilhado para os executores de Marketing, com público, oferta, objetivo, KPI e regras de comunicação.
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : null}
          </div>
        )}

        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="h-auto flex flex-wrap">
            <TabsTrigger value="planejamento" className="gap-2"><CalendarDays className="h-4 w-4"/>Planejamento</TabsTrigger>
            <TabsTrigger value="gerador" className="gap-2"><Images className="h-4 w-4"/>Gerador de conteúdo</TabsTrigger>
            <TabsTrigger value="campanhas" className="gap-2"><Megaphone className="h-4 w-4"/>Campanhas</TabsTrigger>
          </TabsList>
          <TabsContent value="planejamento" className="-mx-4 md:-mx-6"><div className="p-4 md:p-6"><PlanoMidia /></div></TabsContent>
          <TabsContent value="gerador" className="-mx-4 md:-mx-6"><Content /></TabsContent>
          <TabsContent value="campanhas" className="-mx-4 md:-mx-6">
            {campaignView === "organicas" ? (
              <Campanhas />
            ) : campaignView === "lp" ? (
              <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    if (mediaPlanSource) {
                      setLocation(plannerUrl());
                      return;
                    }
                    const campaignId = params.get("campaignId");
                    setLocation(campaignId
                      ? `/content?tab=campanhas&view=organicas&campaignId=${encodeURIComponent(campaignId)}&from=revenue-scout`
                      : "/content?tab=campanhas");
                  }}
                >
                  <ArrowLeft className="h-4 w-4" /> Voltar para Campanha
                </Button>
                <SiteGenerator />
              </div>
            ) : (
              <CampanhasHub />
            )}
          </TabsContent>
        </Tabs>

        {mediaPlanSource && plannerApproved && selectedPlannerCampaign && (
          <div className="mt-4 pb-3 flex items-center justify-end">
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => setLocation("/content?tab=planejamento")}>
              Ver calendário e aprovações <ExternalLink className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
