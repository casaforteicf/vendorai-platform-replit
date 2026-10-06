import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MediaAssetPicker, mediaAssetUrl, type MediaPickerAsset } from "@/components/media/MediaAssetPicker";
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
  ChevronDown,
  ChevronUp,
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
  coverUrl?: string;
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
  const [showDetails, setShowDetails] = useState(false);
  const [showBriefing, setShowBriefing] = useState(false);
  const [coverPickerOpen, setCoverPickerOpen] = useState(false);
  const [savingCover, setSavingCover] = useState(false);

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
      if (mediaPlanId && nextPlan.id !== mediaPlanId) throw new Error("Este planejamento não é mais o planejamento atual. Volte ao Planejamento para abrir a versão vigente.");
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
    if (campaignId) return campaigns.find((campaign) => campaign.id === campaignId) ?? null;
    return campaigns[0] ?? null;
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

  const channelSummary = useMemo(() => {
    const grouped = new Map<string, { canal: string; total: number; ready: number; production: number; published: number }>();
    selectedItems.forEach((item) => {
      const key = normalize(item.canal || "Outros");
      const current = grouped.get(key) ?? { canal: item.canal || "Outros", total: 0, ready: 0, production: 0, published: 0 };
      current.total += 1;
      if (item.status === "planejado" || item.status === "aprovado") current.ready += 1;
      if (item.status === "gerado") current.production += 1;
      if (item.status === "publicado") current.published += 1;
      grouped.set(key, current);
    });
    return Array.from(grouped.values()).sort((a, b) => b.total - a.total);
  }, [selectedItems]);

  async function saveCampaignCover(asset: MediaPickerAsset | null) {
    if (!plan || !selectedCampaign || !tenantId) return;
    setSavingCover(true);
    try {
      const campaigns = (plan.conteudo.campanhas ?? []).map((campaign) =>
        campaign.id === selectedCampaign.id
          ? { ...campaign, coverUrl: asset?.storageUrl || undefined }
          : campaign,
      );
      const response = await fetch(`/api/tenants/${tenantId}/media-plan/${plan.id}`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ patch: { campanhas } }),
      });
      const body = await response.json().catch(() => ({})) as MediaPlan & { error?: string };
      if (!response.ok) throw new Error(body.error || "Não foi possível salvar a capa.");
      setPlan(body);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Não foi possível salvar a capa.");
    } finally {
      setSavingCover(false);
    }
  }

  const campaignStatus = useMemo(() => {
    if (summary.total === 0) return "Rascunho";
    if (summary.published === summary.total) return "Finalizada";
    if (summary.published > 0 || summary.production > 0) return "Ativa";
    if (summary.ready > 0) return "Preparando";
    return "Rascunho";
  }, [summary]);

  const nextStep = useMemo(() => {
    if (summary.total === 0) return { title: "Organizar a campanha", description: "Ainda não há ações preparadas para esta campanha.", action: "Abrir Conteúdos & Criativos" };
    if (summary.ready > 0) return { title: `Preparar ${summary.ready} ${summary.ready === 1 ? "ação" : "ações"}`, description: "O planejamento está pronto. Prepare os materiais para seguir.", action: "Preparar materiais" };
    if (summary.production > 0) return { title: "Acompanhar produção", description: `${summary.production} ${summary.production === 1 ? "ação está" : "ações estão"} em produção.`, action: "Acompanhar produção" };
    return { title: "Acompanhar resultados", description: "As ações desta campanha já foram publicadas ou concluídas.", action: "Ver resultados" };
  }, [summary]);

  const normalizedChannels = selectedCampaign?.canais.map((channel) => normalize(channel.canal)) ?? [];
  const hasChannel = (terms: string[]) => normalizedChannels.some((channel) => terms.some((term) => channel.includes(term)));
  const hasContent = hasChannel(["instagram", "facebook", "linkedin", "tiktok", "youtube", "blog"]);
  const hasAds = hasChannel(["meta ads", "facebook ads", "google search", "google display", "performance max", "pmax"]);
  const hasOwned = hasChannel(["landing", "site", "seo", "blog"]);
  const hasMessaging = hasChannel(["whatsapp", "email", "e-mail", "sms"]);

  function executionUrl(tab: string, extra: Record<string, string> = {}) {
    const params = new URLSearchParams({ source: "media-plan", tab, mediaPlanId: plan?.id ?? mediaPlanId, ...(selectedCampaign?.id ? { campaignId: selectedCampaign.id } : {}), ...extra });
    return `/content?${params.toString()}`;
  }

  function handlePrimaryAction() {
    if (summary.ready > 0 || summary.production > 0 || summary.total === 0) {
      setLocation(executionUrl("conteudos"));
      return;
    }
    setLocation("/content?tab=resultados");
  }

  if (loading) return <div className="flex min-h-[220px] items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando campanha…</div>;

  if (error || !plan || !selectedCampaign) {
    return (
      <Card className="border-amber-300 bg-amber-50/50">
        <CardContent className="py-6">
          <p className="font-medium text-amber-900">Não foi possível abrir esta campanha.</p>
          <p className="mt-1 text-sm text-amber-800">{error ?? "Nenhuma campanha foi gerada para este planejamento."}</p>
          <Button className="mt-4" variant="outline" onClick={() => setLocation("/content?tab=campanhas")}><ArrowLeft className="mr-1 h-4 w-4" />Campanhas</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div data-vendorai-campaign-workspace-v2="true" className="space-y-3 md:space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button size="sm" variant="ghost" onClick={() => setLocation(`/content?source=media-plan&tab=campanhas&mediaPlanId=${encodeURIComponent(plan.id)}&view=lista`)}><ArrowLeft className="mr-1 h-3.5 w-3.5" />Campanhas</Button>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" onClick={() => void load()}><RefreshCw className="mr-1 h-3.5 w-3.5" /><span className="hidden sm:inline">Atualizar</span></Button>
          <Button size="sm" variant="ghost" onClick={() => setLocation("/content?tab=planejamento")}>Planejamento</Button>
        </div>
      </div>

      <Card className="border-primary/20">
        <CardContent className="p-4 md:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="w-full overflow-hidden rounded-xl border bg-muted/30 lg:w-56">
              {selectedCampaign.coverUrl ? (
                <img src={mediaAssetUrl(selectedCampaign.coverUrl)} alt="" className="h-32 w-full object-cover lg:h-36" />
              ) : (
                <div className="flex h-24 items-center justify-center gap-2 text-xs text-muted-foreground lg:h-36">
                  <Megaphone className="h-4 w-4" />
                  Capa da campanha
                </div>
              )}
              <div className="flex gap-1 border-t p-2">
                <Button type="button" size="sm" variant="ghost" className="h-7 flex-1 text-xs" disabled={savingCover} onClick={() => setCoverPickerOpen(true)}>
                  {savingCover ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Images className="mr-1 h-3 w-3" />}
                  {selectedCampaign.coverUrl ? "Trocar capa" : "Adicionar capa"}
                </Button>
                {selectedCampaign.coverUrl && (
                  <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={savingCover} onClick={() => void saveCampaignCover(null)}>
                    Remover
                  </Button>
                )}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{campaignStatus}</Badge><span className="text-xs text-muted-foreground">{plan.conteudo.periodoDias ?? 30} dias</span><Badge variant="secondary" className="max-w-full truncate">KPI: {selectedCampaign.kpiPrincipal}</Badge></div>
              <h2 className="mt-2 break-words text-xl font-semibold leading-tight md:text-2xl">{selectedCampaign.nome}</h2>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">{selectedCampaign.objetivo}</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setLocation(executionUrl("conteudos"))}><Images className="mr-1 h-3.5 w-3.5" />Conteúdos</Button>
            <Button size="sm" variant="outline" onClick={() => setLocation("/content?tab=resultados")}><Radar className="mr-1 h-3.5 w-3.5" />Resultados</Button>
          </div>

          <button type="button" onClick={() => setShowBriefing((current) => !current)} className="mt-3 inline-flex min-h-9 items-center rounded-md border px-3 text-xs font-medium text-muted-foreground hover:bg-muted/40">
            {showBriefing ? <ChevronUp className="mr-1 h-3.5 w-3.5" /> : <ChevronDown className="mr-1 h-3.5 w-3.5" />}{showBriefing ? "Ocultar briefing" : "Ver briefing da campanha"}
          </button>

          {showBriefing && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg bg-muted/35 p-2.5"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Público</p><p className="mt-1 text-xs font-medium">{selectedCampaign.publico}</p>{selectedCampaign.regiao && <p className="mt-0.5 text-[11px] text-muted-foreground">{selectedCampaign.regiao}</p>}</div>
              <div className="rounded-lg bg-muted/35 p-2.5"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Produto</p><p className="mt-1 text-xs font-medium">{selectedCampaign.produtoServico}</p></div>
              <div className="rounded-lg bg-muted/35 p-2.5"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Oferta</p><p className="mt-1 text-xs font-medium">{selectedCampaign.oferta}</p></div>
              <div className="rounded-lg bg-muted/35 p-2.5"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Mensagem</p><p className="mt-1 line-clamp-3 text-xs font-medium">{selectedCampaign.mensagemCentral}</p></div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-primary/25 bg-primary/[0.03]">
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">Próximo passo</p><p className="mt-1 text-base font-semibold">{nextStep.title}</p><p className="mt-0.5 text-xs text-muted-foreground">{nextStep.description}</p></div>
            <Button size="sm" onClick={handlePrimaryAction}>{nextStep.action}<ArrowRight className="ml-2 h-3.5 w-3.5" /></Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Card><CardContent className="p-3 text-center"><p className="text-[10px] text-muted-foreground">Total</p><p className="mt-1 text-xl font-semibold">{summary.total}</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><p className="text-[10px] text-muted-foreground">A preparar</p><p className="mt-1 text-xl font-semibold">{summary.ready}</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><p className="text-[10px] text-muted-foreground">Em produção</p><p className="mt-1 text-xl font-semibold">{summary.production}</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><p className="text-[10px] text-muted-foreground">Publicadas</p><p className="mt-1 text-xl font-semibold">{summary.published}</p></CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-4 md:p-5">
          <div className="mb-3"><p className="font-semibold">Canais da campanha</p><p className="mt-0.5 text-xs text-muted-foreground">{summary.total} ações agrupadas por canal.</p></div>
          {channelSummary.length === 0 ? <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">Nenhuma ação foi gerada ainda.</div> : (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {channelSummary.map((channel) => {
                const progress = channel.total > 0 ? Math.round((channel.published / channel.total) * 100) : 0;
                return (
                  <div key={channel.canal} className="rounded-xl border p-3">
                    <div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{channel.canal}</p><p className="text-[11px] text-muted-foreground">{channel.total} {channel.total === 1 ? "ação" : "ações"}</p></div><Badge variant="outline">{progress}%</Badge></div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div>
                    <div className="mt-2 grid grid-cols-3 gap-1 text-center text-[10px] text-muted-foreground"><span>{channel.ready}<br/>preparar</span><span>{channel.production}<br/>produção</span><span>{channel.published}<br/>concluídas</span></div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 md:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div><p className="font-semibold">Ferramentas da campanha</p><p className="mt-0.5 text-xs text-muted-foreground">Abra só o que precisa agora.</p></div>
            <div className="flex flex-wrap gap-2">
              {hasContent && <Button size="sm" onClick={() => setLocation(executionUrl("conteudos"))}><Images className="mr-1 h-3.5 w-3.5" />Conteúdos</Button>}
              {hasAds && <Button size="sm" variant="outline" onClick={() => setLocation(`/ads?from=media-plan&mediaPlanId=${encodeURIComponent(plan.id)}&campaignId=${encodeURIComponent(selectedCampaign.id)}`)}><Megaphone className="mr-1 h-3.5 w-3.5" />Anúncios</Button>}
              {hasOwned && <Button size="sm" variant="outline" onClick={() => setLocation(executionUrl("campanhas", { view: "lp" }))}><Globe2 className="mr-1 h-3.5 w-3.5" />Sites & LPs</Button>}
              {hasMessaging && <Button size="sm" variant="outline" onClick={() => setLocation(executionUrl("campanhas", { view: "organicas" }))}><MessageCircle className="mr-1 h-3.5 w-3.5" />Mensagens</Button>}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><p className="flex items-center gap-2 font-semibold"><CalendarDays className="h-4 w-4 text-primary" />Detalhes das ações</p><p className="mt-0.5 text-xs text-muted-foreground">Abra somente se precisar revisar itens individualmente.</p></div>
            <Button size="sm" variant="outline" onClick={() => setShowDetails((current) => !current)}>{showDetails ? <ChevronUp className="mr-1 h-3.5 w-3.5" /> : <ChevronDown className="mr-1 h-3.5 w-3.5" />}{showDetails ? "Ocultar" : `Ver ${summary.total}`}</Button>
          </div>

          {showDetails && (
            <div className="mt-4">
              {selectedItems.length === 0 ? <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">Nenhuma ação operacional encontrada para esta campanha.</div> : (
                <>
                  <div className="divide-y rounded-lg border">
                    {selectedItems.slice(0, 20).map((item) => (
                      <div key={item.id} className="flex items-center gap-3 p-3">
                        <div className="shrink-0">{statusIcon(item.status)}</div>
                        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-medium uppercase text-primary">{item.canal}</span><span className="text-[11px] text-muted-foreground">{item.tipo}</span></div><p className="mt-0.5 truncate text-sm font-medium">{item.temaSugerido}</p></div>
                        <div className="shrink-0 text-right"><p className="text-xs font-medium">{statusLabel(item.status)}</p><p className="text-[10px] text-muted-foreground">{new Date(item.dataAgendada).toLocaleDateString("pt-BR")}</p></div>
                      </div>
                    ))}
                  </div>
                  {selectedItems.length > 20 && <p className="mt-2 text-xs text-muted-foreground">Mostrando 20 de {selectedItems.length} ações.</p>}
                  <Button className="mt-3" size="sm" variant="outline" onClick={() => setLocation(executionUrl("conteudos"))}>Abrir produção completa <ArrowRight className="ml-1 h-3.5 w-3.5" /></Button>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      <MediaAssetPicker
        tenantId={tenantId}
        open={coverPickerOpen}
        onOpenChange={setCoverPickerOpen}
        allowedTypes={["image"]}
        maxSelection={1}
        title="Escolher capa da campanha"
        confirmLabel="Usar como capa"
        onConfirm={(assets) => void saveCampaignCover(assets[0] ?? null)}
      />
    </div>
  );
}

export default function CampanhasHub() {
  const [, setLocation] = useLocation();
  const [showTools, setShowTools] = useState(false);
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

  if (showMarkets) return <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto"><Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setLocation("/content?tab=campanhas")}><ArrowLeft className="h-4 w-4" /> Voltar para Campanhas</Button><MarketingVerticals /></div>;
  if (showProspecting) return <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto"><Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setLocation("/content?tab=campanhas")}><ArrowLeft className="h-4 w-4" /> Voltar para Campanhas</Button><ColdProspectingCampaignPlanner /><ColdProspectingPilotValidation /></div>;
  if (showVisitors) return <div className="p-4 md:p-6 space-y-4 max-w-[1600px] mx-auto"><Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setLocation("/content?tab=campanhas")}><ArrowLeft className="h-4 w-4" /> Voltar para Campanhas</Button><VisitorIntelligence /></div>;
  if (showPraca) return <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto"><Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setLocation("/content?tab=campanhas")}><ArrowLeft className="h-4 w-4" /> Voltar para Campanhas</Button><PracaVariedades /></div>;
  if (showPlannedExecution) return <div className="p-3 md:p-5 max-w-7xl mx-auto"><CampaignExecutionWorkspace mediaPlanId={mediaPlanId} campaignId={campaignId} /></div>;

  return (
    <div className="p-3 md:p-5 space-y-4 max-w-7xl mx-auto">
      <div><div className="flex items-center gap-2"><Megaphone className="h-5 w-5 text-primary" /><h1 className="text-xl font-semibold">Campanhas</h1></div><p className="mt-1 text-sm text-muted-foreground max-w-3xl">Crie, acompanhe e execute campanhas sem misturar planejamento, produção e resultado.</p></div>

      <Card className="overflow-hidden border-primary/25 bg-primary/[0.03]">
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="rounded-xl border border-primary/20 bg-primary/10 p-2 text-primary"><BrainCircuit className="h-4 w-4" /></div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-semibold">Vendi no Marketing</h2>
                  <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"><Sparkles className="h-3 w-3" />Contextual</span>
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">Mantém objetivo, público, produto e regras da campanha durante a execução.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setLocation("/content?tab=planejamento")}>Novo planejamento</Button>
              <Button size="sm" onClick={() => setShowTools((current) => !current)}>
                {showTools ? "Ocultar ferramentas" : "Outras ferramentas"}
                {showTools ? <ChevronUp className="ml-1 h-3.5 w-3.5" /> : <ChevronDown className="ml-1 h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {showTools && (
        <div className="space-y-3 rounded-xl border bg-muted/10 p-3">
          <div>
            <p className="text-sm font-semibold">Outras ferramentas de Marketing</p>
            <p className="mt-1 text-xs text-muted-foreground">Recursos complementares. Use quando precisar sair do fluxo principal de campanhas.</p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Card role="button" tabIndex={0} onClick={() => setLocation("/content?tab=campanhas&view=prospeccao")} className="cursor-pointer transition hover:border-primary/50"><CardContent className="flex h-full flex-col p-4"><div className="flex items-center gap-2"><Radar className="h-4 w-4 text-primary" /><h2 className="text-sm font-semibold">Prospecção</h2></div><p className="mt-2 text-xs leading-5 text-muted-foreground">Encontrar empresas por nicho e região.</p><Button size="sm" variant="secondary" className="mt-3 w-full">Abrir</Button></CardContent></Card>
            <Card role="button" tabIndex={0} onClick={() => setLocation("/content?tab=campanhas&view=organicas")} className="cursor-pointer transition hover:border-primary/50"><CardContent className="flex h-full flex-col p-4"><div className="flex items-center gap-2"><MessageCircle className="h-4 w-4 text-primary" /><h2 className="text-sm font-semibold">Campanha orgânica</h2></div><p className="mt-2 text-xs leading-5 text-muted-foreground">WhatsApp, e-mail ou Instagram.</p><Button size="sm" variant="secondary" className="mt-3 w-full">Abrir</Button></CardContent></Card>
            <Card role="button" tabIndex={0} onClick={() => setLocation("/ads")} className="cursor-pointer transition hover:border-primary/50"><CardContent className="flex h-full flex-col p-4"><div className="flex items-center gap-2"><Megaphone className="h-4 w-4 text-primary" /><h2 className="text-sm font-semibold">Anúncios</h2></div><p className="mt-2 text-xs leading-5 text-muted-foreground">Meta ou Google Ads fora de um plano.</p><Button size="sm" variant="secondary" className="mt-3 w-full">Abrir</Button></CardContent></Card>
            <Card role="button" tabIndex={0} onClick={() => setLocation("/content?tab=campanhas&view=visitantes")} className="cursor-pointer transition hover:border-primary/50"><CardContent className="flex h-full flex-col p-4"><div className="flex items-center gap-2"><Eye className="h-4 w-4 text-primary" /><h2 className="text-sm font-semibold">Visitantes</h2></div><p className="mt-2 text-xs leading-5 text-muted-foreground">Inteligência de visitantes e intenção.</p><Button size="sm" variant="secondary" className="mt-3 w-full">Abrir</Button></CardContent></Card>
            <Card role="button" tabIndex={0} onClick={() => setLocation("/content?tab=campanhas&view=mercados")} className="cursor-pointer transition hover:border-primary/50"><CardContent className="flex h-full flex-col p-4"><div className="flex items-center gap-2"><Layers3 className="h-4 w-4 text-primary" /><h2 className="text-sm font-semibold">Mercados & LPs</h2></div><p className="mt-2 text-xs leading-5 text-muted-foreground">Estratégias e páginas por segmento.</p><Button size="sm" variant="secondary" className="mt-3 w-full">Abrir</Button></CardContent></Card>
          </div>

          <details className="rounded-lg border bg-background">
            <summary className="cursor-pointer list-none px-3 py-2 text-xs font-medium">Ferramentas avançadas de operação</summary>
            <div className="border-t p-3 space-y-3">
              <LaunchCommandCenter />
              <AssistedMarketingManager />
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
