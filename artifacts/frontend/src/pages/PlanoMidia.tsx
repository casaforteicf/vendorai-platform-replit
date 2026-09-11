import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  BrainCircuit,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronUp,
  CircleCheckBig,
  ClipboardCheck,
  Eye,
  FileText,
  Gauge,
  Megaphone,
  Palette,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Target,
  WalletCards,
} from "lucide-react";
import PlanoMidiaCore from "@/pages/PlanoMidiaCore";
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

type FlexiblePeriod = {
  enabled: boolean;
  valor: number;
  unidade: "horas" | "dias";
  aberto: boolean;
};

type PlanWithContext = {
  conteudo?: {
    nomeCampanha?: string;
    ofertaCampanha?: string;
    statusPlanejamento?: "gerado" | "em_revisao" | "aprovado";
    periodo?: {
      duracaoValor?: number;
      duracaoUnidade?: "horas" | "dias";
      aberto?: boolean;
    };
    orcamento?: {
      valor?: number;
      tipo?: "total" | "diario" | "semanal" | "mensal";
    };
  };
  contextoUsado?: {
    configuracaoPlanejamento?: Partial<PlanningConfig> | null;
  } | null;
};

const AVAILABLE_CHANNELS = [
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

const JOURNEY_STEPS = [
  { label: "Estratégia", description: "Objetivo, público, oferta e limites", icon: Target },
  { label: "Plano", description: "Campanhas, canais e pilares", icon: FileText },
  { label: "Calendário", description: "Datas, horários e formatos", icon: CalendarClock },
  { label: "Aprovação", description: "Autoriza a produção", icon: ClipboardCheck },
  { label: "Produção", description: "IA cria as peças", icon: Palette },
  { label: "Revisão", description: "Opcional antes de publicar", icon: Eye },
  { label: "Publicação", description: "Manual ou automática", icon: Megaphone },
  { label: "Resultados", description: "Métricas alimentam o próximo ciclo", icon: Gauge },
] as const;

const PERIOD_PRESETS: Array<{ label: string; valor: number; unidade: "horas" | "dias" }> = [
  { label: "6h", valor: 6, unidade: "horas" },
  { label: "12h", valor: 12, unidade: "horas" },
  { label: "1 dia", valor: 1, unidade: "dias" },
  { label: "7 dias", valor: 7, unidade: "dias" },
  { label: "30 dias", valor: 30, unidade: "dias" },
  { label: "90 dias", valor: 90, unidade: "dias" },
  { label: "1 ano", valor: 365, unidade: "dias" },
];

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

function normalizeConfig(source: Partial<PlanningConfig> | null | undefined): PlanningConfig {
  const base = emptyConfig();
  if (!source) return base;
  return {
    objetivoPrincipal: typeof source.objetivoPrincipal === "string" ? source.objetivoPrincipal : "",
    produtoServicoPrioritario: typeof source.produtoServicoPrioritario === "string" ? source.produtoServicoPrioritario : "",
    publicoPrioritario: typeof source.publicoPrioritario === "string" ? source.publicoPrioritario : "",
    regiao: typeof source.regiao === "string" ? source.regiao : "",
    ofertaPrincipal: typeof source.ofertaPrincipal === "string" ? source.ofertaPrincipal : "",
    canaisPreferidos: Array.isArray(source.canaisPreferidos)
      ? source.canaisPreferidos.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
      : [],
    observacoes: typeof source.observacoes === "string" ? source.observacoes : "",
  };
}

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` };
}

function fieldLabel(title: string, description?: string) {
  return (
    <div className="mb-1.5">
      <p className="text-xs font-medium text-foreground">{title}</p>
      {description && <p className="mt-0.5 text-[11px] text-muted-foreground">{description}</p>}
    </div>
  );
}

function operationalDays(period: FlexiblePeriod): number {
  return Math.max(1, Math.ceil(period.unidade === "horas" ? period.valor / 24 : period.valor));
}

function formatMoney(value: string): string {
  const normalized = Number(value.replace(".", "").replace(",", "."));
  if (!Number.isFinite(normalized) || normalized <= 0) return "Sem limite informado";
  return normalized.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function Journey() {
  return (
    <Card className="border-primary/30 bg-primary/[0.02]">
      <CardContent className="p-4 md:p-5">
        <div className="mb-3">
          <p className="text-sm font-semibold">Como o Planejador funciona</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Uma sequência única do planejamento até o aprendizado. Aprovar o plano autoriza produzir; não significa publicar automaticamente.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
          {JOURNEY_STEPS.map((step, index) => {
            const Icon = step.icon;
            return (
              <div key={step.label} className="relative rounded-xl border bg-background p-3 min-h-[98px]">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="text-[10px] font-semibold text-muted-foreground">{index + 1}/8</span>
                </div>
                <p className="mt-2 text-xs font-semibold">{step.label}</p>
                <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">{step.description}</p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default function PlanoMidia() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const [configOpen, setConfigOpen] = useState(false);
  const [config, setConfig] = useState<PlanningConfig>(() => emptyConfig());
  const [nomeCampanha, setNomeCampanha] = useState("");
  const [ofertaCampanha, setOfertaCampanha] = useState("");
  const [orcamentoTotal, setOrcamentoTotal] = useState("");
  const [customPeriod, setCustomPeriod] = useState<FlexiblePeriod>({ enabled: true, valor: 7, unidade: "dias", aberto: false });
  const configRef = useRef(config);
  const campaignRef = useRef({ nomeCampanha, ofertaCampanha, orcamentoTotal, customPeriod });
  const hydratedTenantRef = useRef("");

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    campaignRef.current = { nomeCampanha, ofertaCampanha, orcamentoTotal, customPeriod };
  }, [nomeCampanha, ofertaCampanha, orcamentoTotal, customPeriod]);

  useEffect(() => {
    if (!tenantId || hydratedTenantRef.current === tenantId) return;
    hydratedTenantRef.current = tenantId;
    let cancelled = false;

    fetch(`/api/tenants/${tenantId}/media-plan`, { headers: authHeaders() })
      .then(async (response) => response.ok ? response.json() as Promise<PlanWithContext | null> : null)
      .then((plan) => {
        if (cancelled || !plan) return;
        if (plan.contextoUsado?.configuracaoPlanejamento) {
          const next = normalizeConfig(plan.contextoUsado.configuracaoPlanejamento);
          configRef.current = next;
          setConfig(next);
        }
        if (plan.conteudo?.nomeCampanha) setNomeCampanha(plan.conteudo.nomeCampanha);
        if (plan.conteudo?.ofertaCampanha) setOfertaCampanha(plan.conteudo.ofertaCampanha);
        if (typeof plan.conteudo?.orcamento?.valor === "number") setOrcamentoTotal(String(plan.conteudo.orcamento.valor));
        if (plan.conteudo?.periodo?.duracaoValor && plan.conteudo.periodo.duracaoUnidade) {
          setCustomPeriod({
            enabled: true,
            valor: plan.conteudo.periodo.duracaoValor,
            unidade: plan.conteudo.periodo.duracaoUnidade,
            aberto: Boolean(plan.conteudo.periodo.aberto),
          });
        }
      })
      .catch(() => undefined);

    return () => { cancelled = true; };
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId || typeof window === "undefined") return;
    const nativeFetch = window.fetch.bind(window);

    const wrappedFetch: typeof window.fetch = async (input, init) => {
      const rawUrl = typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      const isPlanGeneration = method === "POST" && rawUrl.includes(`/api/tenants/${tenantId}/media-plan/gerar`);
      const isCalendarGeneration = method === "POST" && rawUrl.includes(`/api/tenants/${tenantId}/content-calendar/gerar`);

      if (!isPlanGeneration && !isCalendarGeneration) return nativeFetch(input, init);

      let body: Record<string, unknown> = {};
      try {
        const rawBody = init?.body ?? (input instanceof Request ? await input.clone().text() : undefined);
        if (typeof rawBody === "string" && rawBody.trim()) body = JSON.parse(rawBody) as Record<string, unknown>;
      } catch {
        body = {};
      }

      const human = campaignRef.current;
      if (isPlanGeneration) {
        body["configuracao"] = configRef.current;
        if (human.nomeCampanha.trim()) body["nomeCampanha"] = human.nomeCampanha.trim();
        if (human.ofertaCampanha.trim()) body["ofertaCampanha"] = human.ofertaCampanha.trim();
        const budget = Number(human.orcamentoTotal.replace(",", "."));
        if (Number.isFinite(budget) && budget > 0) {
          body["orcamento"] = {
            valor: budget,
            tipo: "total",
            moeda: "BRL",
            gestao: "ia_autonoma",
            limiteRigido: true,
          };
        }
        const days = operationalDays(human.customPeriod);
        body["periodoDias"] = days;
        body["periodo"] = {
          duracaoValor: human.customPeriod.valor,
          duracaoUnidade: human.customPeriod.unidade,
          aberto: human.customPeriod.aberto,
          fimEm: human.customPeriod.aberto ? null : undefined,
        };
      }

      if (isCalendarGeneration) {
        body["semanas"] = Math.max(1, Math.min(53, Math.ceil(operationalDays(human.customPeriod) / 7)));
      }

      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");

      return nativeFetch(input, {
        ...init,
        method,
        headers,
        body: JSON.stringify(body),
      });
    };

    window.fetch = wrappedFetch;
    return () => {
      if (window.fetch === wrappedFetch) window.fetch = nativeFetch;
    };
  }, [tenantId]);

  const configuredCount = useMemo(() => [
    config.objetivoPrincipal,
    config.produtoServicoPrioritario,
    config.publicoPrioritario,
    config.regiao,
    config.ofertaPrincipal,
    config.observacoes,
    config.canaisPreferidos.length > 0 ? "canais" : "",
  ].filter(Boolean).length, [config]);

  const periodSummary = customPeriod.aberto
    ? `${customPeriod.valor} ${customPeriod.unidade} · sem data final`
    : `${customPeriod.valor} ${customPeriod.unidade}`;

  function toggleChannel(channel: string) {
    setConfig((current) => ({
      ...current,
      canaisPreferidos: current.canaisPreferidos.includes(channel)
        ? current.canaisPreferidos.filter((item) => item !== channel)
        : [...current.canaisPreferidos, channel],
    }));
  }

  function usePreset(valor: number, unidade: "horas" | "dias") {
    setCustomPeriod({ enabled: true, valor, unidade, aberto: false });
  }

  return (
    <div className="space-y-5">
      <Journey />

      <Card className="overflow-hidden border-primary/40 shadow-sm">
        <div className="border-b bg-gradient-to-r from-primary/10 via-primary/5 to-background px-4 py-4 md:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className="gap-1"><Sparkles className="h-3 w-3" /> Configuração da campanha</Badge>
                <Badge variant="outline">Etapa 1 · Estratégia</Badge>
              </div>
              <h2 className="mt-2 text-lg font-semibold tracking-tight">Defina os limites. A IA monta o plano.</h2>
              <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
                O período pode ser curto ou longo: horas, dias, meses ou campanha aberta. Depois a IA cria plano, calendário e distribuição por canal.
              </p>
            </div>
            <div className="rounded-lg border bg-background/90 px-3 py-2 text-xs shadow-sm">
              <span className="text-muted-foreground">Regra importante</span>
              <p className="font-medium">Aprovar o plano = autorizar produção. Publicar é uma etapa separada.</p>
            </div>
          </div>
        </div>

        <CardContent className="space-y-5 p-4 md:p-5">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border bg-muted/20 p-3">
              <div className="flex items-center gap-2 text-xs font-medium"><CalendarClock className="h-4 w-4 text-primary" /> Período da campanha</div>
              <p className="mt-1 text-sm font-semibold">{periodSummary}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Qualquer duração. O calendário se adapta ao intervalo.</p>
            </div>
            <div className="rounded-xl border bg-muted/20 p-3">
              <div className="flex items-center gap-2 text-xs font-medium"><WalletCards className="h-4 w-4 text-primary" /> Limite de investimento</div>
              <p className="mt-1 text-sm font-semibold">{formatMoney(orcamentoTotal)}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Quando informado, funciona como teto rígido.</p>
            </div>
            <div className="rounded-xl border bg-primary/[0.04] p-3">
              <div className="flex items-center gap-2 text-xs font-medium"><BrainCircuit className="h-4 w-4 text-primary" /> Papel da IA</div>
              <p className="mt-1 text-sm font-semibold">Planejar, distribuir e otimizar</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">A produção começa somente depois da aprovação do plano.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div>
              {fieldLabel("Título da campanha", "Opcional. Se vazio, a IA cria o nome.")}
              <Input value={nomeCampanha} onChange={(event) => setNomeCampanha(event.target.value)} placeholder="Ex.: Semana da Casa Nova" maxLength={200} />
            </div>
            <div>
              {fieldLabel("Promoção / oferta", "Opcional. Use para lançamento ou condição especial.")}
              <Input value={ofertaCampanha} onChange={(event) => setOfertaCampanha(event.target.value)} placeholder="Ex.: condição especial até domingo" maxLength={500} />
            </div>
            <div>
              {fieldLabel("Orçamento total (R$)", "Opcional. Quando preenchido, a IA não pode ultrapassar.")}
              <Input inputMode="decimal" value={orcamentoTotal} onChange={(event) => setOrcamentoTotal(event.target.value.replace(/[^0-9.,]/g, ""))} placeholder="Ex.: 5.000" />
            </div>
            <div>
              {fieldLabel("Gestão do orçamento", "Regra fixa quando houver orçamento.")}
              <div className="flex h-10 items-center gap-2 rounded-md border bg-primary/[0.04] px-3 text-sm font-medium">
                <BrainCircuit className="h-4 w-4 text-primary" /> IA dentro do limite aprovado
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-background p-3 space-y-3">
            <div>
              <p className="text-sm font-semibold">Duração do planejamento</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Não existe mais um prazo obrigatório de 30, 60 ou 90 dias. Escolha qualquer quantidade de horas ou dias; meses e anos usam atalhos em dias.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {PERIOD_PRESETS.map((preset) => {
                const selected = !customPeriod.aberto && customPeriod.valor === preset.valor && customPeriod.unidade === preset.unidade;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => usePreset(preset.valor, preset.unidade)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${selected ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px_auto] gap-3 items-end">
              <div>
                {fieldLabel("Duração")}
                <Input type="number" min={1} max={3650} value={customPeriod.valor} onChange={(event) => setCustomPeriod((current) => ({ ...current, enabled: true, valor: Math.max(1, Number(event.target.value) || 1) }))} />
              </div>
              <div>
                {fieldLabel("Unidade")}
                <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={customPeriod.unidade} onChange={(event) => setCustomPeriod((current) => ({ ...current, enabled: true, unidade: event.target.value as "horas" | "dias" }))}>
                  <option value="horas">Horas</option>
                  <option value="dias">Dias</option>
                </select>
              </div>
              <label className="h-10 flex items-center gap-2 rounded-md border px-3 text-xs cursor-pointer">
                <input type="checkbox" checked={customPeriod.aberto} onChange={(event) => setCustomPeriod((current) => ({ ...current, enabled: true, aberto: event.target.checked }))} />
                Sem data final
              </label>
            </div>

            <div className="rounded-lg border border-primary/20 bg-primary/[0.035] p-3 text-xs text-muted-foreground">
              <div className="flex items-start gap-2">
                <CircleCheckBig className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div>
                  <p className="font-medium text-foreground">Período e antecedência são coisas diferentes</p>
                  <p className="mt-0.5">A campanha pode durar 6 horas, 7 dias ou 1 ano. A antecedência para a IA produzir cada peça será controlada na etapa de Produção/Publicação.</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-primary/25 bg-primary/[0.025]">
        <CardContent className="py-4 space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <SlidersHorizontal className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold">Diretrizes estratégicas opcionais</p>
                {configuredCount > 0 && <Badge variant="outline" className="text-[10px]">{configuredCount} diretriz(es)</Badge>}
              </div>
              <p className="mt-1 text-xs text-muted-foreground max-w-3xl">
                Se você não preencher, a IA decide automaticamente. Use apenas quando quiser orientar objetivo, público, região, oferta ou canais prioritários.
              </p>
              {!configOpen && configuredCount > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {config.objetivoPrincipal && <Badge variant="secondary" className="text-[10px]">Objetivo: {config.objetivoPrincipal}</Badge>}
                  {config.produtoServicoPrioritario && <Badge variant="secondary" className="text-[10px]">Prioridade: {config.produtoServicoPrioritario}</Badge>}
                  {config.regiao && <Badge variant="secondary" className="text-[10px]">Região: {config.regiao}</Badge>}
                  {config.canaisPreferidos.length > 0 && <Badge variant="secondary" className="text-[10px]">{config.canaisPreferidos.length} canal(is) priorizado(s)</Badge>}
                </div>
              )}
            </div>
            <Button type="button" size="sm" variant={configOpen ? "secondary" : "outline"} onClick={() => setConfigOpen((open) => !open)}>
              {configOpen ? <ChevronUp className="h-3.5 w-3.5 mr-1.5" /> : <ChevronDown className="h-3.5 w-3.5 mr-1.5" />}
              {configOpen ? "Fechar configuração" : "Configurar estratégia"}
            </Button>
          </div>

          {configOpen && (
            <div className="border-t pt-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                <div>
                  {fieldLabel("Objetivo principal do período", "Ex.: gerar leads, vender um lançamento, aumentar recorrência.")}
                  <Input value={config.objetivoPrincipal} onChange={(event) => setConfig((current) => ({ ...current, objetivoPrincipal: event.target.value }))} placeholder="IA decide automaticamente" maxLength={300} />
                </div>
                <div>
                  {fieldLabel("Produto ou serviço prioritário", "A IA continua podendo usar o restante do portfólio quando fizer sentido.")}
                  <Input value={config.produtoServicoPrioritario} onChange={(event) => setConfig((current) => ({ ...current, produtoServicoPrioritario: event.target.value }))} placeholder="Ex.: Plano Pró, consultoria, linha X" maxLength={300} />
                </div>
                <div>
                  {fieldLabel("Público prioritário", "Defina apenas se quiser restringir ou refinar o público já cadastrado.")}
                  <Input value={config.publicoPrioritario} onChange={(event) => setConfig((current) => ({ ...current, publicoPrioritario: event.target.value }))} placeholder="Ex.: PMEs de 10 a 50 funcionários" maxLength={500} />
                </div>
                <div>
                  {fieldLabel("Região / área de atuação", "Serve para segmentação; não obriga a IA a repetir o local em todos os materiais.")}
                  <Input value={config.regiao} onChange={(event) => setConfig((current) => ({ ...current, regiao: event.target.value }))} placeholder="Ex.: Brasil, SC, Chapecó e região" maxLength={250} />
                </div>
                <div className="md:col-span-2">
                  {fieldLabel("Oferta ou CTA principal", "O próximo passo comercial que deve orientar conversão e campanhas.")}
                  <Input value={config.ofertaPrincipal} onChange={(event) => setConfig((current) => ({ ...current, ofertaPrincipal: event.target.value }))} placeholder="Ex.: solicitar demonstração, orçamento, teste grátis" maxLength={500} />
                </div>
              </div>

              <div>
                {fieldLabel("Canais que quero priorizar", "A IA completa o mix necessário para o funil; estes canais recebem prioridade explícita.")}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-7 gap-2">
                  {AVAILABLE_CHANNELS.map((channel) => {
                    const selected = config.canaisPreferidos.includes(channel);
                    return (
                      <button key={channel} type="button" onClick={() => toggleChannel(channel)} className={`min-h-9 rounded-md border px-2 py-1.5 text-xs text-left transition-colors ${selected ? "border-primary bg-primary/10 text-primary" : "bg-background hover:bg-muted"}`}>
                        <span className="flex items-center gap-1.5">
                          <span className={`h-3.5 w-3.5 shrink-0 rounded border flex items-center justify-center ${selected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"}`}>
                            {selected && <Check className="h-2.5 w-2.5" />}
                          </span>
                          <span>{channel}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                {fieldLabel("Observações e restrições para a IA", "Registre nuances do ciclo sem precisar editar campanha por campanha depois.")}
                <textarea className="w-full min-h-24 rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" value={config.observacoes} onChange={(event) => setConfig((current) => ({ ...current, observacoes: event.target.value }))} placeholder="Ex.: comunicação mais sutil, evitar repetir a cidade em todas as peças, priorizar prova e demonstração, não usar desconto..." maxLength={1500} />
              </div>

              <div className="flex items-center justify-between gap-3 flex-wrap border-t pt-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  Ao clicar em Planejar/Replanejar com IA, estas diretrizes serão enviadas automaticamente.
                </div>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="ghost" onClick={() => setConfig(emptyConfig())} disabled={configuredCount === 0}>
                    <RotateCcw className="h-3.5 w-3.5 mr-1.5" />Deixar IA decidir estratégia
                  </Button>
                  <Button type="button" size="sm" onClick={() => setConfigOpen(false)}>
                    <Check className="h-3.5 w-3.5 mr-1.5" />Usar estas configurações
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="rounded-xl border border-dashed border-primary/30 bg-primary/[0.02] px-4 py-3">
        <p className="text-xs font-medium">Próximas etapas: Plano → Calendário → Aprovação</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">Abaixo a IA apresenta o plano gerado. Depois da aprovação, a produção pode começar; publicação continua sendo uma autorização separada.</p>
      </div>

      <div className="marketing-plan-responsive">
        <PlanoMidiaCore />
      </div>
    </div>
  );
}
