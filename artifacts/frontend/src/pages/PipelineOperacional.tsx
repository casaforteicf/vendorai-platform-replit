import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SupportReportPanel } from "@/components/SupportReportPanel";
import { SupportActivityExecutionPanel } from "@/components/SupportActivityExecutionPanel";
import { OperationalStageFormDialog } from "@/components/OperationalStageFormDialog";
import { ExpeditionChecklistPanel, type ExpeditionChecklist } from "@/components/ExpeditionChecklistPanel";
import { TransportChecklistPanel, type TransportChecklist } from "@/components/TransportChecklistPanel";
import { PipelineNav, PIPELINE_CARD_CLASS, PIPELINE_COLUMN_CLASS, PIPELINE_COLUMN_HEADER_CLASS } from "@/components/PipelineNav";
import { InstallationTemplateDialog } from "@/components/InstallationTemplateDialog";
import { AdminDeleteLeadButton } from "@/components/AdminDeleteLeadButton";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Loader2,
  Package,
  Paperclip,
  Plus,
  Truck,
  Upload,
  UserRound,
  Wrench,
} from "lucide-react";

type PipelineKind = "execucao" | "suporte";

type WorkCard = {
  id: string;
  tenantId: string;
  codigo: string;
  pipeline: PipelineKind;
  tipo: string;
  etapa: string;
  titulo: string;
  descricao?: string | null;
  prioridade: string;
  leadId?: string | null;
  dealId?: string | null;
  propostaId?: string | null;
  entregaId?: string | null;
  parentCardId?: string | null;
  responsavelId?: string | null;
  dataInicioPrevista?: string | null;
  dataInicioEfetiva?: string | null;
  dataFimPrevista?: string | null;
  dataFimEfetiva?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string;
  updatedAt?: string;
  leadLabel?: string | null;
  responsavelLabel?: string | null;
  dealTitle?: string | null;
};

type Attachment = {
  id: string;
  nome: string;
  url: string;
  mimeType?: string | null;
  tamanho?: number | null;
  descricao?: string | null;
  transcricao?: string | null;
  origem: string;
  metadata?: Record<string, unknown> | null;
  createdAt?: string;
};

type Lead = { id: string; nome?: string | null; empresa?: string | null; telefone?: string | null; email?: string | null; endereco?: string | null };
type User = {
  id: string;
  name?: string | null;
  email?: string | null;
  userFunction?: string | null;
  customFunctionId?: string | null;
  active?: boolean | null;
};
type Deal = { id: string; titulo: string; leadId?: string | null; etapa: string; valor?: string | null };
type Proposal = { id: string; dealId?: string | null; leadId: string; titulo: string; status: string; itens?: Array<Record<string, unknown>> };
type LegacyOrderImport = {
  sourceFileName: string;
  sourceFileUrl?: string | null;
  sourceMimeType?: string | null;
  sourceSize?: number | null;
  importedAt: string;
  confidence?: number | null;
  title?: string | null;
  customer?: string | null;
  supplier?: string | null;
  total?: number | string | null;
  observations?: string | null;
  items: Array<Record<string, unknown>>;
  selectedItemIndexes: number[];
};
type BalanceItem = {
  index: number;
  nome: string;
  sku?: string | null;
  produtoId?: string | null;
  quantidadePedido: number;
  quantidadeAlocada: number;
  quantidadeLiberada: number;
  quantidadeEntregue: number;
  saldoProgramar: number;
  saldoEntregar: number;
};

type BalanceResponse = { propostaId: string; propostaTitulo: string; itens: BalanceItem[] };

type ConfiguredPipelineStage = {
  id: string;
  key?: string;
  label: string;
  ordem: number;
  isSystem?: boolean;
  slaMinutos?: number | null;
  responsaveisFuncoes?: string[] | null;
};

const EXECUTION_STAGES = [
  ["pedido_confirmado", "Pedido confirmado"],
  ["liberacao_financeira", "Liberação financeira"],
  ["liberacao_medidas", "Liberação de medidas"],
  ["projeto", "Projeto"],
  ["producao_a_iniciar", "Produção — a iniciar"],
  ["producao_em_andamento", "Produção — em andamento"],
  ["producao_finalizada", "Produção — finalizada"],
  ["aguardando_liberacao", "Aguardando liberação"],
  ["liberado", "Liberado"],
  ["agenda_entrega", "Agenda de entrega"],
  ["em_transporte", "Em transporte"],
  ["instalacao_a_iniciar", "Instalação — a iniciar"],
  ["instalacao_em_andamento", "Instalação — em andamento"],
  ["instalacao_finalizada", "Instalação — finalizada"],
  ["entrega_obra", "Entrega da obra"],
  ["pos_venda", "Pós-venda"],
  ["concluido", "Concluído"],
] as const;

type StageRequirement = { key: string; label: string; description: string };

const EXECUTION_STAGE_REQUIREMENTS: Record<string, StageRequirement[]> = {
  pedido_confirmado: [{ key: "pedido_contexto", label: "Pedido e cliente conferidos", description: "Cliente, pedido, proposta e itens vinculados ao processo." }],
  liberacao_financeira: [{ key: "liberacao_financeira", label: "Liberação financeira confirmada", description: "Condição financeira necessária para execução foi validada." }],
  liberacao_medidas: [{ key: "relatorio_medidas", label: "Relatório de medição concluído", description: "Checklist de medição/conferência anexado ao pedido e cliente." }],
  projeto: [{ key: "projeto_aprovado", label: "Projeto/aprovação concluídos", description: "Desenhos, revisões e aprovações técnicas estão vinculados." }],
  producao_a_iniciar: [{ key: "pre_requisitos_producao", label: "Pré-requisitos de produção validados", description: "Projeto, medidas e liberações necessárias estão concluídos." }],
  producao_em_andamento: [{ key: "registro_producao", label: "Andamento de produção registrado", description: "Responsável, evolução, fotos e ocorrências foram atualizados." }],
  producao_finalizada: [{ key: "qualidade_producao", label: "Checklist de qualidade concluído", description: "Produto/lote foi conferido antes da liberação." }],
  aguardando_liberacao: [{ key: "motivo_bloqueio", label: "Motivo de bloqueio registrado", description: "Pendência e responsável pela liberação estão identificados." }],
  liberado: [{ key: "liberacao_operacional", label: "Liberação operacional confirmada", description: "Lote autorizado para seguir para entrega." }],
  agenda_entrega: [{ key: "agenda_entrega", label: "Agenda e recebedor confirmados", description: "Data, endereço, contato e pessoa autorizada a receber foram registrados." }],
  em_transporte: [{ key: "checklist_transporte", label: "Checklist de expedição/transporte concluído", description: "Conferência de carga, condição e evidências do transporte." }],
  instalacao_a_iniciar: [{ key: "pre_instalacao", label: "Pré-instalação conferida", description: "Equipe, itens, local e condições para instalação estão confirmados." }],
  instalacao_em_andamento: [{ key: "checklist_instalacao", label: "Checklist de instalação atualizado", description: "Itens, fotos, ocorrências e não conformidades foram registrados por produto." }],
  instalacao_finalizada: [{ key: "conferencia_instalacao", label: "Conferência interna finalizada", description: "Equipe confirmou que os itens estão prontos para vistoria do cliente." }],
  entrega_obra: [{ key: "vistoria_aceite", label: "Vistoria e aceite concluídos", description: "Cliente ou delegado realizou a vistoria e o aceite foi formalizado." }],
  pos_venda: [{ key: "pacote_entrega", label: "Pacote de entrega enviado", description: "Termo, manual, garantia e documentos aplicáveis foram enviados e registrados." }],
};

const OPERATIONAL_FORM_KEYS = new Set([
  "relatorio_medidas",
  "checklist_transporte",
  "checklist_instalacao",
  "conferencia_instalacao",
  "vistoria_aceite",
  "pacote_entrega",
]);

const SUPPORT_STAGES = [
  ["chamado_cliente", "Chamado cliente"],
  ["agendamento_assistencia", "Agendamento assistência"],
  ["execucao_assistencia", "Execução da assistência"],
  ["relatorio_assistencia", "Relatório da assistência"],
  ["feedback_cliente", "Feedback cliente"],
  ["fechamento_assistencia", "Fechamento assistência"],
] as const;

const SUPPORT_CATEGORIES = [
  ["defeito", "Defeito"],
  ["instalacao", "Instalação"],
  ["funcionamento", "Funcionamento"],
  ["avaria", "Avaria"],
  ["falta_material", "Falta de material"],
  ["erro_medida", "Erro de medida"],
  ["duvida_tecnica", "Dúvida técnica"],
  ["garantia", "Garantia"],
  ["manutencao", "Manutenção"],
  ["outro", "Outro"],
] as const;

function userMatchesStageFunctions(user: User, responsibleFunctions?: string[] | null) {
  if (user.active === false) return false;
  const configured = responsibleFunctions ?? [];
  if (configured.length === 0) return true;

  const refs = new Set<string>();
  if (user.userFunction) refs.add(`builtin:${user.userFunction}`);
  if (user.customFunctionId) refs.add(`custom:${user.customFunctionId}`);
  return configured.some((ref) => refs.has(ref));
}

function eligibleUsersForStage(users: User[], stage?: ConfiguredPipelineStage | null) {
  return users.filter((user) => userMatchesStageFunctions(user, stage?.responsaveisFuncoes));
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("pt-BR");
}

function formatPlannedDate(value?: string | null) {
  if (!value) return "—";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  return formatDate(value);
}

function toDateInput(value?: string | null) {
  if (!value) return "";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

type InstallationStatus =
  | "pendente"
  | "em_instalacao"
  | "instalado"
  | "conferido"
  | "instalado_com_ressalva"
  | "nao_instalado"
  | "peca_faltante"
  | "produto_avariado"
  | "divergencia_medida"
  | "necessita_retorno";

type InstallationChecklistItem = {
  key: string;
  sourceIndex: number;
  status: InstallationStatus;
  observacao?: string;
  atualizadoEm?: string | null;
  atualizadoPor?: string | null;
};

function safeItems(card: WorkCard): Array<Record<string, unknown>> {
  const raw = card.metadata?.itens;
  return Array.isArray(raw) ? raw as Array<Record<string, unknown>> : [];
}

function itemName(item: Record<string, unknown>) {
  return String(item.nome || item.name || item.descricao || item.produto || "Item");
}

function itemQuantity(item: Record<string, unknown>) {
  const raw = item.quantidade ?? item.quantity ?? item.qtd ?? 1;
  const value = Number(raw);
  return Number.isFinite(value) ? value : 1;
}

function installationItemKey(item: Record<string, unknown>, index: number) {
  return [
    Number.isInteger(item.propostaItemIndex) ? String(item.propostaItemIndex) : "",
    typeof item.produtoId === "string" ? item.produtoId : "",
    typeof item.sku === "string" ? item.sku : "",
    itemName(item),
    index,
  ].filter(Boolean).join(":");
}

function installationChecklistItems(card: WorkCard): InstallationChecklistItem[] {
  const source = safeItems(card);
  const checklistRaw = card.metadata?.installationChecklist;
  const checklist =
    checklistRaw && typeof checklistRaw === "object" && !Array.isArray(checklistRaw)
      ? checklistRaw as Record<string, unknown>
      : {};
  const saved = Array.isArray(checklist.items)
    ? checklist.items as Array<Record<string, unknown>>
    : [];
  const byKey = new Map(saved.map((item) => [String(item.key || ""), item]));
  return source.map((item, index) => {
    const key = installationItemKey(item, index);
    const current = byKey.get(key) ?? {};
    return {
      key,
      sourceIndex: index,
      status: (typeof current.status === "string" ? current.status : "pendente") as InstallationStatus,
      observacao: typeof current.observacao === "string" ? current.observacao : "",
      atualizadoEm: typeof current.atualizadoEm === "string" ? current.atualizadoEm : null,
      atualizadoPor: typeof current.atualizadoPor === "string" ? current.atualizadoPor : null,
    };
  });
}

function displayItemAttributes(item: Record<string, unknown>) {
  const hidden = new Set([
    "nome","name","descricao","produto","quantidade","quantity","qtd","produtoId","propostaItemIndex",
    "quantidadePedido","preco","precoUnitario","valor","valorUnitario","subtotal","total","custo",
  ]);
  return Object.entries(item)
    .filter(([key, value]) => !hidden.has(key) && value !== null && value !== undefined && value !== "")
    .slice(0, 8)
    .map(([key, value]) => ({
      key,
      label: key.replace(/([A-Z])/g, " $1").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()),
      value: typeof value === "object" ? JSON.stringify(value) : String(value),
    }));
}

const INSTALLATION_STATUS_OPTIONS: Array<{ value: InstallationStatus; label: string }> = [
  { value: "pendente", label: "Pendente" },
  { value: "em_instalacao", label: "Em instalação" },
  { value: "instalado", label: "Instalado" },
  { value: "conferido", label: "Conferido" },
  { value: "instalado_com_ressalva", label: "Instalado com ressalva" },
  { value: "nao_instalado", label: "Não instalado" },
  { value: "peca_faltante", label: "Peça faltante" },
  { value: "produto_avariado", label: "Produto avariado" },
  { value: "divergencia_medida", label: "Divergência de medida" },
  { value: "necessita_retorno", label: "Necessita retorno" },
];

function isInstallationStage(stage: string) {
  return ["instalacao_a_iniciar", "instalacao_em_andamento", "instalacao_finalizada"].includes(stage);
}

function requirementCompleted(card: WorkCard, key: string) {
  const raw = card.metadata?.stageGates;
  if (!raw || typeof raw !== "object") return false;
  const value = (raw as Record<string, unknown>)[key];
  return value === true || Boolean(value && typeof value === "object" && (value as Record<string, unknown>).completed === true);
}

function safeExpeditionChecklist(card: WorkCard): ExpeditionChecklist | null {
  const raw = card.metadata?.checklistExpedicao;
  if (!raw || typeof raw !== "object") return null;
  const checklist = raw as ExpeditionChecklist;
  return Array.isArray(checklist.itens) ? checklist : null;
}

function safeTransportChecklist(card: WorkCard): TransportChecklist | null {
  const raw = card.metadata?.checklistTransporte;
  if (!raw || typeof raw !== "object") return null;
  const checklist = raw as TransportChecklist;
  return Array.isArray(checklist.campos) ? checklist : null;
}

export default function PipelineOperacional() {
  const { user, token } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const params = new URLSearchParams(window.location.search);
  const pathTab = window.location.pathname.split("/").filter(Boolean).at(-1);
  const pipeline: PipelineKind = pathTab === "suporte" || params.get("tab") === "suporte" ? "suporte" : "execucao";
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<WorkCard | null>(null);
  const [supportOpen, setSupportOpen] = useState(false);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [stageFormKey, setStageFormKey] = useState<string | null>(null);
  const [installationTemplatesOpen, setInstallationTemplatesOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const detailFileRef = useRef<HTMLInputElement>(null);

  const authHeaders = useMemo(() => token ? { Authorization: `Bearer ${token}` } : {}, [token]);
  const jsonHeaders = useMemo(() => ({ "Content-Type": "application/json", ...authHeaders }), [authHeaders]);

  async function api<T>(url: string, options?: RequestInit): Promise<T> {
    const response = await fetch(url, { ...options, headers: { ...authHeaders, ...(options?.headers ?? {}) } });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.message || body.error || `Erro ${response.status}`);
    }
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  const cardsQuery = useQuery<WorkCard[]>({
    queryKey: ["work-cards", tenantId, pipeline],
    enabled: !!tenantId,
    queryFn: () => api(`/api/tenants/${tenantId}/work-cards?pipeline=${pipeline}`),
    staleTime: 15_000, refetchOnWindowFocus: false,
  });

  const pipelineStagesQuery = useQuery<ConfiguredPipelineStage[]>({
    queryKey: ["operational-pipeline-stages", tenantId, pipeline],
    enabled: !!tenantId,
    queryFn: () => api(`/api/tenants/${tenantId}/pipeline-stages?pipeline=${encodeURIComponent(pipeline)}`),
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const cardId = search.get("card");
    if (!cardId || selectedCard || !cardsQuery.data?.length) return;
    const card = cardsQuery.data.find((item) => item.id === cardId);
    if (!card) return;
    setSelectedCard(card);
    search.delete("card");
    const next = search.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${next ? `?${next}` : ""}`);
  }, [cardsQuery.data, selectedCard]);
  const needsContext = supportOpen || deliveryOpen || Boolean(selectedCard);
  const leadsQuery = useQuery<Lead[]>({
    queryKey: ["work-card-leads", tenantId], enabled: !!tenantId && needsContext,
    queryFn: () => api(`/api/tenants/${tenantId}/leads`), staleTime: 60_000, refetchOnWindowFocus: false,
  });
  const usersQuery = useQuery<User[]>({
    queryKey: ["work-card-users", tenantId], enabled: !!tenantId && needsContext,
    queryFn: () => api(`/api/tenants/${tenantId}/users`), staleTime: 60_000, refetchOnWindowFocus: false,
  });
  const dealsQuery = useQuery<Deal[]>({
    queryKey: ["work-card-deals", tenantId], enabled: !!tenantId && needsContext,
    queryFn: () => api(`/api/tenants/${tenantId}/deals`), staleTime: 60_000, refetchOnWindowFocus: false,
  });
  const proposalsQuery = useQuery<Proposal[]>({
    queryKey: ["work-card-proposals", tenantId], enabled: !!tenantId && (supportOpen || deliveryOpen),
    queryFn: () => api(`/api/tenants/${tenantId}/propostas`), staleTime: 60_000, refetchOnWindowFocus: false,
  });
  const attachmentsQuery = useQuery<Attachment[]>({
    queryKey: ["work-card-attachments", selectedCard?.id],
    enabled: !!selectedCard?.id,
    queryFn: () => api(`/api/work-cards/${selectedCard!.id}/attachments`),
  });

  const leadMap = useMemo(() => new Map((leadsQuery.data ?? []).map((l) => [l.id, l])), [leadsQuery.data]);
  const userMap = useMemo(() => new Map((usersQuery.data ?? []).map((u) => [u.id, u])), [usersQuery.data]);
  const dealMap = useMemo(() => new Map((dealsQuery.data ?? []).map((d) => [d.id, d])), [dealsQuery.data]);

  const patchCard = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => api<WorkCard>(`/api/work-cards/${id}`, {
      method: "PATCH", headers: jsonHeaders, body: JSON.stringify(data),
    }),
    onSuccess: (card) => {
      queryClient.invalidateQueries({ queryKey: ["work-cards", tenantId, pipeline] });
      if (selectedCard?.id === card.id) setSelectedCard(card);
    },
    onError: (error) => toast({ title: "Não foi possível atualizar o card", description: String(error), variant: "destructive" }),
  });

  function updateInstallationChecklistItem(card: WorkCard, key: string, patch: Partial<InstallationChecklistItem>) {
    const items = installationChecklistItems(card).map((item) =>
      item.key === key
        ? {
            ...item,
            ...patch,
            atualizadoEm: new Date().toISOString(),
            atualizadoPor: String((user as any)?.id || (user as any)?.sub || ""),
          }
        : item,
    );
    const metadata = {
      ...(card.metadata ?? {}),
      installationChecklist: {
        version: 1,
        generatedFrom: "order_items",
        items,
        updatedAt: new Date().toISOString(),
      },
    };
    patchCard.mutate({ id: card.id, data: { metadata } });
  }

  const patchInstallationItem = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      api<InstallationDomainItem>(`/api/installation-checklist-items/${id}`, {
        method: "PATCH", headers: jsonHeaders, body: JSON.stringify(data),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["work-card-installation", selectedCard?.id] });
    },
    onError: (error) => toast({ title: "Não foi possível atualizar o item da instalação", description: String(error), variant: "destructive" }),
  });

  const patchInstallationVisit = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      api<InstallationVisit>(`/api/installation-visits/${id}`, {
        method: "PATCH", headers: jsonHeaders, body: JSON.stringify(data),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["work-card-installation", selectedCard?.id] });
    },
    onError: (error) => toast({ title: "Não foi possível atualizar a visita", description: String(error), variant: "destructive" }),
  });

  const patchInstallationOccurrence = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      api<InstallationOccurrence>(`/api/installation-occurrences/${id}`, {
        method: "PATCH", headers: jsonHeaders, body: JSON.stringify(data),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["work-card-installation", selectedCard?.id] });
    },
    onError: (error) => toast({ title: "Não foi possível atualizar a pendência", description: String(error), variant: "destructive" }),
  });

  const createInstallationReturnVisit = useMutation({
    mutationFn: (cardId: string) =>
      api<InstallationVisit>(`/api/work-cards/${cardId}/installation/visits`, {
        method: "POST", headers: jsonHeaders, body: JSON.stringify({ reason: "retorno_pendencias" }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["work-card-installation", selectedCard?.id] });
      toast({ title: "Nova visita/retorno criada com as pendências abertas." });
    },
    onError: (error) => toast({ title: "Não foi possível criar o retorno", description: String(error), variant: "destructive" }),
  });

  const stages = useMemo<Array<readonly [string, string]>>(() => {
    const configured = (pipelineStagesQuery.data ?? [])
      .filter((stage) => Boolean(stage.key))
      .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
      .map((stage) => [stage.key!, stage.label] as const);

    if (configured.length > 0) return configured;
    return pipeline === "suporte"
      ? SUPPORT_STAGES.map(([key, label]) => [key, label] as const)
      : EXECUTION_STAGES.map(([key, label]) => [key, label] as const);
  }, [pipeline, pipelineStagesQuery.data]);
  const cards = cardsQuery.data ?? [];
  const isAdmin = (user as any)?.platformRole === "super_admin" || (user as any)?.platformRole === "tenant_admin" || (user as any)?.userFunction === "administrador";
  const stageIndex = (stage: string) => stages.findIndex(([key]) => key === stage);
  const canMoveForward = (card: WorkCard, target: string) =>
    target === card.etapa || stageIndex(target) >= stageIndex(card.etapa) || (card.pipeline === "execucao" && isAdmin);
  const nextExecutionStage = (stage: string) => {
    const index = EXECUTION_STAGES.findIndex(([key]) => key === stage);
    return index >= 0 && index < EXECUTION_STAGES.length - 1 ? EXECUTION_STAGES[index + 1] : null;
  };
  const currentStageRequirementsCompleted = (card: WorkCard) =>
    (EXECUTION_STAGE_REQUIREMENTS[card.etapa] ?? []).every((requirement) => requirementCompleted(card, requirement.key));

  function setPipeline(next: PipelineKind | "comercial" | "aquecimento" | "parceiros") {
    if (next === "comercial") navigate("/deals");
    else if (next === "aquecimento" || next === "parceiros") navigate(`/pipeline-relacionamento/${next}`);
    else navigate(`/pipeline-operacional/${next}`);
  }

  async function uploadFilesToCard(
    cardId: string,
    files: File[],
    origem = "app",
    metadata?: Record<string, unknown>,
    descricao?: string,
  ): Promise<Attachment[]> {
    if (!files.length || uploading) return [];
    setUploading(true);
    const uploaded: Attachment[] = [];
    try {
      for (const file of files) {
        const meta = await api<{ uploadURL: string; objectPath: string }>("/api/storage/uploads/request-url", {
          method: "POST",
          headers: jsonHeaders,
          body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "application/octet-stream" }),
        });
        const put = await fetch(meta.uploadURL, {
          method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" },
        });
        if (!put.ok) throw new Error(`Falha ao enviar ${file.name}`);
        const url = `/api/storage${meta.objectPath}`;
        const attachment = await api<Attachment>(`/api/work-cards/${cardId}/attachments`, {
          method: "POST",
          headers: jsonHeaders,
          body: JSON.stringify({
            nome: file.name,
            url,
            mimeType: file.type || "application/octet-stream",
            tamanho: file.size,
            origem,
            descricao,
            metadata: metadata ?? {},
          }),
        });
        uploaded.push(attachment);
      }
      await queryClient.invalidateQueries({ queryKey: ["work-card-attachments", cardId] });
      toast({ title: files.length === 1 ? "Anexo registrado" : `${files.length} anexos registrados` });
      return uploaded;
    } catch (error) {
      toast({ title: "Não foi possível anexar os arquivos", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
      return [];
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pipeline</h1>
          <p className="text-sm text-muted-foreground">Comercial, execução, suporte, aquecimento e parceiros ligados à mesma base de clientes.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {pipeline === "execucao" ? (
            <>
              {isAdmin && <Button variant="outline" onClick={() => setInstallationTemplatesOpen(true)} className="gap-2"><ClipboardCheck className="h-4 w-4" /> Configurar instalação</Button>}
              <Button onClick={() => setDeliveryOpen(true)} className="gap-2"><Truck className="h-4 w-4" /> Liberar itens para entrega</Button>
            </>
          ) : (
            <Button onClick={() => setSupportOpen(true)} className="gap-2"><Wrench className="h-4 w-4" /> Novo chamado</Button>
          )}
        </div>
      </div>

      <PipelineNav active={pipeline} />

      <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto overflow-y-hidden pb-3">
        {stages.map(([key, label]) => {
          const stageCards = cards.filter((card) =>
            card.etapa === key && (!card.leadId || leadMap.has(card.leadId))
          );
          return (
            <section
              key={key}
              className={PIPELINE_COLUMN_CLASS}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                const dragged = cards.find((card) => card.id === draggedId);
                if (dragged && !canMoveForward(dragged, key)) {
                  toast({ title: "Movimento não permitido", description: "O card só pode avançar. Etapas já concluídas ficam no histórico.", variant: "destructive" });
                } else if (draggedId && !patchCard.isPending) {
                  patchCard.mutate({ id: draggedId, data: { etapa: key } });
                }
                setDraggedId(null);
              }}
            >
              <div className={PIPELINE_COLUMN_HEADER_CLASS}>
                <h2 className="text-sm font-semibold">{label}</h2>
                <Badge variant="secondary">{stageCards.length}</Badge>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto p-2">
                {cardsQuery.isLoading && <div className="h-24 animate-pulse rounded-lg bg-muted" />}
                {!cardsQuery.isLoading && stageCards.length === 0 && (
                  <div className="rounded-lg border border-dashed p-5 text-center text-xs text-muted-foreground">Arraste um card para esta etapa</div>
                )}
                {stageCards.map((card) => {
                  const lead = card.leadLabel || (card.leadId ? (leadMap.get(card.leadId)?.nome || leadMap.get(card.leadId)?.empresa) : undefined);
                  const responsible = card.responsavelLabel || (card.responsavelId ? (userMap.get(card.responsavelId)?.name || userMap.get(card.responsavelId)?.email) : undefined);
                  const items = safeItems(card);
                  return (
                    <article
                      key={card.id}
                      draggable
                      onDragStart={() => setDraggedId(card.id)}
                      onDragEnd={() => setDraggedId(null)}
                      onClick={() => setSelectedCard(card)}
                      className={PIPELINE_CARD_CLASS}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-primary">{card.codigo}</p>
                          <p className="mt-0.5 text-sm font-semibold leading-tight">{card.titulo}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {card.prioridade === "urgente" || card.prioridade === "alta" ? <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" /> : null}
                          <AdminDeleteLeadButton
                            leadId={card.leadId}
                            leadName={lead || card.titulo}
                            onDeleted={() => {
                              if (selectedCard?.leadId === card.leadId) setSelectedCard(null);
                            }}
                          />
                        </div>
                      </div>
                      {lead && <p className="mt-2 truncate text-xs text-muted-foreground">{lead}</p>}
                      {responsible ? (
                        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><UserRound className="h-3 w-3" /> {responsible}</p>
                      ) : (
                        <p className="mt-1 text-xs font-medium text-amber-600">Sem responsável</p>
                      )}
                      {card.tipo === "entrega" && items.length > 0 && (
                        <div className="mt-2 rounded-md bg-muted/50 p-2 text-[11px]">
                          {items.slice(0, 3).map((item, index) => <div key={index}>{item.quantidade} × {item.nome}</div>)}
                          {items.length > 3 && <div className="text-muted-foreground">+{items.length - 3} item(ns)</div>}
                        </div>
                      )}
                      {card.dataFimPrevista && <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground"><CalendarDays className="h-3 w-3" /> Previsto: {formatPlannedDate(card.dataFimPrevista)}</p>}
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <Sheet open={!!selectedCard} onOpenChange={(open) => !open && setSelectedCard(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {selectedCard && (
            <>
              <SheetHeader>
                <SheetTitle className="pr-8">{selectedCard.codigo} — {selectedCard.titulo}</SheetTitle>
              </SheetHeader>
              <div className="mt-5 space-y-5">
                <div className="grid grid-cols-2 gap-3 rounded-lg border p-3 text-sm">
                  <div><p className="text-xs text-muted-foreground">Cliente</p><p>{selectedCard.leadLabel || (selectedCard.leadId ? (leadMap.get(selectedCard.leadId)?.nome || leadMap.get(selectedCard.leadId)?.empresa || "—") : "—")}</p></div>
                  <div><p className="text-xs text-muted-foreground">Pedido</p><p>{selectedCard.dealTitle || (selectedCard.dealId ? (dealMap.get(selectedCard.dealId)?.titulo || "—") : "—")}</p></div>
                  <div><p className="text-xs text-muted-foreground">Liberação prevista</p><p>{formatPlannedDate(selectedCard.dataInicioPrevista)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Liberação efetiva</p><p>{formatDate(selectedCard.dataInicioEfetiva)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Conclusão/entrega prevista</p><p>{formatPlannedDate(selectedCard.dataFimPrevista)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Conclusão/entrega efetiva</p><p>{formatDate(selectedCard.dataFimEfetiva)}</p></div>
                </div>

                {selectedCard.pipeline === "execucao" && selectedCard.dealId && selectedCard.propostaId && (
                  <Button variant="outline" className="w-full" onClick={() => {
                    window.location.assign("/execution-lots?dealId=" + encodeURIComponent(selectedCard.dealId!) + "&proposalId=" + encodeURIComponent(selectedCard.propostaId!));
                  }}>
                    Gerenciar lotes e quantidades de execução
                  </Button>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-medium">Etapa</label>
                  <Select value={selectedCard.etapa} disabled={patchCard.isPending} onValueChange={(etapa) => { if (!patchCard.isPending) patchCard.mutate({ id: selectedCard.id, data: { etapa } }); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {stages
                        .filter(([key]) => selectedCard.pipeline === "execucao" && isAdmin ? true : stageIndex(key) >= stageIndex(selectedCard.etapa))
                        .map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {selectedCard.pipeline === "execucao" && isAdmin && <p className="text-[11px] text-muted-foreground">Administrador pode corrigir a etapa para frente ou para trás; a alteração fica registrada no histórico.</p>}
                </div>

                {selectedCard.pipeline === "execucao" ? (
                  <div className="space-y-4 rounded-lg border p-4">
                    <div>
                      <h3 className="text-sm font-semibold">Edição manual da execução</h3>
                      <p className="text-xs text-muted-foreground">As automações continuam ativas, mas estes dados podem ser corrigidos manualmente.</p>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium">Título do pedido</label>
                      <Input
                        key={`title-${selectedCard.id}-${selectedCard.titulo}`}
                        defaultValue={selectedCard.titulo}
                        disabled={patchCard.isPending}
                        onBlur={(event) => {
                          const titulo = event.currentTarget.value.trim();
                          if (titulo && titulo !== selectedCard.titulo && !patchCard.isPending) patchCard.mutate({ id: selectedCard.id, data: { titulo } });
                        }}
                      />
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium">Prioridade</label>
                        <Select value={selectedCard.prioridade} disabled={patchCard.isPending} onValueChange={(prioridade) => patchCard.mutate({ id: selectedCard.id, data: { prioridade } })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="baixa">Baixa</SelectItem>
                            <SelectItem value="normal">Normal</SelectItem>
                            <SelectItem value="alta">Alta</SelectItem>
                            <SelectItem value="urgente">Urgente</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium">Responsável</label>
                        <Select value={selectedCard.responsavelId || "__none__"} disabled={patchCard.isPending} onValueChange={(responsavelId) => patchCard.mutate({ id: selectedCard.id, data: { responsavelId: responsavelId === "__none__" ? null : responsavelId } })}>
                          <SelectTrigger><SelectValue placeholder="Selecionar responsável" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Sem responsável</SelectItem>
                            {eligibleUsersForStage(usersQuery.data ?? [], (pipelineStagesQuery.data ?? []).find((stage) => stage.key === selectedCard.etapa)).map((u) => <SelectItem key={u.id} value={u.id}>{u.name || u.email || u.id}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {[
                        ["dataInicioPrevista", "Início previsto", selectedCard.dataInicioPrevista],
                        ["dataInicioEfetiva", "Início efetivo", selectedCard.dataInicioEfetiva],
                        ["dataFimPrevista", "Conclusão prevista", selectedCard.dataFimPrevista],
                        ["dataFimEfetiva", "Conclusão efetiva", selectedCard.dataFimEfetiva],
                      ].map(([field, label, value]) => (
                        <div key={String(field)} className="space-y-1.5">
                          <label className="text-xs font-medium">{String(label)}</label>
                          <Input
                            type="date"
                            value={toDateInput(value as string | null)}
                            disabled={patchCard.isPending}
                            onChange={(event) => {
                              const next = event.currentTarget.value;
                              patchCard.mutate({ id: selectedCard.id, data: { [String(field)]: next || null } });
                            }}
                          />
                        </div>
                      ))}
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium">Observações da execução</label>
                      <Textarea
                        key={`description-${selectedCard.id}-${selectedCard.descricao ?? ""}`}
                        defaultValue={selectedCard.descricao ?? ""}
                        rows={4}
                        disabled={patchCard.isPending}
                        onBlur={(event) => {
                          const descricao = event.currentTarget.value.trim();
                          if (descricao !== (selectedCard.descricao ?? "") && !patchCard.isPending) patchCard.mutate({ id: selectedCard.id, data: { descricao: descricao || null } });
                        }}
                      />
                    </div>

                    {(EXECUTION_STAGE_REQUIREMENTS[selectedCard.etapa] ?? []).length > 0 && (
                      <div className="space-y-3 rounded-xl border bg-muted/20 p-3">
                        <div>
                          <h4 className="text-sm font-semibold">Requisitos desta etapa</h4>
                          <p className="text-xs text-muted-foreground">O card só avança quando os requisitos obrigatórios desta etapa estiverem concluídos.</p>
                        </div>
                        {(EXECUTION_STAGE_REQUIREMENTS[selectedCard.etapa] ?? []).map((requirement) => {
                          const completed = requirementCompleted(selectedCard, requirement.key);
                          return (
                            <div key={requirement.key} className="flex items-start justify-between gap-3 rounded-lg border bg-background p-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  {completed ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <ClipboardCheck className="h-4 w-4 text-muted-foreground" />}
                                  <p className="text-sm font-medium">{requirement.label}</p>
                                </div>
                                <p className="mt-1 text-xs text-muted-foreground">{requirement.description}</p>
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                variant={completed ? "secondary" : "default"}
                                disabled={patchCard.isPending}
                                onClick={() => {
                                  if (OPERATIONAL_FORM_KEYS.has(requirement.key)) {
                                    setStageFormKey(requirement.key);
                                    return;
                                  }
                                  const metadata = { ...(selectedCard.metadata ?? {}) };
                                  const currentGates = metadata.stageGates && typeof metadata.stageGates === "object"
                                    ? { ...(metadata.stageGates as Record<string, unknown>) }
                                    : {};
                                  currentGates[requirement.key] = {
                                    completed: !completed,
                                    completedAt: !completed ? new Date().toISOString() : null,
                                    completedBy: !completed ? ((user as any)?.id || (user as any)?.sub || null) : null,
                                    stage: selectedCard.etapa,
                                  };
                                  patchCard.mutate({ id: selectedCard.id, data: { metadata: { ...metadata, stageGates: currentGates } } });
                                }}
                              >
                                {OPERATIONAL_FORM_KEYS.has(requirement.key)
                                  ? (completed ? "Ver / nova versão" : "Preencher")
                                  : (completed ? "Reabrir" : "Concluir")}
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {(() => {
                      const nextStage = nextExecutionStage(selectedCard.etapa);
                      const requirementsCompleted = currentStageRequirementsCompleted(selectedCard);
                      if (!nextStage) {
                        return (
                          <div className="rounded-xl border bg-muted/20 p-3 text-sm text-muted-foreground">
                            Este pedido já está na etapa final da execução.
                          </div>
                        );
                      }
                      return (
                        <div className="flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-sm font-semibold">Avançar etapa</p>
                            <p className="text-xs text-muted-foreground">
                              Próxima etapa: <strong className="text-foreground">{nextStage[1]}</strong>
                              {!requirementsCompleted ? " • conclua os requisitos obrigatórios acima para liberar o avanço." : ""}
                            </p>
                          </div>
                          <Button
                            type="button"
                            disabled={patchCard.isPending || !requirementsCompleted}
                            onClick={() => {
                              patchCard.mutate(
                                { id: selectedCard.id, data: { etapa: nextStage[0] } },
                                {
                                  onSuccess: () => toast({
                                    title: "Etapa avançada",
                                    description: `Pedido movido para ${nextStage[1]}.`,
                                  }),
                                },
                              );
                            }}
                          >
                            {patchCard.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Avançar para {nextStage[1]}
                          </Button>
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Responsável</label>
                      <Select value={selectedCard.responsavelId || "__none__"} disabled={patchCard.isPending} onValueChange={(responsavelId) => { if (!patchCard.isPending) patchCard.mutate({ id: selectedCard.id, data: { responsavelId: responsavelId === "__none__" ? null : responsavelId } }); }}>
                        <SelectTrigger><SelectValue placeholder="Selecionar responsável" /></SelectTrigger>
                        <SelectContent>
                          {(usersQuery.data ?? []).map((u) => <SelectItem key={u.id} value={u.id}>{u.name || u.email || u.id}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    {selectedCard.descricao && <div className="rounded-lg border bg-muted/20 p-3"><p className="text-xs font-semibold uppercase text-muted-foreground">Relato / observações</p><p className="mt-1 whitespace-pre-wrap text-sm">{selectedCard.descricao}</p></div>}
                  </>
                )}

                {["execucao", "suporte"].includes(selectedCard.pipeline) && (
                  <SupportActivityExecutionPanel
                    card={selectedCard}
                    token={token ?? ""}
                    onChanged={async () => {
                      const fresh = await api<WorkCard>(`/api/work-cards/${selectedCard.id}`);
                      setSelectedCard(fresh);
                      await queryClient.invalidateQueries({ queryKey: ["work-cards", tenantId, selectedCard.pipeline] });
                    }}
                  />
                )}

                {selectedCard.pipeline === "suporte" && (
                  <>
                    <SupportReportPanel
                      card={selectedCard}
                      token={token ?? ""}
                      onChanged={async () => {
                        const fresh = await api<WorkCard>(`/api/work-cards/${selectedCard.id}`);
                        setSelectedCard(fresh);
                        await queryClient.invalidateQueries({ queryKey: ["work-cards", tenantId, "suporte"] });
                      }}
                    />
                  </>
                )}

                {isInstallationStage(selectedCard.etapa) && safeItems(selectedCard).length > 0 ? (
                  <div className="space-y-4">
                    {installationQuery.isLoading && <div className="h-36 animate-pulse rounded-xl bg-muted" />}
                    {installationQuery.isError && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                        Não foi possível carregar a estrutura detalhada da instalação. O checklist básico do card continua preservado.
                      </div>
                    )}

                    {installationQuery.data ? (() => {
                      const data = installationQuery.data;
                      const currentVisit = data.visits.find((visit) => visit.id === data.currentVisitId) ?? data.visits.at(-1);
                      const currentItems = currentVisit ? data.items.filter((item) => item.visitId === currentVisit.id) : data.items;
                      const completed = currentItems.filter((item) => ["installed", "verified", "instalado", "conferido"].includes(item.status)).length;
                      const pending = currentItems.length - completed;
                      const openOccurrences = data.occurrences.filter((occurrence) => occurrence.status === "open" || occurrence.status === "in_progress");
                      return (
                        <div className="space-y-4 rounded-xl border p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <h3 className="text-sm font-semibold">Checklist de instalação</h3>
                              <p className="text-xs text-muted-foreground">
                                Visita {currentVisit?.visitNumber ?? 1} • itens e verificações derivados do pedido e do template do produto.
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Badge variant="outline">{completed}/{currentItems.length} concluídos</Badge>
                              {openOccurrences.length > 0 && <Badge variant="destructive">{openOccurrences.length} pendência(s)</Badge>}
                            </div>
                          </div>

                          {currentVisit && (
                            <div className="grid gap-3 rounded-lg bg-muted/30 p-3 sm:grid-cols-2">
                              <div>
                                <p className="text-[11px] font-medium uppercase text-muted-foreground">Situação da visita</p>
                                <p className="mt-1 text-sm font-medium">{currentVisit.status.replaceAll("_", " ")}</p>
                              </div>
                              <div className="flex flex-wrap items-end justify-end gap-2">
                                {currentVisit.status === "scheduled" && (
                                  <Button size="sm" variant="outline" onClick={() => patchInstallationVisit.mutate({ id: currentVisit.id, data: { status: "in_progress", startedAt: new Date().toISOString() } })}>
                                    Iniciar visita
                                  </Button>
                                )}
                                {currentVisit.status === "in_progress" && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => patchInstallationVisit.mutate({
                                      id: currentVisit.id,
                                      data: { status: pending > 0 ? "completed_with_pending" : "completed", endedAt: new Date().toISOString() },
                                    })}
                                  >
                                    {pending > 0 ? "Encerrar visita com pendências" : "Concluir visita"}
                                  </Button>
                                )}
                                {(currentVisit.status === "completed_with_pending" || openOccurrences.length > 0) && (
                                  <Button size="sm" onClick={() => createInstallationReturnVisit.mutate(selectedCard.id)}>
                                    Nova visita / retorno
                                  </Button>
                                )}
                              </div>
                            </div>
                          )}

                          <div className="space-y-3">
                            {currentItems.map((item) => {
                              const itemOccurrences = data.occurrences.filter((occurrence) => occurrence.checklistItemId === item.id && occurrence.status !== "resolved" && occurrence.status !== "cancelled");
                              const attrs = Object.entries(item.attributes ?? {}).slice(0, 8);
                              return (
                                <div key={item.id} className="rounded-lg border bg-muted/10 p-3">
                                  <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                      <p className="font-medium">
                                        {item.quantity} × {item.productName}{item.unitIndex ? ` • unidade ${item.unitIndex}` : ""}
                                      </p>
                                      {item.location && <p className="mt-0.5 text-xs text-muted-foreground">Local: {item.location}</p>}
                                      {attrs.length > 0 && (
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                          {attrs.map(([key, value]) => (
                                            <span key={key} className="rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                                              <strong className="font-medium text-foreground">{key.replace(/_/g, " ")}:</strong> {typeof value === "object" ? JSON.stringify(value) : String(value)}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                      {(item.checks?.length ?? 0) > 0 && (
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                          {(item.checks ?? []).map((check, idx) => {
                                            const done = check.completed === true;
                                            return (
                                              <Button
                                                key={String(check.key || idx)}
                                                type="button"
                                                size="sm"
                                                variant={done ? "secondary" : "outline"}
                                                className="h-7 gap-1 px-2 text-[10px]"
                                                disabled={patchInstallationItem.isPending}
                                                onClick={() => {
                                                  const checks = (item.checks ?? []).map((current, currentIndex) =>
                                                    currentIndex === idx ? { ...current, completed: !done } : current
                                                  );
                                                  patchInstallationItem.mutate({ id: item.id, data: { checks } });
                                                }}
                                              >
                                                <CheckCircle2 className="h-3 w-3" />
                                                {done ? "OK • " : ""}
                                                {String(check.label || check.key || "Verificação")}
                                              </Button>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                    <Select
                                      value={item.status}
                                      disabled={patchInstallationItem.isPending}
                                      onValueChange={(status) => patchInstallationItem.mutate({ id: item.id, data: { status } })}
                                    >
                                      <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
                                      <SelectContent>
                                        {INSTALLATION_STATUS_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                                      </SelectContent>
                                    </Select>
                                  </div>

                                  <Textarea
                                    key={`installation-domain-note-${item.id}-${item.observation || ""}`}
                                    className="mt-3"
                                    rows={2}
                                    defaultValue={item.observation || ""}
                                    placeholder="Observação, divergência, pendência ou informação para retorno..."
                                    disabled={patchInstallationItem.isPending}
                                    onBlur={(event) => {
                                      const observation = event.currentTarget.value.trim();
                                      if (observation !== (item.observation || "")) patchInstallationItem.mutate({ id: item.id, data: { observation } });
                                    }}
                                  />

                                  <div className="mt-3 flex flex-wrap items-center gap-2">
                                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted">
                                      <Upload className="h-3.5 w-3.5" />
                                      Evidência do item
                                      <input
                                        type="file"
                                        className="hidden"
                                        multiple
                                        accept="image/*,video/*,.pdf"
                                        onChange={(event) => {
                                          const files = Array.from(event.target.files ?? []);
                                          event.currentTarget.value = "";
                                          if (files.length) void uploadFilesToCard(selectedCard.id, files, "instalacao_item", {
                                            installationChecklistItemId: item.id,
                                            installationVisitId: item.visitId,
                                          });
                                        }}
                                      />
                                    </label>
                                    {item.evidenceRequired && <Badge variant="outline">Evidência obrigatória</Badge>}
                                    {itemOccurrences.map((occurrence) => (
                                      <div key={occurrence.id} className="inline-flex items-center gap-1">
                                        <Badge variant="destructive">{occurrence.type.replaceAll("_", " ")}</Badge>
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          className="h-7 px-2 text-[10px]"
                                          disabled={patchInstallationOccurrence.isPending}
                                          onClick={() => patchInstallationOccurrence.mutate({
                                            id: occurrence.id,
                                            data: { status: "resolved", resolution: "Pendência resolvida e conferida durante a instalação." },
                                          })}
                                        >
                                          Resolver
                                        </Button>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {openOccurrences.length > 0 && (
                            <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                              <p className="text-xs font-semibold uppercase text-amber-900">Pendências abertas</p>
                              {openOccurrences.map((occurrence) => (
                                <div key={occurrence.id} className="flex items-start justify-between gap-3 text-xs text-amber-900">
                                  <div>
                                    <strong>{occurrence.type.replaceAll("_", " ")}</strong>
                                    {occurrence.description ? ` — ${occurrence.description}` : ""}
                                  </div>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-7 shrink-0 bg-white px-2 text-[10px]"
                                    disabled={patchInstallationOccurrence.isPending}
                                    onClick={() => patchInstallationOccurrence.mutate({
                                      id: occurrence.id,
                                      data: { status: "resolved", resolution: "Pendência resolvida e conferida durante a instalação." },
                                    })}
                                  >
                                    Marcar resolvida
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
                            A visita pode ser encerrada com pendências, mas <strong className="text-foreground">Instalação finalizada</strong> só é liberada quando os itens obrigatórios, verificações e evidências exigidas estiverem concluídos e não houver ocorrência aberta. O aceite do cliente permanece separado da conferência técnica.
                          </div>
                        </div>
                      );
                    })() : (
                      <div className="space-y-3 rounded-xl border p-4">
                        <h3 className="text-sm font-semibold">Checklist de instalação</h3>
                        {safeItems(selectedCard).map((source, index) => {
                          const checklistItem = installationChecklistItems(selectedCard)[index];
                          return (
                            <div key={checklistItem?.key || index} className="rounded-lg border p-3 text-sm">
                              {itemQuantity(source)} × {itemName(source)}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : safeItems(selectedCard).length > 0 ? (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold">Itens deste lote</h3>
                    <div className="divide-y rounded-lg border">
                      {safeItems(selectedCard).map((item, index) => <div key={index} className="flex justify-between px-3 py-2 text-sm"><span>{itemName(item)}</span><strong>{itemQuantity(item)}</strong></div>)}
                    </div>
                  </div>
                ) : null}

                {safeExpeditionChecklist(selectedCard) && (
                  <ExpeditionChecklistPanel
                    checklist={safeExpeditionChecklist(selectedCard)!}
                    disabled={patchCard.isPending || uploading}
                    isAdmin={isAdmin}
                    onChange={(checklistExpedicao) => patchCard.mutate({
                      id: selectedCard.id,
                      data: {
                        metadata: {
                          ...(selectedCard.metadata ?? {}),
                          checklistExpedicao,
                        },
                      },
                    })}
                    onUploadEvidence={async ({ itemIndex, fieldIndex, item, field, files }) => {
                      const uploaded = await uploadFilesToCard(
                        selectedCard.id,
                        files,
                        "checklist_expedicao",
                        {
                          checklist: "expedicao",
                          itemIndex,
                          fieldIndex,
                          produtoId: item.produtoId ?? null,
                          sku: item.sku ?? null,
                          campo: field.key,
                        },
                        `Evidência da expedição • ${item.nome} • ${field.label}`,
                      );
                      return uploaded.map((attachment) => ({ id: attachment.id, url: attachment.url, nome: attachment.nome }));
                    }}
                    onOverride={(justificativa) => patchCard.mutate({
                      id: selectedCard.id,
                      data: {
                        etapa: "em_transporte",
                        metadata: {
                          ...(selectedCard.metadata ?? {}),
                          expedicaoOverride: {
                            aprovado: true,
                            justificativa,
                          },
                        },
                      },
                    })}
                  />
                )}

                {safeTransportChecklist(selectedCard) && (
                  <TransportChecklistPanel
                    checklist={safeTransportChecklist(selectedCard)!}
                    disabled={patchCard.isPending}
                    onChange={(checklistTransporte) => patchCard.mutate({
                      id: selectedCard.id,
                      data: {
                        metadata: {
                          ...(selectedCard.metadata ?? {}),
                          checklistTransporte,
                        },
                      },
                    })}
                  />
                )}

                {selectedCard.pipeline === "execucao" && selectedCard.etapa === "instalacao_finalizada" && installationQuery.data && (
                  <InstallationAcceptancePanel
                    card={selectedCard}
                    installation={installationQuery.data}
                    uploading={uploading}
                    api={api}
                    uploadFiles={uploadFilesToCard}
                    onAccepted={async () => {
                      await queryClient.invalidateQueries({ queryKey: ["work-card-installation", selectedCard.id] });
                      await queryClient.invalidateQueries({ queryKey: ["work-card-attachments", selectedCard.id] });
                    }}
                  />
                )}

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Fotos, vídeos, áudios e documentos</h3>
                    <Button size="sm" variant="outline" className="gap-1" disabled={uploading} onClick={() => detailFileRef.current?.click()}><Upload className="h-3.5 w-3.5" /> Anexar</Button>
                  </div>
                  <input
                    ref={detailFileRef}
                    type="file"
                    multiple
                    className="hidden"
                    accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
                    onChange={(event) => {
                      const files = Array.from(event.target.files ?? []);
                      event.target.value = "";
                      if (files.length) void uploadFilesToCard(selectedCard.id, files);
                    }}
                  />
                  {attachmentsQuery.isLoading && <div className="h-16 animate-pulse rounded bg-muted" />}
                  {(attachmentsQuery.data ?? []).map((attachment) => (
                    <a key={attachment.id} href={attachment.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border p-2.5 text-sm hover:bg-muted/50">
                      <Paperclip className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{attachment.nome}</span>
                      <span className="text-[10px] text-muted-foreground">{attachment.origem}</span>
                    </a>
                  ))}
                  {!attachmentsQuery.isLoading && (attachmentsQuery.data?.length ?? 0) === 0 && <p className="text-xs text-muted-foreground">Nenhum anexo ainda.</p>}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {selectedCard && (
        <OperationalStageFormDialog
          open={Boolean(stageFormKey)}
          onOpenChange={(open) => { if (!open) setStageFormKey(null); }}
          requirementKey={stageFormKey}
          card={selectedCard}
          attachments={attachmentsQuery.data ?? []}
          token={token ?? ""}
          onChanged={async () => {
            const fresh = await api<WorkCard>(`/api/work-cards/${selectedCard.id}`);
            setSelectedCard(fresh);
            await queryClient.invalidateQueries({ queryKey: ["work-cards", tenantId, "execucao"] });
            await queryClient.invalidateQueries({ queryKey: ["work-card-attachments", selectedCard.id] });
          }}
        />
      )}

      <SupportDialog
        open={supportOpen}
        onOpenChange={setSupportOpen}
        tenantId={tenantId}
        token={token ?? ""}
        leads={leadsQuery.data ?? []}
        deals={dealsQuery.data ?? []}
        proposals={proposalsQuery.data ?? []}
        users={usersQuery.data ?? []}
        stages={pipelineStagesQuery.data ?? []}
        onCreated={async () => {
          setSupportOpen(false);
          await queryClient.invalidateQueries({ queryKey: ["work-cards", tenantId, "suporte"] });
          if (pipeline !== "suporte") setPipeline("suporte");
        }}
      />

      <InstallationTemplateDialog
        open={installationTemplatesOpen}
        onOpenChange={setInstallationTemplatesOpen}
        tenantId={tenantId}
        token={token ?? ""}
      />

      <DeliveryDialog
        open={deliveryOpen}
        onOpenChange={setDeliveryOpen}
        tenantId={tenantId}
        token={token ?? ""}
        deals={dealsQuery.data ?? []}
        leads={leadsQuery.data ?? []}
        users={usersQuery.data ?? []}
        onCreated={async () => {
          setDeliveryOpen(false);
          await queryClient.invalidateQueries({ queryKey: ["work-cards", tenantId, "execucao"] });
          toast({ title: "Lote de entrega criado e enviado para a Pipeline de Execução." });
        }}
      />
    </div>
  );
}

function InstallationAcceptancePanel({
  card,
  installation,
  uploading,
  api,
  uploadFiles,
  onAccepted,
}: {
  card: WorkCard;
  installation: InstallationDomainResponse;
  uploading: boolean;
  api: <T>(url: string, options?: RequestInit) => Promise<T>;
  uploadFiles: (cardId: string, files: File[], origem?: string, metadata?: Record<string, unknown>, descricao?: string) => Promise<Attachment[]>;
  onAccepted: () => void | Promise<void>;
}) {
  const { toast } = useToast();
  const currentVisit = installation.visits.find((visit) => visit.id === installation.currentVisitId) ?? installation.visits.at(-1);
  const [receiverName, setReceiverName] = useState("");
  const [receiverDocument, setReceiverDocument] = useState("");
  const [receiverRelationship, setReceiverRelationship] = useState("");
  const [customerSignatureUrl, setCustomerSignatureUrl] = useState("");
  const [companySignatureUrl, setCompanySignatureUrl] = useState("");
  const [saving, setSaving] = useState(false);

  if (!currentVisit) return null;

  if (currentVisit.customerAcceptanceStatus === "accepted") {
    return (
      <div className="rounded-xl border bg-emerald-50/60 p-4">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-700" />
          <div>
            <h3 className="text-sm font-semibold text-emerald-950">Entrega e aceite concluídos</h3>
            <p className="mt-1 text-xs text-emerald-800">
              Recebido por {currentVisit.receiverName || "representante identificado"}. O termo final está congelado e disponível nos documentos/anexos deste processo.
            </p>
          </div>
        </div>
      </div>
    );
  }

  async function uploadSignature(file: File | undefined, kind: "customer" | "company") {
    if (!file) return;
    const uploaded = await uploadFiles(card.id, [file], kind === "customer" ? "installation_signature_customer" : "installation_signature_company", {
      installationVisitId: currentVisit.id,
      signatureRole: kind,
    });
    const url = uploaded[0]?.url || "";
    if (kind === "customer") setCustomerSignatureUrl(url);
    else setCompanySignatureUrl(url);
  }

  async function accept() {
    if (!receiverName.trim() || !customerSignatureUrl || !companySignatureUrl) {
      toast({ title: "Informe o recebedor e as duas assinaturas.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await api(`/api/installation-visits/${currentVisit.id}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiverName: receiverName.trim(),
          receiverDocument: receiverDocument.trim() || null,
          receiverRelationship: receiverRelationship.trim() || null,
          customerSignatureUrl,
          companySignatureUrl,
        }),
      });
      toast({ title: "Aceite concluído", description: "O termo final imutável foi gerado e anexado ao processo." });
      await onAccepted();
    } catch (error) {
      toast({ title: "Não foi possível concluir o aceite", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 rounded-xl border p-4">
      <div>
        <h3 className="text-sm font-semibold">Entrega e aceite do cliente</h3>
        <p className="text-xs text-muted-foreground">Etapa separada da conferência técnica. Após confirmar, o documento fica imutável e qualquer correção exige um novo registro posterior.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <label className="text-xs font-medium">Nome de quem recebe *</label>
          <Input value={receiverName} onChange={(e) => setReceiverName(e.target.value)} placeholder="Cliente ou representante autorizado" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium">Documento</label>
          <Input value={receiverDocument} onChange={(e) => setReceiverDocument(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium">Vínculo com o cliente</label>
          <Input value={receiverRelationship} onChange={(e) => setReceiverRelationship(e.target.value)} placeholder="Ex.: cliente, responsável da obra..." />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="cursor-pointer rounded-lg border border-dashed p-3 text-sm hover:bg-muted/40">
          <strong>Assinatura do cliente/representante *</strong>
          <p className="mt-1 text-xs text-muted-foreground">{customerSignatureUrl ? "Assinatura anexada." : "Clique para anexar imagem da assinatura."}</p>
          <input type="file" className="hidden" accept="image/*" disabled={uploading} onChange={(e) => void uploadSignature(e.target.files?.[0], "customer")} />
        </label>
        <label className="cursor-pointer rounded-lg border border-dashed p-3 text-sm hover:bg-muted/40">
          <strong>Assinatura da empresa/instalador *</strong>
          <p className="mt-1 text-xs text-muted-foreground">{companySignatureUrl ? "Assinatura anexada." : "Clique para anexar imagem da assinatura."}</p>
          <input type="file" className="hidden" accept="image/*" disabled={uploading} onChange={(e) => void uploadSignature(e.target.files?.[0], "company")} />
        </label>
      </div>
      <Button disabled={saving || uploading || !receiverName.trim() || !customerSignatureUrl || !companySignatureUrl} onClick={() => void accept()}>
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Gerar termo final e concluir aceite
      </Button>
    </div>
  );
}

function SupportDialog({ open, onOpenChange, tenantId, token, leads, deals, proposals, users, stages, onCreated }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  token: string;
  leads: Lead[];
  deals: Deal[];
  proposals: Proposal[];
  users: User[];
  stages: ConfiguredPipelineStage[];
  onCreated: () => void | Promise<void>;
}) {
  const { toast } = useToast();
  const [leadId, setLeadId] = useState("");
  const [leadSearch, setLeadSearch] = useState("");
  const [dealId, setDealId] = useState("");
  const [categoria, setCategoria] = useState("defeito");
  const [titulo, setTitulo] = useState("");
  const [relato, setRelato] = useState("");
  const [produtos, setProdutos] = useState("");
  const [responsavelId, setResponsavelId] = useState("");
  const [prioridade, setPrioridade] = useState("normal");
  const [data, setData] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [importingLegacyOrder, setImportingLegacyOrder] = useState(false);
  const [legacyOrder, setLegacyOrder] = useState<LegacyOrderImport | null>(null);
  const legacyOrderFileRef = useRef<HTMLInputElement>(null);

  const leadDeals = deals.filter((d) => d.leadId === leadId);
  const selectedLead = leads.find((lead) => lead.id === leadId) ?? null;
  // Etapa de abertura do chamado = primeira etapa (menor ordem) do pipeline de suporte.
  // Usada para filtrar os responsáveis elegíveis pelas funções responsáveis da etapa.
  const openingStage = [...stages].sort((a, b) => a.ordem - b.ordem)[0] ?? null;
  const eligibleResponsibleUsers = eligibleUsersForStage(users, openingStage);
  const leadGroups = useMemo(() => {
    const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
    const query = normalize(leadSearch);
    const ordered = [...leads]
      .filter((lead) => {
        if (!query) return true;
        return [lead.nome, lead.empresa, lead.telefone, lead.email, lead.endereco]
          .filter(Boolean)
          .some((value) => normalize(String(value)).includes(query));
      })
      .sort((a, b) => {
        const aLabel = String(a.nome || a.empresa || a.id);
        const bLabel = String(b.nome || b.empresa || b.id);
        return aLabel.localeCompare(bLabel, "pt-BR", { sensitivity: "base" });
      });
    return ordered.reduce<Array<{ letter: string; leads: Lead[] }>>((groups, lead) => {
      const label = String(lead.nome || lead.empresa || lead.id).trim();
      const first = label.charAt(0).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
      const letter = /[A-Z0-9]/.test(first) ? first : "#";
      const current = groups.at(-1);
      if (current?.letter === letter) current.leads.push(lead);
      else groups.push({ letter, leads: [lead] });
      return groups;
    }, []);
  }, [leads, leadSearch]);
  const proposal = proposals.find((p) => p.dealId === dealId) ?? null;

  function legacyItemLabel(item: Record<string, unknown>, index: number) {
    return String(item.nome || item.name || item.descricao || item.produto || item.sku || `Item ${index + 1}`);
  }

  async function importLegacyOrder(file: File) {
    setImportingLegacyOrder(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const response = await fetch(`/api/tenants/${tenantId}/deals/extract-quote`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Não foi possível ler o pedido antigo");
      const items = Array.isArray(body.itens) ? body.itens.filter((item: unknown) => item && typeof item === "object") : [];
      const imported: LegacyOrderImport = {
        sourceFileName: body.originalName || file.name,
        sourceFileUrl: body.quoteFileUrl ?? null,
        sourceMimeType: file.type || null,
        sourceSize: file.size,
        importedAt: new Date().toISOString(),
        confidence: typeof body.confianca === "number" ? body.confianca : null,
        title: body.titulo ?? null,
        customer: body.cliente ?? null,
        supplier: body.fornecedor ?? null,
        total: body.valorTotal ?? null,
        observations: body.observacoes ?? null,
        items,
        selectedItemIndexes: items.map((_: unknown, index: number) => index),
      };
      if (!leadId && body.cliente) {
        const normalizeCustomer = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
        const extractedCustomer = normalizeCustomer(body.cliente);
        const matchedLead = leads.find((lead) =>
          [lead.nome, lead.empresa].some((value) => normalizeCustomer(value) === extractedCustomer)
        );
        if (matchedLead) setLeadId(matchedLead.id);
      }
      setLegacyOrder(imported);
      setDealId("");
      if (items.length) {
        setProdutos(items.map((item: Record<string, unknown>, index: number) => legacyItemLabel(item, index)).join(", "));
      }
      toast({
        title: items.length ? "Pedido antigo importado" : "Pedido importado para revisão",
        description: items.length ? `${items.length} item(ns) identificados. Confira e marque os afetados.` : "O arquivo original foi preservado. Confira os dados extraídos antes de abrir a assistência.",
      });
    } catch (error) {
      toast({ title: "Erro ao importar pedido antigo", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally {
      setImportingLegacyOrder(false);
      if (legacyOrderFileRef.current) legacyOrderFileRef.current.value = "";
    }
  }

  function toggleLegacyItem(index: number) {
    setLegacyOrder((current) => {
      if (!current) return current;
      const selected = current.selectedItemIndexes.includes(index)
        ? current.selectedItemIndexes.filter((value) => value !== index)
        : [...current.selectedItemIndexes, index].sort((a, b) => a - b);
      const next = { ...current, selectedItemIndexes: selected };
      const selectedNames = selected.map((itemIndex) => legacyItemLabel(current.items[itemIndex] ?? {}, itemIndex));
      setProdutos(selectedNames.join(", "));
      return next;
    });
  }

  async function submit() {
    if (!leadId || !responsavelId || !titulo.trim() || relato.trim().length < 10) {
      toast({ title: "Preencha cliente, responsável, título e um relato claro do problema.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/support-cases`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          leadId,
          dealId: dealId || null,
          propostaId: proposal?.id ?? null,
          titulo: titulo.trim(),
          relato: relato.trim(),
          categoria,
          produtos: produtos.split(/[\n,;]/).map((v) => v.trim()).filter(Boolean),
          responsavelId,
          prioridade,
          dataVencimento: data || undefined,
          origem: "humano",
          legacyOrder: legacyOrder ? {
            ...legacyOrder,
            items: legacyOrder.items,
            selectedItemIndexes: legacyOrder.selectedItemIndexes,
          } : undefined,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Falha ao abrir assistência");
      const cardId = body.card.id as string;
      if (legacyOrder?.sourceFileUrl) {
        const result = await fetch(`/api/work-cards/${cardId}/attachments`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            nome: legacyOrder.sourceFileName,
            url: legacyOrder.sourceFileUrl,
            mimeType: legacyOrder.sourceMimeType || "application/octet-stream",
            tamanho: legacyOrder.sourceSize || undefined,
            origem: "pedido_antigo_importado",
            descricao: "Arquivo original do pedido antigo importado e vinculado à assistência.",
            metadata: { importedOrder: true, confidence: legacyOrder.confidence ?? null },
          }),
        });
        if (!result.ok) {
          const importedAttachmentError = await result.json().catch(() => ({}));
          throw new Error(importedAttachmentError.error || "Falha ao vincular o arquivo original do pedido antigo");
        }
      }
      for (const file of files) {
        const metaRes = await fetch("/api/storage/uploads/request-url", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "application/octet-stream" }),
        });
        if (!metaRes.ok) throw new Error("Falha ao preparar upload");
        const meta = await metaRes.json();
        const put = await fetch(meta.uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
        if (!put.ok) throw new Error(`Falha ao enviar ${file.name}`);
        const attachmentRes = await fetch(`/api/work-cards/${cardId}/attachments`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ nome: file.name, url: `/api/storage${meta.objectPath}`, mimeType: file.type, tamanho: file.size, origem: "abertura_chamado" }),
        });
        if (!attachmentRes.ok) {
          const attachmentError = await attachmentRes.json().catch(() => ({}));
          throw new Error(attachmentError.error || `Falha ao registrar ${file.name}`);
        }
      }
      toast({ title: `Assistência ${body.card.codigo} aberta`, description: "O responsável recebeu o card para acompanhamento." });
      setLeadId(""); setDealId(""); setTitulo(""); setRelato(""); setProdutos(""); setResponsavelId(""); setFiles([]); setData(""); setLegacyOrder(null);
      await onCreated();
    } catch (error) {
      toast({ title: "Erro ao abrir assistência", description: String(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>Abrir chamado de assistência</DialogTitle></DialogHeader>
        <div className="grid gap-4 py-1 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-sm font-medium">Cliente *</label>
            <Input
              value={leadSearch}
              onChange={(event) => setLeadSearch(event.target.value)}
              placeholder="Buscar por nome, empresa, telefone, e-mail ou endereço..."
            />
            <Select value={leadId} onValueChange={(v) => { setLeadId(v); setDealId(""); }}>
              <SelectTrigger><SelectValue placeholder="Selecionar cliente" /></SelectTrigger>
              <SelectContent>
                {leadGroups.length ? leadGroups.map((group) => (
                  <SelectGroup key={group.letter}>
                    <SelectLabel>{group.letter}</SelectLabel>
                    {group.leads.map((lead) => (
                      <SelectItem key={lead.id} value={lead.id}>
                        {lead.nome || lead.empresa || lead.id}{lead.telefone ? ` • ${lead.telefone}` : ""}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )) : (
                  <div className="px-2 py-3 text-sm text-muted-foreground">Nenhum cliente encontrado.</div>
                )}
              </SelectContent>
            </Select>
            {selectedLead && (
              <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                <strong className="text-foreground">{selectedLead.nome || selectedLead.empresa || "Cliente"}</strong>
                {selectedLead.telefone ? ` • ${selectedLead.telefone}` : ""}
                {selectedLead.email ? ` • ${selectedLead.email}` : ""}
                {selectedLead.endereco ? <span className="mt-1 block">{selectedLead.endereco}</span> : null}
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Pedido relacionado</label>
            <Select value={dealId || "__none__"} onValueChange={(v) => { setDealId(v === "__none__" ? "" : v); if (v !== "__none__") setLegacyOrder(null); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="__none__">Sem pedido específico</SelectItem>{leadDeals.map((d) => <SelectItem key={d.id} value={d.id}>{d.titulo}</SelectItem>)}</SelectContent>
            </Select>
            <input ref={legacyOrderFileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void importLegacyOrder(file); }} />
            <Button type="button" variant="outline" size="sm" className="w-full gap-2" disabled={importingLegacyOrder} onClick={() => legacyOrderFileRef.current?.click()}>
              {importingLegacyOrder ? <><Loader2 className="h-4 w-4 animate-spin" />Lendo pedido antigo...</> : <><Upload className="h-4 w-4" />Importar pedido antigo</>}
            </Button>
            <p className="text-[11px] text-muted-foreground">PDF, imagem ou Word. O arquivo original fica preservado e os dados são revisados antes da abertura.</p>
          </div>
          <div className="space-y-1.5"><label className="text-sm font-medium">Categoria *</label><Select value={categoria} onValueChange={setCategoria}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{SUPPORT_CATEGORIES.map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></div>
          {legacyOrder && (
            <div className="sm:col-span-2 rounded-lg border bg-muted/20 p-3 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Pedido antigo importado</p>
                  <p className="text-xs text-muted-foreground">{legacyOrder.sourceFileName}{legacyOrder.confidence != null ? ` • confiança ${Math.round(legacyOrder.confidence * 100)}%` : ""}</p>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => { setLegacyOrder(null); setProdutos(""); }}>Remover</Button>
              </div>
              <div className="grid gap-2 text-xs sm:grid-cols-2">
                {legacyOrder.customer && <p><span className="font-medium">Cliente lido no arquivo:</span> {legacyOrder.customer}</p>}
                {legacyOrder.supplier && <p><span className="font-medium">Fornecedor:</span> {legacyOrder.supplier}</p>}
                {legacyOrder.title && <p><span className="font-medium">Pedido:</span> {legacyOrder.title}</p>}
                {legacyOrder.total != null && <p><span className="font-medium">Valor identificado:</span> {String(legacyOrder.total)}</p>}
              </div>
              {selectedLead && (
                <div className="rounded-md border bg-background p-2 text-xs">
                  <p className="font-medium">Dados oficiais do cadastro usados na assistência</p>
                  <p className="mt-1 text-muted-foreground">
                    {selectedLead.nome || selectedLead.empresa || "Cliente"}
                    {selectedLead.telefone ? ` • ${selectedLead.telefone}` : ""}
                    {selectedLead.email ? ` • ${selectedLead.email}` : ""}
                  </p>
                  {selectedLead.endereco ? <p className="mt-1 text-muted-foreground">{selectedLead.endereco}</p> : null}
                </div>
              )}
              {legacyOrder.observations && <p className="text-xs"><span className="font-medium">Observações:</span> {legacyOrder.observations}</p>}
              <div className="space-y-2">
                <p className="text-xs font-medium">Marque os itens afetados pela assistência</p>
                {legacyOrder.items.length ? legacyOrder.items.map((item, index) => {
                  const checked = legacyOrder.selectedItemIndexes.includes(index);
                  const quantity = item.quantidade ?? item.quantity ?? item.qtd;
                  const sku = item.sku ?? item.codigo ?? item.code;
                  const details = Object.entries(item)
                    .filter(([key, value]) => !["nome","name","descricao","produto","quantidade","quantity","qtd","sku","codigo","code"].includes(key) && value !== null && value !== undefined && value !== "")
                    .slice(0, 5)
                    .map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`)
                    .join(" • ");
                  return (
                    <label key={index} className="flex cursor-pointer items-start gap-2 rounded-md border bg-background p-2">
                      <input type="checkbox" className="mt-1" checked={checked} onChange={() => toggleLegacyItem(index)} />
                      <span className="min-w-0 text-xs">
                        <strong>{legacyItemLabel(item, index)}</strong>
                        {(quantity != null || sku) && <span className="block text-muted-foreground">{quantity != null ? `Qtd: ${String(quantity)}` : ""}{quantity != null && sku ? " • " : ""}{sku ? `Código/SKU: ${String(sku)}` : ""}</span>}
                        {details && <span className="block break-words text-muted-foreground">{details}</span>}
                      </span>
                    </label>
                  );
                }) : <p className="text-xs text-amber-700">Nenhum item foi identificado automaticamente. O arquivo original será mantido para conferência manual.</p>}
              </div>
            </div>
          )}
          <div className="space-y-1.5 sm:col-span-2"><label className="text-sm font-medium">Título *</label><Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex: Porta da suíte não fecha corretamente" /></div>
          <div className="space-y-1.5 sm:col-span-2"><label className="text-sm font-medium">Relato claro do problema *</label><Textarea rows={5} value={relato} onChange={(e) => setRelato(e.target.value)} placeholder="Descreva o sintoma, quando começou, onde ocorre, o que já foi testado e qualquer detalhe útil para o técnico." /><p className="text-xs text-muted-foreground">A IA e o atendimento humano devem coletar informação suficiente antes de enviar ao suporte.</p></div>
          <div className="space-y-1.5 sm:col-span-2"><label className="text-sm font-medium">Itens/produtos afetados</label><Input value={produtos} onChange={(e) => setProdutos(e.target.value)} placeholder="Separe por vírgula: janela suíte, porta varanda..." /></div>
          <div className="space-y-1.5"><label className="text-sm font-medium">Responsável *</label><Select value={responsavelId} onValueChange={setResponsavelId}><SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger><SelectContent>{eligibleResponsibleUsers.map((u) => <SelectItem key={u.id} value={u.id}>{u.name || u.email || u.id}</SelectItem>)}</SelectContent></Select>{openingStage?.responsaveisFuncoes?.length ? <p className="text-[11px] text-muted-foreground">Somente usuários ativos das funções responsáveis por esta etapa.</p> : null}</div>
          <div className="space-y-1.5"><label className="text-sm font-medium">Prioridade</label><Select value={prioridade} onValueChange={setPrioridade}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="baixa">Baixa</SelectItem><SelectItem value="normal">Normal</SelectItem><SelectItem value="alta">Alta</SelectItem><SelectItem value="urgente">Urgente</SelectItem></SelectContent></Select></div>
          <div className="space-y-1.5"><label className="text-sm font-medium">Prazo/agendamento inicial</label><Input type="date" value={data} onChange={(e) => setData(e.target.value)} /></div>
          <div className="space-y-1.5"><label className="text-sm font-medium">Fotos, vídeos, áudios e documentos</label><Input type="file" multiple accept="image/*,video/*,audio/*,.pdf,.doc,.docx" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} /><p className="text-xs text-muted-foreground">{files.length ? `${files.length} arquivo(s) selecionado(s)` : "Opcional"}</p></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button disabled={saving} onClick={() => void submit()}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Abrir assistência</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeliveryDialog({ open, onOpenChange, tenantId, token, deals, leads, users, onCreated }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  token: string;
  deals: Deal[];
  leads: Lead[];
  users: User[];
  onCreated: () => void | Promise<void>;
}) {
  const { toast } = useToast();
  const [dealId, setDealId] = useState("");
  const [responsavelId, setResponsavelId] = useState("");
  const [releaseDate, setReleaseDate] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  const balanceQuery = useQuery<BalanceResponse>({
    queryKey: ["delivery-balance", tenantId, dealId],
    enabled: open && !!tenantId && !!dealId,
    queryFn: async () => {
      const response = await fetch(`/api/tenants/${tenantId}/entregas/saldo?dealId=${encodeURIComponent(dealId)}`, { headers: { Authorization: `Bearer ${token}` } });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Não foi possível carregar os itens do pedido");
      return body;
    },
  });

  const selectedDeal = deals.find((d) => d.id === dealId);
  const selectedLead = selectedDeal?.leadId ? leads.find((l) => l.id === selectedDeal.leadId) : undefined;

  async function submit() {
    if (!dealId || !responsavelId || !balanceQuery.data) {
      toast({ title: "Selecione pedido e responsável.", variant: "destructive" });
      return;
    }
    const selected = balanceQuery.data.itens.flatMap((item) => {
      const quantity = Number(String(quantities[item.index] ?? "").replace(",", "."));
      if (!Number.isFinite(quantity) || quantity <= 0) return [];
      if (quantity > item.saldoProgramar) throw new Error(`${item.nome}: máximo disponível ${item.saldoProgramar}`);
      return [{
        nome: item.nome,
        quantidade: quantity,
        sku: item.sku ?? undefined,
        produtoId: item.produtoId ?? undefined,
        propostaItemIndex: item.index,
        quantidadePedido: item.quantidadePedido,
      }];
    });
    if (!selected.length) {
      toast({ title: "Informe a quantidade de pelo menos um item.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/entregas`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          dealId,
          propostaId: balanceQuery.data.propostaId,
          leadId: selectedDeal?.leadId ?? null,
          assignedTo: responsavelId,
          modo: "assincrona",
          status: "aguardando",
          dataLiberacaoPrevista: releaseDate || undefined,
          dataPrevista: deliveryDate || undefined,
          enderecoEntrega: address || undefined,
          observacoes: notes || undefined,
          itens: selected,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Falha ao criar lote");
      const cardId = body.workCard?.id as string | undefined;
      if (cardId) {
        for (const file of files) {
          const metaRes = await fetch("/api/storage/uploads/request-url", {
            method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "application/octet-stream" }),
          });
          if (!metaRes.ok) throw new Error("Falha ao preparar anexo");
          const meta = await metaRes.json();
          const put = await fetch(meta.uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
          if (!put.ok) throw new Error(`Falha ao enviar ${file.name}`);
          const attachmentRes = await fetch(`/api/work-cards/${cardId}/attachments`, {
            method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ nome: file.name, url: `/api/storage${meta.objectPath}`, mimeType: file.type, tamanho: file.size, origem: "programacao_entrega" }),
          });
          if (!attachmentRes.ok) {
            const attachmentError = await attachmentRes.json().catch(() => ({}));
            throw new Error(attachmentError.error || `Falha ao registrar ${file.name}`);
          }
        }
      }
      setDealId(""); setResponsavelId(""); setReleaseDate(""); setDeliveryDate(""); setAddress(""); setNotes(""); setQuantities({}); setFiles([]);
      await onCreated();
    } catch (error) {
      toast({ title: "Erro ao criar lote de entrega", description: String(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle>Liberar itens para entrega parcial</DialogTitle></DialogHeader>
        <div className="space-y-4 py-1">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><label className="text-sm font-medium">Pedido *</label><Select value={dealId} onValueChange={(v) => { setDealId(v); setQuantities({}); }}><SelectTrigger><SelectValue placeholder="Selecionar pedido" /></SelectTrigger><SelectContent>{deals.filter((d) => !["perdido"].includes(d.etapa)).map((d) => <SelectItem key={d.id} value={d.id}>{d.titulo}</SelectItem>)}</SelectContent></Select>{selectedLead && <p className="text-xs text-muted-foreground">Cliente: {selectedLead.nome || selectedLead.empresa}</p>}</div>
            <div className="space-y-1.5"><label className="text-sm font-medium">Responsável pelo lote *</label><Select value={responsavelId} onValueChange={setResponsavelId}><SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger><SelectContent>{users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name || u.email || u.id}</SelectItem>)}</SelectContent></Select></div>
          </div>

          {balanceQuery.isLoading && <div className="h-28 animate-pulse rounded-lg bg-muted" />}
          {balanceQuery.isError && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{String(balanceQuery.error)}</div>}
          {balanceQuery.data && (
            <div className="space-y-2">
              <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Itens do pedido — {balanceQuery.data.propostaTitulo}</h3><Badge variant="outline">Saldo a programar</Badge></div>
              <div className="overflow-hidden rounded-lg border">
                <div className="grid grid-cols-[1fr_90px_100px_110px] gap-2 bg-muted/50 px-3 py-2 text-xs font-medium"><span>Item</span><span>Pedido</span><span>Já alocado</span><span>Neste lote</span></div>
                {balanceQuery.data.itens.map((item) => (
                  <div key={item.index} className="grid grid-cols-[1fr_90px_100px_110px] items-center gap-2 border-t px-3 py-2 text-sm">
                    <div><p className="font-medium">{item.nome}</p><p className="text-[11px] text-muted-foreground">Saldo: {item.saldoProgramar}</p></div>
                    <span>{item.quantidadePedido}</span>
                    <span>{item.quantidadeAlocada}</span>
                    <Input type="number" min={0} max={item.saldoProgramar} step="any" disabled={item.saldoProgramar <= 0} value={quantities[item.index] ?? ""} onChange={(e) => setQuantities((current) => ({ ...current, [item.index]: e.target.value }))} />
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">O restante permanece como saldo não programado. Você pode criar novos lotes quando quiser, sem definir todas as datas agora.</p>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><label className="text-sm font-medium">Liberação prevista <span className="text-muted-foreground">(opcional)</span></label><Input type="date" value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)} /></div>
            <div className="space-y-1.5"><label className="text-sm font-medium">Entrega prevista <span className="text-muted-foreground">(opcional)</span></label><Input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} /></div>
            <div className="space-y-1.5 sm:col-span-2"><label className="text-sm font-medium">Endereço / local de entrega</label><Input value={address} onChange={(e) => setAddress(e.target.value)} /></div>
            <div className="space-y-1.5 sm:col-span-2"><label className="text-sm font-medium">Observações / instruções</label><Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
            <div className="space-y-1.5 sm:col-span-2"><label className="text-sm font-medium">Fotos, documentos, romaneios ou outras informações</label><Input type="file" multiple accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} /></div>
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button disabled={saving || balanceQuery.isLoading} onClick={() => void submit()}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Criar lote e card</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
