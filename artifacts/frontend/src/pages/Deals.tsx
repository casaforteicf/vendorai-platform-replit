import { useState, useCallback, useRef } from "react";
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
import { Plus, GripVertical, DollarSign, User, TrendingUp, Link2, Copy, CheckCheck, FileUp, Loader2, Sparkles } from "lucide-react";
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
  { value: "novo",        label: "Novo",        color: "text-slate-600",   bg: "bg-slate-100" },
  { value: "qualificado", label: "Qualificado", color: "text-blue-600",    bg: "bg-blue-100" },
  { value: "proposta",    label: "Proposta",    color: "text-violet-600",  bg: "bg-violet-100" },
  { value: "negociacao",  label: "Negociação",  color: "text-amber-600",   bg: "bg-amber-100" },
  { value: "ganho",       label: "Ganho",       color: "text-emerald-600", bg: "bg-emerald-100" },
  { value: "perdido",     label: "Perdido",     color: "text-red-600",     bg: "bg-red-100" },
];

function formatCurrency(value: string | null | undefined): string {
  if (!value) return "—";
  const num = parseFloat(value);
  if (isNaN(num)) return "—";
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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
              : "bg-slate-100 text-slate-600"
          }`}>
            {deal.tipoFechamento === "contrato" ? "Contrato" : "Pedido"}
          </span>
        </div>
      )}
    </div>
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
  tipoFechamento: z.enum(["pedido", "contrato"]).optional(),
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
          tipoFechamento: (deal.tipoFechamento as "pedido" | "contrato" | undefined) ?? tenantDefault ?? "pedido",
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

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editDeal, setEditDeal] = useState<Deal | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<DealEtapa | null>(null);
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

      // Optimistic update
      queryClient.setQueryData(
        getListDealsQueryKey(tenantId),
        (old: Deal[] | undefined) =>
          (old ?? []).map((d) =>
            d.id === draggedDeal.id ? { ...d, etapa: targetEtapa.value } : d
          )
      );

      updateDeal.mutate(
        { id: draggedDeal.id, data: { etapa: targetEtapa.value } },
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

  const dealsByEtapa = (etapa: DealEtapa) =>
    deals.filter((d) => d.etapa === etapa);

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
                        <Input data-testid="input-titulo" placeholder="Ex: Proposta Acme Corp" {...field} />
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

      {/* Kanban Board */}
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
                onCardClick={setEditDeal}
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

      {/* Edit Sheet */}
      <EditDealSheet
        deal={editDeal}
        leadMap={leadMap}
        open={!!editDeal}
        onClose={() => setEditDeal(null)}
        tenantDefault={tenantDefault}
        tenantSlug={tenantData?.slug}
      />
    </div>
  );
}
