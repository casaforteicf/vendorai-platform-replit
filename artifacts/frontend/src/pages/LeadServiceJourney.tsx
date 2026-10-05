import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  AlertCircle,
  BrainCircuit,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Loader2,
  RefreshCw,
  Sparkles,
  Target,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import LeadBriefingTab from "./LeadBriefingTab";
import { OportunidadesPrevistasCard } from "@/components/OportunidadesPrevistasCard";

type JourneyItem = {
  checked: boolean;
  note?: string;
};

type JourneyChecklist = Record<string, JourneyItem>;

type IntelligenceFact = {
  id: string;
  kind?: string | null;
  factKey?: string | null;
  value?: unknown;
  confidence?: number | null;
  createdAt?: string | null;
};

type DynamicQuestion = {
  id: string;
  stageKey: string;
  questionText: string;
  objective: string | null;
  status: string;
  confidence: number | null;
};

type IntelligenceResponse = {
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
    confidence: number | null;
    nextBestAction: string | null;
    nextBestActionReason: string | null;
  };
  facts: IntelligenceFact[];
  dynamicQuestions: DynamicQuestion[];
};

type LeadServiceJourneyProps = {
  leadId: string;
  tenantId: string;
  lead: any;
  dealId?: string;
};

type Milestone = {
  key: string;
  label: string;
  factHints: string[];
  description: string;
};

const STAGES: Array<{
  id: string;
  label: string;
  title: string;
  goal: string;
  milestones: Milestone[];
}> = [
  {
    id: "abordagem",
    label: "Abordagem",
    title: "Abordagem inicial",
    goal: "Entender o contexto mínimo, alcançar a pessoa certa e garantir um próximo passo.",
    milestones: [
      { key: "contexto", label: "Contexto conhecido", factHints: ["segment", "empresa", "business", "context", "cargo"], description: "O sistema já sabe o suficiente para evitar uma abordagem genérica." },
      { key: "decisor", label: "Decisor ou influenciador identificado", factHints: ["decisor", "decision", "stakeholder", "influenciador"], description: "Quem decide, influencia ou encaminha a compra." },
      { key: "contato", label: "Contato realizado", factHints: ["contato", "contact", "mensagem", "conversation"], description: "Existe evidência de contato ou conversa." },
      { key: "proximo_passo", label: "Próximo passo definido", factHints: ["next_step", "proximo", "followup", "prazo"], description: "Há compromisso, retorno, reunião ou ação futura definida." },
    ],
  },
  {
    id: "qualificacao",
    label: "Qualificação",
    title: "Qualificação e diagnóstico",
    goal: "Entender dor, impacto, urgência e processo de decisão antes de propor solução.",
    milestones: [
      { key: "dor", label: "Dor prioritária identificada", factHints: ["dor", "pain", "problema", "problem"], description: "Problema relevante confirmado ou inferido com boa evidência." },
      { key: "impacto", label: "Impacto entendido", factHints: ["impacto", "impact", "custo", "receita", "tempo", "risco"], description: "Consequência da dor em tempo, receita, custo, risco ou operação." },
      { key: "necessidade", label: "Necessidade / resultado desejado", factHints: ["need", "necessidade", "objetivo", "goal", "resultado"], description: "O resultado que o cliente espera está claro." },
      { key: "decisao", label: "Processo de decisão conhecido", factHints: ["decision", "decisor", "aprova", "orcamento", "budget", "prazo"], description: "Decisor, critérios, orçamento ou prazo de decisão." },
    ],
  },
  {
    id: "demonstracao",
    label: "Demonstração",
    title: "Demonstração orientada ao resultado",
    goal: "Conectar a solução às dores validadas e capturar percepção real de valor.",
    milestones: [
      { key: "cenario", label: "Cenário prioritário definido", factHints: ["cenario", "use_case", "caso_uso", "fluxo"], description: "O que deve ser demonstrado está ligado ao contexto do lead." },
      { key: "valor", label: "Valor percebido", factHints: ["valor", "value", "beneficio", "benefit", "ganho"], description: "Há sinal claro do ganho percebido pelo cliente." },
      { key: "feedback", label: "Feedback registrado", factHints: ["feedback", "duvida", "ressalva", "objection"], description: "Dúvidas, ressalvas ou reação à demonstração foram capturadas." },
      { key: "proximo_passo", label: "Próximo compromisso", factHints: ["next_step", "proximo", "reuniao", "retorno"], description: "Existe compromisso após a demonstração." },
    ],
  },
  {
    id: "fechamento",
    label: "Negociação",
    title: "Fechamento e negociação",
    goal: "Transformar valor percebido em decisão, tratando objeções e condições sem duplicar registros.",
    milestones: [
      { key: "proposta", label: "Proposta apresentada", factHints: ["proposta", "proposal", "orcamento", "quote"], description: "A proposta está registrada em seu bloco próprio; aqui vemos apenas o estado comercial." },
      { key: "objecoes", label: "Objeções conhecidas", factHints: ["objection", "objecao", "preco", "prazo"], description: "O sistema sabe o que impede a decisão e como isso evoluiu." },
      { key: "condicoes", label: "Condições alinhadas", factHints: ["condicao", "condition", "pagamento", "payment", "prazo"], description: "Condições comerciais relevantes estão claras." },
      { key: "decisao", label: "Decisão ou compromisso", factHints: ["decision", "decisao", "aprovado", "aceite", "commitment"], description: "Existe uma decisão ou uma pendência objetiva." },
    ],
  },
  {
    id: "contrato",
    label: "Contratação",
    title: "Contratação e transição",
    goal: "Formalizar a venda e transferir contexto suficiente para implantação, entrega ou pós-venda.",
    milestones: [
      { key: "aceite", label: "Aceite confirmado", factHints: ["aceite", "accepted", "approval", "aprovado"], description: "O cliente confirmou a contratação." },
      { key: "contrato", label: "Contrato / formalização", factHints: ["contrato", "contract", "assinatura", "signature"], description: "A formalização está registrada." },
      { key: "pagamento", label: "Pagamento / checkout", factHints: ["pagamento", "payment", "checkout", "fatura"], description: "O status financeiro necessário para iniciar está disponível." },
      { key: "handoff", label: "Próximo time contextualizado", factHints: ["handoff", "kickoff", "implantacao", "onboarding"], description: "Implantação, entrega ou pós-venda recebeu o contexto comercial." },
    ],
  },
];

function authHeaders() {
  return {
    Authorization: `Bearer ${localStorage.getItem("vendorai_token")}`,
    "Content-Type": "application/json",
  };
}

async function readJson(response: Response) {
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? "Não foi possível concluir a operação.");
  return data;
}

function normalizeText(value: unknown) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function prettyFactKey(value?: string | null) {
  if (!value) return "Informação";
  return value.replace(/[._-]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function getFactStatus(milestone: Milestone, facts: IntelligenceFact[]) {
  const matches = facts.filter((fact) => {
    const haystack = `${fact.factKey ?? ""} ${fact.kind ?? ""} ${normalizeText(fact.value)}`.toLowerCase();
    return milestone.factHints.some((hint) => haystack.includes(hint.toLowerCase()));
  });
  if (!matches.length) return { state: "missing" as const, fact: null as IntelligenceFact | null };
  const fact = matches.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0];
  if ((fact.confidence ?? 0) >= 80) return { state: "confirmed" as const, fact };
  return { state: "inferred" as const, fact };
}

export default function LeadServiceJourney(props: LeadServiceJourneyProps) {
  const isWorkCenter = typeof window !== "undefined" && window.location.pathname.startsWith("/trabalho/");
  if (isWorkCenter) return null;
  return <LeadServiceJourneyContent {...props} />;
}

function LeadServiceJourneyContent({ leadId, tenantId, lead, dealId }: LeadServiceJourneyProps) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [stageId, setStageId] = useState(STAGES[0].id);
  const [checklist, setChecklist] = useState<JourneyChecklist>({});

  const { data: briefing, isLoading: briefingLoading } = useQuery<any>({
    queryKey: ["lead-briefing", leadId],
    queryFn: () => fetch(`/api/leads/${leadId}/briefing`, { headers: authHeaders() }).then(readJson),
    enabled: !!leadId,
  });

  const { data: intelligence, isLoading: intelligenceLoading } = useQuery<IntelligenceResponse>({
    queryKey: ["customer-intelligence-v2", tenantId, leadId],
    queryFn: () => fetch(`/api/tenants/${tenantId}/leads/${leadId}/intelligence/full`, { headers: authHeaders() }).then(readJson),
    enabled: !!leadId && !!tenantId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!briefing) return;
    setStageId(briefing.journeyStage || STAGES[0].id);
    setChecklist(briefing.journeyChecklist || {});
  }, [briefing]);

  const save = useMutation({
    mutationFn: (next: { journeyStage: string; journeyChecklist: JourneyChecklist }) =>
      fetch(`/api/leads/${leadId}/briefing`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify(next),
      }).then(readJson),
    onSuccess: (data) => qc.setQueryData(["lead-briefing", leadId], data),
    onError: (error: Error) =>
      toast({ title: "Erro ao salvar a jornada", description: error.message, variant: "destructive" }),
  });

  const analyze = useMutation({
    mutationFn: () =>
      fetch(`/api/tenants/${tenantId}/leads/${leadId}/intelligence/analyze`, {
        method: "POST",
        headers: authHeaders(),
      }).then(readJson),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["customer-intelligence-v2", tenantId, leadId] });
      toast({ title: "Inteligência atualizada", description: "O perfil do lead foi enriquecido com as informações disponíveis." });
    },
    onError: (error: Error) =>
      toast({ title: "Não foi possível atualizar agora", description: error.message, variant: "destructive" }),
  });

  const suggestQuestions = useMutation({
    mutationFn: () => {
      if (!dealId) return Promise.resolve({ questions: [] });
      return fetch(`/api/tenants/${tenantId}/leads/${leadId}/deals/${dealId}/intelligence/suggest-stage-questions`, {
        method: "POST",
        headers: authHeaders(),
      }).then(readJson);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["customer-intelligence-v2", tenantId, leadId] });
    },
  });

  const stageIndex = Math.max(0, STAGES.findIndex((item) => item.id === stageId));
  const stage = STAGES[stageIndex];
  const facts = intelligence?.facts ?? [];
  const dynamicQuestions = (intelligence?.dynamicQuestions ?? []).filter((q) => {
    const key = (q.stageKey ?? "").toLowerCase();
    return key === stage.id || key.includes(stage.id) || stage.id.includes(key);
  });

  const milestoneRows = useMemo(
    () =>
      stage.milestones.map((milestone) => {
        const manualKey = `${stage.id}.${milestone.key}`;
        const manual = checklist[manualKey]?.checked === true;
        const auto = getFactStatus(milestone, facts);
        return {
          milestone,
          manualKey,
          state: manual ? ("confirmed" as const) : auto.state,
          fact: auto.fact,
        };
      }),
    [stage, checklist, facts],
  );

  const resolved = milestoneRows.filter((row) => row.state !== "missing").length;
  const readiness = Math.round((resolved / Math.max(1, milestoneRows.length)) * 100);
  const knowledgeScore = Math.min(100, Math.round((facts.length / 12) * 100));
  const nextBestAction =
    intelligence?.health?.nextBestAction ||
    intelligence?.profile?.nextBestAction ||
    dynamicQuestions[0]?.questionText ||
    "Continue enriquecendo o contexto do lead e defina um próximo passo objetivo.";
  const nextBestReason =
    intelligence?.health?.nextBestActionReason ||
    intelligence?.profile?.nextBestActionReason ||
    dynamicQuestions[0]?.objective ||
    "A recomendação usa o contexto já registrado no CRM e na inteligência do lead.";

  const persistStage = (nextStage: string) => {
    setStageId(nextStage);
    save.mutate({ journeyStage: nextStage, journeyChecklist: checklist });
  };

  const confirmMilestone = (key: string, checked: boolean) => {
    const next = { ...checklist, [key]: { ...checklist[key], checked } };
    setChecklist(next);
    save.mutate({ journeyStage: stage.id, journeyChecklist: next });
  };

  const loading = briefingLoading || intelligenceLoading;

  return (
    <Card data-testid="card-service-journey" className="overflow-hidden">
      <CardHeader className="border-b bg-muted/20">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <BrainCircuit className="h-5 w-5 text-primary" />
              Jornada Inteligente
            </CardTitle>
            <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
              O Vendor.ai usa o que já sabe sobre o lead, evita perguntas repetidas e mostra apenas o que ainda importa descobrir ou fazer.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={analyze.isPending}
            onClick={() => analyze.mutate()}
            className="gap-2"
          >
            {analyze.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Atualizar inteligência
          </Button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border bg-background p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Prontidão da etapa</p>
            <p className="mt-1 text-2xl font-semibold">{readiness}%</p>
            <Progress value={readiness} className="mt-2 h-1.5" />
          </div>
          <div className="rounded-lg border bg-background p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Conhecimento do lead</p>
            <p className="mt-1 text-2xl font-semibold">{knowledgeScore}%</p>
            <p className="mt-1 text-xs text-muted-foreground">{facts.length} informações estruturadas</p>
          </div>
          <div className="rounded-lg border bg-background p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Confiança da IA</p>
            <p className="mt-1 text-2xl font-semibold">{intelligence?.health?.confidence ?? "—"}{intelligence?.health?.confidence != null ? "%" : ""}</p>
            <p className="mt-1 text-xs text-muted-foreground">Fatos confirmados têm prioridade sobre inferências.</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 p-4 sm:p-6">
        <div className="grid grid-cols-5 gap-2" aria-label="Etapas da jornada">
          {STAGES.map((item, index) => {
            const active = item.id === stage.id;
            return (
              <button
                key={item.id}
                onClick={() => persistStage(item.id)}
                className={`rounded-lg border p-2 text-center transition-colors ${active ? "border-primary bg-primary/5 text-primary" : "hover:bg-muted/50"}`}
              >
                <span className={`mx-auto flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${active ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  {index + 1}
                </span>
                <span className="mt-1 block truncate text-xs font-medium">{item.label}</span>
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Montando a jornada com o contexto disponível...
          </div>
        ) : (
          <>
            <section className="rounded-xl border p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">Etapa {stageIndex + 1} de {STAGES.length}</p>
                  <h3 className="mt-1 text-lg font-semibold">{stage.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{stage.goal}</p>
                </div>
                <Badge variant="secondary">{resolved}/{stage.milestones.length} marcos</Badge>
              </div>

              <div className="mt-5 space-y-2">
                {milestoneRows.map(({ milestone, manualKey, state, fact }) => (
                  <div key={manualKey} className="rounded-lg border p-3">
                    <div className="flex items-start gap-3">
                      <button
                        aria-label={`Confirmar ${milestone.label}`}
                        onClick={() => confirmMilestone(manualKey, !checklist[manualKey]?.checked)}
                        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${state === "confirmed" ? "border-emerald-600 bg-emerald-600 text-white" : state === "inferred" ? "border-amber-500 bg-amber-50 text-amber-700" : "border-muted-foreground/30 text-muted-foreground"}`}
                      >
                        {state === "confirmed" ? <Check className="h-3.5 w-3.5" /> : state === "inferred" ? <CircleDashed className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium">{milestone.label}</p>
                          {state === "confirmed" && <Badge className="bg-emerald-600 text-[10px]">Confirmado</Badge>}
                          {state === "inferred" && <Badge variant="outline" className="border-amber-300 text-[10px] text-amber-700">Inferido pela IA</Badge>}
                          {state === "missing" && <Badge variant="outline" className="text-[10px]">Falta descobrir</Badge>}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{milestone.description}</p>

                        {fact && (
                          <div className="mt-2 rounded-md bg-muted/45 p-2 text-xs">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-medium">{prettyFactKey(fact.factKey)}</span>
                              {fact.confidence != null && <span className="text-muted-foreground">Confiança {fact.confidence}%</span>}
                            </div>
                            <p className="mt-1 text-muted-foreground">{normalizeText(fact.value)}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-primary/20 bg-primary/[0.03] p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">Próxima melhor ação</p>
                  <p className="mt-1 text-base font-semibold">{nextBestAction}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{nextBestReason}</p>
                  {dealId && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3 gap-2"
                      disabled={suggestQuestions.isPending}
                      onClick={() => suggestQuestions.mutate()}
                    >
                      {suggestQuestions.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />}
                      Atualizar o que falta descobrir
                    </Button>
                  )}
                </div>
              </div>
            </section>

            {dynamicQuestions.length > 0 && (
              <section className="rounded-xl border p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold">O que ainda não sabemos</h4>
                    <p className="mt-1 text-xs text-muted-foreground">Perguntas geradas apenas para lacunas relevantes desta etapa.</p>
                  </div>
                  <Badge variant="outline">{dynamicQuestions.length}</Badge>
                </div>
                <div className="mt-3 space-y-2">
                  {dynamicQuestions.slice(0, 5).map((question) => (
                    <div key={question.id} className="rounded-lg border p-3">
                      <p className="text-sm font-medium">{question.questionText}</p>
                      {question.objective && <p className="mt-1 text-xs text-muted-foreground">{question.objective}</p>}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {facts.length > 0 && (
              <section className="rounded-xl border p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold">Perfil enriquecido do lead</h4>
                    <p className="mt-1 text-xs text-muted-foreground">Informações consolidadas das interações e fontes já disponíveis.</p>
                  </div>
                  <Badge variant="outline">{facts.length} fatos</Badge>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {facts.slice(0, 8).map((fact) => (
                    <div key={fact.id} className="rounded-lg border p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xs font-semibold">{prettyFactKey(fact.factKey)}</p>
                        {fact.confidence != null && <span className="text-[10px] text-muted-foreground">{fact.confidence}% confiança</span>}
                      </div>
                      <p className="mt-1 break-words text-sm text-muted-foreground">{normalizeText(fact.value)}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {stage.id === "fechamento" && (
              <LeadBriefingTab leadId={leadId} tenantId={tenantId} lead={lead} dealId={dealId} roteiroOnly />
            )}

            <OportunidadesPrevistasCard leadId={leadId} />

            <div className="flex items-center justify-between gap-2 border-t pt-4">
              <Button
                variant="outline"
                disabled={stageIndex === 0 || save.isPending}
                onClick={() => persistStage(STAGES[stageIndex - 1].id)}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Voltar
              </Button>
              <Button
                disabled={stageIndex === STAGES.length - 1 || save.isPending}
                onClick={() => persistStage(STAGES[stageIndex + 1].id)}
              >
                Próxima
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
