import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ChevronRight, ChevronDown, Plus, Check, Loader2, FolderTree } from "lucide-react";

const NIVEIS = [
  "categoria",
  "subcategoria",
  "nicho",
  "linha",
  "aplicacao",
  "sublinha",
  "utilidade",
  "familia",
] as const;

const NIVEL_LABEL: Record<string, string> = {
  categoria: "Categoria",
  subcategoria: "Subcategoria",
  nicho: "Nicho",
  linha: "Linha",
  aplicacao: "Aplicação",
  sublinha: "Sublinha",
  utilidade: "Utilidade",
  familia: "Família",
};

type Categoria = {
  id: string;
  nome: string;
  nivel: string;
  parentId: string | null;
  oficial: boolean;
  precisaAprovacao: boolean;
  filhos: Categoria[];
};

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` };
}

function TreeNode({
  categoria,
  depth,
  onAddChild,
}: {
  categoria: Categoria;
  depth: number;
  onAddChild: (parent: Categoria) => void;
}) {
  const [expanded, setExpanded] = useState(depth === 0);
  const hasChildren = categoria.filhos.length > 0;
  const proximoNivel = NIVEIS[Math.min(NIVEIS.indexOf(categoria.nivel as any) + 1, NIVEIS.length - 1)];

  return (
    <div>
      <div
        className="flex items-center gap-2 py-2 px-2 rounded-lg hover:bg-accent/60 transition-colors"
        style={{ paddingLeft: depth * 20 + 8 }}
      >
        {hasChildren ? (
          <button onClick={() => setExpanded((v) => !v)} className="p-0.5 hover:bg-accent rounded shrink-0">
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <span className="flex-1 text-sm">{categoria.nome}</span>
        {categoria.oficial && (
          <Badge variant="outline" className="text-[10px]">Oficial</Badge>
        )}
        {categoria.precisaAprovacao && (
          <Badge className="text-[10px]">Pendente</Badge>
        )}
        <span className="text-[11px] text-muted-foreground shrink-0">{NIVEL_LABEL[categoria.nivel]}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs shrink-0"
          onClick={() => onAddChild(categoria)}
        >
          <Plus className="h-3 w-3 mr-1" />
          {NIVEL_LABEL[proximoNivel]}
        </Button>
      </div>
      {expanded && hasChildren && (
        <div>
          {categoria.filhos.map((filho) => (
            <TreeNode key={filho.id} categoria={filho} depth={depth + 1} onAddChild={onAddChild} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CategoriasProduto() {
  const { user } = useAuth();
  const { toast } = useToast();
  const tenantId = user?.tenantId ?? "";

  const [arvore, setArvore] = useState<Categoria[]>([]);
  const [pendentes, setPendentes] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [parentSelecionado, setParentSelecionado] = useState<Categoria | null>(null);
  const [novoNome, setNovoNome] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [aprovandoId, setAprovandoId] = useState<string | null>(null);

  async function carregar() {
    setLoading(true);
    try {
      const [arvoreRes, pendentesRes] = await Promise.all([
        fetch(`/api/tenants/${tenantId}/categorias-produto/arvore`, { headers: authHeaders() }),
        fetch(`/api/tenants/${tenantId}/categorias-produto/pendentes`, { headers: authHeaders() }),
      ]);
      setArvore(await arvoreRes.json());
      setPendentes(await pendentesRes.json());
    } catch (err) {
      toast({ title: "Erro ao carregar categorias", description: String(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (tenantId) void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  function abrirModalNovaCategoria(parent: Categoria | null) {
    setParentSelecionado(parent);
    setNovoNome("");
    setModalOpen(true);
  }

  async function salvarNovaCategoria() {
    if (!novoNome.trim()) return;
    setSalvando(true);
    try {
      const proximoNivel = parentSelecionado
        ? NIVEIS[Math.min(NIVEIS.indexOf(parentSelecionado.nivel as any) + 1, NIVEIS.length - 1)]
        : "categoria";
      const r = await fetch(`/api/tenants/${tenantId}/categorias-produto`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: novoNome.trim(),
          nivel: proximoNivel,
          parentId: parentSelecionado?.id,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error ?? "Falha ao criar categoria");
      toast({ title: "Categoria criada" });
      setModalOpen(false);
      await carregar();
    } catch (err) {
      toast({ title: "Erro ao criar categoria", description: String(err), variant: "destructive" });
    } finally {
      setSalvando(false);
    }
  }

  async function aprovar(id: string) {
    setAprovandoId(id);
    try {
      const r = await fetch(`/api/categorias-produto/${id}/aprovar`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (!r.ok) throw new Error((await r.json())?.error ?? "Falha ao aprovar");
      toast({ title: "Categoria aprovada" });
      await carregar();
    } catch (err) {
      toast({ title: "Erro ao aprovar", description: String(err), variant: "destructive" });
    } finally {
      setAprovandoId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="vendor-page-title flex items-center gap-2">
            <FolderTree className="h-5 w-5 text-muted-foreground" />
            Categorias
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Estrutura em níveis (categoria → subcategoria → nicho → linha → aplicação → sublinha → utilidade → família).
          </p>
        </div>
        <Button type="button" onClick={() => abrirModalNovaCategoria(null)}>
          <Plus className="h-4 w-4 mr-1.5" />
          Nova categoria
        </Button>
      </div>

      {pendentes.length > 0 && (
        <Card className="border-primary/30">
          <CardContent className="pt-4 space-y-2">
            <p className="text-sm font-medium">Aguardando aprovação ({pendentes.length})</p>
            <p className="text-xs text-muted-foreground mb-2">
              Criadas fora do padrão oficial — confira se não são duplicadas de algo que já existe antes de aprovar.
            </p>
            {pendentes.map((p) => (
              <div key={p.id} className="flex items-center gap-2 py-1.5 border-t border-border/60 first:border-t-0">
                <span className="flex-1 text-sm">{p.nome}</span>
                <span className="text-[11px] text-muted-foreground">{NIVEL_LABEL[p.nivel]}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  disabled={aprovandoId === p.id}
                  onClick={() => aprovar(p.id)}
                >
                  {aprovandoId === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
                  Aprovar
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-4">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : arvore.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma categoria ainda.</p>
          ) : (
            <div>
              {arvore.map((c) => (
                <TreeNode key={c.id} categoria={c} depth={0} onAddChild={abrirModalNovaCategoria} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {parentSelecionado ? `Nova ${NIVEL_LABEL[NIVEIS[Math.min(NIVEIS.indexOf(parentSelecionado.nivel as any) + 1, NIVEIS.length - 1)]]} em "${parentSelecionado.nome}"` : "Nova categoria"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              placeholder={parentSelecionado ? "Nome do subnível" : "Nome da categoria (precisa bater com a lista oficial)"}
              autoFocus
            />
            {!parentSelecionado && (
              <p className="text-xs text-muted-foreground">
                Categorias de topo precisam bater com a taxonomia oficial (compartilhada com a vitrine do Praça.ai). Subníveis são livres.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button type="button" onClick={salvarNovaCategoria} disabled={salvando || !novoNome.trim()}>
              {salvando && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
