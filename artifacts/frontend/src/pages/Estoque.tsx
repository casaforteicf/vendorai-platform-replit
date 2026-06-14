import { useState } from "react";
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
} from "@workspace/api-client-react";
import type { InventoryItem, InventoryMovement } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  const [showNovoItem, setShowNovoItem]         = useState(false);
  const [movItem, setMovItem]                   = useState<InventoryItem | null>(null);
  const [activeTab, setActiveTab]               = useState<"itens" | "historico">("itens");

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

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createItem = useCreateInventoryItem();
  const registerMov = useRegisterInventoryMovement();

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
  const produtoMap = Object.fromEntries(produtos.map((p) => [p.id, p.nome]));

  const lowStockCount = items.filter(isLowStock).length;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
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
        <Button onClick={() => setShowNovoItem(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Item
        </Button>
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
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "itens" | "historico")}>
        <TabsList className="mb-2">
          <TabsTrigger value="itens" className="gap-2">
            <Package className="h-4 w-4" />
            Itens em Estoque
          </TabsTrigger>
          <TabsTrigger value="historico" className="gap-2">
            <SlidersHorizontal className="h-4 w-4" />
            Histórico de Movimentações
          </TabsTrigger>
        </TabsList>

        {/* ── Tab: Itens ──────────────────────────────────────────────── */}
        <TabsContent value="itens">
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
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produto</TableHead>
                      <TableHead className="text-center">Qtd. Atual</TableHead>
                      <TableHead className="text-center">Qtd. Mínima</TableHead>
                      <TableHead>Unidade</TableHead>
                      <TableHead>Localização</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => {
                      const low = isLowStock(item);
                      const prodNome = produtoMap[item.produtoId] ?? item.produtoId;
                      return (
                        <TableRow key={item.id} className={low ? "bg-red-50/50" : undefined}>
                          <TableCell className="font-medium">{prodNome}</TableCell>
                          <TableCell className="text-center">
                            <span className={low ? "text-red-600 font-bold" : "font-semibold"}>
                              {formatQty(item.quantidadeAtual)}
                            </span>
                          </TableCell>
                          <TableCell className="text-center text-muted-foreground">
                            {formatQty(item.quantidadeMinima)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{item.unidade}</TableCell>
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
              )}
            </CardContent>
          </Card>
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
                <Table>
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
    </div>
  );
}
