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
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  WalletCards,
} from "lucide-react";
import PlanoMidiaCore from "@/pages/PlanoMidiaCore";

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
  if (!period.enabled) return 30;
  return Math.max(1, Math.ceil(period.unidade === "horas" ? period.valor / 24 : period.valor));
}

function formatMoney(value: string): string {
  const normalized = Number(value.replace(".", "").replace(",", "."));
  if (!Number.isFinite(normalized) || normalized <= 0) return "Defina o limite";
  return normalized.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function PlanoMidia() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const [configOpen, setConfigOpen] = useState(false);
  const [config, setConfig] = useState<PlanningConfig>(() => emptyConfig());
  const [nomeCampanha, setNomeCampanha] = useState("");
  const [ofertaCampanha, setOfertaCampanha] = useState("");
  const [orcamentoTotal, setOrcamentoTotal] = useState("");
  const [customPeriod, setCustomPeriod] = useState<FlexiblePeriod>({ enabled: false, valor: 30, unidade: "dias", aberto: false });
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
        if (human.customPeriod.enabled) {
          const days = operationalDays(human.customPeriod);
          body["periodoDias"] = days;
          body["periodo"] = {
            duracaoValor: human.customPeriod.valor,
            duracaoUnidade: human.customPeriod.unidade,
            aberto: human.customPeriod.aberto,
            fimEm: human.customPeriod.aberto ? null : undefined,
          };
        }
      }

      if (isCalendarGeneration && human.customPeriod.enabled) {
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

  const periodSummary = customPeriod.enabled
    ? customPeriod.aberto
      ? `${customPeriod.valor} ${customPeriod.unidade} · sem data final`
      : `${customPeriod.valor} ${customPeriod.unidade}`
    : "Atalhos 30 / 60 / 90 dias";

  function toggleChannel(channel: string) {
    setConfig((current) => ({
      ...current,
      canaisPreferidos: current.canaisPreferidos.includes(channel)
        ? current.canaisPreferidos.filter((item) => item !== channel)
        : [...current.canaisPreferidos, channel],
    }));
  }

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden border-primary/40 shadow-sm">
        <div className="border-b bg-gradient-to-r from-primary/10 via-primary/5 to-background px-4 py-4 md:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className="gap-1"><Sparkles className="h-3 w-3" /> Planejador de Mídia com IA</Badge>
                <Badge variant="outline">Humano define os limites</Badge>
              </div>
              <h2 className="mt-2 text-lg font-semibold tracking-tight">Defina a campanha. A IA faz a distribuição.</h2>
              <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
                Escolha o que quer promover, o período e quanto pode ser investido. A IA monta o plano, distribui o orçamento entre os canais e otimiza sem ultrapassar o teto aprovado.
              </p>
            </div>
            <div className="rounded-lg border bg-background/90 px-3 py-2 text-xs shadow-sm">
              <span className="text-muted-foreground">Regra principal</span>
              <p className="font-medium">A IA pode redistribuir. Não pode aumentar o orçamento.</p>
            </div>
          </div>
        </div>

        <CardContent className="space-y-5 p-4 md:p-5">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border bg-muted/20 p-3">
              <div className="flex items-center gap-2 text-xs font-medium"><CalendarClock className="h-4 w-4 text-primary" /> 1. Período</div>
              <p className="mt-1 text-sm font-semibold">{periodSummary}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Pode ser 12 horas, 1 dia, meses, 1 ano ou aberto.</p>
            </div>
            <div className="rounded-xl border bg-muted/20 p-3">
              <div className="flex items-center gap-2 text-xs font-medium"><WalletCards className="h-4 w-4 text-primary" /> 2. Orçamento</div>
              <p className="mt-1 text-sm font-semibold">{formatMoney(orcamentoTotal)}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Valor total aprovado pelo usuário e tratado como teto rígido.</p>
            </div>
            <div className="rounded-xl border bg-primary/[0.04] p-3">
              <div className="flex items-center gap-2 text-xs font-medium"><BrainCircuit className="h-4 w-4 text-primary" /> 3. IA executa a estratégia</div>
              <p className="mt-1 text-sm font-semibold">Distribuição e otimização automáticas</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Canais, percentuais e ajustes seguem desempenho e regras de segurança.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div>
              {fieldLabel("Título da campanha", "Opcional. Se vazio, a IA cria o nome.")}
              <Input value={nomeCampanha} onChange={(event) => setNomeCampanha(event.target.value)} placeholder="Ex.: Semana da Casa Nova" maxLength={200} />
            </div>
            <div>
              {fieldLabel("Promoção / oferta", "Opcional. Use para campanha, lançamento ou condição especial.")}
              <Input value={ofertaCampanha} onChange={(event) => setOfertaCampanha(event.target.value)} placeholder="Ex.: condição especial até domingo" maxLength={500} />
            </div>
            <div>
              {fieldLabel("Orçamento total (R$)", "Este é o teto que a IA nunca pode ultrapassar.")}
              <Input inputMode="decimal" value={orcamentoTotal} onChange={(event) => setOrcamentoTotal(event.target.value.replace(/[^0-9.,]/g, ""))} placeholder="Ex.: 5.000" />
            </div>
            <div>
              {fieldLabel("Gestão do orçamento", "Regra fixa da campanha.")}
              <div className="flex h-10 items-center gap-2 rounded-md border bg-primary/[0.04] px-3 text-sm font-medium">
                <BrainCircuit className="h-4 w-4 text-primary" /> IA autônoma dentro do limite
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-background p-3 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-xs font-medium">Período personalizado</p>
                <p className="text-[11px] text-muted-foreground">Ative para usar horas, qualquer quantidade de dias ou campanha sem data final.</p>
              </div>
              <button
                type="button"
                onClick={() => setCustomPeriod((current) => ({ ...current, enabled: !current.enabled }))}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${customPeriod.enabled ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
              >
                {customPeriod.enabled ? "Período personalizado ativo" : "Usar período personalizado"}
              </button>
            </div>
            {customPeriod.enabled && (
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px_auto] gap-3 items-end">
                <div>
                  {fieldLabel("Duração")}
                  <Input type="number" min={1} max={3650} value={customPeriod.valor} onChange={(event) => setCustomPeriod((current) => ({ ...current, valor: Math.max(1, Number(event.target.value) || 1) }))} />
                </div>
                <div>
                  {fieldLabel("Unidade")}
                  <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={customPeriod.unidade} onChange={(event) => setCustomPeriod((current) => ({ ...current, unidade: event.target.value as "horas" | "dias" }))}>
                    <option value="horas">Horas</option>
                    <option value="dias">Dias</option>
                  </select>
                </div>
                <label className="h-10 flex items-center gap-2 rounded-md border px-3 text-xs cursor-pointer">
                  <input type="checkbox" checked={customPeriod.aberto} onChange={(event) => setCustomPeriod((current) => ({ ...current, aberto: event.target.checked }))} />
                  Sem data final
                </label>
              </div>
            )}
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
        <p className="text-xs font-medium">Abaixo: plano gerado pela IA</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">O resultado deve respeitar exatamente o período e o teto financeiro definidos acima.</p>
      </div>

      <PlanoMidiaCore />
    </div>
  );
}
