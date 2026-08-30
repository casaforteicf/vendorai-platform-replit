import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Package, Plus, Search, Pencil, Trash2, Loader2 } from "lucide-react";

interface ProdutoInterno {
  id: string;
  categoria: string;
  nome: string;
  descricaoUso: string;
  ordem: number;
  ativo: boolean;
}

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` };
}

export default function AdminProdutosInternos() {
  const { toast } = useToast();
  const [produtos, setProdutos] = useState<ProdutoInterno[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState<ProdutoInterno | null>(null);
  const [form, setForm] = useState({ categoria: "", nome: "", descricaoUso: "" });
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/produtos-internos", { headers: authHeaders() });
      if (!r.ok) throw new Error("Falha ao carregar");
      setProdutos(await r.json());
    } catch {
      toast({ title: "Erro ao carregar produtos", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void carregar(); }, []);

  const porCategoria = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const filtrados = produtos.filter((p) =>
      !termo || p.nome.toLowerCase().includes(termo) || p.descricaoUso.toLowerCase().includes(termo) || p.categoria.toLowerCase().includes(termo)
    );
    const grupos = new Map<string, ProdutoInterno[]>();
    for (const p of filtrados) {
      const lista = grupos.get(p.categoria) ?? [];
      lista.push(p);
      grupos.set(p.categoria, lista);
    }
    return grupos;
  }, [produtos, busca]);

  function abrirNovo() {
    setEditando(null);
    setForm({ categoria: "", nome: "", descricaoUso: "" });
    setModalOpen(true);
  }

  function abrirEdicao(p: ProdutoInterno) {
    setEditando(p);
    setForm({ categoria: p.categoria, nome: p.nome, descricaoUso: p.descricaoUso });
    setModalOpen(true);
  }

  async function salvar() {
    if (!form.categoria.trim() || !form.nome.trim() || !form.descricaoUso.trim()) return;
    setSalvando(true);
    try {
      const url = editando ? `/api/admin/produtos-internos/${editando.id}` : "/api/admin/produtos-internos";
      const r = await fetch(url, {
        method: editando ? "PATCH" : "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!r.ok) throw new Error("Falha ao salvar");
      setModalOpen(false);
      await carregar();
      toast({ title: editando ? "Produto atualizado" : "Produto criado" });
    } catch {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(p: ProdutoInterno) {
    if (!confirm(`Excluir "${p.nome}"?`)) return;
    try {
      const r = await fetch(`/api/admin/produtos-internos/${p.id}`, { method: "DELETE", headers: authHeaders() });
      if (!r.ok) throw new Error("Falha ao excluir");
      await carregar();
      toast({ title: "Produto excluído" });
    } catch {
      toast({ title: "Erro ao excluir", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Catálogo de Produtos (interno)
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cada funcionalidade do Vendor.ai como "produto" — nome comercial + descrição pronta pra site, proposta e deck. Visível só pra super admin.
          </p>
        </div>
        <Button type="button" onClick={abrirNovo}>
          <Plus className="h-4 w-4 mr-1.5" />
          Novo produto
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar produto ou categoria..." className="pl-9" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : porCategoria.size === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">Nenhum produto cadastrado ainda.</p>
      ) : (
        Array.from(porCategoria.entries()).map(([categoria, itens]) => (
          <div key={categoria} className="space-y-2">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{categoria}</h2>
              <Badge variant="outline" className="text-[10px]">{itens.length}</Badge>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {itens.map((p) => (
                <Card key={p.id}>
                  <CardContent className="py-3 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{p.nome}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{p.descricaoUso}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => abrirEdicao(p)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => excluir(p)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editando ? "Editar produto" : "Novo produto"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Categoria</p>
              <Input value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} placeholder="Ex: CRM Core, Agentes de IA..." />
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Nome do produto</p>
              <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex: Pipeline de Negócios" />
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Descrição de uso</p>
              <Textarea value={form.descricaoUso} onChange={(e) => setForm({ ...form, descricaoUso: e.target.value })} rows={3} placeholder="Explicação breve, pronta pra usar em marketing" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button type="button" onClick={salvar} disabled={salvando}>
              {salvando && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
