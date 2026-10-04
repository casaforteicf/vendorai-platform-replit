import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { isAgentAllowedForVertical } from "@/lib/verticalAgentPolicy";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  UserSearch,
  Handshake,
  BarChart2,
  AlertCircle,
  Headphones,
  CalendarCheck,
  Star,
  Telescope,
  Loader2,
  Paperclip,
  BookOpen,
  Upload,
  X,
  FileText,
  Sparkles,
  CheckCircle2,
  HelpCircle,
  Pill,
  Search,
  Workflow,
  Settings2,
  Bot,
  ArrowRight,
  TestTube2,
  type LucideIcon,
} from "lucide-react";

// ── Tipos ──────────────────────────────────────────────────────────────────────

type SpinQuestion = {
  fieldKey: string;
  label: string;
  tipo: "situacao" | "problema" | "implicacao" | "necessidade";
  pergunta: string;
};

type SpinQualificationConfig = {
  nicheDescription: string;
  questions: SpinQuestion[];
  approvedAt: string | null;
};

const SPIN_TIPO_LABEL: Record<SpinQuestion["tipo"], string> = {
  situacao:    "Situação",
  problema:    "Problema",
  implicacao:  "Implicação",
  necessidade: "Necessidade",
};

const SPIN_TIPO_COLOR: Record<SpinQuestion["tipo"], string> = {
  situacao:    "bg-blue-50 text-blue-700 border-blue-200",
  problema:    "bg-orange-50 text-orange-700 border-orange-200",
  implicacao:  "bg-purple-50 text-purple-700 border-purple-200",
  necessidade: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

type AgentAttachment = {
  name: string;
  objectPath: string;
  mimeType: string;
  size?: number;
};

type AgentCardData = {
  agentKey: string;
  nome: string;
  descricao: string;
  categoria: string;
  ativo: boolean;
  nomePerfil: string | null;
  tom: string;
  restricoes: string | null;
  systemPromptBase: string;
  systemPromptCustom: string | null;
  parametros: Record<string, unknown> | null;
  knowledgeBaseIds?: string[] | null;
};

type TomOption = { value: string; label: string };
const TOM_OPTIONS: TomOption[] = [
  { value: "profissional", label: "Profissional" },
  { value: "amigavel",     label: "Amigável" },
  { value: "tecnico",      label: "Técnico" },
  { value: "vendedor",     label: "Vendedor" },
  { value: "neutro",       label: "Neutro" },
];

// ── Metadados estáticos por agentKey ──────────────────────────────────────────

const AGENT_META: Record<string, { icon: LucideIcon; descricaoFallback: string }> = {
  recepcao:     { icon: Bot,           descricaoFallback: "Primeiro contato, entendimento da necessidade e encaminhamento para o agente correto" },
  sdr:          { icon: UserSearch,    descricaoFallback: "Prospecção ativa e primeiro contato com novos leads" },
  closer:       { icon: Handshake,     descricaoFallback: "Fechamento de negócios e tratamento de objeções" },
  financeiro:   { icon: BarChart2,     descricaoFallback: "Suporte financeiro e esclarecimento de dúvidas" },
  cobranca:     { icon: AlertCircle,   descricaoFallback: "Acompanhamento de inadimplências e cobranças" },
  suporte:      { icon: Headphones,    descricaoFallback: "Atendimento pós-venda e resolução de problemas" },
  agendamento:  { icon: CalendarCheck, descricaoFallback: "Agendamento de reuniões e visitas comerciais" },
  pos_venda:    { icon: Star,          descricaoFallback: "Relacionamento e fidelização de clientes ativos" },
  prospector:   { icon: Telescope,     descricaoFallback: "Descoberta e captação de novos prospects" },
  farmacia:     { icon: Pill,          descricaoFallback: "Atendimento de medicamentos, receitas, pedidos e entregas da farmácia" },
};

const FLOW_ORDER = [
  "prospector",
  "recepcao",
  "sdr",
  "closer",
  "agendamento",
  "pos_venda",
  "financeiro",
  "cobranca",
  "suporte",
  "farmacia",
];

function normalizeText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function getAttachmentCount(agent: AgentCardData) {
  const raw = agent.parametros?.["attachments"];
  return Array.isArray(raw) ? raw.length : 0;
}

function getConfigurationScore(agent: AgentCardData) {
  const checks = [
    Boolean(agent.nomePerfil),
    Boolean(agent.tom),
    Boolean(agent.restricoes),
    Boolean(agent.systemPromptCustom),
    Boolean(agent.knowledgeBaseIds?.length),
    getAttachmentCount(agent) > 0,
  ];
  const completed = checks.filter(Boolean).length;
  return Math.round((completed / checks.length) * 100);
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("vendorai_token");
  return token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

async function fetchAgentConfigs(): Promise<AgentCardData[]> {
  const res = await fetch("/api/agent-configs", { headers: authHeaders() });
  if (!res.ok) throw new Error(`Erro ao buscar agentes: ${res.status}`);
  return res.json();
}

async function toggleAgent(agentKey: string, activate: boolean) {
  const action = activate ? "activate" : "deactivate";
  const res = await fetch(`/api/agent-configs/${agentKey}/${action}`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Erro ao ${activate ? "ativar" : "desativar"} agente`);
  return res.json() as Promise<{ agentKey: string; ativo: boolean }>;
}

async function patchAgent(agentKey: string, body: Partial<AgentCardData>) {
  const res = await fetch(`/api/agent-configs/${agentKey}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Erro ao salvar configuração: ${res.status}`);
  return res.json();
}

type TestResult = { resposta: string; tokensUsed: number; tom: string };

async function testAgent(agentKey: string, mensagem: string): Promise<TestResult> {
  const res = await fetch(`/api/agent-configs/${agentKey}/test`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ mensagem }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Erro ${res.status}`);
  }
  return res.json();
}

async function resetAgentPrompt(agentKey: string) {
  const res = await fetch(`/api/agent-configs/${agentKey}/reset`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Erro ao resetar prompt: ${res.status}`);
  return res.json();
}

// ── Skeleton de carregamento ───────────────────────────────────────────────────

function AgentCardSkeleton() {
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-lg" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-16" />
        </div>
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-3/4" />
      <Skeleton className="h-12 w-full" />
      <div className="flex items-center justify-between pt-1">
        <Skeleton className="h-5 w-20 rounded-full" />
        <Skeleton className="h-8 w-40 rounded-md" />
      </div>
    </Card>
  );
}

// ── Card individual ────────────────────────────────────────────────────────────

function AgentCard({
  agent,
  onToggle,
  toggling,
  onConfigure,
  onTest,
}: {
  agent: AgentCardData;
  onToggle: (agentKey: string, activate: boolean) => void;
  toggling: boolean;
  onConfigure: (agent: AgentCardData) => void;
  onTest: (agent: AgentCardData) => void;
}) {
  const meta = AGENT_META[agent.agentKey];
  const Icon = meta?.icon ?? UserSearch;
  const descricao = agent.descricao || meta?.descricaoFallback || "";
  const nome = agent.nomePerfil || agent.nome;
  const knowledgeCount = agent.knowledgeBaseIds?.length ?? 0;
  const attachmentCount = getAttachmentCount(agent);
  const configScore = getConfigurationScore(agent);

  return (
    <Card className="group flex flex-col border-border/80 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      <CardHeader className="pb-2">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm leading-tight truncate">{nome}</p>
            <p className="text-xs text-muted-foreground capitalize">{agent.categoria}</p>
          </div>
          <Badge
            variant="outline"
            className={
              !agent.ativo
                ? "border-border bg-muted/50 text-muted-foreground"
                : configScore < 70
                  ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400"
            }
          >
            <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${!agent.ativo ? "bg-muted-foreground/50" : configScore < 70 ? "bg-amber-500" : "bg-emerald-500"}`} />
            {!agent.ativo ? "Desativado" : configScore < 70 ? "Configuração pendente" : "Operando"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-4 pt-0">
        <p className="min-h-[40px] text-sm text-muted-foreground leading-snug">{descricao}</p>

        <div className="grid grid-cols-3 gap-2 rounded-lg border bg-muted/20 p-2.5">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Config.</p>
            <p className="mt-0.5 text-sm font-semibold">{configScore}%</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Conhecimento</p>
            <p className="mt-0.5 text-sm font-semibold">{knowledgeCount}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Arquivos</p>
            <p className="mt-0.5 text-sm font-semibold">{attachmentCount}</p>
          </div>
        </div>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t pt-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch
              checked={agent.ativo}
              disabled={toggling}
              onCheckedChange={(checked) => onToggle(agent.agentKey, checked)}
              aria-label={`${agent.ativo ? "Desativar" : "Ativar"} agente ${nome}`}
            />
            {agent.ativo ? "Ativo" : "Desativado"}
          </label>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => onTest(agent)}>
              <TestTube2 className="mr-1.5 h-3.5 w-3.5" />
              Testar
            </Button>
            <Button variant="outline" size="sm" onClick={() => onConfigure(agent)}>
              <Settings2 className="mr-1.5 h-3.5 w-3.5" />
              Configurar
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Sheet de configuração ──────────────────────────────────────────────────────

function AgentConfigSheet({
  agent,
  onClose,
  onSaved,
  initialTab = "perfil",
}: {
  agent: AgentCardData;
  onClose: () => void;
  onSaved: (updated: Partial<AgentCardData>) => void;
  initialTab?: "perfil" | "prompt" | "arquivos" | "conhecimento" | "qualificacao" | "teste";
}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const meta = AGENT_META[agent.agentKey];
  const Icon = meta?.icon ?? UserSearch;

  // ── Form state ──
  const [nomePerfil, setNomePerfil]               = useState(agent.nomePerfil ?? "");
  const [tom, setTom]                             = useState(agent.tom ?? "profissional");
  const [restricoes, setRestricoes]               = useState(agent.restricoes ?? "");
  const [briefingNotes, setBriefingNotes]         = useState("");
  const [briefingResult, setBriefingResult]       = useState<string | null>(null);
  const [compilingBriefing, setCompilingBriefing] = useState(false);

  async function compileBriefing() {
    setCompilingBriefing(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/agent-configs/compile-briefing`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` },
        body: JSON.stringify({ notes: briefingNotes || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Não foi possível compilar", description: data.error, variant: "destructive" });
        return;
      }
      setBriefingResult(data.briefing);
      toast({ title: "Contexto da empresa aplicado a todos os agentes." });
    } catch {
      toast({ title: "Erro de conexão ao compilar", variant: "destructive" });
    } finally {
      setCompilingBriefing(false);
    }
  }
  const [systemPromptCustom, setSystemPromptCustom] = useState(agent.systemPromptCustom ?? "");

  // ── SPIN qualification state (SDR only) ──
  const initSpinConfig = (): SpinQualificationConfig | null => {
    const raw = agent.parametros?.["spinQualification"];
    if (!raw || typeof raw !== "object") return null;
    return raw as SpinQualificationConfig;
  };
  const [spinConfig, setSpinConfig]             = useState<SpinQualificationConfig | null>(initSpinConfig);
  const [spinNicheDesc, setSpinNicheDesc]       = useState<string>(() => initSpinConfig()?.nicheDescription ?? "");
  const [spinDraftQuestions, setSpinDraftQuestions] = useState<SpinQuestion[]>(() => initSpinConfig()?.questions ?? []);
  const [spinGenerating, setSpinGenerating]     = useState(false);
  const [spinGenError, setSpinGenError]         = useState<string | null>(null);

  // ── Arquivos state ──
  const initAttachments = (): AgentAttachment[] => {
    const raw = agent.parametros?.["attachments"];
    return Array.isArray(raw) ? (raw as AgentAttachment[]) : [];
  };
  const [attachments, setAttachments] = useState<AgentAttachment[]>(initAttachments);
  const [uploading, setUploading]     = useState(false);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const token = localStorage.getItem("vendorai_token") ?? "";
      const presignRes = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, fileSize: file.size, contentType: file.type, isPublic: false }),
      });
      if (!presignRes.ok) throw new Error("Erro ao obter URL de upload");
      const { uploadUrl, objectPath } = await presignRes.json() as { uploadUrl: string; objectPath: string };

      const putRes = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!putRes.ok) throw new Error("Erro ao enviar arquivo");

      const newAttachment: AgentAttachment = { name: file.name, objectPath, mimeType: file.type, size: file.size };
      const next = [...attachments, newAttachment];
      setAttachments(next);

      await patchAgent(agent.agentKey, { parametros: { ...((agent.parametros ?? {}) as Record<string,unknown>), attachments: next } } as Partial<AgentCardData>);
      toast({ title: "Arquivo enviado", description: file.name });
    } catch (err) {
      toast({ title: "Erro no upload", description: err instanceof Error ? err.message : "Falha ao enviar arquivo", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  // ── Conhecimento (base compartilhada do tenant) state ──
  interface KnowledgeEntry { id: string; titulo: string; categoria: string; tags: string[] }
  const { data: knowledgeEntries = [], isLoading: knowledgeLoading } = useQuery<KnowledgeEntry[]>({
    queryKey: ["knowledge-base", tenantId],
    queryFn: () =>
      fetch(`/api/tenants/${tenantId}/knowledge-base`, { headers: { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` } })
        .then((r) => r.json()),
    enabled: !!tenantId,
  });
  const [selectedKnowledgeIds, setSelectedKnowledgeIds] = useState<string[]>(
    Array.isArray(agent.knowledgeBaseIds) ? agent.knowledgeBaseIds : []
  );
  const [savingKnowledge, setSavingKnowledge] = useState(false);

  async function toggleKnowledgeEntry(id: string) {
    const next = selectedKnowledgeIds.includes(id)
      ? selectedKnowledgeIds.filter((k) => k !== id)
      : [...selectedKnowledgeIds, id];
    setSelectedKnowledgeIds(next);
    setSavingKnowledge(true);
    try {
      await patchAgent(agent.agentKey, { knowledgeBaseIds: next } as Partial<AgentCardData>);
    } catch {
      setSelectedKnowledgeIds(selectedKnowledgeIds);
      toast({ title: "Erro ao salvar seleção", variant: "destructive" });
    } finally {
      setSavingKnowledge(false);
    }
  }

  async function handleRemoveAttachment(idx: number) {
    const next = attachments.filter((_, i) => i !== idx);
    setAttachments(next);
    await patchAgent(agent.agentKey, { parametros: { ...((agent.parametros ?? {}) as Record<string,unknown>), attachments: next } } as Partial<AgentCardData>);
    toast({ title: "Arquivo removido" });
  }

  // ── SPIN handlers ──
  async function handleGenerateSpinQuestions() {
    if (!spinNicheDesc.trim()) return;
    setSpinGenerating(true);
    setSpinGenError(null);
    try {
      const res = await fetch(`/api/agent-configs/${agent.agentKey}/spin-questions/generate`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ nicheDescription: spinNicheDesc.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Erro ${res.status}`);
      }
      const data = await res.json() as { questions?: SpinQuestion[] };
      setSpinDraftQuestions(data.questions ?? []);
    } catch (err) {
      setSpinGenError(err instanceof Error ? err.message : "Erro ao gerar perguntas");
    } finally {
      setSpinGenerating(false);
    }
  }

  function handleUpdateSpinQuestion(idx: number, pergunta: string) {
    setSpinDraftQuestions((prev) => prev.map((q, i) => i === idx ? { ...q, pergunta } : q));
  }

  const saveSpinMutation = useMutation({
    mutationFn: async () => {
      const newConfig: SpinQualificationConfig = {
        nicheDescription: spinNicheDesc.trim(),
        questions: spinDraftQuestions,
        approvedAt: new Date().toISOString(),
      };
      const existingParametros = (agent.parametros ?? {}) as Record<string, unknown>;
      await patchAgent(agent.agentKey, {
        parametros: { ...existingParametros, spinQualification: newConfig },
      } as Partial<AgentCardData>);
      return newConfig;
    },
    onSuccess: (newConfig) => {
      setSpinConfig(newConfig);
      toast({ title: "Qualificação salva", description: "Perguntas customizadas aprovadas e ativas para o SDR." });
    },
    onError: () => {
      toast({ title: "Erro ao salvar", description: "Não foi possível salvar as perguntas de qualificação.", variant: "destructive" });
    },
  });

  async function handleClearSpinConfig() {
    const existingParametros = (agent.parametros ?? {}) as Record<string, unknown>;
    const { spinQualification: _, ...rest } = existingParametros;
    await patchAgent(agent.agentKey, { parametros: rest } as Partial<AgentCardData>);
    setSpinConfig(null);
    setSpinDraftQuestions([]);
    setSpinNicheDesc("");
    toast({ title: "Qualificação removida", description: "O SDR voltará a usar a qualificação genérica B2B." });
  }

  // ── Mutation salvar ──
  const saveMutation = useMutation({
    mutationFn: () =>
      patchAgent(agent.agentKey, {
        nomePerfil: nomePerfil || null,
        tom,
        restricoes: restricoes || null,
        systemPromptCustom: systemPromptCustom || null,
        parametros: { ...((agent.parametros ?? {}) as Record<string,unknown>), attachments },
      } as Partial<AgentCardData>),
    onSuccess: () => {
      toast({ title: "Configuração salva", description: "As alterações foram aplicadas ao agente." });
      onSaved({ nomePerfil: nomePerfil || null, tom, restricoes: restricoes || null, systemPromptCustom: systemPromptCustom || null });
      onClose();
    },
    onError: () => {
      toast({ title: "Erro ao salvar", description: "Não foi possível salvar as configurações.", variant: "destructive" });
    },
  });

  // ── Aba Teste state ──
  const [testMessage, setTestMessage]   = useState("");
  const [testResult, setTestResult]     = useState<TestResult | null>(null);
  const [testError, setTestError]       = useState<string | null>(null);

  const testMutation = useMutation({
    mutationFn: () => testAgent(agent.agentKey, testMessage),
    onSuccess: (data) => {
      setTestResult(data);
      setTestError(null);
    },
    onError: (err) => {
      setTestError(err instanceof Error ? err.message : "Erro ao chamar o agente");
      setTestResult(null);
    },
  });

  function handleClearTest() {
    setTestMessage("");
    setTestResult(null);
    setTestError(null);
  }

  // ── Mutation reset ──
  const resetMutation = useMutation({
    mutationFn: () => resetAgentPrompt(agent.agentKey),
    onSuccess: () => {
      setSystemPromptCustom("");
      toast({ title: "Prompt resetado", description: "Voltou ao padrão Vendor.ai." });
    },
    onError: () => {
      toast({ title: "Erro ao resetar", description: "Não foi possível resetar o prompt.", variant: "destructive" });
    },
  });

  const nomePerfil_ = nomePerfil || agent.nome;

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-[560px] flex flex-col gap-0 p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-base leading-tight truncate">{nomePerfil_}</SheetTitle>
              <p className="text-xs text-muted-foreground capitalize">{agent.categoria}</p>
            </div>
            <Badge
              variant="outline"
              className={agent.ativo ? "border-emerald-200 bg-emerald-50 text-emerald-700" : ""}
            >
              {agent.ativo ? "Operando" : "Desativado"}
            </Badge>
          </div>
        </SheetHeader>

        <Tabs defaultValue={initialTab} className="flex-1 flex flex-col overflow-hidden">
          <div className="overflow-x-auto px-6 pt-4">
            <TabsList className="w-max min-w-full justify-start">
              <TabsTrigger value="perfil">Perfil</TabsTrigger>
              <TabsTrigger value="prompt">Prompt</TabsTrigger>
              <TabsTrigger value="arquivos">
                <Paperclip className="h-3.5 w-3.5 mr-1.5" />
                Arquivos
                {attachments.length > 0 && (
                  <span className="ml-1.5 rounded-full bg-primary/15 text-primary text-[10px] font-semibold px-1.5 py-0.5 leading-none">{attachments.length}</span>
                )}
              </TabsTrigger>
              <TabsTrigger value="conhecimento">
                <BookOpen className="h-3.5 w-3.5 mr-1.5" />
                Conhecimento
                {selectedKnowledgeIds.length > 0 && (
                  <span className="ml-1.5 rounded-full bg-primary/15 text-primary text-[10px] font-semibold px-1.5 py-0.5 leading-none">{selectedKnowledgeIds.length}</span>
                )}
              </TabsTrigger>
              {agent.agentKey === "sdr" && (
                <TabsTrigger value="qualificacao">
                  <HelpCircle className="h-3.5 w-3.5 mr-1.5" />
                  Qualificação
                  {spinConfig?.approvedAt && <CheckCircle2 className="ml-1.5 h-3 w-3 text-emerald-500" />}
                </TabsTrigger>
              )}
              <TabsTrigger value="teste">Teste</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="perfil" className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="nomePerfil">Nome do perfil</Label>
              <Input id="nomePerfil" value={nomePerfil} onChange={(e) => setNomePerfil(e.target.value)} placeholder={agent.nome} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tom">Tom de comunicação</Label>
              <Select value={tom} onValueChange={setTom}>
                <SelectTrigger id="tom"><SelectValue placeholder="Selecione o tom" /></SelectTrigger>
                <SelectContent>
                  {TOM_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="restricoes">Restrições</Label>
              <Textarea id="restricoes" value={restricoes} onChange={(e) => setRestricoes(e.target.value)} placeholder="Ex: Nunca mencionar concorrentes. Não prometer prazos." rows={4} />
            </div>
          </TabsContent>

          <TabsContent value="prompt" className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
            <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/[0.03] p-4">
              <div>
                <Label className="text-sm font-semibold">Contexto da empresa (IA) — vale pra todos os agentes</Label>
                <p className="text-xs text-muted-foreground mt-1">Compila o Perfil do Negócio (Configurações) num briefing curto e aplica automaticamente como contexto fixo em todos os seus agentes — não mexe nas regras/metodologia de cada um, só garante que sabem o que sua empresa vende.</p>
              </div>
              <Textarea value={briefingNotes} onChange={(e) => setBriefingNotes(e.target.value)} placeholder="Observação extra pra IA considerar (opcional): objeção comum, algo que o agente nunca deve dizer, etc." rows={2} />
              <Button size="sm" onClick={compileBriefing} disabled={compilingBriefing}>{compilingBriefing ? "Compilando…" : "Compilar e aplicar com IA"}</Button>
              {briefingResult && <div className="rounded-md bg-background border p-3 text-sm text-muted-foreground whitespace-pre-wrap">{briefingResult}</div>}
            </div>
            <div className="space-y-2">
              <Label>Prompt padrão Vendor.ai</Label>
              <Textarea value={agent.systemPromptBase} readOnly rows={6} className="bg-muted/50 text-muted-foreground resize-none cursor-default focus-visible:ring-0" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="systemPromptCustom">Sua personalização</Label>
              <Textarea id="systemPromptCustom" value={systemPromptCustom} onChange={(e) => setSystemPromptCustom(e.target.value)} placeholder="Deixe vazio para usar o padrão. Preencha para substituir." rows={8} />
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild><Button variant="outline" size="sm" disabled={resetMutation.isPending}>{resetMutation.isPending ? "Resetando…" : "Resetar para padrão"}</Button></AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Resetar prompt personalizado?</AlertDialogTitle>
                  <AlertDialogDescription>Isso irá remover toda a personalização de prompt deste agente e voltar ao padrão Vendor.ai. Essa ação não pode ser desfeita.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => resetMutation.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Confirmar reset</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </TabsContent>

          <TabsContent value="arquivos" className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            <div className="space-y-1">
              <p className="text-sm font-medium">Arquivos do agente</p>
              <p className="text-xs text-muted-foreground">A IA conhece estes arquivos e decide quando enviar cada um com base no contexto do lead. Você pode ter arquivos diferentes para segmentos distintos — a IA escolhe o mais adequado.</p>
            </div>
            <div>
              <Label htmlFor="file-upload" className={`inline-flex items-center gap-2 px-4 py-2 rounded-md border text-sm font-medium cursor-pointer transition-colors ${uploading ? "opacity-50 cursor-not-allowed bg-muted text-muted-foreground" : "bg-background hover:bg-accent text-foreground border-input"}`}>
                {uploading ? <><Loader2 className="h-4 w-4 animate-spin" />Enviando…</> : <><Upload className="h-4 w-4" />Adicionar arquivo</>}
              </Label>
              <input id="file-upload" type="file" className="sr-only" disabled={uploading} onChange={handleFileUpload} accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.png,.jpg,.jpeg,.gif,.webp,.mp4,.mp3" />
            </div>
            {attachments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 rounded-lg border border-dashed text-muted-foreground gap-2"><Paperclip className="h-8 w-8 opacity-30" /><p className="text-sm">Nenhum arquivo adicionado</p></div>
            ) : (
              <ul className="space-y-2">
                {attachments.map((att, idx) => (
                  <li key={idx} className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{att.name}</p>
                      {att.size !== undefined && <p className="text-xs text-muted-foreground">{att.size < 1024 * 1024 ? `${(att.size / 1024).toFixed(1)} KB` : `${(att.size / (1024 * 1024)).toFixed(1)} MB`}</p>}
                    </div>
                    <button type="button" onClick={() => handleRemoveAttachment(idx)} className="shrink-0 rounded-sm p-0.5 text-muted-foreground hover:text-destructive transition-colors" title="Remover arquivo"><X className="h-4 w-4" /></button>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="conhecimento" className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30 px-3 py-2.5 flex items-start gap-2">
              <BookOpen className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700 dark:text-blue-400">Marque quais itens da base de conhecimento do tenant este agente deve usar como contexto. Pra adicionar novos itens, vá em <span className="font-medium">Base de Conhecimento</span> no menu.</p>
            </div>
            {knowledgeLoading ? (
              <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
            ) : knowledgeEntries.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground"><BookOpen className="h-8 w-8 mx-auto mb-2 opacity-30" /><p className="text-sm">Nenhum item na base de conhecimento ainda.</p><p className="text-xs mt-1">Vá em "Base de Conhecimento" no menu pra adicionar catálogos e materiais.</p></div>
            ) : (
              <ul className="space-y-2">
                {knowledgeEntries.map((entry) => {
                  const checked = selectedKnowledgeIds.includes(entry.id);
                  return (
                    <li key={entry.id}>
                      <label className="flex items-start gap-3 rounded-lg border bg-card px-3 py-2.5 cursor-pointer hover:bg-muted/40 transition-colors">
                        <Checkbox checked={checked} disabled={savingKnowledge} onCheckedChange={() => toggleKnowledgeEntry(entry.id)} className="mt-0.5" />
                        <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{entry.titulo}</p><div className="flex items-center gap-1.5 flex-wrap mt-1"><Badge variant="outline" className="text-xs">{entry.categoria}</Badge>{entry.tags.map((t) => <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>)}</div></div>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </TabsContent>

          {agent.agentKey === "sdr" && (
            <TabsContent value="qualificacao" className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
              <div className="space-y-1"><p className="text-sm font-medium">Qualificação por nicho</p><p className="text-xs text-muted-foreground">Descreva seu negócio e a IA gera perguntas SPIN adaptadas ao seu contexto. O SDR usará essas perguntas no lugar da qualificação genérica B2B.</p></div>
              {spinConfig?.approvedAt && <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4 shrink-0" /><span>Qualificação customizada ativa — {spinConfig.questions.length} perguntas aprovadas</span></div>}
              <div className="space-y-2"><Label htmlFor="spinNicheDesc">Descrição do nicho</Label><Textarea id="spinNicheDesc" value={spinNicheDesc} onChange={(e) => setSpinNicheDesc(e.target.value)} placeholder="Ex: Loja de móveis planejados que vende direto ao consumidor final. Produtos: dormitórios, cozinhas, home offices." rows={3} /></div>
              <Button onClick={handleGenerateSpinQuestions} disabled={spinGenerating || !spinNicheDesc.trim()} variant="outline">{spinGenerating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Gerando…</> : <><Sparkles className="mr-2 h-4 w-4" />Gerar perguntas com IA</>}</Button>
              {spinGenError && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{spinGenError}</AlertDescription></Alert>}
              {spinDraftQuestions.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Perguntas geradas — edite antes de aprovar</p>
                  <ul className="space-y-3">
                    {spinDraftQuestions.map((q, idx) => (
                      <li key={idx} className="rounded-lg border bg-card p-3 space-y-2">
                        <div className="flex items-center gap-2"><span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${SPIN_TIPO_COLOR[q.tipo]}`}>{SPIN_TIPO_LABEL[q.tipo]}</span><span className="text-xs text-muted-foreground">{q.label}</span></div>
                        <Textarea value={q.pergunta} onChange={(e) => handleUpdateSpinQuestion(idx, e.target.value)} rows={2} className="text-sm resize-none" />
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-center gap-2">
                    <Button onClick={() => saveSpinMutation.mutate()} disabled={saveSpinMutation.isPending}>{saveSpinMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando…</> : <><CheckCircle2 className="mr-2 h-4 w-4" />Aprovar e ativar</>}</Button>
                    {spinConfig?.approvedAt && <Button variant="ghost" size="sm" onClick={handleClearSpinConfig} className="text-muted-foreground hover:text-destructive">Remover qualificação customizada</Button>}
                  </div>
                </div>
              )}
              {spinDraftQuestions.length === 0 && !spinConfig?.approvedAt && <div className="flex flex-col items-center justify-center py-10 rounded-lg border border-dashed text-muted-foreground gap-2"><HelpCircle className="h-8 w-8 opacity-30" /><p className="text-sm">Descreva o nicho acima e clique em "Gerar perguntas"</p></div>}
            </TabsContent>
          )}

          <TabsContent value="teste" className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">Simule uma conversa antes de publicar mudanças. O teste usa a configuração real deste agente e não altera leads nem conversas.</div>
            <div className="space-y-2"><Label htmlFor="testMessage">Mensagem de teste</Label><Textarea id="testMessage" value={testMessage} onChange={(e) => setTestMessage(e.target.value)} placeholder="Ex: Olá, vi o anúncio de vocês e queria mais informações" rows={3} /></div>
            <div className="flex gap-2"><Button onClick={() => testMutation.mutate()} disabled={testMutation.isPending || !testMessage.trim()}>{testMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Testando…</> : "Testar agente"}</Button><Button variant="outline" onClick={handleClearTest} disabled={testMutation.isPending}>Limpar</Button></div>
            {testError && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{testError}</AlertDescription></Alert>}
            {testResult && <div className="rounded-lg border bg-card overflow-hidden"><div className="px-4 py-3"><p className="text-sm leading-relaxed whitespace-pre-wrap">{testResult.resposta}</p></div><div className="px-4 py-2 border-t bg-muted/40 flex items-center justify-between gap-2"><span className="text-xs text-muted-foreground">Tokens: {testResult.tokensUsed}</span><Badge variant="secondary" className="text-xs capitalize">Tom: {testResult.tom}</Badge></div></div>}
          </TabsContent>
        </Tabs>

        <SheetFooter className="px-6 py-4 border-t flex flex-row gap-2 justify-end">
          <SheetClose asChild><Button variant="outline" onClick={onClose}>Cancelar</Button></SheetClose>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>{saveMutation.isPending ? "Salvando…" : "Salvar"}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ── Página principal ───────────────────────────────────────────────────────────

export default function AgentConfig() {
  const { user, tenantOverride } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedAgent, setSelectedAgent] = useState<AgentCardData | null>(null);
  const [selectedTab, setSelectedTab] = useState<"perfil" | "teste">("perfil");
  const [togglingKeys, setTogglingKeys] = useState<Set<string>>(new Set());
  const [view, setView] = useState<"agents" | "flow">("agents");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");

  const QUERY_KEY = ["agent-configs", user?.tenantId];

  const { data: agents, isLoading, isError, error } = useQuery<AgentCardData[]>({
    queryKey: QUERY_KEY,
    queryFn: fetchAgentConfigs,
    enabled: !!user?.tenantId,
  });
  const effectiveVertical = tenantOverride?.vertical ?? user?.tenantVertical;
  const visibleAgents = (agents ?? []).filter((agent) =>
    isAgentAllowedForVertical(agent.agentKey, effectiveVertical)
  );

  const categories = useMemo(() => {
    const values = Array.from(new Set(visibleAgents.map((agent) => agent.categoria).filter(Boolean)));
    return values.sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [visibleAgents]);

  const filteredAgents = useMemo(() => {
    const term = normalizeText(search.trim());
    return visibleAgents.filter((agent) => {
      const matchesCategory = category === "all" || agent.categoria === category;
      if (!matchesCategory) return false;
      if (!term) return true;
      return [agent.nome, agent.nomePerfil ?? "", agent.descricao, agent.categoria]
        .some((value) => normalizeText(value).includes(term));
    });
  }, [visibleAgents, search, category]);

  const activeCount = visibleAgents.filter((agent) => agent.ativo).length;
  const inactiveCount = visibleAgents.length - activeCount;
  const customizedCount = visibleAgents.filter((agent) => getConfigurationScore(agent) >= 50).length;
  const knowledgeReadyCount = visibleAgents.filter((agent) => (agent.knowledgeBaseIds?.length ?? 0) > 0 || getAttachmentCount(agent) > 0).length;

  const flowAgents = useMemo(() => {
    const index = new Map(FLOW_ORDER.map((key, position) => [key, position]));
    return [...visibleAgents].sort((a, b) => (index.get(a.agentKey) ?? 999) - (index.get(b.agentKey) ?? 999));
  }, [visibleAgents]);

  const toggleMutation = useMutation({
    mutationFn: ({ agentKey, activate }: { agentKey: string; activate: boolean }) => toggleAgent(agentKey, activate),
    onMutate: async ({ agentKey, activate }) => {
      setTogglingKeys((prev) => new Set(prev).add(agentKey));
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const prev = queryClient.getQueryData<AgentCardData[]>(QUERY_KEY);
      queryClient.setQueryData<AgentCardData[]>(QUERY_KEY, (old) => old?.map((a) => (a.agentKey === agentKey ? { ...a, ativo: activate } : a)) ?? []);
      return { prev };
    },
    onError: (_err, { agentKey }, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(QUERY_KEY, ctx.prev);
      toast({ title: "Erro ao atualizar agente", description: "Não foi possível alterar o status. Tente novamente.", variant: "destructive" });
      setTogglingKeys((prev) => { const s = new Set(prev); s.delete(agentKey); return s; });
    },
    onSettled: (_data, _err, { agentKey }) => {
      setTogglingKeys((prev) => { const s = new Set(prev); s.delete(agentKey); return s; });
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onSuccess: (_data, { activate }) => {
      toast({ title: activate ? "Agente ativado" : "Agente desativado", description: activate ? "O agente está habilitado e disponível no fluxo de atendimento." : "O agente foi desativado." });
    },
  });

  function handleToggle(agentKey: string, activate: boolean) {
    toggleMutation.mutate({ agentKey, activate });
  }

  function handleConfigure(agent: AgentCardData) {
    setSelectedTab("perfil");
    setSelectedAgent(agent);
  }

  function handleTest(agent: AgentCardData) {
    setSelectedTab("teste");
    setSelectedAgent(agent);
  }

  function handleSheetClose() {
    setSelectedAgent(null);
  }

  function handleSaved(agentKey: string, updated: Partial<AgentCardData>) {
    queryClient.setQueryData<AgentCardData[]>(QUERY_KEY, (old) => old?.map((a) => (a.agentKey === agentKey ? { ...a, ...updated } : a)) ?? []);
    setSelectedAgent(null);
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Agentes de IA</h1>
          <p className="text-muted-foreground text-sm mt-1">Configure, acompanhe e organize sua equipe de agentes de inteligência artificial.</p>
        </div>
        <div className="inline-flex w-fit rounded-lg border bg-card p-1">
          <Button variant={view === "agents" ? "secondary" : "ghost"} size="sm" onClick={() => setView("agents")}><Bot className="mr-1.5 h-4 w-4" />Agentes</Button>
          <Button variant={view === "flow" ? "secondary" : "ghost"} size="sm" onClick={() => setView("flow")}><Workflow className="mr-1.5 h-4 w-4" />Fluxo da IA</Button>
        </div>
      </div>

      {isError && (
        <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error instanceof Error ? error.message : "Erro ao carregar agentes. Tente recarregar a página."}</AlertDescription></Alert>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4"><p className="text-xs text-muted-foreground">Agentes operando</p><div className="mt-1 flex items-end justify-between"><p className="text-2xl font-semibold">{isLoading ? "—" : activeCount}</p><span className="h-2 w-2 rounded-full bg-emerald-500" /></div></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Desativados</p><div className="mt-1 flex items-end justify-between"><p className="text-2xl font-semibold">{isLoading ? "—" : inactiveCount}</p><span className="h-2 w-2 rounded-full bg-muted-foreground/40" /></div></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Configuração avançada</p><div className="mt-1 flex items-end justify-between"><p className="text-2xl font-semibold">{isLoading ? "—" : customizedCount}</p><Settings2 className="h-4 w-4 text-muted-foreground" /></div></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Com conhecimento</p><div className="mt-1 flex items-end justify-between"><p className="text-2xl font-semibold">{isLoading ? "—" : knowledgeReadyCount}</p><BookOpen className="h-4 w-4 text-muted-foreground" /></div></Card>
      </div>

      {view === "agents" ? (
        <>
          <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar agente..." className="pl-9" />
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full sm:w-[220px]"><SelectValue placeholder="Categoria" /></SelectTrigger>
              <SelectContent><SelectItem value="all">Todas as áreas</SelectItem>{categories.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {isLoading
              ? Array.from({ length: 8 }).map((_, i) => <AgentCardSkeleton key={i} />)
              : filteredAgents.map((agent) => (
                  <AgentCard key={agent.agentKey} agent={agent} onToggle={handleToggle} toggling={togglingKeys.has(agent.agentKey)} onConfigure={handleConfigure} onTest={handleTest} />
                ))}
          </div>

          {!isLoading && filteredAgents.length === 0 && (
            <div className="rounded-xl border border-dashed p-10 text-center"><Search className="mx-auto h-8 w-8 text-muted-foreground/40" /><p className="mt-3 text-sm font-medium">Nenhum agente encontrado</p><p className="mt-1 text-xs text-muted-foreground">Ajuste a busca ou o filtro de área.</p></div>
          )}
        </>
      ) : (
        <Card className="overflow-hidden">
          <CardHeader className="border-b bg-muted/20">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Workflow className="h-5 w-5" /></div>
              <div><p className="font-semibold">Fluxo da equipe de IA</p><p className="text-sm text-muted-foreground">Visualize a sequência operacional sem criar um módulo paralelo. Cada etapa usa o mesmo agente configurado acima.</p></div>
            </div>
          </CardHeader>
          <CardContent className="p-5">
            <div className="flex flex-wrap items-stretch gap-2">
              {flowAgents.map((agent, index) => {
                const meta = AGENT_META[agent.agentKey];
                const Icon = meta?.icon ?? Bot;
                return (
                  <div key={agent.agentKey} className="contents">
                    <button type="button" onClick={() => handleConfigure(agent)} className="min-w-[170px] flex-1 rounded-xl border bg-background p-4 text-left transition hover:border-primary/40 hover:shadow-sm">
                      <div className="flex items-center justify-between gap-2"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4" /></div><span className={`h-2 w-2 rounded-full ${agent.ativo ? "bg-emerald-500" : "bg-muted-foreground/30"}`} /></div>
                      <p className="mt-3 text-sm font-semibold">{agent.nomePerfil || agent.nome}</p>
                      <p className="mt-1 text-xs capitalize text-muted-foreground">{agent.categoria}</p>
                    </button>
                    {index < flowAgents.length - 1 && <div className="hidden items-center px-1 md:flex"><ArrowRight className="h-4 w-4 text-muted-foreground/50" /></div>}
                  </div>
                );
              })}
            </div>
            <div className="mt-5 rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">O fluxo mostra a ordem operacional de referência. Agentes desativados continuam visíveis para facilitar a gestão, mas ficam marcados em cinza.</div>
          </CardContent>
        </Card>
      )}

      {selectedAgent && (
        <AgentConfigSheet agent={selectedAgent} initialTab={selectedTab} onClose={handleSheetClose} onSaved={(updated) => handleSaved(selectedAgent.agentKey, updated)} />
      )}
    </div>
  );
}
