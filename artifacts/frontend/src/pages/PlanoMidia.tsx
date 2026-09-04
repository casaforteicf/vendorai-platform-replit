import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Sparkles,
  Loader2,
  TrendingUp,
  Target,
  Lightbulb,
  ListChecks,
  BarChart3,
  Search,
  RefreshCw,
  CalendarDays,
  ExternalLink,
  CheckCircle2,
  Pencil,
  X,
  Check,
  Layers3,
  Radio,
  Clock3,
  MapPin,
  ArrowLeft,
  Send,
} from "lucide-react";

interface MediaPlanCanal {
  canal: string;
  prioridade: "alta" | "media" | "baixa";
  motivo: string;
  tiposCampanhaSugeridos: string[];
  percentualOrcamento: number;
}

interface CampaignChannel {
  canal: string;
  funcao: string;
  etapaFunil: string;
  formatos: string[];
  frequencia: string;
  quantidadeMateriais: number;
  kpiPrincipal: string;
  percentualOrcamento?: number;
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
  fase: string;
  inicioOffsetDias: number;
  duracaoDias: number;
  intensidadeGeografica: "baixa" | "media" | "alta";
  regraComunicacaoGeografica: string;
  canais: CampaignChannel[];
  kpiPrincipal: string;
  metaPrincipal: string;
  materiaisPlanejados: number;
  status: "planejada" | "em_revisao" | "aprovada" | "em_producao" | "ativa" | "encerrada";
}

interface MediaPlanConteudo {
  diagnostico: string;
  pontosFortesAtuais: string[];
  oportunidades: string[];
  canais: MediaPlanCanal[];
  pilaresConteudo: string[];
  acoesImediatas: string[];
  concorrentesEncontrados?: Array<{ dominio: string; titulo: string; url: string }>;
  keywordsRelevantes?: Array<{ termo: string; volumeBusca: number | null }>;
  periodoDias?: 30 | 60 | 90;
  campanhas?: MediaPlanCampaign[];
  totalAcoesPlanejadas?: number;
  statusPlanejamento?: "gerado" | "em_revisao" | "aprovado";
  aprovadoEm?: string | null;
  versaoPlanejamento?: number;
}

interface MediaPlan {
  id: string;
  conteudo: MediaPlanConteudo;
  createdAt: string;
}

interface CalendarItem {
  id: string;
  mediaPlanId?: string | null;
  dataAgendada: string;
  pilar: string;
  temaSugerido: string;
  tipo: string;
  canal: string;
  status: "planejado" | "gerado" | "publicado" | "pulado";
}

type PeriodoDias = 30 | 60 | 90;

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` };
}

function weeksForPeriod(periodoDias: PeriodoDias) {
  if (periodoDias === 30) return 4;
  if (periodoDias === 60) return 8;
  return 13;
}

function campaignNameFromPilar(pilar: string) {
  const [campaign] = pilar.split(" · ");
  return campaign || "Campanha do período";
}

function contentPillarFromPilar(pilar: string) {
  const parts = pilar.split(" · ");
  return parts.length > 1 ? parts.slice(1).join(" · ") : pilar;
}

const PRIORIDADE_STYLE: Record<string, string> = {
  alta: "border-primary/40 text-primary bg-primary/5",
  media: "border-amber-300 text-amber-700 bg-amber-50",
  baixa: "border-muted-foreground/30 text-muted-foreground",
};

const STATUS_LABEL: Record<string, string> = {
  gerado: "Planejado pela IA",
  em_revisao: "Em revisão",
  aprovado: "Aprovado",
};

export default function PlanoMidia() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const tenantId = user?.tenantId ?? "";

  const [plan, setPlan] = useState<MediaPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [gerando, setGerando] = useState(false);
  const [gerandoCalendario, setGerandoCalendario] = useState(false);
  const [aprovando, setAprovando] = useState(false);
  const [periodoDias, setPeriodoDias] = useState<PeriodoDias>(30);
  const [calendario, setCalendario] = useState<CalendarItem[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [savingTitleId, setSavingTitleId] = useState<string | null>(null);
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null);
  const [campaignDraft, setCampaignDraft] = useState<MediaPlanCampaign | null>(null);
  const [savingCampaign, setSavingCampaign] = useState(false);

  async function loadCalendar(planId: string) {
    const response = await fetch(`/api/tenants/${tenantId}/content-calendar`, { headers: authHeaders() });
    if (!response.ok) return [];
    const items = (await response.json()) as CalendarItem[];
    return items.filter((item) => item.mediaPlanId === planId);
  }

  async function carregar() {
    setLoading(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/media-plan`, { headers: authHeaders() });
      const data = (await response.json()) as MediaPlan | null;
      setPlan(data);
      if (data?.conteudo?.periodoDias) setPeriodoDias(data.conteudo.periodoDias);
      if (data?.id) setCalendario(await loadCalendar(data.id));
    } catch {
      // Estado vazio é tratado pela própria tela.
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (tenantId) void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  async function generateCalendarForPlan(createdPlan: MediaPlan) {
    const days = createdPlan.conteudo.periodoDias ?? periodoDias;
    setGerandoCalendario(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/content-calendar/gerar`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ mediaPlanId: createdPlan.id, semanas: weeksForPeriod(days) }),
      });
      const data = (await response.json()) as CalendarItem[] | { error?: string };
      if (!response.ok) throw new Error(!Array.isArray(data) ? data.error ?? "Falha ao gerar o calendário" : "Falha ao gerar o calendário");
      setCalendario(Array.isArray(data) ? data : []);
      return Array.isArray(data) ? data.length : 0;
    } finally {
      setGerandoCalendario(false);
    }
  }

  async function gerar() {
    setGerando(true);
    setSelectedCampaignId(null);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/media-plan/gerar`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ periodoDias }),
      });
      const data = (await response.json()) as MediaPlan & { error?: string };
      if (!response.ok) throw new Error(data?.error ?? "Falha ao gerar o plano");
      setPlan(data);
      const count = await generateCalendarForPlan(data);
      toast({
        title: `Plano de ${periodoDias} dias pronto`,
        description: `${data.conteudo.campanhas?.length ?? 0} campanhas e ${count} ações distribuídas no calendário para revisão.`,
      });
    } catch (err) {
      toast({
        title: "Não foi possível gerar o planejamento",
        description: String(err instanceof Error ? err.message : err),
        variant: "destructive",
      });
    } finally {
      setGerando(false);
    }
  }

  async function aprovarPlano() {
    if (!plan) return;
    setAprovando(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/media-plan/${plan.id}`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ aprovar: true }),
      });
      const data = (await response.json()) as MediaPlan & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Falha ao aprovar");
      setPlan(data);
      toast({ title: "Planejamento aprovado", description: "A direção estratégica está pronta para ser executada no Gerador de Conteúdo." });
    } catch (err) {
      toast({ title: "Não foi possível aprovar", description: String(err instanceof Error ? err.message : err), variant: "destructive" });
    } finally {
      setAprovando(false);
    }
  }

  async function saveTitle(item: CalendarItem) {
    const title = editingTitle.trim();
    if (!title || title === item.temaSugerido) {
      setEditingTitleId(null);
      return;
    }
    setSavingTitleId(item.id);
    try {
      const response = await fetch(`/api/content-calendar/${item.id}`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ temaSugerido: title }),
      });
      if (!response.ok) throw new Error("Falha ao salvar o título");
      setCalendario((current) => current.map((row) => (row.id === item.id ? { ...row, temaSugerido: title } : row)));
      setEditingTitleId(null);
      toast({ title: "Título atualizado" });
    } catch (err) {
      toast({ title: "Não foi possível salvar", description: String(err instanceof Error ? err.message : err), variant: "destructive" });
    } finally {
      setSavingTitleId(null);
    }
  }

  function startCampaignEdit(campaign: MediaPlanCampaign) {
    setEditingCampaignId(campaign.id);
    setCampaignDraft(structuredClone(campaign));
  }

  async function saveCampaign() {
    if (!plan || !campaignDraft) return;
    const campaigns = (plan.conteudo.campanhas ?? []).map((campaign) =>
      campaign.id === campaignDraft.id ? campaignDraft : campaign,
    );
    setSavingCampaign(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/media-plan/${plan.id}`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ patch: { campanhas: campaigns } }),
      });
      const data = (await response.json()) as MediaPlan & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Falha ao salvar campanha");
      setPlan(data);
      setEditingCampaignId(null);
      setCampaignDraft(null);
      toast({ title: "Campanha atualizada", description: "A alteração passa a fazer parte da direção estratégica do plano." });
    } catch (err) {
      toast({ title: "Não foi possível salvar a campanha", description: String(err instanceof Error ? err.message : err), variant: "destructive" });
    } finally {
      setSavingCampaign(false);
    }
  }

  const conteudo = plan?.conteudo;
  const campanhas = conteudo?.campanhas ?? [];
  const selectedCampaign = campanhas.find((campaign) => campaign.id === selectedCampaignId) ?? null;
  const uniqueChannels = useMemo(() => {
    const names = campanhas.flatMap((campaign) => campaign.canais.map((channel) => channel.canal));
    return Array.from(new Set(names));
  }, [campanhas]);
  const totalMaterials = campanhas.reduce((sum, campaign) => sum + (campaign.materiaisPlanejados ?? 0), 0);
  const statusPlanejamento = conteudo?.statusPlanejamento ?? "gerado";
  const approved = statusPlanejamento === "aprovado";

  if (selectedCampaign && conteudo) {
    const editMode = editingCampaignId === selectedCampaign.id && campaignDraft;
    const display = editMode ? campaignDraft : selectedCampaign;
    return (
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <Button type="button" size="icon" variant="ghost" className="mt-0.5" onClick={() => { setSelectedCampaignId(null); setEditingCampaignId(null); setCampaignDraft(null); }}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              {editMode ? (
                <Input className="text-lg font-semibold max-w-xl" value={display.nome} onChange={(event) => setCampaignDraft({ ...display, nome: event.target.value })} />
              ) : (
                <h1 className="vendor-page-title">{display.nome}</h1>
              )}
              <p className="mt-1 text-sm text-muted-foreground">
                Campanha do plano de {conteudo.periodoDias ?? periodoDias} dias · início no dia {display.inicioOffsetDias + 1} · duração {display.duracaoDias} dias
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {editMode ? (
              <>
                <Button type="button" variant="outline" onClick={() => { setEditingCampaignId(null); setCampaignDraft(null); }} disabled={savingCampaign}>
                  <X className="h-4 w-4 mr-1.5" /> Cancelar
                </Button>
                <Button type="button" onClick={saveCampaign} disabled={savingCampaign}>
                  {savingCampaign ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Check className="h-4 w-4 mr-1.5" />} Salvar
                </Button>
              </>
            ) : (
              <Button type="button" variant="outline" onClick={() => startCampaignEdit(selectedCampaign)}>
                <Pencil className="h-4 w-4 mr-1.5" /> Editar campanha
              </Button>
            )}
            <Button
              type="button"
              disabled={!approved}
              onClick={() => navigate(`/content?source=media-plan&mediaPlanId=${plan?.id}&campaignId=${selectedCampaign.id}`)}
            >
              <Send className="h-4 w-4 mr-1.5" /> Enviar para produção
            </Button>
          </div>
        </div>

        {!approved && (
          <Card className="border-amber-200 bg-amber-50/50">
            <CardContent className="py-3 text-sm text-amber-800">
              Esta campanha ainda faz parte de um plano em revisão. Aprove o planejamento antes de enviá-la ao Gerador de Conteúdo.
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <Card className="lg:col-span-2">
            <CardContent className="pt-5 space-y-4">
              <p className="text-sm font-semibold flex items-center gap-2"><Target className="h-4 w-4 text-primary" />Direção estratégica</p>
              <div className="grid sm:grid-cols-2 gap-4">
                {[
                  ["Objetivo", "objetivo"],
                  ["Produto/serviço", "produtoServico"],
                  ["Público", "publico"],
                  ["Oferta", "oferta"],
                ].map(([label, key]) => (
                  <div key={key}>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">{label}</p>
                    {editMode ? (
                      <Input value={String(display[key as keyof MediaPlanCampaign] ?? "")} onChange={(event) => setCampaignDraft({ ...display, [key]: event.target.value })} />
                    ) : (
                      <p className="text-sm">{String(display[key as keyof MediaPlanCampaign] ?? "—")}</p>
                    )}
                  </div>
                ))}
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Mensagem central</p>
                {editMode ? (
                  <textarea className="w-full min-h-20 rounded-md border bg-background px-3 py-2 text-sm" value={display.mensagemCentral} onChange={(event) => setCampaignDraft({ ...display, mensagemCentral: event.target.value })} />
                ) : (
                  <p className="text-sm leading-relaxed">{display.mensagemCentral}</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5 space-y-3">
              <p className="text-sm font-semibold flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" />Meta e KPI</p>
              <div><p className="text-xs text-muted-foreground">KPI principal</p><p className="text-sm font-medium">{display.kpiPrincipal}</p></div>
              <div><p className="text-xs text-muted-foreground">Meta</p><p className="text-sm">{display.metaPrincipal}</p></div>
              <div><p className="text-xs text-muted-foreground">Materiais previstos</p><p className="text-2xl font-semibold">{display.materiaisPlanejados}</p></div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-primary/20">
          <CardContent className="pt-5 space-y-2">
            <p className="text-sm font-semibold flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" />Regra de comunicação geográfica</p>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline">Intensidade {display.intensidadeGeografica}</Badge>
              {display.regiao && <Badge variant="outline">Segmentação: {display.regiao}</Badge>}
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">{display.regraComunicacaoGeografica}</p>
            <p className="text-xs text-muted-foreground">A região pode direcionar a mídia sem precisar aparecer no texto de todo material. O Gerador receberá essa regra junto com o briefing.</p>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <div className="flex items-center justify-between"><p className="text-sm font-semibold flex items-center gap-2"><Radio className="h-4 w-4 text-primary" />Canais da campanha</p><Badge variant="outline">{display.canais.length} canais</Badge></div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {display.canais.map((channel) => (
              <Card key={`${display.id}-${channel.canal}`}>
                <CardContent className="pt-4 space-y-2">
                  <div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold">{channel.canal}</p><Badge variant="outline" className="text-[10px]">{channel.etapaFunil}</Badge></div>
                  <p className="text-xs text-muted-foreground">{channel.funcao}</p>
                  <div className="flex flex-wrap gap-1">{channel.formatos.map((format) => <span key={format} className="text-[10px] rounded bg-muted px-1.5 py-0.5">{format}</span>)}</div>
                  <div className="pt-1 grid grid-cols-2 gap-2 text-xs"><div><span className="text-muted-foreground">Frequência</span><p>{channel.frequencia}</p></div><div><span className="text-muted-foreground">Materiais</span><p>{channel.quantidadeMateriais}</p></div></div>
                  <p className="text-xs"><span className="text-muted-foreground">KPI:</span> {channel.kpiPrincipal}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="vendor-page-title flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" />Plano de Mídia IA</h1>
          <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
            O Planejador define a direção estratégica do período. A IA cria campanhas, canais, frequência, calendário e KPIs; você só edita se quiser. A produção acontece depois no Gerador de Conteúdo.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-lg border p-1 bg-background">
            {([30, 60, 90] as PeriodoDias[]).map((days) => (
              <button key={days} type="button" onClick={() => setPeriodoDias(days)} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${periodoDias === days ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
                {days} dias
              </button>
            ))}
          </div>
          <Button type="button" onClick={gerar} disabled={gerando || gerandoCalendario}>
            {gerando || gerandoCalendario ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1.5" />}
            {plan ? "Replanejar com IA" : "Planejar com IA"}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : !conteudo ? (
        <Card>
          <CardContent className="py-14 text-center space-y-4">
            <Sparkles className="h-9 w-9 mx-auto text-primary" />
            <div><p className="font-medium">Escolha 30, 60 ou 90 dias</p><p className="text-sm text-muted-foreground max-w-lg mx-auto mt-1">A IA monta o período completo sozinha: campanhas agrupadas, canais, frequência, títulos, ações e KPIs. Depois você revisa e aprova.</p></div>
            <Button type="button" onClick={gerar} disabled={gerando}>{gerando ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1.5" />}Gerar planejamento</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={approved ? "bg-emerald-600" : ""}>{STATUS_LABEL[statusPlanejamento] ?? statusPlanejamento}</Badge>
              <span className="text-xs text-muted-foreground">Plano v{conteudo.versaoPlanejamento ?? 1} · {conteudo.periodoDias ?? periodoDias} dias · gerado em {new Date(plan!.createdAt).toLocaleDateString("pt-BR")}</span>
            </div>
            <div className="flex gap-2">
              {!approved ? (
                <Button type="button" onClick={aprovarPlano} disabled={aprovando}>
                  {aprovando ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}Aprovar planejamento
                </Button>
              ) : (
                <Button type="button" onClick={() => navigate(`/content?source=media-plan&mediaPlanId=${plan!.id}`)}>
                  <ExternalLink className="h-4 w-4 mr-1.5" />Abrir no Gerador de Conteúdo
                </Button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Card><CardContent className="py-4"><p className="text-xs text-muted-foreground">Período</p><p className="text-xl font-semibold">{conteudo.periodoDias ?? periodoDias} dias</p></CardContent></Card>
            <Card><CardContent className="py-4"><p className="text-xs text-muted-foreground">Campanhas</p><p className="text-xl font-semibold">{campanhas.length}</p></CardContent></Card>
            <Card><CardContent className="py-4"><p className="text-xs text-muted-foreground">Canais</p><p className="text-xl font-semibold">{uniqueChannels.length}</p></CardContent></Card>
            <Card><CardContent className="py-4"><p className="text-xs text-muted-foreground">Materiais previstos</p><p className="text-xl font-semibold">{totalMaterials}</p></CardContent></Card>
            <Card><CardContent className="py-4"><p className="text-xs text-muted-foreground">Ações no calendário</p><p className="text-xl font-semibold">{calendario.length}</p></CardContent></Card>
          </div>

          <Card>
            <CardContent className="pt-5 space-y-3">
              <p className="text-sm font-medium flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" />Direção do período</p>
              <p className="text-sm text-muted-foreground leading-relaxed">{conteudo.diagnostico}</p>
              <div className="flex flex-wrap gap-1.5">{conteudo.pontosFortesAtuais?.map((item, index) => <Badge key={index} variant="outline" className="text-xs">{item}</Badge>)}</div>
            </CardContent>
          </Card>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold flex items-center gap-2"><Layers3 className="h-4 w-4 text-primary" />Campanhas do período</p><p className="text-xs text-muted-foreground mt-0.5">Cada campanha agrupa todos os canais necessários. Clique para abrir a direção completa.</p></div><Badge variant="outline">{campanhas.length} campanhas</Badge></div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {campanhas.map((campaign) => (
                <button key={campaign.id} type="button" className="text-left" onClick={() => setSelectedCampaignId(campaign.id)}>
                  <Card className="h-full hover:border-primary/40 hover:shadow-sm transition-all">
                    <CardContent className="pt-4 space-y-3">
                      <div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{campaign.nome}</p><p className="text-xs text-muted-foreground mt-0.5">{campaign.objetivo}</p></div><Badge variant="outline" className="shrink-0 text-[10px]">{campaign.fase}</Badge></div>
                      <p className="text-sm text-muted-foreground line-clamp-2">{campaign.mensagemCentral}</p>
                      <div className="flex flex-wrap gap-1">{campaign.canais.slice(0, 6).map((channel) => <span key={channel.canal} className="text-[10px] px-1.5 py-0.5 rounded bg-muted">{channel.canal}</span>)}{campaign.canais.length > 6 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted">+{campaign.canais.length - 6}</span>}</div>
                      <div className="grid grid-cols-3 gap-2 pt-1 text-xs"><div><span className="text-muted-foreground">Início</span><p>Dia {campaign.inicioOffsetDias + 1}</p></div><div><span className="text-muted-foreground">Duração</span><p>{campaign.duracaoDias} dias</p></div><div><span className="text-muted-foreground">Materiais</span><p>{campaign.materiaisPlanejados}</p></div></div>
                      <div className="flex items-center justify-between border-t pt-2"><span className="text-xs text-muted-foreground">KPI: {campaign.kpiPrincipal}</span><span className="text-xs font-medium text-primary">Abrir campanha →</span></div>
                    </CardContent>
                  </Card>
                </button>
              ))}
            </div>
          </div>

          {(conteudo.oportunidades?.length ?? 0) > 0 && (
            <Card>
              <CardContent className="pt-5 space-y-2">
                <p className="text-sm font-medium flex items-center gap-2"><Lightbulb className="h-4 w-4 text-primary" />Oportunidades consideradas pela IA</p>
                <ul className="grid md:grid-cols-2 gap-2">{conteudo.oportunidades.map((item, index) => <li key={index} className="text-sm text-muted-foreground flex gap-2"><span className="text-primary">·</span>{item}</li>)}</ul>
              </CardContent>
            </Card>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div><p className="text-sm font-semibold flex items-center gap-2"><CalendarDays className="h-4 w-4 text-primary" />Calendário estratégico</p><p className="text-xs text-muted-foreground mt-0.5">Títulos e temas são sugestões da IA. Edite diretamente aqui antes de aprovar; a produção final será feita no Gerador.</p></div>
              {calendario.length === 0 && (
                <Button type="button" size="sm" variant="outline" disabled={gerandoCalendario} onClick={() => plan && generateCalendarForPlan(plan)}>
                  {gerandoCalendario ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}Gerar calendário
                </Button>
              )}
            </div>

            {calendario.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">O plano foi salvo, mas o calendário ainda não foi distribuído.</CardContent></Card>
            ) : (
              <div className="space-y-2">
                {calendario.map((item) => (
                  <Card key={item.id}>
                    <CardContent className="py-3 flex items-center gap-3">
                      <div className="text-center shrink-0 w-12"><p className="text-[10px] text-muted-foreground uppercase">{new Date(item.dataAgendada + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short" })}</p><p className="text-sm font-semibold">{new Date(item.dataAgendada + "T12:00:00").getDate()}</p></div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap"><Badge variant="outline" className="text-[10px]">{campaignNameFromPilar(item.pilar)}</Badge><span className="text-[10px] uppercase text-muted-foreground">{item.canal}</span><span className="text-[10px] uppercase text-muted-foreground">{item.tipo.replaceAll("_", " ")}</span><span className="text-[10px] text-muted-foreground">{contentPillarFromPilar(item.pilar)}</span></div>
                        {editingTitleId === item.id ? (
                          <div className="mt-1 flex gap-1.5"><Input autoFocus value={editingTitle} onChange={(event) => setEditingTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void saveTitle(item); if (event.key === "Escape") setEditingTitleId(null); }} /><Button type="button" size="icon" variant="ghost" onClick={() => saveTitle(item)} disabled={savingTitleId === item.id}>{savingTitleId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}</Button><Button type="button" size="icon" variant="ghost" onClick={() => setEditingTitleId(null)}><X className="h-4 w-4" /></Button></div>
                        ) : (
                          <button type="button" className="group mt-0.5 flex items-center gap-2 text-left max-w-full" onClick={() => { setEditingTitleId(item.id); setEditingTitle(item.temaSugerido); }}><span className="text-sm line-clamp-2">{item.temaSugerido}</span><Pencil className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" /></button>
                        )}
                      </div>
                      <div className="shrink-0 hidden md:flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="h-3.5 w-3.5" />Planejado</div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Card>
              <CardContent className="pt-5 space-y-2"><p className="text-sm font-medium flex items-center gap-2"><Target className="h-4 w-4 text-primary" />Canais prioritários do período</p>{conteudo.canais?.map((channel) => <div key={channel.canal} className="flex items-center justify-between gap-3 border-b last:border-0 py-2"><div><p className="text-sm font-medium">{channel.canal}</p><p className="text-xs text-muted-foreground line-clamp-1">{channel.motivo}</p></div><Badge variant="outline" className={`text-[10px] shrink-0 ${PRIORIDADE_STYLE[channel.prioridade] ?? ""}`}>{channel.percentualOrcamento}%</Badge></div>)}</CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 space-y-2"><p className="text-sm font-medium flex items-center gap-2"><ListChecks className="h-4 w-4 text-primary" />Ações de preparação</p>{conteudo.acoesImediatas?.map((action, index) => <div key={index} className="text-sm flex gap-2"><span className="text-primary font-medium">{index + 1}.</span><span>{action}</span></div>)}</CardContent>
            </Card>
          </div>

          {(conteudo.concorrentesEncontrados?.length ?? 0) > 0 && (
            <Card>
              <CardContent className="pt-5 space-y-2"><p className="text-sm font-medium flex items-center gap-2"><Search className="h-4 w-4 text-primary" />Referências competitivas encontradas</p><div className="space-y-1.5">{conteudo.concorrentesEncontrados!.map((competitor, index) => <a key={index} href={competitor.url} target="_blank" rel="noopener noreferrer" className="block text-xs hover:underline"><span className="font-medium">{competitor.dominio}</span><span className="text-muted-foreground"> — {competitor.titulo}</span></a>)}</div></CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}