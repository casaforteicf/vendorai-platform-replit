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

type PlanWithContext = {
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

export default function PlanoMidia() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const [configOpen, setConfigOpen] = useState(false);
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

      body["configuracao"] = configRef.current;
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
      config.objetivoPrincipal,
      config.produtoServicoPrioritario,
      config.publicoPrioritario,
      config.regiao,
      config.ofertaPrincipal,
      config.observacoes,
      config.canaisPreferidos.length > 0 ? "canais" : "",
    ].filter(Boolean).length;
  }, [config]);

  function toggleChannel(channel: string) {
    setConfig((current) => ({
      ...current,
      canaisPreferidos: current.canaisPreferidos.includes(channel)
        ? current.canaisPreferidos.filter((item) => item !== channel)
        : [...current.canaisPreferidos, channel],
    }));
  }

  return (
    <div className="space-y-4">
      <Card className="border-primary/25 bg-primary/[0.03]">
        <CardContent className="py-4 space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <SlidersHorizontal className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold">Configurar antes de gerar ou replanejar</p>
                {configuredCount > 0 && <Badge variant="outline" className="text-[10px]">{configuredCount} diretriz(es)</Badge>}
              </div>
              <p className="mt-1 text-xs text-muted-foreground max-w-3xl">
                Estes campos são opcionais. Se você não preencher nada, a IA decide automaticamente como hoje. O que for definido aqui passa a orientar o próximo plano e fica salvo junto com ele.
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
              {configOpen ? "Fechar configuração" : "Configurar planejamento"}
            </Button>
          </div>

          {configOpen && (
            <div className="border-t pt-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                <div>
                  {fieldLabel("Objetivo principal do período", "Ex.: gerar leads, vender um lançamento, aumentar recorrência.")}
                  <Input
                    value={config.objetivoPrincipal}
                    onChange={(event) => setConfig((current) => ({ ...current, objetivoPrincipal: event.target.value }))}
                    placeholder="IA decide automaticamente"
                    maxLength={300}
                  />
                </div>
                <div>
                  {fieldLabel("Produto ou serviço prioritário", "A IA continua podendo usar o restante do portfólio quando fizer sentido.")}
                  <Input
                    value={config.produtoServicoPrioritario}
                    onChange={(event) => setConfig((current) => ({ ...current, produtoServicoPrioritario: event.target.value }))}
                    placeholder="Ex.: Plano Pró, consultoria, linha X"
                    maxLength={300}
                  />
                </div>
                <div>
                  {fieldLabel("Público prioritário", "Defina apenas se quiser restringir ou refinar o público já cadastrado.")}
                  <Input
                    value={config.publicoPrioritario}
                    onChange={(event) => setConfig((current) => ({ ...current, publicoPrioritario: event.target.value }))}
                    placeholder="Ex.: PMEs de 10 a 50 funcionários"
                    maxLength={500}
                  />
                </div>
                <div>
                  {fieldLabel("Região / área de atuação", "Serve para segmentação; não obriga a IA a repetir o local em todos os materiais.")}
                  <Input
                    value={config.regiao}
                    onChange={(event) => setConfig((current) => ({ ...current, regiao: event.target.value }))}
                    placeholder="Ex.: Brasil, SC, Chapecó e região"
                    maxLength={250}
                  />
                </div>
                <div className="md:col-span-2">
                  {fieldLabel("Oferta ou CTA principal", "O próximo passo comercial que deve orientar conversão e campanhas.")}
                  <Input
                    value={config.ofertaPrincipal}
                    onChange={(event) => setConfig((current) => ({ ...current, ofertaPrincipal: event.target.value }))}
                    placeholder="Ex.: solicitar demonstração, orçamento, teste grátis"
                    maxLength={500}
                  />
                </div>
              </div>

              <div>
                {fieldLabel("Canais que quero priorizar", "A IA continua responsável por completar o mix necessário para o funil; estes canais recebem prioridade explícita.")}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-7 gap-2">
                  {AVAILABLE_CHANNELS.map((channel) => {
                    const selected = config.canaisPreferidos.includes(channel);
                    return (
                      <button
                        key={channel}
                        type="button"
                        onClick={() => toggleChannel(channel)}
                        className={`min-h-9 rounded-md border px-2 py-1.5 text-xs text-left transition-colors ${selected ? "border-primary bg-primary/10 text-primary" : "bg-background hover:bg-muted"}`}
                      >
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
                {fieldLabel("Observações e restrições para a IA", "Use para registrar nuances do ciclo sem precisar editar campanha por campanha depois.")}
                <textarea
                  className="w-full min-h-24 rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={config.observacoes}
                  onChange={(event) => setConfig((current) => ({ ...current, observacoes: event.target.value }))}
                  placeholder="Ex.: comunicação mais sutil, evitar repetir a cidade em todas as peças, priorizar prova e demonstração, não usar desconto..."
                  maxLength={1500}
                />
              </div>

              <div className="flex items-center justify-between gap-3 flex-wrap border-t pt-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  Ao clicar em Planejar/Replanejar com IA, estas diretrizes serão enviadas automaticamente.
                </div>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="ghost" onClick={() => setConfig(emptyConfig())} disabled={configuredCount === 0}>
                    <RotateCcw className="h-3.5 w-3.5 mr-1.5" />Deixar IA decidir tudo
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

      <PlanoMidiaCore />
    </div>
  );
}
