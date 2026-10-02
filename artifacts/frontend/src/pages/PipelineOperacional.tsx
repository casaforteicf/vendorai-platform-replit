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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SupportReportPanel } from "@/components/SupportReportPanel";
import { OperationalStageFormDialog } from "@/components/OperationalStageFormDialog";
import { PipelineNav, PIPELINE_CARD_CLASS, PIPELINE_COLUMN_CLASS, PIPELINE_COLUMN_HEADER_CLASS } from "@/components/PipelineNav";
import { InstallationTemplateDialog } from "@/components/InstallationTemplateDialog";
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

type Lead = { id: string; nome?: string | null; empresa?: string | null; telefone?: string | null };
type User = { id: string; name?: string | null; email?: string | null; userFunction?: string | null };
type Deal = { id: string; titulo: string; leadId?: string | null; etapa: string; valor?: string | null };
type Proposal = { id: string; dealId?: string | null; leadId: string; titulo: string; status: string; itens?: Array<Record<string, unknown>> };
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

type InstallationVisit = {
  id: string;
  visitNumber: number;
  status: string;
  scheduledAt?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  teamUserIds?: string[];
  responsibleId?: string | null;
  receiverName?: string | null;
  receiverDocument?: string | null;
  receiverRelationship?: string | null;
  customerAcceptanceStatus?: string;
  notes?: string | null;
};

type InstallationDomainItem = {
  id: string;
  visitId: string;
  sourceItemIndex: number;
  unitIndex?: number | null;
  productId?: string | null;
  sku?: string | null;
  productName: string;
  quantity: number;
  location?: string | null;
  attributes?: Record<string, unknown>;
  checks?: Array<Record<string, unknown>>;
  status: string;
  observation?: string | null;
  evidenceRequired?: boolean;
  required?: boolean;
};

type InstallationOccurrence = {
  id: string;
  checklistItemId?: string | null;
  type: string;
  status: string;
  description?: string | null;
  responsibleId?: string | null;
  dueAt?: string | null;
  resolution?: string | null;
};

type InstallationDomainResponse = {
  currentVisitId: string;
  visits: InstallationVisit[];
  items: InstallationDomainItem[];
  occurrences: InstallationOccurrence[];
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

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("pt-BR");
}

function toDateInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
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

function requirementCompleted(card: WorkCard, key: string) {
  const raw = card.metadata?.stageGates;
  if (!raw || typeof raw !== "object") return false;
  const value = (raw as Record<string, unknown>)[key];
  return value === true || Boolean(value && typeof value === "object" && (value as Record<string, unknown>).completed === true);
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

  const installationQuery = useQuery<InstallationDomainResponse>({
    queryKey: ["work-card-installation", selectedCard?.id],
    enabled: !!selectedCard?.id && selectedCard?.pipeline === "execucao" && isInstallationStage(selectedCard.etapa),
    queryFn: () => api(`/api/work-cards/${selectedCard!.id}/installation`),
    staleTime: 5_000,
    refetchOnWindowFocus: false,
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

  const stages = pipeline === "suporte" ? SUPPORT_STAGES : EXECUTION_STAGES;
  const cards = cardsQuery.data ?? [];
  const isAdmin = (user as any)?.platformRole === "super_admin" || (user as any)?.platformRole === "tenant_admin" || (user as any)?.userFunction === "administrador";
  const stageIndex = (stage: string) => stages.findIndex(([key]) => key === stage);
  const canMoveForward = (card: WorkCard, target: string) =>
    target === card.etapa || stageIndex(target) >= stageIndex(card.etapa) || (card.pipeline === "execucao" && isAdmin);

  function setPipeline(next: PipelineKind | "comercial" | "aquecimento" | "parceiros") {
    if (next === "comercial") navigate("/deals");
    else if (next === "aquecimento" || next === "parceiros") navigate(`/pipeline-relacionamento/${next}`);
    else navigate(`/pipeline-operacional/${next}`);
  }

  async function uploadFilesToCard(cardId: string, files: File[], origem = "app", metadata?: Record<string, unknown>): Promise<string[]> {
    if (!files.length || uploading) return [];
    setUploading(true);
    const urls: string[] = [];
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
        await api(`/api/work-cards/${cardId}/attachments`, {
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
        urls.push(url);
      }
      await queryClient.invalidateQueries({ queryKey: ["work-card-attachments", cardId] });
      toast({ title: files.length === 1 ? "Anexo registrado" : `${files.length} anexos registrados` });
      return urls;
    } catch (error) {
      toast({ title: "Não foi possível anexar os arquivos", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
      throw error;
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
          const stageCards = cards.filter((card) => card.etapa === key);
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
                        {card.prioridade === "urgente" || card.prioridade === "alta" ? <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" /> : null}
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
                  {selectedCard.pipeline === "execucao" && isAdmin && (
                    <p className="text-[11px] text-muted-foreground">Administrador pode corrigir manualmente a etapa, inclusive retornar. A alteração fica registrada no histórico.</p>
                  )}
                </div>
                {selectedCard.pipeline === "suporte" && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Responsável</label>
                    <Select value={selectedCard.responsavelId || "__none__"} disabled={patchCard.isPending} onValueChange={(responsavelId) => { if (!patchCard.isPending) patchCard.mutate({ id: selectedCard.id, data: { responsavelId: responsavelId === "__none__" ? null : responsavelId } }); }}>
                      <SelectTrigger><SelectValue placeholder="Selecionar responsável" /></SelectTrigger>
                      <SelectContent>
                        {(usersQuery.data ?? []).map((u) => <SelectItem key={u.id} value={u.id}>{u.name || u.email || u.id}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {selectedCard.pipeline === "execucao" ? (
                  <div className="space-y-4 rounded-lg border p-4">
                    <div>
                      <h3 className="text-sm font-semibold">Edição manual da execução</h3>
                      <p className="text-xs text-muted-foreground">A automação continua ativa, mas estes campos podem ser corrigidos manualmente. Alterações ficam registradas no histórico.</p>
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
                            {(usersQuery.data ?? []).map((u) => <SelectItem key={u.id} value={u.id}>{u.name || u.email || u.id}</SelectItem>)}
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
                              patchCard.mutate({ id: selectedCard.id, data: { [String(field)]: next ? new Date(`${next}T12:00:00`).toISOString() : null } });
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
                        placeholder="Informações operacionais, ajustes, observações do pedido..."
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
                  </div>
                ) : (
                  selectedCard.descricao && <div className="rounded-lg border bg-muted/20 p-3"><p className="text-xs font-semibold uppercase text-muted-foreground">Relato / observações</p><p className="mt-1 whitespace-pre-wrap text-sm">{selectedCard.descricao}</p></div>
                )}

                {selectedCard.pipeline === "suporte" && (
                  <SupportReportPanel
                    card={selectedCard}
                    token={token ?? ""}
                    onChanged={async () => {
                      const fresh = await api<WorkCard>(`/api/work-cards/${selectedCard.id}`);
                      setSelectedCard(fresh);
                      await queryClient.invalidateQueries({ queryKey: ["work-cards", tenantId, "suporte"] });
                    }}
                  />
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