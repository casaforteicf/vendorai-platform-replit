import React, { useState, useCallback, useRef } from "react";
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
  Deal,
  DealEtapa,
  TipoFechamento,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
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
import { Plus, GripVertical, DollarSign, User, TrendingUp, Link2, Copy, CheckCheck, FileUp, Loader2, Sparkles, BarChart3, RefreshCw, Users, Package, AlertTriangle, Paperclip, FileCheck } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DealEtapaSaas,
} from "@workspace/api-client-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
} from "@dnd-kit/core";

// ─── Constants ───────────────────────────────────────────────────────────────

const ETAPAS: { value: DealEtapa; label: string; color: string; bg: string }[] = [
  { value: "em_aquecimento", label: "Em Aquecimento", color: "text-orange-600",  bg: "bg-orange-100" },
  { value: "novo",           label: "Novo",           color: "text-slate-600",   bg: "bg-slate-100" },
  { value: "qualificado",    label: "Qualificado",    color: "text-blue-600",    bg: "bg-blue-100" },
  { value: "proposta",       label: "Orçamento",      color: "text-violet-600",  bg: "bg-violet-100" },
  { value: "negociacao",     label: "Negociação",     color: "text-amber-600",   bg: "bg-amber-100" },
  { value: "ganho",          label: "Ganho",          color: "text-emerald-600", bg: "bg-emerald-100" },
  { value: "em_execucao",    label: "Em Execução",    color: "text-cyan-600",    bg: "bg-cyan-100" },
  { value: "entregue",       label: "Entregue",       color: "text-teal-600",    bg: "bg-teal-100" },
  { value: "perdido",        label: "Perdido",        color: "text-red-600",     bg: "bg-red-100" },
];

const ETAPA_PROBABILIDADE: Record<DealEtapa, number> = {
  em_aquecimento: 5,
  novo:           10,
  qualificado:    25,
  proposta:       50,
  negociacao:     75,
  ganho:          100,
  em_execucao:    100,
  entregue:       100,
  perdido:        0,
};

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
  { value: "preco_alto",       label: "Preço alto" },
  { value: "concorrente",      label: "Concorrente" },
  { value: "sem_orcamento",    label: "Sem orçamento" },
  { value: "nao_momento",      label: "Não é o momento" },
  { value: "perda_contato",    label: "Perda de contato" },
  { value: "outro",            label: "Outro" },
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
          {lostReason === "outro" && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Detalhe <span className="text-red-500">*</span>
              </label>
              <textarea
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                rows={3}
                placeholder="Descreva o motivo específico..."
                value={lostReasonDetail}
                onChange={(e) => setLostReasonDetail(e.target.value)}
                required={lostReason === "outro"}
                data-testid="textarea-lost-detail"
              />
            </div>
          )}
          <div className="flex gap-2 justify-end pt-1">
            <Button type="button" variant="outline" size="sm" onClick={handleCancel}>
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleConfirm}
              disabled={!lostReason || (lostReason === "outro" && !lostReasonDetail.trim())}
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

function DealCard({
  deal,
  leadName,
  onClick,
  overlay = false,
}: {
  deal: Deal;
  leadName: string | undefined;
  onClick?: () => void;
  overlay?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: deal.id,
    data: { deal },
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{ opacity: isDragging && !overlay ? 0.4 : 1, touchAction: "none" }}
      className={`group bg-card border border-border rounded-lg p-3 space-y-2 ${
        overlay
          ? "shadow-2xl rotate-1 cursor-grabbing"
          : "cursor-grab active:cursor-grabbing hover:border-primary/40 hover:shadow-sm transition-all"
      }`}
      onClick={onClick}
      data-testid={`deal-card-${deal.id}`}
    >
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

      {/* Lead name */}
      {leadName && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground pl-6">
          <User className="h-3 w-3 shrink-0" />
          <span className="truncate">{leadName}</span>
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

      {/* Status de fechamento (contrato + onboarding) */}
      {deal.etapa === "ganho" && (deal.contractStatus || deal.onboardingStatus) && (
        <div className="pl-6 flex flex-wrap gap-1.5">
          <ClosureStatusBadge status={deal.contractStatus} error={deal.contractError} label="Contrato" />
          <ClosureStatusBadge status={deal.onboardingStatus} error={deal.onboardingError} label="Onboarding" />
        </div>
      )}
    </div>
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
  etapa,
  deals,
  leadMap,
  isOver,
  onCardClick,
}: {
  etapa: (typeof ETAPAS)[number];
  deals: Deal[];
  leadMap: Map<string, string>;
  isOver: boolean;
  onCardClick: (deal: Deal) => void;
}) {
  const { setNodeRef } = useDroppable({ id: etapa.value });

  const total = deals.reduce((acc, d) => {
    const v = parseFloat(d.valor ?? "0");
    return acc + (isNaN(v) ? 0 : v);
  }, 0);

  return (
    <div className="flex flex-col w-72 shrink-0">
      {/* Column header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-2 w-2 rounded-full ${etapa.bg.replace("bg-", "bg-")} border ${etapa.color.replace("text-", "border-")}`}
            style={{ background: "currentColor" }}
          />
          <span className={`text-xs font-semibold uppercase tracking-wide ${etapa.color}`}>
            {etapa.label}
          </span>
          <span className="text-xs text-muted-foreground bg-muted rounded-full px-1.5 py-0.5 font-medium">
            {deals.length}
          </span>
        </div>
        {total > 0 && (
          <span className="text-xs text-muted-foreground font-mono">
            {total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          </span>
        )}
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={`flex-1 min-h-[400px] rounded-lg p-2 space-y-2 transition-colors ${
          isOver
            ? "bg-primary/5 border-2 border-dashed border-primary/30"
            : "bg-muted/30 border-2 border-transparent"
        }`}
        data-testid={`column-${etapa.value}`}
      >
        {deals.map((deal) => (
          <DealCard
            key={deal.id}
            deal={deal}
            leadName={deal.leadId ? leadMap.get(deal.leadId) : undefined}
            onClick={() => onCardClick(deal)}
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

// ─── SaaS Deal Card ───────────────────────────────────────────────────────────

function SaasDealCard({
  deal,
  leadName,
  onClick,
  overlay = false,
}: {
  deal: Deal;
  leadName: string | undefined;
  onClick?: () => void;
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
      style={{ opacity: isDragging && !overlay ? 0.4 : 1, touchAction: "none" }}
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

      {/* Stage badge */}
      {etapaCfg && (
        <div className="pl-6">
          <span className={`inline-block text-[10px] font-medium rounded-full px-2 py-0.5 ${etapaCfg.bg} ${etapaCfg.color}`}>
            {etapaCfg.label}
          </span>
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
  isOver,
  onCardClick,
}: {
  etapa: (typeof ETAPAS_SAAS)[number];
  deals: Deal[];
  leadMap: Map<string, string>;
  isOver: boolean;
  onCardClick: (deal: Deal) => void;
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
            onClick={() => onCardClick(deal)}
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
  const { user } = useAuth();
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
      <SheetContent className="w-[420px] overflow-y-auto">
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
  etapa: z.string().min(1, "Etapa obrigatória"),
  probabilidade: z.coerce.number().min(0).max(100).optional(),
  tipoFechamento: z.enum(["pedido", "contrato", "pedido_e_contrato"]).optional(),
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
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
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
        }
      : { titulo: "", etapa: "novo", tipoFechamento: tenantDefault ?? "pedido" },
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
          ...(quoteFileUrl !== deal.quoteFileUrl ? { quoteFileUrl } : {}),
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
              toast({ title: "WhatsApp não enviado — Z-API não configurada.", variant: "destructive" });
            } else if ((data as any).whatsappSkipReason === "send_error") {
              toast({ title: "WhatsApp não enviado — erro ao contatar Z-API.", description: "Verifique a conexão em Configurações → WhatsApp.", variant: "destructive" });
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
      <SheetContent className="w-[400px]">
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

        {/* ── Quote attachment ──────────────────────────────────── */}
        {quoteFileUrl && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-1.5">
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
      </SheetContent>
    </Sheet>
  );
}

// ─── Main Board ───────────────────────────────────────────────────────────────

export default function Deals() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [, navigate] = useLocation();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<DealEtapa | null>(null);
  const [perdidoDialog, setPerdidoDialog] = useState<{ open: boolean; deal: Deal | null; novaProb: number }>({
    open: false,
    deal: null,
    novaProb: 0,
  });
  // SaaS pipeline state
  const [saasActiveId, setSaasActiveId] = useState<string | null>(null);
  const [saasOverColumn, setSaasOverColumn] = useState<DealEtapaSaas | null>(null);
  const [isCreateSaasOpen, setIsCreateSaasOpen] = useState(false);
  const [createExtracting, setCreateExtracting] = useState(false);
  const [createExtractedInfo, setCreateExtractedInfo] = useState<{
    itens?: Array<{ descricao: string; quantidade?: number | null; valorUnitario?: number | null; valorTotal?: number | null }>;
    fornecedor?: string | null;
    cliente?: string | null;
    observacoes?: string | null;
  } | null>(null);
  const createQuoteFileRef = useRef<HTMLInputElement>(null);

  const { data: deals = [], isLoading } = useListDeals(tenantId, undefined, {
    query: {
      enabled: !!tenantId,
      queryKey: getListDealsQueryKey(tenantId),
    },
  });

  const { data: leads = [] } = useListTenantLeads(tenantId, {
    query: {
      enabled: !!tenantId,
      queryKey: getListTenantLeadsQueryKey(tenantId),
    },
  });

  const { data: tenantData } = useGetTenant(tenantId, {
    query: { enabled: !!tenantId, queryKey: getGetTenantQueryKey(tenantId) },
  });
  const rawTenantDefault = (tenantData?.tipoFechamentoDefault as TipoFechamento | null | undefined) ?? null;
  const tenantDefault: "pedido" | "contrato" | null =
    rawTenantDefault === "pedido_e_contrato" ? null : rawTenantDefault;

  const leadMap = new Map(leads.map((l) => [l.id, l.nome]));

  const { data: propostas = [] } = useListPropostas(tenantId, undefined, {
    query: { enabled: !!tenantId, queryKey: getListPropostasQueryKey(tenantId) },
  });

  const dealToPropostaId = new Map(
    propostas.filter((p) => p.dealId).map((p) => [p.dealId!, p.id])
  );

  function handleCardClick(deal: Deal) {
    // 1️⃣ Match explícito por dealId
    const byDeal = dealToPropostaId.get(deal.id);
    if (byDeal) {
      navigate(`/propostas/${byDeal}`);
      return;
    }

    // 2️⃣ Fallback: proposta mais recente do mesmo lead
    if (deal.leadId) {
      const byLead = propostas
        .filter((p) => p.leadId === deal.leadId)
        .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());
      if (byLead.length > 0) {
        navigate(`/propostas/${byLead[0].id}`);
        return;
      }
    }

    toast({
      title: "Nenhum orçamento vinculado.",
      description: "Crie um orçamento em Orçamentos para este lead.",
    });
  }

  const updateDeal = useUpdateDeal();

  const createDeal = useCreateDeal();

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
      if (!res.ok) throw new Error("Falha");
      const data = await res.json();
      if (data.valorTotal != null) createForm.setValue("valor", data.valorTotal);
      if (data.titulo) {
        const current = createForm.getValues("titulo");
        if (!current || current.trim() === "") createForm.setValue("titulo", data.titulo);
      }
      if (data.itens?.length || data.fornecedor || data.cliente || data.observacoes) {
        setCreateExtractedInfo({ itens: data.itens, fornecedor: data.fornecedor, cliente: data.cliente, observacoes: data.observacoes });
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
    defaultValues: { titulo: "", valor: undefined, leadId: "", etapa: "novo", probabilidade: undefined, tipoFechamento: tenantDefault ?? "pedido" },
  });

  function onCreateSubmit(values: z.infer<typeof createSchema>) {
    createDeal.mutate(
      {
        data: {
          tenantId,
          titulo: values.titulo,
          valor: values.valor,
          etapa: values.etapa as DealEtapa,
          leadId: values.leadId || undefined,
          probabilidade: values.probabilidade,
          tipoFechamento: values.tipoFechamento as TipoFechamento | undefined,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Negócio criado." });
          queryClient.invalidateQueries({ queryKey: getListDealsQueryKey(tenantId) });
          setIsCreateOpen(false);
          createForm.reset();
        },
        onError: () => {
          toast({ title: "Erro ao criar negócio", variant: "destructive" });
        },
      }
    );
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const activeDeal = activeId ? deals.find((d) => d.id === activeId) ?? null : null;

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const overId = event.over?.id as string | undefined;
    const col = ETAPAS.find((e) => e.value === overId);
    setOverColumn(col ? col.value : null);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);
      setOverColumn(null);

      if (!over) return;

      const draggedDeal = deals.find((d) => d.id === active.id);
      const targetEtapa = ETAPAS.find((e) => e.value === over.id);

      if (!draggedDeal || !targetEtapa) return;
      if (draggedDeal.etapa === targetEtapa.value) return;

      const novaProb = ETAPA_PROBABILIDADE[targetEtapa.value];

      // Interceptar movimento para "perdido" — exibir modal antes de confirmar
      if (targetEtapa.value === "perdido") {
        // Optimistic update visual (card aparece na coluna)
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

      // Optimistic update
      queryClient.setQueryData(
        getListDealsQueryKey(tenantId),
        (old: Deal[] | undefined) =>
          (old ?? []).map((d) =>
            d.id === draggedDeal.id ? { ...d, etapa: targetEtapa.value, probabilidade: novaProb } : d
          )
      );

      updateDeal.mutate(
        { id: draggedDeal.id, data: { etapa: targetEtapa.value, probabilidade: novaProb, tipoFechamento: draggedDeal.tipoFechamento ?? undefined } },
        {
          onSuccess: (data) => {
            if (targetEtapa.value === "ganho") {
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
                toast({ title: "WhatsApp não enviado — Z-API não configurada.", variant: "destructive" });
              } else if ((data as any).whatsappSkipReason === "send_error") {
                toast({ title: "WhatsApp não enviado — erro ao contatar Z-API.", description: "Verifique a conexão em Configurações → WhatsApp.", variant: "destructive" });
              }
            }
          },
          onError: () => {
            toast({ title: "Erro ao mover negócio", variant: "destructive" });
            queryClient.invalidateQueries({ queryKey: getListDealsQueryKey(tenantId) });
          },
        }
      );
    },
    [deals, queryClient, tenantId, updateDeal, toast]
  );

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

  const dealsByEtapa = (etapa: DealEtapa) =>
    deals.filter((d) => d.etapa === etapa);

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
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  return (
    <div className="flex flex-col h-full space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center shrink-0 gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Negócios</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {deals.length} negócios no pipeline
          </p>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-novo-negocio">
              <Plus className="h-4 w-4 mr-2" />
              Novo Negócio
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar Novo Negócio</DialogTitle>
            </DialogHeader>
            <Form {...createForm}>
              <form onSubmit={createForm.handleSubmit(onCreateSubmit)} className="space-y-4">

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
                <FormField
                  control={createForm.control}
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
                <FormField
                  control={createForm.control}
                  name="leadId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Lead associado</FormLabel>
                      {leads.length > 0 ? (
                        <Select
                          onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)}
                          value={field.value || "__none__"}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-lead">
                              <SelectValue placeholder="Selecionar lead..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="__none__">Nenhum</SelectItem>
                            {leads.map((l) => (
                              <SelectItem key={l.id} value={l.id}>
                                {l.nome}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <FormControl>
                          <Input data-testid="input-leadId" placeholder="ID do lead" {...field} />
                        </FormControl>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createForm.control}
                  name="tipoFechamento"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo de fechamento</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-tipo-fechamento">
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

      {/* ── Pipeline Clássico ─────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex flex-col">
        {isLoading ? (
          <div className="flex gap-4 overflow-x-auto pb-4">
            {ETAPAS.map((e) => (
              <div key={e.value} className="w-72 shrink-0 space-y-2">
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
            <div className="flex gap-4 overflow-x-auto pb-6 flex-1">
              {ETAPAS.map((etapa) => (
                <KanbanColumn
                  key={etapa.value}
                  etapa={etapa}
                  deals={dealsByEtapa(etapa.value)}
                  leadMap={leadMap}
                  isOver={overColumn === etapa.value}
                  onCardClick={handleCardClick}
                />
              ))}
            </div>
            <DragOverlay dropAnimation={null}>
              {activeDeal ? (
                <DealCard
                  deal={activeDeal}
                  leadName={activeDeal.leadId ? leadMap.get(activeDeal.leadId) : undefined}
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

    </div>
  );
}
