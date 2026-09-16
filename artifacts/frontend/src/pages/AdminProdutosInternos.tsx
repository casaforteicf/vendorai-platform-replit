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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Package, Plus, Search, Pencil, Trash2, Loader2 } from "lucide-react";

type TipoProduto = "servico" | "produto" | "oferta" | "etapa";

interface ProdutoInterno {
  id: string;
  categoria: string;
  nome: string;
  descricaoUso: string;
  tipo: TipoProduto;
  nichosRelacionados: string[];
  ordem: number;
  ativo: boolean;
}

const TIPO_LABEL: Record<TipoProduto, string> = {
  servico: "Serviço",
  produto: "Solução",
  oferta: "Oferta",
  etapa: "Etapa do processo",
};
const TIPO_STYLE: Record<TipoProduto, string> = {
  servico: "border-blue-300 text-blue-700 bg-blue-50",
  produto: "border-primary/30 text-primary bg-primary/5",
  oferta: "border-amber-300 text-amber-700 bg-amber-50",
  etapa: "border-violet-300 text-violet-700 bg-violet-50",
};

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` };
}

export default function AdminProdutosInternos() {
  const { toast } = useToast();
  const [produtos, setProdutos] = useState<ProdutoInterno[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<"todos" | TipoProduto>("todos");
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState<ProdutoInterno | null>(null);
  const [form, setForm] = useState({ categoria: "", nome: "", descricaoUso: "", tipo: "produto" as TipoProduto, nichosTexto: "" });
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/produtos-internos", { headers: authHeaders() });
      if (!r.ok) throw new Error("Falha ao carregar");
      setProdutos(await r.json());
    } catch {
      toast({ title: "Erro ao carregar serviços e etapas", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void carregar(); }, []);

  const porCategoria = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const filtrados = produtos.filter((p) => {
      if (filtroTipo !== "todos" && p.tipo !== filtroTipo) return false;
      if (!termo) return true;
      return p.nome.toLowerCase().includes(termo) || p.descricaoUso.toLowerCase().includes(termo) || p.categoria.toLowerCase().includes(termo);
    });
    const grupos = new Map<string, ProdutoInterno[]>();
    for (const p of filtrados) {
      const lista = grupos.get(p.categoria) ?? [];
      lista.push(p);
      grupos.set(p.categoria, lista);
    }
    return grupos;
  }, [produtos, busca, filtroTipo]);

  function abrirNovo() {
    setEditando(null);
    setForm({ categoria: "", nome: "", descricaoUso: "", tipo: "servico", nichosTexto: "" });
    setModalOpen(true);
  }

  function abrirEdicao(p: ProdutoInterno) {
    setEditando(p);
    setForm({ categoria: p.categoria, nome: p.nome, descricaoUso: p.descricaoUso, tipo: p.tipo, nichosTexto: (p.nichosRelacionados ?? []).join(", ") });
    setModalOpen(true);
  }

  async function salvar() {
    if (!form.categoria.trim() || !form.nome.trim() || !form.descricaoUso.trim()) return;
    setSalvando(true);
    try {
      const url = editando ? `/api/admin/produtos-internos/${editando.id}` : "/api/admin/produtos-internos";
      const nichosRelacionados = form.nichosTexto.split(",").map((n) => n.trim()).filter(Boolean);
      const r = await fetch(url, {
        method: editando ? "PATCH" : "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          categoria: form.categoria,
          nome: form.nome,
          descricaoUso: form.descricaoUso,
          tipo: form.tipo,
          nichosRelacionados,
        }),
      });
      if (!r.ok) throw new Error("Falha ao salvar");
      setModalOpen(false);
      await carregar();
      toast({ title: editando ? "Item atualizado" : "Item criado" });
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
      toast({ title: "Item excluído" });
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
            Serviços, soluções e etapas
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cadastre aqui o que não é um produto direto do catálogo: serviços, soluções, ofertas e etapas do processo. Esses itens ficam junto do catálogo na Biblioteca da Empresa.
          </p>
        </div>
        <Button type="button" onClick={abrirNovo}>
          <Plus className="h-4 w-4 mr-1.5" />
          Novo item
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar serviço, etapa, solução ou categoria..." className="pl-9" />
        </div>
        <Select value={filtroTipo} onValueChange={(v) => setFiltroTipo(v as "todos" | TipoProduto)}>
          <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            <SelectItem value="servico">Serviço</SelectItem>
            <SelectItem value="etapa">Etapa do processo</SelectItem>
            <SelectItem value="produto">Solução</SelectItem>
            <SelectItem value="oferta">Oferta</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : porCategoria.size === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">Nenhum item encontrado.</p>
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
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-medium">{p.nome}</p>
                        <Badge variant="outline" className={`text-[10px] ${TIPO_STYLE[p.tipo]}`}>{TIPO_LABEL[p.tipo]}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{p.descricaoUso}</p>
                      {(p.nichosRelacionados?.length ?? 0) > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {p.nichosRelacionados.map((n, i) => (
                            <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{n}</span>
                          ))}
                        </div>
                      )}
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
            <DialogTitle>{editando ? "Editar item" : "Novo item"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Categoria</p>
                <Input value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} placeholder="Ex: Atendimento, Obras, Implantação..." />
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Tipo</p>
                <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v as TipoProduto })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="servico">Serviço</SelectItem>
                    <SelectItem value="etapa">Etapa do processo</SelectItem>
                    <SelectItem value="produto">Solução</SelectItem>
                    <SelectItem value="oferta">Oferta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Nome</p>
              <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex: Instalação, Projeto executivo, Agente SDR..." />
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Descrição de uso</p>
              <Textarea value={form.descricaoUso} onChange={(e) => setForm({ ...form, descricaoUso: e.target.value })} rows={3} placeholder="Explique objetivamente o serviço, etapa ou solução e quando ela é usada." />
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Nichos relacionados (opcional)</p>
              <Input value={form.nichosTexto} onChange={(e) => setForm({ ...form, nichosTexto: e.target.value })} placeholder="Ex: Farmácia, Construção, Imobiliária (separado por vírgula)" />
              <p className="text-xs text-muted-foreground">Deixe em branco quando o item puder ser usado em qualquer segmento.</p>
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
