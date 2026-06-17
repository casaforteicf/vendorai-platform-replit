import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import {
  useListVarejoProdutos,
  useCreateVarejoProduto,
  useDeleteVarejoProduto,
  useListVarejoColecoes,
  useListVarejoFornecedores,
  getListVarejoProdutosQueryKey,
} from "@workspace/api-client-react";
import type { VarejoProduto } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Shirt, Pencil, Trash2, Search, ExternalLink } from "lucide-react";

const CATEGORIAS = ["camiseta", "calca", "vestido", "short", "jaqueta", "blazer", "saia", "acessorio", "calcado", "bolsa", "outro"] as const;
const CATEGORIA_LABELS: Record<string, string> = {
  camiseta: "Camiseta", calca: "Calça", vestido: "Vestido", short: "Short",
  jaqueta: "Jaqueta", blazer: "Blazer", saia: "Saia", acessorio: "Acessório",
  calcado: "Calçado", bolsa: "Bolsa", outro: "Outro",
};
const GENEROS = ["masculino", "feminino", "unissex", "infantil"] as const;
const GENERO_LABELS: Record<string, string> = {
  masculino: "Masculino", feminino: "Feminino", unissex: "Unissex", infantil: "Infantil",
};

function ProdutoForm({
  onSave,
  onCancel,
  isPending,
  colecoes,
  fornecedores,
}: {
  onSave: (d: Record<string, unknown>) => void;
  onCancel: () => void;
  isPending: boolean;
  colecoes: { id: string; nome: string }[];
  fornecedores: { id: string; nome: string }[];
}) {
  const [form, setForm] = useState({
    nome: "",
    codigo: "",
    descricao: "",
    categoria: "",
    genero: "",
    precoCompra: "",
    precoVenda: "",
    colecaoId: "",
    fornecedorId: "",
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload: Record<string, unknown> = { ...form };
    Object.keys(payload).forEach((k) => { if (payload[k] === "") delete payload[k]; });
    onSave(payload);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-2">
          <Label>Nome *</Label>
          <Input required value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} />
        </div>
        <div className="space-y-2">
          <Label>Código / Referência</Label>
          <Input value={form.codigo} onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value }))} />
        </div>
        <div className="space-y-2">
          <Label>Categoria</Label>
          <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm" value={form.categoria} onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}>
            <option value="">-- Selecione --</option>
            {CATEGORIAS.map((c) => <option key={c} value={c}>{CATEGORIA_LABELS[c]}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <Label>Gênero</Label>
          <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm" value={form.genero} onChange={(e) => setForm((f) => ({ ...f, genero: e.target.value }))}>
            <option value="">-- Selecione --</option>
            {GENEROS.map((g) => <option key={g} value={g}>{GENERO_LABELS[g]}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <Label>Preço de Compra (R$)</Label>
          <Input type="number" step="0.01" min="0" value={form.precoCompra} onChange={(e) => setForm((f) => ({ ...f, precoCompra: e.target.value }))} />
        </div>
        <div className="space-y-2">
          <Label>Preço de Venda (R$) *</Label>
          <Input required type="number" step="0.01" min="0" value={form.precoVenda} onChange={(e) => setForm((f) => ({ ...f, precoVenda: e.target.value }))} />
        </div>
        {fornecedores.length > 0 && (
          <div className="space-y-2">
            <Label>Fornecedor</Label>
            <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm" value={form.fornecedorId} onChange={(e) => setForm((f) => ({ ...f, fornecedorId: e.target.value }))}>
              <option value="">-- Nenhum --</option>
              {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </div>
        )}
        {colecoes.length > 0 && (
          <div className="space-y-2">
            <Label>Coleção</Label>
            <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm" value={form.colecaoId} onChange={(e) => setForm((f) => ({ ...f, colecaoId: e.target.value }))}>
              <option value="">-- Nenhuma --</option>
              {colecoes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
        )}
        <div className="col-span-2 space-y-2">
          <Label>Descrição</Label>
          <Input value={form.descricao} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} />
        </div>
      </div>
      <div className="flex gap-2 justify-end pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" disabled={isPending}>{isPending ? "Salvando..." : "Salvar e gerir grade →"}</Button>
      </div>
    </form>
  );
}

export default function VarejoProdutos() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const qc = useQueryClient();
  const [, navigate] = useLocation();

  const [filters, setFilters] = useState({ colecaoId: "", categoria: "", genero: "", search: "" });

  const { data: produtos = [], isLoading } = useListVarejoProdutos(tenantId, {
    colecaoId: filters.colecaoId || undefined,
    categoria: filters.categoria || undefined,
    genero: filters.genero || undefined,
  });
  const { data: colecoes = [] } = useListVarejoColecoes(tenantId);
  const { data: fornecedores = [] } = useListVarejoFornecedores(tenantId);

  const createMut = useCreateVarejoProduto();
  const deleteMut = useDeleteVarejoProduto();

  const [open, setOpen] = useState(false);

  function invalidate() {
    qc.invalidateQueries({ queryKey: getListVarejoProdutosQueryKey(tenantId) });
  }

  function handleSave(data: Record<string, unknown>) {
    createMut.mutate({ tenantId, data: { ...data, tenantId } as any }, {
      onSuccess: (p) => {
        setOpen(false);
        invalidate();
        navigate(`/varejo/produtos/${p.id}`);
      },
    });
  }

  const filtered = filters.search
    ? produtos.filter((p) => [p.nome, p.codigo, p.descricao].join(" ").toLowerCase().includes(filters.search.toLowerCase()))
    : produtos;

  const totalEstoque = (p: VarejoProduto) =>
    (p.grades ?? []).reduce((s: number, g: any) => s + (g.estoque ?? 0), 0);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Produtos</h1>
          <p className="text-muted-foreground text-sm">Catálogo completo com grade de tamanho × cor</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Novo Produto
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9 w-48" placeholder="Buscar..." value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} />
        </div>
        <select className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm" value={filters.colecaoId} onChange={(e) => setFilters((f) => ({ ...f, colecaoId: e.target.value }))}>
          <option value="">Todas as coleções</option>
          {colecoes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <select className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm" value={filters.categoria} onChange={(e) => setFilters((f) => ({ ...f, categoria: e.target.value }))}>
          <option value="">Todas as categorias</option>
          {CATEGORIAS.map((c) => <option key={c} value={c}>{CATEGORIA_LABELS[c]}</option>)}
        </select>
        <select className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm" value={filters.genero} onChange={(e) => setFilters((f) => ({ ...f, genero: e.target.value }))}>
          <option value="">Todos os gêneros</option>
          {GENEROS.map((g) => <option key={g} value={g}>{GENERO_LABELS[g]}</option>)}
        </select>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Novo Produto</DialogTitle></DialogHeader>
          <ProdutoForm
            onSave={handleSave}
            onCancel={() => setOpen(false)}
            isPending={createMut.isPending}
            colecoes={colecoes}
            fornecedores={fornecedores}
          />
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Shirt className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground">Nenhum produto encontrado.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => {
            const estoque = totalEstoque(p);
            const variants = (p.grades ?? []).length;
            return (
              <Card key={p.id} className="hover:shadow-sm transition-shadow cursor-pointer" onClick={() => navigate(`/varejo/produtos/${p.id}`)}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="text-sm truncate">{p.nome}</CardTitle>
                      {p.codigo && <p className="text-xs text-muted-foreground">#{p.codigo}</p>}
                    </div>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground mt-0.5" />
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  <div className="flex flex-wrap gap-1">
                    {p.categoria && (
                      <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">{CATEGORIA_LABELS[p.categoria]}</span>
                    )}
                    {p.genero && (
                      <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{GENERO_LABELS[p.genero]}</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-primary">R$ {Number(p.precoVenda).toFixed(2)}</span>
                    <span className={`text-xs ${estoque === 0 ? "text-red-500" : estoque <= 5 ? "text-yellow-600" : "text-green-600"}`}>
                      {estoque} un · {variants} variantes
                    </span>
                  </div>
                  <div className="flex gap-1 justify-end pt-1">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive h-7 w-7 p-0"
                          onClick={(e) => e.stopPropagation()}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir produto?</AlertDialogTitle>
                          <AlertDialogDescription>Todas as grades e dados do produto serão removidos.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction className="bg-destructive text-destructive-foreground"
                            onClick={() => deleteMut.mutate({ tenantId, produtoId: p.id }, { onSuccess: invalidate })}>
                            Excluir
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
