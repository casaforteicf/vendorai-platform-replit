import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BrainCircuit, Sparkles } from "lucide-react";

export type FullIntelligenceResponse = {
  profile: null | {
    journeyStage?: string | null;
    intentAnalysis?: string | null;
    goalAnalysis?: string | null;
    opportunities?: string[] | null;
    nextBestAction?: string | null;
    nextBestActionReason?: string | null;
    lastAnalyzedAt?: string | null;
  };
  health: null | {
    score: number | null;
    status: "saudavel" | "atencao" | "alto_risco" | "critico" | null;
    riskType: string | null;
    riskLevel: string | null;
    trend: "melhorando" | "estavel" | "piorando" | null;
    confidence: number | null;
    dimensions: Record<string, number>;
    positiveSignals: Array<Record<string, unknown>>;
    negativeSignals: Array<Record<string, unknown>>;
    riskFactors: Array<Record<string, unknown>>;
    riskEvents: Array<Record<string, unknown>>;
    nextBestAction: string | null;
    nextBestActionReason: string | null;
  };
  dynamicQuestions: Array<{
    id: string;
    stageKey: string;
    questionText: string;
    objective: string | null;
    status: string;
    confidence: number | null;
  }>;
  events: Array<{ id: string; eventType?: string | null; title?: string | null; summary?: string | null; sourceModule?: string | null; occurredAt?: string | null; createdAt?: string | null }>;
  facts: Array<{ id: string; kind?: string | null; factKey?: string | null; value?: unknown; confidence?: number | null; createdAt?: string | null }>;
  snapshots: Array<{ id: string; healthScore?: number | null; riskType?: string | null; riskLevel?: string | null; riskTrend?: string | null; analysisConfidence?: number | null; createdAt?: string | null }>;
  sources: Array<{ id: string; sourceType?: string | null; sourceModule?: string | null; title?: string | null; sourceUrl?: string | null; capturedAt?: string | null }>;
};

function formatIntelligenceDate(value?: string | null) {
  if (!value) return "Data não informada";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data não informada";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function displayFactValue(value: unknown) {
  if (value == null) return "Sem valor";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try { return JSON.stringify(value); } catch { return "Informação estruturada"; }
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fullIntelligence?: FullIntelligenceResponse;
  currentStageLabel?: string;
};

export default function LeadIntelligenceDialog({ open, onOpenChange, fullIntelligence, currentStageLabel }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-5xl overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="flex items-center gap-2"><BrainCircuit className="h-5 w-5 text-primary" />Inteligência completa do cliente</DialogTitle>
          <DialogDescription>Histórico, perfil, saúde, oportunidades e fontes que sustentam as análises do Vendi.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[74vh] overflow-y-auto px-6 pb-6">
          <Tabs defaultValue="resumo" className="pt-4">
            <TabsList className="grid h-auto w-full grid-cols-3 gap-1 sm:grid-cols-6">
              <TabsTrigger value="resumo">Resumo</TabsTrigger>
              <TabsTrigger value="historico">Histórico</TabsTrigger>
              <TabsTrigger value="perfil">Perfil</TabsTrigger>
              <TabsTrigger value="saude">Saúde</TabsTrigger>
              <TabsTrigger value="oportunidades">Oportunidades</TabsTrigger>
              <TabsTrigger value="fontes">Fontes</TabsTrigger>
            </TabsList>

            <TabsContent value="resumo" className="mt-4 space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <Card><CardContent className="p-4"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Saúde</p><p className="mt-1 text-2xl font-semibold">{fullIntelligence?.health?.score ?? "—"}{fullIntelligence?.health?.score != null ? "/100" : ""}</p><p className="text-xs text-muted-foreground">{fullIntelligence?.health?.status?.replace(/_/g, " ") ?? "Sem análise"}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Risco principal</p><p className="mt-1 text-sm font-semibold">{fullIntelligence?.health?.riskType?.replace(/_/g, " ") ?? "Nenhum identificado"}</p><p className="text-xs text-muted-foreground">{fullIntelligence?.health?.riskLevel ? "Nível " + fullIntelligence.health.riskLevel : "Sem nível calculado"}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Confiança</p><p className="mt-1 text-2xl font-semibold">{fullIntelligence?.health?.confidence ?? "—"}{fullIntelligence?.health?.confidence != null ? "%" : ""}</p><p className="text-xs text-muted-foreground">{fullIntelligence?.health?.trend ? "Tendência: " + fullIntelligence.health.trend : "Tendência não calculada"}</p></CardContent></Card>
              </div>
              <Card><CardContent className="p-4"><p className="text-xs font-semibold">Próxima melhor ação</p><p className="mt-2 text-sm">{fullIntelligence?.health?.nextBestAction ?? "Ainda não há uma ação recomendada."}</p>{fullIntelligence?.health?.nextBestActionReason && <p className="mt-1 text-xs text-muted-foreground">{fullIntelligence.health.nextBestActionReason}</p>}</CardContent></Card>
              <div className="grid gap-3 md:grid-cols-2">
                <Card><CardContent className="p-4"><p className="text-xs font-semibold">Intenção atual</p><p className="mt-2 text-sm text-muted-foreground">{fullIntelligence?.profile?.intentAnalysis ?? "Ainda não identificada."}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs font-semibold">Objetivo identificado</p><p className="mt-2 text-sm text-muted-foreground">{fullIntelligence?.profile?.goalAnalysis ?? "Ainda não identificado."}</p></CardContent></Card>
              </div>
            </TabsContent>

            <TabsContent value="historico" className="mt-4">
              <div className="space-y-2">
                {(fullIntelligence?.events ?? []).length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Ainda não há eventos no Histórico Inteligente.</p>}
                {(fullIntelligence?.events ?? []).map((event) => (
                  <div key={event.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div><p className="text-sm font-medium">{event.title ?? event.eventType ?? "Evento"}</p>{event.summary && <p className="mt-1 text-xs text-muted-foreground">{event.summary}</p>}</div>
                      <span className="text-[11px] text-muted-foreground">{formatIntelligenceDate(event.occurredAt ?? event.createdAt)}</span>
                    </div>
                    {event.sourceModule && <p className="mt-2 text-[10px] uppercase tracking-wide text-muted-foreground">Fonte: {event.sourceModule}</p>}
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="perfil" className="mt-4 space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <Card><CardContent className="p-4"><p className="text-xs font-semibold">Jornada</p><p className="mt-2 text-sm text-muted-foreground">{fullIntelligence?.profile?.journeyStage ?? currentStageLabel ?? "Não identificada"}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs font-semibold">Última análise</p><p className="mt-2 text-sm text-muted-foreground">{formatIntelligenceDate(fullIntelligence?.profile?.lastAnalyzedAt)}</p></CardContent></Card>
              </div>
              <div className="space-y-2">
                {(fullIntelligence?.facts ?? []).length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Ainda não há conhecimentos estruturados.</p>}
                {(fullIntelligence?.facts ?? []).map((fact) => (
                  <div key={fact.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className="text-[10px]">{fact.kind?.replace(/_/g, " ") ?? "informação"}</Badge><p className="text-xs font-semibold">{fact.factKey?.replace(/[._]/g, " ") ?? "Conhecimento"}</p>{fact.confidence != null && <span className="text-[10px] text-muted-foreground">Confiança {fact.confidence}%</span>}</div>
                    <p className="mt-2 break-words text-sm text-muted-foreground">{displayFactValue(fact.value)}</p>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="saude" className="mt-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(fullIntelligence?.health?.dimensions ?? {}).map(([key, value]) => (
                  <Card key={key}><CardContent className="p-4"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">{key.replace(/_/g, " ")}</p><p className="mt-1 text-xl font-semibold">{value}/100</p></CardContent></Card>
                ))}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <Card><CardContent className="p-4"><p className="text-xs font-semibold">Sinais positivos</p><div className="mt-2 space-y-2">{(fullIntelligence?.health?.positiveSignals ?? []).map((item, index) => <p key={index} className="text-sm text-muted-foreground">• {String(item.sinal ?? item.evidencia ?? "Sinal positivo")}</p>)}</div></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs font-semibold">Fatores de risco</p><div className="mt-2 space-y-2">{(fullIntelligence?.health?.riskFactors ?? []).map((item, index) => <p key={index} className="text-sm text-muted-foreground">• {String(item.fator ?? item.motivo ?? "Fator de risco")}</p>)}</div></CardContent></Card>
              </div>
              <Card><CardContent className="p-4"><p className="text-xs font-semibold">Evolução das análises</p><div className="mt-3 space-y-2">{(fullIntelligence?.snapshots ?? []).slice(0, 12).map((snapshot) => <div key={snapshot.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-2 last:border-0"><span className="text-xs">{formatIntelligenceDate(snapshot.createdAt)}</span><span className="text-xs text-muted-foreground">Saúde {snapshot.healthScore ?? "—"} · {snapshot.riskType?.replace(/_/g, " ") ?? "sem risco"} · {snapshot.riskTrend ?? "estável"}</span></div>)}</div></CardContent></Card>
            </TabsContent>

            <TabsContent value="oportunidades" className="mt-4">
              <div className="space-y-2">
                {(fullIntelligence?.profile?.opportunities ?? []).length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma oportunidade adicional identificada até agora.</p>}
                {(fullIntelligence?.profile?.opportunities ?? []).map((opportunity, index) => <div key={index} className="flex items-start gap-2 rounded-lg border p-3"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><p className="text-sm">{opportunity}</p></div>)}
              </div>
            </TabsContent>

            <TabsContent value="fontes" className="mt-4">
              <div className="space-y-2">
                {(fullIntelligence?.sources ?? []).length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Ainda não há fontes registradas.</p>}
                {(fullIntelligence?.sources ?? []).map((source) => (
                  <div key={source.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-medium">{source.title ?? source.sourceType ?? "Fonte"}</p><p className="mt-1 text-xs text-muted-foreground">{source.sourceModule ?? "origem não informada"} · {source.sourceType ?? "tipo não informado"}</p></div><span className="text-[11px] text-muted-foreground">{formatIntelligenceDate(source.capturedAt)}</span></div>
                    {source.sourceUrl && <p className="mt-2 break-all text-xs text-primary">{source.sourceUrl}</p>}
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
