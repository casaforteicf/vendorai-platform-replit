import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MessageSquare,
  Settings2,
  ShieldCheck,
  Sparkles,
  TestTube2,
  Users,
  Workflow,
} from "lucide-react";
import ProspectorPlaybookEditor, {
  normalizeProspectorPlaybookForm,
  type ProspectorPlaybookForm,
} from "./ProspectorPlaybookEditor";

export type GuidedAgentData = {
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

type KnowledgeEntry = {
  id: string;
  titulo: string;
  categoria: string;
  tags: string[];
};

type AutonomyLevel = "automatico" | "aprovacao" | "bloqueado";
type AutonomyRule = { id: string; label: string; level: AutonomyLevel };

type GuidedSetup = {
  version: 1;
  objective: string;
  audience: string;
  knowledgeIds: string[];
  autonomy: AutonomyRule[];
  handoff: string;
  tone: string;
  responseLength: "curta" | "media" | "detalhada";
  emoji: boolean;
  restrictions: string;
  configuredAt?: string;
};

type Props = {
  agent: GuidedAgentData;
  tenantId: string;
  teamPosition?: { index: number; total: number } | null;
  onClose: () => void;
  onOpenAdvanced: () => void;
  onComplete: (updated: Partial<GuidedAgentData>, moveNext: boolean) => void;
};

const STEPS = [
  "Objetivo",
  "Público",
  "Conhecimento",
  "Autonomia",
  "Handoff",
  "Comunicação",
  "Teste",
] as const;

const ROLE_GUIDE: Record<string, { objective: string; audience: string; handoff: string; tone: string }> = {
  recepcao: {
    objective: "Receber novos contatos, entender a necessidade sem pressionar, registrar o contexto e encaminhar para o agente ou pessoa correta.",
    audience: "Novos contatos, leads e clientes que iniciam uma conversa com a empresa.",
    handoff: "Encaminhe para SDR quando houver oportunidade comercial; para Suporte quando for problema técnico; para Financeiro quando a dúvida for de pagamento; e para humano quando o cliente pedir ou quando houver exceção.",
    tone: "amigavel",
  },
  sdr: {
    objective: "Qualificar oportunidades, entender contexto, necessidade, urgência e potencial de compra e encaminhar leads prontos para o Closer.",
    audience: "Leads novos e oportunidades ainda não qualificadas do público-alvo da empresa.",
    handoff: "Encaminhe para Closer quando houver fit e intenção de compra; para Agendamento quando a próxima ação for reunião ou visita; e para humano em exceções comerciais.",
    tone: "profissional",
  },
  closer: {
    objective: "Conduzir a negociação final, tratar objeções, esclarecer condições e aumentar a chance de fechamento sem ultrapassar as políticas comerciais.",
    audience: "Leads já qualificados e oportunidades em negociação ou decisão.",
    handoff: "Encaminhe para Agendamento quando houver visita/reunião; para Financeiro quando a questão for pagamento; para Pós-venda após o fechamento; e para humano quando a negociação exigir exceção.",
    tone: "vendedor",
  },
  prospector: {
    objective: "Pesquisar sinais observáveis, entender o estágio real do prospect, confirmar o contexto e qualificar a oportunidade antes de qualquer proposta.",
    audience: "Empresas ou pessoas com um sinal verificável de momento, necessidade ou projeto, dentro do perfil ideal definido pelo tenant.",
    handoff: "Só transfira após concluir o diagnóstico, resumir o contexto com as palavras do lead, receber confirmação e validar os critérios SQL. Não repita perguntas já respondidas.",
    tone: "profissional",
  },
  agendamento: {
    objective: "Organizar reuniões, visitas e demonstrações, confirmar disponibilidade e reduzir faltas com confirmações claras.",
    audience: "Leads e clientes que precisam marcar, remarcar ou confirmar compromissos.",
    handoff: "Depois de confirmar o agendamento, devolva o contexto para o agente comercial responsável. Encaminhe conflitos ou exceções para uma pessoa da equipe.",
    tone: "amigavel",
  },
  suporte: {
    objective: "Resolver dúvidas e problemas operacionais com segurança, usando somente informações válidas da empresa e escalando quando necessário.",
    audience: "Clientes ativos ou contatos com dúvidas técnicas, operacionais ou de uso.",
    handoff: "Encaminhe para humano quando não houver informação suficiente, houver risco, reclamação crítica ou necessidade de decisão fora da base disponível.",
    tone: "tecnico",
  },
  financeiro: {
    objective: "Esclarecer pagamentos, parcelas, condições financeiras e documentos sem inventar valores ou prometer condições não autorizadas.",
    audience: "Leads e clientes com dúvidas financeiras, de pagamento, faturamento ou condições comerciais.",
    handoff: "Encaminhe para Cobrança quando houver inadimplência; para Closer quando a condição fizer parte de negociação comercial; e para humano em exceções financeiras.",
    tone: "profissional",
  },
  cobranca: {
    objective: "Conduzir a régua de cobrança com respeito, buscar regularização e registrar acordos sem pressionar de forma inadequada.",
    audience: "Clientes com pagamentos vencidos ou pendências financeiras registradas.",
    handoff: "Encaminhe para Financeiro quando houver dúvida de lançamento ou pagamento; e para humano quando houver contestação, negociação fora da política ou situação sensível.",
    tone: "profissional",
  },
  pos_venda: {
    objective: "Acompanhar o cliente após a compra, identificar satisfação, necessidades, novas oportunidades e sinais de risco de relacionamento.",
    audience: "Clientes ativos após a venda, entrega ou conclusão do serviço.",
    handoff: "Encaminhe problemas para Suporte, oportunidades para Expansão/Closer e situações críticas para humano.",
    tone: "amigavel",
  },
  farmacia: {
    objective: "Atender dúvidas e pedidos da farmácia com segurança, usar apenas informações disponíveis e encaminhar decisões clínicas ao farmacêutico ou serviço de saúde.",
    audience: "Clientes da farmácia buscando produtos, disponibilidade, preço, pedido, entrega ou orientação operacional.",
    handoff: "Encaminhe ao farmacêutico quando houver decisão clínica, dúvida sobre uso/posologia ou risco; em sinais de urgência, oriente atendimento emergencial.",
    tone: "profissional",
  },
};

const GENERIC_GUIDE = {
  objective: "Atender a responsabilidade principal deste agente usando o contexto real da empresa e encaminhar exceções corretamente.",
  audience: "Leads e clientes relacionados à etapa operacional deste agente.",
  handoff: "Transfira para o agente ou pessoa responsável quando o assunto sair do escopo ou exigir decisão humana.",
  tone: "profissional",
};

const AUTONOMY_ACTIONS = [
  { id: "send_material", label: "Enviar materiais, catálogos e arquivos" },
  { id: "schedule", label: "Agendar reuniões, visitas ou demonstrações" },
  { id: "move_pipeline", label: "Atualizar a etapa do lead no pipeline" },
  { id: "proposal", label: "Enviar proposta ou orçamento" },
  { id: "discount", label: "Conceder desconto ou condição fora da política" },
  { id: "human_handoff", label: "Transferir para uma pessoa da equipe" },
] as const;

function defaultAutonomy(agentKey: string): AutonomyRule[] {
  return AUTONOMY_ACTIONS.map((action) => {
    let level: AutonomyLevel = "aprovacao";
    if (action.id === "send_material") level = ["recepcao", "sdr", "closer", "suporte", "pos_venda"].includes(agentKey) ? "automatico" : "aprovacao";
    if (action.id === "schedule") level = agentKey === "agendamento" ? "automatico" : "aprovacao";
    if (action.id === "move_pipeline") level = ["sdr", "closer", "recepcao"].includes(agentKey) ? "automatico" : "aprovacao";
    if (action.id === "proposal") level = ["closer", "financeiro"].includes(agentKey) ? "aprovacao" : "bloqueado";
    if (action.id === "discount") level = "bloqueado";
    if (action.id === "human_handoff") level = "automatico";
    return { ...action, level };
  });
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function recommendedKnowledgeIds(agentKey: string, entries: KnowledgeEntry[]) {
  const terms: Record<string, string[]> = {
    recepcao: ["institucional", "faq", "atendimento", "empresa", "contato", "produto"],
    sdr: ["produto", "catalogo", "venda", "comercial", "faq", "preco", "servico"],
    closer: ["produto", "catalogo", "preco", "condicao", "comercial", "proposta", "faq"],
    prospector: ["produto", "catalogo", "segmento", "diferencial", "institucional", "venda"],
    agendamento: ["agenda", "atendimento", "visita", "horario", "faq", "contato"],
    suporte: ["suporte", "tecnico", "manual", "garantia", "faq", "produto"],
    financeiro: ["financeiro", "pagamento", "preco", "parcela", "condicao", "faturamento"],
    cobranca: ["cobranca", "financeiro", "pagamento", "inadimplencia", "acordo"],
    pos_venda: ["pos-venda", "garantia", "suporte", "produto", "manual", "relacionamento"],
    farmacia: ["medicamento", "farmacia", "produto", "receita", "entrega", "faq"],
  };
  const wanted = terms[agentKey] ?? ["faq", "produto", "institucional"];
  const matches = entries.filter((entry) => {
    const haystack = normalize([entry.titulo, entry.categoria, ...(entry.tags ?? [])].join(" "));
    return wanted.some((term) => haystack.includes(term));
  }).map((entry) => entry.id);
  return matches.length > 0 ? matches : entries.slice(0, Math.min(entries.length, 6)).map((entry) => entry.id);
}

function initialSetup(agent: GuidedAgentData): GuidedSetup {
  const stored = agent.parametros?.["guidedSetup"];
  if (stored && typeof stored === "object") {
    const value = stored as Partial<GuidedSetup>;
    const guide = ROLE_GUIDE[agent.agentKey] ?? GENERIC_GUIDE;
    return {
      version: 1,
      objective: value.objective ?? guide.objective,
      audience: value.audience ?? guide.audience,
      knowledgeIds: Array.isArray(value.knowledgeIds) ? value.knowledgeIds : (agent.knowledgeBaseIds ?? []),
      autonomy: Array.isArray(value.autonomy) ? value.autonomy : defaultAutonomy(agent.agentKey),
      handoff: value.handoff ?? guide.handoff,
      tone: value.tone ?? agent.tom ?? guide.tone,
      responseLength: value.responseLength ?? "media",
      emoji: value.emoji ?? false,
      restrictions: value.restrictions ?? agent.restricoes ?? "",
      configuredAt: value.configuredAt,
    };
  }
  const guide = ROLE_GUIDE[agent.agentKey] ?? GENERIC_GUIDE;
  return {
    version: 1,
    objective: guide.objective,
    audience: guide.audience,
    knowledgeIds: agent.knowledgeBaseIds ?? [],
    autonomy: defaultAutonomy(agent.agentKey),
    handoff: guide.handoff,
    tone: agent.tom || guide.tone,
    responseLength: "media",
    emoji: false,
    restrictions: agent.restricoes ?? "",
  };
}

function autonomyText(level: AutonomyLevel) {
  if (level === "automatico") return "pode executar sozinho";
  if (level === "aprovacao") return "precisa de aprovação humana antes de executar";
  return "não pode executar";
}

function buildGuidedPrompt(agent: GuidedAgentData, setup: GuidedSetup, briefing: string | null) {
  const marker = "## CONFIGURAÇÃO GUIADA COM IA";
  const current = (agent.systemPromptCustom || agent.systemPromptBase || "").trim();
  const previousMarker = current.indexOf(marker);
  const base = (previousMarker >= 0 ? current.slice(0, previousMarker) : current).trim() || agent.systemPromptBase;
  const autonomy = setup.autonomy.map((rule) => `- ${rule.label}: ${autonomyText(rule.level)}.`).join("\n");
  const lengthInstruction = setup.responseLength === "curta"
    ? "Prefira respostas curtas e diretas."
    : setup.responseLength === "detalhada"
      ? "Explique com mais detalhes quando isso ajudar o cliente."
      : "Use respostas objetivas, com detalhe suficiente para resolver a dúvida.";

  const guided = [
    marker,
    briefing ? `CONTEXTO DA EMPRESA:\n${briefing}` : "CONTEXTO DA EMPRESA: use somente os dados disponíveis no sistema e na base de conhecimento.",
    `OBJETIVO ESPECÍFICO:\n${setup.objective}`,
    `PÚBLICO PRINCIPAL:\n${setup.audience}`,
    `AUTONOMIA:\n${autonomy}`,
    `HANDOFF E ESCALONAMENTO:\n${setup.handoff}`,
    `COMUNICAÇÃO:\n${lengthInstruction} ${setup.emoji ? "Pode usar emojis com moderação quando forem naturais." : "Não use emojis, salvo se o cliente já estiver usando e isso for claramente adequado."}`,
    setup.restrictions.trim() ? `RESTRIÇÕES ESPECÍFICAS DO NEGÓCIO:\n${setup.restrictions.trim()}` : "",
  ].filter(Boolean).join("\n\n");

  return `${base}\n\n${guided}`;
}

function scenarioMessages(agentKey: string) {
  const defaults = [
    "Olá, queria entender melhor como vocês podem me ajudar.",
    "Pode me mandar valores e condições agora?",
    "Quero falar com uma pessoa da equipe.",
    "Não tenho certeza do que preciso. O que você recomenda?",
    "Você consegue fazer uma exceção pra mim?",
  ];
  const byAgent: Record<string, string[]> = {
    sdr: [
      "Vi vocês no Instagram e queria mais informações, mas ainda estou pesquisando.",
      "Tenho interesse, mas não sei se isso serve pro meu caso.",
      "Quanto custa? Preciso disso ainda este mês.",
      "Já falei com outra empresa e estou comparando propostas.",
      "Prefiro falar direto com alguém de vendas.",
    ],
    closer: [
      "Gostei da proposta, mas o valor ainda está acima do que eu esperava.",
      "Se você conseguir desconto eu fecho hoje.",
      "Qual a diferença de vocês para o concorrente?",
      "Quero revisar prazo e forma de pagamento antes de decidir.",
      "Podemos marcar uma conversa para fechar os detalhes?",
    ],
    suporte: [
      "Estou com um problema e não consegui resolver sozinho.",
      "Isso parou de funcionar hoje. O que eu faço?",
      "Já tentei as orientações anteriores e continua igual.",
      "Quero abrir um chamado e falar com uma pessoa.",
      "Vocês conseguem garantir que isso será resolvido hoje?",
    ],
    cobranca: [
      "Recebi uma cobrança, mas acho que esse valor está errado.",
      "Não consegui pagar no vencimento. Tem como negociar?",
      "Posso pagar só uma parte agora?",
      "Já paguei ontem. Por que ainda aparece pendente?",
      "Quero falar com o financeiro antes de acertar isso.",
    ],
  };
  return byAgent[agentKey] ?? defaults;
}

export default function AgentGuidedSetup({ agent, tenantId, teamPosition, onClose, onOpenAdvanced, onComplete }: Props) {
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [setup, setSetup] = useState<GuidedSetup>(() => initialSetup(agent));
  const [prospectorPlaybook, setProspectorPlaybook] = useState<ProspectorPlaybookForm>(() =>
    normalizeProspectorPlaybookForm((agent.parametros ?? {})["prospectorPlaybook"]),
  );
  const [briefing, setBriefing] = useState<string | null>(null);
  const [briefingError, setBriefingError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [saved, setSaved] = useState(Boolean(initialSetup(agent).configuredAt));
  const [activateOnFinish, setActivateOnFinish] = useState(agent.ativo);
  const [testResult, setTestResult] = useState<{ message: string; response: string } | null>(null);

  const { data: knowledgeEntries = [], isLoading: knowledgeLoading } = useQuery<KnowledgeEntry[]>({
    queryKey: ["knowledge-base", tenantId, "guided-agent-setup"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/knowledge-base`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` },
      });
      if (!res.ok) throw new Error("Não foi possível carregar a Base de Conhecimento");
      return res.json();
    },
    enabled: Boolean(tenantId),
  });

  const recommendedIds = useMemo(
    () => recommendedKnowledgeIds(agent.agentKey, knowledgeEntries),
    [agent.agentKey, knowledgeEntries],
  );

  async function analyzeBusiness() {
    setAnalyzing(true);
    setBriefingError(null);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/agent-configs/compile-briefing`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("vendorai_token")}`,
        },
        body: JSON.stringify({
          notes: `A configuração guiada está preparando o ${agent.nome}. Preserve fatos e contexto do negócio; não invente políticas, preços ou condições.`,
        }),
      });
      const data = await res.json().catch(() => ({})) as { briefing?: string; error?: string };
      if (!res.ok || !data.briefing) {
        setBriefingError(data.error ?? "A IA não encontrou dados suficientes no Perfil do Negócio.");
        return;
      }
      setBriefing(data.briefing);
    } catch {
      setBriefingError("Não foi possível analisar o negócio agora. Você pode continuar e tentar novamente depois.");
    } finally {
      setAnalyzing(false);
    }
  }

  useEffect(() => {
    void analyzeBusiness();
    // Análise ocorre uma vez ao abrir o assistente para o agente atual.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent.agentKey, tenantId]);

  function update<K extends keyof GuidedSetup>(key: K, value: GuidedSetup[K]) {
    setSetup((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  function updateProspectorPlaybook(value: ProspectorPlaybookForm) {
    setProspectorPlaybook(value);
    setSaved(false);
  }

  function applyRecommendedKnowledge() {
    update("knowledgeIds", recommendedIds);
  }

  function toggleKnowledge(id: string) {
    update("knowledgeIds", setup.knowledgeIds.includes(id)
      ? setup.knowledgeIds.filter((item) => item !== id)
      : [...setup.knowledgeIds, id]);
  }

  function updateAutonomy(id: string, level: AutonomyLevel) {
    update("autonomy", setup.autonomy.map((rule) => rule.id === id ? { ...rule, level } : rule));
  }

  const persistMutation = useMutation({
    mutationFn: async (activate: boolean) => {
      const configured: GuidedSetup = { ...setup, configuredAt: new Date().toISOString() };
      const systemPromptCustom = buildGuidedPrompt(agent, configured, briefing);
      const parametros = {
        ...((agent.parametros ?? {}) as Record<string, unknown>),
        guidedSetup: configured,
        ...(agent.agentKey === "prospector" ? { prospectorPlaybook } : {}),
      };
      const patchRes = await fetch(`/api/agent-configs/${agent.agentKey}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("vendorai_token")}`,
        },
        body: JSON.stringify({
          tom: configured.tone,
          restricoes: configured.restrictions.trim() || null,
          systemPromptCustom,
          parametros,
          knowledgeBaseIds: configured.knowledgeIds,
        }),
      });
      if (!patchRes.ok) {
        const body = await patchRes.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? "Não foi possível salvar a configuração guiada");
      }
      if (activate !== agent.ativo) {
        const action = activate ? "activate" : "deactivate";
        const statusRes = await fetch(`/api/agent-configs/${agent.agentKey}/${action}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` },
        });
        if (!statusRes.ok) throw new Error("Configuração salva, mas não foi possível alterar o status do agente");
      }
      return {
        configured,
        updated: {
          tom: configured.tone,
          restricoes: configured.restrictions.trim() || null,
          systemPromptCustom,
          parametros,
          knowledgeBaseIds: configured.knowledgeIds,
          ativo: activate,
        } satisfies Partial<GuidedAgentData>,
      };
    },
    onSuccess: ({ configured }) => {
      setSetup(configured);
      setSaved(true);
      toast({ title: "Configuração guiada salva", description: "As orientações já estão sendo usadas pelo agente." });
    },
    onError: (error) => {
      toast({ title: "Erro ao salvar", description: error instanceof Error ? error.message : "Não foi possível salvar.", variant: "destructive" });
    },
  });

  const testMutation = useMutation({
    mutationFn: async (message: string) => {
      if (!saved) await persistMutation.mutateAsync(activateOnFinish);
      const res = await fetch(`/api/agent-configs/${agent.agentKey}/test`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("vendorai_token")}`,
        },
        body: JSON.stringify({ mensagem: message }),
      });
      const body = await res.json().catch(() => ({})) as { resposta?: string; error?: string };
      if (!res.ok) throw new Error(body.error ?? "Falha no teste do agente");
      return { message, response: body.resposta ?? "" };
    },
    onSuccess: setTestResult,
    onError: (error) => toast({ title: "Teste não concluído", description: error instanceof Error ? error.message : "Falha no teste.", variant: "destructive" }),
  });

  async function finish() {
    let updated: Partial<GuidedAgentData>;
    if (saved) {
      updated = {
        tom: setup.tone,
        restricoes: setup.restrictions.trim() || null,
        systemPromptCustom: buildGuidedPrompt(agent, setup, briefing),
        parametros: {
          ...((agent.parametros ?? {}) as Record<string, unknown>),
          guidedSetup: setup,
          ...(agent.agentKey === "prospector" ? { prospectorPlaybook } : {}),
        },
        knowledgeBaseIds: setup.knowledgeIds,
        ativo: activateOnFinish,
      };
    } else {
      const result = await persistMutation.mutateAsync(activateOnFinish);
      updated = result.updated;
    }
    const moveNext = Boolean(teamPosition && teamPosition.index < teamPosition.total - 1);
    onComplete(updated, moveNext);
  }

  const progress = Math.round(((step + 1) / STEPS.length) * 100);
  const scenarios = scenarioMessages(agent.agentKey);

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-[680px] p-0 flex flex-col gap-0">
        <SheetHeader className="border-b px-5 py-5 sm:px-6">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <SheetTitle className="text-base">Configuração guiada com IA</SheetTitle>
                <Badge variant="secondary" className="text-[10px]">Recomendado</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {agent.nomePerfil || agent.nome}
                {teamPosition ? ` · agente ${teamPosition.index + 1} de ${teamPosition.total}` : ""}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={onOpenAdvanced}>
              <Settings2 className="mr-1.5 h-3.5 w-3.5" />
              Avançado
            </Button>
          </div>
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Etapa {step + 1} de {STEPS.length} · {STEPS[step]}</span>
              <span>{progress}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {step === 0 && (
            <div className="space-y-5">
              <div>
                <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /><h3 className="font-semibold">O que este agente deve fazer?</h3></div>
                <p className="mt-1 text-sm text-muted-foreground">A IA usa o Perfil do Negócio para trazer o contexto da empresa. Você só confirma ou ajusta o objetivo deste agente.</p>
              </div>
              <Card className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Contexto da empresa analisado pela IA</p>
                    <p className="mt-1 text-xs text-muted-foreground">Usa dados do Perfil do Negócio e catálogo; não precisa repetir o onboarding.</p>
                  </div>
                  {analyzing ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : briefing ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : null}
                </div>
                {briefing && <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{briefing}</p>}
                {briefingError && (
                  <Alert className="mt-3">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{briefingError}</AlertDescription>
                  </Alert>
                )}
                {!analyzing && !briefing && <Button className="mt-3" variant="outline" size="sm" onClick={() => void analyzeBusiness()}><Sparkles className="mr-1.5 h-3.5 w-3.5" />Analisar novamente</Button>}
              </Card>
              <div className="space-y-2">
                <Label htmlFor="guided-objective">Objetivo recomendado</Label>
                <Textarea id="guided-objective" value={setup.objective} onChange={(e) => update("objective", e.target.value)} rows={4} />
              </div>
              {agent.agentKey === "prospector" && (
                <ProspectorPlaybookEditor
                  value={prospectorPlaybook}
                  onChange={updateProspectorPlaybook}
                />
              )}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <div>
                <div className="flex items-center gap-2"><Users className="h-4 w-4 text-primary" /><h3 className="font-semibold">Com quem ele vai falar?</h3></div>
                <p className="mt-1 text-sm text-muted-foreground">Defina o público principal desta etapa. O agente continua usando o contexto geral do negócio.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="guided-audience">Público principal</Label>
                <Textarea id="guided-audience" value={setup.audience} onChange={(e) => update("audience", e.target.value)} rows={5} />
              </div>
              <div className="rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground">
                Evite descrever o público como um formulário. O objetivo é ajudar a IA a reconhecer quem está na etapa certa e quando deve encaminhar.
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-primary" /><h3 className="font-semibold">O que ele precisa saber?</h3></div>
                  <p className="mt-1 text-sm text-muted-foreground">Selecione quais conteúdos da Base de Conhecimento este agente pode consultar.</p>
                </div>
                <Button variant="outline" size="sm" onClick={applyRecommendedKnowledge} disabled={knowledgeEntries.length === 0}>
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />Aplicar recomendação
                </Button>
              </div>
              {knowledgeLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando conhecimento...</div>
              ) : knowledgeEntries.length === 0 ? (
                <Alert><BookOpen className="h-4 w-4" /><AlertDescription>A Base de Conhecimento ainda está vazia. Você pode concluir a configuração e adicionar conteúdos depois.</AlertDescription></Alert>
              ) : (
                <div className="space-y-2">
                  {knowledgeEntries.map((entry) => {
                    const checked = setup.knowledgeIds.includes(entry.id);
                    const recommended = recommendedIds.includes(entry.id);
                    return (
                      <label key={entry.id} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-muted/30">
                        <Checkbox checked={checked} onCheckedChange={() => toggleKnowledge(entry.id)} className="mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium">{entry.titulo}</p>
                            {recommended && <Badge variant="secondary" className="text-[10px]">Recomendado</Badge>}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{entry.categoria}{entry.tags?.length ? ` · ${entry.tags.join(", ")}` : ""}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div>
                <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /><h3 className="font-semibold">O que ele pode fazer sozinho?</h3></div>
                <p className="mt-1 text-sm text-muted-foreground">Defina autonomia em linguagem simples. Essas regras entram no contexto operacional do agente.</p>
              </div>
              <div className="space-y-3">
                {setup.autonomy.map((rule) => (
                  <div key={rule.id} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm font-medium">{rule.label}</p>
                    <Select value={rule.level} onValueChange={(value) => updateAutonomy(rule.id, value as AutonomyLevel)}>
                      <SelectTrigger className="w-full sm:w-[210px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="automatico">Pode sozinho</SelectItem>
                        <SelectItem value="aprovacao">Precisa aprovação</SelectItem>
                        <SelectItem value="bloqueado">Não pode</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-5">
              <div>
                <div className="flex items-center gap-2"><Workflow className="h-4 w-4 text-primary" /><h3 className="font-semibold">Quando deve passar para outro agente ou pessoa?</h3></div>
                <p className="mt-1 text-sm text-muted-foreground">O objetivo é evitar que um agente continue uma conversa fora do próprio escopo.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="guided-handoff">Regra de handoff recomendada</Label>
                <Textarea id="guided-handoff" value={setup.handoff} onChange={(e) => update("handoff", e.target.value)} rows={7} />
              </div>
              <div className="rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground">
                O agente deve preservar as informações já coletadas no handoff para que o próximo agente ou pessoa não repita perguntas desnecessárias.
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-5">
              <div>
                <div className="flex items-center gap-2"><MessageSquare className="h-4 w-4 text-primary" /><h3 className="font-semibold">Como ele deve conversar?</h3></div>
                <p className="mt-1 text-sm text-muted-foreground">Ajuste o comportamento sem precisar escrever prompt técnico.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Tom de comunicação</Label>
                  <Select value={setup.tone} onValueChange={(value) => update("tone", value)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="profissional">Profissional</SelectItem>
                      <SelectItem value="amigavel">Amigável</SelectItem>
                      <SelectItem value="tecnico">Técnico</SelectItem>
                      <SelectItem value="vendedor">Vendedor</SelectItem>
                      <SelectItem value="neutro">Neutro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Tamanho das respostas</Label>
                  <Select value={setup.responseLength} onValueChange={(value) => update("responseLength", value as GuidedSetup["responseLength"])}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="curta">Curtas e diretas</SelectItem>
                      <SelectItem value="media">Equilibradas</SelectItem>
                      <SelectItem value="detalhada">Mais detalhadas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div><p className="text-sm font-medium">Usar emojis com moderação</p><p className="mt-1 text-xs text-muted-foreground">Somente quando combinar com a conversa.</p></div>
                <Switch checked={setup.emoji} onCheckedChange={(value) => update("emoji", value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="guided-restrictions">Restrições específicas</Label>
                <Textarea id="guided-restrictions" value={setup.restrictions} onChange={(e) => update("restrictions", e.target.value)} placeholder="Ex: não prometer prazo sem confirmação; não conceder desconto; não citar concorrentes." rows={5} />
              </div>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-5">
              <div>
                <div className="flex items-center gap-2"><TestTube2 className="h-4 w-4 text-primary" /><h3 className="font-semibold">Teste antes de concluir</h3></div>
                <p className="mt-1 text-sm text-muted-foreground">Salve a configuração e simule situações reais. O teste não cria lead nem altera conversa.</p>
              </div>

              <Card className="p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div><p className="text-xs text-muted-foreground">Objetivo</p><p className="mt-1 text-sm font-medium line-clamp-3">{setup.objective}</p></div>
                  <div><p className="text-xs text-muted-foreground">Conhecimento</p><p className="mt-1 text-sm font-medium">{setup.knowledgeIds.length} item(ns) selecionado(s)</p></div>
                  <div><p className="text-xs text-muted-foreground">Tom</p><p className="mt-1 text-sm font-medium capitalize">{setup.tone}</p></div>
                  <div><p className="text-xs text-muted-foreground">Status ao concluir</p><p className="mt-1 text-sm font-medium">{activateOnFinish ? "Operando" : "Desativado"}</p></div>
                </div>
              </Card>

              <div className="flex items-center justify-between rounded-lg border p-4">
                <div><p className="text-sm font-medium">Ativar agente ao concluir</p><p className="mt-1 text-xs text-muted-foreground">Desative se quiser apenas preparar e revisar primeiro.</p></div>
                <Switch checked={activateOnFinish} onCheckedChange={(value) => { setActivateOnFinish(value); setSaved(false); }} />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={() => persistMutation.mutate(activateOnFinish)} disabled={persistMutation.isPending}>
                  {persistMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando...</> : saved ? <><CheckCircle2 className="mr-2 h-4 w-4" />Configuração salva</> : <><Sparkles className="mr-2 h-4 w-4" />Salvar configuração</>}
                </Button>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Cenários de teste</p>
                <div className="grid gap-2">
                  {scenarios.map((message) => (
                    <button key={message} type="button" disabled={testMutation.isPending} onClick={() => testMutation.mutate(message)} className="rounded-lg border p-3 text-left text-sm transition hover:bg-muted/40 disabled:opacity-50">
                      {message}
                    </button>
                  ))}
                </div>
              </div>

              {testMutation.isPending && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Testando o agente com a configuração atual...</div>}
              {testResult && (
                <div className="overflow-hidden rounded-lg border">
                  <div className="border-b bg-muted/20 p-3"><p className="text-xs text-muted-foreground">Cliente</p><p className="mt-1 text-sm">{testResult.message}</p></div>
                  <div className="p-3"><p className="text-xs text-muted-foreground">Resposta do agente</p><p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{testResult.response}</p></div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t bg-background px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="outline" onClick={() => step > 0 ? setStep((prev) => prev - 1) : onClose()}>
              <ChevronLeft className="mr-1.5 h-4 w-4" />
              {step > 0 ? "Voltar" : "Cancelar"}
            </Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={() => setStep((prev) => Math.min(prev + 1, STEPS.length - 1))} disabled={step === 0 && !setup.objective.trim()}>
                Continuar <ChevronRight className="ml-1.5 h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={() => void finish()} disabled={persistMutation.isPending}>
                {teamPosition && teamPosition.index < teamPosition.total - 1 ? "Concluir e próximo agente" : "Concluir configuração"}
                <CheckCircle2 className="ml-1.5 h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
