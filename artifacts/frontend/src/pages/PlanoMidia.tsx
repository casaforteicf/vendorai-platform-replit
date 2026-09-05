import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Check,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  WalletCards,
} from "lucide-react";
import PlanoMidiaCore from "@/pages/PlanoMidiaCore";

type BudgetType = "total" | "diario" | "semanal" | "mensal";

type PlanningConfig = {
  nomeCampanha: string;
  ofertaPrincipal: string;
  inicioEm: string;
  fimEm: string;
  semDataFinal: boolean;
  orcamentoValor: number;
  orcamentoTipo: BudgetType;
};

type StoredPlanningConfig = Partial<PlanningConfig> & {
  inicioEm?: string;
  fimEm?: string | null;
};

type PlanWithContext = {
  contextoUsado?: {
    configuracaoPlanejamento?: StoredPlanningConfig | null;
  } | null;
};

function emptyConfig(): PlanningConfig {
  return {
    nomeCampanha: "",
    ofertaPrincipal: "",
    inicioEm: "",
    fimEm: "",
    semDataFinal: false,
    orcamentoValor: 0,
    orcamentoTipo: "total",
  };
}

function toDatetimeLocal(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 16);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function normalizeConfig(source: StoredPlanningConfig | null | undefined): PlanningConfig {
  const base = emptyConfig();
  if (!source) return base;
  const type = source.orcamentoTipo;
  return {
    nomeCampanha: typeof source.nomeCampanha === "string" ? source.nomeCampanha : "",
    ofertaPrincipal: typeof source.ofertaPrincipal === "string" ? source.ofertaPrincipal : "",
    inicioEm: toDatetimeLocal(source.inicioEm),
    fimEm: toDatetimeLocal(source.fimEm),
    semDataFinal: source.semDataFinal === true,
    orcamentoValor: typeof source.orcamentoValor === "number" && Number.isFinite(source.orcamentoValor)
      ? source.orcamentoValor
      : 0,
    orcamentoTipo: type === "diario" || type === "semanal" || type === "mensal" ? type : "total",
  };
}

function configForApi(config: PlanningConfig) {
  const inicio = config.inicioEm ? new Date(config.inicioEm) : null;
  const fim = !config.semDataFinal && config.fimEm ? new Date(config.fimEm) : null;
  return {
    ...config,
    inicioEm: inicio && !Number.isNaN(inicio.getTime()) ? inicio.toISOString() : "",
    fimEm: fim && !Number.isNaN(fim.getTime()) ? fim.toISOString() : "",
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

export default function PlanoMidia() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const [configOpen, setConfigOpen] = useState(true);
  const [config, setConfig] = useState<PlanningConfig>(() => emptyConfig());
  const configRef = useRef(config);
  const hydratedTenantRef = useRef("");

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    if (!tenantId || hydratedTenantRef.current === tenantId) return;
    hydratedTenantRef.current = tenantId;
    let cancelled = false;

    fetch(`/api/tenants/${tenantId}/media-plan`, { headers: authHeaders() })
      .then(async (response) => response.ok ? response.json() as Promise<PlanWithContext | null> : null)
      .then((plan) => {
        if (cancelled || !plan?.contextoUsado?.configuracaoPlanejamento) return;
        const next = normalizeConfig(plan.contextoUsado.configuracaoPlanejamento);
        configRef.current = next;
        setConfig(next);
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

      if (!isPlanGeneration) return nativeFetch(input, init);

      let body: Record<string, unknown> = {};
      try {
        const rawBody = init?.body ?? (input instanceof Request ? await input.clone().text() : undefined);
        if (typeof rawBody === "string" && rawBody.trim()) body = JSON.parse(rawBody) as Record<string, unknown>;
      } catch {
        body = {};
      }

      body["configuracao"] = configForApi(configRef.current);
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

  const configuredCount = useMemo(() => {
    return [
      config.nomeCampanha,
      config.ofertaPrincipal,
      config.inicioEm,
      config.semDataFinal ? "aberta" : config.fimEm,
      config.orcamentoValor > 0 ? "orcamento" : "",
    ].filter(Boolean).length;
  }, [config]);

  const periodSummary = useMemo(() => {
    if (!config.inicioEm) return "Defina início e fim livremente — inclusive campanhas de horas, dias, meses ou anos.";
    if (config.semDataFinal) return `A partir de ${new Date(config.inicioEm).toLocaleString("pt-BR")} · sem data final`;
    if (!config.fimEm) return "Defina quando a campanha termina.";
    const start = new Date(config.inicioEm);
    const end = new Date(config.fimEm);
    const diffHours = Math.max(0, (end.getTime() - start.getTime()) / 3_600_000);
    if (!Number.isFinite(diffHours)) return "Período personalizado";
    if (diffHours < 48) return `${Math.round(diffHours * 10) / 10} hora(s)`;
    return `${Math.round((diffHours / 24) * 10) / 10} dia(s)`;
  }, [config.inicioEm, config.fimEm, config.semDataFinal]);

  function resetConfig() {
    const next = emptyConfig();
    configRef.current = next;
    setConfig(next);
  }

  return (
    <div className="space-y-4">
      <Card className="border-primary/25 bg-primary/[0.03]">
        <CardContent className="py-4 space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <SlidersHorizontal className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold">Defina a campanha; a IA opera a mídia</p>
                {configuredCount > 0 && <Badge variant="outline" className="text-[10px]">{configuredCount}/5 definido(s)</Badge>}
              </div>
              <p className="mt-1 text-xs text-muted-foreground max-w-3xl">
                Você informa somente a intenção comercial, o período e o limite financeiro. A IA escolhe canais, públicos, formatos, frequência e distribuição do orçamento, podendo redistribuir a verba pelo desempenho sem ultrapassar o limite definido.
              </p>
              {!configOpen && configuredCount > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {config.nomeCampanha && <Badge variant="secondary" className="text-[10px]">{config.nomeCampanha}</Badge>}
                  {config.orcamentoValor > 0 && <Badge variant="secondary" className="text-[10px]">R$ {config.orcamentoValor.toLocaleString("pt-BR")} · {config.orcamentoTipo}</Badge>}
                  {config.inicioEm && <Badge variant="secondary" className="text-[10px]">{periodSummary}</Badge>}
                </div>
              )}
            </div>
            <Button type="button" size="sm" variant={configOpen ? "secondary" : "outline"} onClick={() => setConfigOpen((open) => !open)}>
              {configOpen ? <ChevronUp className="h-3.5 w-3.5 mr-1.5" /> : <ChevronDown className="h-3.5 w-3.5 mr-1.5" />}
              {configOpen ? "Fechar" : "Editar campanha"}
            </Button>
          </div>

          {configOpen && (
            <div className="border-t pt-4 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  {fieldLabel("Título / tema da campanha", "Ex.: Semana da Piscina, Black Friday, Lançamento Linha X.")}
                  <Input
                    value={config.nomeCampanha}
                    onChange={(event) => setConfig((current) => ({ ...current, nomeCampanha: event.target.value }))}
                    placeholder="Nome ou tema da campanha"
                    maxLength={300}
                  />
                </div>
                <div>
                  {fieldLabel("Oferta ou promoção", "Pode ser uma promoção, condição especial ou simplesmente o CTA da campanha.")}
                  <Input
                    value={config.ofertaPrincipal}
                    onChange={(event) => setConfig((current) => ({ ...current, ofertaPrincipal: event.target.value }))}
                    placeholder="Ex.: 15% de desconto, orçamento grátis, demonstração"
                    maxLength={500}
                  />
                </div>
              </div>

              <div>
                {fieldLabel("Período da campanha", "Livre: pode durar 12 horas, 1 dia, 45 dias, 1 ano ou ficar sem data final.")}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto] gap-3 items-end">
                  <div>
                    <p className="mb-1 text-[11px] text-muted-foreground">Início</p>
                    <Input
                      type="datetime-local"
                      value={config.inicioEm}
                      onChange={(event) => setConfig((current) => ({ ...current, inicioEm: event.target.value }))}
                    />
                  </div>
                  <div>
                    <p className="mb-1 text-[11px] text-muted-foreground">Fim</p>
                    <Input
                      type="datetime-local"
                      value={config.fimEm}
                      disabled={config.semDataFinal}
                      min={config.inicioEm || undefined}
                      onChange={(event) => setConfig((current) => ({ ...current, fimEm: event.target.value }))}
                    />
                  </div>
                  <label className="min-h-10 flex items-center gap-2 rounded-md border bg-background px-3 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.semDataFinal}
                      onChange={(event) => setConfig((current) => ({
                        ...current,
                        semDataFinal: event.target.checked,
                        orcamentoTipo: event.target.checked && current.orcamentoTipo === "total" ? "mensal" : current.orcamentoTipo,
                      }))}
                    />
                    Sem data final
                  </label>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">{periodSummary}</p>
              </div>

              <div>
                {fieldLabel("Orçamento", "Este é o limite financeiro. A IA pode mover verba entre canais e anúncios, mas nunca ultrapassar esse limite.")}
                <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_180px] gap-3 max-w-2xl">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      className="pl-10"
                      value={config.orcamentoValor || ""}
                      onChange={(event) => setConfig((current) => ({ ...current, orcamentoValor: Number(event.target.value) || 0 }))}
                      placeholder="0,00"
                    />
                  </div>
                  <select
                    className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={config.orcamentoTipo}
                    onChange={(event) => setConfig((current) => ({ ...current, orcamentoTipo: event.target.value as BudgetType }))}
                  >
                    <option value="total">Total da campanha</option>
                    <option value="diario">Máximo por dia</option>
                    <option value="semanal">Máximo por semana</option>
                    <option value="mensal">Máximo por mês</option>
                  </select>
                </div>
              </div>

              <div className="rounded-lg border bg-background/70 p-3">
                <div className="flex items-start gap-2">
                  <WalletCards className="h-4 w-4 text-primary mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold">Gestão autônoma de mídia pela IA</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                      Canais, públicos, formatos, horários, frequência, testes, remarketing e distribuição da verba são decisões da IA. O orçamento definido acima funciona como limite rígido; a distribuição exibida no plano é dinâmica e pode mudar conforme leads, oportunidades, vendas, receita e margem.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 flex-wrap border-t pt-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  Ao Planejar/Replanejar, estas quatro decisões humanas orientam toda a estratégia da IA.
                </div>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="ghost" onClick={resetConfig} disabled={configuredCount === 0}>
                    <RotateCcw className="h-3.5 w-3.5 mr-1.5" />Limpar
                  </Button>
                  <Button type="button" size="sm" onClick={() => setConfigOpen(false)}>
                    <Check className="h-3.5 w-3.5 mr-1.5" />Usar esta campanha
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <PlanoMidiaCore />
    </div>
  );
}
