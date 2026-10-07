import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUpdatePipelineStage, getListPipelineStagesQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { CheckCircle2, Circle, ClipboardList, Settings2, Plus, X, Loader2 } from "lucide-react";

type Pergunta = {
  id: string;
  texto: string;
  obrigatoria?: boolean;
  iaPodeResponder?: boolean;
  exigeConfirmacaoHumana?: boolean;
  geraAtividade?: boolean;
  campoDestino?: string | null;
  objetivo?: string | null;
  tipo?: "texto" | "sim_nao" | "numero" | "data" | "opcoes";
  ordem?: number;
};
type FollowupConfig = {
  ativo?: boolean;
  objetivo?: string;
  modo?: "automatico" | "gerar_aprovar" | "somente_sugestao";
  atrasoInicialMinutos?: number;
  intervaloMinimoMinutos?: number;
  maxTentativas?: number;
  pararAoResponder?: boolean;
  priorizarLacunasDaEtapa?: boolean;
  priorizarRiscoAtual?: boolean;
};

type Stage = {
  id: string;
  key: string;
  label: string;
  perguntas?: Pergunta[] | null;
  acompanhamentoConfig?: FollowupConfig | null;
};

const DEFAULT_QUALIFICATION_QUESTIONS: Pergunta[] = [
  { id: "perfil_cliente", texto: "Quem é o cliente/usuário e qual é o papel dele na decisão?", obrigatoria: true, campoDestino: "qualification.profile", objetivo: "Identificar quem usa, influencia e decide." },
  { id: "necessidade", texto: "Qual necessidade, problema ou resultado o cliente quer resolver?", obrigatoria: true, campoDestino: "qualification.need", objetivo: "Definir claramente o que deve orientar a solução e o orçamento." },
  { id: "contexto_projeto", texto: "Qual é o contexto do pedido/projeto (tipo, local e etapa atual)?", obrigatoria: true, campoDestino: "qualification.context", objetivo: "Dar contexto técnico e comercial para a solução." },
  { id: "especificacoes", texto: "Quais medidas, quantidades, modelos, materiais ou especificações já são conhecidas?", obrigatoria: false, campoDestino: "qualification.specifications", objetivo: "Evitar orçamento genérico ou tecnicamente incompleto." },
  { id: "faixa_investimento", texto: "Existe faixa de investimento ou orçamento previsto?", obrigatoria: false, campoDestino: "qualification.budget", objetivo: "Alinhar escopo e solução à capacidade de investimento." },
  { id: "prazo", texto: "Qual é o prazo desejado ou a data limite?", obrigatoria: false, campoDestino: "qualification.timeline", objetivo: "Dimensionar urgência, entrega e próximos passos." },
  { id: "decisao", texto: "Quem aprova e quais critérios serão usados para decidir?", obrigatoria: true, campoDestino: "qualification.decision", objetivo: "Mapear decisor, critérios e processo de aprovação." },
  { id: "restricoes", texto: "Há restrições, observações ou informações que o orçamento precisa considerar?", obrigatoria: false, campoDestino: "qualification.constraints", objetivo: "Preservar condições importantes na proposta." },
];

function slug(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").slice(0, 30) || "pergunta";
}

export function StageQuestionsPanel({
  tenantId,
  stage,
  answers,
  onSaveAnswers,
  saving,
}: {
  tenantId: string;
  stage: Stage | undefined;
  answers: Record<string, string>;
  onSaveAnswers: (next: Record<string, string>) => void;
  saving?: boolean;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { isEffectiveAdmin } = useAuth();
  const updateStage = useUpdatePipelineStage();

  const [draft, setDraft] = useState<Record<string, string>>(answers);
  useEffect(() => { setDraft(answers); }, [stage?.id, answers]);

  const [editing, setEditing] = useState(false);
  const [editList, setEditList] = useState<Pergunta[]>(stage?.perguntas ?? []);
  useEffect(() => { setEditList(stage?.perguntas ?? []); }, [stage?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [newQuestion, setNewQuestion] = useState("");
  const [followupConfig, setFollowupConfig] = useState<FollowupConfig>(stage?.acompanhamentoConfig ?? {});
  useEffect(() => { setFollowupConfig(stage?.acompanhamentoConfig ?? {}); }, [stage?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isEffectiveAdmin && editing) setEditing(false);
  }, [isEffectiveAdmin, editing]);

  if (!stage) return null;
  const perguntas = stage.perguntas?.length
    ? stage.perguntas
    : stage.key === "qualificado"
      ? DEFAULT_QUALIFICATION_QUESTIONS
      : [];
  const answeredCount = perguntas.filter((p) => draft[p.id]?.trim()).length;

  function saveQuestionSet() {
    if (!isEffectiveAdmin) {
      toast({ title: "Apenas administradores podem configurar o modelo da etapa.", variant: "destructive" });
      setEditing(false);
      return;
    }
    updateStage.mutate(
      { tenantId, id: stage.id, data: { perguntas: editList, acompanhamentoConfig: followupConfig } as any },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListPipelineStagesQueryKey(tenantId) });
          toast({ title: "Perguntas da etapa atualizadas." });
          setEditing(false);
        },
        onError: () => toast({ title: "Erro ao salvar perguntas", variant: "destructive" }),
      },
    );
  }

  if (!editing && perguntas.length === 0) {
    return (
      <Card data-testid="card-stage-questions" className="border-border/70 shadow-sm">
        <CardContent className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="rounded-md bg-muted p-1.5"><ClipboardList className="h-4 w-4 text-muted-foreground" /></div>
            <div className="min-w-0">
              <p className="text-sm font-medium">{stage.label}</p>
              <p className="truncate text-xs text-muted-foreground">Sem perguntas obrigatórias nesta etapa.</p>
            </div>
          </div>
          {isEffectiveAdmin && (
            <Button size="sm" variant="ghost" className="h-7 w-fit shrink-0 gap-1 px-2 text-xs text-muted-foreground" onClick={() => setEditing(true)}>
              <Settings2 className="h-3.5 w-3.5" />
              Configurar modelo da etapa
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-stage-questions" className="border-border/70 shadow-sm">
      <CardHeader className="px-4 pb-2 pt-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex flex-wrap items-center gap-2 text-sm font-semibold">
              <ClipboardList className="h-4 w-4 text-primary" />
              <span>{stage.key === "qualificado" ? "Qualificação do negócio" : "Perguntas da etapa"}</span>
              {perguntas.length > 0 && (
                <Badge variant={answeredCount === perguntas.length ? "outline" : "secondary"} className="h-5 px-1.5 text-[11px]">
                  {answeredCount}/{perguntas.length}
                </Badge>
              )}
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {stage.key === "qualificado" ? "Necessidade, contexto, especificações, investimento, prazo e decisão do negócio. Os dados cadastrais das pessoas e empresas são coletados no cadastro." : `${stage.label} · registre somente o que ajuda a conduzir o próximo passo.`}
            </p>
          </div>
          {isEffectiveAdmin && (
            <Button size="sm" variant="ghost" className="h-7 shrink-0 gap-1 px-2 text-xs text-muted-foreground" onClick={() => setEditing((v) => !v)}>
              <Settings2 className="h-3.5 w-3.5" />
              Configurar modelo da etapa
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-3 pt-1">
        {editing ? (
          <div className="space-y-2">
            <div className="mb-3 rounded-lg border border-primary/20 bg-primary/[0.04] px-3 py-2">
              <p className="text-xs font-semibold">Configuração do modelo da etapa</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Disponível somente para administradores do tenant. As alterações ficam como padrão desta etapa para todos os negócios.
              </p>
            </div>
            {editList.map((p, i) => (
              <div key={p.id} className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-[11px] font-semibold text-muted-foreground">{i + 1}</span>
                <Input
                  value={p.texto}
                  onChange={(e) => setEditList((prev) => prev.map((q, idx) => idx === i ? { ...q, texto: e.target.value } : q))}
                  className="h-8 text-sm"
                />
                <button type="button" onClick={() => setEditList((prev) => prev.filter((_, idx) => idx !== i))} className="shrink-0 text-muted-foreground hover:text-destructive">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-dashed text-[11px] text-muted-foreground">+</span>
              <Input
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                placeholder="Nova pergunta desta etapa"
                className="h-8 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newQuestion.trim()) {
                    setEditList((prev) => [...prev, { id: slug(newQuestion) + "_" + prev.length, texto: newQuestion.trim() }]);
                    setNewQuestion("");
                  }
                }}
              />
              <Button
                type="button" size="sm" variant="outline" className="h-8 shrink-0 gap-1"
                disabled={!newQuestion.trim()}
                onClick={() => { setEditList((prev) => [...prev, { id: slug(newQuestion) + "_" + prev.length, texto: newQuestion.trim() }]); setNewQuestion(""); }}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="mt-4 rounded-lg border border-border/70 bg-muted/20 p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold">Acompanhamento inteligente da etapa</p>
                  <p className="text-[11px] text-muted-foreground">O Vendi usa lacunas, risco e próxima melhor ação para definir o objetivo do follow-up.</p>
                </div>
                <label className="flex items-center gap-2 text-xs">
                  <Checkbox
                    checked={followupConfig.ativo === true}
                    onCheckedChange={(checked) => setFollowupConfig((prev) => ({ ...prev, ativo: checked === true }))}
                  />
                  Ativo
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-[11px]">Modo</Label>
                  <Select
                    value={followupConfig.modo ?? "gerar_aprovar"}
                    onValueChange={(value) => setFollowupConfig((prev) => ({ ...prev, modo: value as FollowupConfig["modo"] }))}
                  >
                    <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gerar_aprovar">IA gera e humano aprova</SelectItem>
                      <SelectItem value="somente_sugestao">Somente sugestão</SelectItem>
                      <SelectItem value="automatico">Automático</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[11px]">Objetivo padrão</Label>
                  <Input
                    className="mt-1 h-8 text-xs"
                    value={followupConfig.objetivo ?? ""}
                    placeholder="Ex.: confirmar decisor e próximo passo"
                    onChange={(e) => setFollowupConfig((prev) => ({ ...prev, objetivo: e.target.value }))}
                  />
                </div>
                <div>
                  <Label className="text-[11px]">Atraso inicial (min.)</Label>
                  <Input
                    type="number"
                    min={0}
                    className="mt-1 h-8 text-xs"
                    value={followupConfig.atrasoInicialMinutos ?? 1440}
                    onChange={(e) => setFollowupConfig((prev) => ({ ...prev, atrasoInicialMinutos: Math.max(0, Number(e.target.value) || 0) }))}
                  />
                </div>
                <div>
                  <Label className="text-[11px]">Intervalo mínimo (min.)</Label>
                  <Input
                    type="number"
                    min={60}
                    className="mt-1 h-8 text-xs"
                    value={followupConfig.intervaloMinimoMinutos ?? 1440}
                    onChange={(e) => setFollowupConfig((prev) => ({ ...prev, intervaloMinimoMinutos: Math.max(60, Number(e.target.value) || 60) }))}
                  />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-[11px]">
                  <Checkbox
                    checked={followupConfig.priorizarLacunasDaEtapa !== false}
                    onCheckedChange={(checked) => setFollowupConfig((prev) => ({ ...prev, priorizarLacunasDaEtapa: checked === true }))}
                  />
                  Priorizar perguntas/lacunas
                </label>
                <label className="flex items-center gap-2 text-[11px]">
                  <Checkbox
                    checked={followupConfig.priorizarRiscoAtual !== false}
                    onCheckedChange={(checked) => setFollowupConfig((prev) => ({ ...prev, priorizarRiscoAtual: checked === true }))}
                  />
                  Considerar Saúde/Risco
                </label>
                <label className="flex items-center gap-2 text-[11px]">
                  <Checkbox
                    checked={followupConfig.pararAoResponder !== false}
                    onCheckedChange={(checked) => setFollowupConfig((prev) => ({ ...prev, pararAoResponder: checked === true }))}
                  />
                  Replanejar quando cliente responder
                </label>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Button size="sm" disabled={updateStage.isPending} onClick={saveQuestionSet}>
                {updateStage.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Salvar modelo da etapa
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setEditList(stage.perguntas ?? []); }}>Cancelar</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              {perguntas.map((p, index) => {
                const answered = Boolean(draft[p.id]?.trim());
                return (
                  <div key={p.id} className="flex gap-2 rounded-lg border border-border/60 bg-background px-2.5 py-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary/[0.08] text-[10px] font-semibold text-primary">
                      {index + 1}
                    </span>
                    <span className="pt-0.5">
                      {answered
                        ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        : <Circle className="h-3.5 w-3.5 text-muted-foreground/50" />}
                    </span>
                    <div className="min-w-0 flex-1 lg:grid lg:grid-cols-[minmax(220px,0.8fr)_minmax(280px,1.2fr)] lg:items-center lg:gap-3">
                      <label className="mb-1 block text-xs font-medium leading-snug text-foreground lg:mb-0">{p.texto}</label>
                      <Textarea
                        value={draft[p.id] ?? ""}
                        onChange={(e) => setDraft((prev) => ({ ...prev, [p.id]: e.target.value }))}
                        onBlur={(e) => {
                          const next = { ...draft, [p.id]: e.target.value };
                          setDraft(next);
                          onSaveAnswers(next);
                        }}
                        rows={1}
                        className="h-8 min-h-8 resize-none py-1.5 text-sm transition-[height] focus:h-14 focus:min-h-14"
                        placeholder="Adicionar resposta…"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex min-h-4 items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <span>{answeredCount === perguntas.length ? "Etapa respondida." : `${perguntas.length - answeredCount} pendente(s).`}</span>
              {saving && <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Salvando…</span>}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
