import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Content from "@/pages/Content";
import Campanhas from "@/pages/Campanhas";
import CampanhasHub from "@/pages/CampanhasHub";
import PlanoMidia from "@/pages/PlanoMidia";
import SiteGenerator from "@/pages/SiteGenerator";
import VisitorIntelligence from "@/pages/VisitorIntelligence";
import ContentProductionQueue from "@/components/marketing/ContentProductionQueue";
import LeadCaptureFreeToolBuilder from "@/components/marketing/LeadCaptureFreeToolBuilder";
import SearchConsoleInsightsPanel from "@/components/marketing/SearchConsoleInsightsPanel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  CheckCircle2,
  Circle,
  Clock3,
  ExternalLink,
  Film,
  Globe2,
  Images,
  LayoutDashboard,
  Loader2,
  Megaphone,
  MessageCircle,
  Plus,
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

type MainMarketingTab = "visao-geral" | "planejamento" | "campanhas" | "conteudos" | "resultados" | "rastreamento";

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
  materiaisPlanejados?: number;
  coverUrl?: string;
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

function normalizeMainTab(tab: string): MainMarketingTab {
  if (tab === "gerador") return "conteudos";
  if (tab === "variedades") return "campanhas";
  if (tab === "planejamento" || tab === "campanhas" || tab === "conteudos" || tab === "resultados" || tab === "rastreamento" || tab === "visao-geral") {
    return tab;
  }
  return "visao-geral";
}

function applyMarketingRedundancyFilter(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>("h1").forEach((heading) => {
    const label = heading.textContent?.replace(/\s+/g, " ").trim() ?? "";
    if (REDUNDANT_CHILD_TITLES.has(label) && !heading.hidden) heading.hidden = true;
  });

  root.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
    const label = button.textContent?.replace(/\s+/g, " ").trim() ?? "";
    if (label === "Visitantes") button.style.display = "none";
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
}

function useBrowserLocationSnapshot(routerLocation: string) {
  const [value, setValue] = useState(() => `${window.location.pathname}${window.location.search}`);

  useEffect(() => {
    const sync = () => {
      const next = `${window.location.pathname}${window.location.search}`;
      setValue((current) => current === next ? current : next);
    };
    sync();
    window.addEventListener("popstate", sync);
    const timer = window.setInterval(sync, 200);
    return () => {
      window.removeEventListener("popstate", sync);
      window.clearInterval(timer);
    };
  }, [routerLocation]);

  return value;
}

export default function ContentHub() {
  const rootRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const [location, setLocation] = useLocation();
  const browserLocation = useBrowserLocationSnapshot(location);
  const queryString = browserLocation.includes("?") ? browserLocation.split("?")[1] ?? "" : "";
  const params = new URLSearchParams(queryString);
  const mediaPlanSource = params.get("source") === "media-plan" || params.get("from") === "media-plan";
  const manualCreation = params.get("mode") === "avulso";
  const requestedTab = params.get("tab") ?? "visao-geral";
  const legacyVisitorView = requestedTab === "campanhas" && params.get("view") === "visitantes";
  const activeTab: MainMarketingTab = legacyVisitorView ? "rastreamento" : normalizeMainTab(requestedTab);
  const requestedMediaPlanId = params.get("mediaPlanId")?.trim() ?? "";
  const requestedPlannerCampaignId = params.get("campaignId")?.trim() ?? "";
  const legacyPracaView = requestedTab === "variedades";
  const campaignView = legacyPracaView ? "praca" : params.get("view") ?? "overview";

  const [plannerPlan, setPlannerPlan] = useState<PlannerPlan | null>(null);
  const [plannerLoading, setPlannerLoading] = useState(false);
  const [plannerError, setPlannerError] = useState<string | null>(null);

  const plannerCampaigns = plannerPlan?.conteudo.campanhas ?? [];
  const selectedPlannerCampaign = useMemo(() => {
    if (!requestedPlannerCampaignId || plannerCampaigns.length === 0) return null;
    return plannerCampaigns.find((campaign) => campaign.id === requestedPlannerCampaignId) ?? null;
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

  function openPlannerCampaign(campaignId: string) {
    const next = new URLSearchParams();
    next.set("source", "media-plan");
    next.set("tab", "campanhas");
    const mediaPlanId = plannerPlan?.id ?? requestedMediaPlanId;
    if (mediaPlanId) next.set("mediaPlanId", mediaPlanId);
    next.set("campaignId", campaignId);
    setLocation(`/content?${next.toString()}`);
  }

  function openCampaignList() {
    const next = new URLSearchParams();
    next.set("source", "media-plan");
    next.set("tab", "campanhas");
    const mediaPlanId = plannerPlan?.id ?? requestedMediaPlanId;
    if (mediaPlanId) next.set("mediaPlanId", mediaPlanId);
    setLocation(`/content?${next.toString()}`);
  }

  function handleTabChange(nextTab: string) {
    const normalized = normalizeMainTab(nextTab);
    if (mediaPlanSource && normalized !== "visao-geral" && normalized !== "resultados" && normalized !== "rastreamento") {
      setLocation(plannerUrl({ tab: normalized }));
      return;
    }
    setLocation(`/content?tab=${normalized}`);
  }

  useEffect(() => {
    if ((!mediaPlanSource && activeTab !== "visao-geral") || !tenantId) {
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
        if (!plan) {
          if (mediaPlanSource) throw new Error("Nenhum planejamento de mídia foi encontrado.");
          setPlannerPlan(null);
          return;
        }
        if (mediaPlanSource && requestedMediaPlanId && plan.id !== requestedMediaPlanId) {
          throw new Error("Este link aponta para uma versão anterior do planejamento. Abra o Planejamento atual para continuar.");
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
  }, [activeTab, mediaPlanSource, requestedMediaPlanId, tenantId]);

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

  // The overview derives its guidance from the tenant's current marketing plan.
  const overviewStatus = plannerPlan?.conteudo.statusPlanejamento;
  const currentJourneyStep = !plannerPlan
    ? 1
    : overviewStatus === "gerado" || overviewStatus === "em_revisao"
      ? 2
      : 3;

  const journeySteps = [
    { n: 1, title: "Planejar", text: "Definir objetivo, público, oferta, canais, período e orçamento.", tab: "planejamento" as const },
    { n: 2, title: "Aprovar", text: "Revisar a estratégia preparada pela IA e liberar a execução.", tab: "planejamento" as const },
    { n: 3, title: "Executar", text: "Criar campanhas e produzir os conteúdos necessários.", tab: "campanhas" as const },
    { n: 4, title: "Publicar", text: "Revisar, aprovar, agendar e publicar nos canais conectados.", tab: "conteudos" as const },
    { n: 5, title: "Melhorar", text: "Analisar resultados, atribuição e aprendizados para o próximo ciclo.", tab: "resultados" as const },
  ];

  const overviewAction = currentJourneyStep === 1
    ? { title: "Crie o planejamento de marketing", description: "Defina o objetivo, o público, a oferta, os canais, o período e o orçamento para a IA preparar a estratégia.", label: "Começar planejamento", tab: "planejamento" as const }
    : currentJourneyStep === 2
      ? { title: "Revise e aprove o planejamento", description: "A execução só será liberada depois da sua aprovação. Confira a estratégia e solicite ajustes se necessário.", label: "Revisar e aprovar", tab: "planejamento" as const }
      : { title: "Prepare as campanhas e os conteúdos", description: `O planejamento está aprovado. Organize a execução das ${plannerCampaigns.length || "suas"} campanhas e produza as peças necessárias.`, label: "Continuar execução", tab: "campanhas" as const };

  return (
    <div ref={rootRef} className="min-w-0">
      <div className="px-4 pt-4 md:px-6 md:pt-6">
        <div className="mb-4">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" /> Marketing
          </h1>
          <p className="text-sm text-muted-foreground">Planeje, execute, publique e melhore com base nos resultados.</p>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="h-auto flex flex-wrap gap-1">
            <TabsTrigger value="visao-geral" className="gap-2"><LayoutDashboard className="h-4 w-4"/>Visão Geral</TabsTrigger>
            <TabsTrigger value="planejamento" className="gap-2"><CalendarDays className="h-4 w-4"/>1. Planejamento</TabsTrigger>
            <TabsTrigger value="campanhas" className="gap-2"><Megaphone className="h-4 w-4"/>2. Campanhas</TabsTrigger>
            <TabsTrigger value="conteudos" className="gap-2"><Images className="h-4 w-4"/>3. Conteúdos & Criativos</TabsTrigger>
            <TabsTrigger value="resultados" className="gap-2"><BarChart3 className="h-4 w-4"/>4. Resultados</TabsTrigger>
            <TabsTrigger value="rastreamento" className="gap-2"><Radio className="h-4 w-4"/>Rastreamento</TabsTrigger>
          </TabsList>

          {activeTab !== "planejamento" && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
              <span className="text-xs font-medium text-muted-foreground mr-1">Ferramentas:</span>
              <Button size="sm" variant="outline" onClick={() => setLocation("/midias")}><Images className="h-3.5 w-3.5 mr-1.5"/>Mídias</Button>
              <Button size="sm" variant="outline" onClick={() => setLocation("/content-studio/video")}><Film className="h-3.5 w-3.5 mr-1.5"/>Vídeos com IA</Button>
              <Button size="sm" variant="outline" onClick={() => setLocation("/content?tab=campanhas&view=lp")}><Globe2 className="h-3.5 w-3.5 mr-1.5"/>Sites & LPs</Button>
              <Button size="sm" variant="outline" onClick={() => setLocation("/ads")}><Megaphone className="h-3.5 w-3.5 mr-1.5"/>Anúncios</Button>
              <Button size="sm" variant="outline" onClick={() => setLocation("/content?tab=rastreamento")}><Radio className="h-3.5 w-3.5 mr-1.5"/>Rastreamento</Button>
            </div>
          )}

          <TabsContent value="visao-geral" className="mt-5">
            {plannerLoading ? (
              <Card><CardContent className="py-8 flex items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando a situação do marketing…</CardContent></Card>
            ) : (
              <div className="space-y-4">
                {plannerError && (
                  <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                    <div><p className="font-semibold">Não foi possível carregar a situação atual.</p><p className="text-sm">{plannerError}</p></div>
                  </div>
                )}

                <Card className="border-primary/25 bg-primary/[0.03]">
                  <CardContent className="p-5 md:p-6">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                      <div className="max-w-3xl">
                        <div className="mb-2 flex items-center gap-2">
                          <Badge>Etapa {currentJourneyStep} de 5</Badge>
                          <span className="text-xs text-muted-foreground">Próxima ação</span>
                        </div>
                        <h2 className="text-xl font-bold tracking-tight">{overviewAction.title}</h2>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">{overviewAction.description}</p>
                      </div>
                      <Button size="lg" className="shrink-0" onClick={() => handleTabChange(overviewAction.tab)}>
                        {overviewAction.label}<ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <CardTitle className="text-base">Sua jornada de marketing</CardTitle>
                      <p className="text-xs text-muted-foreground">Veja onde você está e o que acontece depois.</p>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-7">
                      {journeySteps.map((step) => {
                        const completed = step.n < currentJourneyStep;
                        const current = step.n === currentJourneyStep;
                        return (
                          <button
                            key={step.n}
                            type="button"
                            onClick={() => handleTabChange(step.tab)}
                            className={`rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                              current ? "border-primary bg-primary/5" : completed ? "border-emerald-200 bg-emerald-50/60" : "bg-background hover:border-primary/40"
                            }`}
                          >
                            <div className="mb-2 flex items-center justify-between">
                              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Etapa {step.n}</span>
                              {completed ? <Check className="h-4 w-4 text-emerald-600" /> : current ? <Clock3 className="h-4 w-4 text-primary" /> : <Circle className="h-4 w-4 text-muted-foreground/40" />}
                            </div>
                            <p className="text-sm font-semibold">{step.title}</p>
                            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{step.text}</p>
                            <p className={`mt-3 text-[10px] font-semibold ${
                              current ? "text-primary" : completed ? "text-emerald-700" : "text-muted-foreground"
                            }`}>{completed ? "Concluída" : current ? "Agora" : "Próxima"}</p>
                          </button>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground">Planejamento</p>
                      <p className="mt-1 font-semibold">{!plannerPlan ? "Ainda não iniciado" : plannerApproved ? "Aprovado" : "Aguardando aprovação"}</p>
                      <Button variant="link" className="mt-1 h-auto p-0 text-xs" onClick={() => handleTabChange("planejamento")}>Abrir planejamento</Button>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground">Campanhas planejadas</p>
                      <p className="mt-1 font-semibold">{plannerPlan ? `${plannerCampaigns.length} campanha${plannerCampaigns.length === 1 ? "" : "s"}` : "Dependem do planejamento"}</p>
                      <Button variant="link" className="mt-1 h-auto p-0 text-xs" onClick={() => handleTabChange("campanhas")}>Abrir campanhas</Button>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground">Conteúdos e aprovações</p>
                      <p className="mt-1 font-semibold">{plannerApproved ? "Prontos para preparar" : "Aguardando planejamento"}</p>
                      <Button variant="link" className="mt-1 h-auto p-0 text-xs" onClick={() => handleTabChange("conteudos")}>Ver fila de produção</Button>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground">Resultados e origem</p>
                      <p className="mt-1 font-semibold">Acompanhar dados reais</p>
                      <div className="mt-1 flex gap-3">
                        <Button variant="link" className="h-auto p-0 text-xs" onClick={() => handleTabChange("resultados")}>Resultados</Button>
                        <Button variant="link" className="h-auto p-0 text-xs" onClick={() => handleTabChange("rastreamento")}>Rastreamento</Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="planejamento" className="-mx-4 md:-mx-6">
            <div className="p-4 md:p-6"><PlanoMidia /></div>
          </TabsContent>

          <TabsContent value="campanhas" className="-mx-4 md:-mx-6">
            {mediaPlanSource && (
              <div className="px-4 pt-4 md:px-6 md:pt-6">
                {plannerLoading ? (
                  <Card><CardContent className="py-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando campanhas…</CardContent></Card>
                ) : plannerError ? (
                  <Card className="border-amber-300 bg-amber-50/50"><CardContent className="py-4 text-sm text-amber-800">{plannerError}</CardContent></Card>
                ) : selectedPlannerCampaign ? (
                  <Card className="border-primary/25 bg-primary/[0.03]">
                    <CardContent className="py-4 space-y-3">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge className={plannerApproved ? "bg-emerald-600" : ""}>{plannerApproved ? "Campanha pronta" : "Em revisão"}</Badge>
                            <span className="text-xs text-muted-foreground">{plannerPlan?.conteudo.periodoDias ?? 30} dias</span>
                          </div>
                          <p className="mt-2 font-semibold">{selectedPlannerCampaign.nome}</p>
                          <p className="mt-1 text-sm text-muted-foreground">{selectedPlannerCampaign.objetivo}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" onClick={openCampaignList}><ArrowLeft className="h-3.5 w-3.5 mr-1"/>Todas as campanhas</Button>
                          <Button size="sm" variant="ghost" onClick={() => handleTabChange("planejamento")}>Planejamento</Button>
                        </div>
                      </div>

                      <div className="grid gap-2 md:grid-cols-3">
                        <div className="rounded-md border bg-background/80 p-2.5"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Produto / oferta</p><p className="text-xs font-medium mt-1">{selectedPlannerCampaign.produtoServico}</p><p className="text-xs text-muted-foreground mt-0.5">{selectedPlannerCampaign.oferta}</p></div>
                        <div className="rounded-md border bg-background/80 p-2.5"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Público</p><p className="text-xs font-medium mt-1">{selectedPlannerCampaign.publico}</p>{selectedPlannerCampaign.regiao && <p className="text-xs text-muted-foreground mt-0.5">{selectedPlannerCampaign.regiao}</p>}</div>
                        <div className="rounded-md border bg-background/80 p-2.5"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Mensagem / KPI</p><p className="text-xs font-medium mt-1 line-clamp-2">{selectedPlannerCampaign.mensagemCentral}</p><p className="text-xs text-muted-foreground mt-0.5">{selectedPlannerCampaign.kpiPrincipal}</p></div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap"><Radio className="h-3.5 w-3.5 text-primary" />{selectedPlannerCampaign.canais.map((channel) => <Badge key={channel.canal} variant="outline" className="text-[10px]">{channel.canal}</Badge>)}</div>

                      <div className="flex items-center gap-2 flex-wrap border-t pt-3">
                        <span className="text-xs font-medium mr-1">Executar em:</span>
                        <Button size="sm" variant="outline" disabled={!plannerApproved || !executorAvailability.content} onClick={() => handleTabChange("conteudos")}><Images className="h-3.5 w-3.5 mr-1"/>Conteúdo</Button>
                        <Button size="sm" variant="outline" disabled={!plannerApproved || !executorAvailability.ads} onClick={() => setLocation(`/ads?from=media-plan&mediaPlanId=${encodeURIComponent(plannerPlan!.id)}&campaignId=${encodeURIComponent(selectedPlannerCampaign.id)}`)}><Megaphone className="h-3.5 w-3.5 mr-1"/>Anúncios</Button>
                        <Button size="sm" variant="outline" disabled={!plannerApproved || !executorAvailability.owned} onClick={() => setLocation(plannerUrl({ tab: "campanhas", view: "lp" }))}><Globe2 className="h-3.5 w-3.5 mr-1"/>Site / LP</Button>
                        <Button size="sm" variant="outline" disabled={!plannerApproved || !executorAvailability.video} onClick={() => setLocation(`/content-studio/video?from=media-plan&mediaPlanId=${encodeURIComponent(plannerPlan!.id)}&campaignId=${encodeURIComponent(selectedPlannerCampaign.id)}`)}><Video className="h-3.5 w-3.5 mr-1"/>Vídeo com IA</Button>
                        <Button size="sm" variant="outline" disabled={!plannerApproved || !executorAvailability.messaging} onClick={() => setLocation(plannerUrl({ tab: "campanhas", view: "organicas" }))}><MessageCircle className="h-3.5 w-3.5 mr-1"/>WhatsApp / E-mail</Button>
                      </div>

                      {plannerApproved && <div className="flex items-center gap-1.5 text-[11px] text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5"/>Tudo produzido aqui permanece vinculado a esta campanha.</div>}
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="text-xl font-semibold">Campanhas</h2>
                          <Badge variant="outline">{plannerCampaigns.length} campanhas</Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">Escolha uma campanha para ver o próximo passo, os conteúdos e os resultados.</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={() => handleTabChange("planejamento")}>Revisar planejamento</Button>
                        <Button onClick={() => setLocation("/content?tab=campanhas")}><Plus className="h-4 w-4 mr-2"/>Nova campanha</Button>
                      </div>
                    </div>

                    {plannerCampaigns.length === 0 ? (
                      <Card>
                        <CardContent className="py-8 text-center">
                          <p className="font-semibold">Nenhuma campanha foi gerada ainda.</p>
                          <p className="mt-1 text-sm text-muted-foreground">Volte ao Planejamento, aprove a proposta e gere as campanhas.</p>
                          <Button className="mt-4" onClick={() => handleTabChange("planejamento")}>Abrir Planejamento</Button>
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {plannerCampaigns.map((campaign) => (
                          <button
                            key={campaign.id}
                            type="button"
                            onClick={() => openPlannerCampaign(campaign.id)}
                            className="rounded-xl border bg-background p-4 text-left transition hover:border-primary/50 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <div className="mb-3 overflow-hidden rounded-lg border bg-muted/30">
                              {campaign.coverUrl ? (
                                <img src={campaign.coverUrl} alt="" className="h-28 w-full object-cover" />
                              ) : (
                                <div className="flex h-20 items-center justify-center gap-2 text-xs text-muted-foreground">
                                  <Megaphone className="h-4 w-4" />
                                  Capa da campanha
                                </div>
                              )}
                            </div>
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-semibold truncate">{campaign.nome}</p>
                                <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{campaign.objetivo}</p>
                              </div>
                              <Badge className={plannerApproved ? "bg-emerald-600 shrink-0" : "shrink-0"}>{plannerApproved ? "Pronta" : "Em revisão"}</Badge>
                            </div>
                            <div className="mt-4 grid gap-2 text-xs">
                              <div><span className="text-muted-foreground">Público: </span><span className="font-medium">{campaign.publico}</span></div>
                              <div><span className="text-muted-foreground">Oferta: </span><span className="font-medium">{campaign.oferta}</span></div>
                              <div><span className="text-muted-foreground">KPI: </span><span className="font-medium">{campaign.kpiPrincipal}</span></div>
                            </div>
                            <div className="mt-4 flex flex-wrap gap-1.5">
                              {campaign.canais.slice(0, 5).map((channel) => <Badge key={channel.canal} variant="outline" className="text-[10px]">{channel.canal}</Badge>)}
                              {campaign.canais.length > 5 && <Badge variant="outline" className="text-[10px]">+{campaign.canais.length - 5}</Badge>}
                            </div>
                            <div className="mt-4 rounded-lg bg-muted/40 px-3 py-2 text-xs">
                              <span className="text-muted-foreground">Próximo passo: </span>
                              <span className="font-medium">{plannerApproved ? `Preparar ${campaign.materiaisPlanejados ?? campaign.canais.reduce((sum, channel) => sum + (channel.quantidadeMateriais || 0), 0)} ações` : "Revisar e aprovar a campanha"}</span>
                            </div>
                            <div className="mt-3 border-t pt-3 text-xs font-medium text-primary">Abrir campanha →</div>
                          </button>
                        ))}
                      </div>
                    )}
                    <details className="rounded-xl border bg-background">
                      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium">
                        Ferramentas de captação
                        <span className="ml-2 text-xs font-normal text-muted-foreground">Formulários, simuladores e entregas gratuitas</span>
                      </summary>
                      <div className="border-t p-4">
                        <LeadCaptureFreeToolBuilder tenantId={tenantId} />
                      </div>
                    </details>
                  </div>
                )}
              </div>
            )}

            {mediaPlanSource && !selectedPlannerCampaign && campaignView === "overview" ? null : campaignView === "organicas" ? (
              <Campanhas />
            ) : campaignView === "lp" ? (
              <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
                <Button variant="ghost" size="sm" className="gap-1.5" onClick={mediaPlanSource ? openCampaignList : () => setLocation("/content?tab=campanhas")}><ArrowLeft className="h-4 w-4"/>Voltar para Campanhas</Button>
                <SiteGenerator />
              </div>
            ) : (
              <CampanhasHub />
            )}
          </TabsContent>

          <TabsContent value="conteudos" className="-mx-4 md:-mx-6">
            {manualCreation ? (
              <>
                <div className="px-4 pt-4 md:px-6 flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <Badge variant="outline">Criação avulsa</Badge>
                    <p className="mt-1 text-xs text-muted-foreground">Crie conteúdo sem precisar vinculá-lo a uma campanha.</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setLocation("/content?tab=conteudos")}><ArrowLeft className="h-3.5 w-3.5 mr-1"/>Conteúdos do plano</Button>
                </div>
                <Content />
              </>
            ) : (
              <ContentProductionQueue tenantId={tenantId} />
            )}
          </TabsContent>

          <TabsContent value="resultados" className="mt-5">
            <Card className="border-primary/20 bg-primary/[0.02]">
              <CardContent className="py-5">
                <p className="text-sm font-semibold">O que merece atenção agora?</p>
                <p className="mt-1 text-sm text-muted-foreground">Compare campanhas, conteúdos, anúncios e conversões. Os detalhes técnicos de rastreamento ficam abaixo.</p>
              </CardContent>
            </Card>
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Card><CardContent className="py-5"><p className="text-xs text-muted-foreground">Campanhas</p><p className="mt-1 font-semibold">Compare o desempenho entre campanhas.</p><Button variant="link" className="px-0" onClick={() => handleTabChange("campanhas")}>Abrir campanhas</Button></CardContent></Card>
              <Card><CardContent className="py-5"><p className="text-xs text-muted-foreground">Conteúdos</p><p className="mt-1 font-semibold">Veja quais peças e criativos estão alimentando as ações.</p><Button variant="link" className="px-0" onClick={() => handleTabChange("conteudos")}>Abrir conteúdos</Button></CardContent></Card>
              <Card><CardContent className="py-5"><p className="text-xs text-muted-foreground">Anúncios</p><p className="mt-1 font-semibold">Acompanhe mídia paga e campanhas patrocinadas.</p><Button variant="link" className="px-0" onClick={() => setLocation("/ads")}>Abrir anúncios</Button></CardContent></Card>
              <Card><CardContent className="py-5"><p className="text-xs text-muted-foreground">Conversão</p><p className="mt-1 font-semibold">Use campanhas, LPs e CRM para acompanhar o caminho até a oportunidade.</p><Button variant="link" className="px-0" onClick={() => handleTabChange("campanhas")}>Ver funil</Button></CardContent></Card>
            </div>
            <Card className="mt-4">
              <CardContent className="py-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div><p className="font-semibold">Use os resultados no próximo ciclo.</p><p className="text-sm text-muted-foreground">O que funcionar melhor deve orientar o próximo planejamento.</p></div>
                <Button variant="outline" onClick={() => handleTabChange("planejamento")}><CalendarDays className="h-4 w-4 mr-2"/>Criar próximo planejamento</Button>
              </CardContent>
            </Card>
            <details className="mt-4 rounded-xl border bg-background">
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium">
                Rastreamento e integrações
                <span className="ml-2 text-xs font-normal text-muted-foreground">Search Console e fontes de atribuição</span>
              </summary>
              <div className="border-t p-4">
                <SearchConsoleInsightsPanel tenantId={tenantId} />
              </div>
            </details>
          </TabsContent>

          <TabsContent value="rastreamento" className="-mx-4 md:-mx-6">
            <div className="p-4 md:p-6 max-w-[1600px] mx-auto">
              <VisitorIntelligence />
            </div>
          </TabsContent>
        </Tabs>

        {mediaPlanSource && plannerApproved && selectedPlannerCampaign && (
          <div className="mt-4 pb-3 flex items-center justify-end">
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => handleTabChange("planejamento")}>Ver calendário e aprovações <ExternalLink className="h-3.5 w-3.5 ml-1" /></Button>
          </div>
        )}
      </div>
    </div>
  );
}
