import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import {
  useListInventoryItems,
  getListInventoryItemsQueryKey,
  useCreateInventoryItem,
  useRegisterInventoryMovement,
  useListInventoryMovements,
  getListInventoryMovementsQueryKey,
  useListProdutosCatalogo,
  getListProdutosCatalogoQueryKey,
  useImportInventoryItemsCsv,
  useListTenantLeads,
  getListTenantLeadsQueryKey,
  useCreatePropostaFromCatalogo,
  getListPropostasQueryKey,
} from "@workspace/api-client-react";
import type { InventoryItem, InventoryMovement, ImportInventoryResult, ProdutoCatalogo } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Package,
  Plus,
  TrendingDown,
  TrendingUp,
  SlidersHorizontal,
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Loader2,
  Upload,
  Download,
  CheckCircle2,
  XCircle,
  Search,
  Filter,
  X,
  Eye,
  FileText,
  Tag,
  ShoppingCart,
  ImageIcon,
  Warehouse,
  ChevronRight,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────

function isLowStock(item: InventoryItem): boolean {
  const atual = parseFloat(item.quantidadeAtual ?? "0");
  const minima = parseFloat(item.quantidadeMinima ?? "0");
  return atual <= minima;
}

function formatQty(qty: string | null | undefined): string {
  if (!qty) return "0";
  const n = parseFloat(qty);
  return isNaN(n) ? "0" : Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function formatDate(d: string): string {
  return new Date(d).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const tipoConfig = {
  entrada: { label: "Entrada", icon: ArrowDownToLine, className: "text-emerald-600 bg-emerald-50 border-emerald-200" },
  saida:   { label: "Saída",   icon: ArrowUpFromLine, className: "text-red-600 bg-red-50 border-red-200" },
  ajuste:  { label: "Ajuste",  icon: SlidersHorizontal, className: "text-blue-600 bg-blue-50 border-blue-200" },
} as const;

// ── CSV parser ────────────────────────────────────────────────────────────────

const CSV_TEMPLATE = "nome,sku,quantidade,quantidade_minima,preco,categoria,unidade,localizacao\nProduto Exemplo,SKU001,100,10,29.90,Eletrônicos,un,Prateleira A1";

type CsvRow = {
  nome: string; sku?: string; quantidade: string;
  quantidadeMinima?: string; preco?: string;
  categoria?: string; unidade?: string; localizacao?: string;
};

function parseCsv(text: string): { rows: CsvRow[]; errors: string[] } {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(Boolean);
  const errors: string[] = [];
  if (lines.length < 2) return { rows: [], errors: ["Arquivo deve ter cabeçalho + ao menos 1 linha"] };

  const header = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/[^a-z_]/g, ""));
  const nomeIdx     = header.indexOf("nome");
  const qtyIdx      = header.findIndex((h) => h === "quantidade" || h === "qtd" || h === "qty");
  const qtyMinIdx   = header.findIndex((h) => h === "quantidade_minima" || h === "qtd_minima" || h === "qty_min" || h === "estoque_minimo");
  const precoIdx    = header.findIndex((h) => h === "preco" || h === "preo" || h === "price");
  const catIdx      = header.findIndex((h) => h === "categoria" || h === "category");
  const unidIdx     = header.findIndex((h) => h === "unidade" || h === "unit");
  const locIdx      = header.findIndex((h) => h === "localizacao" || h === "localizaco" || h === "location");

  if (nomeIdx === -1) return { rows: [], errors: ["Coluna 'nome' não encontrada no cabeçalho"] };
  if (qtyIdx  === -1) return { rows: [], errors: ["Coluna 'quantidade' não encontrada no cabeçalho"] };

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const nome = cols[nomeIdx] ?? "";
    const qty  = (cols[qtyIdx] ?? "").replace(",", ".");
    if (!nome) { errors.push(`Linha ${i + 1}: nome vazio`); continue; }
    if (!qty || isNaN(parseFloat(qty))) { errors.push(`Linha ${i + 1}: quantidade inválida`); continue; }
    rows.push({
      nome,
      sku:              cols[header.indexOf("sku")] || undefined,
      quantidade:       qty,
      quantidadeMinima: qtyMinIdx >= 0 ? (cols[qtyMinIdx] ?? "").replace(",", ".") || undefined : undefined,
      preco:            precoIdx >= 0  ? (cols[precoIdx]  ?? "").replace(",", ".") || undefined : undefined,
      categoria:        catIdx >= 0    ? cols[catIdx]  || undefined : undefined,
      unidade:          unidIdx >= 0   ? cols[unidIdx] || undefined : undefined,
      localizacao:      locIdx >= 0    ? cols[locIdx]  || undefined : undefined,
    });
  }
  return { rows, errors };
}

function downloadTemplate() {
  const blob = new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = "template-estoque.csv"; a.click();
  URL.revokeObjectURL(url);
}

// ── Schemas ───────────────────────────────────────────────────────────────────

const novoItemSchema = z.object({
  produtoId:        z.string().min(1, "Selecione um produto"),
  quantidadeAtual:  z.string().min(1, "Obrigatório").regex(/^\d+(\.\d+)?$/, "Número inválido"),
  quantidadeMinima: z.string().min(1, "Obrigatório").regex(/^\d+(\.\d+)?$/, "Número inválido"),
  unidade:          z.string().min(1, "Obrigatório"),
  localizacao:      z.string().optional(),
});

const movimentacaoSchema = z.object({
  tipo:      z.enum(["entrada", "saida", "ajuste"]),
  quantidade: z.string().min(1, "Obrigatório").regex(/^\d+(\.\d+)?$/, "Número inválido"),
  motivo:    z.string().min(3, "Mínimo 3 caracteres"),
});

type NovoItemForm     = z.infer<typeof novoItemSchema>;
type MovimentacaoForm = z.infer<typeof movimentacaoSchema>;

// ── Main component ────────────────────────────────────────────────────────────

export default function Estoque() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [showNovoItem, setShowNovoItem]         = useState(false);
  const [movItem, setMovItem]                   = useState<InventoryItem | null>(null);
  const [activeTab, setActiveTab]               = useState<"itens" | "historico" | "catalogo">("itens");
  const [showImport, setShowImport]             = useState(false);
  const [csvRows, setCsvRows]                   = useState<CsvRow[]>([]);
  const [csvParseErrors, setCsvParseErrors]     = useState<string[]>([]);
  const [importResult, setImportResult]         = useState<ImportInventoryResult | null>(null);
  const [search, setSearch]                     = useState("");
  const [categoriaFilter, setCategoriaFilter]   = useState<string>("__all__");
  // Catálogo
  const [catalogSearch, setCatalogSearch]       = useState("");
  const [viewProduto, setViewProduto]           = useState<ProdutoCatalogo | null>(null);
  const [addToProposta, setAddToProposta]       = useState<ProdutoCatalogo | null>(null);

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: items = [], isLoading: loadingItems } = useListInventoryItems(tenantId, {
    query: { queryKey: getListInventoryItemsQueryKey(tenantId), enabled: !!tenantId },
  });
  const { data: produtos = [] } = useListProdutosCatalogo(tenantId, {
    query: { queryKey: getListProdutosCatalogoQueryKey(tenantId), enabled: !!tenantId },
  });
  const { data: movements = [], isLoading: loadingMovements } = useListInventoryMovements(tenantId, undefined, {
    query: { queryKey: getListInventoryMovementsQueryKey(tenantId), enabled: !!tenantId },
  });
  const { data: leads = [] } = useListTenantLeads(tenantId, undefined, {
    query: { queryKey: getListTenantLeadsQueryKey(tenantId), enabled: !!tenantId },
  });

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createItem       = useCreateInventoryItem();
  const registerMov      = useRegisterInventoryMovement();
  const importCsv        = useImportInventoryItemsCsv();
  const createProposta   = useCreatePropostaFromCatalogo();

  // ── Forms ─────────────────────────────────────────────────────────────────
  const novoItemForm = useForm<NovoItemForm>({
    resolver: zodResolver(novoItemSchema),
    defaultValues: { produtoId: "", quantidadeAtual: "", quantidadeMinima: "", unidade: "un", localizacao: "" },
  });

  const movForm = useForm<MovimentacaoForm>({
    resolver: zodResolver(movimentacaoSchema),
    defaultValues: { tipo: "entrada", quantidade: "", motivo: "" },
  });

  // ── Handlers ──────────────────────────────────────────────────────────────
  function handleCsvFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { rows, errors } = parseCsv(text);
      setCsvRows(rows);
      setCsvParseErrors(errors);
      setImportResult(null);
    };
    reader.readAsText(file, "utf-8");
  }

  function handleConfirmImport() {
    if (!csvRows.length) return;
    importCsv.mutate(
      { tenantId, data: { rows: csvRows } },
      {
        onSuccess: (result) => {
          setImportResult(result);
          setCsvRows([]);
          qc.invalidateQueries({ queryKey: getListInventoryItemsQueryKey(tenantId) });
          qc.invalidateQueries({ queryKey: getListProdutosCatalogoQueryKey(tenantId) });
          toast({
            title: `${result.imported} ${result.imported === 1 ? "item importado" : "itens importados"}`,
            description: result.skipped > 0 ? `${result.skipped} já existiam e foram ignorados.` : undefined,
          });
        },
        onError: () => toast({ title: "Erro ao importar", variant: "destructive" }),
      }
    );
  }

  function handleImportClose() {
    setShowImport(false);
    setCsvRows([]);
    setCsvParseErrors([]);
    setImportResult(null);
  }

  function handleSubmitNovoItem(values: NovoItemForm) {
    createItem.mutate(
      { data: { tenantId, ...values } },
      {
        onSuccess: () => {
          toast({ title: "Item criado com sucesso" });
          qc.invalidateQueries({ queryKey: getListInventoryItemsQueryKey(tenantId) });
          setShowNovoItem(false);
          novoItemForm.reset();
        },
        onError: () => toast({ title: "Erro ao criar item", variant: "destructive" }),
      }
    );
  }

  function handleSubmitMovimentacao(values: MovimentacaoForm) {
    if (!movItem) return;
    registerMov.mutate(
      { tenantId, id: movItem.id, data: values },
      {
        onSuccess: () => {
          toast({ title: "Movimentação registrada" });
          qc.invalidateQueries({ queryKey: getListInventoryItemsQueryKey(tenantId) });
          qc.invalidateQueries({ queryKey: getListInventoryMovementsQueryKey(tenantId) });
          setMovItem(null);
          movForm.reset();
        },
        onError: (err: any) => {
          const msg = err?.response?.data?.error ?? "Erro ao registrar movimentação";
          toast({ title: msg, variant: "destructive" });
        },
      }
    );
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const produtoMap    = Object.fromEntries(produtos.map((p) => [p.id, p.nome]));
  const precoMap      = Object.fromEntries(produtos.map((p) => [p.id, p.precoBase]));
  const categoriaMap  = Object.fromEntries(produtos.map((p) => [p.id, p.categoriaNome ?? ""]));

  const categoriasDisponiveis = [...new Set(
    items.map((i) => categoriaMap[i.produtoId] ?? "").filter(Boolean)
  )].sort();

  const filteredItems = items.filter((item) => {
    const prodNome = (produtoMap[item.produtoId] ?? "").toLowerCase();
    const matchesSearch = !search.trim() || prodNome.includes(search.toLowerCase().trim());
    const cat = categoriaMap[item.produtoId] ?? "";
    const matchesCategoria = categoriaFilter === "__all__" || cat === categoriaFilter;
    return matchesSearch && matchesCategoria;
  });

  const lowStockCount = items.filter(isLowStock).length;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg shrink-0">
            <Package className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Estoque</h1>
            <p className="text-sm text-muted-foreground">
              {items.length} {items.length === 1 ? "item" : "itens"} cadastrados
              {lowStockCount > 0 && (
                <span className="ml-2 text-red-600 font-medium">
                  · {lowStockCount} com estoque baixo
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowImport(true)} className="gap-2 flex-1 sm:flex-none min-h-[44px]">
            <Upload className="h-4 w-4" />
            <span className="sm:inline">Importar CSV</span>
          </Button>
          <Button onClick={() => setShowNovoItem(true)} className="gap-2 flex-1 sm:flex-none min-h-[44px]">
            <Plus className="h-4 w-4" />
            Novo Item
          </Button>
        </div>
      </div>

      {/* Low-stock alert banner */}
      {lowStockCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            <strong>{lowStockCount} {lowStockCount === 1 ? "item está" : "itens estão"} abaixo</strong> da quantidade mínima. Verifique e reabasteça.
          </span>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "itens" | "historico" | "catalogo")}>
        <TabsList className="mb-2">
          <TabsTrigger value="itens" className="gap-2">
            <Package className="h-4 w-4" />
            Itens em Estoque
          </TabsTrigger>
          <TabsTrigger value="catalogo" className="gap-2">
            <Eye className="h-4 w-4" />
            Consultar Catálogo
          </TabsTrigger>
          <TabsTrigger value="historico" className="gap-2">
            <SlidersHorizontal className="h-4 w-4" />
            Histórico
          </TabsTrigger>
        </TabsList>

        {/* ── Tab: Itens ──────────────────────────────────────────────── */}
        <TabsContent value="itens">
          {/* Search + Sector filter bar */}
          <div className="flex flex-col sm:flex-row gap-2 mb-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Buscar produto…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-9"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="relative sm:w-52">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
              <Select value={categoriaFilter} onValueChange={setCategoriaFilter}>
                <SelectTrigger className="pl-9">
                  <SelectValue placeholder="Todos os setores" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos os setores</SelectItem>
                  {categoriasDisponiveis.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              {loadingItems ? (
                <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Carregando itens…
                </div>
              ) : items.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
                  <Package className="h-12 w-12 text-muted-foreground/40" />
                  <div>
                    <p className="font-medium text-muted-foreground">Nenhum item no estoque</p>
                    <p className="text-sm text-muted-foreground/70">Clique em "Novo Item" para começar</p>
                  </div>
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
                  <Search className="h-12 w-12 text-muted-foreground/40" />
                  <div>
                    <p className="font-medium text-muted-foreground">Nenhum item encontrado</p>
                    <p className="text-sm text-muted-foreground/70">Tente outros termos ou remova o filtro de setor</p>
                  </div>
                </div>
              ) : (
                <>
                {/* Mobile cards */}
                <div className="md:hidden divide-y">
                  {filteredItems.map((item) => {
                    const low = isLowStock(item);
                    const prodNome = produtoMap[item.produtoId] ?? item.produtoId;
                    return (
                      <div key={item.id} className={`p-4 space-y-2 ${low ? "border-l-4 border-l-red-500" : ""}`}>
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium text-sm">{prodNome}</p>
                          {low ? (
                            <Badge variant="destructive" className="gap-1 text-xs shrink-0">
                              <AlertTriangle className="h-3 w-3" />Baixo
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs text-emerald-700 bg-emerald-50 border-emerald-200 shrink-0">Normal</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <span className={low ? "text-red-600 font-bold" : "font-semibold"}>
                            {formatQty(item.quantidadeAtual)} {item.unidade}
                          </span>
                          <span className="text-muted-foreground text-xs">mín. {formatQty(item.quantidadeMinima)}</span>
                          {precoMap[item.produtoId] && (
                            <span className="text-muted-foreground text-xs tabular-nums">
                              R$ {parseFloat(precoMap[item.produtoId]).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          )}
                          {item.localizacao && <span className="text-muted-foreground text-xs">{item.localizacao}</span>}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 w-full min-h-[40px]"
                          onClick={() => {
                            setMovItem(item);
                            movForm.reset({ tipo: "entrada", quantidade: "", motivo: "" });
                          }}
                        >
                          <TrendingUp className="h-3.5 w-3.5" />
                          Registrar Movimentação
                        </Button>
                      </div>
                    );
                  })}
                </div>
                {/* Desktop table */}
                <Table className="hidden md:table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produto</TableHead>
                      <TableHead>Setor</TableHead>
                      <TableHead className="text-center">Qtd. Atual</TableHead>
                      <TableHead className="text-center">Qtd. Mínima</TableHead>
                      <TableHead>Unidade</TableHead>
                      <TableHead className="text-right">Valor Unit.</TableHead>
                      <TableHead>Localização</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.map((item) => {
                      const low = isLowStock(item);
                      const prodNome = produtoMap[item.produtoId] ?? item.produtoId;
                      return (
                        <TableRow key={item.id} className={low ? "bg-red-50/50" : undefined}>
                          <TableCell className="font-medium">{prodNome}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {categoriaMap[item.produtoId] || <span className="text-muted-foreground/40">—</span>}
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={low ? "text-red-600 font-bold" : "font-semibold"}>
                              {formatQty(item.quantidadeAtual)}
                            </span>
                          </TableCell>
                          <TableCell className="text-center text-muted-foreground">
                            {formatQty(item.quantidadeMinima)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{item.unidade}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {precoMap[item.produtoId]
                              ? `R$ ${parseFloat(precoMap[item.produtoId]).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                              : <span className="text-muted-foreground/40">—</span>}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {item.localizacao ?? <span className="text-muted-foreground/40">—</span>}
                          </TableCell>
                          <TableCell>
                            {low ? (
                              <Badge variant="destructive" className="gap-1 text-xs">
                                <AlertTriangle className="h-3 w-3" />
                                Estoque Baixo
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs text-emerald-700 bg-emerald-50 border-emerald-200">
                                Normal
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5"
                              onClick={() => {
                                setMovItem(item);
                                movForm.reset({ tipo: "entrada", quantidade: "", motivo: "" });
                              }}
                            >
                              <TrendingUp className="h-3.5 w-3.5" />
                              Movimentação
                            </Button>
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
        </TabsContent>

        {/* ── Tab: Catálogo ───────────────────────────────────────────── */}
        <TabsContent value="catalogo">
          {/* Search bar */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Buscar produto no catálogo…"
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
              className="pl-9 pr-9"
            />
            {catalogSearch && (
              <button
                onClick={() => setCatalogSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {produtos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
              <Package className="h-12 w-12 text-muted-foreground/40" />
              <div>
                <p className="font-medium text-muted-foreground">Nenhum produto no catálogo</p>
                <p className="text-sm text-muted-foreground/70">Cadastre produtos em Configurações → Catálogo de Produtos</p>
              </div>
            </div>
          ) : (
            (() => {
              const q = catalogSearch.toLowerCase().trim();
              const filtered = produtos.filter((p) =>
                !q || p.nome.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q) || (p.categoriaNome ?? "").toLowerCase().includes(q)
              );
              if (filtered.length === 0) return (
                <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
                  <Search className="h-12 w-12 text-muted-foreground/40" />
                  <p className="font-medium text-muted-foreground">Nenhum produto encontrado</p>
                </div>
              );
              // Map produtoId → inventoryItem for stock overlay
              const stockByProduto: Record<string, InventoryItem> = {};
              for (const item of items) {
                if (!stockByProduto[item.produtoId]) stockByProduto[item.produtoId] = item;
              }
              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filtered.map((produto) => {
                    const inv = stockByProduto[produto.id];
                    const qty = inv ? parseFloat(inv.quantidadeAtual ?? "0") : null;
                    const low = inv ? isLowStock(inv) : false;
                    return (
                      <button
                        key={produto.id}
                        onClick={() => setViewProduto(produto)}
                        className="text-left group rounded-lg border bg-card hover:border-primary/60 hover:shadow-sm transition-all p-4 space-y-3"
                      >
                        {/* Image or placeholder */}
                        <div className="aspect-video rounded-md bg-muted/50 overflow-hidden flex items-center justify-center">
                          {produto.imagemUrl ? (
                            <img
                              src={produto.imagemUrl.startsWith("/objects/") ? `/api/storage${produto.imagemUrl}` : produto.imagemUrl}
                              alt={produto.nome}
                              className="w-full h-full object-cover"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                            />
                          ) : (
                            <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
                          )}
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-semibold text-sm leading-tight group-hover:text-primary transition-colors line-clamp-2">{produto.nome}</p>
                            {!produto.ativo && <Badge variant="secondary" className="text-xs shrink-0">Inativo</Badge>}
                          </div>
                          {produto.sku && <p className="text-xs text-muted-foreground font-mono">SKU: {produto.sku}</p>}
                          {produto.categoriaNome && (
                            <Badge variant="outline" className="text-xs gap-1 w-fit">
                              <Tag className="h-2.5 w-2.5" />{produto.categoriaNome}
                            </Badge>
                          )}
                        </div>
                        <Separator />
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-sm tabular-nums">
                            R$ {parseFloat(produto.precoBase).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            <span className="text-xs font-normal text-muted-foreground ml-1">/{produto.unidade}</span>
                          </span>
                          {qty !== null ? (
                            <Badge variant={low ? "destructive" : "secondary"} className={`text-xs ${!low ? "text-emerald-700 bg-emerald-50 border-emerald-200" : ""}`}>
                              <Warehouse className="h-3 w-3 mr-1" />
                              {formatQty(inv?.quantidadeAtual)} {inv?.unidade}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs text-muted-foreground">Sem estoque</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                          <Eye className="h-3 w-3" /> Ver detalhes
                          <ChevronRight className="h-3 w-3 ml-auto" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })()
          )}
        </TabsContent>

        {/* ── Tab: Histórico ──────────────────────────────────────────── */}
        <TabsContent value="historico">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Últimas Movimentações</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loadingMovements ? (
                <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Carregando histórico…
                </div>
              ) : movements.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
                  <TrendingDown className="h-12 w-12 text-muted-foreground/40" />
                  <div>
                    <p className="font-medium text-muted-foreground">Nenhuma movimentação registrada</p>
                    <p className="text-sm text-muted-foreground/70">As movimentações aparecerão aqui conforme forem registradas</p>
                  </div>
                </div>
              ) : (
                <>
                {/* Mobile cards */}
                <div className="md:hidden divide-y">
                  {movements.map((mov) => {
                    const tipo = tipoConfig[mov.tipo as keyof typeof tipoConfig] ?? tipoConfig.ajuste;
                    const TipoIcon = tipo.icon;
                    const itemName = (() => {
                      const item = items.find((i) => i.id === mov.inventoryItemId);
                      if (!item) return "—";
                      return produtoMap[item.produtoId] ?? "—";
                    })();
                    return (
                      <div key={mov.id} className="p-4 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium text-sm">{itemName}</p>
                          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full border ${tipo.className}`}>
                            <TipoIcon className="h-3 w-3" />
                            {tipo.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-sm">
                          <span className="font-semibold">{mov.tipo === "saida" ? "-" : "+"}{formatQty(mov.quantidade)}</span>
                          <span className="text-muted-foreground text-xs">{formatDate(mov.createdAt)}</span>
                        </div>
                        {mov.motivo && <p className="text-xs text-muted-foreground truncate">{mov.motivo}</p>}
                      </div>
                    );
                  })}
                </div>
                {/* Desktop table */}
                <Table className="hidden md:table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-center">Quantidade</TableHead>
                      <TableHead>Motivo</TableHead>
                      <TableHead className="text-center">Anterior → Novo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movements.map((mov) => {
                      const tipo = tipoConfig[mov.tipo as keyof typeof tipoConfig] ?? tipoConfig.ajuste;
                      const TipoIcon = tipo.icon;

                      const itemName = (() => {
                        const item = items.find((i) => i.id === mov.inventoryItemId);
                        if (!item) return "—";
                        return produtoMap[item.produtoId] ?? "—";
                      })();

                      return (
                        <TableRow key={mov.id}>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                            {formatDate(mov.createdAt)}
                          </TableCell>
                          <TableCell className="font-medium text-sm">{itemName}</TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full border ${tipo.className}`}>
                              <TipoIcon className="h-3 w-3" />
                              {tipo.label}
                            </span>
                          </TableCell>
                          <TableCell className="text-center font-semibold">
                            {mov.tipo === "saida" ? "-" : "+"}{formatQty(mov.quantidade)}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                            {mov.motivo}
                          </TableCell>
                          <TableCell className="text-center text-sm text-muted-foreground">
                            —
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
        </TabsContent>
      </Tabs>

      {/* ── Modal: Novo Item ──────────────────────────────────────────────── */}
      <Dialog open={showNovoItem} onOpenChange={setShowNovoItem}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              Novo Item de Estoque
            </DialogTitle>
          </DialogHeader>
          <Form {...novoItemForm}>
            <form onSubmit={novoItemForm.handleSubmit(handleSubmitNovoItem)} className="space-y-4">
              <FormField
                control={novoItemForm.control}
                name="produtoId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Produto do Catálogo</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione um produto…" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {produtos.length === 0 ? (
                          <div className="py-3 text-center text-sm text-muted-foreground">
                            Nenhum produto no catálogo
                          </div>
                        ) : (
                          produtos.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.nome}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={novoItemForm.control}
                  name="quantidadeAtual"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Qtd. Atual</FormLabel>
                      <FormControl>
                        <Input type="number" min="0" step="0.01" placeholder="0" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={novoItemForm.control}
                  name="quantidadeMinima"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Qtd. Mínima</FormLabel>
                      <FormControl>
                        <Input type="number" min="0" step="0.01" placeholder="0" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={novoItemForm.control}
                  name="unidade"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Unidade</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="un">un (unidade)</SelectItem>
                          <SelectItem value="kg">kg</SelectItem>
                          <SelectItem value="g">g (grama)</SelectItem>
                          <SelectItem value="l">l (litro)</SelectItem>
                          <SelectItem value="ml">ml</SelectItem>
                          <SelectItem value="m">m (metro)</SelectItem>
                          <SelectItem value="cx">cx (caixa)</SelectItem>
                          <SelectItem value="pç">pç (peça)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={novoItemForm.control}
                  name="localizacao"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Localização</FormLabel>
                      <FormControl>
                        <Input placeholder="Ex: Prateleira A3" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowNovoItem(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createItem.isPending} className="gap-2">
                  {createItem.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Criar Item
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Registrar Movimentação ─────────────────────────────────── */}
      <Dialog open={!!movItem} onOpenChange={(open) => { if (!open) setMovItem(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SlidersHorizontal className="h-5 w-5 text-primary" />
              Registrar Movimentação
            </DialogTitle>
            {movItem && (
              <p className="text-sm text-muted-foreground mt-1">
                <strong>{produtoMap[movItem.produtoId] ?? movItem.produtoId}</strong>
                {" — "}estoque atual:{" "}
                <strong className={isLowStock(movItem) ? "text-red-600" : ""}>
                  {formatQty(movItem.quantidadeAtual)} {movItem.unidade}
                </strong>
              </p>
            )}
          </DialogHeader>
          <Form {...movForm}>
            <form onSubmit={movForm.handleSubmit(handleSubmitMovimentacao)} className="space-y-4">
              <FormField
                control={movForm.control}
                name="tipo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de Movimentação</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="entrada">
                          <span className="flex items-center gap-2">
                            <ArrowDownToLine className="h-4 w-4 text-emerald-600" />
                            Entrada — adicionar ao estoque
                          </span>
                        </SelectItem>
                        <SelectItem value="saida">
                          <span className="flex items-center gap-2">
                            <ArrowUpFromLine className="h-4 w-4 text-red-600" />
                            Saída — retirar do estoque
                          </span>
                        </SelectItem>
                        <SelectItem value="ajuste">
                          <span className="flex items-center gap-2">
                            <SlidersHorizontal className="h-4 w-4 text-blue-600" />
                            Ajuste — corrigir quantidade
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={movForm.control}
                name="quantidade"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantidade</FormLabel>
                    <FormControl>
                      <Input type="number" min="0.01" step="0.01" placeholder="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={movForm.control}
                name="motivo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Motivo</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: Compra NF-e 12345, Venda pedido #789…" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setMovItem(null)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={registerMov.isPending} className="gap-2">
                  {registerMov.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Registrar
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Importar CSV ───────────────────────────────────────────── */}
      <Dialog open={showImport} onOpenChange={(open) => { if (!open) handleImportClose(); }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" />
              Importar Estoque via CSV
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Template download */}
            <div className="flex items-center justify-between rounded-lg border border-dashed p-3 bg-muted/30">
              <div className="text-sm text-muted-foreground">
                <p className="font-medium text-foreground">Colunas aceitas:</p>
                <p className="text-xs mt-0.5">nome*, quantidade*, sku, quantidade_minima, preco, categoria, unidade, localizacao</p>
              </div>
              <Button variant="outline" size="sm" onClick={downloadTemplate} className="gap-2 shrink-0">
                <Download className="h-4 w-4" />
                Template CSV
              </Button>
            </div>

            {/* File picker */}
            {!importResult && (
              <div
                className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/20 transition-colors"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleCsvFile(f); }}
                onClick={() => document.getElementById("csv-file-input")?.click()}
              >
                <Upload className="h-8 w-8 text-muted-foreground/50 mb-2" />
                <p className="text-sm font-medium">Clique para selecionar ou arraste o arquivo CSV</p>
                <p className="text-xs text-muted-foreground mt-1">Apenas .csv — máx. 1.000 linhas</p>
                <input
                  id="csv-file-input"
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCsvFile(f); e.target.value = ""; }}
                />
              </div>
            )}

            {/* Parse errors */}
            {csvParseErrors.length > 0 && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 space-y-1">
                {csvParseErrors.map((err, i) => (
                  <p key={i} className="text-sm text-red-700 flex items-start gap-1.5">
                    <XCircle className="h-4 w-4 mt-0.5 shrink-0" />{err}
                  </p>
                ))}
              </div>
            )}

            {/* Preview table */}
            {csvRows.length > 0 && !importResult && (
              <div className="space-y-2">
                <p className="text-sm font-medium">{csvRows.length} linha{csvRows.length !== 1 ? "s" : ""} encontradas — pré-visualização:</p>
                <div className="rounded-lg border max-h-52 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Qtd</TableHead>
                        <TableHead>Qtd Mín.</TableHead>
                        <TableHead>Preço</TableHead>
                        <TableHead>Categoria</TableHead>
                        <TableHead>Unidade</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {csvRows.slice(0, 50).map((row, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium text-sm">{row.nome}</TableCell>
                          <TableCell className="text-sm">{row.quantidade}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{row.quantidadeMinima ?? "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{row.preco ?? "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{row.categoria ?? "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{row.unidade ?? "un"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {csvRows.length > 50 && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      … e mais {csvRows.length - 50} linhas
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Import result */}
            {importResult && (
              <div className="space-y-3">
                <div className="flex items-center gap-3 rounded-lg bg-emerald-50 border border-emerald-200 p-4">
                  <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />
                  <div>
                    <p className="font-semibold text-emerald-800">Importação concluída</p>
                    <p className="text-sm text-emerald-700">
                      {importResult.imported} importado{importResult.imported !== 1 ? "s" : ""}
                      {importResult.skipped > 0 && ` · ${importResult.skipped} ignorado${importResult.skipped !== 1 ? "s" : ""} (já existiam)`}
                    </p>
                  </div>
                </div>
                {importResult.errors.length > 0 && (
                  <div className="rounded-lg bg-red-50 border border-red-200 p-3 space-y-1">
                    <p className="text-sm font-medium text-red-800">Erros em {importResult.errors.length} linha{importResult.errors.length !== 1 ? "s" : ""}:</p>
                    {importResult.errors.map((err, i) => (
                      <p key={i} className="text-xs text-red-700 flex items-start gap-1.5">
                        <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        Linha {err.row} ({err.nome}): {err.error}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={handleImportClose}>
                {importResult ? "Fechar" : "Cancelar"}
              </Button>
              {csvRows.length > 0 && !importResult && (
                <Button onClick={handleConfirmImport} disabled={importCsv.isPending} className="gap-2">
                  {importCsv.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Importar {csvRows.length} {csvRows.length === 1 ? "item" : "itens"}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Sheet: Detalhe do Produto ────────────────────────────────────────── */}
      {viewProduto && (
        <ProdutoDetailSheet
          produto={viewProduto}
          inventoryItem={items.find((i) => i.produtoId === viewProduto.id) ?? null}
          movements={movements.filter((m) => {
            const inv = items.find((i) => i.id === m.inventoryItemId);
            return inv?.produtoId === viewProduto.id;
          })}
          onClose={() => setViewProduto(null)}
          onAddToProposta={() => {
            setAddToProposta(viewProduto);
          }}
        />
      )}

      {/* ── Dialog: Adicionar à Proposta ────────────────────────────────────── */}
      {addToProposta && (
        <AddToPropostaDialog
          produto={addToProposta}
          leads={leads}
          tenantId={tenantId}
          onClose={() => setAddToProposta(null)}
          onSuccess={() => {
            setAddToProposta(null);
            setViewProduto(null);
            setLocation("/propostas");
          }}
          createProposta={createProposta}
          qc={qc}
          toast={toast}
        />
      )}
    </div>
  );
}

// ── ProdutoDetailSheet ────────────────────────────────────────────────────────

function ProdutoDetailSheet({
  produto,
  inventoryItem,
  movements,
  onClose,
  onAddToProposta,
}: {
  produto: ProdutoCatalogo;
  inventoryItem: InventoryItem | null;
  movements: InventoryMovement[];
  onClose: () => void;
  onAddToProposta: () => void;
}) {
  const qty = inventoryItem ? parseFloat(inventoryItem.quantidadeAtual ?? "0") : null;
  const low = inventoryItem ? isLowStock(inventoryItem) : false;

  return (
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-2">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Package className="h-4 w-4 text-primary" />
            Detalhes do Produto
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-5 mt-2">
          {/* Image */}
          {produto.imagemUrl && (
            <div className="rounded-lg overflow-hidden border aspect-video bg-muted flex items-center justify-center">
              <img
                src={produto.imagemUrl.startsWith("/objects/") ? `/api/storage${produto.imagemUrl}` : produto.imagemUrl}
                alt={produto.nome}
                className="w-full h-full object-contain"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            </div>
          )}

          {/* Header info */}
          <div className="space-y-1">
            <div className="flex items-start gap-2 justify-between">
              <h2 className="text-lg font-bold leading-tight">{produto.nome}</h2>
              {!produto.ativo && <Badge variant="secondary" className="shrink-0">Inativo</Badge>}
            </div>
            {produto.sku && <p className="text-xs text-muted-foreground font-mono">SKU: {produto.sku}</p>}
            {produto.categoriaNome && (
              <Badge variant="outline" className="gap-1 w-fit text-xs">
                <Tag className="h-2.5 w-2.5" />{produto.categoriaNome}
              </Badge>
            )}
          </div>

          <Separator />

          {/* Details grid */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Preço base</p>
              <p className="font-bold text-base">
                R$ {parseFloat(produto.precoBase).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Unidade</p>
              <p className="font-semibold">{produto.unidade}</p>
            </div>
          </div>

          {produto.descricao && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Descrição</p>
              <p className="text-sm leading-relaxed">{produto.descricao}</p>
            </div>
          )}

          <Separator />

          {/* Stock section — hidden for SaaS products */}
          {(produto.productType !== "saas_plan" && produto.productType !== "saas_addon") && <div className="space-y-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium flex items-center gap-1.5">
              <Warehouse className="h-3.5 w-3.5" /> Estoque atual
            </p>
            {inventoryItem ? (
              <div className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-2xl font-bold tabular-nums ${low ? "text-red-600" : "text-emerald-600"}`}>
                      {formatQty(inventoryItem.quantidadeAtual)}
                      <span className="text-sm font-normal text-muted-foreground ml-1">{inventoryItem.unidade}</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Mínimo: {formatQty(inventoryItem.quantidadeMinima)} {inventoryItem.unidade}
                    </p>
                  </div>
                  {low ? (
                    <Badge variant="destructive" className="gap-1">
                      <AlertTriangle className="h-3 w-3" /> Estoque Baixo
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-emerald-700 bg-emerald-50 border-emerald-200">
                      Normal
                    </Badge>
                  )}
                </div>
                {inventoryItem.localizacao && (
                  <p className="text-xs text-muted-foreground">
                    📍 Localização: <span className="font-medium text-foreground">{inventoryItem.localizacao}</span>
                  </p>
                )}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                Produto não cadastrado no estoque ainda
              </div>
            )}
          </div>}

          {/* Recent movements */}
          {movements.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium flex items-center gap-1.5">
                <SlidersHorizontal className="h-3.5 w-3.5" /> Últimas movimentações
              </p>
              <div className="divide-y rounded-lg border overflow-hidden">
                {movements.slice(0, 8).map((mov) => {
                  const cfg = tipoConfig[mov.tipo as keyof typeof tipoConfig] ?? tipoConfig.ajuste;
                  const Icon = cfg.icon;
                  return (
                    <div key={mov.id} className="flex items-center justify-between px-3 py-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border font-medium ${cfg.className}`}>
                          <Icon className="h-2.5 w-2.5" />{cfg.label}
                        </span>
                        <span className="text-muted-foreground truncate max-w-[120px]">{mov.motivo}</span>
                      </div>
                      <span className={`font-bold tabular-nums ${mov.tipo === "saida" ? "text-red-600" : "text-emerald-600"}`}>
                        {mov.tipo === "saida" ? "-" : "+"}{formatQty(mov.quantidade)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <Separator />

          {/* Actions */}
          <div className="flex flex-col gap-2 pb-4">
            <Button
              className="w-full gap-2"
              onClick={onAddToProposta}
            >
              <FileText className="h-4 w-4" />
              Adicionar ao Orçamento
            </Button>
            <Button variant="outline" className="w-full" onClick={onClose}>
              Fechar
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── AddToPropostaDialog ───────────────────────────────────────────────────────

const addPropostaSchema = z.object({
  leadId:    z.string().min(1, "Selecione um cliente"),
  titulo:    z.string().min(2, "Mínimo 2 caracteres"),
  quantidade: z.coerce.number({ invalid_type_error: "Número inválido" }).positive("Deve ser > 0"),
});

type AddPropostaForm = z.infer<typeof addPropostaSchema>;

function AddToPropostaDialog({
  produto,
  leads,
  tenantId,
  onClose,
  onSuccess,
  createProposta,
  qc,
  toast,
}: {
  produto: ProdutoCatalogo;
  leads: Array<{ id: string; nome: string }>;
  tenantId: string;
  onClose: () => void;
  onSuccess: () => void;
  createProposta: ReturnType<typeof useCreatePropostaFromCatalogo>;
  qc: ReturnType<typeof useQueryClient>;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const form = useForm<AddPropostaForm>({
    resolver: zodResolver(addPropostaSchema),
    defaultValues: {
      leadId: "",
      titulo: `Orçamento — ${produto.nome}`,
      quantidade: 1,
    },
  });

  function onSubmit(values: AddPropostaForm) {
    createProposta.mutate(
      {
        tenantId,
        data: {
          leadId:    values.leadId,
          titulo:    values.titulo,
          itens:     [{ produtoId: produto.id, quantidade: values.quantidade }],
        },
      },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListPropostasQueryKey(tenantId) });
          toast({ title: "Orçamento criado!", description: "Você será redirecionado para Orçamentos." });
          onSuccess();
        },
        onError: () => toast({ title: "Erro ao criar proposta", variant: "destructive" }),
      }
    );
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary" />
            Adicionar ao Orçamento
          </DialogTitle>
        </DialogHeader>
        <div className="rounded-lg bg-muted/40 border p-3 text-sm mb-1">
          <p className="font-semibold">{produto.nome}</p>
          <p className="text-muted-foreground text-xs mt-0.5">
            R$ {parseFloat(produto.precoBase).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / {produto.unidade}
          </p>
        </div>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="leadId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cliente *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um cliente…" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {leads.length === 0 ? (
                        <div className="py-3 text-center text-sm text-muted-foreground">Nenhum lead cadastrado</div>
                      ) : (
                        leads.map((l) => (
                          <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="titulo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Título do orçamento *</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: Orçamento — Produto X" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="quantidade"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Quantidade *</FormLabel>
                  <FormControl>
                    <Input type="number" min="1" step="1" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
              <Button type="submit" disabled={createProposta.isPending} className="gap-2">
                {createProposta.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Criar Orçamento
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
