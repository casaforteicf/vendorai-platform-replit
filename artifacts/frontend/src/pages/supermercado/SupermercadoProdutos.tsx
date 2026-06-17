import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useListSupermercadoProdutos,
  useCreateSupermercadoProduto,
  useUpdateSupermercadoProduto,
  useDeleteSupermercadoProduto,
  useSyncSupermercadoProdutos,
  getListSupermercadoProdutosQueryKey,
  SupermercadoProduto,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Plus, Search, RefreshCw, Pencil, Trash2, Package, Star, Loader2,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";

const CATEGORIAS = [
  { value: "hortifruti",       label: "Hortifrúti" },
  { value: "carnes",           label: "Carnes" },
  { value: "frios_laticinios", label: "Frios & Laticínios" },
  { value: "padaria",          label: "Padaria" },
  { value: "bebidas",          label: "Bebidas" },
  { value: "limpeza",          label: "Limpeza" },
  { value: "higiene",          label: "Higiene" },
  { value: "mercearia",        label: "Mercearia" },
  { value: "congelados",       label: "Congelados" },
  { value: "petshop",          label: "Pet Shop" },
  { value: "outros",           label: "Outros" },
];

const produtoSchema = z.object({
  nome: z.string().min(1, "Nome obrigatório"),
  descricao: z.string().optional(),
  categoria: z.string().optional(),
  unidade: z.string().min(1, "Unidade obrigatória"),
  precoVenda: z.string().min(1, "Preço obrigatório"),
  precoPromocional: z.string().optional(),
  estoque: z.coerce.number().min(0),
  ativo: z.boolean(),
  destaqueWhatsapp: z.boolean(),
});
type ProdutoForm = z.infer<typeof produtoSchema>;

export default function SupermercadoProdutos() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const qc = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("todos");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SupermercadoProduto | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SupermercadoProduto | null>(null);

  const { data: produtos = [], isLoading } = useListSupermercadoProdutos(tenantId, {
    q: search || undefined,
    categoria: catFilter !== "todos" ? catFilter : undefined,
  });

  const createMut = useCreateSupermercadoProduto();
  const updateMut = useUpdateSupermercadoProduto();
  const deleteMut = useDeleteSupermercadoProduto();
  const syncMut = useSyncSupermercadoProdutos();

  const qKey = getListSupermercadoProdutosQueryKey(tenantId, {});

  const form = useForm<ProdutoForm>({
    resolver: zodResolver(produtoSchema),
    defaultValues: { nome: "", unidade: "un", precoVenda: "", estoque: 0, ativo: true, destaqueWhatsapp: false },
  });

  function openCreate() {
    form.reset({ nome: "", unidade: "un", precoVenda: "", estoque: 0, ativo: true, destaqueWhatsapp: false });
    setEditTarget(null);
    setDialogOpen(true);
  }

  function openEdit(p: SupermercadoProduto) {
    form.reset({
      nome: p.nome,
      descricao: p.descricao ?? "",
      categoria: p.categoria ?? "",
      unidade: p.unidade,
      precoVenda: p.precoVenda,
      precoPromocional: p.precoPromocional ?? "",
      estoque: p.estoque,
      ativo: p.ativo,
      destaqueWhatsapp: p.destaqueWhatsapp,
    });
    setEditTarget(p);
    setDialogOpen(true);
  }

  function onSubmit(values: ProdutoForm) {
    const payload = { ...values, tenantId };
    if (editTarget) {
      updateMut.mutate({ tenantId, produtoId: editTarget.id, data: values as any }, {
        onSuccess: () => {
          toast({ title: "Produto atualizado." });
          qc.invalidateQueries({ queryKey: qKey });
          setDialogOpen(false);
        },
        onError: () => toast({ title: "Erro ao atualizar", variant: "destructive" }),
      });
    } else {
      createMut.mutate({ tenantId, data: payload as any }, {
        onSuccess: () => {
          toast({ title: "Produto criado." });
          qc.invalidateQueries({ queryKey: qKey });
          setDialogOpen(false);
        },
        onError: () => toast({ title: "Erro ao criar", variant: "destructive" }),
      });
    }
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    deleteMut.mutate({ tenantId, produtoId: deleteTarget.id }, {
      onSuccess: () => {
        toast({ title: "Produto removido." });
        qc.invalidateQueries({ queryKey: qKey });
        setDeleteTarget(null);
      },
      onError: () => toast({ title: "Erro ao remover", variant: "destructive" }),
    });
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Catálogo de Produtos</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{produtos.length} produto{produtos.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncMut.mutate({ tenantId }, {
              onSuccess: (r) => toast({ title: `Sincronizado: ${r.sincronizados} produtos, ${r.erros} erros.` }),
              onError: () => toast({ title: "Erro ao sincronizar ERP", variant: "destructive" }),
            })}
            disabled={syncMut.isPending}
          >
            {syncMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Sincronizar ERP
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={openCreate}>
                <Plus className="h-4 w-4 mr-1" />
                Novo Produto
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{editTarget ? "Editar Produto" : "Novo Produto"}</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField control={form.control} name="nome" render={({ field }) => (
                    <FormItem><FormLabel>Nome *</FormLabel>
                      <FormControl><Input placeholder="Ex: Arroz Tipo 1 5kg" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <div className="grid grid-cols-2 gap-3">
                    <FormField control={form.control} name="categoria" render={({ field }) => (
                      <FormItem><FormLabel>Categoria</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value ?? ""}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger></FormControl>
                          <SelectContent>
                            {CATEGORIAS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="unidade" render={({ field }) => (
                      <FormItem><FormLabel>Unidade *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            {["un", "kg", "g", "L", "mL", "cx", "pct", "dz"].map((u) => (
                              <SelectItem key={u} value={u}>{u}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <FormField control={form.control} name="precoVenda" render={({ field }) => (
                      <FormItem><FormLabel>Preço *</FormLabel>
                        <FormControl><Input placeholder="0.00" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="precoPromocional" render={({ field }) => (
                      <FormItem><FormLabel>Promoção</FormLabel>
                        <FormControl><Input placeholder="0.00" {...field} /></FormControl>
                      </FormItem>
                    )} />
                  </div>

                  <FormField control={form.control} name="estoque" render={({ field }) => (
                    <FormItem><FormLabel>Estoque</FormLabel>
                      <FormControl><Input type="number" min={0} {...field} /></FormControl>
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="descricao" render={({ field }) => (
                    <FormItem><FormLabel>Descrição</FormLabel>
                      <FormControl><Input placeholder="Descrição curta" {...field} /></FormControl>
                    </FormItem>
                  )} />

                  <div className="flex items-center gap-6">
                    <FormField control={form.control} name="ativo" render={({ field }) => (
                      <FormItem className="flex items-center gap-2">
                        <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                        <FormLabel className="!mt-0 font-normal">Ativo</FormLabel>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="destaqueWhatsapp" render={({ field }) => (
                      <FormItem className="flex items-center gap-2">
                        <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                        <FormLabel className="!mt-0 font-normal">Destaque WhatsApp</FormLabel>
                      </FormItem>
                    )} />
                  </div>

                  <Button type="submit" className="w-full" disabled={createMut.isPending || updateMut.isPending}>
                    {editTarget ? "Salvar" : "Criar Produto"}
                  </Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar produto..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas as categorias</SelectItem>
            {CATEGORIAS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
        </div>
      ) : produtos.length === 0 ? (
        <div className="flex flex-col items-center py-16 gap-3 text-muted-foreground">
          <Package className="h-12 w-12 opacity-20" />
          <p className="text-sm">Nenhum produto encontrado</p>
          <Button variant="outline" size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" /> Cadastrar produto
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {produtos.map((p) => (
            <Card key={p.id} className={`relative ${!p.ativo ? "opacity-50" : ""}`}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm leading-tight line-clamp-2">{p.nome}</p>
                    {p.categoria && (
                      <p className="text-[11px] text-muted-foreground capitalize mt-0.5">
                        {CATEGORIAS.find((c) => c.value === p.categoria)?.label ?? p.categoria}
                      </p>
                    )}
                  </div>
                  {p.destaqueWhatsapp && <Star className="h-4 w-4 text-amber-400 fill-amber-400 shrink-0" />}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {p.precoPromocional ? (
                    <>
                      <span className="text-xs line-through text-muted-foreground">
                        R$ {Number(p.precoVenda).toFixed(2)}
                      </span>
                      <span className="text-sm font-bold text-emerald-600">
                        R$ {Number(p.precoPromocional).toFixed(2)}
                      </span>
                      <Badge className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">Promo</Badge>
                    </>
                  ) : (
                    <span className="text-sm font-bold">R$ {Number(p.precoVenda).toFixed(2)}</span>
                  )}
                  <span className="text-xs text-muted-foreground">/{p.unidade}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Estoque: {p.estoque}</span>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(p)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(p)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover "{deleteTarget?.nome}"?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={confirmDelete}
              disabled={deleteMut.isPending}
            >Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
