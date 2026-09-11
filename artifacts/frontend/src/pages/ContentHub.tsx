import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Content from "@/pages/Content";
import Campanhas from "@/pages/Campanhas";
import CampanhasHub from "@/pages/CampanhasHub";
import PlanoMidia from "@/pages/PlanoMidia";
import SiteGenerator from "@/pages/SiteGenerator";
import ContentProductionQueue from "@/components/marketing/ContentProductionQueue";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowLeft,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  Film,
  Globe2,
  Images,
  LayoutDashboard,
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

type MainMarketingTab = "visao-geral" | "planejamento" | "campanhas" | "conteudos" | "resultados";

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

function normalizeMainTab(tab: string): MainMarketingTab {
  if (tab === "gerador") return "conteudos";
  if (tab === "variedades") return "campanhas";
  if (tab === "planejamento" || tab === "campanhas" || tab === "conteudos" || tab === "resultados" || tab === "visao-geral") {
    return tab;
  }
  return "visao-geral";
}

function applyMarketingRedundancyFilter(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>("h1").forEach((heading) => {
    const label = heading.textContent?.replace(/\s+/g, " ").trim() ?? "";
    if (REDUNDANT_CHILD_TITLES.has(label) && !heading.hidden) heading.hidden = true;
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
  const activeTab = normalizeMainTab(requestedTab);
  const requestedMediaPlanId = params.get("mediaPlanId")?.trim() ?? "";
  const requestedPlannerCampaignId = params.get("campaignId")?.trim() ?? "";
  const legacyPracaView = requestedTab === "variedades";
  const campaignView = legacyPracaView ? "praca" : params.get("view") ?? "overview";

  const [plannerPlan, setPlannerPlan] = useState<PlannerPlan | null>(null);
  const [plannerLoading, setPlannerLoading] = useState(false);
  const [plannerError, setPlannerError] = useState<string | null>(null);

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
    const normalized = normalizeMainTab(nextTab);
    if (mediaPlanSource && normalized !== "visao-geral" && normalized !== "resultados") {
      setLocation(plannerUrl({ tab: normalized }));
      return;
    }
    setLocation(`/content?tab=${normalized}`);
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

  const steps = [
    { n: 1, title: "Planejamento", text: "Defina objetivo, público, oferta, canais, período e orçamento.", tab: "planejamento" as const },
    { n: 2, title: "Campanhas", text: "Execute prospecção, anúncios, LPs, mensagens e demais ações.", tab: "campanhas" as const },
    { n: 3, title: "Conteúdos & Criativos", text: "Produza as peças que alimentam as campanhas e canais.", tab: "conteudos" as const },
    { n: 4, title: "Resultados", text: "Acompanhe o que funcionou e use os dados para melhorar a próxima ação.", tab: "resultados" as const },
  ];

  return (
    <div ref={rootRef} className="min-w-0">
      <div className="px-4 pt-4 md:px-6 md:pt-6">
        <div className="mb-4">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" /> Marketing
          </h1>
          <p className="text-sm text-muted-foreground">Um fluxo simples: planejar, executar, criar e medir.</p>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="h-auto flex flex-wrap gap-1">
            <TabsTrigger value="visao-geral" className="gap-2"><LayoutDashboard className="h-4 w-4"/>Visão Geral</TabsTrigger>
            <TabsTrigger value="planejamento" className="gap-2"><CalendarDays className="h-4 w-4"/>1. Planejamento</TabsTrigger>
            <TabsTrigger value="campanhas" className="gap-2"><Megaphone className="h-4 w-4"/>2. Campanhas</TabsTrigger>
            <TabsTrigger value="conteudos" className="gap-2"><Images className="h-4 w-4"/>3. Conteúdos & Criativos</TabsTrigger>
            <TabsTrigger value="resultados" className="gap-2"><BarChart3 className="h-4 w-4"/>4. Resultados</TabsTrigger>
          </TabsList>

          <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
            <span className="text-xs font-medium text-muted-foreground mr-1">Ferramentas:</span>
            <Button size="sm" variant="outline" onClick={() => setLocation("/midias")}><Images className="h-3.5 w-3.5 mr-1.5"/>Mídias</Button>
            <Button size="sm" variant="outline" onClick={() => setLocation("/content-studio/video")}><Film className="h-3.5 w-3.5 mr-1.5"/>Vídeos com IA</Button>
            <Button size="sm" variant="outline" onClick={() => setLocation("/content?tab=campanhas&view=lp")}><Globe2 className="h-3.5 w-3.5 mr-1.5"/>Sites & LPs</Button>
            <Button size="sm" variant="outline" onClick={() => setLocation("/ads")}><Megaphone className="h-3.5 w-3.5 mr-1.5"/>Anúncios</Button>
          </div>

          <TabsContent value="visao-geral" className="mt-5">
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Fluxo do Marketing</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {steps.map((step) => (
                      <button
                        key={step.n}
                        type="button"
                        onClick={() => handleTabChange(step.tab)}
                        className="rounded-xl border bg-background p-4 text-left transition hover:border-primary/50 hover:bg-muted/30"
                      >
                        <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{step.n}</div>
                        <p className="font-semibold">{step.title}</p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">{step.text}</p>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="py-5">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-semibold">Tudo começa no Planejamento e termina em Resultados.</p>
                      <p className="text-sm text-muted-foreground">Mídias, Vídeos com IA, Sites & LPs e Anúncios continuam disponíveis como ferramentas independentes, sem quebrar o fluxo principal.</p>
                    </div>
                    <Button onClick={() => handleTabChange("planejamento")}><Target className="h-4 w-4 mr-2"/>Começar pelo Planejamento</Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="planejamento" className="-mx-4 md:-mx-6">
            <div className="p-4 md:p-6"><PlanoMidia /></div>
          </TabsContent>

          <TabsContent value="campanhas" className="-mx-4 md:-mx-6">
            {mediaPlanSource && (
              <div className="px-4 pt-4 md:px-6 md:pt-6">
                {plannerLoading ? (
                  <Card><CardContent className="py-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando a direção do Planejamento…</CardContent></Card>
                ) : plannerError ? (
                  <Card className="border-amber-300 bg-amber-50/50"><CardContent className="py-4 text-sm text-amber-800">{plannerError}</CardContent></Card>
                ) : selectedPlannerCampaign ? (
                  <Card className="border-primary/25 bg-primary/[0.03]">
                    <CardContent className="py-4 space-y-3">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge className={plannerApproved ? "bg-emerald-600" : ""}>{plannerApproved ? "Direção aprovada" : "Plano em revisão"}</Badge>
                            <span className="text-xs text-muted-foreground">Plano de {plannerPlan?.conteudo.periodoDias ?? 30} dias</span>
                          </div>
                          <p className="mt-2 font-semibold">{selectedPlannerCampaign.nome}</p>
                          <p className="mt-1 text-sm text-muted-foreground">{selectedPlannerCampaign.objetivo}</p>
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => handleTabChange("planejamento")}><ArrowLeft className="h-3.5 w-3.5 mr-1"/>Voltar ao planejamento</Button>
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

                      {plannerApproved && <div className="flex items-center gap-1.5 text-[11px] text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5"/>A direção estratégica fica preservada em todos os executores vinculados à campanha.</div>}
                    </CardContent>
                  </Card>
                ) : null}
              </div>
            )}

            {campaignView === "organicas" ? (
              <Campanhas />
            ) : campaignView === "lp" ? (
              <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
                <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setLocation("/content?tab=campanhas")}><ArrowLeft className="h-4 w-4"/>Voltar para Campanhas</Button>
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
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Card><CardContent className="py-5"><p className="text-xs text-muted-foreground">Campanhas</p><p className="mt-1 font-semibold">Compare o desempenho entre campanhas.</p><Button variant="link" className="px-0" onClick={() => handleTabChange("campanhas")}>Abrir campanhas</Button></CardContent></Card>
              <Card><CardContent className="py-5"><p className="text-xs text-muted-foreground">Conteúdos</p><p className="mt-1 font-semibold">Veja quais peças e criativos estão alimentando as ações.</p><Button variant="link" className="px-0" onClick={() => handleTabChange("conteudos")}>Abrir conteúdos</Button></CardContent></Card>
              <Card><CardContent className="py-5"><p className="text-xs text-muted-foreground">Anúncios</p><p className="mt-1 font-semibold">Acompanhe mídia paga e campanhas patrocinadas.</p><Button variant="link" className="px-0" onClick={() => setLocation("/ads")}>Abrir anúncios</Button></CardContent></Card>
              <Card><CardContent className="py-5"><p className="text-xs text-muted-foreground">Conversão</p><p className="mt-1 font-semibold">Use campanhas, LPs e CRM para acompanhar o caminho até a oportunidade.</p><Button variant="link" className="px-0" onClick={() => handleTabChange("campanhas")}>Ver funil</Button></CardContent></Card>
            </div>
            <Card className="mt-4">
              <CardContent className="py-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div><p className="font-semibold">Resultados é o fechamento do ciclo.</p><p className="text-sm text-muted-foreground">O que funcionar aqui deve alimentar o próximo Planejamento e melhorar as próximas Campanhas.</p></div>
                <Button variant="outline" onClick={() => handleTabChange("planejamento")}><CalendarDays className="h-4 w-4 mr-2"/>Voltar ao Planejamento</Button>
              </CardContent>
            </Card>
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
