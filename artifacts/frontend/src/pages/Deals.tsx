import React, { lazy, Suspense, useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import {
  customFetch,
  useListDeals,
  getListDealsQueryKey,
  useCreateDeal,
  useCreateLead,
  useUpdateDeal,
  useListTenantLeads,
  getListTenantLeadsQueryKey,
  useGetTenant,
  getGetTenantQueryKey,
  useListPropostas,
  getListPropostasQueryKey,
  useListTenantBriefings,
  getListTenantBriefingsQueryKey,
  useListTenantUsers,
  getListTenantUsersQueryKey,
  useListPipelineStages,
  getListPipelineStagesQueryKey,
  LeadBriefing,
  Deal,
  DealEtapa,
  PipelineStage,
  TipoFechamento,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { LEAD_SOURCE_OPTIONS } from "@/lib/leadRegistration";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Plus, GripVertical, DollarSign, User, UserRound, TrendingUp, Link2, Copy, CheckCheck, FileUp, Loader2, Sparkles, BarChart3, RefreshCw, Users, Package, AlertTriangle, Paperclip, FileCheck, CreditCard, HandCoins, Flame, Cloud, Snowflake, FileText, Clock, CalendarDays, Pen, KanbanSquare, ArrowRight, ArrowLeft, UserMinus, Ruler, Bot, ChevronDown, ChevronUp } from "lucide-react";
import { PipelineNav } from "@/components/PipelineNav";
import { AdminDeleteLeadButton } from "@/components/AdminDeleteLeadButton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DealEtapaSaas,
} from "@workspace/api-client-react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
} from "@dnd-kit/core";

const AgendarReuniaoModal = lazy(() => import("@/components/AgendarReuniaoModal").then((m) => ({ default: m.AgendarReuniaoModal })));
const ContractGeneratorModal = lazy(() => import("@/components/ContractGeneratorModal").then((m) => ({ default: m.ContractGeneratorModal })));

// ─── Constants ───────────────────────────────────────────────────────────────

const ETAPAS: { value: string; label: string; color: string; bg: string }[] = [
  { value: "novo",                label: "Novo",        color: "text-slate-600",   bg: "bg-slate-100" },
  { value: "qualificado",         label: "Qualificado", color: "text-blue-600",    bg: "bg-blue-100" },
  { value: "proposta",            label: "Orçamento",   color: "text-violet-600",  bg: "bg-violet-100" },
  { value: "negociacao",          label: "Negociação",  color: "text-amber-600",   bg: "bg-amber-100" },
  { value: "conferencia_estoque", label: "Fechamento",  color: "text-indigo-600",  bg: "bg-indigo-100" },
  { value: "contrato",            label: "Contrato",    color: "text-sky-600",     bg: "bg-sky-100" },
  { value: "ganho",               label: "Pedido",      color: "text-emerald-600", bg: "bg-emerald-100" },
  { value: "perdido",             label: "Perdido",     color: "text-red-600",     bg: "bg-red-100" },
];

const ETAPA_PROBABILIDADE: Record<string, number> = {
  em_aquecimento: 5,
  novo: 10,
  qualificado: 25,
  proposta: 50,
  negociacao: 70,
  conferencia_estoque: 82,
  contrato: 92,
  ganho: 100,
  em_execucao: 100,
  entregue: 100,
  perdido: 0,
  parceiro: 5,
};

// ─── Kanban Column Definitions ────────────────────────────────────────────────
// Each entry maps to a droppable zone. Two virtual columns split em_aquecimento
// by aquecimentoTipo. parceiro is a separate stage outside the main funnel.

interface KanbanColumnDef {
  dropId: string;
  label: string;
  sublabel?: string;
  color: string;
  bg: string;
  order: number;       // position in normal flow; -1 = special (no restriction)
  isSpecial: boolean;  // perdido / parceiro — can receive from anywhere
  onDrop: { etapa: string; aquecimentoTipo?: string | null };
}

const KANBAN_COLUMNS: KanbanColumnDef[] = [
  { dropId: "novo", label: "Novo", color: "text-slate-600", bg: "bg-slate-100", order: 1, isSpecial: false, onDrop: { etapa: "novo" } },
  { dropId: "qualificado", label: "Qualificado", color: "text-blue-600", bg: "bg-blue-100", order: 2, isSpecial: false, onDrop: { etapa: "qualificado" } },
  { dropId: "proposta", label: "Orçamento", color: "text-violet-600", bg: "bg-violet-100", order: 3, isSpecial: false, onDrop: { etapa: "proposta" } },
  { dropId: "negociacao", label: "Negociação", color: "text-amber-600", bg: "bg-amber-100", order: 4, isSpecial: false, onDrop: { etapa: "negociacao" } },
  { dropId: "conferencia_estoque", label: "Fechamento", color: "text-indigo-600", bg: "bg-indigo-100", order: 5, isSpecial: false, onDrop: { etapa: "conferencia_estoque" } },
  { dropId: "contrato", label: "Contrato", color: "text-sky-600", bg: "bg-sky-100", order: 6, isSpecial: false, onDrop: { etapa: "contrato" } },
  { dropId: "ganho", label: "Pedido", color: "text-emerald-600", bg: "bg-emerald-100", order: 7, isSpecial: false, onDrop: { etapa: "ganho" } },
  { dropId: "perdido", label: "Perdido", color: "text-red-600", bg: "bg-red-100", order: -1, isSpecial: true, onDrop: { etapa: "perdido" } },
];

/** Map deals to their visual column ID (handles the two aquecimento virtual splits). */
function getColumnIdForDeal(deal: Deal): string {
  if (deal.etapa === "em_aquecimento") {
    return (deal as Deal & { aquecimentoTipo?: string | null }).aquecimentoTipo === "cliente"
      ? "aquecimento_cliente"
      : "aquecimento_nao_cliente";
  }
  return deal.etapa;
}

/** Filter deals belonging to a given kanban column. */
function dealsForColumn(col: KanbanColumnDef, deals: Deal[]): Deal[] {
  if (["ganho", "perdido"].includes(col.onDrop.etapa)) return [];
  if (col.dropId === "aquecimento_nao_cliente") {
    return deals.filter(
      (d) => d.etapa === "em_aquecimento" &&
        (d as Deal & { aquecimentoTipo?: string | null }).aquecimentoTipo !== "cliente"
    );
  }
  if (col.dropId === "aquecimento_cliente") {
    return deals.filter(
      (d) => d.etapa === "em_aquecimento" &&
        (d as Deal & { aquecimentoTipo?: string | null }).aquecimentoTipo === "cliente"
    );
  }
  return deals.filter((d) => d.etapa === col.onDrop.etapa);
}

const TERMINAL_ETAPAS = new Set<string>(["ganho", "entregue", "perdido"]);

const ETAPAS_SAAS: { value: DealEtapaSaas; label: string; color: string; bg: string; icon: React.ElementType }[] = [
  { value: "lead_qualificado",  label: "Lead Qualificado",  color: "text-slate-600",   bg: "bg-slate-50",    icon: User },
  { value: "demo_agendada",     label: "Demo Agendada",     color: "text-blue-600",    bg: "bg-blue-50",     icon: BarChart3 },
  { value: "trial_ativo",       label: "Trial Ativo",       color: "text-cyan-600",    bg: "bg-cyan-50",     icon: RefreshCw },
  { value: "proposta_enviada",  label: "Orçamento Enviado", color: "text-violet-600",  bg: "bg-violet-50",   icon: Package },
  { value: "fechamento",        label: "Fechamento",        color: "text-amber-600",   bg: "bg-amber-50",    icon: TrendingUp },
  { value: "onboarding",        label: "Onboarding",        color: "text-emerald-600", bg: "bg-emerald-50",  icon: Users },
  { value: "expansao",          label: "Expansão",          color: "text-indigo-600",  bg: "bg-indigo-50",   icon: Sparkles },
];

const ETAPA_SAAS_PROBABILIDADE: Record<DealEtapaSaas, number> = {
  lead_qualificado: 10,
  demo_agendada:    25,
  trial_ativo:      40,
  proposta_enviada: 60,
  fechamento:       80,
  onboarding:       90,
  expansao:         95,
};

const MOTIVOS_PERDA: { value: string; label: string }[] = [
  { value: "preco_alto",         label: "Preço alto" },
  { value: "concorrente",        label: "Escolheu concorrente" },
  { value: "sem_budget",         label: "Sem budget" },
  { value: "timing_ruim",        label: "Timing ruim" },
  { value: "sem_resposta",       label: "Sem resposta" },
  { value: "produto_nao_atende", label: "Produto não atende" },
  { value: "outro",              label: "Outro" },
];

function formatCurrency(value: string | null | undefined): string {
  if (!value) return "—";
  const num = parseFloat(value);
  if (isNaN(num)) return "—";
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type StageResponsibleUser = {
  id: string;
  active?: boolean | null;
  userFunction?: string | null;
  customFunctionId?: string | null;
};

type DealResponsiblePartnership = {
  id: string;
  ownerTenantId: string;
  partnerTenantId: string;
  partnerName?: string | null;
  partnerTenantCode?: string | null;
  status: string;
};

type DealRepresentativeFunction = {
  id: string;
  name: string;
  kind?: "internal" | "external_company";
  linkedTenantCode?: string | null;
  permissions?: string[];
};

const DEAL_REPRESENTATIVE_PREFIX = "__representative__:";

function dealRepresentativePartnershipId(value?: string | null) {
  return value?.startsWith(DEAL_REPRESENTATIVE_PREFIX)
    ? value.slice(DEAL_REPRESENTATIVE_PREFIX.length)
    : null;
}

function isUserResponsibleForStage(
  user: StageResponsibleUser,
  stage?: Pick<PipelineStage, "responsaveisFuncoes"> | null,
): boolean {
  if (user.active !== true) return false;
  const responsibleFunctions = stage?.responsaveisFuncoes ?? [];
  if (responsibleFunctions.length === 0) return false;

  const refs = new Set<string>();
  if (user.userFunction) refs.add(`builtin:${user.userFunction}`);
  if (user.customFunctionId) refs.add(`custom:${user.customFunctionId}`);

  return responsibleFunctions.some((responsible) => refs.has(responsible));
}

// ─── Motivos de Perda Dialog ─────────────────────────────────────────────────

function MotivosPerdaDialog({
  open,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  onConfirm: (lostReason: string, lostReasonDetail: string) => void;
  onCancel: () => void;
}) {
  const [lostReason, setLostReason] = useState<string | null>(null);
  const [lostReasonDetail, setLostReasonDetail] = useState("");

  function handleConfirm() {
    if (!lostReason) return;
    const detail = lostReason === "outro" ? lostReasonDetail.trim() : lostReasonDetail.trim();
    onConfirm(lostReason, detail);
    setLostReason(null);
    setLostReasonDetail("");
  }

  function handleCancel() {
    setLostReason(null);
    setLostReasonDetail("");
    onCancel();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-5 w-5" />
            Motivo da perda
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <p className="text-sm text-muted-foreground">
            Selecione o principal motivo pelo qual este negócio foi perdido:
          </p>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Motivo *</label>
            <Select
              onValueChange={(v) => setLostReason(v)}
              value={lostReason || ""}
            >
              <SelectTrigger className="w-full" data-testid="select-lost-reason">
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                {MOTIVOS_PERDA.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Observações</label>
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              rows={3}
              placeholder="Observações adicionais (opcional)..."
              value={lostReasonDetail}
              onChange={(e) => setLostReasonDetail(e.target.value)}
              data-testid="textarea-lost-detail"
            />
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <Button type="button" variant="outline" size="sm" onClick={handleCancel}>
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleConfirm}
              disabled={!lostReason}
            >
              Confirmar perda
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Draggable Deal Card ──────────────────────────────────────────────────────

type DealRepresentationSnap = {
  id: string;
  dealId: string;
  partnerTenantId: string;
  partnerName?: string | null;
  operationalUserName?: string | null;
  role: "responsible" | "participant";
  status: string;
  commission?: {
    id: string;
    percent?: string | null;
    amount?: string | null;
    paidAmount?: string | null;
    status?: string | null;
  } | null;
};

type PropostaSnap = {
  id: string;
  titulo: string;
  status: string;
  valorTotal?: string | null;
};

type PlanoAcompanhamentoCard = {
  etapa: string;
  objetivo: string;
  modo: "automatico" | "gerar_aprovar" | "somente_sugestao";
  canalPrincipal: "whatsapp" | "instagram" | "messenger" | "email" | "chat" | "ligacao" | null;
  canaisAlternativos: Array<"whatsapp" | "instagram" | "messenger" | "email" | "chat" | "ligacao">;
  tipoConteudo: "texto" | "imagem" | "video" | "audio" | "documento" | "proposta" | "case";
  argumento: string;
  beneficio?: string | null;
  diferencial?: string | null;
  prova?: string | null;
  chamadaParaAcao: string;
  conteudo: string;
  motivo: string;
  requerHumano: boolean;
  fontes: Array<{ id: string; tipo: string; categoria: string; titulo: string; resumo: string }>;
};

function propostaLabel(status: string): { text: string; className: string } {
  if (status === "aceita")    return { text: "Aprovado",    className: "bg-green-100 text-green-700 border-green-200" };
  if (status === "rejeitada") return { text: "Descartado",  className: "bg-red-100 text-red-600 border-red-200" };
  if (status === "expirada")  return { text: "Finalizado",  className: "bg-gray-100 text-gray-600 border-gray-200" };
  return                             { text: "Em Análise",  className: "bg-blue-100 text-blue-700 border-blue-200" };
}

function DealCard({
  deal,
  leadName,
  briefing,
  proposta,
  assignedToName,
  representation,
  onClick,
  onAgendar,
  onAdvance,
  onMove,
  onRemove,
  onReturnToQualified,
  moveOptions = [],
  overlay = false,
  slaOverdue = false,
}: {
  deal: Deal;
  leadName: string | undefined;
  briefing: LeadBriefing | undefined;
  proposta?: PropostaSnap;
  assignedToName?: string;
  representation?: DealRepresentationSnap;
  onClick?: () => void;
  onAgendar?: () => void;
  onAdvance?: () => void;
  onMove?: (stage: string) => void;
  onRemove?: () => void;
  onReturnToQualified?: () => void;
  moveOptions?: Array<{ value: string; label: string }>;
  overlay?: boolean;
  /** Tempo na etapa atual estourou o SLA configurado pelo admin (distinto do prazo geral do negócio — ver isOverdue abaixo). */
  slaOverdue?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: deal.id,
    data: { deal },
  });

  const deadline = deal.dataFechamentoPrevista ? new Date(deal.dataFechamentoPrevista) : null;
  const isOverdue = !overlay && deadline && deadline < new Date() && !TERMINAL_ETAPAS.has(deal.etapa ?? "");
  const isSlaLate = !overlay && slaOverdue;

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      // Achado real: touchAction "none" fixo bloqueava a rolagem por toque
      // o tempo todo, não só durante o arrasto de verdade -- agora que o
      // TouchSensor usa atraso (precisa segurar) em vez de distância, a
      // rolagem nativa pode ficar livre por padrão.
      style={{ opacity: isDragging && !overlay ? 0.4 : 1 }}
      className={`group bg-card border rounded-lg p-3 space-y-2 ${
        overlay
          ? "shadow-2xl rotate-1 cursor-grabbing border-border"
          : isSlaLate
            ? "cursor-grab active:cursor-grabbing border-red-400 bg-red-50/50 shadow-[0_0_10px_rgba(239,68,68,0.35)] hover:shadow-[0_0_16px_rgba(239,68,68,0.55)] transition-all"
            : isOverdue
            ? "cursor-grab active:cursor-grabbing border-yellow-400 bg-yellow-50/40 shadow-[0_0_10px_rgba(234,179,8,0.35)] hover:shadow-[0_0_16px_rgba(234,179,8,0.55)] transition-all"
            : "cursor-grab active:cursor-grabbing border-border hover:border-primary/40 hover:shadow-sm transition-all"
      }`}
      onClick={onClick}
      data-testid={`deal-card-${deal.id}`}
    >
      {/* Tempo na etapa estourado — SLA configurado pelo admin */}
      {isSlaLate && (
        <div className="flex items-center gap-1 rounded-full px-2 py-0.5 bg-red-100 border border-red-300 w-fit">
          <AlertTriangle className="h-3 w-3 text-red-700" />
          <span className="text-[10px] font-bold text-red-800 uppercase tracking-wide">Tempo esgotado</span>
        </div>
      )}

      {/* Atrasado badge */}
      {isOverdue && (
        <div className="flex items-center gap-1 rounded-full px-2 py-0.5 bg-yellow-100 border border-yellow-300 w-fit">
          <AlertTriangle className="h-3 w-3 text-yellow-700" />
          <span className="text-[10px] font-bold text-yellow-800 uppercase tracking-wide">Atrasado</span>
        </div>
      )}

      {/* Cliente primeiro; título do negócio fica como contexto secundário */}
      <div className="flex items-start gap-2">
        <GripVertical
          className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors"
          data-testid={`deal-drag-${deal.id}`}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight truncate">
            {leadName || "Cliente não informado"}
          </p>
          <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground line-clamp-2">
            {deal.titulo}
          </p>
        </div>
        {!overlay && (
          <AdminDeleteLeadButton
            leadId={deal.leadId}
            leadName={leadName || deal.titulo}
          />
        )}
      </div>

      {/* Valor */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground pl-6">
        <DollarSign className="h-3 w-3 shrink-0" />
        <span className="font-semibold text-foreground">{formatCurrency(
          proposta?.valorTotal ?? deal.valor,
        )}</span>
      </div>

      {/* Prazo */}
      {deadline && (
        <div className={`flex items-center gap-1.5 text-xs pl-6 ${isOverdue ? "text-yellow-700 font-semibold" : "text-muted-foreground"}`}>
          <Clock className="h-3 w-3 shrink-0" />
          <span>Prazo: {deadline.toLocaleDateString("pt-BR")}</span>
        </div>
      )}

      {/* Responsável */}
      {representation?.role === "responsible" ? (
        <div className="pl-6 space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-medium text-cyan-700">
            <Users className="h-3 w-3 shrink-0" />
            <span className="truncate">Responsável: {representation.partnerName || "Empresa representante"}</span>
          </div>
          {representation.operationalUserName && (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <UserRound className="h-3 w-3 shrink-0" />
              <span className="truncate">Executor: {representation.operationalUserName}</span>
            </div>
          )}
        </div>
      ) : assignedToName ? (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground pl-6">
          <UserRound className="h-3 w-3 shrink-0" />
          <span className="truncate">{assignedToName}</span>
        </div>
      ) : null}

      {/* Probabilidade */}
      {deal.probabilidade !== null && deal.probabilidade !== undefined && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground pl-6">
          <TrendingUp className="h-3 w-3 shrink-0" />
          <span>{deal.probabilidade}% de chance</span>
        </div>
      )}

      {/* Tipo de fechamento */}
      {deal.tipoFechamento && (
        <div className="pl-6">
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            deal.tipoFechamento === "contrato"
              ? "bg-violet-100 text-violet-700"
              : deal.tipoFechamento === "pedido_e_contrato"
                ? "bg-indigo-100 text-indigo-700"
                : "bg-slate-100 text-slate-600"
          }`}>
            {deal.tipoFechamento === "contrato"
              ? "Contrato"
              : deal.tipoFechamento === "pedido_e_contrato"
                ? "Pedido + Contrato"
                : "Pedido"}
          </span>
        </div>
      )}

      {/* Motivo de perda */}
      {deal.lostReason && (
        <div className="pl-6 space-y-1">
          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-red-50 text-red-600 border border-red-100">
            {MOTIVOS_PERDA.find((m) => m.value === deal.lostReason)?.label ?? deal.lostReason}
          </span>
          {deal.lostReasonDetail && (
            <p className="text-[10px] text-muted-foreground line-clamp-2">{deal.lostReasonDetail}</p>
          )}
        </div>
      )}

      {/* Briefing termômetro */}
      {briefing && <BriefingBadge briefing={briefing} />}

      {/* Status de fechamento (contrato + onboarding) */}
      {deal.etapa === "ganho" && (deal.contractStatus || deal.onboardingStatus) && (
        <div className="pl-6 flex flex-wrap gap-1.5">
          <ClosureStatusBadge status={deal.contractStatus} error={deal.contractError} label="Contrato" />
          <ClosureStatusBadge status={deal.onboardingStatus} error={deal.onboardingError} label="Onboarding" />
        </div>
      )}

      {/* Orçamento vinculado */}
      {proposta && (() => {
        const lbl = propostaLabel(proposta.status);
        const orcVal = proposta.valorTotal ? parseFloat(proposta.valorTotal) : null;
        return (
          <div className="pl-1 pt-1 border-t border-border/50 flex items-center gap-1.5">
            <FileText className="h-3 w-3 shrink-0 text-muted-foreground/60" />
            <span className="text-[11px] text-muted-foreground truncate flex-1">{proposta.titulo}</span>
            {orcVal != null && !isNaN(orcVal) && (
              <span className="text-[11px] font-mono font-semibold text-foreground shrink-0">
                {orcVal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </span>
            )}
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold border shrink-0 ${lbl.className}`}>
              {lbl.text}
            </span>
          </div>
        );
      })()}

      {/* Gerar contrato — ação rápida */}
      {!overlay && (deal.tipoFechamento === "contrato" || deal.tipoFechamento === "pedido_e_contrato") && deal.etapa !== "perdido" && (
        <ContractCardButton deal={deal} />
      )}

      {!overlay && deal.leadId && !TERMINAL_ETAPAS.has(deal.etapa ?? "") && (
        <DealFollowupPreview deal={deal} />
      )}

      {!overlay && /medid/i.test(String(deal.etapa ?? "")) && (
        <div
          className="pt-1 border-t border-border/50"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="w-full flex items-center justify-center gap-1.5 text-[11px] font-medium text-cyan-700 hover:text-cyan-800 hover:bg-cyan-50 rounded-md py-1.5 transition-colors"
            onClick={() => { window.location.href = `/checklists/medidas/${deal.id}`; }}
            data-testid={`deal-measurement-checklist-${deal.id}`}
          >
            <Ruler className="h-3.5 w-3.5" />
            Conferência de medidas
          </button>
        </div>
      )}

      {!overlay && deal.etapa === "proposta" && onReturnToQualified && (
        <div
          className="pt-1 border-t border-border/50"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full h-7 px-2 text-[10px] gap-1 text-blue-700 hover:text-blue-800 hover:bg-blue-50"
            onClick={onReturnToQualified}
            data-testid={`deal-return-qualified-${deal.id}`}
          >
            <ArrowLeft className="h-3 w-3" />
            Faltam informações — voltar para Qualificado
          </Button>
        </div>
      )}

      {/* Ações explícitas da pipeline — não dependem de drag-and-drop */}
      {!overlay && (onAdvance || onMove || onRemove) && (
        <div
          className="pt-1 border-t border-border/50 grid grid-cols-[1fr_1fr_auto] gap-1"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {onAdvance ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[10px] gap-1 text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50"
              onClick={onAdvance}
              data-testid={`deal-advance-${deal.id}`}
            >
              <ArrowRight className="h-3 w-3" />
              Avançar
            </Button>
          ) : <span />}
          {onMove && moveOptions.length > 0 ? (
            <Select onValueChange={onMove}>
              <SelectTrigger className="h-7 px-2 text-[10px]" data-testid={`deal-move-${deal.id}`}>
                <SelectValue placeholder="Mover" />
              </SelectTrigger>
              <SelectContent>
                {moveOptions.map((stage) => (
                  <SelectItem key={stage.value} value={stage.value}>{stage.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : <span />}
          {onRemove && deal.leadId ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={onRemove}
              title="Retirar da pipeline"
              data-testid={`deal-remove-${deal.id}`}
            >
              <UserMinus className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
      )}

      {/* Agendar reunião — ação rápida */}
      {onAgendar && !overlay && (
        <div
          className="pt-1 border-t border-border/50"
          onClick={(e) => { e.stopPropagation(); onAgendar(); }}
        >
          <button
            type="button"
            className="w-full flex items-center justify-center gap-1.5 text-[11px] font-medium text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-md py-1 transition-colors"
          >
            <CalendarDays className="h-3 w-3 shrink-0" />
            Agendar reunião
          </button>
        </div>
      )}
    </div>
  );
}

function DealFollowupPreview({ deal }: { deal: Deal }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [plano, setPlano] = useState<PlanoAcompanhamentoCard | null>(null);
  const [error, setError] = useState("");

  async function loadPreview() {
    if (!deal.leadId) return;
    if (plano) {
      setOpen((value) => !value);
      return;
    }

    setOpen(true);
    setLoading(true);
    setError("");
    try {
      const body = await customFetch<{ plano?: PlanoAcompanhamentoCard; error?: string }>(
        `/api/tenants/${deal.tenantId}/leads/${deal.leadId}/acompanhamento/planejar`,
        {
          method: "POST",
          body: JSON.stringify({
            dealId: deal.id,
            motivoDisparo: "prévia solicitada no card da pipeline",
          }),
          responseType: "json",
        },
      );
      if (!body.plano) throw new Error(body.error || "Não foi possível calcular a próxima ação.");
      setPlano(body.plano);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível calcular a próxima ação.");
    } finally {
      setLoading(false);
    }
  }

  const canalLabel: Record<string, string> = {
    whatsapp: "WhatsApp",
    instagram: "Instagram",
    messenger: "Messenger",
    email: "E-mail",
    chat: "Chat",
    ligacao: "Ligação",
  };

  return (
    <div className="pt-1 border-t border-border/50" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
      <button
        type="button"
        onClick={() => void loadPreview()}
        className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[11px] font-medium text-primary hover:bg-primary/5"
        data-testid={`deal-followup-preview-${deal.id}`}
      >
        <span className="inline-flex min-w-0 items-center gap-1.5">
          {loading ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : <Bot className="h-3.5 w-3.5 shrink-0" />}
          <span className="truncate">Vendi acompanhando</span>
        </span>
        {open ? <ChevronUp className="h-3.5 w-3.5 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0" />}
      </button>

      {open && (
        <div className="mt-1 rounded-lg border bg-muted/20 p-2.5">
          {loading ? (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Analisando jornada, histórico e inteligência do negócio...
            </div>
          ) : error ? (
            <div>
              <p className="text-[11px] text-red-600">{error}</p>
              <button type="button" className="mt-1 text-[10px] font-medium text-primary underline" onClick={() => { setPlano(null); void loadPreview(); }}>
                Tentar novamente
              </button>
            </div>
          ) : plano ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold">Próxima ação sugerida</p>
                <span className="rounded-full bg-background px-2 py-0.5 text-[9px] font-semibold text-muted-foreground">
                  {plano.canalPrincipal ? canalLabel[plano.canalPrincipal] ?? plano.canalPrincipal : "Sem canal"}
                </span>
              </div>
              <p className="text-[11px] leading-relaxed text-foreground">{plano.argumento || plano.objetivo}</p>
              {(plano.beneficio || plano.diferencial || plano.prova) && (
                <div className="grid gap-1">
                  {plano.beneficio && <p className="text-[10px] text-muted-foreground"><strong>Benefício:</strong> {plano.beneficio}</p>}
                  {plano.diferencial && <p className="text-[10px] text-muted-foreground"><strong>Diferencial:</strong> {plano.diferencial}</p>}
                  {plano.prova && <p className="text-[10px] text-muted-foreground"><strong>Prova:</strong> {plano.prova}</p>}
                </div>
              )}
              {plano.chamadaParaAcao && <p className="rounded-md bg-background px-2 py-1.5 text-[10px]"><strong>CTA:</strong> {plano.chamadaParaAcao}</p>}
              {plano.conteudo && (
                <details className="rounded-md border bg-background px-2 py-1.5">
                  <summary className="cursor-pointer text-[10px] font-semibold">Ver conteúdo sugerido</summary>
                  <p className="mt-1 whitespace-pre-wrap text-[10px] leading-relaxed text-muted-foreground">{plano.conteudo}</p>
                </details>
              )}
              <div className="flex flex-wrap items-center gap-1">
                {plano.canaisAlternativos.slice(0, 3).map((canal) => (
                  <span key={canal} className="rounded bg-background px-1.5 py-0.5 text-[9px] text-muted-foreground">Plano B: {canalLabel[canal] ?? canal}</span>
                ))}
                {plano.requerHumano && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700">Requer humano</span>}
              </div>
              {plano.motivo && <p className="text-[10px] leading-relaxed text-muted-foreground"><strong>Por quê:</strong> {plano.motivo}</p>}
              <div className="flex items-center justify-between border-t pt-1.5 text-[9px] text-muted-foreground">
                <span>{plano.fontes.length} fonte(s) consultada(s)</span>
                <button type="button" className="font-medium text-primary hover:underline" onClick={() => { setPlano(null); void loadPreview(); }}>Recalcular</button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function ContractCardButton({ deal }: { deal: Deal }) {
  const [open, setOpen] = useState(false);
  const alreadySent = deal.contractStatus === "sent";

  return (
    <>
      <div
        className="pt-1 border-t border-border/50"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
      >
        <button
          type="button"
          className={`w-full flex items-center justify-center gap-1.5 text-[11px] font-medium rounded-md py-1 transition-colors ${
            alreadySent
              ? "text-green-700 hover:text-green-800 hover:bg-green-50"
              : "text-violet-600 hover:text-violet-800 hover:bg-violet-50"
          }`}
        >
          <Pen className="h-3 w-3 shrink-0" />
          {alreadySent ? "Reenviar contrato" : "Gerar contrato"}
        </button>
      </div>
      {open ? (
        <Suspense fallback={null}>
          <ContractGeneratorModal
            open={open}
            onClose={() => setOpen(false)}
            dealId={deal.id}
            tenantId={deal.tenantId}
          />
        </Suspense>
      ) : null}
    </>
  );
}

function BriefingBadge({
  briefing,
}: {
  briefing: LeadBriefing | undefined;
}) {
  if (!briefing) return null;

  const t = briefing.needThermometer;
  if (!t) return null;

  if (t === "hot") {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold bg-red-50 text-red-600 border border-red-100">
        <Flame className="h-3 w-3" />
        Hot
      </span>
    );
  }
  if (t === "warm") {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold bg-amber-50 text-amber-600 border border-amber-100">
        <Cloud className="h-3 w-3" />
        Warm
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold bg-slate-50 text-slate-500 border border-slate-100">
      <Snowflake className="h-3 w-3" />
      Cold
    </span>
  );
}

function ClosureStatusBadge({
  status,
  error,
  label,
}: {
  status: string | null | undefined;
  error: string | null | undefined;
  label: string;
}) {
  if (!status || status === "na") return null;

  const configs: Record<string, { text: string; className: string }> = {
    pending: { text: "Gerando...", className: "bg-amber-50 text-amber-700 border-amber-200" },
    sent:    { text: "Enviado",   className: "bg-blue-50 text-blue-700 border-blue-200" },
    signed:  { text: "Assinado",  className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    failed:  { text: "Erro",      className: "bg-red-50 text-red-700 border-red-200" },
    skipped: { text: "Ignorado",  className: "bg-slate-50 text-slate-600 border-slate-200" },
  };

  const cfg = configs[status] ?? { text: status, className: "bg-slate-50 text-slate-600 border-slate-200" };

  return (
    <span
      title={error ? `${label}: ${error}` : `${label}: ${cfg.text}`}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border ${cfg.className}`}
    >
      {label}: {cfg.text}
    </span>
  );
}

// ─── Droppable Column ─────────────────────────────────────────────────────────

function KanbanColumn({
  col,
  deals,
  leadMap,
  briefingMap,
  propostaByDealId,
  propostaByLeadId,
  userMap,
  representationMap,
  isOver,
  onCardClick,
  onAgendar,
  onAdvance,
  onMove,
  onRemove,
  onReturnToQualified,
  getMoveOptions,
  stagesByKey,
}: {
  col: KanbanColumnDef;
  deals: Deal[];
  leadMap: Map<string, string>;
  briefingMap: Map<string, LeadBriefing>;
  propostaByDealId: Map<string, PropostaSnap>;
  propostaByLeadId: Map<string, PropostaSnap>;
  userMap: Map<string, string>;
  representationMap: Map<string, DealRepresentationSnap>;
  isOver: boolean;
  onCardClick: (deal: Deal) => void;
  onAgendar: (deal: Deal) => void;
  onAdvance: (deal: Deal) => void;
  onMove: (deal: Deal, stage: string) => void;
  onRemove: (deal: Deal) => void;
  onReturnToQualified: (deal: Deal) => void;
  getMoveOptions: (deal: Deal) => Array<{ value: string; label: string }>;
  stagesByKey: Record<string, PipelineStage>;
}) {
  const { setNodeRef } = useDroppable({ id: col.dropId });

  const total = deals.reduce((acc, d) => {
    const v = parseFloat(d.valor ?? "0");
    return acc + (isNaN(v) ? 0 : v);
  }, 0);

  const overdueCount = deals.filter((d) => {
    const dl = d.dataFechamentoPrevista ? new Date(d.dataFechamentoPrevista) : null;
    return dl && dl < new Date() && !TERMINAL_ETAPAS.has(d.etapa ?? "");
  }).length;

  // Card fica vermelho quando o tempo na etapa estourou o SLA configurado
  // pelo admin (pipeline_stages.slaMinutos) — distinto do "Atrasado"
  // amarelo acima, que é sobre a data de fechamento prevista do negócio.
  function isSlaOverdue(deal: Deal): boolean {
    const stage = stagesByKey[deal.etapa];
    if (!stage?.slaMinutos) return false;
    if (TERMINAL_ETAPAS.has(deal.etapa ?? "")) return false;
    const changedAt = (deal as Deal & { etapaAlteradaEm?: string }).etapaAlteradaEm;
    if (!changedAt) return false;
    const elapsedMin = (Date.now() - new Date(changedAt).getTime()) / 60000;
    return elapsedMin > stage.slaMinutos;
  }
  const slaOverdueCount = deals.filter(isSlaOverdue).length;

  return (
    <div className="flex w-80 shrink-0 flex-col h-full min-h-0 rounded-xl border bg-muted/20">
      {/* Column header */}
      <div className="sticky top-0 z-10 flex min-h-11 items-center justify-between border-b px-3 py-2.5 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-2 w-2 rounded-full border ${col.color.replace("text-", "border-")}`}
            style={{ background: "currentColor" }}
          />
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold text-foreground">
              {col.label}
            </span>
            {col.sublabel && (
              <span className={`text-[10px] font-medium ${col.color} opacity-70`}>
                {col.sublabel}
              </span>
            )}
          </div>
          <span className="text-xs text-muted-foreground bg-muted rounded-full px-1.5 py-0.5 font-medium">
            {deals.length}
          </span>
          {overdueCount > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-yellow-700 bg-yellow-100 border border-yellow-300 rounded-full px-1.5 py-0.5">
              <AlertTriangle className="h-2.5 w-2.5" />
              {overdueCount}
            </span>
          )}
          {slaOverdueCount > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-red-700 bg-red-100 border border-red-300 rounded-full px-1.5 py-0.5">
              <AlertTriangle className="h-2.5 w-2.5" />
              {slaOverdueCount}
            </span>
          )}
        </div>
        {total > 0 && (
          <span className="text-xs font-semibold text-foreground font-mono">
            {total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          </span>
        )}
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={`flex-1 min-h-0 overflow-y-auto rounded-b-xl p-2 space-y-2 transition-colors ${
          isOver
            ? "bg-primary/5 border-2 border-dashed border-primary/30"
            : "bg-muted/30 border-2 border-transparent"
        }`}
        data-testid={`column-${col.dropId}`}
      >
        {deals.map((deal) => {
          const proposta =
            (deal.id ? propostaByDealId.get(deal.id) : undefined) ??
            (deal.leadId ? propostaByLeadId.get(deal.leadId) : undefined);
          return (
            <DealCard
              key={deal.id}
              deal={deal}
              leadName={deal.leadId ? leadMap.get(deal.leadId) : undefined}
              briefing={deal.leadId ? briefingMap.get(deal.leadId) : undefined}
              proposta={proposta}
              assignedToName={deal.assignedTo ? userMap.get(deal.assignedTo) : undefined}
              representation={representationMap.get(deal.id)}
              onClick={() => onCardClick(deal)}
              onAgendar={() => onAgendar(deal)}
              onAdvance={() => onAdvance(deal)}
              onMove={(stage) => onMove(deal, stage)}
              onRemove={() => onRemove(deal)}
              onReturnToQualified={deal.etapa === "proposta" ? () => onReturnToQualified(deal) : undefined}
              moveOptions={getMoveOptions(deal)}
              slaOverdue={isSlaOverdue(deal)}
            />
          );
        })}
        {deals.length === 0 && (
          <div className="flex items-center justify-center h-20 text-xs text-muted-foreground/50">
            Solte aqui
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SaaS Deal Card ───────────────────────────────────────────────────────────

function SaasDealCard({
  deal,
  leadName,
  assignedToName,
  onClick,
  onAgendar,
  overlay = false,
}: {
  deal: Deal;
  leadName: string | undefined;
  assignedToName?: string;
  onClick?: () => void;
  onAgendar?: () => void;
  overlay?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `saas-${deal.id}`,
    data: { deal },
  });
  const etapaCfg = ETAPAS_SAAS.find((e) => e.value === deal.etapaSaas);
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      // Achado real: touchAction "none" fixo bloqueava a rolagem por toque
      // o tempo todo, não só durante o arrasto de verdade -- agora que o
      // TouchSensor usa atraso (precisa segurar) em vez de distância, a
      // rolagem nativa pode ficar livre por padrão.
      style={{ opacity: isDragging && !overlay ? 0.4 : 1 }}
      className={`group bg-card border border-border rounded-lg p-3 space-y-2 ${
        overlay
          ? "shadow-2xl rotate-1 cursor-grabbing"
          : "cursor-grab active:cursor-grabbing hover:border-indigo-300 hover:shadow-sm transition-all"
      }`}
      onClick={onClick}
    >
      {/* Title */}
      <div className="flex items-start gap-2">
        <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors" />
        <p className="text-sm font-medium leading-tight flex-1 line-clamp-2">{deal.titulo}</p>
      </div>

      {/* MRR / ARR */}
      {(deal.mrr || deal.arr) && (
        <div className="pl-6 flex flex-wrap gap-2">
          {deal.mrr && (
            <span className="inline-flex items-center gap-1 text-[11px] bg-indigo-50 text-indigo-700 font-semibold rounded-full px-2 py-0.5">
              <DollarSign className="h-3 w-3" />
              MRR {formatCurrency(deal.mrr)}
            </span>
          )}
          {deal.arr && (
            <span className="inline-flex items-center gap-1 text-[11px] bg-violet-50 text-violet-700 font-semibold rounded-full px-2 py-0.5">
              <BarChart3 className="h-3 w-3" />
              ARR {formatCurrency(deal.arr)}
            </span>
          )}
        </div>
      )}

      {/* Plan + Seats */}
      <div className="pl-6 flex flex-wrap gap-2">
        {deal.planoContratado && (
          <span className="inline-flex items-center gap-1 text-[11px] bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">
            <Package className="h-3 w-3" />
            {deal.planoContratado}
          </span>
        )}
        {deal.seats != null && (
          <span className="inline-flex items-center gap-1 text-[11px] bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">
            <Users className="h-3 w-3" />
            {deal.seats} seats
          </span>
        )}
      </div>

      {/* Lead + Churn */}
      <div className="pl-6 flex items-center justify-between">
        {leadName && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground truncate">
            <User className="h-3 w-3 shrink-0" />
            {leadName}
          </span>
        )}
        {deal.probChurn != null && deal.probChurn > 0 && (
          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-1.5 py-0.5 ml-auto ${
            deal.probChurn >= 70 ? "bg-red-100 text-red-700" :
            deal.probChurn >= 40 ? "bg-amber-100 text-amber-700" :
            "bg-slate-100 text-slate-600"
          }`}>
            <AlertTriangle className="h-2.5 w-2.5" />
            {deal.probChurn}% churn
          </span>
        )}
      </div>

      {/* Responsável */}
      {assignedToName && (
        <div className="pl-6 flex items-center gap-1.5 text-xs text-muted-foreground">
          <UserRound className="h-3 w-3 shrink-0" />
          <span className="truncate">{assignedToName}</span>
        </div>
      )}

      {/* Stage badge */}
      {etapaCfg && (
        <div className="pl-6">
          <span className={`inline-block text-[10px] font-medium rounded-full px-2 py-0.5 ${etapaCfg.bg} ${etapaCfg.color}`}>
            {etapaCfg.label}
          </span>
        </div>
      )}

      {/* Agendar reunião — ação rápida */}
      {onAgendar && !overlay && (
        <div
          className="pt-1 border-t border-border/50"
          onClick={(e) => { e.stopPropagation(); onAgendar(); }}
        >
          <button
            type="button"
            className="w-full flex items-center justify-center gap-1.5 text-[11px] font-medium text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-md py-1 transition-colors"
          >
            <CalendarDays className="h-3 w-3 shrink-0" />
            Agendar reunião
          </button>
        </div>
      )}
    </div>
  );
}

// ─── SaaS Kanban Column ────────────────────────────────────────────────────────

function SaasKanbanColumn({
  etapa,
  deals,
  leadMap,
  userMap,
  isOver,
  onCardClick,
  onAgendar,
}: {
  etapa: (typeof ETAPAS_SAAS)[number];
  deals: Deal[];
  leadMap: Map<string, string>;
  userMap: Map<string, string>;
  isOver: boolean;
  onCardClick: (deal: Deal) => void;
  onAgendar: (deal: Deal) => void;
}) {
  const { setNodeRef } = useDroppable({ id: `saas-col-${etapa.value}` });

  const totalMrr = deals.reduce((acc, d) => {
    const v = parseFloat(d.mrr ?? "0");
    return acc + (isNaN(v) ? 0 : v);
  }, 0);

  const Icon = etapa.icon;

  return (
    <div className="flex flex-col w-68 shrink-0" style={{ width: "272px" }}>
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <Icon className={`h-3.5 w-3.5 ${etapa.color}`} />
          <span className={`text-xs font-semibold uppercase tracking-wide ${etapa.color}`}>
            {etapa.label}
          </span>
          <span className="text-xs text-muted-foreground bg-muted rounded-full px-1.5 py-0.5 font-medium">
            {deals.length}
          </span>
        </div>
        {totalMrr > 0 && (
          <span className="text-[11px] text-muted-foreground font-mono">
            {totalMrr.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/mês
          </span>
        )}
      </div>

      <div
        ref={setNodeRef}
        className={`flex-1 min-h-[400px] rounded-lg p-2 space-y-2 transition-colors ${
          isOver
            ? "bg-indigo-50 border-2 border-dashed border-indigo-300"
            : "bg-muted/30 border-2 border-transparent"
        }`}
      >
        {deals.map((deal) => (
          <SaasDealCard
            key={deal.id}
            deal={deal}
            leadName={deal.leadId ? leadMap.get(deal.leadId) : undefined}
            assignedToName={deal.assignedTo ? userMap.get(deal.assignedTo) : undefined}
            onClick={() => onCardClick(deal)}
            onAgendar={() => onAgendar(deal)}
          />
        ))}
        {deals.length === 0 && (
          <div className="flex items-center justify-center h-20 text-xs text-muted-foreground/50">
            Solte aqui
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Edit SaaS Deal Sheet ─────────────────────────────────────────────────────

const saasDealSchema = z.object({
  titulo: z.string().min(2, "Título obrigatório"),
  etapaSaas: z.enum([
    "lead_qualificado", "demo_agendada", "trial_ativo",
    "proposta_enviada", "fechamento", "onboarding", "expansao",
  ]),
  mrr: z.coerce.number().min(0).optional(),
  arr: z.coerce.number().min(0).optional(),
  seats: z.coerce.number().int().min(0).optional(),
  planoContratado: z.string().optional(),
  dataRenovacao: z.string().optional(),
  probChurn: z.coerce.number().int().min(0).max(100).optional(),
  leadId: z.string().optional().or(z.literal("")),
});

function EditSaasDealSheet({
  deal,
  leadMap,
  open,
  onClose,
}: {
  deal: Deal | null;
  leadMap: Map<string, string>;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const updateDeal = useUpdateDeal();
  const queryClient = useQueryClient();
  const { user, token } = useAuth();
  const tenantId = user?.tenantId ?? "";

  type SaasFormValues = z.infer<typeof saasDealSchema>;
  const form = useForm<SaasFormValues, any, SaasFormValues>({
    resolver: zodResolver(saasDealSchema),
    values: deal
      ? {
          titulo: deal.titulo,
          etapaSaas: (deal.etapaSaas as SaasFormValues["etapaSaas"]) ?? "lead_qualificado",
          mrr: deal.mrr ? parseFloat(deal.mrr) : undefined,
          arr: deal.arr ? parseFloat(deal.arr) : undefined,
          seats: deal.seats ?? undefined,
          planoContratado: deal.planoContratado ?? "",
          dataRenovacao: deal.dataRenovacao
            ? new Date(deal.dataRenovacao).toISOString().split("T")[0]
            : "",
          probChurn: deal.probChurn ?? undefined,
          leadId: deal.leadId ?? "",
        }
      : {
          titulo: "",
          etapaSaas: "lead_qualificado",
        },
  });

  function onSubmit(values: SaasFormValues) {
    if (!deal) return;
    updateDeal.mutate(
      {
        id: deal.id,
        data: {
          titulo: values.titulo,
          etapaSaas: values.etapaSaas as DealEtapaSaas,
          mrr: values.mrr,
          arr: values.arr,
          seats: values.seats,
          planoContratado: values.planoContratado || undefined,
          dataRenovacao: values.dataRenovacao
            ? new Date(values.dataRenovacao).toISOString()
            : undefined,
          probChurn: values.probChurn,
          leadId: values.leadId || undefined,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Negócio SaaS atualizado." });
          queryClient.invalidateQueries({ queryKey: getListDealsQueryKey(tenantId) });
          onClose();
        },
        onError: () => {
          toast({ title: "Erro ao atualizar", variant: "destructive" });
        },
      }
    );
  }

  if (!deal) return null;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:w-[420px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-indigo-600" />
            Pipeline SaaS — Editar Negócio
          </SheetTitle>
        </SheetHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-6">
            <FormField
              control={form.control}
              name="titulo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Título *</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="etapaSaas"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Etapa SaaS *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {ETAPAS_SAAS.map((e) => (
                        <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-3 space-y-3">
              <p className="text-xs font-semibold text-indigo-700 flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5" />
                Métricas de Receita
              </p>
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="mrr"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">MRR (R$/mês)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" placeholder="0,00" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="arr"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">ARR (R$/ano)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" placeholder="0,00" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="planoContratado"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Plano</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: Pro, Enterprise" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="seats"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nº de Seats</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} placeholder="10" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="dataRenovacao"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data de Renovação</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="probChurn"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Risco de Churn %</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} max={100} placeholder="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="leadId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Lead / Empresa</FormLabel>
                  {leadMap.size > 0 ? (
                    <Select
                      onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)}
                      value={field.value || "__none__"}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecionar..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="__none__">Nenhum</SelectItem>
                        {Array.from(leadMap.entries()).map(([id, nome]) => (
                          <SelectItem key={id} value={id}>{nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <FormControl>
                      <Input placeholder="ID do lead" {...field} />
                    </FormControl>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700" disabled={updateDeal.isPending}>
              {updateDeal.isPending ? "Salvando..." : "Salvar alterações"}
            </Button>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}

// ─── Create Deal Form ─────────────────────────────────────────────────────────

const TIPOS_FECHAMENTO: { value: TipoFechamento; label: string; description: string }[] = [
  { value: "pedido",   label: "Pedido",   description: "Confirmação simples, sem assinatura formal" },
  { value: "contrato", label: "Contrato", description: "Contrato formal com assinatura eletrônica" },
];

const createSchema = z.object({
  titulo: z.string().min(2, "Título obrigatório"),
  valor: z.coerce.number().min(0).optional(),
  leadId: z.string().optional().or(z.literal("")),
  leadMode: z.enum(["existing", "new"]).default("existing"),
  leadNome: z.string().optional().or(z.literal("")),
  leadTelefone: z.string().optional().or(z.literal("")),
  leadEmail: z.string().email("Email inválido").optional().or(z.literal("")),
  leadEmpresa: z.string().optional().or(z.literal("")),
  leadDocumento: z.string().optional().or(z.literal("")),
  leadEndereco: z.string().optional().or(z.literal("")),
  leadSegmento: z.string().optional().or(z.literal("")),
  leadInstagram: z.string().optional().or(z.literal("")),
  leadProfissao: z.string().optional().or(z.literal("")),
  leadObjetivo: z.string().optional().or(z.literal("")),
  leadSource: z.string().default("manual"),
  assignedTo: z.string().optional().or(z.literal("")),
  etapa: z.string().min(1, "Etapa obrigatória"),
  probabilidade: z.coerce.number().min(0).max(100).optional(),
  tipoFechamento: z.enum(["pedido", "contrato", "pedido_e_contrato"]).optional(),
  skipAsaasBilling: z.boolean().default(false),
  dataFechamentoPrevista: z.string().optional().or(z.literal("")),
  aquecimentoTipo: z.enum(["cliente", "nao_cliente"]).optional(),
});

// ─── Edit Deal Sheet ──────────────────────────────────────────────────────────

function EditDealSheet({
  deal,
  leadMap,
  open,
  onClose,
  tenantDefault,
  tenantSlug,
}: {
  deal: Deal | null;
  leadMap: Map<string, string>;
  open: boolean;
  onClose: () => void;
  tenantDefault?: "pedido" | "contrato" | null;
  tenantSlug?: string;
}) {
  const { toast } = useToast();
  const updateDeal = useUpdateDeal();
  const queryClient = useQueryClient();
  const { user, token } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const [agendarOpen, setAgendarOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractedInfo, setExtractedInfo] = useState<{
    itens?: Array<{ descricao: string; quantidade?: number | null; valorUnitario?: number | null; valorTotal?: number | null }>;
    fornecedor?: string | null;
    cliente?: string | null;
    observacoes?: string | null;
  } | null>(null);
  const [quoteFileUrl, setQuoteFileUrl] = useState<string | null>(deal?.quoteFileUrl ?? null);
  const [quoteFileName, setQuoteFileName] = useState<string | null>(null);
  const quoteFileRef = useRef<HTMLInputElement>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferPipeline, setTransferPipeline] = useState("suporte");
  const [transferStage, setTransferStage] = useState("");
  const [transferResponsibleId, setTransferResponsibleId] = useState("");
  const [transferNote, setTransferNote] = useState("");
  const [transferring, setTransferring] = useState(false);
  const transferPipelineOptions = [
    { key: "aquecimento", label: "Aquecimento" },
    { key: "parceiros", label: "Parceiros" },
    { key: "execucao", label: "Execução / Pedidos" },
    { key: "suporte", label: "Suporte / Assistência" },
  ];
  const { data: transferUsers = [] } = useListTenantUsers(tenantId, {
    request: { headers: { Authorization: "Bearer " + (token ?? "") } },
    query: { enabled: !!tenantId && transferOpen, queryKey: getListTenantUsersQueryKey(tenantId) },
  });
  const { data: transferStages = [] } = useQuery<Array<{ id: string; key: string; label: string; ordem?: number; responsaveisFuncoes?: string[] | null }>>({
    queryKey: ["pipeline-stages", tenantId, transferPipeline],
    enabled: Boolean(tenantId && token && transferOpen && transferPipeline),
    staleTime: 30_000,
    queryFn: async () => {
      const response = await fetch(`/api/tenants/${tenantId}/pipeline-stages?pipeline=${encodeURIComponent(transferPipeline)}`, {
        headers: { Authorization: "Bearer " + (token ?? "") },
      });
      if (!response.ok) throw new Error("Não foi possível carregar as etapas da pipeline.");
      return response.json();
    },
  });

  const transferStageKeys = useMemo(
    () => [...transferStages]
      .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
      .map((stage) => stage.key)
      .join("|"),
    [transferStages],
  );
  const firstTransferStageKey = transferStageKeys.split("|").filter(Boolean)[0] ?? "";

  useEffect(() => {
    if (!transferOpen) return;
    setTransferStage((current) => {
      const available = transferStageKeys ? transferStageKeys.split("|") : [];
      if (current && available.includes(current)) return current;
      return firstTransferStageKey;
    });
  }, [transferOpen, transferPipeline, transferStageKeys, firstTransferStageKey]);

  const transferTargetStage = transferStages.find((stage) => stage.key === transferStage);
  const eligibleTransferUsers = useMemo(
    () => transferUsers.filter((candidate) => isUserResponsibleForStage(candidate as StageResponsibleUser, transferTargetStage as PipelineStage | undefined)),
    [transferUsers, transferTargetStage],
  );

  async function transferToPipeline() {
    if (!deal || !transferPipeline || !transferStage || !transferResponsibleId || transferNote.trim().length < 5) {
      toast({ title: "Selecione pipeline, etapa e responsável e informe uma justificativa.", variant: "destructive" });
      return;
    }
    setTransferring(true);
    try {
      const response = await fetch(`/api/deals/${deal.id}/transfer-pipeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + (token ?? "") },
        body: JSON.stringify({
          targetPipeline: transferPipeline,
          targetStage: transferStage,
          responsavelId: transferResponsibleId,
          justificativa: transferNote.trim(),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || body.message || "Falha ao transferir");
      const pipelineLabel = transferPipelineOptions.find((item) => item.key === transferPipeline)?.label ?? transferPipeline;
      const stageLabel = body?.destination?.stageLabel ?? transferStages.find((item) => item.key === transferStage)?.label ?? transferStage;
      toast({ title: "Lead movido para outra pipeline", description: `Destino: ${pipelineLabel} / ${stageLabel}. O histórico foi preservado.` });
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: getListDealsQueryKey(tenantId) }),
        queryClient.invalidateQueries({ queryKey: ["work-cards", tenantId, transferPipeline] }),
      ]);
      setTransferOpen(false);
      setTransferNote("");
      onClose();
    } catch (error) {
      toast({ title: "Não foi possível mover o lead", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
    } finally {
      setTransferring(false);
    }
  }


  async function handleQuoteUpload(file: File) {
    setExtracting(true);
    setExtractedInfo(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/tenants/${tenantId}/deals/extract-quote`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` },
        body: fd,
      });
      if (!res.ok) throw new Error("Falha");
      const data = await res.json();
      if (data.valorTotal != null) form.setValue("valor", data.valorTotal);
      if (data.titulo) {
        const current = form.getValues("titulo");
        if (!current || current.trim() === "") form.setValue("titulo", data.titulo);
      }
      if (data.itens?.length || data.fornecedor || data.cliente || data.observacoes) {
        setExtractedInfo({ itens: data.itens, fornecedor: data.fornecedor, cliente: data.cliente, observacoes: data.observacoes });
      }
      if (data.quoteFileUrl) {
        setQuoteFileUrl(data.quoteFileUrl);
        setQuoteFileName(data.originalName ?? null);
      }
      const confianca = data.confianca ?? 0;
      toast({ title: confianca >= 0.5 ? "Orçamento lido com sucesso!" : "Orçamento importado (leitura parcial)" });
    } catch {
      toast({ title: "Erro ao ler o orçamento", variant: "destructive" });
    } finally {
      setExtracting(false);
    }
  }

  type DealFormValues = z.infer<typeof createSchema>;
  const form = useForm<DealFormValues, any, DealFormValues>({
    resolver: zodResolver(createSchema),
    values: deal
      ? {
          titulo: deal.titulo,
          valor: deal.valor ? parseFloat(deal.valor) : undefined,
          leadId: deal.leadId ?? "",
          etapa: deal.etapa,
          probabilidade: deal.probabilidade ?? undefined,
          tipoFechamento: (deal.tipoFechamento as "pedido" | "contrato" | "pedido_e_contrato" | undefined) ?? tenantDefault ?? "pedido",
          skipAsaasBilling: deal.skipAsaasBilling === "true",
          dataFechamentoPrevista: deal.dataFechamentoPrevista
            ? String(deal.dataFechamentoPrevista).slice(0, 10)
            : "",
          aquecimentoTipo: ((deal as any).aquecimentoTipo as "cliente" | "nao_cliente" | undefined) ?? "nao_cliente",
        }
      : { titulo: "", etapa: "novo", tipoFechamento: tenantDefault ?? "pedido", skipAsaasBilling: false, dataFechamentoPrevista: "", aquecimentoTipo: "nao_cliente" as const },
  });

  function onSubmit(values: z.infer<typeof createSchema>) {
    if (!deal) return;
    updateDeal.mutate(
      {
        id: deal.id,
        data: {
          titulo: values.titulo,
          valor: values.valor,
          etapa: values.etapa as DealEtapa,
          leadId: values.leadId || undefined,
          probabilidade: values.probabilidade,
          tipoFechamento: values.tipoFechamento as TipoFechamento | undefined,
          skipAsaasBilling: values.skipAsaasBilling,
          ...(quoteFileUrl !== deal.quoteFileUrl ? { quoteFileUrl } : {}),
          ...(values.dataFechamentoPrevista ? { dataFechamentoPrevista: values.dataFechamentoPrevista } : {}),
          aquecimentoTipo: values.aquecimentoTipo ?? null,
        },
      },
      {
        onSuccess: (data) => {
          toast({ title: "Negócio atualizado." });
          if (values.etapa === "ganho" && deal.etapa !== "ganho") {
            if ((data as any).inviteSent && (data as any).inviteEmail) {
              toast({ title: `Convite de onboarding enviado para ${(data as any).inviteEmail}` });
            } else if ((data as any).inviteSkipReason === "no_email") {
              toast({
                title: "Negócio ganho — sem e-mail cadastrado",
                description: "Envie o convite manualmente após adicionar o e-mail do lead.",
              });
            }
            if ((data as any).whatsappSent) {
              toast({ title: "WhatsApp enviado ao lead." });
            } else if ((data as any).whatsappSkipReason === "no_phone") {
              toast({ title: "WhatsApp não enviado — lead sem telefone.", variant: "destructive" });
            } else if ((data as any).whatsappSkipReason === "zapi_not_configured") {
              toast({ title: "WhatsApp não enviado — Meta Cloud API não configurada.", variant: "destructive" });
            } else if ((data as any).whatsappSkipReason === "send_error") {
              toast({ title: "WhatsApp não enviado — erro ao enviar mensagem.", description: "Verifique as credenciais Meta Cloud API em Configurações.", variant: "destructive" });
            }
            if ((data as any).chargeSkipReason === "manual_payment") {
              toast({ title: "Cobrança Asaas pulada", description: "Pagamento marcado como recebido manualmente.", variant: "default" });
            }
          }
          queryClient.invalidateQueries({ queryKey: getListDealsQueryKey(tenantId) });
          onClose();
        },
        onError: () => {
          toast({ title: "Erro ao atualizar negócio", variant: "destructive" });
        },
      }
    );
  }

  if (!deal) return null;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:w-[400px]">
        <SheetHeader>
          <SheetTitle className="text-base">Editar Negócio</SheetTitle>
        </SheetHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-6">

            {/* ── Import Quote ─────────────────────────────────────── */}
            <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/20 p-3 space-y-2">
              <input
                ref={quoteFileRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.doc"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleQuoteUpload(file);
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full gap-2 border-violet-300 text-violet-700 hover:bg-violet-50"
                disabled={extracting}
                onClick={() => quoteFileRef.current?.click()}
              >
                {extracting ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Lendo orçamento...</>
                ) : (
                  <><FileUp className="h-4 w-4" />Importar Orçamento</>
                )}
              </Button>
              <p className="text-[11px] text-muted-foreground text-center">
                PDF, imagem ou Word — IA extrai o valor e itens automaticamente
              </p>
            </div>

            {extractedInfo && (
              <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 space-y-1.5">
                <p className="text-xs font-medium text-violet-800 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" />
                  Dados extraídos do orçamento
                </p>
                {extractedInfo.fornecedor && (
                  <p className="text-xs text-violet-700">Fornecedor: <span className="font-medium">{extractedInfo.fornecedor}</span></p>
                )}
                {extractedInfo.cliente && (
                  <p className="text-xs text-violet-700">Cliente: <span className="font-medium">{extractedInfo.cliente}</span></p>
                )}
                {extractedInfo.itens && extractedInfo.itens.length > 0 && (
                  <div className="space-y-1 mt-1">
                    {extractedInfo.itens.slice(0, 4).map((item, i) => (
                      <div key={i} className="flex justify-between text-[11px] text-violet-700 bg-white/60 rounded px-2 py-1">
                        <span className="truncate flex-1">{item.descricao}</span>
                        {item.valorTotal != null && (
                          <span className="ml-2 font-medium whitespace-nowrap">
                            R$ {item.valorTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </span>
                        )}
                      </div>
                    ))}
                    {extractedInfo.itens.length > 4 && (
                      <p className="text-[10px] text-violet-500 text-center">+{extractedInfo.itens.length - 4} itens</p>
                    )}
                  </div>
                )}
                {extractedInfo.observacoes && (
                  <p className="text-[11px] text-violet-600 italic leading-tight">{extractedInfo.observacoes.slice(0, 150)}</p>
                )}
              </div>
            )}

            <FormField
              control={form.control}
              name="titulo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Título</FormLabel>
                  <FormControl>
                    <Input data-testid="input-edit-titulo" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="valor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Valor (R$)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" data-testid="input-edit-valor" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="probabilidade"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Probabilidade %</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} max={100} data-testid="input-edit-prob" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="etapa"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Etapa</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {ETAPAS.map((e) => (
                        <SelectItem key={e.value} value={e.value}>
                          {e.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {/* Tipo de aquecimento — exibido apenas para a etapa em_aquecimento */}
            {form.watch("etapa") === "em_aquecimento" && (
              <FormField
                control={form.control}
                name="aquecimentoTipo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de aquecimento</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? "nao_cliente"}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="nao_cliente">Lead (não cliente)</SelectItem>
                        <SelectItem value="cliente">Ex-cliente (reativação)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <FormField
              control={form.control}
              name="dataFechamentoPrevista"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    Prazo de fechamento
                  </FormLabel>
                  <FormControl>
                    <Input type="date" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="leadId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Lead associado</FormLabel>
                  {leadMap.size > 0 ? (
                    <Select
                      onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)}
                      value={field.value || "__none__"}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecionar lead..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="__none__">Nenhum</SelectItem>
                        {Array.from(leadMap.entries()).map(([id, nome]) => (
                          <SelectItem key={id} value={id}>
                            {nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <FormControl>
                      <Input placeholder="ID do lead" data-testid="input-edit-leadid" {...field} />
                    </FormControl>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="tipoFechamento"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de fechamento</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-edit-tipo-fechamento">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {TIPOS_FECHAMENTO.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {TIPOS_FECHAMENTO.find((t) => t.value === field.value)?.description}
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="skipAsaasBilling"
              render={({ field }) => (
                <FormItem className="flex items-center gap-3 rounded-lg border p-3">
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <div className="space-y-0.5">
                    <FormLabel className="text-sm font-medium cursor-pointer">Pagamento já recebido / não gerar cobrança no Asaas</FormLabel>
                    <p className="text-xs text-muted-foreground">Marque se o pagamento foi feito manualmente e não deve gerar cobrança no Asaas.</p>
                  </div>
                </FormItem>
              )}
            />
            <div className="pt-2 border-t">
              <Button type="button" variant="outline" className="w-full" onClick={() => {
                setTransferPipeline("suporte");
                setTransferResponsibleId(deal.assignedTo ?? "");
                setTransferNote("");
                setTransferOpen(true);
              }}>
                Mover para outra pipeline
              </Button>
            </div>

            <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Mover para outra pipeline</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Pipeline de destino</label>
                    <Select value={transferPipeline} onValueChange={setTransferPipeline}>
                      <SelectTrigger><SelectValue placeholder="Selecione a pipeline..." /></SelectTrigger>
                      <SelectContent>
                        {transferPipelineOptions.map((item) => (
                          <SelectItem key={item.key} value={item.key}>{item.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Etapa de destino</label>
                    <Select value={transferStage} onValueChange={setTransferStage}>
                      <SelectTrigger><SelectValue placeholder="Selecione a etapa..." /></SelectTrigger>
                      <SelectContent>
                        {[...transferStages].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)).map((stage) => (
                          <SelectItem key={stage.id} value={stage.key}>{stage.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Responsável no destino</label>
                    <Select value={transferResponsibleId} onValueChange={setTransferResponsibleId}>
                      <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>
                        {eligibleTransferUsers.map((u) => (
                          <SelectItem key={u.id} value={u.id}>{u.name || u.email || u.id}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Justificativa do movimento</label>
                    <textarea
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-24"
                      value={transferNote}
                      onChange={(e) => setTransferNote(e.target.value)}
                      placeholder="Explique por que o lead está sendo movido para esta pipeline..."
                    />
                  </div>
                  <Button type="button" className="w-full" onClick={transferToPipeline} disabled={transferring || !transferPipeline || !transferStage || !transferResponsibleId || transferNote.trim().length < 5}>
                    {transferring ? "Movendo..." : "Confirmar movimento"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <Button
              type="submit"
              className="w-full"
              disabled={updateDeal.isPending}
              data-testid="button-save-deal"
            >
              {updateDeal.isPending ? "Salvando..." : "Salvar alterações"}
            </Button>
          </form>
        </Form>

        {/* ── Agendar reunião ───────────────────────────────────── */}
        {deal && (
          <div className="mt-3">
            <Button
              type="button"
              variant="outline"
              className="w-full flex items-center gap-2"
              onClick={() => setAgendarOpen(true)}
            >
              📅 Agendar reunião
            </Button>
          </div>
        )}

        {deal && agendarOpen ? (
          <Suspense fallback={null}>
            <AgendarReuniaoModal
              open={agendarOpen}
              onClose={() => setAgendarOpen(false)}
              tenantId={tenantId}
              dealId={deal.id}
              leadId={deal.leadId ?? ""}
              leadNome={leadMap.get(deal.leadId ?? "") ?? "Lead"}
              responsavelId={(deal as any).responsavelId ?? null}
            />
          </Suspense>
        ) : null}
        {/* ── Quote attachment ──────────────────────────────────── */}
        {quoteFileUrl && (          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-1.5">
            <p className="text-xs font-medium text-slate-700 flex items-center gap-1.5">
              <Paperclip className="h-3.5 w-3.5 text-slate-500" />
              Orçamento importado
            </p>
            <a
              href={`/api/storage/objects${quoteFileUrl.replace(/^\/objects/, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs text-blue-600 hover:text-blue-800 hover:underline truncate"
            >
              <FileUp className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {quoteFileName ?? quoteFileUrl.split("/").pop() ?? "Orçamento"}
              </span>
            </a>
          </div>
        )}

        {/* ── Closure status ──────────────────────────────────── */}
        {deal?.etapa === "ganho" && (deal.contractStatus || deal.onboardingStatus) && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
            <p className="text-xs font-medium text-slate-700 flex items-center gap-1.5">
              <FileCheck className="h-3.5 w-3.5 text-slate-500" />
              Status do fechamento
            </p>
            <div className="space-y-1.5">
              {deal.contractStatus && deal.contractStatus !== "na" && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">Contrato</span>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                    deal.contractStatus === "pending" ? "bg-amber-50 text-amber-700 border-amber-200" :
                    deal.contractStatus === "sent"    ? "bg-blue-50 text-blue-700 border-blue-200" :
                    deal.contractStatus === "signed"  ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                    deal.contractStatus === "failed"  ? "bg-red-50 text-red-700 border-red-200" :
                    "bg-slate-50 text-slate-600 border-slate-200"
                  }`}>
                    {deal.contractStatus === "pending" && "Gerando..."}
                    {deal.contractStatus === "sent" && "Enviado para assinatura"}
                    {deal.contractStatus === "signed" && "Assinado"}
                    {deal.contractStatus === "failed" && "Erro"}
                    {deal.contractStatus === "skipped" && "Ignorado"}
                    {!["pending","sent","signed","failed","skipped"].includes(deal.contractStatus) && deal.contractStatus}
                  </span>
                </div>
              )}
              {deal.contractError && (
                <p className="text-[10px] text-red-600 bg-red-50 rounded px-2 py-1 border border-red-100">
                  Erro contrato: {deal.contractError}
                </p>
              )}
              {deal.onboardingStatus && deal.onboardingStatus !== "na" && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">Onboarding</span>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                    deal.onboardingStatus === "pending" ? "bg-amber-50 text-amber-700 border-amber-200" :
                    deal.onboardingStatus === "sent"    ? "bg-blue-50 text-blue-700 border-blue-200" :
                    deal.onboardingStatus === "completed" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                    deal.onboardingStatus === "failed"  ? "bg-red-50 text-red-700 border-red-200" :
                    "bg-slate-50 text-slate-600 border-slate-200"
                  }`}>
                    {deal.onboardingStatus === "pending" && "Pendente"}
                    {deal.onboardingStatus === "sent" && "Convite enviado"}
                    {deal.onboardingStatus === "completed" && "Concluído"}
                    {deal.onboardingStatus === "failed" && "Erro"}
                    {!["pending","sent","completed","failed"].includes(deal.onboardingStatus) && deal.onboardingStatus}
                  </span>
                </div>
              )}
              {deal.onboardingError && (
                <p className="text-[10px] text-red-600 bg-red-50 rounded px-2 py-1 border border-red-100">
                  Erro onboarding: {deal.onboardingError}
                </p>
              )}
              {deal.chargeStatus && deal.chargeStatus !== "na" && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">Cobrança</span>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                    deal.chargeStatus === "manual_paid" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                    deal.chargeStatus === "PENDING" || deal.chargeStatus === "RECEIVED" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                    deal.chargeStatus === "OVERDUE" ? "bg-red-50 text-red-700 border-red-200" :
                    "bg-slate-50 text-slate-600 border-slate-200"
                  }`}>
                    {deal.chargeStatus === "manual_paid" && "Pago manualmente"}
                    {deal.chargeStatus === "PENDING" && "Pendente"}
                    {deal.chargeStatus === "RECEIVED" && "Recebida"}
                    {deal.chargeStatus === "OVERDUE" && "Atrasada"}
                    {deal.chargeStatus === "CONFIRMED" && "Confirmada"}
                    {!["manual_paid","PENDING","RECEIVED","OVERDUE","CONFIRMED"].includes(deal.chargeStatus) && deal.chargeStatus}
                  </span>
                </div>
              )}
              {deal.chargeLink && (
                <a href={deal.chargeLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-[11px] text-blue-600 hover:text-blue-800 hover:underline">
                  <CreditCard className="h-3 w-3" /> Link de pagamento
                </a>
              )}
              {deal.contractStatus === "failed" && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="w-full text-xs border-red-300 text-red-700 hover:bg-red-50 gap-1.5"
                  onClick={() => {
                    updateDeal.mutate(
                      { id: deal.id, data: { contractStatus: "pending" } },
                      {
                        onSuccess: () => {
                          toast({ title: "Contrato reenviado para geração." });
                          queryClient.invalidateQueries({ queryKey: getListDealsQueryKey(tenantId) });
                        },
                        onError: () => {
                          toast({ title: "Erro ao reenviar contrato", variant: "destructive" });
                        },
                      }
                    );
                  }}
                >
                  <RefreshCw className="h-3 w-3" /> Reenviar contrato
                </Button>
              )}
            </div>
          </div>
        )}

        {/* ── Loss reason section (perdido) ─────────────────── */}
        {deal?.etapa === "perdido" && deal?.lostReason && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 space-y-2">
            <p className="text-xs font-medium text-red-700 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              Motivo da perda
            </p>
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs">
                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-red-100 text-red-700 border border-red-200">
                  {MOTIVOS_PERDA.find((m) => m.value === deal.lostReason)?.label ?? deal.lostReason}
                </span>
                {deal.lostAt && (
                  <span className="text-[10px] text-red-500">
                    {new Date(deal.lostAt).toLocaleDateString("pt-BR")}
                  </span>
                )}
              </div>
              {deal.lostReasonDetail && (
                <p className="text-[11px] text-red-700 bg-white/60 rounded px-2 py-1 border border-red-100">
                  {deal.lostReasonDetail}
                </p>
              )}
            </div>
          </div>
        )}

        {deal?.etapa === "ganho" && tenantSlug && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 space-y-2">
            <p className="text-xs font-medium text-emerald-800 flex items-center gap-1.5">
              <Link2 className="h-3.5 w-3.5" />
              Link do questionário para o cliente
            </p>
            <p className="text-[11px] text-emerald-700 break-all font-mono bg-white/70 rounded px-2 py-1 border border-emerald-100">
              {`${window.location.origin}/questionario/${tenantSlug}`}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full border-emerald-300 text-emerald-700 hover:bg-emerald-100 text-xs gap-1.5"
              onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/questionario/${tenantSlug}`);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? <><CheckCheck className="h-3.5 w-3.5" /> Copiado!</> : <><Copy className="h-3.5 w-3.5" /> Copiar link</>}
            </Button>
          </div>
        )}

        {/* ── Briefing de IA ──────────────────────────────────── */}
        {(deal as any)?.aiBriefing && (
          <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                Briefing Automático (IA)
              </p>
              {(deal as any).aiBriefingGeneratedAt && (
                <span className="text-[10px] text-muted-foreground">
                  {new Date((deal as any).aiBriefingGeneratedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                </span>
              )}
            </div>
            <div className="text-[11px] text-foreground/80 whitespace-pre-wrap leading-relaxed bg-white/60 rounded px-2 py-2 border border-primary/10 max-h-80 overflow-y-auto">
              {(deal as any).aiBriefing}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Main Board ───────────────────────────────────────────────────────────────

export default function Deals() {
  const { user, token } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [, navigate] = useLocation();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [mobileCol, setMobileCol] = useState<string>("novo");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<string | null>(null);
  const [agendarDeal, setAgendarDeal] = useState<Deal | null>(null);
  const [perdidoDialog, setPerdidoDialog] = useState<{ open: boolean; deal: Deal | null; novaProb: number }>({
    open: false,
    deal: null,
    novaProb: 0,
  });
  // Pra quem vai o negócio quando o card é movido -- sempre pergunta,
  // mesmo que a resposta seja "comigo mesmo". Guarda os dados da
  // movimentação (etapa/prob/etc já calculados) pra aplicar junto com
  // o responsável escolhido, num só PATCH.
  const [assignDialog, setAssignDialog] = useState<{
    open: boolean;
    deal: Deal | null;
    updateData: Record<string, unknown> | null;
    onGanho: boolean;
  }>({ open: false, deal: null, updateData: null, onGanho: false });
  const [removeDialog, setRemoveDialog] = useState<{ open: boolean; deal: Deal | null }>({ open: false, deal: null });
  const [removeReason, setRemoveReason] = useState<"colaborador" | "fornecedor" | "parceiro" | "familiar" | "amigo" | "outro">("outro");
  const [removeNotes, setRemoveNotes] = useState("");
  const [removingFromPipeline, setRemovingFromPipeline] = useState(false);
  const [returnQualifiedDialog, setReturnQualifiedDialog] = useState<{ open: boolean; deal: Deal | null }>({ open: false, deal: null });
  const [returnQualifiedReason, setReturnQualifiedReason] = useState("");
  const [returnQualifiedMissing, setReturnQualifiedMissing] = useState("");
  const [returnQualifiedResponsibleId, setReturnQualifiedResponsibleId] = useState("");
  const [returnQualifiedDueDate, setReturnQualifiedDueDate] = useState("");
  const [returningToQualified, setReturningToQualified] = useState(false);
  // SaaS pipeline state
  const [saasActiveId, setSaasActiveId] = useState<string | null>(null);
  const [saasOverColumn, setSaasOverColumn] = useState<DealEtapaSaas | null>(null);
  const [isCreateSaasOpen, setIsCreateSaasOpen] = useState(false);
  const [createExtracting, setCreateExtracting] = useState(false);
  const [createExtractedInfo, setCreateExtractedInfo] = useState<{
    itens?: Array<{ descricao: string; quantidade?: number | null; valorUnitario?: number | null; valorTotal?: number | null }>;
    fornecedor?: string | null;
    cliente?: string | null;
    clienteDocumento?: string | null;
    clienteEndereco?: string | null;
    clienteTelefone?: string | null;
    clienteEmail?: string | null;
    observacoes?: string | null;
  } | null>(null);
  const [createQuoteFileUrl, setCreateQuoteFileUrl] = useState<string | null>(null);
  const [createQuoteFileName, setCreateQuoteFileName] = useState<string | null>(null);
  const createQuoteFileRef = useRef<HTMLInputElement>(null);

  const { data: allDeals = [], isLoading } = useListDeals(tenantId, undefined, {
    query: {
      enabled: !!tenantId,
      queryKey: getListDealsQueryKey(tenantId),
      staleTime: 20_000,
      refetchOnWindowFocus: false,
    },
  });

  // Fonte oficial do pipeline comercial. Kanban, seletores, SLA e responsáveis
  // devem consumir exatamente esta mesma lista, na mesma ordem.
  const deals = useMemo(() => allDeals.filter((deal) => {
    const relationshipStage = (deal as Deal & { relationshipStage?: string | null }).relationshipStage;
    return !relationshipStage?.startsWith("transferido_")
      && deal.etapa !== "em_aquecimento"
      && deal.etapa !== "parceiro";
  }), [allDeals]);

  const { data: pipelineStages = [] } = useListPipelineStages(tenantId, {
    request: { headers: { Authorization: "Bearer " + (token ?? "") } },
    query: {
      enabled: !!tenantId && !!token,
      queryKey: getListPipelineStagesQueryKey(tenantId),
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  });
  const stagesByKey = useMemo(
    () => Object.fromEntries(pipelineStages.map((s) => [s.key, s])) as Record<string, PipelineStage>,
    [pipelineStages],
  );

  // Card fica vermelho quando o tempo na etapa atual estourou o SLA
  // configurado (slaMinutos null = sem SLA, nunca fica vermelho).
  function isSlaOverdue(deal: Deal): boolean {
    const stage = stagesByKey[deal.etapa];
    if (!stage?.slaMinutos) return false;
    if (TERMINAL_ETAPAS.has(deal.etapa ?? "")) return false;
    const changedAt = (deal as Deal & { etapaAlteradaEm?: string }).etapaAlteradaEm;
    if (!changedAt) return false;
    const elapsedMin = (Date.now() - new Date(changedAt).getTime()) / 60000;
    return elapsedMin > stage.slaMinutos;
  }

  // Fonte única: a lista configurada no backend é a própria estrutura visual
  // da pipeline. Não misture com ETAPAS/KANBAN_COLUMNS fixos, pois isso cria
  // colunas órfãs (ex.: "Contrato") e faz "Responsáveis por etapa" divergir.
  const visibleEtapas = useMemo(() => {
    if (pipelineStages.length === 0) {
      return ETAPAS
        .filter((stage) => stage.value !== "conferencia_estoque")
        .map((stage) => ({ ...stage }));
    }

    return [...pipelineStages]
      .filter((stage) => !["em_aquecimento", "parceiro"].includes(stage.key))
      .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
      .map((stage) => ({
        value: stage.key,
        label: stage.label,
        color: stage.color ?? "text-gray-600",
        bg: stage.bg ?? "bg-gray-100",
      }));
  }, [pipelineStages]);

  const kanbanColumns = useMemo<KanbanColumnDef[]>(() => {
    const staticByKey = new Map(
      KANBAN_COLUMNS.map((column) => [column.onDrop.etapa, column] as const),
    );

    // Nunca deixe o quadro sem colunas enquanto a configuração ainda carrega
    // ou se houver falha transitória na consulta. Assim que a API responder,
    // a configuração oficial do tenant substitui este fallback integralmente.
    if (pipelineStages.length === 0) {
      return KANBAN_COLUMNS
        .filter((column) => column.onDrop.etapa !== "conferencia_estoque")
        .map((column) => ({ ...column }))
        .sort((a, b) => a.order - b.order);
    }

    return [...pipelineStages]
      .filter((stage) => !["em_aquecimento", "parceiro"].includes(stage.key))
      .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
      .map((stage) => {
        const fallback = staticByKey.get(stage.key);
        return {
          dropId: stage.key,
          label: stage.label,
          color: stage.color ?? fallback?.color ?? "text-gray-600",
          bg: stage.bg ?? fallback?.bg ?? "bg-gray-100",
          order: stage.ordem,
          isSpecial: fallback?.isSpecial ?? ["perdido", "entregue"].includes(stage.key),
          onDrop: { etapa: stage.key },
        };
      });
  }, [pipelineStages]);

  const mobileColumnKeys = useMemo(
    () => kanbanColumns.map((column) => column.dropId).join("|"),
    [kanbanColumns],
  );
  const firstMobileColumnKey = mobileColumnKeys.split("|").filter(Boolean)[0] ?? "";

  useEffect(() => {
    if (!firstMobileColumnKey) return;
    const available = mobileColumnKeys.split("|");
    if (!available.includes(mobileCol)) {
      setMobileCol(firstMobileColumnKey);
    }
  }, [firstMobileColumnKey, mobileColumnKeys, mobileCol]);

  const { data: leads = [] } = useListTenantLeads(tenantId, {
    query: {
      enabled: !!tenantId,
      queryKey: getListTenantLeadsQueryKey(tenantId),
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  });

  const { data: briefings = [] } = useListTenantBriefings(tenantId, {
    query: {
      enabled: !!tenantId,
      queryKey: getListTenantBriefingsQueryKey(tenantId),
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  });

  const { data: tenantData } = useGetTenant(tenantId, {
    query: { enabled: !!tenantId, queryKey: getGetTenantQueryKey(tenantId) },
  });
  const rawTenantDefault = (tenantData?.tipoFechamentoDefault as TipoFechamento | null | undefined) ?? null;
  const tenantDefault: "pedido" | "contrato" | null =
    rawTenantDefault === "pedido_e_contrato" ? null : rawTenantDefault;

  const { data: tenantUsers = [] } = useListTenantUsers(tenantId, {
    query: { enabled: !!tenantId, queryKey: getListTenantUsersQueryKey(tenantId), staleTime: 60_000, refetchOnWindowFocus: false },
  });

  const { data: responsiblePartnerships = [] } = useQuery<DealResponsiblePartnership[]>({
    queryKey: ["commercial-partnerships", tenantId, "deal-responsible-picker"],
    enabled: Boolean(tenantId && token && isCreateOpen),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const response = await fetch(`/api/tenants/${tenantId}/commercial-partnerships`, {
        headers: { Authorization: "Bearer " + (token ?? "") },
      });
      if (!response.ok) throw new Error("Não foi possível carregar as empresas representantes.");
      const rows = await response.json() as DealResponsiblePartnership[];
      return rows.filter((item) => item.ownerTenantId === tenantId && item.status === "active");
    },
  });

  const { data: dealRepresentativeFunctions = [] } = useQuery<DealRepresentativeFunction[]>({
    queryKey: ["tenant-user-functions", tenantId, "deal-responsible-picker"],
    enabled: Boolean(tenantId && token && isCreateOpen),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const response = await fetch(`/api/tenants/${tenantId}/user-functions`, {
        headers: { Authorization: "Bearer " + (token ?? "") },
      });
      if (!response.ok) throw new Error("Não foi possível carregar as funções de representação.");
      const rows = await response.json() as DealRepresentativeFunction[];
      return rows.filter((item) => item.kind === "external_company");
    },
  });

  // Novas tarefas/passagens só podem ser atribuídas a usuários ativos cuja
  // função esteja configurada como responsável pela etapa de destino.
  // tenantUsers completo permanece no mapa para preservar responsáveis históricos.
  const qualifiedResponsibleUsers = useMemo(
    () => tenantUsers.filter((candidate) => isUserResponsibleForStage(candidate as StageResponsibleUser, stagesByKey.qualificado)),
    [tenantUsers, stagesByKey.qualificado],
  );
  const assignTargetStageKey = typeof assignDialog.updateData?.etapa === "string"
    ? assignDialog.updateData.etapa
    : null;
  const assignResponsibleUsers = useMemo(
    () => assignTargetStageKey
      ? tenantUsers.filter((candidate) => isUserResponsibleForStage(candidate as StageResponsibleUser, stagesByKey[assignTargetStageKey]))
      : [],
    [tenantUsers, assignTargetStageKey, stagesByKey],
  );

  const userMap = new Map(tenantUsers.map((u) => [u.id, u.name || u.email || u.id]));

  const { data: dealParticipations = [] } = useQuery<DealRepresentationSnap[]>({
    queryKey: ["deal-participations", tenantId],
    enabled: !!tenantId && !!token,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const response = await fetch(`/api/tenants/${tenantId}/deal-participations`, {
        headers: { Authorization: "Bearer " + (token ?? "") },
      });
      if (!response.ok) throw new Error("Não foi possível carregar as representações dos negócios.");
      return response.json();
    },
  });
  const representationMap = useMemo(
    () => new Map(dealParticipations.filter((item) => item.status === "active").map((item) => [item.dealId, item])),
    [dealParticipations],
  );

  const leadMap = new Map(leads.map((l) => [l.id, l.nome]));

  const briefingMap = new Map(briefings.map((b) => [b.leadId, b]));

  const { data: propostas = [] } = useListPropostas(tenantId, undefined, {
    query: { enabled: !!tenantId, queryKey: getListPropostasQueryKey(tenantId) },
  });

  const dealToPropostaId = new Map(
    propostas.filter((p) => p.dealId).map((p) => [p.dealId!, p.id])
  );

  // proposta mais relevante por dealId (para enriquecer cards)
  const propostaByDealId = new Map<string, PropostaSnap>(
    propostas
      .filter((p) => p.dealId)
      .map((p) => [p.dealId!, { id: p.id, titulo: p.titulo, status: p.status, valorTotal: p.valorTotal }])
  );

  // proposta mais recente por leadId (fallback quando o deal não tem dealId linkado)
  const propostaByLeadId = new Map<string, PropostaSnap>();
  for (const lead of leads) {
    const ps = propostas
      .filter((p) => p.leadId === lead.id && !p.dealId)
      .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());
    if (ps.length > 0) {
      const p = ps[0];
      propostaByLeadId.set(lead.id, { id: p.id, titulo: p.titulo, status: p.status, valorTotal: p.valorTotal });
    }
  }

  function handleCardClick(deal: Deal) {
    if (deal.leadId) {
      navigate(`/trabalho/${deal.leadId}?dealId=${deal.id}&from=pipeline`);
    }
  }

  const updateDeal = useUpdateDeal();

  const createDeal = useCreateDeal();
  const createLead = useCreateLead();

  async function handleCreateQuoteUpload(file: File) {
    setCreateExtracting(true);
    setCreateExtractedInfo(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/tenants/${tenantId}/deals/extract-quote`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` },
        body: fd,
      });
      if (!res.ok) {
        toast({
          title: "Erro ao ler o pedido/orçamento",
          description: `Falha na importação (HTTP ${res.status}).`,
          variant: "destructive",
        });
        throw new Error("Falha");
      }
      const data = await res.json();
      if (data.valorTotal != null) createForm.setValue("valor", data.valorTotal);
      if (data.titulo) {
        const current = createForm.getValues("titulo");
        if (!current || current.trim() === "") createForm.setValue("titulo", data.titulo);
      }
      if (data.itens?.length || data.fornecedor || data.cliente || data.observacoes) {
        setCreateExtractedInfo({
          itens: data.itens,
          fornecedor: data.fornecedor,
          cliente: data.cliente,
          clienteDocumento: data.clienteDocumento,
          clienteEndereco: data.clienteEndereco,
          clienteTelefone: data.clienteTelefone,
          clienteEmail: data.clienteEmail,
          observacoes: data.observacoes,
        });
      }
      if (data.quoteFileUrl) {
        setCreateQuoteFileUrl(data.quoteFileUrl);
        setCreateQuoteFileName(data.originalName ?? file.name);
      }

      const normalize = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
      const digitsOnly = (value: unknown) => String(value ?? "").replace(/\D/g, "");
      const extractedDocument = digitsOnly(data.clienteDocumento);
      const extractedName = normalize(data.cliente);
      const existingLead = leads.find((lead) => {
        const sameDocument = extractedDocument.length >= 8 && digitsOnly((lead as any).documento) === extractedDocument;
        const sameName = extractedName.length >= 3 && [lead.nome, (lead as any).empresa].some((value) => normalize(value) === extractedName);
        return sameDocument || sameName;
      });

      if (existingLead) {
        createForm.setValue("leadMode", "existing");
        createForm.setValue("leadId", existingLead.id);
      } else if (data.cliente || data.clienteDocumento || data.clienteEndereco || data.clienteTelefone || data.clienteEmail) {
        createForm.setValue("leadMode", "new");
        createForm.setValue("leadId", "");
        if (data.cliente) createForm.setValue("leadNome", data.cliente);
        if (data.clienteDocumento) createForm.setValue("leadDocumento", data.clienteDocumento);
        if (data.clienteEndereco) createForm.setValue("leadEndereco", data.clienteEndereco);
        if (data.clienteTelefone) createForm.setValue("leadTelefone", data.clienteTelefone);
        if (data.clienteEmail) createForm.setValue("leadEmail", data.clienteEmail);
      }
      const confianca = data.confianca ?? 0;
      toast({ title: confianca >= 0.5 ? "Orçamento lido com sucesso!" : "Orçamento importado (leitura parcial)" });
    } catch {
      toast({ title: "Erro ao ler o orçamento", variant: "destructive" });
    } finally {
      setCreateExtracting(false);
    }
  }

  type DealFormValues = z.infer<typeof createSchema>;
  const createForm = useForm<DealFormValues, any, DealFormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      titulo: "",
      valor: undefined,
      leadId: "",
      leadMode: "existing",
      leadNome: "",
      leadTelefone: "",
      leadEmail: "",
      leadEmpresa: "",
      leadDocumento: "",
      leadEndereco: "",
      leadSegmento: "",
      leadInstagram: "",
      leadProfissao: "",
      leadObjetivo: "",
      leadSource: "manual",
      assignedTo: "",
      etapa: "novo",
      probabilidade: undefined,
      tipoFechamento: tenantDefault ?? "pedido",
    },
  });

  async function onCreateSubmit(values: z.infer<typeof createSchema>) {
    let leadId = values.leadId || undefined;
    const stage = stagesByKey[values.etapa];
    const eligibleUsers = tenantUsers.filter((candidate) =>
      isUserResponsibleForStage(candidate as StageResponsibleUser, stage)
    );
    const representativePartnershipId = dealRepresentativePartnershipId(values.assignedTo);
    const selectedPartnership = representativePartnershipId
      ? responsiblePartnerships.find((item) => item.id === representativePartnershipId)
      : undefined;
    const selectedInternalUser = !representativePartnershipId
      ? eligibleUsers.find((candidate) => candidate.id === values.assignedTo)
      : undefined;

    if (!values.assignedTo || (!selectedInternalUser && !selectedPartnership)) {
      createForm.setError("assignedTo", { message: "Selecione uma pessoa da equipe ou uma empresa representante." });
      toast({
        title: "Responsável obrigatório",
        description: "Escolha uma pessoa habilitada para a etapa inicial ou uma empresa representante ativa.",
        variant: "destructive",
      });
      return;
    }

    const representativeFunction = selectedPartnership?.partnerTenantCode
      ? dealRepresentativeFunctions.find((item) =>
          item.kind === "external_company" &&
          item.linkedTenantCode === selectedPartnership.partnerTenantCode
        )
      : undefined;

    if (values.leadMode === "new") {
      if (!values.leadNome?.trim() || values.leadNome.trim().length < 2) {
        createForm.setError("leadNome", { message: "Nome do cliente é obrigatório." });
        return;
      }

      const normalize = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
      const digitsOnly = (value: unknown) => String(value ?? "").replace(/\D/g, "");
      const document = digitsOnly(values.leadDocumento);
      const phone = digitsOnly(values.leadTelefone);
      const email = normalize(values.leadEmail);
      const duplicate = leads.find((lead) =>
        (document.length >= 8 && digitsOnly((lead as any).documento) === document) ||
        (phone.length >= 8 && digitsOnly((lead as any).telefone) === phone) ||
        (email && normalize((lead as any).email) === email)
      );

      if (duplicate) {
        leadId = duplicate.id;
        createForm.setValue("leadMode", "existing");
        createForm.setValue("leadId", duplicate.id);
        toast({
          title: "Cliente já cadastrado",
          description: `${duplicate.nome || (duplicate as any).empresa || "Cliente"} foi reutilizado para evitar duplicação.`,
        });
      } else {
        try {
          const createdLead = await createLead.mutateAsync({
            data: {
              tenantId,
              nome: values.leadNome.trim(),
              telefone: values.leadTelefone?.trim() || null,
              email: values.leadEmail?.trim() || null,
              empresa: values.leadEmpresa?.trim() || null,
              documento: values.leadDocumento?.trim() || null,
              endereco: values.leadEndereco?.trim() || null,
              mercadoSegmento: values.leadSegmento?.trim() || null,
              instagramHandle: values.leadInstagram?.trim() || null,
              profissao: values.leadProfissao?.trim() || null,
              objetivo: values.leadObjetivo?.trim() || null,
              tipoPessoa: "fisica",
              source: createQuoteFileUrl ? "pedido_importado" : (values.leadSource || "manual"),
              assignedTo: selectedInternalUser?.id,
              representativeFunctionId: representativeFunction?.id,
            },
          });
          leadId = (createdLead as { id?: string }).id;
          if (!leadId) throw new Error("Cliente criado sem identificador válido.");
          await queryClient.invalidateQueries({ queryKey: getListTenantLeadsQueryKey(tenantId) });
        } catch (error) {
          toast({
            title: "Não foi possível cadastrar o cliente",
            description: error instanceof Error ? error.message : "Revise os dados do cliente e tente novamente.",
            variant: "destructive",
          });
          return;
        }
      }
    }

    if (!leadId) {
      createForm.setError("leadId", { message: "Selecione um cliente existente ou cadastre um novo." });
      toast({ title: "Cliente obrigatório", description: "Todo novo negócio deve ficar vinculado a um cliente.", variant: "destructive" });
      return;
    }

    try {
      const createdDeal = await createDeal.mutateAsync({
        data: {
          tenantId,
          titulo: values.titulo,
          valor: values.valor,
          etapa: values.etapa as DealEtapa,
          leadId,
          assignedTo: selectedInternalUser?.id,
          probabilidade: values.probabilidade,
          tipoFechamento: values.tipoFechamento as TipoFechamento | undefined,
          quoteFileUrl: createQuoteFileUrl ?? undefined,
        },
      });

      const createdDealId = (createdDeal as { id?: string }).id;
      if (selectedPartnership) {
        if (!createdDealId) throw new Error("O negócio foi criado sem identificador para vincular a representante.");
        const response = await fetch(`/api/deals/${createdDealId}/share-with-partner`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + (token ?? ""),
          },
          body: JSON.stringify({
            partnershipId: selectedPartnership.id,
            role: "responsible",
          }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(body.error || body.message || "Não foi possível definir a empresa representante como responsável.");
        }
      }

      toast({
        title: "Negócio criado.",
        description: selectedPartnership
          ? `Responsável: ${selectedPartnership.partnerName || selectedPartnership.partnerTenantCode || "empresa representante"}.`
          : createQuoteFileName
            ? `Pedido/orçamento ${createQuoteFileName} preservado e vinculado ao negócio.`
            : undefined,
      });
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: getListDealsQueryKey(tenantId) }),
        queryClient.invalidateQueries({ queryKey: ["deal-participations", tenantId] }),
      ]);
      setIsCreateOpen(false);
      setCreateExtractedInfo(null);
      setCreateQuoteFileUrl(null);
      setCreateQuoteFileName(null);
      createForm.reset();
    } catch (error) {
      toast({
        title: "Erro ao criar negócio",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  }

  function getForwardMoveOptions(deal: Deal) {
    const current = kanbanColumns.find((column) => column.onDrop.etapa === deal.etapa);
    const currentOrder = current?.order ?? -1;
    return visibleEtapas.filter((stage) => {
      if (stage.value === deal.etapa) return false;
      const target = kanbanColumns.find((column) => column.onDrop.etapa === stage.value);
      if (!target) return false;
      if (target.isSpecial) return stage.value === "perdido";
      return currentOrder < 0 || target.order > currentOrder;
    });
  }

  function requestStageMove(deal: Deal, targetStage: string) {
    if (targetStage === deal.etapa) return;
    const targetCol = kanbanColumns.find((column) => column.onDrop.etapa === targetStage);
    if (!targetCol) {
      toast({ title: "Etapa indisponível", variant: "destructive" });
      return;
    }
    const allowed = getForwardMoveOptions(deal).some((stage) => stage.value === targetStage);
    if (!allowed) {
      toast({
        title: "Movimento não permitido",
        description: "Use Avançar ou escolha uma etapa posterior. O histórico das etapas anteriores é preservado.",
        variant: "destructive",
      });
      return;
    }
    const novaProb = ETAPA_PROBABILIDADE[targetStage] ?? deal.probabilidade ?? 0;
    if (targetStage === "perdido") {
      setPerdidoDialog({ open: true, deal, novaProb });
      return;
    }
    setAssignDialog({
      open: true,
      deal,
      updateData: {
        etapa: targetStage,
        probabilidade: novaProb,
        tipoFechamento: deal.tipoFechamento ?? undefined,
      },
      onGanho: targetStage === "ganho",
    });
  }

  function advanceDeal(deal: Deal) {
    const next = getForwardMoveOptions(deal)
      .map((stage) => ({
        stage,
        column: kanbanColumns.find((column) => column.onDrop.etapa === stage.value),
      }))
      .filter((item) => item.column && !item.column.isSpecial)
      .sort((a, b) => (a.column!.order ?? 999) - (b.column!.order ?? 999))[0];
    if (!next) {
      toast({ title: "Este negócio já está na última etapa disponível." });
      return;
    }
    requestStageMove(deal, next.stage.value);
  }

  function openReturnToQualified(deal: Deal) {
    if (deal.etapa !== "proposta") return;
    if (!deal.leadId) {
      toast({ title: "Este negócio não possui lead vinculado.", variant: "destructive" });
      return;
    }
    setReturnQualifiedReason("");
    setReturnQualifiedMissing("");
    const preferredResponsibleId = [deal.assignedTo, user?.id].find(
      (candidateId) => candidateId && qualifiedResponsibleUsers.some((candidate) => candidate.id === candidateId),
    );
    setReturnQualifiedResponsibleId(preferredResponsibleId ?? "");
    setReturnQualifiedDueDate("");
    setReturnQualifiedDialog({ open: true, deal });
  }

  async function confirmReturnToQualified() {
    const deal = returnQualifiedDialog.deal;
    if (!deal?.leadId) return;
    if (
      returnQualifiedReason.trim().length < 3 ||
      returnQualifiedMissing.trim().length < 3 ||
      !returnQualifiedResponsibleId ||
      !returnQualifiedDueDate
    ) return;

    if (!qualifiedResponsibleUsers.some((candidate) => candidate.id === returnQualifiedResponsibleId)) {
      toast({
        title: "Responsável indisponível",
        description: "Selecione uma pessoa ativa configurada como responsável pela etapa Qualificado.",
        variant: "destructive",
      });
      return;
    }

    setReturningToQualified(true);
    try {
      await customFetch(`/api/deals/${deal.id}/return-to-qualified`, {
        method: "POST",
        body: JSON.stringify({
          motivo: returnQualifiedReason.trim(),
          informacoesFaltantes: returnQualifiedMissing.trim(),
          responsavelId: returnQualifiedResponsibleId,
          dataVencimento: new Date(`${returnQualifiedDueDate}T23:59:59`).toISOString(),
        }),
        responseType: "json",
      });

      toast({
        title: "Lead devolvido para Qualificado",
        description: "A tarefa para completar as informações foi criada e ficará bloqueando o retorno ao Orçamento até ser concluída.",
      });
      setReturnQualifiedDialog({ open: false, deal: null });
      setReturnQualifiedReason("");
      setReturnQualifiedMissing("");
      setReturnQualifiedResponsibleId("");
      setReturnQualifiedDueDate("");
      queryClient.invalidateQueries({ queryKey: getListDealsQueryKey(tenantId) });
      queryClient.invalidateQueries({ queryKey: getListTenantLeadsQueryKey(tenantId) });
    } catch (error) {
      toast({
        title: "Não foi possível devolver para Qualificado",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setReturningToQualified(false);
    }
  }

  function openRemoveFromPipeline(deal: Deal) {
    if (!deal.leadId) {
      toast({ title: "Este negócio não possui lead vinculado.", variant: "destructive" });
      return;
    }
    setRemoveReason("outro");
    setRemoveNotes("");
    setRemoveDialog({ open: true, deal });
  }

  async function confirmRemoveFromPipeline() {
    const deal = removeDialog.deal;
    if (!deal?.leadId) return;
    setRemovingFromPipeline(true);
    try {
      const response = await fetch(`/api/leads/${deal.leadId}/classificar-nao-lead`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token ?? localStorage.getItem("vendorai_token") ?? ""}`,
        },
        body: JSON.stringify({
          tipo: removeReason,
          notas: removeNotes.trim() || `Retirado da pipeline pelo negócio "${deal.titulo}".`,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Falha ao retirar da pipeline");
      toast({
        title: "Retirado da pipeline",
        description: "O contato foi enviado para Aquecimento / Não Lead. Cadastro e histórico foram preservados.",
      });
      setRemoveDialog({ open: false, deal: null });
      setRemoveNotes("");
      queryClient.invalidateQueries({ queryKey: getListDealsQueryKey(tenantId) });
      queryClient.invalidateQueries({ queryKey: getListTenantLeadsQueryKey(tenantId) });
    } catch (error) {
      toast({
        title: "Não foi possível retirar da pipeline",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setRemovingFromPipeline(false);
    }
  }

  // Achado real: PointerSensor sozinho intercepta qualquer arrasto de 8px+
  // como início de "mover card" -- inclusive um gesto de rolar a tela por
  // toque no celular, já que o quadro inteiro é a mesma área de rolagem
  // horizontal. Padrão documentado do dnd-kit pra esse conflito: separar
  // mouse (distance-based, sem afetar toque) de toque (delay-based -- só
  // vira "arrastar" depois de segurar 200ms, um toque rápido de rolar
  // passa direto sem ser capturado).
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  const activeDeal = activeId ? deals.find((d) => d.id === activeId) ?? null : null;

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const overId = event.over?.id as string | undefined;
    const col = kanbanColumns.find((c) => c.dropId === overId);
    setOverColumn(col ? col.dropId : null);
  }, [kanbanColumns]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);
      setOverColumn(null);

      if (!over) return;

      const draggedDeal = deals.find((d) => d.id === active.id);
      const targetCol = kanbanColumns.find((c) => c.dropId === over.id);

      if (!draggedDeal || !targetCol) return;

      const sourceColId = getColumnIdForDeal(draggedDeal);
      if (sourceColId === targetCol.dropId) return;

      // ── Backward move prevention ─────────────────────────────────────────
      const sourceCol = kanbanColumns.find((c) => c.dropId === sourceColId);
      const sourceOrder = sourceCol?.order ?? -1;
      const targetOrder = targetCol.order;
            if (
        !targetCol.isSpecial &&
        sourceOrder !== -1 &&
        targetOrder !== -1 &&
        targetOrder < sourceOrder
      ) {
        toast({
          title: "Movimento não permitido",
          description: "Cards só podem avançar no funil comercial. Aquecimento e Parceiros possuem pipelines próprias.",
          variant: "destructive",
        });
        return;
      }

      // Toda movimentação passa pela Central para registrar responsável, atividade e contexto.
      if (draggedDeal.leadId) {
        navigate(`/trabalho/${draggedDeal.leadId}?dealId=${draggedDeal.id}&targetStage=${targetCol.onDrop.etapa}&from=pipeline`);
        return;
      }

      const novaProb = ETAPA_PROBABILIDADE[targetCol.onDrop.etapa];

      // Interceptar movimento para "perdido" — exibir modal antes de confirmar
      if (targetCol.onDrop.etapa === "perdido") {
        queryClient.setQueryData(
          getListDealsQueryKey(tenantId),
          (old: Deal[] | undefined) =>
            (old ?? []).map((d) =>
              d.id === draggedDeal.id ? { ...d, etapa: "perdido", probabilidade: novaProb } : d
            )
        );
        setPerdidoDialog({ open: true, deal: draggedDeal, novaProb });
        return;
      }

      // Optimistic update (inclui aquecimentoTipo quando relevante)
      const newAquecimentoTipo =
        targetCol.onDrop.aquecimentoTipo !== undefined
          ? targetCol.onDrop.aquecimentoTipo
          : (draggedDeal as any).aquecimentoTipo ?? null;

      queryClient.setQueryData(
        getListDealsQueryKey(tenantId),
        (old: Deal[] | undefined) =>
          (old ?? []).map((d) =>
            d.id === draggedDeal.id
              ? { ...d, etapa: targetCol.onDrop.etapa, probabilidade: novaProb, aquecimentoTipo: newAquecimentoTipo }
              : d
          )
      );

      const updateData: Record<string, unknown> = {
        etapa: targetCol.onDrop.etapa,
        probabilidade: novaProb,
        tipoFechamento: draggedDeal.tipoFechamento ?? undefined,
      };
      if (targetCol.onDrop.aquecimentoTipo !== undefined) {
        updateData.aquecimentoTipo = targetCol.onDrop.aquecimentoTipo;
      }

      // Pedido real: toda movimentação de card sempre pergunta "pra quem
      // vai" (mesmo mim mesmo) -- abre o modal em vez de mandar direto.
      setAssignDialog({ open: true, deal: draggedDeal, updateData, onGanho: targetCol.onDrop.etapa === "ganho" });
    },
    [deals, kanbanColumns, navigate, queryClient, tenantId, updateDeal, toast]
  );

  function confirmarAtribuicao(assignedTo: string) {
    const { deal, updateData, onGanho } = assignDialog;
    if (!deal || !updateData) return;
    setAssignDialog({ open: false, deal: null, updateData: null, onGanho: false });

    queryClient.setQueryData(
      getListDealsQueryKey(tenantId),
      (old: Deal[] | undefined) =>
        (old ?? []).map((d) =>
          d.id === deal.id ? { ...d, ...updateData, assignedTo } as Deal : d
        )
    );

    updateDeal.mutate(
      { id: deal.id, data: { ...updateData, assignedTo } as Parameters<typeof updateDeal.mutate>[0]["data"] },
      {
        onSuccess: (data) => {
          if (onGanho) {
            if ((data as any).inviteSent && (data as any).inviteEmail) {
              toast({ title: `Convite de onboarding enviado para ${(data as any).inviteEmail}` });
            } else if ((data as any).inviteSkipReason === "no_email") {
              toast({
                title: "Negócio ganho — sem e-mail cadastrado",
                description: "Envie o convite manualmente após adicionar o e-mail do lead.",
                variant: "default",
              });
            }
            if ((data as any).whatsappSent) {
              toast({ title: "WhatsApp enviado ao lead." });
            } else if ((data as any).whatsappSkipReason === "no_phone") {
              toast({ title: "WhatsApp não enviado — lead sem telefone.", variant: "destructive" });
            } else if ((data as any).whatsappSkipReason === "zapi_not_configured") {
              toast({ title: "WhatsApp não enviado — Meta Cloud API não configurada.", variant: "destructive" });
            } else if ((data as any).whatsappSkipReason === "send_error") {
              toast({ title: "WhatsApp não enviado — erro ao enviar mensagem.", description: "Verifique as credenciais Meta Cloud API em Configurações.", variant: "destructive" });
            }
          }
        },
        onError: () => {
          toast({ title: "Erro ao mover negócio", variant: "destructive" });
          queryClient.invalidateQueries({ queryKey: getListDealsQueryKey(tenantId) });
        },
      }
    );
  }

  function confirmarPerdido(categoria: string, detalhe: string) {
    const { deal, novaProb } = perdidoDialog;
    if (!deal) return;
    setPerdidoDialog({ open: false, deal: null, novaProb: 0 });
    updateDeal.mutate(
      {
        id: deal.id,
        data: {
          etapa: "perdido",
          probabilidade: novaProb,
          lostReason: categoria,
          lostReasonDetail: detalhe || undefined,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListDealsQueryKey(tenantId) });
        },
        onError: () => {
          toast({ title: "Erro ao registrar perda", variant: "destructive" });
          queryClient.invalidateQueries({ queryKey: getListDealsQueryKey(tenantId) });
        },
      }
    );
  }

  function cancelarPerdido() {
    const { deal } = perdidoDialog;
    if (deal) {
      queryClient.setQueryData(
        getListDealsQueryKey(tenantId),
        (old: Deal[] | undefined) =>
          (old ?? []).map((d) =>
            d.id === deal.id ? { ...d, etapa: deal.etapa, probabilidade: deal.probabilidade } : d
          )
      );
    }
    setPerdidoDialog({ open: false, deal: null, novaProb: 0 });
  }

  // dealsForColumn is a module-level function; bind to local deals list
  const dealsForKanbanColumn = (col: KanbanColumnDef) => dealsForColumn(col, deals);

  // ─── SaaS DnD ────────────────────────────────────────────────────────────────

  const saasDealsList = deals.filter((d) => d.etapaSaas != null);
  const saasActiveDeal = saasActiveId
    ? deals.find((d) => d.id === saasActiveId.replace("saas-", "")) ?? null
    : null;

  const handleSaasDragStart = useCallback((event: DragStartEvent) => {
    setSaasActiveId(event.active.id as string);
  }, []);

  const handleSaasDragOver = useCallback((event: DragOverEvent) => {
    const overId = event.over?.id as string | undefined;
    const colId = overId?.replace("saas-col-", "");
    const col = ETAPAS_SAAS.find((e) => e.value === colId);
    setSaasOverColumn(col ? col.value : null);
  }, []);

  const handleSaasDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setSaasActiveId(null);
      setSaasOverColumn(null);
      if (!over) return;
      const dealId = (active.id as string).replace("saas-", "");
      const draggedDeal = deals.find((d) => d.id === dealId);
      const targetColId = (over.id as string).replace("saas-col-", "");
      const targetEtapa = ETAPAS_SAAS.find((e) => e.value === targetColId);
      if (!draggedDeal || !targetEtapa) return;
      if (draggedDeal.etapaSaas === targetEtapa.value) return;
      const currentSaasIndex = ETAPAS_SAAS.findIndex((stage) => stage.value === draggedDeal.etapaSaas);
      const targetSaasIndex = ETAPAS_SAAS.findIndex((stage) => stage.value === targetEtapa.value);
      if (currentSaasIndex >= 0 && targetSaasIndex < currentSaasIndex) {
        toast({ title: "Movimento não permitido", description: "O card SaaS só pode avançar. Etapas já concluídas permanecem no histórico.", variant: "destructive" });
        return;
      }

      const novaProb = ETAPA_SAAS_PROBABILIDADE[targetEtapa.value];

      queryClient.setQueryData(
        getListDealsQueryKey(tenantId),
        (old: Deal[] | undefined) =>
          (old ?? []).map((d) =>
            d.id === dealId ? { ...d, etapaSaas: targetEtapa.value, probabilidade: novaProb } : d
          )
      );

      updateDeal.mutate(
        { id: dealId, data: { etapaSaas: targetEtapa.value as DealEtapaSaas, probabilidade: novaProb } },
        {
          onError: () => {
            toast({ title: "Erro ao mover negócio SaaS", variant: "destructive" });
            queryClient.invalidateQueries({ queryKey: getListDealsQueryKey(tenantId) });
          },
        }
      );
    },
    [deals, queryClient, tenantId, updateDeal, toast]
  );

  const dealsBySaasEtapa = (etapa: DealEtapaSaas) =>
    saasDealsList.filter((d) => d.etapaSaas === etapa);

  const totalMrrPipeline = saasDealsList.reduce((acc, d) => {
    const v = parseFloat(d.mrr ?? "0");
    return acc + (isNaN(v) ? 0 : v);
  }, 0);

  const saasSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  return (
    <div className="vendor-product-page vendor-page-canvas vendor-deals-page flex h-full flex-col space-y-5">
      {/* Header */}
      <div className="vendor-product-hero flex justify-between items-end shrink-0 gap-3">
        <div>
          <h1 className="vendor-product-title">Negócios</h1>
          <p className="vendor-product-subtitle">
            {deals.filter((d) => !["em_aquecimento", "parceiro", "em_execucao", "ganho", "entregue", "perdido"].includes(d.etapa)).length} negócios ativos na pipeline comercial
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
        <Dialog open={isCreateOpen} onOpenChange={(open) => {
          setIsCreateOpen(open);
          if (!open) {
            setCreateExtractedInfo(null);
            setCreateQuoteFileUrl(null);
            setCreateQuoteFileName(null);
            createForm.reset();
          }
        }}>
          <DialogTrigger asChild>
            <Button data-testid="button-novo-negocio">
              <Plus className="h-4 w-4 mr-2" />
              Novo Negócio
            </Button>
          </DialogTrigger>
          <DialogContent className="w-[calc(100vw-2rem)] max-h-[90vh] max-w-3xl overflow-y-auto overflow-x-hidden p-0">
            <DialogHeader className="sticky top-0 z-20 border-b bg-background/95 px-6 py-4 backdrop-blur">
              <DialogTitle>Criar Novo Negócio</DialogTitle>
              <p className="text-sm text-muted-foreground">Cadastre o cliente, defina o responsável e crie a oportunidade sem perder o contexto comercial.</p>
            </DialogHeader>
            <Form {...createForm}>
              <form onSubmit={createForm.handleSubmit(onCreateSubmit)} className="min-w-0 space-y-5 px-6 pb-6 pt-5">

                {/* ── Import Quote ────────────────────────────────────── */}
                <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/20 p-3 space-y-2">
                  <input
                    ref={createQuoteFileRef}
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.doc"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleCreateQuoteUpload(file);
                      e.target.value = "";
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full gap-2 border-violet-300 text-violet-700 hover:bg-violet-50"
                    disabled={createExtracting}
                    onClick={() => createQuoteFileRef.current?.click()}
                  >
                    {createExtracting ? (
                      <><Loader2 className="h-4 w-4 animate-spin" />Lendo orçamento...</>
                    ) : (
                      <><FileUp className="h-4 w-4" />Importar Orçamento</>
                    )}
                  </Button>
                  <p className="text-[11px] text-muted-foreground text-center">
                    PDF, imagem ou Word — IA extrai o valor e itens automaticamente
                  </p>
                </div>

                {createExtractedInfo && (
                  <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 space-y-1.5">
                    <p className="text-xs font-medium text-violet-800 flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5" />
                      Dados extraídos do orçamento
                    </p>
                    {createExtractedInfo.fornecedor && (
                      <p className="text-xs text-violet-700">Fornecedor: <span className="font-medium">{createExtractedInfo.fornecedor}</span></p>
                    )}
                    {createExtractedInfo.cliente && (
                      <p className="text-xs text-violet-700">Cliente: <span className="font-medium">{createExtractedInfo.cliente}</span></p>
                    )}
                    {createExtractedInfo.clienteDocumento && (
                      <p className="text-xs text-violet-700">CPF/CNPJ: <span className="font-medium">{createExtractedInfo.clienteDocumento}</span></p>
                    )}
                    {createExtractedInfo.clienteTelefone && (
                      <p className="text-xs text-violet-700">Telefone: <span className="font-medium">{createExtractedInfo.clienteTelefone}</span></p>
                    )}
                    {createExtractedInfo.clienteEmail && (
                      <p className="text-xs text-violet-700">E-mail: <span className="font-medium">{createExtractedInfo.clienteEmail}</span></p>
                    )}
                    {createExtractedInfo.clienteEndereco && (
                      <p className="text-xs text-violet-700">Endereço: <span className="font-medium">{createExtractedInfo.clienteEndereco}</span></p>
                    )}
                    {createExtractedInfo.itens && createExtractedInfo.itens.length > 0 && (
                      <div className="space-y-1 mt-1">
                        {createExtractedInfo.itens.slice(0, 4).map((item, i) => (
                          <div key={i} className="flex justify-between text-[11px] text-violet-700 bg-white/60 rounded px-2 py-1">
                            <span className="truncate flex-1">{item.descricao}</span>
                            {item.valorTotal != null && (
                              <span className="ml-2 font-medium whitespace-nowrap">
                                R$ {item.valorTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                              </span>
                            )}
                          </div>
                        ))}
                        {createExtractedInfo.itens.length > 4 && (
                          <p className="text-[10px] text-violet-500 text-center">+{createExtractedInfo.itens.length - 4} itens</p>
                        )}
                      </div>
                    )}
                    {createExtractedInfo.observacoes && (
                      <p className="text-[11px] text-violet-600 italic leading-tight">{createExtractedInfo.observacoes.slice(0, 150)}</p>
                    )}
                  </div>
                )}

                <FormField
                  control={createForm.control}
                  name="titulo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Título *</FormLabel>
                      <FormControl>
                        <Input data-testid="input-titulo" placeholder="Ex: Orçamento Acme Corp" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={createForm.control}
                    name="valor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Valor (R$)</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" data-testid="input-valor" placeholder="0,00" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={createForm.control}
                    name="probabilidade"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Probabilidade %</FormLabel>
                        <FormControl>
                          <Input type="number" min={0} max={100} data-testid="input-prob" placeholder="50" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField                  control={createForm.control}
                  name="etapa"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Etapa inicial</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-etapa">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {visibleEtapas.map((e) => (
                            <SelectItem key={e.value} value={e.value}>
                              {e.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <section className="space-y-3 rounded-lg border bg-muted/20 p-4">
                  <div>
                    <p className="text-sm font-semibold">Cliente do negócio *</p>
                    <p className="text-xs text-muted-foreground">Use um cadastro existente ou complete o cadastro do cliente sem sair deste fluxo.</p>
                  </div>

                  <FormField
                    control={createForm.control}
                    name="leadMode"
                    render={({ field }) => (
                      <FormItem>
                        <div className="grid grid-cols-2 gap-2">
                          <Button type="button" variant={field.value === "existing" ? "default" : "outline"} onClick={() => field.onChange("existing")}>
                            Cliente existente
                          </Button>
                          <Button type="button" variant={field.value === "new" ? "default" : "outline"} onClick={() => { field.onChange("new"); createForm.setValue("leadId", ""); }}>
                            Cadastrar cliente
                          </Button>
                        </div>
                      </FormItem>
                    )}
                  />

                  {createForm.watch("leadMode") === "existing" ? (
                    <FormField
                      control={createForm.control}
                      name="leadId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Cliente cadastrado</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || ""}>
                            <FormControl><SelectTrigger data-testid="select-lead"><SelectValue placeholder="Selecionar cliente..." /></SelectTrigger></FormControl>
                            <SelectContent>
                              {leads.map((lead) => (
                                <SelectItem key={lead.id} value={lead.id}>
                                  {lead.nome}{(lead as any).empresa && (lead as any).empresa !== lead.nome ? ` • ${(lead as any).empresa}` : ""}{(lead as any).telefone ? ` • ${(lead as any).telefone}` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <FormField control={createForm.control} name="leadNome" render={({ field }) => (
                        <FormItem className="sm:col-span-2">
                          <FormLabel>Nome / Razão social *</FormLabel>
                          <FormControl><Input placeholder="Nome completo ou razão social" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={createForm.control} name="leadTelefone" render={({ field }) => (
                        <FormItem>
                          <FormLabel>WhatsApp / Telefone</FormLabel>
                          <FormControl><PhoneInput {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={createForm.control} name="leadEmail" render={({ field }) => (
                        <FormItem>
                          <FormLabel>E-mail</FormLabel>
                          <FormControl><Input type="email" placeholder="email@cliente.com" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={createForm.control} name="leadEmpresa" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Empresa / Nome fantasia</FormLabel>
                          <FormControl><Input placeholder="Empresa" {...field} /></FormControl>
                        </FormItem>
                      )} />
                      <FormField control={createForm.control} name="leadDocumento" render={({ field }) => (
                        <FormItem>
                          <FormLabel>CPF / CNPJ</FormLabel>
                          <FormControl><Input placeholder="Documento" {...field} /></FormControl>
                        </FormItem>
                      )} />
                      <FormField control={createForm.control} name="leadEndereco" render={({ field }) => (
                        <FormItem className="sm:col-span-2">
                          <FormLabel>Endereço</FormLabel>
                          <FormControl><Input placeholder="Rua, número, bairro, cidade/UF, CEP" {...field} /></FormControl>
                        </FormItem>
                      )} />
                      <FormField control={createForm.control} name="leadSegmento" render={({ field }) => (
                        <FormItem className="sm:col-span-2">
                          <FormLabel>Segmento</FormLabel>
                          <FormControl><Input placeholder="Ex.: Serralheria, construção, varejo" {...field} /></FormControl>
                        </FormItem>
                      )} />
                      <FormField control={createForm.control} name="leadInstagram" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Instagram</FormLabel>
                          <FormControl><Input placeholder="@usuario" {...field} /></FormControl>
                        </FormItem>
                      )} />
                      <FormField control={createForm.control} name="leadProfissao" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Cargo / função</FormLabel>
                          <FormControl><Input placeholder="Ex.: Comprador, Diretor, Arquiteto" {...field} /></FormControl>
                        </FormItem>
                      )} />
                      <FormField control={createForm.control} name="leadSource" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Origem do lead</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                            <SelectContent>
                              {LEAD_SOURCE_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )} />
                      <FormField control={createForm.control} name="leadObjetivo" render={({ field }) => (
                        <FormItem className="sm:col-span-2">
                          <FormLabel>Objetivo / necessidade</FormLabel>
                          <FormControl><Input placeholder="O que este lead precisa?" {...field} /></FormControl>
                        </FormItem>
                      )} />
                      <div className="sm:col-span-2 rounded-md border border-dashed bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                        Este cadastro segue o mesmo padrão do Novo Lead. Dados importados de pedido/orçamento preenchem os mesmos campos e o sistema reutiliza cadastros existentes quando encontra documento, telefone ou e-mail iguais.
                      </div>
                    </div>
                  )}
                </section>

                <section className="grid min-w-0 gap-4 rounded-xl border bg-muted/15 p-4 sm:grid-cols-2">
                  <FormField
                    control={createForm.control}
                    name="assignedTo"
                    render={({ field }) => {
                      const selectedStage = stagesByKey[createForm.watch("etapa")];
                      const eligible = tenantUsers.filter((candidate) => isUserResponsibleForStage(candidate as StageResponsibleUser, selectedStage));
                      return (
                        <FormItem className="min-w-0">
                          <FormLabel>Responsável *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || ""}>
                            <FormControl>
                              <SelectTrigger className="w-full min-w-0">
                                <SelectValue placeholder="Equipe ou empresa representante..." />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="max-h-72">
                              {eligible.map((candidate) => (
                                <SelectItem key={candidate.id} value={candidate.id}>
                                  Equipe · {candidate.name || candidate.email || candidate.id}
                                </SelectItem>
                              ))}
                              {responsiblePartnerships.map((partnership) => (
                                <SelectItem key={partnership.id} value={`${DEAL_REPRESENTATIVE_PREFIX}${partnership.id}`}>
                                  Representante · {partnership.partnerName || partnership.partnerTenantCode || partnership.partnerTenantId}
                                </SelectItem>
                              ))}
                              {eligible.length === 0 && responsiblePartnerships.length === 0 && (
                                <SelectItem value="__none_available__" disabled>
                                  Nenhum responsável disponível
                                </SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                          <p className="text-[11px] leading-relaxed text-muted-foreground">
                            Você pode atribuir o negócio a uma pessoa da equipe habilitada para a etapa ou a uma empresa representante ativa.
                          </p>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />
                  <FormField
                    control={createForm.control}
                    name="tipoFechamento"
                    render={({ field }) => (
                      <FormItem className="min-w-0">
                        <FormLabel>Tipo de fechamento</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="w-full min-w-0" data-testid="select-tipo-fechamento">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {TIPOS_FECHAMENTO.map((t) => (
                              <SelectItem key={t.value} value={t.value}>
                                {t.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-[11px] leading-relaxed text-muted-foreground">
                          {TIPOS_FECHAMENTO.find((t) => t.value === field.value)?.description}
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </section>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={createDeal.isPending}
                  data-testid="button-submit-negocio"
                >
                  {createDeal.isPending ? "Criando..." : "Criar Negócio"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <PipelineNav active="comercial" />

      {/* ── Pipeline Clássico — Mobile column picker ────────────────────── */}
      <div className="md:hidden flex flex-col gap-3 flex-1 min-h-0">
        <div className="flex gap-2 overflow-x-auto pb-1 shrink-0">
          {kanbanColumns.map((col) => {
            const count = dealsForKanbanColumn(col).length;
            const isSelected = mobileCol === col.dropId;
            return (
              <button
                key={col.dropId}
                onClick={() => setMobileCol(col.dropId)}
                className={[
                  "flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border shrink-0 transition-colors",
                  isSelected
                    ? col.bg + " " + col.color + " border-current"
                    : "bg-card border-border text-muted-foreground",
                ].join(" ")}
              >
                {col.label}
                {count > 0 && <span className="ml-0.5 opacity-70">({count})</span>}
              </button>
            );
          })}
        </div>

        <div className="space-y-2 overflow-y-auto flex-1 pb-6">
          {isLoading ? (
            [0, 1, 2].map((i) => (
              <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />
            ))
          ) : (() => {
            const col = kanbanColumns.find((c) => c.dropId === mobileCol);
            const colDeals = col ? dealsForKanbanColumn(col) : [];
            if (colDeals.length === 0) {
              return (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                  <Package className="h-8 w-8 opacity-20" />
                  <p className="text-sm">Nenhum negócio nesta etapa</p>
                </div>
              );
            }
            return colDeals.map((deal) => {
              const slaLate = isSlaOverdue(deal);
              return (
              <div key={deal.id} className={[
                "border rounded-xl p-4 space-y-2",
                slaLate ? "bg-red-50/50 border-red-400 shadow-[0_0_10px_rgba(239,68,68,0.35)]" : "bg-card border-border",
              ].join(" ")}>
                {slaLate && (
                  <div className="flex items-center gap-1 rounded-full px-2 py-0.5 bg-red-100 border border-red-300 w-fit">
                    <AlertTriangle className="h-3 w-3 text-red-700" />
                    <span className="text-[10px] font-bold text-red-800 uppercase tracking-wide">Tempo esgotado</span>
                  </div>
                )}
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-sm leading-tight flex-1">{deal.titulo}</p>
                  <span className="text-sm font-semibold font-mono shrink-0">{formatCurrency(deal.valor)}</span>
                </div>
                {deal.leadId && leadMap.get(deal.leadId) && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <User className="h-3 w-3 shrink-0" />
                    <span className="truncate">{leadMap.get(deal.leadId)}</span>
                  </div>
                )}
                {deal.assignedTo && userMap.get(deal.assignedTo) && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <UserRound className="h-3 w-3 shrink-0" />
                    <span className="truncate">{userMap.get(deal.assignedTo)}</span>
                  </div>
                )}
                {deal.dataFechamentoPrevista && (
                  <div className={[
                    "flex items-center gap-1.5 text-xs",
                    new Date(deal.dataFechamentoPrevista) < new Date() && !TERMINAL_ETAPAS.has(deal.etapa ?? "")
                      ? "text-yellow-600 font-semibold"
                      : "text-muted-foreground",
                  ].join(" ")}>
                    <Clock className="h-3 w-3 shrink-0" />
                    <span>Prazo: {new Date(deal.dataFechamentoPrevista).toLocaleDateString("pt-BR")}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 pt-1 border-t border-border/50">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1"
                    onClick={() => advanceDeal(deal)}
                  >
                    <ArrowRight className="h-3.5 w-3.5" />
                    Avançar
                  </Button>
                  {deal.etapa === "proposta" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs gap-1 text-blue-700 border-blue-200 hover:bg-blue-50"
                      onClick={() => openReturnToQualified(deal)}
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      Falta info
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-red-600 hover:bg-red-50"
                    title="Retirar da pipeline"
                    onClick={() => openRemoveFromPipeline(deal)}
                  >
                    <UserMinus className="h-3.5 w-3.5" />
                  </Button>
                  <Select onValueChange={(etapa) => requestStageMove(deal, etapa)}>
                    <SelectTrigger className="flex-1 h-8 text-xs">
                      <SelectValue placeholder="Mover para..." />
                    </SelectTrigger>
                    <SelectContent>
                      {getForwardMoveOptions(deal).map((e) => (
                        <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 px-2 shrink-0 gap-1"
                    onClick={() => setAgendarDeal(deal)}
                  >
                    <CalendarDays className="h-3.5 w-3.5" />
                    Agendar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs text-primary px-2 shrink-0"
                    onClick={() => handleCardClick(deal)}
                  >
                    Ver →
                  </Button>
                  <AdminDeleteLeadButton
                    leadId={deal.leadId}
                    leadName={deal.leadId ? leadMap.get(deal.leadId) : deal.titulo}
                  />
                </div>
              </div>
              );
            });
          })()}
        </div>
      </div>

      {/* ── Pipeline Clássico — Desktop Kanban ──────────────────────────── */}
      <div className="hidden md:flex md:flex-col flex-1 min-h-0">
        {isLoading ? (
          <div className="flex gap-4 overflow-x-auto pb-4">
            {kanbanColumns.map((col) => (
              <div key={col.dropId} className="w-72 shrink-0 space-y-2">
                <div className="h-5 bg-muted animate-pulse rounded w-24" />
                <div className="h-[400px] bg-muted/30 animate-pulse rounded-lg" />
              </div>
            ))}
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <div className="flex gap-4 overflow-x-auto overflow-y-hidden pb-2 flex-1 min-h-0">
              {kanbanColumns.map((col) => (
                <KanbanColumn
                  key={col.dropId}
                  col={col}
                  deals={dealsForKanbanColumn(col)}
                  leadMap={leadMap}
                  briefingMap={briefingMap}
                  propostaByDealId={propostaByDealId}
                  propostaByLeadId={propostaByLeadId}
                  userMap={userMap}
                  representationMap={representationMap}
                  isOver={overColumn === col.dropId}
                  onCardClick={handleCardClick}
                  onAgendar={(deal) => setAgendarDeal(deal)}
                  onAdvance={advanceDeal}
                  onMove={requestStageMove}
                  onRemove={openRemoveFromPipeline}
                  onReturnToQualified={openReturnToQualified}
                  getMoveOptions={getForwardMoveOptions}
                  stagesByKey={stagesByKey}
                />
              ))}
            </div>
            <DragOverlay dropAnimation={null}>
              {activeDeal ? (
                <DealCard
                  deal={activeDeal}
                  leadName={activeDeal.leadId ? leadMap.get(activeDeal.leadId) : undefined}
                  briefing={activeDeal.leadId ? briefingMap.get(activeDeal.leadId) : undefined}
                  assignedToName={activeDeal.assignedTo ? userMap.get(activeDeal.assignedTo) : undefined}
                  representation={representationMap.get(activeDeal.id)}
                  overlay
                />
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      {/* ── Modal Motivo de Perda ─────────────────────────────────────────── */}
      <MotivosPerdaDialog
        open={perdidoDialog.open}
        onConfirm={confirmarPerdido}
        onCancel={cancelarPerdido}
      />

      {/* ── Orçamento → Qualificado por falta de informação ──────────────── */}
      <Dialog
        open={returnQualifiedDialog.open}
        onOpenChange={(open) => {
          if (!open && !returningToQualified) setReturnQualifiedDialog({ open: false, deal: null });
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowLeft className="h-5 w-5 text-blue-600" />
              Voltar para Qualificado
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Use esta ação quando não for possível concluir o orçamento por falta de informação. O motivo fica no histórico e uma tarefa obrigatória é criada para resolver a pendência.
          </p>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Motivo da devolução *</label>
              <textarea
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
                rows={2}
                value={returnQualifiedReason}
                onChange={(event) => setReturnQualifiedReason(event.target.value)}
                placeholder="Ex.: não é possível calcular o orçamento sem as medidas finais."
                data-testid="return-qualified-reason"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Quais informações estão faltando? *</label>
              <textarea
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
                rows={4}
                value={returnQualifiedMissing}
                onChange={(event) => setReturnQualifiedMissing(event.target.value)}
                placeholder="Liste exatamente os dados que precisam ser obtidos antes de retornar ao Orçamento."
                data-testid="return-qualified-missing"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Responsável pela tarefa *</label>
                <Select value={returnQualifiedResponsibleId} onValueChange={setReturnQualifiedResponsibleId}>
                  <SelectTrigger data-testid="return-qualified-responsible">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {qualifiedResponsibleUsers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.name || u.email || u.id}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Prazo *</label>
                <Input
                  type="date"
                  value={returnQualifiedDueDate}
                  onChange={(event) => setReturnQualifiedDueDate(event.target.value)}
                  data-testid="return-qualified-due-date"
                />
              </div>
            </div>
            <div className="rounded-md border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
              Enquanto esta tarefa estiver pendente, o negócio não poderá avançar novamente de Qualificado para Orçamento.
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={returningToQualified}
                onClick={() => setReturnQualifiedDialog({ open: false, deal: null })}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={
                  returningToQualified ||
                  returnQualifiedReason.trim().length < 3 ||
                  returnQualifiedMissing.trim().length < 3 ||
                  !returnQualifiedResponsibleId ||
                  !returnQualifiedDueDate
                }
                onClick={() => void confirmReturnToQualified()}
                data-testid="confirm-return-qualified"
              >
                {returningToQualified ? "Devolvendo..." : "Voltar e criar tarefa"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Retirar da pipeline / enviar para Aquecimento / Não Lead ─────── */}
      <Dialog
        open={removeDialog.open}
        onOpenChange={(open) => {
          if (!open && !removingFromPipeline) setRemoveDialog({ open: false, deal: null });
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Retirar da pipeline</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            O negócio sai do Kanban, mas o contato e todo o histórico permanecem salvos em Aquecimento / Não Lead.
          </p>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Motivo / tipo do contato</label>
              <Select value={removeReason} onValueChange={(value) => setRemoveReason(value as typeof removeReason)}>
                <SelectTrigger data-testid="remove-pipeline-reason">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="colaborador">Colaborador</SelectItem>
                  <SelectItem value="fornecedor">Fornecedor</SelectItem>
                  <SelectItem value="parceiro">Parceiro</SelectItem>
                  <SelectItem value="familiar">Familiar</SelectItem>
                  <SelectItem value="amigo">Amigo</SelectItem>
                  <SelectItem value="outro">Não é lead / Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Observação</label>
              <textarea
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
                rows={3}
                value={removeNotes}
                onChange={(event) => setRemoveNotes(event.target.value)}
                placeholder="Ex.: contato sem intenção comercial neste momento."
                data-testid="remove-pipeline-notes"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={removingFromPipeline}
                onClick={() => setRemoveDialog({ open: false, deal: null })}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={removingFromPipeline}
                onClick={confirmRemoveFromPipeline}
                data-testid="confirm-remove-pipeline"
              >
                {removingFromPipeline ? "Retirando..." : "Retirar da pipeline"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Pra quem vai o negócio (sempre pergunta ao mover o card) ──────── */}
      <Dialog
        open={assignDialog.open}
        onOpenChange={(open) => {
          if (!open) setAssignDialog({ open: false, deal: null, updateData: null, onGanho: false });
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Pra quem vai esse negócio?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {assignDialog.deal?.titulo} — o prazo de resposta reinicia a partir de agora pra quem for escolhido.
          </p>
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {assignResponsibleUsers.some((candidate) => candidate.id === user?.id) && (
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start"
                onClick={() => confirmarAtribuicao(user?.id ?? "")}
              >
                Comigo mesmo
              </Button>
            )}
            {assignResponsibleUsers
              .filter((u) => u.id !== user?.id)
              .map((u) => (
                <Button
                  key={u.id}
                  type="button"
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => confirmarAtribuicao(u.id)}
                >
                  {u.name || u.email || u.id}
                </Button>
              ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Agendar Reunião (ação rápida da pipeline) ─────────────────────── */}
      {agendarDeal ? (
        <Suspense fallback={null}>
          <AgendarReuniaoModal
            open={true}
            onClose={() => setAgendarDeal(null)}
            tenantId={tenantId}
            dealId={agendarDeal.id}
            leadId={agendarDeal.leadId ?? ""}
            leadNome={leadMap.get(agendarDeal.leadId ?? "") ?? "Lead"}
            leadEmail={leads.find((l) => l.id === agendarDeal.leadId)?.email ?? null}
            responsavelId={(agendarDeal as any).responsavelId ?? null}
          />
        </Suspense>
      ) : null}

    </div>
  );
}
