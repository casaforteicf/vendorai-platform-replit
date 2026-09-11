import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  MessageCircle,
  Megaphone,
  ArrowLeft,
  ArrowRight,
  Layers3,
  Store,
  BrainCircuit,
  ShieldCheck,
  Sparkles,
  Radar,
  Eye,
  Loader2,
  RefreshCw,
  CalendarDays,
  Images,
  Globe2,
  CheckCircle2,
  Clock3,
  CircleDashed,
} from "lucide-react";
import MarketingVerticals from "@/pages/MarketingVerticals";
import PracaVariedades from "@/pages/supermercado/SupermercadoCampanhas";
import VisitorIntelligence from "@/pages/VisitorIntelligence";
import { LaunchCommandCenter } from "@/components/marketing/LaunchCommandCenter";
import { AssistedMarketingManager } from "@/components/marketing/AssistedMarketingManager";
import ColdProspectingCampaignPlanner from "@/components/marketing/ColdProspectingCampaignPlanner";
import ColdProspectingPilotValidation from "@/components/marketing/ColdProspectingPilotValidation";

type CampaignChannel = {
  canal: string;
  funcao: string;
  etapaFunil: string;
  formatos: string[];
  frequencia: string;
  quantidadeMateriais: number;
  kpiPrincipal: string;
};

type PlannedCampaign = {
  id: string;
  nome: string;
  objetivo: string;
  produtoServico: string;
  publico: string;
  regiao?: string;
  oferta: string;
  mensagemCentral: string;
  canais: CampaignChannel[];
  kpiPrincipal: string;
  metaPrincipal: string;
};

type MediaPlan = {
  id: string;
  conteudo: {
    periodoDias?: number;
    statusPlanejamento?: "gerado" | "em_revisao" | "aprovado";
    campanhas?: PlannedCampaign[];
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
};

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` };
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function campaignNameFromPilar(pilar: string) {
  return pilar.split(" · ")[0]?.trim() || "Campanha";
}

function statusLabel(status: string) {
  if (status === "publicado") return "Publicado";
  if (status === "gerado") return "Em produção";
  if (status === "aprovado") return "Pronto para produzir";
  if (status === "recusado") return "Recusado";
  if (status === "pulado") return "Ignorado";
  return "Planejado";
}

function statusIcon(status: string) {
  if (status === "publicado") return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />;
  if (status === "gerado") return <Loader2 className="h-3.5 w-3.5 text-primary" />;
  if (status === "aprovado") return <Clock3 className="h-3.5 w-3.5 text-amber-600" />;
  return <CircleDashed className="h-3.5 w-3.5 text-muted-foreground" />;
}

function CampaignExecutionWorkspace({ mediaPlanId, campaignId }: { mediaPlanId: string; campaignId: string }) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const tenantId = user?.tenantId ?? "";
  const [plan, setPlan] = useState<MediaPlan | null>(null);
  const [calendar, setCalendar] = useState<CalendarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const [planResponse, calendarResponse] = await Promise.all([
        fetch(`/api/tenants/${tenantId}/media-plan`, { headers: authHeaders() }),
        fetch(`/api/tenants/${tenantId}/content-calendar`, { headers: authHeaders() }),
      ]);
      if (!planResponse.ok) throw new Error("Não foi possível carregar o planejamento aprovado.");
      if (!calendarResponse.ok) throw new Error("Não foi possível carregar a execução das campanhas.");
      const nextPlan = await planResponse.json() as MediaPlan | null;
      const nextCalendar = await calendarResponse.json() as CalendarItem[];
      if (!nextPlan) throw new Error("Planejamento não encontrado.");
      if (mediaPlanId && nextPlan.id !== mediaPlanId) {
        throw new Error("Este planejamento não é mais o planejamento atual. Volte ao Planejamento para abrir a versão vigente.");
      }
      setPlan(nextPlan);
      setCalendar(nextCalendar.filter((item) => item.mediaPlanId === nextPlan.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar campanhas.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, mediaPlanId]);

  const campaigns = plan?.conteudo.campanhas ?? [];
  const selectedCampaign = useMemo(() => {
    if (!campaigns.length) return null;
    return campaigns.find((campaign) => campaign.id === campaignId) ?? campaigns[0] ?? null;
  }, [campaignId, campaigns]);

  const selectedItems = useMemo(() => {
    if (!selectedCampaign) return [];
    return calendar
      .filter((item) => normalize(campaignNameFromPilar(item.pilar)) === normalize(selectedCampaign.nome))
      .sort((a, b) => new Date(a.dataAgendada).getTime() - new Date(b.dataAgendada).getTime());
  }, [calendar, selectedCampaign]);

  const summary = useMemo(() => ({
    total: selectedItems.length,
    ready: selectedItems.filter((item) => item.status === "aprovado" || item.status === "planejado").length,
    production: selectedItems.filter((item) => item.status === "gerado").length,
    published: selectedItems.filter((item) => item.status === "publicado").length,
  }), [selectedItems]);

  const normalizedChannels = selectedCampaign?.canais.map((channel) => normalize(channel.canal)) ?? [];
  const hasChannel = (terms: string[]) => normalizedChannels.some((channel) => terms.some((term) => channel.includes(term)));
  const hasContent = hasChannel(["instagram", "facebook", "linkedin", "tiktok", "youtube", "blog"]);
  const hasAds = hasChannel(["meta ads", "facebook ads", "google search", "google display", "performance max", "pmax"]);
  const hasOwned = hasChannel(["landing", "site", "seo", "blog"]);
  const hasMessaging = hasChannel(["whatsapp", "email", "e-mail", "sms"]);

  function executionUrl(tab: string, extra: Record<string, string> = {}) {
    const params = new URLSearchParams({
      source: "media-plan",
      tab,
      mediaPlanId: plan?.id ?? mediaPlanId,
      ...(selectedCampaign?.id ? { campaignId: selectedCampaign.id } : {}),
      ...extra,
    });
    return `/content?${params.toString()}`;
  }

  function selectCampaign(nextId: string) {
    setLocation(executionUrl("campanhas", { campaignId: nextId }));
  }

  if (loading) {
    return <div className="flex min-h-[260px] items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando execução…</div>;
  }

  if (error || !plan || !selectedCampaign) {
    return (
      <Card className="border-amber-300 bg-amber-50/50">
        <CardContent className="py-6">
          <p className="font-medium text-amber-900">Não foi possível abrir esta execução.</p>
          <p className="mt-1 text-sm text-amber-800">{error ?? "Nenhuma campanha foi gerada para este planejamento."}</p>
          <Button className="mt-4" variant="outline" onClick={() => setLocation("/content?tab=planejamento")}>Voltar ao Planejamento</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className="bg-emerald-600">Execução iniciada</Badge>
            <span className="text-xs text-muted-foreground">Planejamento aprovado · {plan.conteudo.periodoDias ?? 30} dias</span>
          </div>
          <h2 className="mt-2 text-xl font-semibold">Campanhas</h2>
          <p className="mt-1 text-sm text-muted-foreground">Tudo que foi aprovado no Planejamento é executado e acompanhado aqui.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => void load()}><RefreshCw className="mr-1 h-3.5 w-3.5" />Atualizar</Button>
          <Button size="sm" variant="ghost" onClick={() => setLocation("/content?tab=planejamento")}><ArrowLeft className="mr-1 h-3.5 w-3.5" />Planejamento</Button>
        </div>
      </div>

      {campaigns.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {campaigns.map((campaign) => (
            <Button key={campaign.id} size="sm" variant={campaign.id === selectedCampaign.id ? "default" : "outline"} className="shrink-0" onClick={() => selectCampaign(campaign.id)}>
              {campaign.nome}
            </Button>
          ))}
        </div>
      )}

      <Card className="border-primary/25">
        <CardContent className="p-4 md:p-5 space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="text-lg font-semibold">{selectedCampaign.nome}</p>
              <p className="mt-1 text-sm text-muted-foreground">{selectedCampaign.objetivo}</p>
            </div>
            <Badge variant="outline">{selectedCampaign.kpiPrincipal}</Badge>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border p-3"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Público</p><p className="mt-1 text-sm font-medium">{selectedCampaign.publico}</p>{selectedCampaign.regiao && <p className="mt-0.5 text-xs text-muted-foreground">{selectedCampaign.regiao}</p>}</div>
            <div className="rounded-lg border p-3"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Produto / oferta</p><p className="mt-1 text-sm font-medium">{selectedCampaign.produtoServico}</p><p className="mt-0.5 text-xs text-muted-foreground">{selectedCampaign.oferta}</p></div>
            <div className="rounded-lg border p-3"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Mensagem</p><p className="mt-1 text-sm font-medium">{selectedCampaign.mensagemCentral}</p></div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Canais desta campanha</p>
            <div className="flex flex-wrap gap-1.5">{selectedCampaign.canais.map((channel) => <Badge key={channel.canal} variant="outline">{channel.canal}</Badge>)}</div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardContent className="py-4"><p className="text-xs text-muted-foreground">Ações</p><p className="mt-1 text-2xl font-semibold">{summary.total}</p><p className="text-xs text-muted-foreground">geradas para esta campanha</p></CardContent></Card>
        <Card><CardContent className="py-4"><p className="text-xs text-muted-foreground">Prontas</p><p className="mt-1 text-2xl font-semibold">{summary.ready}</p><p className="text-xs text-muted-foreground">aguardando execução</p></CardContent></Card>
        <Card><CardContent className="py-4"><p className="text-xs text-muted-foreground">Em produção</p><p className="mt-1 text-2xl font-semibold">{summary.production}</p><p className="text-xs text-muted-foreground">sendo produzidas</p></CardContent></Card>
        <Card><CardContent className="py-4"><p className="text-xs text-muted-foreground">Publicadas</p><p className="mt-1 text-2xl font-semibold">{summary.published}</p><p className="text-xs text-muted-foreground">já concluídas</p></CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-4 md:p-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="font-semibold">Executar campanha</p>
              <p className="mt-1 text-xs text-muted-foreground">Abra somente a ferramenta necessária. O contexto desta campanha é mantido automaticamente.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {hasContent && <Button size="sm" onClick={() => setLocation(executionUrl("conteudos"))}><Images className="mr-1 h-3.5 w-3.5" />Conteúdos & Criativos</Button>}
              {hasAds && <Button size="sm" variant="outline" onClick={() => setLocation(`/ads?from=media-plan&mediaPlanId=${encodeURIComponent(plan.id)}&campaignId=${encodeURIComponent(selectedCampaign.id)}`)}><Megaphone className="mr-1 h-3.5 w-3.5" />Anúncios</Button>}
              {hasOwned && <Button size="sm" variant="outline" onClick={() => setLocation(executionUrl("campanhas", { view: "lp" }))}><Globe2 className="mr-1 h-3.5 w-3.5" />Sites & LPs</Button>}
              {hasMessaging && <Button size="sm" variant="outline" onClick={() => setLocation(executionUrl("campanhas", { view: "organicas" }))}><MessageCircle className="mr-1 h-3.5 w-3.5" />WhatsApp / E-mail</Button>}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 md:p-5">
          <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="font-semibold flex items-center gap-2"><CalendarDays className="h-4 w-4 text-primary" />Ações da campanha</p>
              <p className="mt-1 text-xs text-muted-foreground">Aqui está o calendário operacional que antes aparecia no Planejamento.</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setLocation(executionUrl("conteudos"))}>Abrir produção completa <ArrowRight className="ml-1 h-3.5 w-3.5" /></Button>
          </div>

          {selectedItems.length === 0 ? (
            <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">Nenhuma ação operacional encontrada para esta campanha.</div>
          ) : (
            <div className="divide-y rounded-lg border">
              {selectedItems.slice(0, 12).map((item) => (
                <div key={item.id} className="flex items-center gap-3 p-3">
                  <div className="shrink-0">{statusIcon(item.status)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap"><span className="text-xs font-medium uppercase text-primary">{item.canal}</span><span className="text-[11px] text-muted-foreground">{item.tipo}</span></div>
                    <p className="mt-0.5 truncate text-sm font-medium">{item.temaSugerido}</p>
                  </div>
                  <div className="shrink-0 text-right"><p className="text-xs font-medium">{statusLabel(item.status)}</p><p className="text-[10px] text-muted-foreground">{new Date(item.dataAgendada).toLocaleDateString("pt-BR")}</p></div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Visão geral das campanhas dentro do hub canônico de Marketing.
// As URLs antigas continuam disponíveis por compatibilidade, mas todos os
// fluxos novos retornam para /content?tab=campanhas para evitar telas paralelas.
export default function CampanhasHub() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const view = params.get("view");
  const source = params.get("source") ?? params.get("from");
  const mediaPlanId = params.get("mediaPlanId")?.trim() ?? "";
  const campaignId = params.get("campaignId")?.trim() ?? "";
  const showMarkets = view === "mercados";
  const showProspecting = view === "prospeccao";
  const showVisitors = view === "visitantes";
  const showPraca = view === "praca" || params.get("tab") === "variedades";
  const showPlannedExecution = source === "media-plan" && Boolean(mediaPlanId) && !view;

  if (showMarkets) {
    return (
      <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setLocation("/content?tab=campanhas")}><ArrowLeft className="h-4 w-4" /> Voltar para Campanhas</Button>
        <MarketingVerticals />
      </div>
    );
  }

  if (showProspecting) {
    return (
      <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setLocation("/content?tab=campanhas")}><ArrowLeft className="h-4 w-4" /> Voltar para Campanhas</Button>
        <ColdProspectingCampaignPlanner />
        <ColdProspectingPilotValidation />
      </div>
    );
  }

  if (showVisitors) {
    return (
      <div className="p-4 md:p-6 space-y-4 max-w-[1600px] mx-auto">
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setLocation("/content?tab=campanhas")}><ArrowLeft className="h-4 w-4" /> Voltar para Campanhas</Button>
        <VisitorIntelligence />
      </div>
    );
  }

  if (showPraca) {
    return (
      <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setLocation("/content?tab=campanhas")}><ArrowLeft className="h-4 w-4" /> Voltar para Campanhas</Button>
        <PracaVariedades />
      </div>
    );
  }

  if (showPlannedExecution) {
    return (
      <div className="p-4 md:p-6 max-w-7xl mx-auto">
        <CampaignExecutionWorkspace mediaPlanId={mediaPlanId} campaignId={campaignId} />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-2"><Megaphone className="h-6 w-6 text-primary" /><h1 className="text-xl font-semibold">Campanhas</h1></div>
      <p className="text-sm text-muted-foreground max-w-3xl">Crie ou acompanhe campanhas. Quando uma campanha nasce do Planejamento, toda a execução fica concentrada aqui.</p>

      <Card className="overflow-hidden border-primary/30 bg-gradient-to-r from-primary/[0.08] via-background to-background shadow-sm">
        <CardContent className="p-4 md:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="mt-0.5 rounded-xl border border-primary/25 bg-primary/10 p-2.5 text-primary"><BrainCircuit className="h-5 w-5" /></div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold">Agente de Marketing</h2><span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"><Sparkles className="h-3 w-3" /> Contextual</span><span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium text-muted-foreground"><ShieldCheck className="h-3 w-3" /> Autonomia controlada</span></div>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">Acompanha objetivo, público, produto, canal e regras do tenant durante a execução.</p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setLocation("/content?tab=campanhas&view=visitantes")}><Eye className="mr-1 h-3.5 w-3.5" /> Visitantes</Button><Button size="sm" variant="outline" onClick={() => setLocation("/content?tab=planejamento")}>Novo planejamento</Button><Button size="sm" onClick={() => setLocation("/content?tab=campanhas&view=prospeccao")}>Prospecção <ArrowRight className="ml-1 h-3.5 w-3.5" /></Button></div>
          </div>
        </CardContent>
      </Card>

      <LaunchCommandCenter />
      <AssistedMarketingManager />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card role="button" tabIndex={0} onClick={() => setLocation("/content?tab=campanhas&view=prospeccao")} className="cursor-pointer border-primary/30 bg-primary/[0.03] transition-colors hover:border-primary/60 hover:bg-primary/[0.06]"><CardContent className="pt-6 space-y-3 h-full flex flex-col"><div className="flex items-center gap-2"><Radar className="h-5 w-5 text-primary" /><h2 className="font-semibold">Prospecção inteligente</h2></div><p className="text-sm text-muted-foreground">Encontre empresas por nicho e região e transforme sinais públicos em abordagem personalizada.</p><Button className="w-full mt-auto">Abrir prospecção <ArrowRight className="h-4 w-4 ml-1" /></Button></CardContent></Card>
        <Card role="button" tabIndex={0} onClick={() => setLocation("/content?tab=campanhas&view=organicas")} className="cursor-pointer transition-colors hover:border-primary/50 hover:bg-muted/30"><CardContent className="pt-6 space-y-3 h-full flex flex-col"><div className="flex items-center gap-2"><MessageCircle className="h-5 w-5 text-primary" /><h2 className="font-semibold">Campanha orgânica</h2></div><p className="text-sm text-muted-foreground">WhatsApp, e-mail ou Instagram para uma ação avulsa.</p><Button variant="secondary" className="w-full mt-auto">Criar orgânica <ArrowRight className="h-4 w-4 ml-1" /></Button></CardContent></Card>
        <Card role="button" tabIndex={0} onClick={() => setLocation("/ads")} className="cursor-pointer transition-colors hover:border-primary/50 hover:bg-muted/30"><CardContent className="pt-6 space-y-3 h-full flex flex-col"><div className="flex items-center gap-2"><Megaphone className="h-5 w-5 text-primary" /><h2 className="font-semibold">Anúncio avulso</h2></div><p className="text-sm text-muted-foreground">Crie Meta ou Google Ads sem precisar iniciar um planejamento completo.</p><Button variant="secondary" className="w-full mt-auto">Criar anúncio <ArrowRight className="h-4 w-4 ml-1" /></Button></CardContent></Card>
        <Card role="button" tabIndex={0} onClick={() => setLocation("/content?tab=campanhas&view=praca")} className="cursor-pointer transition-colors hover:border-primary/50 hover:bg-muted/30"><CardContent className="pt-6 space-y-3 h-full flex flex-col"><div className="flex items-center gap-2"><Store className="h-5 w-5 text-primary" /><h2 className="font-semibold">Praça.ai</h2></div><p className="text-sm text-muted-foreground">Conteúdo e ofertas do Praça.ai.</p><Button variant="secondary" className="w-full mt-auto">Gerenciar Praça.ai <ArrowRight className="h-4 w-4 ml-1" /></Button></CardContent></Card>
        <Card role="button" tabIndex={0} onClick={() => setLocation("/content?tab=campanhas&view=mercados")} className="cursor-pointer border-primary/20 bg-primary/[0.02] transition-colors hover:border-primary/50 hover:bg-primary/[0.05]"><CardContent className="pt-6 space-y-3 h-full flex flex-col"><div className="flex items-center gap-2"><Layers3 className="h-5 w-5 text-primary" /><h2 className="font-semibold">Mercados & LPs</h2></div><p className="text-sm text-muted-foreground">Arquitetura comercial por segmento e vertical.</p><Button className="w-full mt-auto">Abrir mercados <ArrowRight className="h-4 w-4 ml-1" /></Button></CardContent></Card>
      </div>
    </div>
  );
}
