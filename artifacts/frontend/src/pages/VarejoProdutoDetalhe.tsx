import { VendorBackButton } from "@/components/ui/back-button";
import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import {
  useGetVarejoProduto,
  useUpdateVarejoProduto,
  useListVarejoGrades,
  useCreateVarejoGrade,
  useUpdateVarejoGrade,
  useDeleteVarejoGrade,
  useListVarejoColecoes,
  useListVarejoFornecedores,
  getListVarejoGradesQueryKey,
  getGetVarejoProdutoQueryKey,
} from "@workspace/api-client-react";
import type { VarejoGrade } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Grid3X3, Package, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const CATEGORIAS = ["camiseta","calca","vestido","short","jaqueta","blazer","saia","acessorio","calcado","bolsa","outro"] as const;
const CATEGORIA_LABELS: Record<string,string> = {
  camiseta:"Camiseta",calca:"Calça",vestido:"Vestido",short:"Short",jaqueta:"Jaqueta",
  blazer:"Blazer",saia:"Saia",acessorio:"Acessório",calcado:"Calçado",bolsa:"Bolsa",outro:"Outro",
};
const GENEROS = ["masculino","feminino","unissex","infantil"] as const;
const GENERO_LABELS: Record<string,string> = {masculino:"Masculino",feminino:"Feminino",unissex:"Unissex",infantil:"Infantil"};

function GradeForm({
  initial,
  onSave,
  onCancel,
  isPending,
}: {
  initial?: Partial<VarejoGrade>;
  onSave: (d: Record<string, unknown>) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState({
    tamanho: initial?.tamanho ?? "",
    cor: initial?.cor ?? "",
    estoque: String(initial?.estoque ?? 0),
    estoqueMinimo: String(initial?.estoqueMinimo ?? 0),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ ...form, estoque: Number(form.estoque), estoqueMinimo: Number(form.estoqueMinimo) });
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Tamanho *</Label>
          <Input required placeholder="P, M, G, GG, 38, 40..." value={form.tamanho} onChange={(e) => setForm((f) => ({ ...f, tamanho: e.target.value }))} />
        </div>
        <div className="space-y-2">
          <Label>Cor *</Label>
          <Input required placeholder="Preto, Branco, Azul..." value={form.cor} onChange={(e) => setForm((f) => ({ ...f, cor: e.target.value }))} />
        </div>
        <div className="space-y-2">
          <Label>Estoque (un.)</Label>
          <Input type="number" min="0" value={form.estoque} onChange={(e) => setForm((f) => ({ ...f, estoque: e.target.value }))} />
        </div>
        <div className="space-y-2">
          <Label>Estoque Mínimo</Label>
          <Input type="number" min="0" value={form.estoqueMinimo} onChange={(e) => setForm((f) => ({ ...f, estoqueMinimo: e.target.value }))} />
        </div>
      </div>
      <div className="flex gap-2 justify-end pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" disabled={isPending}>{isPending ? "Salvando..." : "Salvar"}</Button>
      </div>
    </form>
  );
}

export default function VarejoProdutoDetalhe() {
  const [, params] = useRoute("/varejo/produtos/:produtoId");
  const { toast } = useToast();
  const produtoId = params?.produtoId ?? "";
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const qc = useQueryClient();
  const [, navigate] = useLocation();

  const { data: produto, isLoading } = useGetVarejoProduto(tenantId, produtoId);
  const { data: grades = [], isLoading: gradesLoading } = useListVarejoGrades(tenantId, produtoId);
  const { data: colecoes = [] } = useListVarejoColecoes(tenantId);
  const { data: fornecedores = [] } = useListVarejoFornecedores(tenantId);

  const updateProduto = useUpdateVarejoProduto();
  const createGrade = useCreateVarejoGrade();
  const updateGrade = useUpdateVarejoGrade();
  const deleteGrade = useDeleteVarejoGrade();

  const [gradeOpen, setGradeOpen] = useState(false);
  const [editingGrade, setEditingGrade] = useState<VarejoGrade | null>(null);
  const [editProduto, setEditProduto] = useState(false);
  const [prodForm, setProdForm] = useState<Record<string,string>>({});

  function invalidateGrades() {
    qc.invalidateQueries({ queryKey: getListVarejoGradesQueryKey(tenantId, produtoId) });
    qc.invalidateQueries({ queryKey: getGetVarejoProdutoQueryKey(tenantId, produtoId) });
  }

  function handleGradeSave(data: Record<string, unknown>) {
    if (editingGrade) {
      updateGrade.mutate({ tenantId, produtoId, gradeId: editingGrade.id, data: data as any }, {
        onSuccess: () => { setEditingGrade(null); invalidateGrades(); },
        onError: (error: unknown) => toast({ title: "Não foi possível atualizar a grade", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" }),
      });
    } else {
      createGrade.mutate({ tenantId, produtoId, data: { ...data, tenantId, produtoId } as any }, {
        onSuccess: () => { setGradeOpen(false); invalidateGrades(); },
        onError: (error: unknown) => toast({ title: "Não foi possível criar a grade", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" }),
      });
    }
  }

  function startEditProduto() {
    if (!produto) return;
    setProdForm({
      nome: produto.nome,
      codigo: produto.codigo ?? "",
      descricao: produto.descricao ?? "",
      categoria: produto.categoria ?? "",
      genero: produto.genero ?? "",
      precoCompra: produto.precoCompra ?? "",
      precoVenda: produto.precoVenda,
      colecaoId: produto.colecaoId ?? "",
      fornecedorId: produto.fornecedorId ?? "",
    });
    setEditProduto(true);
  }

  function handleProdutoSave(e: React.FormEvent) {
    e.preventDefault();
    const payload: Record<string,unknown> = { ...prodForm };
    Object.keys(payload).forEach((k) => { if (payload[k] === "") delete payload[k]; });
    updateProduto.mutate({ tenantId, produtoId, data: payload as any }, {
      onSuccess: () => {
        setEditProduto(false);
        qc.invalidateQueries({ queryKey: getGetVarejoProdutoQueryKey(tenantId, produtoId) });
      },
      onError: (error: unknown) => toast({ title: "Não foi possível atualizar o produto", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" }),
    });
  }

  // Build grade matrix: rows = cores, cols = tamanhos
  const tamanhos = [...new Set(grades.map((g) => g.tamanho))].sort();
  const cores = [...new Set(grades.map((g) => g.cor))].sort();
  const gradeMap = Object.fromEntries(grades.map((g) => [`${g.tamanho}||${g.cor}`, g]));

  const totalEstoque = grades.reduce((s, g) => s + g.estoque, 0);
  const baixoEstoque = grades.filter((g) => g.estoque <= g.estoqueMinimo && g.estoque > 0).length;
  const semEstoque = grades.filter((g) => g.estoque === 0).length;

  if (isLoading) return <div className="p-8 text-muted-foreground">Carregando...</div>;
  if (!produto) return <div className="p-8 text-muted-foreground">Produto não encontrado.</div>;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <VendorBackButton to="/varejo/produtos" label="Voltar para produtos" />
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold truncate">{produto.nome}</h1>
          {produto.codigo && <p className="text-sm text-muted-foreground">Ref: {produto.codigo}</p>}
        </div>
        <Button variant="outline" size="sm" onClick={startEditProduto}>
          <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
        </Button>
      </div>

      {/* Produto info */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Preço de Venda</p>
            <p className="text-lg font-bold text-primary">R$ {Number(produto.precoVenda).toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total em Estoque</p>
            <p className="text-lg font-bold">{totalEstoque} un.</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Estoque Baixo</p>
            <p className={`text-lg font-bold ${baixoEstoque > 0 ? "text-yellow-600" : ""}`}>{baixoEstoque} variantes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Sem Estoque</p>
            <p className={`text-lg font-bold ${semEstoque > 0 ? "text-red-500" : ""}`}>{semEstoque} variantes</p>
          </CardContent>
        </Card>
      </div>

      {/* Grade grid */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Grid3X3 className="h-4 w-4" />
              Grade de Tamanho × Cor
            </CardTitle>
            <Button size="sm" onClick={() => setGradeOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {gradesLoading ? (
            <div className="text-center py-6 text-muted-foreground">Carregando grade...</div>
          ) : grades.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="h-8 w-8 mx-auto mb-2" />
              <p>Nenhuma variante cadastrada. Adicione tamanho × cor.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left p-2 font-medium text-muted-foreground bg-muted/40 rounded-l">Cor \ Tamanho</th>
                    {tamanhos.map((t) => (
                      <th key={t} className="p-2 font-medium text-muted-foreground bg-muted/40 text-center">{t}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cores.map((cor) => (
                    <tr key={cor} className="border-b last:border-0">
                      <td className="p-2 font-medium">{cor}</td>
                      {tamanhos.map((tam) => {
                        const g = gradeMap[`${tam}||${cor}`];
                        if (!g) return <td key={tam} className="p-2 text-center text-muted-foreground/40">–</td>;
                        const isLow = g.estoque <= g.estoqueMinimo && g.estoque > 0;
                        const isEmpty = g.estoque === 0;
                        return (
                          <td key={tam} className="p-1 text-center">
                            <div
                              className={`relative group rounded px-2 py-1 cursor-pointer transition-colors ${isEmpty ? "bg-red-50 text-red-600" : isLow ? "bg-yellow-50 text-yellow-700" : "bg-green-50 text-green-700"}`}
                              onClick={() => setEditingGrade(g)}
                            >
                              <span className="font-semibold">{g.estoque}</span>
                              {isLow && !isEmpty && <AlertTriangle className="h-3 w-3 absolute -top-1 -right-1 text-yellow-500" />}
                              <div className="hidden group-hover:flex absolute -top-8 left-1/2 -translate-x-1/2 gap-1 z-10">
                                <Button size="icon" variant="secondary" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); setEditingGrade(g); }}>
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button size="icon" variant="secondary" className="h-6 w-6 text-destructive" onClick={(e) => { e.stopPropagation(); deleteGrade.mutate({ tenantId, produtoId, gradeId: g.id }, { onSuccess: invalidateGrades, onError: (error: unknown) => toast({ title: "Não foi possível excluir a grade", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" }) }); }}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-muted-foreground mt-2">Clique em uma célula para editar o estoque. Verde = OK · Amarelo = abaixo do mínimo · Vermelho = zerado.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* List view for grades */}
      {grades.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Lista de Variantes</CardTitle></CardHeader>
          <CardContent>
            <div className="divide-y">
              {grades.map((g) => (
                <div key={g.id} className="flex items-center justify-between py-2">
                  <div>
                    <span className="font-medium text-sm">{g.tamanho}</span>
                    <span className="text-muted-foreground text-sm"> — {g.cor}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-semibold ${g.estoque === 0 ? "text-red-500" : g.estoque <= g.estoqueMinimo ? "text-yellow-600" : "text-green-600"}`}>
                      {g.estoque} un.
                    </span>
                    <span className="text-xs text-muted-foreground">mín: {g.estoqueMinimo}</span>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingGrade(g)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remover variante?</AlertDialogTitle>
                          <AlertDialogDescription>Tamanho {g.tamanho} / Cor {g.cor}</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction className="bg-destructive text-destructive-foreground"
                            onClick={() => deleteGrade.mutate({ tenantId, produtoId, gradeId: g.id }, { onSuccess: invalidateGrades, onError: (error: unknown) => toast({ title: "Não foi possível excluir a grade", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" }) })}>
                            Remover
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Modals */}
      <Dialog open={gradeOpen} onOpenChange={setGradeOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova Variante</DialogTitle></DialogHeader>
          <GradeForm onSave={handleGradeSave} onCancel={() => setGradeOpen(false)} isPending={createGrade.isPending} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingGrade} onOpenChange={(v) => !v && setEditingGrade(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Variante</DialogTitle></DialogHeader>
          {editingGrade && (
            <GradeForm initial={editingGrade} onSave={handleGradeSave} onCancel={() => setEditingGrade(null)} isPending={updateGrade.isPending} />
          )}
        </DialogContent>
      </Dialog>

      {/* Edit produto dialog */}
      <Dialog open={editProduto} onOpenChange={setEditProduto}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Editar Produto</DialogTitle></DialogHeader>
          <form onSubmit={handleProdutoSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-2">
                <Label>Nome *</Label>
                <Input required value={prodForm.nome ?? ""} onChange={(e) => setProdForm((f) => ({ ...f, nome: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Código</Label>
                <Input value={prodForm.codigo ?? ""} onChange={(e) => setProdForm((f) => ({ ...f, codigo: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Categoria</Label>
                <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm" value={prodForm.categoria ?? ""} onChange={(e) => setProdForm((f) => ({ ...f, categoria: e.target.value }))}>
                  <option value="">-- Selecione --</option>
                  {CATEGORIAS.map((c) => <option key={c} value={c}>{CATEGORIA_LABELS[c]}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Gênero</Label>
                <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm" value={prodForm.genero ?? ""} onChange={(e) => setProdForm((f) => ({ ...f, genero: e.target.value }))}>
                  <option value="">-- Selecione --</option>
                  {GENEROS.map((g) => <option key={g} value={g}>{GENERO_LABELS[g]}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Preço Compra (R$)</Label>
                <Input type="number" step="0.01" value={prodForm.precoCompra ?? ""} onChange={(e) => setProdForm((f) => ({ ...f, precoCompra: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Preço Venda (R$) *</Label>
                <Input required type="number" step="0.01" value={prodForm.precoVenda ?? ""} onChange={(e) => setProdForm((f) => ({ ...f, precoVenda: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Fornecedor</Label>
                <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm" value={prodForm.fornecedorId ?? ""} onChange={(e) => setProdForm((f) => ({ ...f, fornecedorId: e.target.value }))}>
                  <option value="">-- Nenhum --</option>
                  {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Coleção</Label>
                <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm" value={prodForm.colecaoId ?? ""} onChange={(e) => setProdForm((f) => ({ ...f, colecaoId: e.target.value }))}>
                  <option value="">-- Nenhuma --</option>
                  {colecoes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Descrição</Label>
                <Input value={prodForm.descricao ?? ""} onChange={(e) => setProdForm((f) => ({ ...f, descricao: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" variant="outline" onClick={() => setEditProduto(false)}>Cancelar</Button>
              <Button type="submit" disabled={updateProduto.isPending}>{updateProduto.isPending ? "Salvando..." : "Salvar"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
