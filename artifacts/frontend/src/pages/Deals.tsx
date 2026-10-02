import React, { lazy, Suspense, useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import {
  useListDeals,
  getListDealsQueryKey,
  useCreateDeal,
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
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { VisualIdentity } from "@/components/ui/visual-identity";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Plus, GripVertical, DollarSign, User, UserRound, TrendingUp, Link2, Copy, CheckCheck, FileUp, Loader2, Sparkles, BarChart3, RefreshCw, Users, Package, AlertTriangle, Paperclip, FileCheck, CreditCard, HandCoins, Flame, Cloud, Snowflake, FileText, Clock, CalendarDays, Pen, KanbanSquare, ArrowRight, UserMinus, Ruler } from "lucide-react";
import { PipelineNav } from "@/components/PipelineNav";
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

type PropostaSnap = {
  id: string;
  titulo: string;
  status: string;
  valorTotal?: string | null;
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
  leadVisual,
  briefing,
  proposta,
  assignedToName,
  onClick,
  onAgendar,
  onAdvance,
  onMove,
  onRemove,
  moveOptions = [],
  overlay = false,
  slaOverdue = false,
}: {
  deal: Deal;
  leadName: string | undefined;
  leadVisual?: Record<string, unknown>;
  briefing: LeadBriefing | undefined;
  proposta?: PropostaSnap;
  assignedToName?: string;
  onClick?: () => void;
  onAgendar?: () => void;
  onAdvance?: () => void;
  onMove?: (stage: string) => void;
  onRemove?: () => void;
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

      {/* Handle visual + title */}
      <div className="flex items-start gap-2">
        <GripVertical
          className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors"
          data-testid={`deal-drag-${deal.id}`}
        />
        <p className="text-sm font-medium leading-tight flex-1 line-clamp-2">
          {deal.titulo}
        </p>
      </div>

      {/* Valor */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground pl-6">
        <DollarSign className="h-3 w-3 shrink-0" />
        <span className="font-semibold text-foreground">{formatCurrency(deal.valor)}</span>
      </div>

      {/* Prazo */}
      {deadline && (
        <div className={`flex items-center gap-1.5 text-xs pl-6 ${isOverdue ? "text-yellow-700 font-semibold" : "text-muted-foreground"}`}>
          <Clock className="h-3 w-3 shrink-0" />
          <span>Prazo: {deadline.toLocaleDateString("pt-BR")}</span>
        </div>
      )}

      {/* Lead name */}
      {leadName && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground pl-6">
          <VisualIdentity source={leadVisual} label={leadName} size="xs" />
          <span className="truncate font-medium text-foreground/80">{leadName}</span>
        </div>
      )}

      {/* Responsável */}
      {assignedToName && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground pl-6">
          <UserRound className="h-3 w-3 shrink-0" />
          <span className="truncate">{assignedToName}</span>
        </div>
      )}

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
  leadVisualMap,
  briefingMap,
  propostaByDealId,
  propostaByLeadId,
  userMap,
  isOver,
  onCardClick,
  onAgendar,
  onAdvance,
  onMove,
  onRemove,
  getMoveOptions,
  stagesByKey,
}: {
  col: KanbanColumnDef;
  deals: Deal[];
  leadMap: Map<string, string>;
  leadVisualMap: Map<string, Record<string, unknown>>;
  briefingMap: Map<string, LeadBriefing>;
  propostaByDealId: Map<string, PropostaSnap>;
  propostaByLeadId: Map<string, PropostaSnap>;
  userMap: Map<string, string>;
  isOver: boolean;
  onCardClick: (deal: Deal) => void;
  onAgendar: (deal: Deal) => void;
  onAdvance: (deal: Deal) => void;
  onMove: (deal: Deal, stage: string) => void;
  onRemove: (deal: Deal) => void;
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
              leadVisual={deal.leadId ? leadVisualMap.get(deal.leadId) : undefined}
              briefing={deal.leadId ? briefingMap.get(deal.leadId) : undefined}
              proposta={proposta}
              assignedToName={deal.assignedTo ? userMap.get(deal.assignedTo) : undefined}
              onClick={() => onCardClick(deal)}
              onAgendar={() => onAgendar(deal)}
              onAdvance={() => onAdvance(deal)}
              onMove={(stage) => onMove(deal, stage)}
              onRemove={() => onRemove(deal)}
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