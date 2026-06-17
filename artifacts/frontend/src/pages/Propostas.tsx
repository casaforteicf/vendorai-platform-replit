import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useListPropostas,
  getListPropostasQueryKey,
  useCreateProposta,
  useCreatePropostaFromCatalogo,
  useUpdatePropostaStatus,
  useDeleteProposta,
  useListTenantLeads,
  getListTenantLeadsQueryKey,
  useListProdutosCatalogo,
  getListProdutosCatalogoQueryKey,
  useCreateProdutoCatalogo,
  useUpdateProdutoCatalogo,
  useDeleteProdutoCatalogo,
  useImportProdutosCatalogo,
  useCreateDeal,
  getListDealsQueryKey,
  useGetBusinessProfileByTenant,
  getGetBusinessProfileByTenantQueryKey,
  useGetLead,
  getGetLeadQueryKey,
} from "@workspace/api-client-react";
import type {
  Proposta,
  PropostaStatus,
  ProdutoCatalogo,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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
  Trash2,
  Loader2,
  FileText,
  Package,
  Pencil,
  Eye,
  Send,
  CheckCircle2,
  XCircle,
  BookOpen,
  X,
  Sparkles,
  Upload,
  Download,
  AlertTriangle,
  Image as ImageIcon,
  Printer,
  Building2,
  Phone,
  Mail,
  MapPin,
  User,
  MessageCircle,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// ── Constants ─────────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  rascunho:  { label: "Rascunho",  className: "bg-zinc-100 text-zinc-600 border-zinc-200" },
  enviada:   { label: "Enviada",   className: "bg-blue-100 text-blue-700 border-blue-200" },
  aceita:    { label: "Aceita",    className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  rejeitada: { label: "Rejeitada", className: "bg-red-100 text-red-600 border-red-200" },
  expirada:  { label: "Expirada",  className: "bg-orange-100 text-orange-700 border-orange-200" },
};

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try { return format(new Date(iso), "dd/MM/yyyy", { locale: ptBR }); }
  catch { return "—"; }
}

function fmtCurrency(val: string | number | null | undefined) {
  const n = parseFloat(String(val ?? "0"));
  if (isNaN(n)) return "R$ —";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ── Catalog Modal (CRUD) ──────────────────────────────────────────────────────
const catFormSchema = z.object({
  nome: z.string().min(1, "Obrigatório"),
  categoria: z.string().optional(),
  precoBase: z.coerce.number().min(0, "Preço inválido"),
  unidade: z.string().min(1, "Obrigatório"),
  descricao: z.string().optional(),
  imagemUrl: z.string().url("URL inválida").optional().or(z.literal("")),
  ativo: z.boolean().default(true),
});
type CatFormValues = z.infer<typeof catFormSchema>;

interface CsvPreviewRow {
  nome: string;
  sku?: string;
  categoria?: string;
  preco_base: string;
  unidade?: string;
  descricao?: string;
  imagem_url?: string;
}

const CSV_TEMPLATE =
  "nome,sku,categoria,preco_base,unidade,descricao,imagem_url\n" +
  "Camiseta Básica,SKU001,Feminino,79.90,un,100% algodão,https://exemplo.com/img1.jpg\n" +
  "Calça Jeans,SKU002,Masculino,199.90,un,Slim fit,,\n";

function downloadTemplate() {
  const blob = new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "modelo_catalogo.csv"; a.click();
  URL.revokeObjectURL(url);
}

function CatalogoModal({
  open,
  onClose,
  tenantId,
}: {
  open: boolean;
  onClose: () => void;
  tenantId: string;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editingProd, setEditingProd] = useState<ProdutoCatalogo | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProdutoCatalogo | null>(null);
  const [csvPreview, setCsvPreview] = useState<CsvPreviewRow[]>([]);
  const [csvRaw, setCsvRaw] = useState("");
  const [importPreviewOpen, setImportPreviewOpen] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; errors: { row: number; message: string }[] } | null>(null);

  const { data: catalog = [], isLoading } = useListProdutosCatalogo(tenantId, {
    query: { queryKey: getListProdutosCatalogoQueryKey(tenantId), enabled: !!tenantId },
  });

  const createMut = useCreateProdutoCatalogo();
  const updateMut = useUpdateProdutoCatalogo();
  const deleteMut = useDeleteProdutoCatalogo();
  const importMut = useImportProdutosCatalogo();

  const form = useForm<CatFormValues>({
    resolver: zodResolver(catFormSchema),
    defaultValues: { nome: "", categoria: "", precoBase: 0, unidade: "un", descricao: "", imagemUrl: "", ativo: true },
  });

  function openCreate() {
    setEditingProd(null);
    form.reset({ nome: "", categoria: "", precoBase: 0, unidade: "un", descricao: "", imagemUrl: "", ativo: true });
    setFormOpen(true);
  }

  function openEdit(p: ProdutoCatalogo) {
    setEditingProd(p);
    form.reset({
      nome: p.nome,
      categoria: p.categoria ?? "",
      precoBase: parseFloat(p.precoBase),
      unidade: p.unidade,
      descricao: p.descricao ?? "",
      imagemUrl: p.imagemUrl ?? "",
      ativo: p.ativo,
    });
    setFormOpen(true);
  }

  function invalidate() {
    qc.invalidateQueries({ queryKey: getListProdutosCatalogoQueryKey(tenantId) });
  }

  function onSubmit(vals: CatFormValues) {
    const body = {
      ...vals,
      precoBase: vals.precoBase.toFixed(2),
      imagemUrl: vals.imagemUrl || undefined,
    };
    if (editingProd) {
      updateMut.mutate(
        { id: editingProd.id, data: body },
        {
          onSuccess: () => { toast({ title: "Produto atualizado" }); invalidate(); setFormOpen(false); },
          onError: () => toast({ title: "Erro ao atualizar", variant: "destructive" }),
        }
      );
    } else {
      createMut.mutate(
        { data: { ...body, tenantId } },
        {
          onSuccess: () => { toast({ title: "Produto criado" }); invalidate(); setFormOpen(false); },
          onError: () => toast({ title: "Erro ao criar produto", variant: "destructive" }),
        }
      );
    }
  }

  function doDelete() {
    if (!deleteTarget) return;
    deleteMut.mutate(
      { id: deleteTarget.id },
      {
        onSuccess: () => { toast({ title: "Produto excluído" }); invalidate(); setDeleteTarget(null); },
        onError: () => toast({ title: "Erro ao excluir", variant: "destructive" }),
      }
    );
  }

  function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setCsvRaw(text);
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) { toast({ title: "CSV vazio ou sem dados", variant: "destructive" }); return; }
      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/[^a-z0-9]/g, "_"));
      const rows: CsvPreviewRow[] = [];
      for (let i = 1; i < Math.min(lines.length, 6); i++) {
        const cols = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
        const get = (aliases: string[]) => {
          for (const a of aliases) { const idx = headers.indexOf(a); if (idx >= 0) return cols[idx] ?? ""; }
          return "";
        };
        rows.push({
          nome: get(["nome", "name", "produto"]),
          sku: get(["sku", "codigo", "ref"]),
          categoria: get(["categoria", "category"]),
          preco_base: get(["preco_base", "precobase", "preco", "price", "valor"]),
          unidade: get(["unidade", "un", "unit"]) || "un",
          descricao: get(["descricao", "description"]),
          imagem_url: get(["imagem_url", "imagem", "image", "foto"]),
        });
      }
      setCsvPreview(rows);
      setImportPreviewOpen(true);
    };
    reader.readAsText(file, "UTF-8");
    e.target.value = "";
  }

  function confirmImport() {
    importMut.mutate(
      { tenantId, data: { csv: csvRaw } },
      {
        onSuccess: (result) => {
          setImportPreviewOpen(false);
          setImportResult(result);
          invalidate();
        },
        onError: () => toast({ title: "Erro ao importar", variant: "destructive" }),
      }
    );
  }

  const isSaving = createMut.isPending || updateMut.isPending;

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between gap-2">
              <DialogTitle>Catálogo de Produtos</DialogTitle>
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  accept=".csv,text/csv"
                  id="csv-import-input"
                  className="hidden"
                  onChange={handleCsvFile}
                />
                <Button size="sm" variant="outline" onClick={downloadTemplate}>
                  <Download className="h-4 w-4 mr-1.5" />
                  Modelo CSV
                </Button>
                <Button size="sm" variant="outline" onClick={() => document.getElementById("csv-import-input")?.click()}>
                  <Upload className="h-4 w-4 mr-1.5" />
                  Importar CSV
                </Button>
                <Button size="sm" onClick={openCreate}>
                  <Plus className="h-4 w-4 mr-1.5" />
                  Novo Produto
                </Button>
              </div>
            </div>
          </DialogHeader>

          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando…
            </div>
          ) : catalog.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
              <Package className="h-10 w-10 opacity-25" />
              <p className="text-sm">Nenhum produto no catálogo ainda</p>
              <p className="text-xs">Use "Importar CSV" para adicionar vários produtos de uma vez</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Preço Base</TableHead>
                  <TableHead>Unidade</TableHead>
                  <TableHead>Ativo</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {catalog.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      {p.imagemUrl ? (
                        <img
                          src={p.imagemUrl}
                          alt={p.nome}
                          className="h-9 w-9 rounded object-cover border border-border"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      ) : (
                        <div className="h-9 w-9 rounded bg-muted flex items-center justify-center">
                          <ImageIcon className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      <div>{p.nome}</div>
                      {p.sku && <div className="text-xs text-muted-foreground">SKU: {p.sku}</div>}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.categoria ?? "—"}</TableCell>
                    <TableCell className="font-mono">{fmtCurrency(p.precoBase)}</TableCell>
                    <TableCell className="text-muted-foreground">{p.unidade}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={p.ativo ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-zinc-100 text-zinc-500 border-zinc-200"}>
                        {p.ativo ? "Sim" : "Não"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(p)}>
                            <Pencil className="h-4 w-4 mr-2" /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteTarget(p)}>
                            <Trash2 className="h-4 w-4 mr-2" /> Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>

      {/* Product form dialog */}
      <Dialog open={formOpen} onOpenChange={(o) => !o && setFormOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingProd ? "Editar Produto" : "Novo Produto"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="nome" render={({ field }) => (
                <FormItem><FormLabel>Nome</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="categoria" render={({ field }) => (
                  <FormItem><FormLabel>Categoria</FormLabel><FormControl><Input placeholder="Ex: Software" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="unidade" render={({ field }) => (
                  <FormItem><FormLabel>Unidade</FormLabel><FormControl><Input placeholder="un, m², h…" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <FormField control={form.control} name="precoBase" render={({ field }) => (
                <FormItem><FormLabel>Preço Base (R$)</FormLabel><FormControl>
                  <Input type="number" step="0.01" min="0" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} />
                </FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="descricao" render={({ field }) => (
                <FormItem><FormLabel>Descrição <span className="text-muted-foreground text-xs">(opcional)</span></FormLabel>
                  <FormControl><Textarea rows={2} className="resize-none" {...field} value={field.value ?? ""} /></FormControl><FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="imagemUrl" render={({ field }) => (
                <FormItem>
                  <FormLabel>URL da Imagem <span className="text-muted-foreground text-xs">(opcional)</span></FormLabel>
                  <FormControl><Input placeholder="https://…" {...field} value={field.value ?? ""} /></FormControl>
                  <FormMessage />
                  {field.value && (
                    <img src={field.value} alt="preview" className="h-16 w-16 rounded object-cover border border-border mt-1"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  )}
                </FormItem>
              )} />
              <div className="flex gap-2 pt-1">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setFormOpen(false)}>Cancelar</Button>
                <Button type="submit" className="flex-1" disabled={isSaving}>
                  {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {editingProd ? "Salvar" : "Criar Produto"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Import CSV preview dialog */}
      <Dialog open={importPreviewOpen} onOpenChange={(o) => !o && setImportPreviewOpen(false)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pré-visualização da importação</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-2">
            Mostrando até 5 linhas. Confirme para importar <strong>todos</strong> os produtos do arquivo.
          </p>
          {csvPreview.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Preço</TableHead>
                  <TableHead>Un.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {csvPreview.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{row.nome || <span className="text-destructive text-xs">vazio!</span>}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{row.sku || "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{row.categoria || "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{row.preco_base || <span className="text-destructive">inválido</span>}</TableCell>
                    <TableCell className="text-xs">{row.unidade || "un"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <div className="flex gap-2 mt-4">
            <Button variant="outline" className="flex-1" onClick={() => setImportPreviewOpen(false)}>Cancelar</Button>
            <Button className="flex-1" onClick={confirmImport} disabled={importMut.isPending}>
              {importMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              Confirmar Importação
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Import result dialog */}
      <Dialog open={!!importResult} onOpenChange={(o) => !o && setImportResult(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Resultado da importação</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-50 border border-emerald-200">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
              <span className="text-sm text-emerald-800 font-medium">
                {importResult?.imported ?? 0} produto{(importResult?.imported ?? 0) !== 1 ? "s" : ""} importado{(importResult?.imported ?? 0) !== 1 ? "s" : ""} com sucesso
              </span>
            </div>
            {(importResult?.errors?.length ?? 0) > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-amber-700">
                  <AlertTriangle className="h-4 w-4" />
                  <span>{importResult!.errors.length} linha{importResult!.errors.length !== 1 ? "s" : ""} ignorada{importResult!.errors.length !== 1 ? "s" : ""}:</span>
                </div>
                <ul className="text-xs text-muted-foreground space-y-0.5 ml-6 list-disc">
                  {importResult!.errors.map((e) => (
                    <li key={e.row}>Linha {e.row}: {e.message}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <Button className="w-full mt-2" onClick={() => setImportResult(null)}>Fechar</Button>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir produto?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget?.nome}</strong> será excluído permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Proposta Modal (Nova Proposta) ────────────────────────────────────────────
interface CartLine { produtoId: string; quantidade: number; }
interface FreeItem  { id: string; nome: string; quantidade: number; valorUnitario: number; }

const propostaFormSchema = z.object({
  leadId: z.string().min(1, "Selecione um lead"),
  titulo: z.string().min(1, "Título é obrigatório"),
  validadeAte: z.string().optional(),
  observacoes: z.string().optional(),
  condPagamento: z.string().optional(),
  prazoEntrega: z.string().optional(),
});
type PropostaFormValues = z.infer<typeof propostaFormSchema>;

function newFreeItem(): FreeItem {
  return { id: Math.random().toString(36).slice(2), nome: "", quantidade: 1, valorUnitario: 0 };
}

function PropostaModal({
  open,
  onClose,
  tenantId,
  catalog,
}: {
  open: boolean;
  onClose: () => void;
  tenantId: string;
  catalog: ProdutoCatalogo[];
}) {
  const { toast } = useToast();
  const qc = useQueryClient();

  // mode
  const [mode, setMode] = useState<"catalogo" | "livre">("catalogo");

  // catalog mode
  const [cartLines, setCartLines] = useState<CartLine[]>([{ produtoId: "", quantidade: 1 }]);
  const [cartError, setCartError] = useState("");

  // livre mode
  const [freeItems, setFreeItems] = useState<FreeItem[]>([newFreeItem()]);
  const [freeError, setFreeError] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [contextoIA, setContextoIA] = useState("");
  const [showIAPanel, setShowIAPanel] = useState(false);

  const form = useForm<PropostaFormValues>({
    resolver: zodResolver(propostaFormSchema),
    defaultValues: { leadId: "", titulo: "", validadeAte: "", observacoes: "", condPagamento: "", prazoEntrega: "" },
  });

  const { data: leads = [] } = useListTenantLeads(tenantId, {
    query: { queryKey: getListTenantLeadsQueryKey(tenantId), enabled: !!tenantId },
  });

  const createFromCatMut  = useCreatePropostaFromCatalogo();
  const createLivreMut    = useCreateProposta();
  const { mutate: createDeal } = useCreateDeal();
  const activeCatalog     = catalog.filter((p) => p.ativo);

  // totals
  const catTotal = cartLines.reduce((s, l) => {
    const p = activeCatalog.find((p) => p.id === l.produtoId);
    return s + (p ? l.quantidade * parseFloat(p.precoBase) : 0);
  }, 0);
  const freeTotal = freeItems.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0);

  function handleClose() {
    form.reset();
    setMode("catalogo");
    setCartLines([{ produtoId: "", quantidade: 1 }]);
    setCartError("");
    setFreeItems([newFreeItem()]);
    setFreeError("");
    setContextoIA("");
    setShowIAPanel(false);
    onClose();
  }

  // ── catalog helpers ───────────────────────────────────────────────────────
  function addCatLine()    { setCartLines((p) => [...p, { produtoId: "", quantidade: 1 }]); }
  function removeCatLine(i: number) { setCartLines((p) => p.filter((_, j) => j !== i)); }
  function updateCatLine(i: number, patch: Partial<CartLine>) {
    setCartLines((p) => p.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  // ── livre helpers ─────────────────────────────────────────────────────────
  function addFreeItem()    { setFreeItems((p) => [...p, newFreeItem()]); }
  function removeFreeItem(id: string) { setFreeItems((p) => p.filter((i) => i.id !== id)); }
  function updateFreeItem(id: string, patch: Partial<FreeItem>) {
    setFreeItems((p) => p.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  // ── AI suggestion ─────────────────────────────────────────────────────────
  async function suggestItems() {
    setSuggesting(true);
    try {
      const titulo   = form.getValues("titulo") || "orçamento";
      const leadId   = form.getValues("leadId");
      const leadNome = leads.find((l) => l.id === leadId)?.nome;
      const res = await fetch(`/api/tenants/${tenantId}/propostas/suggest-items`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("vendorai_token")}`,
        },
        body: JSON.stringify({ titulo, leadNome, contexto: contextoIA }),
      });
      if (!res.ok) throw new Error("Falha");
      const data = await res.json();
      if (data.itens?.length) {
        setFreeItems(
          data.itens.map((item: { nome: string; quantidade?: number; valorUnitario?: number }) => ({
            id: Math.random().toString(36).slice(2),
            nome: item.nome ?? "",
            quantidade: item.quantidade ?? 1,
            valorUnitario: item.valorUnitario ?? 0,
          }))
        );
        toast({ title: `${data.itens.length} itens sugeridos pela IA` });
      }
    } catch {
      toast({ title: "Erro ao gerar sugestão", variant: "destructive" });
    } finally {
      setSuggesting(false);
    }
  }

  // ── submit ────────────────────────────────────────────────────────────────
  function onSubmit(vals: PropostaFormValues) {
    if (mode === "catalogo") {
      const valid = cartLines.filter((l) => l.produtoId);
      if (!valid.length) { setCartError("Adicione pelo menos um produto."); return; }
      setCartError("");
      createFromCatMut.mutate(
        { tenantId, data: { leadId: vals.leadId, titulo: vals.titulo, validadeAte: vals.validadeAte || undefined, observacoes: vals.observacoes || undefined, condPagamento: vals.condPagamento || undefined, prazoEntrega: vals.prazoEntrega || undefined, itens: valid.map((l) => ({ produtoId: l.produtoId, quantidade: l.quantidade })) } },
        {
          onSuccess: () => {
            toast({ title: "Proposta criada com sucesso" });
            qc.invalidateQueries({ queryKey: getListPropostasQueryKey(tenantId) });
            createDeal(
              { data: { tenantId, titulo: vals.titulo, leadId: vals.leadId, etapa: "proposta", valor: catTotal || undefined } },
              { onSuccess: () => qc.invalidateQueries({ queryKey: getListDealsQueryKey(tenantId) }) }
            );
            handleClose();
          },
          onError: () => toast({ title: "Erro ao criar proposta", variant: "destructive" }),
        }
      );
    } else {
      const valid = freeItems.filter((i) => i.nome.trim());
      if (!valid.length) { setFreeError("Adicione pelo menos um item."); return; }
      setFreeError("");
      createLivreMut.mutate(
        { data: { tenantId, leadId: vals.leadId, titulo: vals.titulo, validadeAte: vals.validadeAte || undefined, observacoes: vals.observacoes || undefined, condPagamento: vals.condPagamento || undefined, prazoEntrega: vals.prazoEntrega || undefined, itens: valid.map((i) => ({ nome: i.nome, quantidade: i.quantidade, valorUnitario: i.valorUnitario })), valorTotal: freeTotal } },
        {
          onSuccess: () => {
            toast({ title: "Proposta criada com sucesso" });
            qc.invalidateQueries({ queryKey: getListPropostasQueryKey(tenantId) });
            createDeal(
              { data: { tenantId, titulo: vals.titulo, leadId: vals.leadId, etapa: "proposta", valor: freeTotal || undefined } },
              { onSuccess: () => qc.invalidateQueries({ queryKey: getListDealsQueryKey(tenantId) }) }
            );
            handleClose();
          },
          onError: () => toast({ title: "Erro ao criar proposta", variant: "destructive" }),
        }
      );
    }
  }

  const isPending = createFromCatMut.isPending || createLivreMut.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Proposta</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            {/* Lead + Título */}
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="leadId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Lead</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Selecione o lead" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {leads.map((l) => (
                        <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="titulo" render={({ field }) => (
                <FormItem><FormLabel>Título</FormLabel><FormControl><Input placeholder="Ex: Proposta Plano Pro" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>

            {/* Mode tabs */}
            <div className="flex rounded-lg border overflow-hidden text-sm">
              <button
                type="button"
                onClick={() => setMode("catalogo")}
                className={`flex-1 py-2 font-medium transition-colors ${mode === "catalogo" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              >
                Do Catálogo
              </button>
              <button
                type="button"
                onClick={() => setMode("livre")}
                className={`flex-1 py-2 font-medium transition-colors ${mode === "livre" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              >
                Itens Livres
              </button>
            </div>

            {/* ── CATALOG MODE ──────────────────────────────────────────────── */}
            {mode === "catalogo" && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium">Itens do Orçamento</p>
                  <Button type="button" variant="outline" size="sm" onClick={addCatLine}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar item
                  </Button>
                </div>
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs py-2">Produto</TableHead>
                        <TableHead className="text-xs py-2 w-24">Qtd</TableHead>
                        <TableHead className="text-xs py-2 w-28 text-right">Preço unit.</TableHead>
                        <TableHead className="text-xs py-2 w-28 text-right">Subtotal</TableHead>
                        <TableHead className="w-8 py-2" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cartLines.map((line, idx) => {
                        const prod = activeCatalog.find((p) => p.id === line.produtoId);
                        const subtotal = prod ? line.quantidade * parseFloat(prod.precoBase) : 0;
                        return (
                          <TableRow key={idx}>
                            <TableCell className="py-1.5">
                              <Select value={line.produtoId} onValueChange={(v) => updateCatLine(idx, { produtoId: v })}>
                                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione…" /></SelectTrigger>
                                <SelectContent>
                                  {activeCatalog.map((p) => (
                                    <SelectItem key={p.id} value={p.id}>{p.nome}{p.categoria ? ` · ${p.categoria}` : ""}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="py-1.5">
                              <Input type="number" min={1} className="h-8 text-sm w-20" value={line.quantidade} onChange={(e) => updateCatLine(idx, { quantidade: Math.max(1, parseInt(e.target.value) || 1) })} />
                            </TableCell>
                            <TableCell className="py-1.5 text-right font-mono text-sm text-muted-foreground">
                              {prod ? <>{fmtCurrency(prod.precoBase)}<span className="text-xs ml-1">/{prod.unidade}</span></> : "—"}
                            </TableCell>
                            <TableCell className="py-1.5 text-right font-mono text-sm font-medium">{prod ? fmtCurrency(subtotal) : "—"}</TableCell>
                            <TableCell className="py-1.5">
                              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeCatLine(idx)} disabled={cartLines.length === 1}>
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex items-center justify-end gap-3 mt-2 pr-2">
                  <span className="text-sm text-muted-foreground">Total estimado:</span>
                  <span className="text-lg font-bold">{fmtCurrency(catTotal)}</span>
                </div>
                {cartError && <p className="text-sm text-destructive mt-1">{cartError}</p>}
              </div>
            )}

            {/* ── LIVRE MODE ────────────────────────────────────────────────── */}
            {mode === "livre" && (
              <div className="space-y-3">
                {/* AI suggestion panel */}
                <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-3 space-y-2">
                  <button
                    type="button"
                    className="flex items-center gap-2 text-sm font-medium text-violet-800 w-full"
                    onClick={() => setShowIAPanel((p) => !p)}
                  >
                    <Sparkles className="h-4 w-4" />
                    Sugerir itens com IA
                    <span className="ml-auto text-violet-500 text-xs">{showIAPanel ? "▲" : "▼"}</span>
                  </button>
                  {showIAPanel && (
                    <div className="space-y-2 pt-1">
                      <Textarea
                        placeholder="Descreva o que o cliente precisa (opcional)…  Ex: instalação de câmeras de segurança para escritório de 200m²"
                        className="resize-none text-sm h-20 bg-white"
                        value={contextoIA}
                        onChange={(e) => setContextoIA(e.target.value)}
                      />
                      <Button
                        type="button"
                        size="sm"
                        className="w-full gap-2 bg-violet-700 hover:bg-violet-800 text-white"
                        disabled={suggesting}
                        onClick={suggestItems}
                      >
                        {suggesting ? (
                          <><Loader2 className="h-4 w-4 animate-spin" />Gerando itens...</>
                        ) : (
                          <><Sparkles className="h-4 w-4" />Gerar sugestão de itens</>
                        )}
                      </Button>
                      <p className="text-[11px] text-violet-600">A IA usa o título, lead e perfil do seu negócio para sugerir itens relevantes e preços de mercado.</p>
                    </div>
                  )}
                </div>

                {/* Editable items table */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium">Itens do Orçamento</p>
                    <Button type="button" variant="outline" size="sm" onClick={addFreeItem}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar item
                    </Button>
                  </div>
                  <div className="rounded-md border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs py-2">Descrição do item</TableHead>
                          <TableHead className="text-xs py-2 w-20">Qtd</TableHead>
                          <TableHead className="text-xs py-2 w-32">Valor unit. (R$)</TableHead>
                          <TableHead className="text-xs py-2 w-28 text-right">Subtotal</TableHead>
                          <TableHead className="w-8 py-2" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {freeItems.map((item) => {
                          const subtotal = item.quantidade * item.valorUnitario;
                          return (
                            <TableRow key={item.id}>
                              <TableCell className="py-1.5">
                                <Input
                                  className="h-8 text-sm"
                                  placeholder="Ex: Instalação de câmera"
                                  value={item.nome}
                                  onChange={(e) => updateFreeItem(item.id, { nome: e.target.value })}
                                />
                              </TableCell>
                              <TableCell className="py-1.5">
                                <Input
                                  type="number"
                                  min={1}
                                  step={1}
                                  className="h-8 text-sm w-16"
                                  value={item.quantidade}
                                  onChange={(e) => updateFreeItem(item.id, { quantidade: Math.max(1, parseFloat(e.target.value) || 1) })}
                                />
                              </TableCell>
                              <TableCell className="py-1.5">
                                <Input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  className="h-8 text-sm w-28"
                                  value={item.valorUnitario || ""}
                                  placeholder="0,00"
                                  onChange={(e) => updateFreeItem(item.id, { valorUnitario: parseFloat(e.target.value) || 0 })}
                                />
                              </TableCell>
                              <TableCell className="py-1.5 text-right font-mono text-sm font-medium">
                                {item.nome ? fmtCurrency(subtotal) : "—"}
                              </TableCell>
                              <TableCell className="py-1.5">
                                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeFreeItem(item.id)} disabled={freeItems.length === 1}>
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="flex items-center justify-end gap-3 mt-2 pr-2">
                    <span className="text-sm text-muted-foreground">Total:</span>
                    <span className="text-lg font-bold">{fmtCurrency(freeTotal)}</span>
                  </div>
                  {freeError && <p className="text-sm text-destructive mt-1">{freeError}</p>}
                </div>
              </div>
            )}

            {/* Validade + Observações */}
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="validadeAte" render={({ field }) => (
                <FormItem>
                  <FormLabel>Validade <span className="text-muted-foreground text-xs">(opcional)</span></FormLabel>
                  <FormControl><Input type="date" {...field} value={field.value ?? ""} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="observacoes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Observações <span className="text-muted-foreground text-xs">(opcional)</span></FormLabel>
                  <FormControl><Input placeholder="Notas para o lead…" {...field} value={field.value ?? ""} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Condições Comerciais */}
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="condPagamento" render={({ field }) => (
                <FormItem>
                  <FormLabel>Condição de Pagamento <span className="text-muted-foreground text-xs">(opcional)</span></FormLabel>
                  <FormControl><Input placeholder="Ex: 30/60/90 dias, à vista" {...field} value={field.value ?? ""} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="prazoEntrega" render={({ field }) => (
                <FormItem>
                  <FormLabel>Prazo de Entrega <span className="text-muted-foreground text-xs">(opcional)</span></FormLabel>
                  <FormControl><Input placeholder="Ex: 7 dias úteis" {...field} value={field.value ?? ""} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={handleClose}>Cancelar</Button>
              <Button type="submit" className="flex-1" disabled={isPending}>
                {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Criar Proposta
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ── Proposta Detail Sheet ─────────────────────────────────────────────────────
function PropostaDetailSheet({
  proposta,
  leadName,
  onClose,
}: {
  proposta: Proposta | null;
  leadName: string;
  onClose: () => void;
}) {
  if (!proposta) return null;
  const statusCfg = STATUS_CONFIG[proposta.status] ?? STATUS_CONFIG.rascunho;
  const total = proposta.itens.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0);

  return (
    <Sheet open={!!proposta} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-[440px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{proposta.titulo}</SheetTitle>
        </SheetHeader>
        <div className="mt-5 space-y-5">
          {/* Status + meta */}
          <div className="flex items-center gap-3">
            <Badge variant="outline" className={`${statusCfg.className} text-xs`}>
              {statusCfg.label}
            </Badge>
            {proposta.validadeAte && (
              <span className="text-xs text-muted-foreground">
                Válida até {fmtDate(proposta.validadeAte)}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Lead</p>
              <p className="font-medium">{leadName}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Criada em</p>
              <p className="font-medium">{fmtDate(proposta.createdAt)}</p>
            </div>
          </div>

          <Separator />

          {/* Items */}
          <div>
            <p className="text-sm font-semibold mb-3">Itens</p>
            {proposta.itens.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum item</p>
            ) : (
              <div className="space-y-2">
                {proposta.itens.map((item, i) => (
                  <div key={i} className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">{item.nome}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.quantidade}× {fmtCurrency(item.valorUnitario)}
                      </p>
                    </div>
                    <p className="text-sm font-semibold font-mono">
                      {fmtCurrency(item.quantidade * item.valorUnitario)}
                    </p>
                  </div>
                ))}
                <div className="flex items-center justify-between px-3 pt-1">
                  <span className="text-sm font-semibold">Total</span>
                  <span className="text-lg font-bold">{fmtCurrency(proposta.valorTotal ?? total)}</span>
                </div>
              </div>
            )}
          </div>

          {(proposta.condPagamento || proposta.prazoEntrega) && (
            <>
              <Separator />
              <div className="grid grid-cols-2 gap-4 text-sm">
                {proposta.condPagamento && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Condição Pagamento</p>
                    <p className="font-medium">{proposta.condPagamento}</p>
                  </div>
                )}
                {proposta.prazoEntrega && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Prazo Entrega</p>
                    <p className="font-medium">{proposta.prazoEntrega}</p>
                  </div>
                )}
              </div>
            </>
          )}

          {proposta.observacoes && (
            <>
              <Separator />
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Observações</p>
                <p className="text-sm">{proposta.observacoes}</p>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Proposta Viewer (modelo print-ready) ─────────────────────────────────────
function PropostaViewer({
  proposta,
  tenantId,
  sellerName,
  sellerEmail,
  onClose,
}: {
  proposta: Proposta;
  tenantId: string;
  sellerName: string;
  sellerEmail: string;
  onClose: () => void;
}) {
  const { data: biz } = useGetBusinessProfileByTenant(tenantId, {
    query: { queryKey: getGetBusinessProfileByTenantQueryKey(tenantId), enabled: !!tenantId },
  });
  const { data: lead } = useGetLead(proposta.leadId, {
    query: { queryKey: getGetLeadQueryKey(proposta.leadId), enabled: !!proposta.leadId },
  });

  const total = proposta.valorTotal
    ?? proposta.itens.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0);
  const propNum = proposta.id.slice(-8).toUpperCase();
  const statusCfg = STATUS_CONFIG[proposta.status] ?? STATUS_CONFIG.rascunho;

  // Inject print CSS so only #proposta-print renders when Ctrl+P / Save as PDF
  useEffect(() => {
    const style = document.createElement("style");
    style.id = "__proposta-print-css";
    style.textContent = `
      @media print {
        body * { visibility: hidden !important; }
        #proposta-print, #proposta-print * { visibility: visible !important; }
        #proposta-print {
          position: fixed !important;
          inset: 0 !important;
          padding: 32px !important;
          overflow: visible !important;
          background: white !important;
        }
      }
    `;
    document.head.appendChild(style);
    return () => { document.getElementById("__proposta-print-css")?.remove(); };
  }, []);

  function handlePrint() {
    window.print();
  }

  function buildText() {
    const empresa = biz?.nomeFantasia || biz?.razaoSocial || "";
    const lines: string[] = [];
    lines.push(`*${proposta.titulo}*`);
    if (empresa) lines.push(`*${empresa}*`);
    lines.push(`Nº ${propNum}`);
    lines.push(`Data: ${fmtDate(proposta.createdAt)}`);
    if (proposta.validadeAte) lines.push(`Válida até: ${fmtDate(proposta.validadeAte)}`);
    lines.push("");
    if (lead?.nome) lines.push(`Cliente: ${lead.nome}`);
    lines.push("");
    lines.push("*Itens:*");
    proposta.itens.forEach((it) => {
      lines.push(`• ${it.nome} × ${it.quantidade} — ${fmtCurrency(it.valorUnitario)}`);
    });
    lines.push(`\n*Total: ${fmtCurrency(total)}*`);
    if (proposta.condPagamento) lines.push(`\nPagamento: ${proposta.condPagamento}`);
    if (proposta.prazoEntrega)  lines.push(`Entrega: ${proposta.prazoEntrega}`);
    if (proposta.observacoes)   lines.push(`\n${proposta.observacoes}`);
    if (sellerName) lines.push(`\nVendedor: ${sellerName}`);
    return lines.join("\n");
  }

  function handleWhatsApp() {
    const phone = lead?.telefone?.replace(/\D/g, "") ?? "";
    const text  = encodeURIComponent(buildText());
    const url   = phone
      ? `https://wa.me/55${phone}?text=${text}`
      : `https://wa.me/?text=${text}`;
    window.open(url, "_blank", "noopener");
  }

  function handleEmail() {
    const subject = encodeURIComponent(`Proposta Comercial — ${proposta.titulo}`);
    const body = encodeURIComponent(buildText().replace(/\*/g, ""));
    const to = lead?.email ?? "";
    window.open(`mailto:${to}?subject=${subject}&body=${body}`, "_self");
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[95vh] overflow-y-auto p-0">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-5 py-3 border-b bg-muted/30 print:hidden">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Modelo da Proposta</span>
            <Badge variant="outline" className={`text-xs ${statusCfg.className}`}>{statusCfg.label}</Badge>
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={handleWhatsApp} className="text-emerald-700 border-emerald-300 hover:bg-emerald-50 hidden sm:inline-flex">
              <MessageCircle className="h-4 w-4 mr-1.5" /> WhatsApp
            </Button>
            <Button variant="outline" size="sm" onClick={handleEmail} className="hidden sm:inline-flex">
              <Mail className="h-4 w-4 mr-1.5" /> E-mail
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-1.5" /> <span className="hidden sm:inline">Imprimir / </span>PDF
            </Button>
            {/* Mobile: dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 sm:hidden">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleWhatsApp}><MessageCircle className="h-4 w-4 mr-2 text-emerald-600" />Enviar WhatsApp</DropdownMenuItem>
                <DropdownMenuItem onClick={handleEmail}><Mail className="h-4 w-4 mr-2" />Enviar E-mail</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handlePrint}><Printer className="h-4 w-4 mr-2" />Imprimir / PDF</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Document */}
        <div id="proposta-print" className="bg-white text-gray-900 p-8 md:p-12 space-y-8 min-h-[800px]">

          {/* Header: logo + company */}
          <div className="flex items-start justify-between gap-6 pb-6 border-b-2 border-gray-900">
            <div className="flex items-center gap-4">
              {biz?.logoUrl ? (
                <img src={biz.logoUrl} alt="Logo" className="h-14 w-auto object-contain max-w-[120px]" />
              ) : (
                <div className="h-14 w-14 rounded-lg bg-gray-100 flex items-center justify-center">
                  <Building2 className="h-7 w-7 text-gray-400" />
                </div>
              )}
              <div>
                <h2 className="text-xl font-bold leading-tight">
                  {biz?.nomeFantasia || biz?.razaoSocial || "Empresa"}
                </h2>
                {biz?.razaoSocial && biz.nomeFantasia && biz.razaoSocial !== biz.nomeFantasia && (
                  <p className="text-xs text-gray-500">{biz.razaoSocial}</p>
                )}
                {biz?.cnpj && <p className="text-xs text-gray-500">CNPJ: {biz.cnpj}</p>}
              </div>
            </div>
            <div className="text-right text-xs text-gray-500 space-y-0.5">
              {biz?.endereco && <p className="flex items-center gap-1 justify-end"><MapPin className="h-3 w-3" />{biz.endereco}</p>}
              {biz?.telefone && <p className="flex items-center gap-1 justify-end"><Phone className="h-3 w-3" />{biz.telefone}</p>}
              {biz?.email && <p className="flex items-center gap-1 justify-end"><Mail className="h-3 w-3" />{biz.email}</p>}
            </div>
          </div>

          {/* Title + meta */}
          <div className="space-y-1">
            <div className="flex items-baseline justify-between gap-4">
              <h1 className="text-2xl font-bold tracking-tight">{proposta.titulo}</h1>
              <span className="text-sm text-gray-500 whitespace-nowrap">Nº {propNum}</span>
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-gray-500">
              <span>Data: <strong className="text-gray-700">{fmtDate(proposta.createdAt)}</strong></span>
              {proposta.validadeAte && (
                <span>Válida até: <strong className="text-gray-700">{fmtDate(proposta.validadeAte)}</strong></span>
              )}
            </div>
          </div>

          {/* Para / Vendedor */}
          <div className="grid grid-cols-2 gap-6 bg-gray-50 rounded-lg p-5 border border-gray-200">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Cliente</p>
              <p className="font-semibold text-base">{lead?.nome ?? "—"}</p>
              {lead?.empresa && <p className="text-sm text-gray-600">{lead.empresa}</p>}
              {lead?.telefone && (
                <p className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
                  <Phone className="h-3 w-3" /> {lead.telefone}
                </p>
              )}
              {lead?.email && (
                <p className="text-sm text-gray-500 flex items-center gap-1">
                  <Mail className="h-3 w-3" /> {lead.email}
                </p>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Vendedor</p>
              <p className="font-semibold text-base flex items-center gap-1.5">
                <User className="h-4 w-4 text-gray-400" /> {sellerName || "—"}
              </p>
              {sellerEmail && (
                <p className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
                  <Mail className="h-3 w-3" /> {sellerEmail}
                </p>
              )}
            </div>
          </div>

          {/* Items table */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Itens</p>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b-2 border-gray-900">
                  <th className="text-left py-2 font-semibold text-gray-700">Descrição</th>
                  <th className="text-center py-2 font-semibold text-gray-700 w-20">Qtd</th>
                  <th className="text-right py-2 font-semibold text-gray-700 w-28">Valor Unit.</th>
                  <th className="text-right py-2 font-semibold text-gray-700 w-28">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {proposta.itens.map((item, i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/60"}>
                    <td className="py-2.5 pr-4 text-gray-800">{item.nome}</td>
                    <td className="py-2.5 text-center text-gray-600">{item.quantidade}</td>
                    <td className="py-2.5 text-right font-mono text-gray-600">{fmtCurrency(item.valorUnitario)}</td>
                    <td className="py-2.5 text-right font-mono font-medium">{fmtCurrency(item.quantidade * item.valorUnitario)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-900">
                  <td colSpan={3} className="pt-3 pr-4 text-right text-sm font-semibold text-gray-700 uppercase tracking-wide">
                    Total
                  </td>
                  <td className="pt-3 text-right font-mono text-lg font-bold text-gray-900">
                    {fmtCurrency(total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Condições comerciais */}
          {(proposta.condPagamento || proposta.prazoEntrega) && (
            <div className="border border-gray-200 rounded-lg p-5">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Condições Comerciais</p>
              <div className="grid grid-cols-2 gap-6 text-sm">
                {proposta.condPagamento && (
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Condição de Pagamento</p>
                    <p className="font-medium text-gray-800">{proposta.condPagamento}</p>
                  </div>
                )}
                {proposta.prazoEntrega && (
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Prazo de Entrega</p>
                    <p className="font-medium text-gray-800">{proposta.prazoEntrega}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Observações */}
          {proposta.observacoes && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Observações</p>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{proposta.observacoes}</p>
            </div>
          )}

          {/* Footer */}
          <div className="pt-6 border-t border-gray-200 flex items-center justify-between text-xs text-gray-400">
            <span>{biz?.nomeFantasia || biz?.razaoSocial || ""}</span>
            <span>Proposta #{propNum}</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Propostas() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const tenantId = user?.tenantId ?? "";

  const [modalOpen, setModalOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const [detailProposta, setDetailProposta] = useState<Proposta | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Proposta | null>(null);
  const [viewProposta, setViewProposta] = useState<Proposta | null>(null);

  const { data: propostas = [], isLoading } = useListPropostas(tenantId, undefined, {
    query: { queryKey: getListPropostasQueryKey(tenantId), enabled: !!tenantId },
  });

  const { data: leads = [] } = useListTenantLeads(tenantId, {
    query: { queryKey: getListTenantLeadsQueryKey(tenantId), enabled: !!tenantId },
  });

  const { data: catalog = [] } = useListProdutosCatalogo(tenantId, {
    query: { queryKey: getListProdutosCatalogoQueryKey(tenantId), enabled: !!tenantId },
  });

  const statusMut = useUpdatePropostaStatus();
  const deleteMut = useDeleteProposta();

  // Build leadId → name map
  const leadMap = Object.fromEntries(leads.map((l) => [l.id, l.nome]));

  function changeStatus(p: Proposta, status: PropostaStatus) {
    statusMut.mutate(
      { id: p.id, data: { status } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListPropostasQueryKey(tenantId) });
          toast({ title: `Proposta marcada como "${STATUS_CONFIG[status]?.label ?? status}"` });
        },
        onError: () => toast({ title: "Erro ao alterar status", variant: "destructive" }),
      }
    );
  }

  function doDelete() {
    if (!deleteTarget) return;
    deleteMut.mutate(
      { id: deleteTarget.id },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListPropostasQueryKey(tenantId) });
          toast({ title: "Proposta excluída" });
          setDeleteTarget(null);
        },
        onError: () => toast({ title: "Erro ao excluir", variant: "destructive" }),
      }
    );
  }

  // Summary counts
  const counts = {
    rascunho: propostas.filter((p) => p.status === "rascunho").length,
    enviada:  propostas.filter((p) => p.status === "enviada").length,
    aceita:   propostas.filter((p) => p.status === "aceita").length,
    rejeitada:propostas.filter((p) => p.status === "rejeitada").length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Propostas</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Gerencie orçamentos e propostas comerciais</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setCatOpen(true)} className="flex-1 sm:flex-none min-h-[44px]">
            <BookOpen className="h-4 w-4 mr-2" />
            Catálogo
          </Button>
          <Button onClick={() => setModalOpen(true)} className="flex-1 sm:flex-none min-h-[44px]">
            <Plus className="h-4 w-4 mr-2" />
            Nova Proposta
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {(["rascunho", "enviada", "aceita", "rejeitada"] as const).map((k) => (
          <Card key={k}>
            <CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">
                {STATUS_CONFIG[k].label}s
              </p>
              <p className="text-2xl font-bold mt-0.5">{counts[k]}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2" /> Carregando…
            </div>
          ) : propostas.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-20 text-muted-foreground">
              <FileText className="h-10 w-10 opacity-25" />
              <p className="text-sm">Nenhuma proposta criada ainda</p>
              <Button variant="outline" size="sm" onClick={() => setModalOpen(true)}>
                <Plus className="h-4 w-4 mr-1.5" /> Criar primeira proposta
              </Button>
            </div>
          ) : (
            <>
            {/* Mobile card list */}
            <div className="md:hidden divide-y">
              {propostas.map((p) => {
                const statusCfg = STATUS_CONFIG[p.status] ?? STATUS_CONFIG.rascunho;
                const canSend   = p.status === "rascunho";
                const canAccept = p.status === "enviada";
                const canReject = p.status === "enviada";
                const canDelete = p.status === "rascunho";
                return (
                  <div
                    key={p.id}
                    className="p-4 space-y-2 cursor-pointer hover:bg-muted/50 active:bg-muted/80 transition-colors"
                    onClick={() => setDetailProposta(p)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{p.titulo}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {leadMap[p.leadId] ?? p.leadId.slice(0, 8) + "…"}
                        </p>
                      </div>
                      <div onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setDetailProposta(p)}><Eye className="h-4 w-4 mr-2" />Ver detalhes</DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setViewProposta(p); }}><Printer className="h-4 w-4 mr-2" />Visualizar modelo</DropdownMenuItem>
                            {canSend && <DropdownMenuItem onClick={() => changeStatus(p, "enviada")}><Send className="h-4 w-4 mr-2" />Enviar proposta</DropdownMenuItem>}
                            {canAccept && <DropdownMenuItem onClick={() => changeStatus(p, "aceita")}><CheckCircle2 className="h-4 w-4 mr-2 text-emerald-600" />Marcar aceita</DropdownMenuItem>}
                            {canReject && <DropdownMenuItem onClick={() => changeStatus(p, "rejeitada")}><XCircle className="h-4 w-4 mr-2 text-red-500" />Marcar rejeitada</DropdownMenuItem>}
                            {canDelete && (<><DropdownMenuSeparator /><DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteTarget(p)}><Trash2 className="h-4 w-4 mr-2" />Excluir</DropdownMenuItem></>)}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="outline" className={`text-xs ${statusCfg.className}`}>{statusCfg.label}</Badge>
                      <span className="text-sm font-semibold font-mono">{fmtCurrency(p.valorTotal)}</span>
                    </div>
                    {p.validadeAte && (
                      <p className="text-xs text-muted-foreground">Válida até {fmtDate(p.validadeAte)}</p>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Desktop table */}
            <Table className="hidden md:table">
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>Lead</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Valor Total</TableHead>
                  <TableHead>Válida até</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {propostas.map((p) => {
                  const statusCfg = STATUS_CONFIG[p.status] ?? STATUS_CONFIG.rascunho;
                  const canSend    = p.status === "rascunho";
                  const canAccept  = p.status === "enviada";
                  const canReject  = p.status === "enviada";
                  const canDelete  = p.status === "rascunho";

                  return (
                    <TableRow
                      key={p.id}
                      className="cursor-pointer"
                      onClick={() => setDetailProposta(p)}
                    >
                      <TableCell className="font-medium">{p.titulo}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {leadMap[p.leadId] ?? p.leadId.slice(0, 8) + "…"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs ${statusCfg.className}`}>
                          {statusCfg.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-medium">
                        {fmtCurrency(p.valorTotal)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {fmtDate(p.validadeAte)}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setDetailProposta(p)}>
                              <Eye className="h-4 w-4 mr-2" /> Ver detalhes
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setViewProposta(p); }}>
                              <Printer className="h-4 w-4 mr-2" /> Visualizar modelo
                            </DropdownMenuItem>
                            {canSend && (
                              <DropdownMenuItem onClick={() => changeStatus(p, "enviada")}>
                                <Send className="h-4 w-4 mr-2" /> Enviar proposta
                              </DropdownMenuItem>
                            )}
                            {canAccept && (
                              <DropdownMenuItem onClick={() => changeStatus(p, "aceita")}>
                                <CheckCircle2 className="h-4 w-4 mr-2 text-emerald-600" /> Marcar aceita
                              </DropdownMenuItem>
                            )}
                            {canReject && (
                              <DropdownMenuItem onClick={() => changeStatus(p, "rejeitada")}>
                                <XCircle className="h-4 w-4 mr-2 text-red-500" /> Marcar rejeitada
                              </DropdownMenuItem>
                            )}
                            {canDelete && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => setDeleteTarget(p)}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" /> Excluir
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

      {/* Modals */}
      <PropostaModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        tenantId={tenantId}
        catalog={catalog}
      />
      <CatalogoModal open={catOpen} onClose={() => setCatOpen(false)} tenantId={tenantId} />
      <PropostaDetailSheet
        proposta={detailProposta}
        leadName={detailProposta ? (leadMap[detailProposta.leadId] ?? "—") : ""}
        onClose={() => setDetailProposta(null)}
      />
      {viewProposta && (
        <PropostaViewer
          proposta={viewProposta}
          tenantId={tenantId}
          sellerName={user?.name ?? user?.email ?? ""}
          sellerEmail={user?.email ?? ""}
          onClose={() => setViewProposta(null)}
        />
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir proposta?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget?.titulo}</strong> será excluída permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
