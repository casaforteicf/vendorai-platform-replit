import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Building2, Info, MapPin, Radar, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProspectorNavigationTarget } from "./ProspectorOverview";

type ExternalSignalType = "competitor" | "supplier" | "regional" | "sectoral" | "market";

type JarvisCase = {
  id: string;
  source: string;
  category: string;
  severity: "opportunity" | "attention" | "risk";
  title: string;
  detail: string;
  confidence?: number | null;
  recommendedAction?: string | null;
  status?: string | null;
  firstDetectedAt?: string | null;
  lastDetectedAt?: string | null;
  updatedAt: string;
  evidence?: {
    signalType?: unknown;
    matchedCompetitors?: unknown;
    matchedSuppliers?: unknown;
    matchedRegions?: unknown;
    matchedTerms?: unknown;
    rationale?: unknown;
  } | null;
};

type ProspectorConfig = {
  setor?: string | null;
  cidade?: string | null;
  ritmoDiario?: number | null;
  ativo?: boolean | null;
  horarioCron?: string | null;
  cnaeAlvo?: string[] | null;
};

type Props = {
  onNavigate: (target: ProspectorNavigationTarget) => void;
  compact?: boolean;
};

const GENERIC_TERMS = new Set([
  "sistema", "sistemas", "plataforma", "plataformas", "solucao", "solucoes",
  "tecnologia", "tecnologias", "digital", "digitais", "comercial", "empresa", "empresas",
]);

function authHeaders() {
  const token = localStorage.getItem("vendorai_token") ?? "";
  return { Authorization: `Bearer ${token}` };
}

function textArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
    : [];
}

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalized(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function meaningfulTerms(value: unknown) {
  return textArray(value).filter((term) => !GENERIC_TERMS.has(normalized(term)));
}

function typeOfSignal(value: unknown): ExternalSignalType {
  return value === "competitor" || value === "supplier" || value === "regional" || value === "sectoral" || value === "market"
    ? value
    : "market";
}

function typeLabel(value: ExternalSignalType) {
  if (value === "competitor") return "Concorrente";
  if (value === "supplier") return "Fornecedor";
  if (value === "regional") return "Regional";
  if (value === "sectoral") return "Setorial";
  return "Mercado";
}

function isExternalCase(item: JarvisCase) {
  const source = String(item.source ?? "").toLowerCase();
  return source.startsWith("news") || source.includes("noticia") || source.includes("mercado_externo");
}

function isFresh(item: JarvisCase, hours = 48) {
  const raw = item.lastDetectedAt ?? item.updatedAt;
  const timestamp = new Date(raw).getTime();
  if (!Number.isFinite(timestamp)) return false;
  return Date.now() - timestamp <= hours * 60 * 60 * 1000;
}

function isProspectingSignal(item: JarvisCase) {
  if (item.status && item.status !== "open") return false;
  if (item.severity !== "opportunity") return false;

  const source = String(item.source ?? "").toLowerCase();
  const category = normalized(item.category ?? "");

  // O observador interno só entra na prospecção quando apontar crescimento
  // territorial ou oportunidade comercial suficientemente forte.
  if (source === "strategic_observer") {
    return (category === "territorio" || category === "prospeccao") && (item.confidence ?? 0) >= 75;
  }

  if (!isExternalCase(item) || !isFresh(item)) return false;
  if ((item.confidence ?? 0) < 75) return false;

  const competitors = textArray(item.evidence?.matchedCompetitors);
  const suppliers = textArray(item.evidence?.matchedSuppliers);
  const regions = textArray(item.evidence?.matchedRegions);
  const terms = meaningfulTerms(item.evidence?.matchedTerms);
  const signalType = typeOfSignal(item.evidence?.signalType);

  if (competitors.length || suppliers.length) return true;
  if (signalType === "regional" && regions.length > 0 && terms.length >= 1) return true;
  if (signalType === "sectoral" && terms.length >= 3) return true;
  return false;
}

function priorityLabel(item: JarvisCase) {
  if ((item.confidence ?? 0) >= 85) return "Agir agora";
  return "Acompanhar";
}

function buildContext(item: JarvisCase) {
  const competitors = textArray(item.evidence?.matchedCompetitors);
  const suppliers = textArray(item.evidence?.matchedSuppliers);
  const regions = textArray(item.evidence?.matchedRegions);
  const terms = meaningfulTerms(item.evidence?.matchedTerms);
  const rationale = textValue(item.evidence?.rationale);

  return {
    competitors,
    suppliers,
    regions,
    terms,
    rationale,
    primaryRegion: regions[0] ?? null,
    primaryTerm: terms[0] ?? null,
  };
}

function friendlyReason(item: JarvisCase) {
  const context = buildContext(item);
  if (context.competitors.length) return `Movimento de concorrente conhecido: ${context.competitors.slice(0, 2).join(", ")}.`;
  if (context.suppliers.length) return `Movimento de fornecedor relacionado ao seu negócio: ${context.suppliers.slice(0, 2).join(", ")}.`;
  if (context.regions.length) return `Sinal detectado em região realmente acompanhada: ${context.regions.slice(0, 2).join(", ")}.`;
  if (normalized(item.category) === "territorio") return "O JARVIS encontrou potencial territorial nos dados comerciais atuais da empresa.";
  return "Oportunidade validada pelo contexto comercial da empresa.";
}

export default function JarvisProspectingSignals({ onNavigate, compact = false }: Props) {
  const signalsQuery = useQuery({
    queryKey: ["jarvis-prospector-signals"],
    queryFn: async () => {
      const response = await fetch("/api/jarvis/cases", { headers: authHeaders(), cache: "no-store" });
      if (!response.ok) throw new Error("Falha ao carregar sinais do JARVIS");
      return response.json() as Promise<JarvisCase[]>;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const configQuery = useQuery({
    queryKey: ["jarvis-prospector-config"],
    queryFn: async () => {
      const response = await fetch("/api/prospector/config", { headers: authHeaders(), cache: "no-store" });
      if (!response.ok) throw new Error("Falha ao carregar configuração do Prospector");
      return response.json() as Promise<ProspectorConfig | null>;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const config = configQuery.data ?? null;
  const active = config?.ativo === true;

  const prospectingCases = useMemo(
    () => Array.isArray(signalsQuery.data) ? signalsQuery.data.filter(isProspectingSignal) : [],
    [signalsQuery.data],
  );

  const items = useMemo(() => {
    return [...prospectingCases]
      .sort((a, b) => {
        const confidenceDelta = (b.confidence ?? 0) - (a.confidence ?? 0);
        if (confidenceDelta !== 0) return confidenceDelta;
        return new Date(b.lastDetectedAt ?? b.updatedAt).getTime() - new Date(a.lastDetectedAt ?? a.updatedAt).getTime();
      })
      .slice(0, compact ? 1 : 3);
  }, [compact, prospectingCases]);

  const summary = useMemo(() => ({
    now: prospectingCases.filter((item) => (item.confidence ?? 0) >= 85).length,
    follow: prospectingCases.filter((item) => (item.confidence ?? 0) < 85).length,
  }), [prospectingCases]);

  function prospect(item: JarvisCase) {
    const context = buildContext(item);
    const url = new URL(window.location.href);
    url.searchParams.set("jarvisCase", item.id);
    if (context.primaryRegion) url.searchParams.set("jarvisRegion", context.primaryRegion);
    else if (config?.cidade) url.searchParams.set("jarvisRegion", config.cidade);
    else url.searchParams.delete("jarvisRegion");
    if (context.primaryTerm) url.searchParams.set("jarvisTerm", context.primaryTerm);
    else if (config?.setor) url.searchParams.set("jarvisTerm", config.setor);
    else url.searchParams.delete("jarvisTerm");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    onNavigate({ mode: "empresas", tab: "busca" });
  }

  if (signalsQuery.isLoading && configQuery.isLoading) return null;

  return (
    <div className="mx-auto max-w-6xl">
      <Card className="border-primary/20 bg-primary/[0.02] shadow-sm">
        <CardHeader className="space-y-3 pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                <Radar className="h-4 w-4 text-primary" /> JARVIS — Prospecção
                <Badge variant={active ? "secondary" : "outline"}>{active ? "Ativa" : "Pausada"}</Badge>
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {active
                  ? "O Prospector está buscando e qualificando empresas automaticamente. Notícias genéricas não viram oportunidade."
                  : "A prospecção automática está pausada. Você ainda pode pesquisar empresas manualmente."}
              </p>
            </div>

            {!compact && (
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                {summary.now > 0 && <Badge variant="secondary">Agir agora {summary.now}</Badge>}
                {summary.follow > 0 && <Badge variant="outline">Acompanhar {summary.follow}</Badge>}
              </div>
            )}
          </div>

          {!compact && config && (
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-lg border bg-background px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Alvo atual</p>
                <p className="mt-0.5 text-xs font-semibold">{config.setor || "Não definido"}</p>
              </div>
              <div className="rounded-lg border bg-background px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Região</p>
                <p className="mt-0.5 text-xs font-semibold">{config.cidade || "Não definida"}</p>
              </div>
              <div className="rounded-lg border bg-background px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Ritmo</p>
                <p className="mt-0.5 text-xs font-semibold">{config.ritmoDiario ?? 0} empresas/dia</p>
              </div>
            </div>
          )}
        </CardHeader>

        <CardContent className="space-y-2.5">
          {items.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-background p-4">
              <p className="text-sm font-medium">{active ? "JARVIS está procurando novas oportunidades" : "Nenhuma prospecção automática em execução"}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {active
                  ? "Só aparecerão aqui empresas ou sinais comerciais que passarem pelos critérios de segmento, região e compatibilidade. Isso evita repetir notícias antigas ou falsos positivos."
                  : "Ative a configuração do Prospector para o JARVIS buscar novos leads automaticamente."}
              </p>
            </div>
          ) : items.map((item) => {
            const context = buildContext(item);
            const signalType = typeOfSignal(item.evidence?.signalType);
            const primaryEntity = context.competitors[0] ?? context.suppliers[0] ?? null;

            return (
              <div key={item.id} className="rounded-xl border bg-background p-3.5 transition-shadow hover:shadow-sm">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{priorityLabel(item)}</Badge>
                      {isExternalCase(item) && <Badge variant="outline">{typeLabel(signalType)}</Badge>}
                      {item.confidence != null && (
                        <span className="text-[11px] font-medium text-muted-foreground">Compatibilidade {item.confidence}%</span>
                      )}
                    </div>

                    <p className="mt-2 text-sm font-semibold leading-5">{item.title}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.detail}</p>

                    {(context.regions.length > 0 || primaryEntity) && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {context.regions.slice(0, 1).map((region) => (
                          <span key={region} className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3" />{region}
                          </span>
                        ))}
                        {primaryEntity && <Badge variant="outline">{primaryEntity}</Badge>}
                      </div>
                    )}

                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      <div className="rounded-lg bg-muted/35 px-3 py-2">
                        <p className="text-[11px] font-semibold text-foreground">Por que isso interessa</p>
                        <p className="mt-0.5 text-xs leading-4 text-muted-foreground">{friendlyReason(item)}</p>
                      </div>
                      <div className="rounded-lg bg-muted/35 px-3 py-2">
                        <p className="text-[11px] font-semibold text-foreground">JARVIS recomenda</p>
                        <p className="mt-0.5 line-clamp-2 text-xs leading-4 text-muted-foreground">
                          {item.recommendedAction || "Abrir no Prospector, validar a empresa e enriquecer os contatos antes de enviar ao CRM."}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2 lg:flex-col lg:items-stretch">
                    <Button size="sm" onClick={() => prospect(item)}>
                      <Building2 className="mr-1.5 h-3.5 w-3.5" /> Ver oportunidade
                      <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground"
                      onClick={() => window.dispatchEvent(new CustomEvent("vendorai:open-support", {
                        detail: { question: `JARVIS, analise a oportunidade ${item.id}, valide se é um bom prospect e recomende a próxima ação comercial.` },
                      }))}
                    >
                      <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Perguntar ao JARVIS
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}

          <div className="flex items-start gap-2 px-1 pt-1 text-[11px] leading-4 text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>JARVIS encontra e prioriza. O Prospector valida e enriquece. O CRM recebe somente o que realmente virar oportunidade comercial.</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
