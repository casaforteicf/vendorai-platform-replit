import { useState, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { getSegmentHints } from "@/lib/segmentHints";
import {
  useGetLeadBriefing,
  getGetLeadBriefingQueryKey,
  useUpsertLeadBriefing,
  useListTenantUsers,
  getListTenantUsersQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ClipboardList,
  Plus,
  X,
  Save,
  Loader2,
  Flame,
  CloudSun,
  Snowflake,
  Sparkles,
  Target,
} from "lucide-react";

const SITUATION_QUESTIONS = [
  "Quando um cliente quer fazer um pedido, qual é o caminho mais comum — liga, manda WhatsApp, ou passa pelo site?",
  "Vocês têm gente dedicada só pra responder mensagem, ou é o mesmo time do balcão/loja?",
  "Fora do horário comercial, alguém ainda responde, ou fica pro outro dia?",
];

const PROBLEM_QUESTIONS = [
  "Quando chega mensagem fora do horário ou fim de semana, o que costuma acontecer?",
  "Já aconteceu de um cliente perguntar preço e demorar pra alguém responder?",
  "Se a pessoa que sabe os preços de cor falta um dia, como fica o atendimento?",
];

const IMPLICATION_QUESTIONS = [
  "Quando isso acontece, o pedido espera ou o cliente já compra em outro lugar?",
  "Um cliente que troca de fornecedor por demora costuma voltar, ou fica com quem atendeu rápido?",
  "Se isso acontece [x] vezes por semana, multiplicado pelo mês, dá pra ter ideia de quanto representa?",
];

const NEED_QUESTIONS = [
  "Se toda mensagem fosse respondida na hora, com preço certo, mesmo fora do horário — mudaria o volume de pedido fechado?",
  "Se o time não precisasse responder a mesma pergunta de preço todo dia, no que focaria o tempo?",
];

const OBJECTION_OPTIONS = [
  "Preço alto",
  "Não tem urgência",
  "Precisa consultar alguém",
  "Já usa outro sistema",
  "Não confia em IA",
  "outra",
];

const CHANNEL_OPTIONS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "instagram", label: "Instagram" },
  { value: "site", label: "Site" },
  { value: "televendas", label: "Televendas" },
  { value: "representante", label: "Representante" },
  { value: "outro", label: "Outro" },
];

const CONTACT_TYPE_OPTIONS = [
  { value: "call", label: "Ligação" },
  { value: "visit", label: "Visita" },
  { value: "whatsapp", label: "WhatsApp" },
];

const NEXT_STEP_OPTIONS = [
  { value: "meeting_scheduled", label: "Reunião marcada" },
  { value: "callback", label: "Compromisso de retorno" },
  { value: "open_door", label: "Porta aberta" },
];

const PROSPECT_SIZE_OPTIONS = [
  { value: "small_digital", label: "Pequeno digital" },
  { value: "medium_regional", label: "Médio regional" },
  { value: "large_multichannel", label: "Grande multicanal" },
];

interface LeadBriefingTabProps {
  leadId: string;
  tenantId: string;
  lead?: any;
}

import type {
  LeadBriefingSituationAnswersItem,
  LeadBriefingProblemAnswersItem,
  LeadBriefingImplicationAnswersItem,
  LeadBriefingNeedAnswersItem,
  LeadBriefingObjectionsItem,
} from "@workspace/api-client-react";

type QAItem = LeadBriefingSituationAnswersItem;
type ObjectionItem = LeadBriefingObjectionsItem;

interface BriefingForm {
  channelsUsed: string[];
  contactType: string;
  approachedBy: string;
  contactDate: string;
  situationAnswers: QAItem[];
  problemAnswers: QAItem[];
  problemMinimized: boolean;
  implicationAnswers: QAItem[];
  implicationEstimatedValue: string;
  needAnswers: QAItem[];
  needThermometer: string;
  objections: ObjectionItem[];
  prospectSize: string;
  presentationSent: boolean;
  presentationSentDate: string;
  presentationLink: string;
  nextStepType: string;
  nextStepDate: string;
  freeNotes: string;
}

export default function LeadBriefingTab({ leadId, tenantId, lead }: LeadBriefingTabProps) {
  const { user } = useAuth();
  const hints = getSegmentHints(user?.tenantVertical);
  const { toast } = useToast();
  const { data: briefing, isLoading: loadingBriefing } = useGetLeadBriefing(leadId, {
    query: { enabled: !!leadId, queryKey: getGetLeadBriefingQueryKey(leadId) },
  });
  const { data: users } = useListTenantUsers(tenantId, {
    query: { enabled: !!tenantId, queryKey: getListTenantUsersQueryKey(tenantId) },
  });
  const upsert = useUpsertLeadBriefing();

  // Contexto editável do cliente (sincronizado do lead, editável localmente)
  const [demanda, setDemanda] = useState(lead?.objetivo ?? "");
  const [segmento, setSegmento] = useState(lead?.mercadoSegmento ?? "");
  const [savingContext, setSavingContext] = useState(false);
  const [contextChanged, setContextChanged] = useState(false);
  const autoGeneratedRef = useRef(false);

  // Sincroniza quando o lead chega
  useEffect(() => {
    setDemanda(lead?.objetivo ?? "");
    setSegmento(lead?.mercadoSegmento ?? "");
  }, [lead?.objetivo, lead?.mercadoSegmento]);

  // Auto-gera perguntas na primeira abertura se: briefing ainda não existe E há demanda/segmento
  useEffect(() => {
    if (loadingBriefing) return;
    if (autoGeneratedRef.current) return;
    if (briefing) return; // já tem briefing salvo → não sobrescrever
    const context = lead?.objetivo ?? lead?.mercadoSegmento ?? "";
    if (!context) return;
    autoGeneratedRef.current = true;
    handleGenerateQuestions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingBriefing, briefing]);

  const saveContext = async () => {
    setSavingContext(true);
    try {
      const token = localStorage.getItem("vendorai_token");
      const res = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ objetivo: demanda || null, mercadoSegmento: segmento || null }),
      });
      if (!res.ok) throw new Error("Falha ao salvar");
      setContextChanged(false);
      toast({ title: "Contexto do cliente salvo" });
    } catch {
      toast({ title: "Erro ao salvar contexto", variant: "destructive" });
    } finally {
      setSavingContext(false);
    }
  };

  const [form, setForm] = useState<BriefingForm>({
    channelsUsed: [],
    contactType: "",
    approachedBy: user?.id ?? "",
    contactDate: "",
    situationAnswers: SITUATION_QUESTIONS.map((q) => ({ question: q, answer: "" })),
    problemAnswers: PROBLEM_QUESTIONS.map((q) => ({ question: q, answer: "" })),
    problemMinimized: false,
    implicationAnswers: IMPLICATION_QUESTIONS.map((q) => ({ question: q, answer: "" })),
    implicationEstimatedValue: "",
    needAnswers: NEED_QUESTIONS.map((q) => ({ question: q, answer: "" })),
    needThermometer: "",
    objections: [],
    prospectSize: "",
    presentationSent: false,
    presentationSentDate: "",
    presentationLink: "",
    nextStepType: "",
    nextStepDate: "",
    freeNotes: "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);

  const handleGenerateQuestions = async () => {
    setIsGeneratingQuestions(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/briefing/generate-questions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` },
      });
      const data = (await res.json()) as {
        situationQuestions?: string[];
        problemQuestions?: string[];
        implicationQuestions?: string[];
        needQuestions?: string[];
        error?: string;
      };
      if (!res.ok || data.error) {
        toast({ title: "Erro ao gerar perguntas", description: data.error ?? "Tente novamente.", variant: "destructive" });
        return;
      }
      setForm((prev) => ({
        ...prev,
        situationAnswers: (data.situationQuestions ?? SITUATION_QUESTIONS).map((q, i) => ({
          question: q,
          answer: prev.situationAnswers[i]?.answer ?? "",
        })),
        problemAnswers: (data.problemQuestions ?? PROBLEM_QUESTIONS).map((q, i) => ({
          question: q,
          answer: prev.problemAnswers[i]?.answer ?? "",
        })),
        implicationAnswers: (data.implicationQuestions ?? IMPLICATION_QUESTIONS).map((q, i) => ({
          question: q,
          answer: prev.implicationAnswers[i]?.answer ?? "",
        })),
        needAnswers: (data.needQuestions ?? NEED_QUESTIONS).map((q, i) => ({
          question: q,
          answer: prev.needAnswers[i]?.answer ?? "",
        })),
      }));
      setHasChanges(true);
      toast({ title: "Perguntas geradas!", description: "Revise e preencha as respostas abaixo." });
    } catch {
      toast({ title: "Erro ao gerar perguntas", description: "Verifique sua conexão.", variant: "destructive" });
    } finally {
      setIsGeneratingQuestions(false);
    }
  };

  useEffect(() => {
    if (briefing) {
      setForm({
        channelsUsed: briefing.channelsUsed ?? [],
        contactType: briefing.contactType ?? "",
        approachedBy: briefing.approachedBy ?? user?.id ?? "",
        contactDate: briefing.contactDate ?? "",
        situationAnswers: briefing.situationAnswers ?? SITUATION_QUESTIONS.map((q) => ({ question: q, answer: "" })),
        problemAnswers: briefing.problemAnswers ?? PROBLEM_QUESTIONS.map((q) => ({ question: q, answer: "" })),
        problemMinimized: briefing.problemMinimized ?? false,
        implicationAnswers: briefing.implicationAnswers ?? IMPLICATION_QUESTIONS.map((q) => ({ question: q, answer: "" })),
        implicationEstimatedValue: briefing.implicationEstimatedValue ?? "",
        needAnswers: briefing.needAnswers ?? NEED_QUESTIONS.map((q) => ({ question: q, answer: "" })),
        needThermometer: briefing.needThermometer ?? "",
        objections: briefing.objections ?? [],
        prospectSize: briefing.prospectSize ?? "",
        presentationSent: briefing.presentationSent ?? false,
        presentationSentDate: briefing.presentationSentDate ?? "",
        presentationLink: briefing.presentationLink ?? "",
        nextStepType: briefing.nextStepType ?? "",
        nextStepDate: briefing.nextStepDate ?? "",
        freeNotes: briefing.freeNotes ?? "",
      });
    } else {
      setForm({
        channelsUsed: [],
        contactType: "",
        approachedBy: user?.id ?? "",
        contactDate: "",
        situationAnswers: SITUATION_QUESTIONS.map((q) => ({ question: q, answer: "" })),
        problemAnswers: PROBLEM_QUESTIONS.map((q) => ({ question: q, answer: "" })),
        problemMinimized: false,
        implicationAnswers: IMPLICATION_QUESTIONS.map((q) => ({ question: q, answer: "" })),
        implicationEstimatedValue: "",
        needAnswers: NEED_QUESTIONS.map((q) => ({ question: q, answer: "" })),
        needThermometer: "",
        objections: [],
        prospectSize: "",
        presentationSent: false,
        presentationSentDate: "",
        presentationLink: "",
        nextStepType: "",
        nextStepDate: "",
        freeNotes: "",
      });
    }
    setHasChanges(false);
  }, [briefing, user?.id]);

  const updateField = <K extends keyof BriefingForm>(key: K, value: BriefingForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const updateAnswer = (section: "situationAnswers" | "problemAnswers" | "implicationAnswers" | "needAnswers", index: number, answer: string) => {
    setForm((prev) => {
      const answers = [...prev[section]];
      answers[index] = { ...answers[index], answer };
      return { ...prev, [section]: answers };
    });
    setHasChanges(true);
  };

  const addObjection = () => {
    setForm((prev) => ({
      ...prev,
      objections: [...prev.objections, { objection: "", response: "" }],
    }));
    setHasChanges(true);
  };

  const removeObjection = (index: number) => {
    setForm((prev) => {
      const list = [...prev.objections];
      list.splice(index, 1);
      return { ...prev, objections: list };
    });
    setHasChanges(true);
  };

  const updateObjection = (index: number, field: "objection" | "response", value: string) => {
    setForm((prev) => {
      const list = [...prev.objections];
      list[index] = { ...list[index], [field]: value };
      return { ...prev, objections: list };
    });
    setHasChanges(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await upsert.mutateAsync({
        leadId,
        data: {
          channelsUsed: form.channelsUsed,
          contactType: form.contactType as "call" | "visit" | "whatsapp" | undefined,
          approachedBy: form.approachedBy || undefined,
          contactDate: form.contactDate || undefined,
          situationAnswers: form.situationAnswers,
          problemAnswers: form.problemAnswers,
          problemMinimized: form.problemMinimized,
          implicationAnswers: form.implicationAnswers,
          implicationEstimatedValue: form.implicationEstimatedValue || undefined,
          needAnswers: form.needAnswers,
          needThermometer: form.needThermometer as "hot" | "warm" | "cold" | undefined,
          objections: form.objections,
          prospectSize: form.prospectSize as "small_digital" | "medium_regional" | "large_multichannel" | undefined,
          presentationSent: form.presentationSent,
          presentationSentDate: form.presentationSentDate || undefined,
          presentationLink: form.presentationLink || undefined,
          nextStepType: form.nextStepType as "meeting_scheduled" | "callback" | "open_door" | undefined,
          nextStepDate: form.nextStepDate || undefined,
          freeNotes: form.freeNotes || undefined,
        },
      });
      toast({ title: "Briefing salvo", description: "As informações foram atualizadas." });
      setHasChanges(false);
    } catch (e) {
      toast({ title: "Erro ao salvar", description: String(e), variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  if (loadingBriefing) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="space-y-3">
            <div className="h-4 bg-muted animate-pulse rounded w-1/3" />
            <div className="h-20 bg-muted animate-pulse rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-briefing">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            <span>Briefing SPIN+PAS</span>
            {form.needThermometer && (
              <Badge
                variant="outline"
                className={
                  form.needThermometer === "hot"
                    ? "bg-red-50 text-red-600 border-red-200"
                    : form.needThermometer === "warm"
                    ? "bg-amber-50 text-amber-600 border-amber-200"
                    : "bg-blue-50 text-blue-600 border-blue-200"
                }
              >
                {form.needThermometer === "hot" && <Flame className="h-3 w-3 mr-1 inline" />}
                {form.needThermometer === "warm" && <CloudSun className="h-3 w-3 mr-1 inline" />}
                {form.needThermometer === "cold" && <Snowflake className="h-3 w-3 mr-1 inline" />}
                {form.needThermometer === "hot" ? "Dor latente" : form.needThermometer === "warm" ? "Interesse sem urgência" : "Não é prioridade"}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1"
              onClick={handleGenerateQuestions}
              disabled={isGeneratingQuestions}
              title="Gerar perguntas personalizadas para este cliente com IA"
            >
              {isGeneratingQuestions ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              {isGeneratingQuestions ? "Gerando…" : "Gerar perguntas IA"}
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={handleSave}
              disabled={isSaving || !hasChanges}
              data-testid="btn-salvar-briefing"
            >
              {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              Salvar
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* ── Contexto do cliente ────────────────────────────────────────────── */}
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold flex items-center gap-1.5 text-primary">
              <Target className="h-3.5 w-3.5" />
              Contexto do cliente
              {isGeneratingQuestions && (
                <span className="ml-2 text-muted-foreground font-normal flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Gerando perguntas personalizadas…
                </span>
              )}
            </h3>
            {contextChanged && (
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-xs gap-1"
                onClick={saveContext}
                disabled={savingContext}
              >
                {savingContext ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                Salvar contexto
              </Button>
            )}
          </div>

          {lead && (
            <div className="text-xs text-muted-foreground flex flex-wrap gap-2">
              {lead.empresa && <span className="font-medium text-foreground">{lead.empresa}</span>}
              {lead.nome && lead.empresa && <span>·</span>}
              {lead.nome && <span>{lead.nome}</span>}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium">O que o cliente busca / demanda</label>
              <Textarea
                className="text-xs min-h-[60px]"
                placeholder={hints.briefingDemandaPlaceholder}
                value={demanda}
                onChange={(e) => { setDemanda(e.target.value); setContextChanged(true); }}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Segmento / mercado</label>
              <Input
                className="h-8 text-xs"
                placeholder={hints.briefingSegmentoPlaceholder}
                value={segmento}
                onChange={(e) => { setSegmento(e.target.value); setContextChanged(true); }}
              />
              <p className="text-[10px] text-muted-foreground">
                Salve o contexto e clique em "Gerar perguntas IA" para personalizar o SPIN.
              </p>
            </div>
          </div>
        </div>

        {/* Seção 1 */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Dados da empresa / contato</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium">Canais já usados</label>
              <div className="flex flex-wrap gap-2">
                {CHANNEL_OPTIONS.map((ch) => {
                  const selected = form.channelsUsed.includes(ch.value);
                  return (
                    <Badge
                      key={ch.value}
                      variant={selected ? "default" : "outline"}
                      className="cursor-pointer text-xs"
                      onClick={() => {
                        const current = form.channelsUsed;
                        updateField("channelsUsed", selected ? current.filter((v) => v !== ch.value) : [...current, ch.value]);
                      }}
                    >
                      {ch.label}
                    </Badge>
                  );
                })}
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Tipo de contato</label>
              <Select value={form.contactType} onValueChange={(v) => updateField("contactType", v)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Selecionar..." />
                </SelectTrigger>
                <SelectContent>
                  {CONTACT_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Data da abordagem</label>
              <Input type="date" className="h-8 text-xs" value={form.contactDate} onChange={(e) => updateField("contactDate", e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Quem abordou</label>
              <Select value={form.approachedBy} onValueChange={(v) => updateField("approachedBy", v)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Selecionar..." />
                </SelectTrigger>
                <SelectContent>
                  {users?.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Seções 2-5 */}
        {[
          { key: "situationAnswers" as const, title: "Situação", questions: SITUATION_QUESTIONS },
          { key: "problemAnswers" as const, title: "Problema", questions: PROBLEM_QUESTIONS, extra: "problemMinimized" as const },
          { key: "implicationAnswers" as const, title: "Implicação", questions: IMPLICATION_QUESTIONS, extra: "implicationEstimatedValue" as const },
          { key: "needAnswers" as const, title: "Necessidade", questions: NEED_QUESTIONS, extra: "needThermometer" as const },
        ].map((section) => (
          <div key={section.key} className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{section.title}</h3>
            <div className="space-y-3">
              {form[section.key].map((item, idx) => (
                <div key={idx} className="space-y-1">
                  <p className="text-xs font-medium text-foreground">{item.question}</p>
                  <Textarea className="text-xs min-h-[60px]" placeholder={hints.briefingRespostaPlaceholder} value={item.answer} onChange={(e) => updateAnswer(section.key, idx, e.target.value)} />
                </div>
              ))}
            </div>
            {section.extra === "problemMinimized" && (
              <div className="flex items-center gap-2">
                <Switch checked={form.problemMinimized} onCheckedChange={(v) => updateField("problemMinimized", v)} />
                <span className="text-xs">Prospect minimizou o problema</span>
              </div>
            )}
            {section.extra === "implicationEstimatedValue" && (
              <div className="space-y-1">
                <label className="text-xs font-medium">Valor estimado do impacto</label>
                <Input className="h-8 text-xs" placeholder={hints.briefingImpactoPlaceholder} value={form.implicationEstimatedValue} onChange={(e) => updateField("implicationEstimatedValue", e.target.value)} />
              </div>
            )}
            {section.extra === "needThermometer" && (
              <div className="space-y-1">
                <label className="text-xs font-medium">Termômetro da necessidade</label>
                <div className="flex gap-2">
                  {[
                    { value: "hot", label: "Dor latente", icon: Flame, color: "bg-red-50 text-red-600 border-red-200 hover:bg-red-100" },
                    { value: "warm", label: "Interesse sem urgência", icon: CloudSun, color: "bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100" },
                    { value: "cold", label: "Não é prioridade", icon: Snowflake, color: "bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100" },
                  ].map((opt) => {
                    const Icon = opt.icon;
                    const selected = form.needThermometer === opt.value;
                    return (
                      <Button key={opt.value} type="button" size="sm" variant="outline"
                        className={`text-xs gap-1 ${opt.color} ${selected ? "ring-2 ring-offset-1 ring-primary" : ""}`}
                        onClick={() => updateField("needThermometer", opt.value)}>
                        <Icon className="h-3 w-3" />
                        {opt.label}
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Seção 6 */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Objeções</h3>
          <div className="space-y-2">
            {form.objections.map((obj, idx) => (
              <div key={idx} className="flex items-start gap-2 p-2 border rounded-md bg-muted/20">
                <div className="flex-1 space-y-2">
                  <Select value={obj.objection} onValueChange={(v) => updateObjection(idx, "objection", v)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Selecionar objeção..." />
                    </SelectTrigger>
                    <SelectContent>
                      {OBJECTION_OPTIONS.map((o) => (
                        <SelectItem key={o} value={o}>{o}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Textarea className="text-xs min-h-[40px]" placeholder="Resposta dada..." value={obj.response} onChange={(e) => updateObjection(idx, "response", e.target.value)} />
                </div>
                <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => removeObjection(idx)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
          <Button size="sm" variant="outline" className="text-xs gap-1" onClick={addObjection}>
            <Plus className="h-3 w-3" />
            Adicionar objeção
          </Button>
        </div>

        {/* Seção 7 */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Classificação de porte</h3>
          <div className="flex gap-2">
            {PROSPECT_SIZE_OPTIONS.map((opt) => (
              <Button key={opt.value} type="button" size="sm" variant="outline"
                className={`text-xs ${form.prospectSize === opt.value ? "bg-primary text-primary-foreground border-primary" : ""}`}
                onClick={() => updateField("prospectSize", opt.value)}>
                {opt.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Seção 8 */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Material enviado</h3>
          <div className="flex items-center gap-3">
            <Switch checked={form.presentationSent} onCheckedChange={(v) => updateField("presentationSent", v)} />
            <span className="text-xs">Apresentação enviada</span>
          </div>
          {form.presentationSent && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">Data do envio</label>
                <Input type="date" className="h-8 text-xs" value={form.presentationSentDate} onChange={(e) => updateField("presentationSentDate", e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Link</label>
                <Input className="h-8 text-xs" placeholder="https://..." value={form.presentationLink} onChange={(e) => updateField("presentationLink", e.target.value)} />
              </div>
            </div>
          )}
        </div>

        {/* Seção 9 */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Próximo passo</h3>
          <div className="flex gap-2">
            {NEXT_STEP_OPTIONS.map((opt) => (
              <Button key={opt.value} type="button" size="sm" variant="outline"
                className={`text-xs ${form.nextStepType === opt.value ? "bg-primary text-primary-foreground border-primary" : ""}`}
                onClick={() => updateField("nextStepType", opt.value)}>
                {opt.label}
              </Button>
            ))}
          </div>
          {form.nextStepType && form.nextStepType !== "open_door" && (
            <div className="space-y-1">
              <label className="text-xs font-medium">Data</label>
              <Input type="date" className="h-8 text-xs w-48" value={form.nextStepDate} onChange={(e) => updateField("nextStepDate", e.target.value)} />
            </div>
          )}
        </div>

        {/* Seção 10 */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Notas livres</h3>
          <Textarea className="text-xs min-h-[100px]" placeholder={hints.briefingNotasPlaceholder} value={form.freeNotes} onChange={(e) => updateField("freeNotes", e.target.value)} />
        </div>

        <div className="flex justify-end pt-2 border-t">
          <Button size="sm" className="text-xs gap-1" onClick={handleSave} disabled={isSaving || !hasChanges}>
            {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Salvar briefing
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
