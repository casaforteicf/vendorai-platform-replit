import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getSegmentHints } from "@/lib/segmentHints";
import {
  useListCampaigns,
  getListCampaignsQueryKey,
  useCreateCampaign,
  useUpdateCampaign,
  useDeleteCampaign,
  usePreviewCampaignAudience,
} from "@workspace/api-client-react";
import type { Campaign, CampaignStatus } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Pause,
  Play,
  Trash2,
  Users,
  Send,
  Loader2,
  Megaphone,
  ArrowLeft,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<
  string,
  { label: string; className: string }
> = {
  rascunho:  { label: "Rascunho",  className: "bg-zinc-100 text-zinc-600 border-zinc-200" },
  agendada:  { label: "Agendada",  className: "bg-blue-100 text-blue-700 border-blue-200" },
  enviando:  { label: "Enviando",  className: "bg-amber-100 text-amber-700 border-amber-200" },
  concluida: { label: "Concluída", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  pausada:   { label: "Pausada",   className: "bg-orange-100 text-orange-700 border-orange-200" },
};

const TIPO_CONFIG: Record<string, { label: string; className: string }> = {
  whatsapp:  { label: "WhatsApp",  className: "bg-green-100 text-green-700 border-green-200" },
  email:     { label: "E-mail",    className: "bg-blue-100 text-blue-700 border-blue-200" },
  instagram: { label: "Instagram", className: "bg-purple-100 text-purple-700 border-purple-200" },
};

// ── Form schema ───────────────────────────────────────────────────────────────
const formSchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório"),
  tipo: z.enum(["whatsapp", "email", "instagram"]),
  mensagem: z.string().min(1, "Mensagem é obrigatória"),
  churnRiskMin: z.coerce
    .number()
    .min(0)
    .max(100)
    .optional()
    .or(z.literal(undefined)),
  journeyStage: z.string().optional(),
  agendadaPara: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return format(new Date(iso), "dd/MM/yy HH:mm", { locale: ptBR });
  } catch {
    return "—";
  }
}

function buildSegmentoFiltro(values: FormValues) {
  const filtro: Record<string, unknown> = {};
  if (values.churnRiskMin !== undefined) {
    filtro.churnRisk = { gte: values.churnRiskMin };
  }
  if (values.journeyStage) filtro.journeyStage = values.journeyStage;
  return Object.keys(filtro).length > 0 ? filtro : undefined;
}

// ── Campaign modal ────────────────────────────────────────────────────────────
interface CampaignModalProps {
  open: boolean;
  onClose: () => void;
  tenantId: string;
  editingCampaign: Campaign | null;
  nomePlaceholder: string;
  mensagemPlaceholder: string;
}

function CampaignModal({
  open,
  onClose,
  tenantId,
  editingCampaign,
  nomePlaceholder,
  mensagemPlaceholder,
}: CampaignModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEdit = !!editingCampaign;

  // "form" → filling | "preview" → showing audience after create-as-rascunho
  const [step, setStep] = useState<"form" | "preview">("form");
  const [previewCampaignId, setPreviewCampaignId] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nome: editingCampaign?.nome ?? "",
      tipo: editingCampaign?.tipo ?? "whatsapp",
      mensagem: editingCampaign?.mensagem ?? "",
      churnRiskMin:
        typeof editingCampaign?.segmentoFiltro?.churnRisk === "object" &&
        editingCampaign.segmentoFiltro?.churnRisk !== null &&
        "gte" in (editingCampaign.segmentoFiltro?.churnRisk as object)
          ? (editingCampaign.segmentoFiltro?.churnRisk as { gte?: number }).gte
          : undefined,
      journeyStage: editingCampaign?.segmentoFiltro?.journeyStage ?? "",
      agendadaPara: editingCampaign?.agendadaPara
        ? editingCampaign.agendadaPara.slice(0, 16)
        : "",
    },
  });

  const createMutation = useCreateCampaign();
  const updateMutation = useUpdateCampaign();
  const deleteMutation = useDeleteCampaign();

  const { data: previewData, isLoading: previewLoading } =
    usePreviewCampaignAudience(tenantId, previewCampaignId!, {
      query: {
        queryKey: ["previewCampaignAudience", tenantId, previewCampaignId],
        enabled: !!previewCampaignId,
      },
    });

  function invalidateAndClose() {
    queryClient.invalidateQueries({
      queryKey: getListCampaignsQueryKey(tenantId),
    });
    handleClose();
  }

  function handleClose() {
    setStep("form");
    setPreviewCampaignId(null);
    form.reset();
    onClose();
  }

  // ── Editar: save directly ─────────────────────────────────────────────────
  function onSubmitEdit(values: FormValues) {
    if (!editingCampaign) return;
    updateMutation.mutate(
      {
        id: editingCampaign.id,
        data: {
          nome: values.nome,
          tipo: values.tipo,
          mensagem: values.mensagem,
          segmentoFiltro: buildSegmentoFiltro(values) as any,
          agendadaPara: values.agendadaPara || undefined,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Campanha atualizada com sucesso" });
          invalidateAndClose();
        },
        onError: () => toast({ title: "Erro ao atualizar campanha", variant: "destructive" }),
      }
    );
  }

  // ── Nova: create as rascunho, fetch preview ───────────────────────────────
  function onVerificarAudiencia(values: FormValues) {
    createMutation.mutate(
      {
        data: {
          tenantId,
          nome: values.nome,
          tipo: values.tipo,
          mensagem: values.mensagem,
          segmentoFiltro: buildSegmentoFiltro(values) as any,
          agendadaPara: values.agendadaPara || undefined,
          status: "rascunho",
        },
      },
      {
        onSuccess: (campaign) => {
          setPreviewCampaignId(campaign.id);
          setStep("preview");
        },
        onError: () =>
          toast({ title: "Erro ao salvar campanha", variant: "destructive" }),
      }
    );
  }

  // ── Preview: confirm (already saved) ─────────────────────────────────────
  function onConfirmar() {
    toast({ title: "Campanha criada com sucesso" });
    invalidateAndClose();
  }

  // ── Preview: go back to form (delete the rascunho) ───────────────────────
  function onVoltarParaForm() {
    if (previewCampaignId) {
      deleteMutation.mutate({ id: previewCampaignId });
    }
    setPreviewCampaignId(null);
    setStep("form");
  }

  // ── Preview: discard completely ───────────────────────────────────────────
  function onDescartar() {
    if (previewCampaignId) {
      deleteMutation.mutate({ id: previewCampaignId });
    }
    handleClose();
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && (step === "preview" ? onDescartar() : handleClose())}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? "Editar Campanha"
              : step === "preview"
              ? "Prévia de Audiência"
              : "Nova Campanha"}
          </DialogTitle>
        </DialogHeader>

        {/* ── STEP: preview ─────────────────────────────────────────────── */}
        {step === "preview" && (
          <div className="space-y-5">
            {previewLoading ? (
              <div className="flex flex-col items-center gap-3 py-10 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm">Calculando audiência…</p>
              </div>
            ) : (
              <>
                <Card className="border-primary/30 bg-primary/5">
                  <CardContent className="pt-5 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Users className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-foreground">
                          {previewData?.count ?? 0}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          leads serão atingidos por esta campanha
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {previewData && previewData.sample.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                      Amostra ({previewData.sample.length})
                    </p>
                    <div className="rounded-md border overflow-hidden text-sm">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs py-2">Lead</TableHead>
                            <TableHead className="text-xs py-2">Churn</TableHead>
                            <TableHead className="text-xs py-2">Estágio</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {previewData.sample.map((s) => (
                            <TableRow key={s.id ?? s.leadId}>
                              <TableCell className="py-1.5 font-mono text-xs text-muted-foreground">
                                {(s.leadId ?? "").slice(0, 8)}…
                              </TableCell>
                              <TableCell className="py-1.5">
                                {s.churnRisk != null ? (
                                  <span
                                    className={
                                      s.churnRisk > 70
                                        ? "text-red-600 font-medium"
                                        : s.churnRisk >= 30
                                        ? "text-amber-600 font-medium"
                                        : "text-emerald-600"
                                    }
                                  >
                                    {s.churnRisk}%
                                  </span>
                                ) : (
                                  "—"
                                )}
                              </TableCell>
                              <TableCell className="py-1.5 text-muted-foreground">
                                {s.journeyStage ?? "—"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {previewData?.count === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nenhum lead corresponde aos filtros definidos.
                  </p>
                )}
              </>
            )}

            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={onVoltarParaForm}
                disabled={deleteMutation.isPending}
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Voltar
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={onDescartar}
                disabled={deleteMutation.isPending}
              >
                Descartar
              </Button>
              <Button
                size="sm"
                className="ml-auto"
                onClick={onConfirmar}
                disabled={previewLoading}
              >
                <Send className="h-4 w-4 mr-1.5" />
                Confirmar Campanha
              </Button>
            </div>
          </div>
        )}

        {/* ── STEP: form ────────────────────────────────────────────────── */}
        {step === "form" && (
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(isEdit ? onSubmitEdit : onVerificarAudiencia)}
              className="space-y-4"
            >
              <FormField
                control={form.control}
                name="nome"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome da Campanha</FormLabel>
                    <FormControl>
                      <Input placeholder={nomePlaceholder} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="tipo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Canal</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o canal" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="whatsapp">WhatsApp</SelectItem>
                        <SelectItem value="email">E-mail</SelectItem>
                        <SelectItem value="instagram">Instagram</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="mensagem"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mensagem</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder={mensagemPlaceholder}
                        className="resize-none"
                        rows={4}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Segmento */}
              {(() => {
                const churnVal   = form.watch("churnRiskMin");
                const stageVal   = form.watch("journeyStage");
                const activeCount = (churnVal !== undefined ? 1 : 0) + (stageVal ? 1 : 0);

                const CHURN_PRESETS = [
                  { label: "Todos os leads",  value: undefined,   className: "bg-muted text-foreground border-border" },
                  { label: "Risco ≥ 40%",     value: 40,          className: "bg-amber-50 text-amber-700 border-amber-300" },
                  { label: "Risco ≥ 60%",     value: 60,          className: "bg-orange-50 text-orange-700 border-orange-300" },
                  { label: "Crítico ≥ 80%",   value: 80,          className: "bg-red-50 text-red-700 border-red-300" },
                ] as const;

                const STAGES = [
                  { label: "Qualquer estágio", value: "" },
                  { label: "Novo",             value: "novo" },
                  { label: "Onboarding",       value: "onboarding" },
                  { label: "Ativo",            value: "ativo" },
                  { label: "Em risco",         value: "em risco" },
                  { label: "Inativo",          value: "inativo" },
                  { label: "Reativação",       value: "reativação" },
                ];

                return (
                  <div className="rounded-lg border p-4 space-y-4 bg-muted/20">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm font-medium">Segmento de Audiência</span>
                        {activeCount > 0 && (
                          <span className="text-xs bg-primary text-primary-foreground rounded-full px-1.5 py-0 leading-5 font-medium">
                            {activeCount}
                          </span>
                        )}
                      </div>
                      {activeCount > 0 && (
                        <button
                          type="button"
                          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                          onClick={() => {
                            form.setValue("churnRiskMin", undefined);
                            form.setValue("journeyStage", "");
                          }}
                        >
                          <X className="h-3 w-3" />
                          Limpar filtros
                        </button>
                      )}
                    </div>

                    {/* Churn Risk chips */}
                    <FormField
                      control={form.control}
                      name="churnRiskMin"
                      render={({ field }) => (
                        <FormItem className="space-y-1.5">
                          <FormLabel className="text-xs text-muted-foreground">
                            Risco de Churn
                          </FormLabel>
                          <div className="flex flex-wrap gap-2">
                            {CHURN_PRESETS.map((preset) => {
                              const isActive = field.value === preset.value;
                              return (
                                <button
                                  key={preset.label}
                                  type="button"
                                  onClick={() => field.onChange(preset.value)}
                                  className={[
                                    "px-3 py-1 rounded-full text-xs font-medium border transition-all",
                                    isActive
                                      ? preset.className + " ring-2 ring-offset-1 ring-primary/40 shadow-sm"
                                      : "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground",
                                  ].join(" ")}
                                >
                                  {preset.label}
                                </button>
                              );
                            })}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Journey Stage select */}
                    <FormField
                      control={form.control}
                      name="journeyStage"
                      render={({ field }) => (
                        <FormItem className="space-y-1.5">
                          <FormLabel className="text-xs text-muted-foreground">
                            Estágio da Jornada
                          </FormLabel>
                          <div className="flex flex-wrap gap-2">
                            {STAGES.map((stage) => {
                              const isActive = (field.value ?? "") === stage.value;
                              return (
                                <button
                                  key={stage.value || "__any__"}
                                  type="button"
                                  onClick={() => field.onChange(stage.value)}
                                  className={[
                                    "px-3 py-1 rounded-full text-xs font-medium border transition-all",
                                    isActive
                                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                                      : "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground",
                                  ].join(" ")}
                                >
                                  {stage.label}
                                </button>
                              );
                            })}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Active filter summary */}
                    {activeCount > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1 border-t">
                        {churnVal !== undefined && (
                          <span className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary rounded px-2 py-0.5">
                            Churn ≥ {churnVal}%
                            <button type="button" onClick={() => form.setValue("churnRiskMin", undefined)}>
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </span>
                        )}
                        {stageVal && (
                          <span className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary rounded px-2 py-0.5">
                            Estágio: {stageVal}
                            <button type="button" onClick={() => form.setValue("journeyStage", "")}>
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              <FormField
                control={form.control}
                name="agendadaPara"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Agendar envio{" "}
                      <span className="text-muted-foreground font-normal text-xs">
                        (opcional)
                      </span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="datetime-local"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button type="submit" className="flex-1" disabled={isSaving}>
                  {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {isEdit ? "Salvar Alterações" : "Verificar Audiência"}
                </Button>
              </div>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Campanhas() {
  const { user } = useAuth();
  const hints = getSegmentHints(user?.tenantVertical);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const tenantId = user?.tenantId ?? "";

  const [modalOpen, setModalOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Campaign | null>(null);

  const { data: campaigns = [], isLoading } = useListCampaigns(tenantId, {
    query: {
      queryKey: getListCampaignsQueryKey(tenantId),
      enabled: !!tenantId,
    },
  });

  const updateMutation = useUpdateCampaign();
  const deleteMutation = useDeleteCampaign();

  function openNew() {
    setEditingCampaign(null);
    setModalOpen(true);
  }

  function openEdit(c: Campaign) {
    setEditingCampaign(c);
    setModalOpen(true);
  }

  function handlePauseResume(c: Campaign) {
    const canPause = c.status === "agendada" || c.status === "enviando";
    const newStatus: CampaignStatus = canPause ? "pausada" : "agendada";
    updateMutation.mutate(
      { id: c.id, data: { status: newStatus } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCampaignsQueryKey(tenantId) });
          toast({ title: canPause ? "Campanha pausada" : "Campanha retomada" });
        },
        onError: () => toast({ title: "Erro ao atualizar campanha", variant: "destructive" }),
      }
    );
  }

  function handleDelete() {
    if (!deleteTarget) return;
    deleteMutation.mutate(
      { id: deleteTarget.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCampaignsQueryKey(tenantId) });
          toast({ title: "Campanha excluída" });
          setDeleteTarget(null);
        },
        onError: () => toast({ title: "Erro ao excluir campanha", variant: "destructive" }),
      }
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Campanhas</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Crie e gerencie campanhas de marketing multicanal
          </p>
        </div>
        <Button onClick={openNew} className="min-h-[44px] sm:w-auto">
          <Plus className="h-4 w-4 mr-2" />
          Nova Campanha
        </Button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {(
          [
            { key: "rascunho",  label: "Rascunhos" },
            { key: "agendada",  label: "Agendadas" },
            { key: "enviando",  label: "Em envio" },
            { key: "concluida", label: "Concluídas" },
          ] as const
        ).map(({ key, label }) => (
          <Card key={key}>
            <CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
              <p className="text-2xl font-bold mt-0.5">
                {campaigns.filter((c) => c.status === key).length}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              Carregando campanhas…
            </div>
          ) : campaigns.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
              <Megaphone className="h-10 w-10 opacity-25" />
              <p className="text-sm">Nenhuma campanha criada ainda</p>
              <Button variant="outline" size="sm" onClick={openNew}>
                <Plus className="h-4 w-4 mr-1.5" />
                Criar primeira campanha
              </Button>
            </div>
          ) : (
            <>
            {/* Mobile card list */}
            <div className="md:hidden divide-y">
              {campaigns.map((c) => {
                const statusCfg = STATUS_CONFIG[c.status] ?? STATUS_CONFIG.rascunho;
                const tipoCfg = TIPO_CONFIG[c.tipo] ?? TIPO_CONFIG.whatsapp;
                const canPause = c.status === "agendada" || c.status === "enviando";
                const canResume = c.status === "pausada";
                const canDelete = c.status === "rascunho";
                return (
                  <div key={c.id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-sm leading-tight flex-1">{c.nome}</p>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(c)}>
                            <Pencil className="h-4 w-4 mr-2" />Editar
                          </DropdownMenuItem>
                          {(canPause || canResume) && (
                            <DropdownMenuItem onClick={() => handlePauseResume(c)}>
                              {canPause ? <><Pause className="h-4 w-4 mr-2" />Pausar</> : <><Play className="h-4 w-4 mr-2" />Retomar</>}
                            </DropdownMenuItem>
                          )}
                          {canDelete && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteTarget(c)}>
                                <Trash2 className="h-4 w-4 mr-2" />Excluir
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={`text-xs ${tipoCfg.className}`}>{tipoCfg.label}</Badge>
                      <Badge variant="outline" className={`text-xs ${statusCfg.className}`}>{statusCfg.label}</Badge>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>{c.totalDestinatarios.toLocaleString("pt-BR")} destinatários</span>
                      <span>{c.totalEnviados.toLocaleString("pt-BR")} enviados</span>
                    </div>
                    {c.agendadaPara && (
                      <p className="text-xs text-muted-foreground">{fmtDate(c.agendadaPara)}</p>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Desktop table */}
            <Table className="hidden md:table">
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Destinatários</TableHead>
                  <TableHead className="text-right">Enviados</TableHead>
                  <TableHead>Agendada para</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((c) => {
                  const statusCfg = STATUS_CONFIG[c.status] ?? STATUS_CONFIG.rascunho;
                  const tipoCfg = TIPO_CONFIG[c.tipo] ?? TIPO_CONFIG.whatsapp;
                  const canPause = c.status === "agendada" || c.status === "enviando";
                  const canResume = c.status === "pausada";
                  const canDelete = c.status === "rascunho";

                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium max-w-[200px] truncate">
                        {c.nome}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-xs ${tipoCfg.className}`}
                        >
                          {tipoCfg.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-xs ${statusCfg.className}`}
                        >
                          {statusCfg.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        <span className="flex items-center justify-end gap-1.5 text-muted-foreground">
                          <Users className="h-3.5 w-3.5" />
                          {c.totalDestinatarios.toLocaleString("pt-BR")}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        <span className="flex items-center justify-end gap-1.5 text-muted-foreground">
                          <Send className="h-3.5 w-3.5" />
                          {c.totalEnviados.toLocaleString("pt-BR")}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {fmtDate(c.agendadaPara)}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(c)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                            {(canPause || canResume) && (
                              <DropdownMenuItem onClick={() => handlePauseResume(c)}>
                                {canPause ? (
                                  <>
                                    <Pause className="h-4 w-4 mr-2" />
                                    Pausar
                                  </>
                                ) : (
                                  <>
                                    <Play className="h-4 w-4 mr-2" />
                                    Retomar
                                  </>
                                )}
                              </DropdownMenuItem>
                            )}
                            {canDelete && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => setDeleteTarget(c)}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Excluir
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </>
          )}
        </CardContent>
      </Card>

      {/* Campaign modal */}
      <CampaignModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        tenantId={tenantId}
        editingCampaign={editingCampaign}
        nomePlaceholder={hints.campanhasNomePlaceholder}
        mensagemPlaceholder={hints.campanhasMensagemPlaceholder}
      />

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir campanha?</AlertDialogTitle>
            <AlertDialogDescription>
              A campanha <strong>{deleteTarget?.nome}</strong> será excluída
              permanentemente. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
