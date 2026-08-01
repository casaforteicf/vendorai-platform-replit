import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useListSupermercadoCampanhas,
  useCreateSupermercadoCampanha,
  useUpdateSupermercadoCampanha,
  useDeleteSupermercadoCampanha,
  useDispararSupermercadoCampanha,
  useGerarConteudoSupermercadoCampanha,
  getListSupermercadoCampanhasQueryKey,
  SupermercadoCampanha,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, Trash2, Send, Sparkles, Loader2, Megaphone, Pencil,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

const TIPO_OPTIONS = [
  { value: "promocao",          label: "Promoção" },
  { value: "receita",           label: "Receita" },
  { value: "dica",              label: "Dica" },
  { value: "lugar",             label: "Lugar" },
  { value: "historia",          label: "História local" },
  { value: "data_comemorativa", label: "Data Comemorativa" },
  { value: "reativacao",        label: "Reativação" },
];

const STATUS_COLORS: Record<string, string> = {
  rascunho: "bg-slate-50 text-slate-600 border-slate-200",
  agendada: "bg-blue-50 text-blue-700 border-blue-200",
  enviando: "bg-amber-50 text-amber-700 border-amber-200",
  concluida: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelada: "bg-red-50 text-red-700 border-red-200",
};

const campanhaSchema = z.object({
  titulo: z.string().min(1, "Título obrigatório"),
  tipo: z.string().min(1, "Tipo obrigatório"),
  conteudo: z.string().min(1, "Conteúdo obrigatório"),
  imagemUrl: z.string().optional(),
  publicarNoPraca: z.boolean().default(false),
  resumoPraca: z.string().optional(),
  passosPraca: z.string().optional(),
  produtoIdsPraca: z.string().optional(),
  publicacaoPracaEm: z.string().optional(),
  ofertaPracaEm: z.string().optional(),
  ofertaTituloPraca: z.string().optional(),
  ofertaResumoPraca: z.string().optional(),
});
type CampanhaForm = z.infer<typeof campanhaSchema>;

export default function SupermercadoCampanhas() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const qc = useQueryClient();
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SupermercadoCampanha | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SupermercadoCampanha | null>(null);
  const [dispararTarget, setDispararTarget] = useState<SupermercadoCampanha | null>(null);
  const [gerandoIA, setGerandoIA] = useState(false);

  const { data: campanhas = [], isLoading } = useListSupermercadoCampanhas(tenantId, {});
  const qKey = getListSupermercadoCampanhasQueryKey(tenantId, {});

  const createMut = useCreateSupermercadoCampanha();
  const updateMut = useUpdateSupermercadoCampanha();
  const deleteMut = useDeleteSupermercadoCampanha();
  const dispararMut = useDispararSupermercadoCampanha();
  const gerarMut = useGerarConteudoSupermercadoCampanha();

  const form = useForm<CampanhaForm>({
    resolver: zodResolver(campanhaSchema),
    defaultValues: { titulo: "", tipo: "promocao", conteudo: "", imagemUrl: "", publicarNoPraca: false },
  });

  function openCreate() {
    form.reset({ titulo: "", tipo: "promocao", conteudo: "", imagemUrl: "", publicarNoPraca: false, resumoPraca: "", passosPraca: "", produtoIdsPraca: "", publicacaoPracaEm: "", ofertaPracaEm: "", ofertaTituloPraca: "", ofertaResumoPraca: "" });
    setEditTarget(null);
    setDialogOpen(true);
  }

  function openEdit(c: SupermercadoCampanha) {
    const item = c as any;
    const localDate = (value?: string | null) => value ? new Date(value).toISOString().slice(0, 16) : "";
    form.reset({ titulo: c.titulo, tipo: c.tipo, conteudo: c.conteudo, imagemUrl: item.imagemUrl ?? "", publicarNoPraca: item.publicarNoPraca ?? false, resumoPraca: item.resumoPraca ?? "", passosPraca: (item.passosPraca ?? []).join("\n"), produtoIdsPraca: (item.produtoIdsPraca ?? []).join(", "), publicacaoPracaEm: localDate(item.publicacaoPracaEm), ofertaPracaEm: localDate(item.ofertaPracaEm), ofertaTituloPraca: item.ofertaTituloPraca ?? "", ofertaResumoPraca: item.ofertaResumoPraca ?? "" });
    setEditTarget(c);
    setDialogOpen(true);
  }

  function onSubmit(values: CampanhaForm) {
    const payload = {
      ...values,
      passosPraca: values.passosPraca?.split("\n").map((v) => v.trim()).filter(Boolean) ?? [],
      produtoIdsPraca: values.produtoIdsPraca?.split(",").map((v) => v.trim()).filter(Boolean) ?? [],
      publicacaoPracaEm: values.publicacaoPracaEm ? new Date(values.publicacaoPracaEm).toISOString() : null,
      ofertaPracaEm: values.ofertaPracaEm ? new Date(values.ofertaPracaEm).toISOString() : null,
    };
    if (editTarget) {
      updateMut.mutate({ tenantId, campanhaId: editTarget.id, data: payload as any }, {
        onSuccess: () => { toast({ title: "Campanha atualizada." }); qc.invalidateQueries({ queryKey: qKey }); setDialogOpen(false); },
        onError: () => toast({ title: "Erro ao atualizar", variant: "destructive" }),
      });
    } else {
      createMut.mutate({ tenantId, data: payload as any }, {
        onSuccess: () => { toast({ title: "Campanha criada." }); qc.invalidateQueries({ queryKey: qKey }); setDialogOpen(false); },
        onError: () => toast({ title: "Erro ao criar", variant: "destructive" }),
      });
    }
  }

  async function gerarComIA() {
    const tipo = form.getValues("tipo");
    setGerandoIA(true);
    gerarMut.mutate({ tenantId, data: { tipo: tipo as any } }, {
      onSuccess: (data) => {
        form.setValue("titulo", data.titulo);
        form.setValue("conteudo", data.conteudo);
        setGerandoIA(false);
      },
      onError: () => { toast({ title: "Erro ao gerar com IA", variant: "destructive" }); setGerandoIA(false); },
    });
  }

  function confirmarDisparo() {
    if (!dispararTarget) return;
    dispararMut.mutate({ tenantId, campanhaId: dispararTarget.id }, {
      onSuccess: (r) => {
        toast({ title: `Campanha disparada para ${r.total} contato(s).` });
        qc.invalidateQueries({ queryKey: qKey });
        setDispararTarget(null);
      },
      onError: () => toast({ title: "Erro ao disparar campanha", variant: "destructive" }),
    });
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Campanhas e Variedades Praça.ai</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Publique conteúdo no Praça.ai, programe a oferta do dia seguinte e, se quiser, envie também pelo WhatsApp.
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> Nova Campanha
        </Button>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
      ) : campanhas.length === 0 ? (
        <div className="flex flex-col items-center py-16 gap-3 text-muted-foreground">
          <Megaphone className="h-12 w-12 opacity-20" />
          <p className="text-sm">Nenhuma campanha criada ainda</p>
          <Button variant="outline" size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" /> Criar primeira campanha
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {campanhas.map((c) => (
            <Card key={c.id}>
              <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm">{c.titulo}</p>
                    <Badge className={`text-[10px] px-1.5 py-0 h-4 border ${STATUS_COLORS[c.status] ?? ""}`}>
                      {c.status}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 capitalize">
                      {TIPO_OPTIONS.find((t) => t.value === c.tipo)?.label ?? c.tipo}
                    </Badge>
                    {(c as any).publicarNoPraca && <Badge className="text-[10px] px-1.5 py-0 h-4 bg-emerald-600">Praça.ai</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{c.conteudo}</p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{format(parseISO(c.createdAt), "dd/MM/yyyy", { locale: ptBR })}</span>
                    {c.status === "concluida" && (
                      <span className="text-emerald-600 font-medium">✓ {c.totalEnviados} enviados</span>
                    )}
                    {c.totalFalhas > 0 && (
                      <span className="text-red-500">{c.totalFalhas} falhas</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {(c.status === "rascunho" || c.status === "agendada") && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1"
                        onClick={() => openEdit(c)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        className="h-8 gap-1"
                        onClick={() => setDispararTarget(c)}
                        disabled={dispararMut.isPending}
                      >
                        <Send className="h-3.5 w-3.5" />
                        Disparar
                      </Button>
                    </>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => setDeleteTarget(c)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editTarget ? "Editar Campanha" : "Nova Campanha"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="titulo" render={({ field }) => (
                <FormItem><FormLabel>Título *</FormLabel>
                  <FormControl><Input placeholder="Ex: Promoção do fim de semana" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="tipo" render={({ field }) => (
                <FormItem><FormLabel>Tipo *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      {TIPO_OPTIONS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />

              <div className="flex items-end gap-2">
                <FormField control={form.control} name="conteudo" render={({ field }) => (
                  <FormItem className="flex-1"><FormLabel>Mensagem *</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Digite a mensagem que será enviada via WhatsApp..."
                        rows={5}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                <FormField control={form.control} name="publicarNoPraca" render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0"><FormControl><input type="checkbox" className="h-4 w-4 accent-primary" checked={field.value} onChange={field.onChange} /></FormControl><FormLabel className="!mt-0">Publicar em Variedades do Praça.ai</FormLabel></FormItem>
                )} />
                {form.watch("publicarNoPraca") && <>
                  <FormField control={form.control} name="imagemUrl" render={({ field }) => <FormItem><FormLabel>Vídeo ou imagem do story</FormLabel><FormControl><Input placeholder="URL de vídeo MP4/WebM ou imagem vertical" {...field} /></FormControl><p className="text-xs text-muted-foreground">O conteúdo é editorial: não inclua preço, desconto ou chamada de compra nesta mídia.</p></FormItem>} />
                  <FormField control={form.control} name="resumoPraca" render={({ field }) => <FormItem><FormLabel>Resumo do card</FormLabel><FormControl><Textarea rows={2} placeholder="Texto curto mostrado na página inicial" {...field} /></FormControl></FormItem>} />
                  <FormField control={form.control} name="passosPraca" render={({ field }) => <FormItem><FormLabel>Etapas interativas</FormLabel><FormControl><Textarea rows={3} placeholder={'Uma etapa por linha'} {...field} /></FormControl></FormItem>} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <FormField control={form.control} name="publicacaoPracaEm" render={({ field }) => <FormItem><FormLabel>Publicar conteúdo em</FormLabel><FormControl><Input type="datetime-local" {...field} /></FormControl></FormItem>} />
                    <FormField control={form.control} name="ofertaPracaEm" render={({ field }) => <FormItem><FormLabel>Levar para Ofertas em</FormLabel><FormControl><Input type="datetime-local" {...field} /></FormControl></FormItem>} />
                  </div>
                  <FormField control={form.control} name="produtoIdsPraca" render={({ field }) => <FormItem><FormLabel>IDs dos produtos relacionados</FormLabel><FormControl><Input placeholder="Separe os IDs por vírgula" {...field} /></FormControl></FormItem>} />
                  <FormField control={form.control} name="ofertaTituloPraca" render={({ field }) => <FormItem><FormLabel>Título da oferta</FormLabel><FormControl><Input placeholder="Ex: Ingredientes da receita em oferta" {...field} /></FormControl></FormItem>} />
                  <FormField control={form.control} name="ofertaResumoPraca" render={({ field }) => <FormItem><FormLabel>Resumo da oferta</FormLabel><FormControl><Textarea rows={2} {...field} /></FormControl></FormItem>} />
                </>}
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="gap-1.5"
                  onClick={gerarComIA}
                  disabled={gerandoIA}
                >
                  {gerandoIA ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Gerar com IA
                </Button>
                <Button type="submit" className="flex-1" disabled={createMut.isPending || updateMut.isPending}>
                  {editTarget ? "Salvar" : "Criar Campanha"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Confirm Dispatch */}
      <AlertDialog open={!!dispararTarget} onOpenChange={(v) => { if (!v) setDispararTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disparar "{dispararTarget?.titulo}"?</AlertDialogTitle>
            <AlertDialogDescription>
              A mensagem será enviada via WhatsApp para todos os clientes com número cadastrado.
              Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarDisparo} disabled={dispararMut.isPending}>
              {dispararMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
              Disparar Agora
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover "{deleteTarget?.titulo}"?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={() => {
                if (!deleteTarget) return;
                deleteMut.mutate({ tenantId, campanhaId: deleteTarget.id }, {
                  onSuccess: () => { toast({ title: "Campanha removida." }); qc.invalidateQueries({ queryKey: qKey }); setDeleteTarget(null); },
                  onError: () => toast({ title: "Erro ao remover", variant: "destructive" }),
                });
              }}
              disabled={deleteMut.isPending}
            >Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
