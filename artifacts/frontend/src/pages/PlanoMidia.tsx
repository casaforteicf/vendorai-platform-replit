import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  History,
  Loader2,
  RefreshCw,
  Sparkles,
  Target,
  BarChart3,
  ExternalLink,
  ImageIcon,
  MapPin,
  MessageSquare,
  Send,
} from "lucide-react";
import "./PlanoMidia.responsive.css";

type PlanningConfig = {
  objetivoPrincipal: string;
  produtoServicoPrioritario: string;
  publicoPrioritario: string;
  regiao: string;
  ofertaPrincipal: string;
  canaisPreferidos: string[];
  observacoes: string;
};

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
  materiaisPlanejados: number;
};

type MediaPlan = {
  id: string;
  conteudo: {
    diagnostico?: string;
    periodoDias?: number;
    statusPlanejamento?: "gerado" | "em_revisao" | "aprovado";
    campanhas?: PlannedCampaign[];
    orcamento?: { valor?: number; tipo?: string };
  };
  contextoUsado?: {
    configuracaoPlanejamento?: Partial<PlanningConfig> | null;
  } | null;
};

type CalendarItem = { id: string; mediaPlanId?: string | null };

type PlannerAdCreative = {
  id: string;
  headlines: string[];
  descriptions: string[];
  imagens: string[];
  status: "rascunho" | "aprovado";
};

type PlannerAdCampaign = {
  id: string;
  plataforma: string;
  tipoAnuncio: string;
  itemLabel: string | null;
  vertical: string;
  status: string;
  externalCampaignId: string | null;
  destinoClique: "landing_page" | "whatsapp" | "produto" | "formulario_lead";
  orcamentoDiario: string;
  latestCreative: PlannerAdCreative | null;
  segmentacao?: {
    localizacao?: { locais?: string[]; raioKm?: number | null };
    marketingContext?: { campaignId?: string; campaignName?: string };
    campaignControl?: { startDate?: string; endDate?: string };
  };
};

type PlannerAdsOverviewItem = {
  campaignId: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  sales: number;
  revenue: number;
  costPerLead: number | null;
  roas: number | null;
};

type PlannerAdEvent = {
  id: string;
  eventType: string;
  message: string;
  createdAt: string;
};

type QuickOption = { label: string; value: string };

const CHANNELS = [
  "Instagram",
  "Facebook",
  "Meta Ads",
  "Google Search",
  "Google Display",
  "Performance Max",
  "YouTube",
  "TikTok",
  "LinkedIn",
  "WhatsApp",
  "E-mail",
  "Blog/SEO",
  "Site",
  "Landing Page",
] as const;

const PERIODS = [7, 15, 30, 60, 90] as const;

const OBJECTIVE_OPTIONS: QuickOption[] = [
  { label: "Gerar leads", value: "Gerar leads qualificados" },
  { label: "Vender mais", value: "Aumentar vendas" },
  { label: "Lançar produto", value: "Lançar um novo produto ou serviço" },
  { label: "Recuperar clientes", value: "Reativar e recuperar clientes" },
  { label: "Fortalecer marca", value: "Fortalecer marca e aumentar reconhecimento" },
];

const AUDIENCE_OPTIONS: QuickOption[] = [
  { label: "Novos clientes", value: "Novos clientes" },
  { label: "Clientes atuais", value: "Clientes atuais" },
  { label: "Empresas", value: "Empresas" },
  { label: "Consumidor final", value: "Consumidor final" },
  { label: "Nicho específico", value: "Nicho específico" },
];

const REGION_OPTIONS: QuickOption[] = [
  { label: "Brasil", value: "Brasil" },
  { label: "Estado", value: "Atuar em um estado específico" },
  { label: "Cidade", value: "Atuar em uma cidade específica" },
  { label: "Nacional + prioridades", value: "Brasil com regiões prioritárias" },
];

const OFFER_OPTIONS: QuickOption[] = [
  { label: "Demonstração", value: "Agendar demonstração" },
  { label: "Orçamento", value: "Solicitar orçamento" },
  { label: "Diagnóstico", value: "Receber diagnóstico" },
  { label: "Desconto", value: "Aproveitar condição especial" },
  { label: "Agendamento", value: "Agendar atendimento" },
  { label: "Conteúdo", value: "Receber conteúdo ou material educativo" },
];

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` };
}

function emptyConfig(): PlanningConfig {
  return {
    objetivoPrincipal: "",
    produtoServicoPrioritario: "",
    publicoPrioritario: "",
    regiao: "",
    ofertaPrincipal: "",
    canaisPreferidos: [],
    observacoes: "",
  };
}

function normalizeConfig(source?: Partial<PlanningConfig> | null): PlanningConfig {
  return {
    objetivoPrincipal: source?.objetivoPrincipal ?? "",
    produtoServicoPrioritario: source?.produtoServicoPrioritario ?? "",
    publicoPrioritario: source?.publicoPrioritario ?? "",
    regiao: source?.regiao ?? "",
    ofertaPrincipal: source?.ofertaPrincipal ?? "",
    canaisPreferidos: Array.isArray(source?.canaisPreferidos) ? source!.canaisPreferidos! : [],
    observacoes: source?.observacoes ?? "",
  };
}

function QuickChoices({ options, onChoose }: { options: QuickOption[]; onChoose: (value: string) => void }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {options.map((option) => (
        <Button key={option.label} type="button" size="sm" variant="outline" className="h-7 px-2.5 text-[11px]" onClick={() => onChoose(option.value)}>
          {option.label}
        </Button>
      ))}
      <span className="self-center text-[10px] text-muted-foreground">ou escreva livremente</span>
    </div>
  );
}

export default function PlanoMidia() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const tenantId = user?.tenantId ?? "";

  const [config, setConfig] = useState<PlanningConfig>(() => emptyConfig());
  const [periodoDias, setPeriodoDias] = useState(30);
  const [orcamentoTotal, setOrcamentoTotal] = useState("");
  const [plan, setPlan] = useState<MediaPlan | null>(null);
  const [previousPlan, setPreviousPlan] = useState<MediaPlan | null>(null);
  const [showingPrevious, setShowingPrevious] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [approving, setApproving] = useState(false);
  const [creatingCampaigns, setCreatingCampaigns] = useState(false);
  const [campaignsGenerated, setCampaignsGenerated] = useState(false);
  const [adCampaigns, setAdCampaigns] = useState<PlannerAdCampaign[]>([]);
  const [adsOverview, setAdsOverview] = useState<PlannerAdsOverviewItem[]>([]);
  const [adEvents, setAdEvents] = useState<Record<string, PlannerAdEvent[]>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [sendingComment, setSendingComment] = useState<string | null>(null);
  const [adActionBusy, setAdActionBusy] = useState<string | null>(null);

  const campaigns = plan?.conteudo.campanhas ?? [];
  const approved = plan?.conteudo.statusPlanejamento === "aprovado";

  const configuredCount = useMemo(() => [
    config.objetivoPrincipal,
    config.produtoServicoPrioritario,
    config.publicoPrioritario,
    config.regiao,
    config.ofertaPrincipal,
    config.observacoes,
    config.canaisPreferidos.length > 0 ? "canais" : "",
  ].filter(Boolean).length, [config]);


  const adByPlannerCampaign = useMemo(() => {
    const map = new Map<string, PlannerAdCampaign[]>();
    for (const ad of adCampaigns) {
      const plannerCampaignId = ad.segmentacao?.marketingContext?.campaignId;
      if (!plannerCampaignId) continue;
      const list = map.get(plannerCampaignId) ?? [];
      list.push(ad);
      map.set(plannerCampaignId, list);
    }
    return map;
  }, [adCampaigns]);

  const overviewByAd = useMemo(
    () => new Map(adsOverview.map((item) => [item.campaignId, item])),
    [adsOverview],
  );

  async function refreshAdsWorkspace() {
    if (!tenantId) return;
    try {
      const [campaignResponse, overviewResponse] = await Promise.all([
        fetch(`/api/tenants/${tenantId}/ads/campaigns`, { headers: authHeaders() }),
        fetch(`/api/tenants/${tenantId}/ads/overview`, { headers: authHeaders() }),
      ]);
      if (!campaignResponse.ok) return;
      const campaignsData = await campaignResponse.json() as PlannerAdCampaign[];
      setAdCampaigns(campaignsData);
      if (overviewResponse.ok) {
        const overviewData = await overviewResponse.json() as { campaigns?: PlannerAdsOverviewItem[] };
        setAdsOverview(overviewData.campaigns ?? []);
      }

      const eventEntries = await Promise.all(campaignsData.map(async (ad) => {
        try {
          const response = await fetch(`/api/tenants/${tenantId}/ads/campaigns/${ad.id}/events`, { headers: authHeaders() });
          if (!response.ok) return [ad.id, []] as const;
          const events = await response.json() as PlannerAdEvent[];
          return [ad.id, events] as const;
        } catch {
          return [ad.id, []] as const;
        }
      }));
      setAdEvents(Object.fromEntries(eventEntries));
    } catch {
      // O planejador continua utilizável mesmo se Ads estiver temporariamente indisponível.
    }
  }

  async function runAdAction(ad: PlannerAdCampaign, action: "approve" | "publish" | "activate" | "pause") {
    if (adActionBusy) return;
    if (action === "activate" && !window.confirm("Ativar esta campanha agora? A plataforma poderá começar a consumir o orçamento configurado.")) return;

    setAdActionBusy(`${ad.id}:${action}`);
    try {
      let endpoint = "";
      if (action === "approve") {
        if (!ad.latestCreative?.id) throw new Error("Nenhum criativo disponível para aprovação.");
        endpoint = `/api/tenants/${tenantId}/ads/creatives/${ad.latestCreative.id}/aprovar`;
      } else {
        const suffix = action === "publish" ? "publicar" : action === "activate" ? "ativar" : "pausar";
        endpoint = `/api/tenants/${tenantId}/ads/campaigns/${ad.id}/${suffix}`;
      }

      const response = await fetch(endpoint, { method: "POST", headers: authHeaders() });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "A plataforma recusou a operação.");

      await refreshAdsWorkspace();
      toast({
        title: action === "approve" ? "Criativo aprovado" : action === "publish" ? "Campanha publicada pausada" : action === "activate" ? "Campanha ativada" : "Campanha pausada",
      });
    } catch (error) {
      toast({ title: "Não foi possível concluir", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally {
      setAdActionBusy(null);
    }
  }

  async function addInternalComment(adId: string) {
    const message = (commentDrafts[adId] ?? "").trim();
    if (message.length < 2 || sendingComment) return;
    setSendingComment(adId);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/ads/campaigns/${adId}/comments`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = await response.json() as PlannerAdEvent & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Não foi possível salvar o comentário.");
      setAdEvents((current) => ({ ...current, [adId]: [data, ...(current[adId] ?? [])] }));
      setCommentDrafts((current) => ({ ...current, [adId]: "" }));
      toast({ title: "Comentário registrado", description: "A observação ficou no histórico do anúncio." });
    } catch (error) {
      toast({ title: "Não foi possível comentar", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally {
      setSendingComment(null);
    }
  }


  useEffect(() => {
    if (!tenantId || !plan) return;
    void refreshAdsWorkspace();
  }, [tenantId, plan?.id, campaignsGenerated]);

  async function checkGeneratedCampaigns(planId: string) {
    try {
      const response = await fetch(`/api/tenants/${tenantId}/content-calendar`, { headers: authHeaders() });
      if (!response.ok) return;
      const items = (await response.json()) as CalendarItem[];
      setCampaignsGenerated(items.some((item) => item.mediaPlanId === planId));
    } catch {
      setCampaignsGenerated(false);
    }
  }

  async function loadPreviousPlan() {
    if (!tenantId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/media-plan`, { headers: authHeaders() });
      if (!response.ok) throw new Error("Não foi possível verificar o planejamento anterior.");
      const data = (await response.json()) as MediaPlan | null;
      setPreviousPlan(data);
      setPlan(null);
      setShowingPrevious(false);
      setCampaignsGenerated(false);
    } catch (error) {
      toast({ title: "Falha ao carregar planejamento", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPreviousPlan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  function usePreviousData() {
    if (!previousPlan) return;
    setConfig(normalizeConfig(previousPlan.contextoUsado?.configuracaoPlanejamento));
    if (previousPlan.conteudo.periodoDias) setPeriodoDias(Math.max(1, Math.round(previousPlan.conteudo.periodoDias)));
    if (typeof previousPlan.conteudo.orcamento?.valor === "number") setOrcamentoTotal(String(previousPlan.conteudo.orcamento.valor));
    setPlan(null);
    setShowingPrevious(false);
    toast({ title: "Dados anteriores carregados", description: "Edite o que quiser e gere uma nova proposta quando terminar." });
  }

  async function openPreviousPlan() {
    if (!previousPlan) return;
    setPlan(previousPlan);
    setShowingPrevious(true);
    await checkGeneratedCampaigns(previousPlan.id);
  }

  function toggleChannel(channel: string) {
    setConfig((current) => ({
      ...current,
      canaisPreferidos: current.canaisPreferidos.includes(channel)
        ? current.canaisPreferidos.filter((item) => item !== channel)
        : [...current.canaisPreferidos, channel],
    }));
  }

  function updateCampaignName(campaignId: string, name: string) {
    setPlan((current) => {
      if (!current) return current;
      return {
        ...current,
        conteudo: {
          ...current.conteudo,
          campanhas: (current.conteudo.campanhas ?? []).map((campaign) =>
            campaign.id === campaignId ? { ...campaign, nome: name } : campaign,
          ),
        },
      };
    });
  }

  async function generateProposal() {
    if (!tenantId) return;
    if (!config.objetivoPrincipal.trim() || !config.produtoServicoPrioritario.trim() || !config.publicoPrioritario.trim()) {
      toast({ title: "Complete as informações principais", description: "Informe pelo menos objetivo, produto/serviço e público antes de gerar a proposta.", variant: "destructive" });
      return;
    }
    setGenerating(true);
    try {
      const budget = Number(orcamentoTotal.replace(",", "."));
      const response = await fetch(`/api/tenants/${tenantId}/media-plan/gerar`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          periodoDias,
          configuracao: config,
          orcamento: Number.isFinite(budget) && budget > 0
            ? { valor: budget, tipo: "total", moeda: "BRL", gestao: "ia_autonoma", limiteRigido: true }
            : undefined,
        }),
      });
      const data = (await response.json()) as MediaPlan & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Falha ao gerar a proposta.");
      setPlan(data);
      setPreviousPlan(data);
      setShowingPrevious(false);
      setCampaignsGenerated(false);
      toast({ title: "Proposta de planejamento pronta", description: "A IA usou as informações que você acabou de preencher. Revise antes de aprovar." });
    } catch (error) {
      toast({ title: "Não foi possível gerar a proposta", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  }

  async function approvePlanning() {
    if (!plan) return;
    const unnamedCampaign = (plan.conteudo.campanhas ?? []).find((campaign) => !campaign.nome.trim());
    if (unnamedCampaign) {
      toast({ title: "Dê um nome para cada campanha", description: "Todas as campanhas precisam ter um nome antes da aprovação.", variant: "destructive" });
      return;
    }

    setApproving(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/media-plan/${plan.id}`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          patch: { campanhas: plan.conteudo.campanhas ?? [] },
          aprovar: true,
        }),
      });
      const data = (await response.json()) as MediaPlan & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Falha ao aprovar o planejamento.");
      setPlan(data);
      setPreviousPlan(data);
      toast({ title: "Planejamento aprovado", description: "Os nomes das campanhas foram salvos. A execução ainda não começou." });
    } catch (error) {
      toast({ title: "Não foi possível aprovar", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally {
      setApproving(false);
    }
  }

  async function generateCampaigns() {
    if (!plan || !approved) return;
    if (campaignsGenerated) {
      navigate(`/content?source=media-plan&tab=campanhas&mediaPlanId=${encodeURIComponent(plan.id)}`);
      return;
    }
    setCreatingCampaigns(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/content-calendar/gerar`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaPlanId: plan.id,
          semanas: Math.max(1, Math.ceil((plan.conteudo.periodoDias ?? periodoDias) / 7)),
          substituirPlanejado: false,
        }),
      });
      const data = await response.json() as Array<unknown> | { error?: string };
      if (!response.ok) throw new Error(!Array.isArray(data) ? data.error ?? "Falha ao gerar as campanhas." : "Falha ao gerar as campanhas.");
      setCampaignsGenerated(true);
      toast({ title: "Campanhas geradas", description: "Agora escolha qual campanha deseja abrir e executar." });
      navigate(`/content?source=media-plan&tab=campanhas&mediaPlanId=${encodeURIComponent(plan.id)}`);
    } catch (error) {
      toast({ title: "Não foi possível gerar as campanhas", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally {
      setCreatingCampaigns(false);
    }
  }

  if (loading) {
    return <div className="flex min-h-[240px] items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando…</div>;
  }

  return (
    <div className="space-y-5">
      <Card className="border-primary/30 bg-primary/[0.02]">
        <CardContent className="p-4 md:p-5">
          <p className="text-sm font-semibold">Planejamento = decisão, não execução</p>
          <p className="mt-1 text-xs text-muted-foreground">Preencha primeiro. A IA só cria uma proposta quando você mandar gerar.</p>
          <div className="mt-4 grid gap-2 md:grid-cols-4">
            {[
              ["1", "Informações", "Você define objetivo, público, oferta e limites"],
              ["2", "Proposta da IA", "Só aparece depois de clicar em gerar"],
              ["3", "Aprovação", "Você revisa, nomeia e aprova as campanhas"],
              ["4", "Gerar Campanhas", "Só aqui começa a execução"],
            ].map(([n, title, description]) => (
              <div key={n} className="rounded-xl border bg-background p-3">
                <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{n}</div>
                <p className="text-sm font-semibold">{title}</p>
                <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{description}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {previousPlan && !plan && (
        <Card className="border-dashed">
          <CardContent className="py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium flex items-center gap-2"><History className="h-4 w-4" />Existe um planejamento anterior</p>
              <p className="text-xs text-muted-foreground">Ele não é mostrado automaticamente para não misturar com o que você está preenchendo agora.</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={usePreviousData}>Usar dados anteriores</Button>
              <Button size="sm" variant="ghost" onClick={openPreviousPlan}>Ver anterior</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-base flex items-center gap-2"><Target className="h-4 w-4 text-primary" />1. Informações do planejamento</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">Use uma opção rápida ou escreva do seu jeito. Estes dados serão usados na próxima proposta.</p>
            </div>
            <Badge variant="outline">{configuredCount}/7 informações</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs font-medium">Objetivo *</label>
              <Input className="mt-1" value={config.objetivoPrincipal} onChange={(e) => setConfig({ ...config, objetivoPrincipal: e.target.value })} placeholder="Ex.: gerar oportunidades qualificadas" />
              <QuickChoices options={OBJECTIVE_OPTIONS} onChoose={(value) => setConfig({ ...config, objetivoPrincipal: value })} />
            </div>
            <div>
              <label className="text-xs font-medium">Produto ou serviço *</label>
              <Input className="mt-1" value={config.produtoServicoPrioritario} onChange={(e) => setConfig({ ...config, produtoServicoPrioritario: e.target.value })} placeholder="Ex.: VendorAI para clínicas odontológicas" />
              <p className="mt-2 text-[10px] text-muted-foreground">Digite o produto/serviço específico desta ação.</p>
            </div>
            <div>
              <label className="text-xs font-medium">Público *</label>
              <Input className="mt-1" value={config.publicoPrioritario} onChange={(e) => setConfig({ ...config, publicoPrioritario: e.target.value })} placeholder="Ex.: clínicas odontológicas privadas" />
              <QuickChoices options={AUDIENCE_OPTIONS} onChoose={(value) => setConfig({ ...config, publicoPrioritario: value })} />
            </div>
            <div>
              <label className="text-xs font-medium">Região</label>
              <Input className="mt-1" value={config.regiao} onChange={(e) => setConfig({ ...config, regiao: e.target.value })} placeholder="Ex.: Brasil, Santa Catarina ou Chapecó" />
              <QuickChoices options={REGION_OPTIONS} onChoose={(value) => setConfig({ ...config, regiao: value })} />
            </div>
            <div>
              <label className="text-xs font-medium">Oferta / CTA</label>
              <Input className="mt-1" value={config.ofertaPrincipal} onChange={(e) => setConfig({ ...config, ofertaPrincipal: e.target.value })} placeholder="Ex.: diagnóstico + demonstração" />
              <QuickChoices options={OFFER_OPTIONS} onChoose={(value) => setConfig({ ...config, ofertaPrincipal: value })} />
            </div>
            <div>
              <label className="text-xs font-medium">Orçamento total</label>
              <Input className="mt-1" value={orcamentoTotal} onChange={(e) => setOrcamentoTotal(e.target.value)} placeholder="Opcional" inputMode="decimal" />
              <p className="mt-2 text-[10px] text-muted-foreground">Pode ficar em branco para planejar sem verba definida.</p>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium">Período</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {PERIODS.map((days) => <Button key={days} type="button" size="sm" variant={periodoDias === days ? "default" : "outline"} onClick={() => setPeriodoDias(days)}>{days} dias</Button>)}
              <Input className="h-9 w-28" type="number" min={1} max={3650} value={periodoDias} onChange={(e) => setPeriodoDias(Math.max(1, Number(e.target.value) || 1))} />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium">Canais que deseja considerar</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {CHANNELS.map((channel) => <Button key={channel} type="button" size="sm" variant={config.canaisPreferidos.includes(channel) ? "default" : "outline"} onClick={() => toggleChannel(channel)}>{channel}</Button>)}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium">Observações para a IA</label>
            <textarea
              className="mt-1 min-h-[90px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={config.observacoes}
              onChange={(e) => setConfig({ ...config, observacoes: e.target.value })}
              placeholder="Restrições, diferenciais, prioridades ou qualquer orientação importante."
            />
          </div>

          <div className="flex justify-end border-t pt-4">
            <Button onClick={generateProposal} disabled={generating}>
              {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Gerar proposta com IA
            </Button>
          </div>
        </CardContent>
      </Card>

      {plan && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4 text-primary" />2. Proposta da IA</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">{showingPrevious ? "Você está vendo o planejamento anterior." : "Proposta criada a partir das informações preenchidas acima."}</p>
              </div>
              <Badge className={approved ? "bg-emerald-600" : ""}>{approved ? "Planejamento aprovado" : "Aguardando aprovação"}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {plan.conteudo.diagnostico && (
              <div className="rounded-xl border bg-muted/20 p-4">
                <p className="text-xs font-semibold">Direção recomendada</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground whitespace-pre-line">{plan.conteudo.diagnostico}</p>
              </div>
            )}

            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">Campanhas propostas</p>
                  {!approved && !showingPrevious && <p className="mt-0.5 text-[11px] text-muted-foreground">A IA sugere os nomes. Edite agora para identificar facilmente cada campanha durante a execução.</p>}
                </div>
                <Badge variant="outline">{campaigns.length} sugestões</Badge>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {campaigns.map((campaign) => (
                  <div key={campaign.id} className="rounded-xl border bg-background p-4">
                    {!approved && !showingPrevious ? (
                      <div>
                        <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Nome da campanha *</label>
                        <Input
                          className="mt-1 font-semibold"
                          value={campaign.nome}
                          maxLength={120}
                          onChange={(event) => updateCampaignName(campaign.id, event.target.value)}
                          placeholder="Ex.: Odonto Brasil — Aquisição"
                        />
                      </div>
                    ) : (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Nome da campanha</p>
                        <p className="mt-1 font-semibold">{campaign.nome}</p>
                      </div>
                    )}
                    <p className="mt-2 text-xs text-muted-foreground">{campaign.objetivo}</p>
                    <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                      <div><span className="text-muted-foreground">Público: </span>{campaign.publico}</div>
                      <div><span className="text-muted-foreground">Oferta: </span>{campaign.oferta}</div>
                      <div><span className="text-muted-foreground">KPI: </span>{campaign.kpiPrincipal}</div>
                      <div><span className="text-muted-foreground">Materiais previstos: </span>{campaign.materiaisPlanejados}</div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">{campaign.canais.map((channel) => <Badge key={channel.canal} variant="outline" className="text-[10px]">{channel.canal}</Badge>)}</div>

                    {(() => {
                      const linkedAds = adByPlannerCampaign.get(campaign.id) ?? [];
                      if (linkedAds.length === 0) {
                        return campaignsGenerated ? (
                          <div className="mt-4 rounded-lg border border-dashed bg-muted/10 p-3 text-xs text-muted-foreground">
                            A campanha já foi enviada para execução, mas ainda não há anúncio pago vinculado. Quando um anúncio for criado, o preview e os resultados aparecerão aqui automaticamente.
                          </div>
                        ) : null;
                      }

                      return (
                        <div className="mt-4 space-y-3 border-t pt-4">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold flex items-center gap-1.5"><BarChart3 className="h-3.5 w-3.5 text-primary" />Central do anúncio</p>
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => navigate("/ads")}>
                              Abrir Ads <ExternalLink className="ml-1 h-3 w-3" />
                            </Button>
                          </div>
                          {linkedAds.map((ad) => {
                            const creative = ad.latestCreative;
                            const metric = overviewByAd.get(ad.id);
                            const comments = (adEvents[ad.id] ?? []).filter((event) => event.eventType === "internal_comment");
                            const imageUrl = creative?.imagens?.[0];
                            const title = creative?.headlines?.[0] || ad.itemLabel || campaign.nome;
                            const primaryText = creative?.headlines?.[1] || creative?.descriptions?.[0] || campaign.mensagemCentral;
                            const locations = ad.segmentacao?.localizacao?.locais ?? [];
                            const destinationLabel = {
                              whatsapp: "WhatsApp",
                              landing_page: "Landing Page",
                              produto: "Produto / estoque",
                              formulario_lead: "Formulário",
                            }[ad.destinoClique] ?? ad.destinoClique;

                            return (
                              <div key={ad.id} className="rounded-xl border bg-muted/[0.12] p-3">
                                <div className="grid gap-3 md:grid-cols-[160px_1fr]">
                                  <div className="overflow-hidden rounded-lg border bg-background">
                                    {imageUrl ? (
                                      <img src={imageUrl} alt={title} className="aspect-square h-full w-full object-cover" />
                                    ) : (
                                      <div className="flex aspect-square items-center justify-center text-muted-foreground"><ImageIcon className="h-8 w-8" /></div>
                                    )}
                                  </div>
                                  <div className="min-w-0 space-y-2">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <Badge variant="outline">{ad.plataforma === "meta" ? "Meta" : "Google"}</Badge>
                                      <Badge variant="outline">{ad.tipoAnuncio}</Badge>
                                      <Badge className={ad.status === "ativo" ? "bg-emerald-600" : ad.status === "pausado" ? "bg-amber-600" : ""}>{ad.status}</Badge>
                                      <Badge variant={creative?.status === "aprovado" ? "default" : "secondary"}>{creative?.status === "aprovado" ? "Criativo aprovado" : "Criativo em revisão"}</Badge>
                                    </div>
                                    <div>
                                      <p className="text-sm font-semibold">{title}</p>
                                      <p className="mt-1 line-clamp-3 text-xs leading-5 text-muted-foreground">{primaryText}</p>
                                    </div>
                                    <div className="grid gap-1.5 text-[11px] sm:grid-cols-2">
                                      <div><span className="font-medium">Destino:</span> {destinationLabel}</div>
                                      <div><span className="font-medium">Orçamento:</span> R$ {Number(ad.orcamentoDiario || 0).toFixed(2)}/dia</div>
                                      <div className="flex items-start gap-1"><MapPin className="mt-0.5 h-3 w-3 shrink-0" /><span>{locations.length ? locations.join(", ") : "Localização não definida"}</span></div>
                                      <div><span className="font-medium">Período:</span> {ad.segmentacao?.campaignControl?.startDate ?? "—"} → {ad.segmentacao?.campaignControl?.endDate ?? "—"}</div>
                                    </div>
                                    <div className="flex flex-wrap gap-2 pt-1">
                                      {creative && creative.status !== "aprovado" && (
                                        <Button size="sm" variant="outline" className="h-8 text-xs" disabled={!!adActionBusy} onClick={() => void runAdAction(ad, "approve")}>
                                          {adActionBusy === `${ad.id}:approve` ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
                                          Aprovar criativo
                                        </Button>
                                      )}
                                      {creative?.status === "aprovado" && !ad.externalCampaignId && (
                                        <Button size="sm" variant="outline" className="h-8 text-xs" disabled={!!adActionBusy} onClick={() => void runAdAction(ad, "publish")}>
                                          {adActionBusy === `${ad.id}:publish` ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                                          Publicar pausado
                                        </Button>
                                      )}
                                      {ad.externalCampaignId && ad.status === "pausado" && (
                                        <Button size="sm" className="h-8 text-xs" disabled={!!adActionBusy} onClick={() => void runAdAction(ad, "activate")}>
                                          {adActionBusy === `${ad.id}:activate` ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                                          Ativar campanha
                                        </Button>
                                      )}
                                      {ad.externalCampaignId && ad.status === "ativo" && (
                                        <Button size="sm" variant="outline" className="h-8 text-xs" disabled={!!adActionBusy} onClick={() => void runAdAction(ad, "pause")}>
                                          {adActionBusy === `${ad.id}:pause` ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                                          Pausar campanha
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
                                  {[
                                    ["Gasto", `R$ ${(metric?.spend ?? 0).toFixed(2)}`],
                                    ["Impressões", String(metric?.impressions ?? 0)],
                                    ["Cliques", String(metric?.clicks ?? 0)],
                                    ["Leads", String(metric?.leads ?? 0)],
                                    ["Vendas", String(metric?.sales ?? 0)],
                                    ["Receita", `R$ ${(metric?.revenue ?? 0).toFixed(2)}`],
                                  ].map(([label, value]) => (
                                    <div key={label} className="rounded-lg border bg-background p-2 text-center">
                                      <p className="text-[10px] text-muted-foreground">{label}</p>
                                      <p className="mt-0.5 text-xs font-semibold">{value}</p>
                                    </div>
                                  ))}
                                </div>

                                <div className="mt-3 rounded-lg border bg-background p-3">
                                  <div className="flex items-center gap-1.5 text-xs font-semibold"><MessageSquare className="h-3.5 w-3.5" />Comentários internos</div>
                                  <div className="mt-2 flex gap-2">
                                    <Input
                                      value={commentDrafts[ad.id] ?? ""}
                                      onChange={(event) => setCommentDrafts((current) => ({ ...current, [ad.id]: event.target.value }))}
                                      placeholder="Ex.: trocar imagem, destacar garantia, revisar preço..."
                                      onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void addInternalComment(ad.id); } }}
                                    />
                                    <Button size="icon" onClick={() => void addInternalComment(ad.id)} disabled={sendingComment === ad.id || (commentDrafts[ad.id] ?? "").trim().length < 2}>
                                      {sendingComment === ad.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                    </Button>
                                  </div>
                                  {comments.length > 0 ? (
                                    <div className="mt-2 space-y-1.5">
                                      {comments.slice(0, 3).map((comment) => (
                                        <div key={comment.id} className="rounded-md bg-muted/40 px-2.5 py-2 text-[11px]">
                                          <p>{comment.message}</p>
                                          <p className="mt-1 text-[10px] text-muted-foreground">{new Date(comment.createdAt).toLocaleString("pt-BR")}</p>
                                        </div>
                                      ))}
                                    </div>
                                  ) : <p className="mt-2 text-[10px] text-muted-foreground">Nenhum comentário ainda.</p>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                ))}
              </div>
            </div>

            {!showingPrevious && (
              <div className="rounded-xl border border-dashed p-4">
                <p className="text-sm font-semibold flex items-center gap-2"><ClipboardCheck className="h-4 w-4 text-primary" />3. Aprovação</p>
                <p className="mt-1 text-xs text-muted-foreground">Revise os nomes e a direção. Aprovar salva as campanhas, mas ainda não cria peças, anúncios, mensagens ou publicações.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {!approved ? (
                    <Button onClick={approvePlanning} disabled={approving || campaigns.length === 0}>
                      {approving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}Aprovar planejamento
                    </Button>
                  ) : <Badge className="bg-emerald-600"><CheckCircle2 className="mr-1 h-3.5 w-3.5" />Direção aprovada</Badge>}
                  <Button variant="outline" onClick={generateProposal} disabled={generating}><RefreshCw className="mr-2 h-4 w-4" />Gerar novamente com os campos atuais</Button>
                </div>
              </div>
            )}

            {showingPrevious ? (
              <div className="flex justify-end"><Button variant="outline" onClick={() => { setPlan(null); setShowingPrevious(false); }}>Voltar ao preenchimento</Button></div>
            ) : (
              <div className="rounded-xl border border-primary/30 bg-primary/[0.03] p-4">
                <p className="text-sm font-semibold">4. Gerar Campanhas</p>
                <p className="mt-1 text-xs text-muted-foreground">Somente depois deste botão começam calendário, produção, anúncios, LPs, mensagens e demais ações de execução.</p>
                <div className="mt-3">
                  <Button onClick={generateCampaigns} disabled={!approved || creatingCampaigns}>
                    {creatingCampaigns ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
                    {campaignsGenerated ? "Abrir Campanhas" : "Gerar Campanhas e iniciar execução"}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}