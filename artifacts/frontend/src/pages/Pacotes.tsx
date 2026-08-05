import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { PackagePlus, Plus, Loader2, Search, X, Trash2, Pencil } from "lucide-react";

function authHeaders() {
  const token = localStorage.getItem("vendorai_token");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

interface Produto { id: string; nome: string; precoBase: string }
interface PacoteItem { id: string; produtoId: string; produtoNome: string; quantidade: number }
interface Pacote {
  id: string; nome: string; descricao: string | null; precoPacote: string; ativo: boolean;
  itens: PacoteItem[];
}

interface ItemSelecionado { produtoId: string; nome: string; quantidade: number }
interface FormState {
  id: string | null; nome: string; descricao: string; precoPacote: string; ativo: boolean;
  itens: ItemSelecionado[];
}
const EMPTY_FORM: FormState = { id: null, nome: "", descricao: "", precoPacote: "", ativo: true, itens: [] };

export default function Pacotes() {
  const { user } = useAuth();
  const tenantId = (user as any)?.tenantId ?? "";
  const qc = useQueryClient();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [produtoSearch, setProdutoSearch] = useState("");
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM });

  const { data: pacotes = [], isLoading } = useQuery<Pacote[]>({
    queryKey: ["pacotes", tenantId],
    queryFn: () => fetch(`/api/tenants/${tenantId}/pacotes`, { headers: authHeaders() }).then((r) => r.json()),
    enabled: !!tenantId,
  });

  const { data: produtos = [] } = useQuery<Produto[]>({
    queryKey: ["produtos-catalogo", tenantId],
    queryFn: () => fetch(`/api/tenants/${tenantId}/produtos-catalogo`, { headers: authHeaders() }).then((r) => (r.ok ? r.json() : [])),
    enabled: !!tenantId && open,
  });

  const produtosFiltrados = produtoSearch.trim()
    ? produtos.filter((p) => p.nome.toLowerCase().includes(produtoSearch.toLowerCase()) && !form.itens.some((i) => i.produtoId === p.id)).slice(0, 8)
    : [];

  function adicionarItem(p: Produto) {
    setForm((f) => ({ ...f, itens: [...f.itens, { produtoId: p.id, nome: p.nome, quantidade: 1 }] }));
    setProdutoSearch("");
  }
  function removerItem(produtoId: string) {
    setForm((f) => ({ ...f, itens: f.itens.filter((i) => i.produtoId !== produtoId) }));
  }
  function alterarQuantidade(produtoId: string, quantidade: number) {
    setForm((f) => ({ ...f, itens: f.itens.map((i) => (i.produtoId === produtoId ? { ...i, quantidade: Math.max(1, quantidade) } : i)) }));
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        nome: form.nome,
        descricao: form.descricao || undefined,
        precoPacote: form.precoPacote,
        ativo: form.ativo,
        itens: form.itens.map((i) => ({ produtoId: i.produtoId, quantidade: i.quantidade })),
      };
      const url = form.id ? `/api/pacotes/${form.id}` : `/api/tenants/${tenantId}/pacotes`;
      const res = await fetch(url, { method: form.id ? "PATCH" : "POST", headers: authHeaders(), body: JSON.stringify(payload) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Erro ao salvar");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pacotes", tenantId] });
      toast({ title: form.id ? "Pacote atualizado!" : "Pacote criado!" });
      setOpen(false);
      setForm({ ...EMPTY_FORM });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/pacotes/${id}`, { method: "DELETE", headers: authHeaders() }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pacotes", tenantId] }); toast({ title: "Pacote removido" }); },
  });

  function openEdit(p: Pacote) {
    setForm({
      id: p.id, nome: p.nome, descricao: p.descricao ?? "", precoPacote: p.precoPacote, ativo: p.ativo,
      itens: p.itens.map((i) => ({ produtoId: i.produtoId, nome: i.produtoNome, quantidade: i.quantidade })),
    });
    setOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <PackagePlus className="h-5 w-5" /> Pacotes
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Combine produtos e serviços com preço único — quarto+spa, cesta, kit, o que fizer sentido pro seu negócio.</p>
        </div>
        <Button onClick={() => { setForm({ ...EMPTY_FORM }); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Novo Pacote
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : pacotes.length === 0 ? (
        <div className="border rounded-lg p-12 text-center text-muted-foreground">
          <PackagePlus className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhum pacote criado ainda.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {pacotes.map((p) => (
            <Card key={p.id} className={!p.ativo ? "opacity-60" : ""}>
              <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-[220px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm">{p.nome}</p>
                    <Badge variant="outline" className="text-xs">R$ {Number(p.precoPacote).toFixed(2)}</Badge>
                    {!p.ativo && <Badge variant="outline" className="text-xs bg-muted">Inativo</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {p.itens.map((i) => `${i.quantidade > 1 ? `${i.quantidade}x ` : ""}${i.produtoNome}`).join(" + ")}
                  </p>
                  {p.descricao && <p className="text-xs text-muted-foreground mt-0.5">{p.descricao}</p>}
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteMutation.mutate(p.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{form.id ? "Editar pacote" : "Novo pacote"}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Nome do pacote <span className="text-destructive">*</span></Label>
              <Input placeholder="Ex: Pacote Romântico" value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Textarea rows={2} value={form.descricao} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Preço único do pacote <span className="text-destructive">*</span></Label>
              <Input type="number" step="0.01" placeholder="R$" value={form.precoPacote} onChange={(e) => setForm((f) => ({ ...f, precoPacote: e.target.value }))} />
            </div>

            <div className="space-y-2">
              <Label>Itens inclusos <span className="text-destructive">*</span> (mínimo 2)</Label>
              {form.itens.length > 0 && (
                <div className="space-y-1.5">
                  {form.itens.map((i) => (
                    <div key={i.produtoId} className="flex items-center gap-2 border rounded-md p-2">
                      <span className="text-sm flex-1">{i.nome}</span>
                      <Input type="number" min={1} value={i.quantidade}
                        onChange={(e) => alterarQuantidade(i.produtoId, Number(e.target.value))}
                        className="h-8 w-16 text-xs" />
                      <button type="button" onClick={() => removerItem(i.produtoId)} className="text-destructive shrink-0">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8" placeholder="Buscar produto/serviço pra adicionar..." value={produtoSearch} onChange={(e) => setProdutoSearch(e.target.value)} />
              </div>
              {produtosFiltrados.length > 0 && (
                <ul className="border rounded-md max-h-32 overflow-y-auto divide-y">
                  {produtosFiltrados.map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => adicionarItem(p)} className="w-full text-left px-3 py-2 hover:bg-muted/50 text-sm flex items-center justify-between">
                        <span>{p.nome}</span>
                        <span className="text-xs text-muted-foreground">R$ {Number(p.precoBase).toFixed(2)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-sm">Ativo (visível no Praça.ai)</Label>
              <Switch checked={form.ativo} onCheckedChange={(v) => setForm((f) => ({ ...f, ativo: v }))} />
            </div>

            <div className="flex gap-2 justify-end pt-1">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button
                disabled={saveMutation.isPending || !form.nome.trim() || !form.precoPacote || form.itens.length < 2}
                onClick={() => saveMutation.mutate()}
              >
                {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {form.id ? "Salvar" : "Criar pacote"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
