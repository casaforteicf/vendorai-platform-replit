import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
  BrainCircuit,
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  Zap,
  FileEdit,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Compass,
  Maximize2,
  Minimize2,
  Copy,
  Send,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  Square,
  CheckSquare,
  Video,
} from "lucide-react";

const SITUATION_QUESTIONS = [
  "Como os clientes costumam entrar em contato com vocês — WhatsApp, ligação, redes sociais ou outro canal?",
  "Tem alguém dedicado a responder consultas e mensagens dos clientes, ou todo mundo divide essa tarefa?",
  "Como funciona o atendimento fora do horário comercial?",
];

const PROBLEM_QUESTIONS = [
  "Qual é a maior dificuldade no atendimento ou nas vendas hoje?",
  "Já houve situação em que um cliente foi perdido por demora de resposta ou falta de follow-up?",
  "O que costuma travar uma venda ou atrasar o fechamento?",
];

const IMPLICATION_QUESTIONS = [
  "Quando esse problema acontece, o cliente costuma esperar ou busca outra opção?",
  "Com que frequência isso ocorre? Já tentou calcular o impacto financeiro?",
  "Quanto tempo a equipe gasta com tarefas repetitivas que poderiam ser automatizadas?",
];

const NEED_QUESTIONS = [
  "Se esse problema fosse resolvido, o que mudaria no volume de negócios ou na produtividade?",
  "Como seria o atendimento ideal para os clientes de vocês?",
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

interface SpinRoteiro {
  abertura: string;
  situacao: Array<{ pergunta: string; objetivo: string }>;
  problema: Array<{ pergunta: string; objetivo: string }>;
  implicacao: Array<{ pergunta: string; objetivo: string }>;
  necessidade: Array<{ pergunta: string; objetivo: string }>;
  objecoes: Array<{ objecao: string; resposta: string }>;
  fechamento: string;
  alertas: string[];
}

interface SpinMeetingData {
  activity: {
    id: string;
    titulo: string;
    descricao?: string;
    dataHoraInicio?: string;
    dataHoraFim?: string;
    meetLink?: string;
    dealId?: string;
    spinGeneratedAt?: string;
  } | null;
  roteiro: SpinRoteiro | null;
  hasNewMessages: boolean;
}

interface LeadBriefingTabProps {
  leadId: string;
  tenantId: string;
  lead?: any;
  dealId?: string;
  /** Quando true, oculta a aba Briefing SPIN e mostra só o Roteiro de Reunião. */
  roteiroOnly?: boolean;
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

function SpinSection({
  letter,
  label,
  color,
  items,
  description,
}: {
  letter: string;
  label: string;
  color: "blue" | "amber" | "orange" | "emerald";
  items: Array<{ pergunta: string; objetivo: string }>;
  description: string;
}) {
  const colorMap = {
    blue: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border-blue-300 dark:border-blue-700",
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-300 dark:border-amber-700",
    orange: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border-blue-300 dark:border-blue-700",
    emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700",
  };
  const dotMap = {
    blue: "bg-blue-500",
    amber: "bg-amber-500",
    orange: "bg-blue-500",
    emerald: "bg-emerald-500",
  };
  if (!items?.length) return null;
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className={`inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold border ${colorMap[color]}`}>
          {letter}
        </span>
        <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{label}</p>
        <span className="text-[10px] text-muted-foreground italic">— {description}</span>
      </div>
      <div className="space-y-1.5 pl-1">
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${dotMap[color]}`} />
            <div>
              <p>{item.pergunta}</p>
              {item.objetivo && <p className="text-muted-foreground text-[10px] mt-0.5">{item.objetivo}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function LeadBriefingTab({ leadId, tenantId, lead, dealId, roteiroOnly }: LeadBriefingTabProps) {
  const { user } = useAuth();
  const hints = getSegmentHints(user?.tenantVertical);
  const { toast } = useToast();
  const queryClient = useQueryClient();
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

  // Resumo de fechamento gerado por IA
  interface BriefingSummary {
    resumoCliente: string;
    doresPrincipais: string[];
    pontosDeForte: string[];
    comoContornarObjecoes: { objecao: string; argumento: string }[];
    abordagemRecomendada: string;
    alertas: string[];
  }
  const [summary, setSummary] = useState<BriefingSummary | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);

  // "summary" = mostra só o resumo | "form" = mostra o formulário completo
  const [activeView, setActiveView] = useState<"summary" | "form">("form");

  // Sincroniza quando o lead chega
  useEffect(() => {
    setDemanda(lead?.objetivo ?? "");
    setSegmento(lead?.mercadoSegmento ?? "");
  }, [lead?.objetivo, lead?.mercadoSegmento]);

  // Auto-gera perguntas se o SPIN ainda não existe. A Jornada de Atendimento
  // pode criar o mesmo registro antes deste bloco ser aberto.
  useEffect(() => {
    if (loadingBriefing) return;
    if (autoGeneratedRef.current) return;
    const hasSpinQuestions = !!briefing && [
      briefing.situationAnswers,
      briefing.problemAnswers,
      briefing.implicationAnswers,
      briefing.needAnswers,
    ].some((answers) => Array.isArray(answers) && answers.length > 0);
    if (hasSpinQuestions) return;
    autoGeneratedRef.current = true;
    handleGenerateQuestions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingBriefing, briefing]);

  // Carrega aiSummary salvo no DB ao abrir o briefing
  useEffect(() => {
    if (!briefing) return;
    const saved = (briefing as any).aiSummary;
    if (saved) {
      setSummary(saved as BriefingSummary);
      setActiveView("summary");
    }
  }, [briefing]);

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
  const [openSpin, setOpenSpin] = useState<string | null>("S");

  // ── Tab SPIN Roteiro ────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<"briefing" | "roteiro">(roteiroOnly ? "roteiro" : "briefing");
  const [spinData, setSpinData] = useState<SpinMeetingData | null>(null);
  const [spinLoading, setSpinLoading] = useState(false);
  const [spinGenerating, setSpinGenerating] = useState(false);
  const [spinSending, setSpinSending] = useState(false);
  const [meetingMode, setMeetingMode] = useState(false);
  const [meetingSection, setMeetingSection] = useState(0);
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [isSchedulingNext, setIsSchedulingNext] = useState(false);
  const [isClosingDeal, setIsClosingDeal] = useState(false);
  const [nextCustomDate, setNextCustomDate] = useState("");

  const fetchSpinData = async () => {
    setSpinLoading(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/spin-meeting`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` },
      });
      if (res.ok) {
        const data = await res.json() as SpinMeetingData;
        setSpinData(data);
      }
    } catch { null; } finally { setSpinLoading(false); }
  };

  useEffect(() => {
    if (activeTab === "roteiro" && !spinData) {
      void fetchSpinData();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const handleGenerateSpin = async () => {
    setSpinGenerating(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/spin-meeting/generate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` },
      });
      const data = await res.json() as { roteiro?: SpinRoteiro; error?: string };
      if (!res.ok || data.error) {
        toast({ title: "Erro ao gerar roteiro", description: data.error ?? "Tente novamente.", variant: "destructive" });
        return;
      }
      await fetchSpinData();
      toast({ title: "Roteiro SPIN gerado!", description: "Roteiro atualizado com sucesso." });
    } catch {
      toast({ title: "Erro ao gerar roteiro", variant: "destructive" });
    } finally { setSpinGenerating(false); }
  };

  const handleSendSpinWhatsapp = async () => {
    setSpinSending(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/spin-meeting/send-whatsapp`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` },
      });
      const data = await res.json() as { sent?: boolean; error?: string };
      if (!res.ok || data.error) {
        toast({ title: "Erro ao enviar", description: data.error ?? "Tente novamente.", variant: "destructive" });
        return;
      }
      toast({ title: "Roteiro enviado para o WhatsApp!" });
    } catch {
      toast({ title: "Erro ao enviar", variant: "destructive" });
    } finally { setSpinSending(false); }
  };

  const handleScheduleNext = async (daysFromNow: number, customDate?: string) => {
    setIsSchedulingNext(true);
    try {
      const token = localStorage.getItem("vendorai_token");
      const start = customDate
        ? (() => { const d = new Date(customDate); d.setHours(9, 0, 0, 0); return d; })()
        : (() => { const d = new Date(); d.setDate(d.getDate() + daysFromNow); d.setHours(9, 0, 0, 0); return d; })();
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      const res = await fetch(`/api/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          tenantId,
          leadId,
          tipo: "reuniao",
          titulo: "Próximo contato",
          status: "planejado",
          dataHoraInicio: start.toISOString(),
          dataHoraFim: end.toISOString(),
          dealId: spinData?.activity?.dealId ?? undefined,
        }),
      });
      if (!res.ok) throw new Error("Falha ao criar atividade");
      await fetchSpinData();
      toast({
        title: "Próximo contato agendado!",
        description: `Atividade criada para ${start.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })}`,
      });
      setNextCustomDate("");
    } catch {
      toast({ title: "Erro ao agendar próximo contato", variant: "destructive" });
    } finally {
      setIsSchedulingNext(false);
    }
  };

  const handleCloseDeal = async () => {
    const dealId = spinData?.activity?.dealId;
    if (!dealId) return;
    setIsClosingDeal(true);
    try {
      const token = localStorage.getItem("vendorai_token");
      const res = await fetch(`/api/deals/${dealId}/confirm-closure`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) {
        toast({ title: "Erro ao fechar negócio", description: data.error ?? "Tente novamente.", variant: "destructive" });
        return;
      }
      toast({ title: "Negócio fechado!", description: "O deal foi marcado como ganho." });
    } catch {
      toast({ title: "Erro ao fechar negócio", variant: "destructive" });
    } finally {
      setIsClosingDeal(false);
    }
  };

  const handleCopySpin = () => {
    if (!spinData?.roteiro) return;
    const r = spinData.roteiro;
    const lines = [
      `🧭 ROTEIRO SPIN — ${lead?.nome ?? "Lead"}`,
      ``,
      `ABERTURA:`,
      r.abertura,
      ``,
      `SITUAÇÃO:`,
      ...r.situacao.map((q) => `• ${q.pergunta}`),
      ``,
      `PROBLEMA:`,
      ...r.problema.map((q) => `• ${q.pergunta}`),
      ``,
      `IMPLICAÇÃO:`,
      ...r.implicacao.map((q) => `• ${q.pergunta}`),
      ``,
      `NECESSIDADE:`,
      ...r.necessidade.map((q) => `• ${q.pergunta}`),
      ``,
      `FECHAMENTO:`,
      r.fechamento,
    ];
    if (r.alertas?.length) {
      lines.push(``, `⚠️ ALERTAS:`, ...r.alertas.map((a) => `• ${a}`));
    }
    void navigator.clipboard.writeText(lines.join("\n"));
    toast({ title: "Copiado para a área de transferência!" });
  };

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

  const handleSummarize = async () => {
    setIsSummarizing(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/briefing/summarize`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}`, "Content-Type": "application/json" },
        body: JSON.stringify({ dealId: dealId || undefined }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        toast({ title: "Erro ao gerar resumo", description: data.error ?? "Tente novamente.", variant: "destructive" });
        return;
      }
      setSummary(data);
      setActiveView("summary");
      // Invalida query para que o aiSummary salvo no DB seja refletido
      void queryClient.invalidateQueries({ queryKey: getGetLeadBriefingQueryKey(leadId) });
    } catch {
      toast({ title: "Erro ao gerar resumo", description: "Verifique sua conexão.", variant: "destructive" });
    } finally {
      setIsSummarizing(false);
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
      setHasChanges(false);
      // Após salvar, gera automaticamente o resumo de fechamento
      toast({ title: "Briefing salvo — gerando resumo…", description: "A IA está analisando as respostas." });
      await handleSummarize();
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

  const hasSummary = !!(summary || (briefing as any)?.aiSummary);

  const MEETING_SECTIONS = spinData?.roteiro
    ? [
        { label: "Situação", key: "situacao" as const, color: "bg-blue-500", items: spinData.roteiro.situacao },
        { label: "Problema", key: "problema" as const, color: "bg-amber-500", items: spinData.roteiro.problema },
        { label: "Implicação", key: "implicacao" as const, color: "bg-blue-500", items: spinData.roteiro.implicacao },
        { label: "Necessidade", key: "necessidade" as const, color: "bg-emerald-500", items: spinData.roteiro.necessidade },
      ]
    : [];

  return (
    <>
    {/* ══ MODO REUNIÃO — Tela cheia ══════════════════════════════════════════ */}
    {meetingMode && spinData?.roteiro && (
      <div className="fixed inset-0 z-50 bg-gray-950 text-white flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <Compass className="h-5 w-5 text-emerald-400" />
            <div>
              <p className="text-sm font-semibold">{lead?.nome ?? "Reunião"}</p>
              {spinData.activity?.dataHoraInicio && (
                <p className="text-xs text-gray-400">
                  {new Date(spinData.activity.dataHoraInicio).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {spinData.activity?.meetLink && (
              <a href={spinData.activity.meetLink} target="_blank" rel="noreferrer"
                className="flex items-center gap-1 text-xs bg-emerald-700 hover:bg-emerald-600 px-2 py-1 rounded-md transition-colors">
                <Video className="h-3.5 w-3.5" />
                Meet
              </a>
            )}
            <button onClick={() => setMeetingMode(false)}
              className="p-1.5 rounded-md hover:bg-gray-800 transition-colors">
              <Minimize2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Abertura (pinned if section 0) / Navigation */}
        <div className="flex gap-1 px-4 pt-3">
          {MEETING_SECTIONS.map((s, i) => (
            <button key={s.key} onClick={() => setMeetingSection(i)}
              className={`flex-1 text-xs py-1.5 rounded-md font-semibold transition-colors ${
                meetingSection === i ? `${s.color} text-white` : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}>
              {s.label[0]}
            </button>
          ))}
        </div>

        {/* Section content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {meetingSection === 0 && (
            <div className="mb-4 p-3 bg-gray-800 rounded-lg">
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Abertura</p>
              <p className="text-sm leading-relaxed">{spinData.roteiro.abertura}</p>
            </div>
          )}
          <p className="text-xs text-gray-400 uppercase tracking-wider">
            {MEETING_SECTIONS[meetingSection]?.label}
          </p>
          {MEETING_SECTIONS[meetingSection]?.items.map((item, i) => {
            const key = `${meetingSection}-${i}`;
            const checked = checkedItems.has(key);
            return (
              <button key={i} onClick={() => setCheckedItems((prev) => {
                const next = new Set(prev);
                if (checked) next.delete(key); else next.add(key);
                return next;
              })}
                className={`w-full text-left p-3 rounded-lg border transition-all ${
                  checked
                    ? "bg-gray-800 border-gray-700 opacity-60"
                    : "bg-gray-900 border-gray-700 hover:border-gray-600"
                }`}
              >
                <div className="flex items-start gap-3">
                  {checked
                    ? <CheckSquare className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
                    : <Square className="h-4 w-4 text-gray-500 mt-0.5 shrink-0" />
                  }
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium leading-snug ${checked ? "line-through text-gray-500" : ""}`}>
                      {item.pergunta}
                    </p>
                    <p className="text-[11px] text-gray-500 mt-1">{item.objetivo}</p>
                  </div>
                </div>
              </button>
            );
          })}
          {meetingSection === MEETING_SECTIONS.length - 1 && (
            <div className="mt-4 p-3 bg-emerald-900/40 border border-emerald-700 rounded-lg">
              <p className="text-xs text-emerald-400 uppercase tracking-wider mb-1">Fechamento</p>
              <p className="text-sm leading-relaxed">{spinData.roteiro.fechamento}</p>
            </div>
          )}
          {spinData.roteiro.alertas?.length > 0 && (
            <div className="mt-2 p-3 bg-amber-900/30 border border-amber-700 rounded-lg">
              <p className="text-xs text-amber-400 uppercase tracking-wider mb-1">⚠️ Alertas</p>
              {spinData.roteiro.alertas.map((a, i) => (
                <p key={i} className="text-sm text-amber-200">{a}</p>
              ))}
            </div>
          )}
        </div>

        {/* Bottom nav */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800">
          <button onClick={() => setMeetingSection((p) => Math.max(0, p - 1))}
            disabled={meetingSection === 0}
            className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-md bg-gray-800 disabled:opacity-30 hover:bg-gray-700 transition-colors">
            <ChevronLeft className="h-4 w-4" /> Anterior
          </button>
          <span className="text-xs text-gray-500">{meetingSection + 1} / {MEETING_SECTIONS.length}</span>
          <button onClick={() => setMeetingSection((p) => Math.min(MEETING_SECTIONS.length - 1, p + 1))}
            disabled={meetingSection === MEETING_SECTIONS.length - 1}
            className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-md bg-gray-800 disabled:opacity-30 hover:bg-gray-700 transition-colors">
            Próximo <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    )}

    <Card data-testid="card-briefing">
      {/* ══ TABS ══════════════════════════════════════════════════════════════ */}
      <div className="flex border-b border-border px-4 pt-3">
        {!roteiroOnly && (
          <button
            onClick={() => setActiveTab("briefing")}
            className={`flex items-center gap-1.5 text-xs font-medium pb-2 mr-4 border-b-2 transition-colors ${
              activeTab === "briefing"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <ClipboardList className="h-3.5 w-3.5" />
            Briefing SPIN
          </button>
        )}
        <button
          onClick={() => setActiveTab("roteiro")}
          className={`flex items-center gap-1.5 text-xs font-medium pb-2 border-b-2 transition-colors ${
            activeTab === "roteiro"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Compass className="h-3.5 w-3.5" />
          Roteiro Reunião
          {spinData?.hasNewMessages && (
            <span className="ml-1 bg-amber-500 text-white text-[9px] px-1.5 py-0.5 rounded-full font-bold">
              novo
            </span>
          )}
        </button>
      </div>

      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            {activeTab === "briefing" ? (
              <>
                <ClipboardList className="h-4 w-4 text-primary" />
                <span>Briefing SPIN+PAS</span>
              </>
            ) : (
              <>
                <Compass className="h-4 w-4 text-primary" />
                <span>Roteiro de Reunião</span>
              </>
            )}
            {activeTab === "briefing" && form.needThermometer && (
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
            {activeTab === "roteiro" ? (
              /* SPIN tab buttons */
              <>
                {spinData?.roteiro && (
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                    onClick={() => { setMeetingMode(true); setMeetingSection(0); setCheckedItems(new Set()); }}>
                    <Maximize2 className="h-3 w-3" />
                    Modo Reunião
                  </Button>
                )}
                {spinData?.roteiro && (
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={handleCopySpin}>
                    <Copy className="h-3 w-3" />
                    Copiar
                  </Button>
                )}
                {spinData?.roteiro && (
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                    onClick={handleSendSpinWhatsapp} disabled={spinSending}>
                    {spinSending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                    WhatsApp
                  </Button>
                )}
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                  onClick={handleGenerateSpin} disabled={spinGenerating}>
                  {spinGenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  {spinGenerating ? "Gerando…" : spinData?.roteiro ? "Regenerar" : "Gerar Roteiro"}
                </Button>
              </>
            ) : activeView === "summary" && hasSummary ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1"
                  onClick={handleSummarize}
                  disabled={isSummarizing}
                  title="Regenerar resumo de fechamento"
                >
                  {isSummarizing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  {isSummarizing ? "Atualizando…" : "Atualizar resumo"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1"
                  onClick={() => setActiveView("form")}
                >
                  <FileEdit className="h-3 w-3" />
                  Editar briefing
                </Button>
              </>
            ) : (
              <>
                {hasSummary && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    onClick={() => setActiveView("summary")}
                  >
                    <ChevronUp className="h-3 w-3" />
                    Ver resumo
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1"
                  onClick={handleGenerateQuestions}
                  disabled={isGeneratingQuestions}
                  title="Regenerar perguntas com IA"
                >
                  {isGeneratingQuestions ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  {isGeneratingQuestions ? "Gerando…" : "Regenerar perguntas"}
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={handleSave}
                  disabled={isSaving || isSummarizing || !hasChanges}
                  data-testid="btn-salvar-briefing"
                >
                  {(isSaving || isSummarizing) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  {isSummarizing ? "Gerando resumo…" : isSaving ? "Salvando…" : "Salvar"}
                </Button>
              </>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">

        {/* ══ TAB: ROTEIRO SPIN ══════════════════════════════════════════════ */}
        {activeTab === "roteiro" && (
          <div className="min-h-[200px]">
            {spinLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !spinData?.activity ? (
              <div className="flex flex-col items-center justify-center py-12 text-center space-y-3 text-muted-foreground">
                <Compass className="h-10 w-10 opacity-30" />
                <p className="text-sm font-medium">Nenhuma reunião agendada</p>
                <p className="text-xs max-w-xs">Crie uma atividade do tipo "Reunião" neste lead para gerar o roteiro SPIN automaticamente.</p>
              </div>
            ) : !spinData.roteiro ? (
              <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
                <Compass className="h-10 w-10 text-muted-foreground opacity-30" />
                <div>
                  <p className="text-sm font-medium">Roteiro ainda não gerado</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Reunião: <strong>{spinData.activity.titulo}</strong>
                  </p>
                  {spinData.activity.dataHoraInicio && (
                    <p className="text-xs text-muted-foreground">
                      {new Date(spinData.activity.dataHoraInicio).toLocaleString("pt-BR", { dateStyle: "full", timeStyle: "short" })}
                    </p>
                  )}
                </div>
                <Button size="sm" className="gap-1.5 mt-2" onClick={handleGenerateSpin} disabled={spinGenerating}>
                  {spinGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {spinGenerating ? "Gerando roteiro com IA…" : "Gerar Roteiro SPIN"}
                </Button>
              </div>
            ) : (
              <div className="space-y-5 text-xs">
                {/* Meta info */}
                <div className="flex flex-wrap items-center gap-2">
                  {spinData.hasNewMessages && (
                    <Badge className="bg-amber-100 text-amber-700 border-amber-300 text-[10px]">
                      <MessageSquare className="h-2.5 w-2.5 mr-1 inline" />
                      💬 Houve conversa nova desde o roteiro
                    </Badge>
                  )}
                  {spinData.activity.dataHoraInicio && (
                    <span className="text-muted-foreground">
                      📅 {new Date(spinData.activity.dataHoraInicio).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                    </span>
                  )}
                  {spinData.activity.meetLink && (
                    <a href={spinData.activity.meetLink} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1 text-primary hover:underline">
                      <Video className="h-3 w-3" />
                      Google Meet
                    </a>
                  )}
                  {spinData.activity.spinGeneratedAt && (
                    <span className="text-muted-foreground text-[10px]">
                      Gerado {new Date(spinData.activity.spinGeneratedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                    </span>
                  )}
                </div>

                {/* Abertura */}
                <div className="p-3 bg-muted/50 rounded-lg border-l-2 border-primary">
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-primary mb-1.5">Abertura</p>
                  <p className="leading-relaxed">{spinData.roteiro.abertura}</p>
                </div>

                {/* S — Situação */}
                <SpinSection
                  letter="S" label="Situação" color="blue"
                  items={spinData.roteiro.situacao}
                  description="Entenda o contexto atual do cliente"
                />

                {/* P — Problema */}
                <SpinSection
                  letter="P" label="Problema" color="amber"
                  items={spinData.roteiro.problema}
                  description="Explore as dificuldades e insatisfações"
                />

                {/* I — Implicação */}
                <SpinSection
                  letter="I" label="Implicação" color="orange"
                  items={spinData.roteiro.implicacao}
                  description="Aprofunde o impacto dos problemas"
                />

                {/* N — Necessidade */}
                <SpinSection
                  letter="N" label="Necessidade" color="emerald"
                  items={spinData.roteiro.necessidade}
                  description="Conduza à solução ideal"
                />

                {/* Objeções */}
                {spinData.roteiro.objecoes?.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                      <ShieldCheck className="h-3 w-3" /> Possíveis Objeções
                    </p>
                    <div className="space-y-2">
                      {spinData.roteiro.objecoes.map((obj, i) => (
                        <div key={i} className="p-2.5 rounded-md bg-muted/40 border">
                          <p className="font-medium text-amber-700 dark:text-amber-400">"{obj.objecao}"</p>
                          <p className="mt-1 text-muted-foreground">{obj.resposta}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Fechamento */}
                <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800">
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-emerald-700 dark:text-emerald-400 mb-1.5">Fechamento</p>
                  <p className="leading-relaxed">{spinData.roteiro.fechamento}</p>
                </div>

                {/* Alertas */}
                {spinData.roteiro.alertas?.length > 0 && (
                  <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-amber-700 dark:text-amber-400 mb-1.5 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> Alertas do Contexto
                    </p>
                    <ul className="space-y-1">
                      {spinData.roteiro.alertas.map((a, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="mt-1 h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                          {a}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Próximo Contato */}
                <div className="border-t border-border pt-4 mt-2 space-y-2">
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center gap-1">
                    <RefreshCw className="h-3 w-3" /> Próximo Contato
                  </p>
                  <div className="flex flex-wrap gap-1.5 items-center">
                    {[{ label: "Em 3 dias", days: 3 }, { label: "Em 1 semana", days: 7 }, { label: "Em 2 semanas", days: 14 }].map(({ label, days }) => (
                      <Button key={days} size="sm" variant="outline" className="h-7 text-xs"
                        onClick={() => void handleScheduleNext(days)} disabled={isSchedulingNext}>
                        {label}
                      </Button>
                    ))}
                    <Input
                      type="date"
                      className="h-7 text-xs w-36"
                      value={nextCustomDate}
                      onChange={(e) => setNextCustomDate(e.target.value)}
                      min={new Date().toISOString().split("T")[0]}
                    />
                    {nextCustomDate && (
                      <Button size="sm" variant="outline" className="h-7 text-xs"
                        onClick={() => void handleScheduleNext(0, nextCustomDate)} disabled={isSchedulingNext}>
                        {isSchedulingNext ? <Loader2 className="h-3 w-3 animate-spin" /> : "Agendar"}
                      </Button>
                    )}
                  </div>
                </div>

                {/* Fechar Negócio */}
                {spinData.activity.dealId && (
                  <div className="border-t border-border pt-3">
                    <Button size="sm" className="h-7 text-xs gap-1 w-full bg-emerald-600 hover:bg-emerald-700"
                      onClick={() => void handleCloseDeal()} disabled={isClosingDeal}>
                      {isClosingDeal ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                      Fechar Negócio
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ══ VIEW: RESUMO DE FECHAMENTO ═══════════════════════════════════ */}
        {activeTab === "briefing" && <>
        {activeView === "summary" && summary && (
          <div className="space-y-4 text-xs">
            <div className="flex items-center gap-2 font-semibold text-sm text-violet-700 dark:text-violet-300">
              <BrainCircuit className="h-4 w-4" />
              Resumo de Fechamento
            </div>

            {summary.resumoCliente && (
              <div className="space-y-1">
                <p className="font-medium text-muted-foreground uppercase tracking-wider text-[10px]">Perfil do Cliente</p>
                <p className="text-sm leading-relaxed">{summary.resumoCliente}</p>
              </div>
            )}

            {summary.doresPrincipais?.length > 0 && (
              <div className="space-y-1.5">
                <p className="font-medium text-muted-foreground uppercase tracking-wider text-[10px] flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 text-amber-500" /> Dores Identificadas
                </p>
                <ul className="space-y-1">
                  {summary.doresPrincipais.map((d, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {summary.pontosDeForte?.length > 0 && (
              <div className="space-y-1.5">
                <p className="font-medium text-muted-foreground uppercase tracking-wider text-[10px] flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-emerald-500" /> Argumentos de Fechamento
                </p>
                <ul className="space-y-1">
                  {summary.pontosDeForte.map((p, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {summary.comoContornarObjecoes?.length > 0 && (
              <div className="space-y-2">
                <p className="font-medium text-muted-foreground uppercase tracking-wider text-[10px] flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3 text-blue-500" /> Como Contornar Objeções
                </p>
                {summary.comoContornarObjecoes.map((o, i) => (
                  <div key={i} className="rounded-md bg-muted/40 border border-border p-2.5 space-y-1">
                    <p className="font-medium text-destructive/80">"{o.objecao}"</p>
                    <p className="text-muted-foreground">{o.argumento}</p>
                  </div>
                ))}
              </div>
            )}

            {summary.abordagemRecomendada && (
              <div className="rounded-md bg-violet-100 dark:bg-violet-900/30 border border-violet-200 dark:border-violet-700 p-3 flex items-start gap-2">
                <Zap className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-violet-700 dark:text-violet-300 text-[10px] uppercase tracking-wider mb-0.5">Abordagem Recomendada</p>
                  <p className="text-sm font-medium">{summary.abordagemRecomendada}</p>
                </div>
              </div>
            )}

            {summary.alertas?.length > 0 && (
              <div className="space-y-1.5">
                <p className="font-medium text-muted-foreground uppercase tracking-wider text-[10px] flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 text-red-500" /> Alertas
                </p>
                <ul className="space-y-1">
                  {summary.alertas.map((a, i) => (
                    <li key={i} className="flex items-start gap-2 text-destructive/80">
                      <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
                      <span>{a}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Loading do resumo */}
        {activeView === "summary" && isSummarizing && (
          <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
            <p className="text-sm">Analisando briefing e gerando resumo…</p>
          </div>
        )}

        {/* ══ VIEW: FORMULÁRIO ════════════════════════════════════════════ */}
        {activeView === "form" && (
          <>
        {/* ── Bloco 1: Contexto do cliente ─────────────────────────────────── */}
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold flex items-center gap-1.5 text-primary">
              <Target className="h-3.5 w-3.5" />
              Contexto do cliente
              {isGeneratingQuestions && (
                <span className="ml-2 text-muted-foreground font-normal flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Gerando perguntas…
                </span>
              )}
            </h3>
            {contextChanged && (
              <Button size="sm" variant="outline" className="h-6 text-xs gap-1" onClick={saveContext} disabled={savingContext}>
                {savingContext ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                Salvar
              </Button>
            )}
          </div>
          {lead && (
            <div className="text-xs text-muted-foreground flex flex-wrap gap-1.5">
              {lead.empresa && <span className="font-medium text-foreground">{lead.empresa}</span>}
              {lead.nome && lead.empresa && <span>·</span>}
              {lead.nome && <span>{lead.nome}</span>}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium">O que o cliente busca</label>
              <Textarea className="text-xs min-h-[56px]" placeholder={hints.briefingDemandaPlaceholder} value={demanda}
                onChange={(e) => { setDemanda(e.target.value); setContextChanged(true); }} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Segmento / mercado</label>
              <Input className="h-8 text-xs" placeholder={hints.briefingSegmentoPlaceholder} value={segmento}
                onChange={(e) => { setSegmento(e.target.value); setContextChanged(true); }} />
              <p className="text-[10px] text-muted-foreground">Salve e use "Regenerar perguntas" para personalizar com IA.</p>
            </div>
          </div>
        </div>

        {/* ── Bloco 2: Dados da abordagem ──────────────────────────────────── */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Dados da abordagem</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="space-y-1">
              <label className="text-xs font-medium">Tipo</label>
              <Select value={form.contactType} onValueChange={(v) => updateField("contactType", v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar…" /></SelectTrigger>
                <SelectContent>
                  {CONTACT_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Data</label>
              <Input type="date" className="h-8 text-xs" value={form.contactDate} onChange={(e) => updateField("contactDate", e.target.value)} />
            </div>
            <div className="col-span-2 space-y-1">
              <label className="text-xs font-medium">Quem abordou</label>
              <Select value={form.approachedBy} onValueChange={(v) => updateField("approachedBy", v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar…" /></SelectTrigger>
                <SelectContent>
                  {users?.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Canais utilizados</label>
            <div className="flex flex-wrap gap-1.5">
              {CHANNEL_OPTIONS.map((ch) => {
                const selected = form.channelsUsed.includes(ch.value);
                return (
                  <Badge key={ch.value} variant={selected ? "default" : "outline"} className="cursor-pointer text-xs"
                    onClick={() => {
                      const current = form.channelsUsed;
                      updateField("channelsUsed", selected ? current.filter((v) => v !== ch.value) : [...current, ch.value]);
                    }}>
                    {ch.label}
                  </Badge>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Bloco 3: SPIN (acordeão) ─────────────────────────────────────── */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Perguntas SPIN</h3>
            <Button
              size="sm"
              variant={segmento ? "default" : "outline"}
              className="h-7 text-xs gap-1.5"
              onClick={handleGenerateQuestions}
              disabled={isGeneratingQuestions}
              title={segmento ? `Gerar perguntas específicas para "${segmento}"` : "Preencha o segmento para perguntas personalizadas"}
            >
              {isGeneratingQuestions
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <Sparkles className="h-3 w-3" />}
              {isGeneratingQuestions
                ? "Gerando…"
                : segmento
                  ? `Gerar para "${segmento.length > 22 ? segmento.slice(0, 22) + "…" : segmento}"`
                  : "Gerar com IA"}
            </Button>
          </div>
          {!segmento && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-3 py-2">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Preencha o campo <span className="font-medium">Segmento / mercado</span> acima e clique em{" "}
                <span className="font-medium">Gerar com IA</span> para receber perguntas específicas ao tipo de negócio do cliente.
              </p>
            </div>
          )}
          {([
            { key: "situationAnswers" as const, letter: "S", title: "Situação", desc: "Contexto atual do negócio", color: "bg-blue-500" },
            { key: "problemAnswers" as const,   letter: "P", title: "Problema",  desc: "Dificuldades e gargalos",  color: "bg-amber-500", extra: "problemMinimized" as const },
            { key: "implicationAnswers" as const, letter: "I", title: "Implicação", desc: "Impacto dos problemas", color: "bg-blue-500", extra: "implicationEstimatedValue" as const },
            { key: "needAnswers" as const,      letter: "N", title: "Necessidade", desc: "Solução ideal e urgência", color: "bg-emerald-500", extra: "needThermometer" as const },
          ] as Array<{ key: keyof Pick<BriefingForm,"situationAnswers"|"problemAnswers"|"implicationAnswers"|"needAnswers">; letter: string; title: string; desc: string; color: string; extra?: string }>).map((section) => {
            const answered = form[section.key].filter((i) => i.answer?.trim()).length;
            const total = form[section.key].length;
            const isOpen = openSpin === section.letter;
            return (
              <div key={section.key} className="border rounded-lg overflow-hidden">
                <button type="button"
                  className="w-full flex items-center justify-between px-3 py-2.5 bg-muted/30 hover:bg-muted/50 transition-colors"
                  onClick={() => setOpenSpin(isOpen ? null : section.letter)}>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold text-white ${section.color}`}>
                      {section.letter}
                    </span>
                    <span className="text-xs font-semibold">{section.title}</span>
                    <span className="text-[10px] text-muted-foreground hidden sm:inline">— {section.desc}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {answered > 0 && (
                      <span className="text-[10px] text-muted-foreground">{answered}/{total}</span>
                    )}
                    {isOpen ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                  </div>
                </button>
                {isOpen && (
                  <div className="p-3 space-y-3 border-t bg-background">
                    {form[section.key].map((item, idx) => (
                      <div key={idx} className="space-y-1">
                        <p className="text-xs font-medium text-foreground">{item.question}</p>
                        <Textarea className="text-xs min-h-[52px]" placeholder={hints.briefingRespostaPlaceholder}
                          value={item.answer} onChange={(e) => updateAnswer(section.key, idx, e.target.value)} />
                      </div>
                    ))}
                    {section.extra === "problemMinimized" && (
                      <div className="flex items-center gap-2 pt-1">
                        <Switch checked={form.problemMinimized} onCheckedChange={(v) => updateField("problemMinimized", v)} />
                        <span className="text-xs">Prospect minimizou o problema</span>
                      </div>
                    )}
                    {section.extra === "implicationEstimatedValue" && (
                      <div className="space-y-1">
                        <label className="text-xs font-medium">Valor estimado do impacto</label>
                        <Input className="h-8 text-xs" placeholder={hints.briefingImpactoPlaceholder}
                          value={form.implicationEstimatedValue} onChange={(e) => updateField("implicationEstimatedValue", e.target.value)} />
                      </div>
                    )}
                    {section.extra === "needThermometer" && (
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium">Temperatura da necessidade</label>
                        <div className="flex flex-wrap gap-2">
                          {[
                            { value: "hot",  label: "Dor latente",       icon: Flame,     color: "bg-red-50 text-red-600 border-red-200" },
                            { value: "warm", label: "Interesse",          icon: CloudSun,  color: "bg-amber-50 text-amber-600 border-amber-200" },
                            { value: "cold", label: "Sem urgência",       icon: Snowflake, color: "bg-blue-50 text-blue-600 border-blue-200" },
                          ].map((opt) => {
                            const Icon = opt.icon;
                            const sel = form.needThermometer === opt.value;
                            return (
                              <Button key={opt.value} type="button" size="sm" variant="outline"
                                className={`text-xs gap-1 ${opt.color} ${sel ? "ring-2 ring-offset-1 ring-primary" : ""}`}
                                onClick={() => updateField("needThermometer", opt.value)}>
                                <Icon className="h-3 w-3" />{opt.label}
                              </Button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Bloco 4: Desfecho ────────────────────────────────────────────── */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Desfecho da abordagem</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Próximo passo */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Próximo passo</label>
              <div className="flex flex-wrap gap-1.5">
                {NEXT_STEP_OPTIONS.map((opt) => (
                  <Button key={opt.value} type="button" size="sm" variant="outline"
                    className={`text-xs h-7 ${form.nextStepType === opt.value ? "bg-primary text-primary-foreground border-primary" : ""}`}
                    onClick={() => updateField("nextStepType", opt.value)}>
                    {opt.label}
                  </Button>
                ))}
              </div>
              {form.nextStepType && form.nextStepType !== "open_door" && (
                <Input type="date" className="h-8 text-xs w-40" value={form.nextStepDate} onChange={(e) => updateField("nextStepDate", e.target.value)} />
              )}
            </div>
            {/* Porte */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Porte do prospect</label>
              <div className="flex flex-wrap gap-1.5">
                {PROSPECT_SIZE_OPTIONS.map((opt) => (
                  <Button key={opt.value} type="button" size="sm" variant="outline"
                    className={`text-xs h-7 ${form.prospectSize === opt.value ? "bg-primary text-primary-foreground border-primary" : ""}`}
                    onClick={() => updateField("prospectSize", opt.value)}>
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>
            {/* Objeções */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Objeções</label>
              <div className="space-y-1.5">
                {form.objections.map((obj, idx) => (
                  <div key={idx} className="flex items-start gap-1.5">
                    <div className="flex-1 space-y-1">
                      <Select value={obj.objection} onValueChange={(v) => updateObjection(idx, "objection", v)}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Objeção…" /></SelectTrigger>
                        <SelectContent>
                          {OBJECTION_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Textarea className="text-xs min-h-[36px]" placeholder="Resposta dada…"
                        value={obj.response} onChange={(e) => updateObjection(idx, "response", e.target.value)} />
                    </div>
                    <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0 mt-0.5" onClick={() => removeObjection(idx)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                <Button size="sm" variant="outline" className="text-xs gap-1 h-7 w-full" onClick={addObjection}>
                  <Plus className="h-3 w-3" /> Registrar objeção
                </Button>
              </div>
            </div>
            {/* Apresentação */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Material enviado</label>
              <div className="flex items-center gap-2">
                <Switch checked={form.presentationSent} onCheckedChange={(v) => updateField("presentationSent", v)} />
                <span className="text-xs">Apresentação enviada</span>
              </div>
              {form.presentationSent && (
                <div className="space-y-1.5">
                  <Input type="date" className="h-8 text-xs" value={form.presentationSentDate} onChange={(e) => updateField("presentationSentDate", e.target.value)} />
                  <Input className="h-8 text-xs" placeholder="Link da apresentação…" value={form.presentationLink} onChange={(e) => updateField("presentationLink", e.target.value)} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Bloco 5: Notas ───────────────────────────────────────────────── */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Notas livres</label>
          <Textarea className="text-xs min-h-[72px]" placeholder={hints.briefingNotasPlaceholder}
            value={form.freeNotes} onChange={(e) => updateField("freeNotes", e.target.value)} />
        </div>

        <div className="flex justify-end pt-2 border-t">
          <Button size="sm" className="text-xs gap-1" onClick={handleSave}
            disabled={isSaving || isSummarizing || !hasChanges} data-testid="btn-salvar-briefing-bottom">
            {(isSaving || isSummarizing) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            {isSummarizing ? "Gerando resumo…" : isSaving ? "Salvando…" : "Salvar e gerar resumo"}
          </Button>
        </div>
          </>
        )}
        {/* end briefing tab */}
        </>}
      </CardContent>
    </Card>
    </>
  );
}
