import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Check, ChevronLeft, ChevronRight, ClipboardCheck, Loader2, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import LeadBriefingTab from "./LeadBriefingTab";
import { OportunidadesPrevistasCard } from "@/components/OportunidadesPrevistasCard";
import { getListActivitiesQueryKey } from "@workspace/api-client-react";

type JourneyItem = { checked: boolean; note?: string };
type JourneyChecklist = Record<string, JourneyItem>;

const STAGES = [
  {
    id: "abordagem",
    label: "Abordagem",
    subtitle: "Primeiro contato",
    title: "Abordagem inicial",
    goal: "Preparar um contato relevante, alcançar o decisor e combinar o próximo passo.",
    guidance: "Pesquise o contexto antes do contato e adapte a mensagem à realidade deste lead.",
    items: [
      ["pesquisa", "Pesquisar o lead", "Registre apenas descobertas novas, não dados já cadastrados."],
      ["pitch", "Preparar abordagem personalizada", "Qual mensagem conecta o contexto do lead à solução?"],
      ["decisor", "Confirmar acesso ao decisor", "Anote somente a estratégia ou impedimento encontrado."],
      ["contato", "Realizar primeiro contato", "Registre o resultado objetivo do contato."],
      ["proximo_passo", "Combinar próximo passo", "Reunião, retorno ou material solicitado."],
    ],
  },
  {
    id: "qualificacao",
    label: "Qualificação",
    subtitle: "Diagnóstico + SPIN",
    title: "Qualificação e diagnóstico",
    goal: "Entender situação, problemas, impacto e valor esperado antes de propor uma solução.",
    guidance: "Registre o diagnóstico direto nos itens abaixo — sem duplicar o cadastro do lead.",
    items: [
      ["processo", "Mapear o processo atual", "O que acontece hoje e onde existe fricção?"],
      ["dores", "Validar dores prioritárias", "Confirme o problema com o cliente."],
      ["impacto", "Quantificar impacto", "Tempo, receita, custo ou risco envolvido."],
      ["decisao", "Entender o processo de decisão", "Critérios, envolvidos e próximos marcos."],
      ["aderencia", "Confirmar aderência", "Por que vale avançar ou interromper?"],
    ],
  },
  {
    id: "demonstracao",
    label: "Demonstração",
    subtitle: "Solução aplicada",
    title: "Demonstração orientada ao resultado",
    goal: "Mostrar como a solução resolve as dores validadas, sem fazer uma apresentação genérica.",
    guidance: "Conecte cada demonstração a uma dor e peça feedback antes de seguir.",
    items: [
      ["abertura", "Revisitar contexto e objetivo", "Alinhe o que será demonstrado."],
      ["cenario", "Demonstrar o cenário prioritário", "Qual fluxo ou resultado foi mostrado?"],
      ["valor", "Evidenciar valor", "Qual ganho ficou claro para o cliente?"],
      ["feedback", "Registrar feedback", "Percepções, dúvidas e ressalvas."],
      ["proximo_passo", "Agendar decisão", "Defina o próximo compromisso."],
    ],
  },
  {
    id: "fechamento",
    label: "Fechamento",
    subtitle: "Negociação",
    title: "Fechamento e negociação",
    goal: "Transformar valor percebido em uma decisão clara, tratando objeções e condições.",
    guidance: "Use as objeções registradas anteriormente e mantenha proposta e orçamento em seus blocos próprios. O Roteiro de Reunião abaixo ajuda a conduzir a negociação.",
    items: [
      ["valor", "Revisitar dor e valor", "Reforce o impacto validado."],
      ["proposta", "Apresentar proposta", "Registre apenas o retorno; a proposta já fica no bloco próprio."],
      ["objecoes", "Tratar objeções", "O que impediu a decisão e como foi respondido?"],
      ["decisao", "Obter decisão ou compromisso", "Aprovado, recusado ou pendência objetiva."],
      ["historico", "Consolidar resultado", "Resumo final da negociação."],
    ],
  },
  {
    id: "contrato",
    label: "Contrato",
    subtitle: "Formalização",
    title: "Contrato e transição",
    goal: "Formalizar a venda e entregar contexto suficiente para implantação e pós-venda.",
    guidance: "Dados jurídicos, documentos e orçamento permanecem nos blocos específicos do lead.",
    items: [
      ["revisao", "Revisar condições acordadas", "Confirme divergências ou ajustes finais."],
      ["assinatura", "Confirmar assinatura", "Registre o status, não repita dados contratuais."],
      ["kickoff", "Combinar kickoff", "Data, responsáveis e objetivo inicial."],
      ["handoff", "Realizar passagem de contexto", "O que CS/implantação precisa saber?"],
      ["boas_vindas", "Enviar boas-vindas", "Confirme o envio e próximos canais."],
    ],
  },
] as const;

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}`, "Content-Type": "application/json" };
}

async function readJson(response: Response) {
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? "Não foi possível salvar a jornada.");
  return data;
}

export default function LeadServiceJourney({ leadId, tenantId, lead, dealId }: { leadId: string; tenantId: string; lead: any; dealId?: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [stageId, setStageId] = useState<string>(STAGES[0].id);
  const [checklist, setChecklist] = useState<JourneyChecklist>({});

  const { data: briefing, isLoading } = useQuery<any>({
    queryKey: ["lead-briefing", leadId],
    queryFn: () => fetch(`/api/leads/${leadId}/briefing`, { headers: authHeaders() }).then(readJson),
    enabled: !!leadId,
  });

  useEffect(() => {
    if (!briefing) return;
    setStageId(briefing.journeyStage || STAGES[0].id);
    setChecklist(briefing.journeyChecklist || {});
  }, [briefing]);

  const save = useMutation({
    mutationFn: (next: { journeyStage: string; journeyChecklist: JourneyChecklist }) =>
      fetch(`/api/leads/${leadId}/briefing`, { method: "PUT", headers: authHeaders(), body: JSON.stringify(next) }).then(readJson),
    onSuccess: data => {
      qc.setQueryData(["lead-briefing", leadId], data);
      toast({ title: "Jornada salva" });
    },
    onError: (error: Error) => toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }),
  });

  // Registra a conclusão da atividade no histórico real do lead (não fica
  // isolado só no checklist) — aparece em Atividades/histórico do lead.
  const logActivity = useMutation({
    mutationFn: (payload: { titulo: string; descricao?: string }) =>
      fetch("/api/activities", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ tenantId, leadId, tipo: "tarefa", status: "concluida", titulo: payload.titulo, descricao: payload.descricao || undefined }),
      }).then(readJson),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: getListActivitiesQueryKey(tenantId, { leadId }) });
    },
  });

  const stageIndex = Math.max(0, STAGES.findIndex(stage => stage.id === stageId));
  const stage = STAGES[stageIndex];
  const stageKeys = useMemo(() => stage.items.map(([key]) => `${stage.id}.${key}`), [stage]);
  const completed = stageKeys.filter(key => checklist[key]?.checked).length;
  const totalCompleted = STAGES.reduce((total, item) => total + item.items.filter(([key]) => checklist[`${item.id}.${key}`]?.checked).length, 0);
  const totalItems = STAGES.reduce((total, item) => total + item.items.length, 0);

  const persist = (nextStage: string, nextChecklist: JourneyChecklist) => {
    setStageId(nextStage);
    setChecklist(nextChecklist);
    save.mutate({ journeyStage: nextStage, journeyChecklist: nextChecklist });
  };

  const updateItem = (key: string, patch: Partial<JourneyItem>) => {
    const next = { ...checklist, [key]: { checked: false, ...checklist[key], ...patch } };
    setChecklist(next);
  };

  return (
    <Card data-testid="card-service-journey" className="overflow-hidden">
      <CardHeader className="border-b bg-muted/20">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><ClipboardCheck className="h-5 w-5 text-primary" /> Jornada de Atendimento</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Playbook operacional do atendimento, sem repetir os dados já cadastrados do lead.</p>
          </div>
          <Badge variant="outline">{totalCompleted} de {totalItems} concluídos</Badge>
        </div>
        <Progress value={(totalCompleted / totalItems) * 100} className="mt-3 h-2" />
      </CardHeader>
      <CardContent className="space-y-5 p-4 sm:p-6">
        <div className="grid grid-cols-5 gap-2" aria-label="Etapas da jornada">
          {STAGES.map((item, index) => {
            const done = item.items.every(([key]) => checklist[`${item.id}.${key}`]?.checked);
            const active = item.id === stage.id;
            return (
              <button key={item.id} onClick={() => persist(item.id, checklist)} className={`rounded-lg border p-2 text-center transition-colors ${active ? "border-primary bg-primary/5 text-primary" : "hover:bg-muted/50"}`}>
                <span className={`mx-auto flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${done ? "bg-emerald-600 text-white" : active ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{done ? <Check className="h-4 w-4" /> : index + 1}</span>
                <span className="mt-1 block truncate text-xs font-medium">{item.label}</span>
                <span className="hidden text-[10px] text-muted-foreground sm:block">{item.subtitle}</span>
              </button>
            );
          })}
        </div>

        {isLoading ? <div className="flex items-center justify-center py-12 text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando jornada...</div> : <>
          <div className="rounded-xl border p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><p className="text-xs font-semibold uppercase tracking-wide text-primary">Etapa {stageIndex + 1} de {STAGES.length}</p><h3 className="mt-1 text-lg font-semibold">{stage.title}</h3></div>
              <Badge variant="secondary">{completed}/{stage.items.length}</Badge>
            </div>
            <div className="mt-4 rounded-lg border border-primary/15 bg-primary/5 p-3"><p className="text-sm font-medium">Objetivo</p><p className="mt-1 text-sm text-muted-foreground">{stage.goal}</p></div>
            <p className="mt-3 text-xs text-muted-foreground">{stage.guidance}</p>

            <div className="mt-5 space-y-2">
              {stage.items.map(([itemKey, label, hint]) => {
                const key = `${stage.id}.${itemKey}`;
                const value = checklist[key] || { checked: false, note: "" };
                return <div key={key} className={`rounded-lg border p-3 transition-colors ${value.checked ? "border-emerald-200 bg-emerald-50/50" : ""}`}>
                  <div className="flex items-start gap-3">
                    <button aria-label={`Concluir ${label}`} onClick={() => { const willComplete = !value.checked; const next = { ...checklist, [key]: { ...value, checked: willComplete } }; persist(stage.id, next); if (willComplete) logActivity.mutate({ titulo: label, descricao: value.note || undefined }); }} className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${value.checked ? "border-emerald-600 bg-emerald-600 text-white" : "border-muted-foreground/40"}`}>{value.checked && <Check className="h-3.5 w-3.5" />}</button>
                    <div className="min-w-0 flex-1"><p className="text-sm font-medium">{label}</p><p className="text-xs text-muted-foreground">{hint}</p>
                      <Input className="mt-2 h-8 text-xs" value={value.note || ""} placeholder="Anotação específica desta etapa (opcional)" onChange={event => updateItem(key, { note: event.target.value })} onBlur={() => save.mutate({ journeyStage: stage.id, journeyChecklist: checklist })} />
                    </div>
                  </div>
                </div>;
              })}
            </div>
          </div>

          {stage.id === "fechamento" && <LeadBriefingTab leadId={leadId} tenantId={tenantId} lead={lead} dealId={dealId} roteiroOnly />}
          <OportunidadesPrevistasCard leadId={leadId} />

          <div className="flex items-center justify-between gap-2 border-t pt-4">
            <Button variant="outline" disabled={stageIndex === 0 || save.isPending} onClick={() => persist(STAGES[stageIndex - 1].id, checklist)}><ChevronLeft className="mr-1 h-4 w-4" /> Voltar</Button>
            <Button variant="outline" disabled={save.isPending} onClick={() => save.mutate({ journeyStage: stage.id, journeyChecklist: checklist })}>{save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Salvar</Button>
            <Button disabled={stageIndex === STAGES.length - 1 || save.isPending} onClick={() => persist(STAGES[stageIndex + 1].id, checklist)}>Próxima <ChevronRight className="ml-1 h-4 w-4" /></Button>
          </div>
        </>}
      </CardContent>
    </Card>
  );
}
