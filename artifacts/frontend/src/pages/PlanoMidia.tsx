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
  Loader2,
  RefreshCw,
  Sparkles,
  Target,
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
    pontosFortesAtuais?: string[];
    oportunidades?: string[];
    periodoDias?: number;
    statusPlanejamento?: "gerado" | "em_revisao" | "aprovado";
    campanhas?: PlannedCampaign[];
    nomeCampanha?: string;
    ofertaCampanha?: string;
    orcamento?: { valor?: number; tipo?: string };
  };
  contextoUsado?: {
    configuracaoPlanejamento?: Partial<PlanningConfig> | null;
  } | null;
};

type CalendarItem = {
  id: string;
  mediaPlanId?: string | null;
};

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
  if (!source) return emptyConfig();
  return {
    objetivoPrincipal: source.objetivoPrincipal ?? "",
    produtoServicoPrioritario: source.produtoServicoPrioritario ?? "",
    publicoPrioritario: source.publicoPrioritario ?? "",
    regiao: source.regiao ?? "",
    ofertaPrincipal: source.ofertaPrincipal ?? "",
    canaisPreferidos: Array.isArray(source.canaisPreferidos) ? source.canaisPreferidos : [],
    observacoes: source.observacoes ?? "",
  };
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
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [approving, setApproving] = useState(false);
  const [creatingCampaigns, setCreatingCampaigns] = useState(false);
  const [campaignsGenerated, setCampaignsGenerated] = useState(false);

  const campaigns = plan?.conteudo.campanhas ?? [];
  const approved = plan?.conteudo.statusPlanejamento === "aprovado";

  const configuredCount = useMemo(
    () => [
      config.objetivoPrincipal,
      config.produtoServicoPrioritario,
      config.publicoPrioritario,
      config.regiao,
      config.ofertaPrincipal,
      config.observacoes,
      config.canaisPreferidos.length > 0 ? "canais" : "",
    ].filter(Boolean).length,
    [config],
  );

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

  async function loadPlan() {
    if (!tenantId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/media-plan`, { headers: authHeaders() });
      if (!response.ok) throw new Error("Não foi possível carregar o planejamento.");
      const data = (await response.json()) as MediaPlan | null;
      setPlan(data);
      if (data) {
        setConfig(normalizeConfig(data.contextoUsado?.configuracaoPlanejamento));
        if (data.conteudo.periodoDias) setPeriodoDias(Math.max(1, Math.round(data.conteudo.periodoDias)));
        if (typeof data.conteudo.orcamento?.valor === "number") setOrcamentoTotal(String(data.conteudo.orcamento.valor));
        await checkGeneratedCampaigns(data.id);
      } else {
        setCampaignsGenerated(false);
      }
    } catch (error) {
      toast({
        title: "Falha ao carregar planejamento",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPlan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  function toggleChannel(channel: string) {
    setConfig((current) => ({
      ...current,
      canaisPreferidos: current.canaisPreferidos.includes(channel)
        ? current.canaisPreferidos.filter((item) => item !== channel)
        : [...current.canaisPreferidos, channel],
    }));
  }

  async function generateProposal() {
    if (!tenantId) return;
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
      setCampaignsGenerated(false);
      toast({
        title: "Proposta de planejamento pronta",
        description: "Revise a estratégia e as campanhas sugeridas. Nenhuma execução foi iniciada.",
      });
    } catch (error) {
      toast({
        title: "Não foi possível gerar a proposta",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  }

  async function approvePlanning() {
    if (!plan) return;
    setApproving(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/media-plan/${plan.id}`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ aprovar: true }),
      });
      const data = (await response.json()) as MediaPlan & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Falha ao aprovar o planejamento.");
      setPlan(data);
      toast({
        title: "Planejamento aprovado",
        description: "A direção foi aprovada. A execução ainda não começou.",
      });
    } catch (error) {
      toast({
        title: "Não foi possível aprovar",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
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
      if (!response.ok) {
        throw new Error(!Array.isArray(data) ? data.error ?? "Falha ao gerar as campanhas." : "Falha ao gerar as campanhas.");
      }
      setCampaignsGenerated(true);
      toast({
        title: "Campanhas geradas",
        description: "Agora começa a execução. Conteúdos, anúncios, LPs e ações passam a ser acompanhados em Campanhas.",
      });
      navigate(`/content?source=media-plan&tab=campanhas&mediaPlanId=${encodeURIComponent(plan.id)}`);
    } catch (error) {
      toast({
        title: "Não foi possível gerar as campanhas",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setCreatingCampaigns(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[280px] items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando planejamento…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Card className="border-primary/30 bg-primary/[0.02]">
        <CardContent className="p-4 md:p-5">
          <div className="mb-4">
            <p className="text-sm font-semibold">Planejamento = decisão, não execução</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Aqui você informa o que quer fazer, a IA sugere a estratégia e você aprova. Somente em “Gerar Campanhas” a execução começa.
            </p>
          </div>
          <div className="grid gap-2 md:grid-cols-4">
            {[
              ["1", "Informações", "Objetivo, público, oferta, região, período e orçamento"],
              ["2", "Proposta da IA", "Estratégia, campanhas sugeridas, canais e KPIs"],
              ["3", "Aprovação", "Você revisa e aprova a direção"],
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

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-base flex items-center gap-2"><Target className="h-4 w-4 text-primary" />1. Informações do planejamento</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">Preencha somente a direção. Nada será publicado, enviado ou colocado em produção nesta etapa.</p>
            </div>
            <Badge variant="outline">{configuredCount}/7 informações</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-xs font-medium">Objetivo</label>
              <Input className="mt-1" value={config.objetivoPrincipal} onChange={(e) => setConfig({ ...config, objetivoPrincipal: e.target.value })} placeholder="Ex.: gerar oportunidades qualificadas" />
            </div>
            <div>
              <label className="text-xs font-medium">Produto ou serviço</label>
              <Input className="mt-1" value={config.produtoServicoPrioritario} onChange={(e) => setConfig({ ...config, produtoServicoPrioritario: e.target.value })} placeholder="Ex.: VendorAI para clínicas odontológicas" />
            </div>
            <div>
              <label className="text-xs font-medium">Público</label>
              <Input className="mt-1" value={config.publicoPrioritario} onChange={(e) => setConfig({ ...config, publicoPrioritario: e.target.value })} placeholder="Ex.: clínicas odontológicas privadas" />
            </div>
            <div>
              <label className="text-xs font-medium">Região</label>
              <Input className="mt-1" value={config.regiao} onChange={(e) => setConfig({ ...config, regiao: e.target.value })} placeholder="Ex.: Brasil" />
            </div>
            <div>
              <label className="text-xs font-medium">Oferta / CTA</label>
              <Input className="mt-1" value={config.ofertaPrincipal} onChange={(e) => setConfig({ ...config, ofertaPrincipal: e.target.value })} placeholder="Ex.: diagnóstico + demonstração" />
            </div>
            <div>
              <label className="text-xs font-medium">Orçamento total</label>
              <Input className="mt-1" value={orcamentoTotal} onChange={(e) => setOrcamentoTotal(e.target.value)} placeholder="Opcional" inputMode="decimal" />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium">Período</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {PERIODS.map((days) => (
                <Button key={days} type="button" size="sm" variant={periodoDias === days ? "default" : "outline"} onClick={() => setPeriodoDias(days)}>{days} dias</Button>
              ))}
              <Input className="h-9 w-28" type="number" min={1} max={3650} value={periodoDias} onChange={(e) => setPeriodoDias(Math.max(1, Number(e.target.value) || 1))} />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium">Canais que deseja considerar</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {CHANNELS.map((channel) => (
                <Button key={channel} type="button" size="sm" variant={config.canaisPreferidos.includes(channel) ? "default" : "outline"} onClick={() => toggleChannel(channel)}>{channel}</Button>
              ))}
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

          <div className="flex justify-end">
            <Button onClick={generateProposal} disabled={generating}>
              {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              {plan ? "Gerar nova proposta" : "Gerar proposta com IA"}
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
                <p className="mt-1 text-xs text-muted-foreground">Estas campanhas ainda são sugestões de planejamento. Não estão em execução.</p>
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
                <p className="text-sm font-semibold">Campanhas propostas</p>
                <Badge variant="outline">{campaigns.length} sugestões</Badge>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {campaigns.map((campaign) => (
                  <div key={campaign.id} className="rounded-xl border bg-background p-4">
                    <p className="font-semibold">{campaign.nome}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{campaign.objetivo}</p>
                    <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                      <div><span className="text-muted-foreground">Público: </span>{campaign.publico}</div>
                      <div><span className="text-muted-foreground">Oferta: </span>{campaign.oferta}</div>
                      <div><span className="text-muted-foreground">KPI: </span>{campaign.kpiPrincipal}</div>
                      <div><span className="text-muted-foreground">Materiais previstos: </span>{campaign.materiaisPlanejados}</div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {campaign.canais.map((channel) => <Badge key={channel.canal} variant="outline" className="text-[10px]">{channel.canal}</Badge>)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-dashed p-4">
              <p className="text-sm font-semibold flex items-center gap-2"><ClipboardCheck className="h-4 w-4 text-primary" />3. Aprovação</p>
              <p className="mt-1 text-xs text-muted-foreground">Aprovar confirma a direção estratégica. Ainda não cria peças, anúncios, mensagens ou publicações.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {!approved ? (
                  <Button onClick={approvePlanning} disabled={approving || campaigns.length === 0}>
                    {approving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                    Aprovar planejamento
                  </Button>
                ) : (
                  <Badge className="bg-emerald-600"><CheckCircle2 className="mr-1 h-3.5 w-3.5" />Direção aprovada</Badge>
                )}
                <Button variant="outline" onClick={generateProposal} disabled={generating}>
                  <RefreshCw className="mr-2 h-4 w-4" />Recalcular proposta
                </Button>
              </div>
            </div>

            <div className="rounded-xl border border-primary/30 bg-primary/[0.03] p-4">
              <p className="text-sm font-semibold">4. Gerar Campanhas</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Este é o ponto de virada: somente depois deste botão começam calendário, produção de materiais, anúncios, LPs, mensagens e demais ações de execução.
              </p>
              <div className="mt-3">
                <Button onClick={generateCampaigns} disabled={!approved || creatingCampaigns}>
                  {creatingCampaigns ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
                  {campaignsGenerated ? "Abrir Campanhas" : "Gerar Campanhas e iniciar execução"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
