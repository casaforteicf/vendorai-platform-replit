import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Loader2, ClipboardList, Minus, Trash2 } from "lucide-react";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("vendorai_token");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

const TIPOS = [
  { value: "mesa", label: "Mesa" },
  { value: "delivery", label: "Delivery" },
  { value: "retirada", label: "Retirada" },
] as const;

const STATUS_FLOW: Record<string, string | null> = {
  recebido: "preparando",
  preparando: "pronto",
  pronto: "em_entrega",
  em_entrega: "entregue",
  entregue: null,
  cancelado: null,
};

const STATUS_LABELS: Record<string, string> = {
  recebido: "Recebido", preparando: "Preparando", pronto: "Pronto",
  em_entrega: "Em entrega", entregue: "Entregue", cancelado: "Cancelado",
};

const STATUS_COLORS: Record<string, string> = {
  recebido: "bg-blue-50 text-blue-700 border-blue-200",
  preparando: "bg-amber-50 text-amber-700 border-amber-200",
  pronto: "bg-emerald-50 text-emerald-700 border-emerald-200",
  em_entrega: "bg-violet-50 text-violet-700 border-violet-200",
  entregue: "bg-slate-50 text-slate-500 border-slate-200",
  cancelado: "bg-red-50 text-red-600 border-red-200",
};

function fmt(v: number | string | null) {
  if (v == null) return "—";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type CarrinhoItem = { cardapioItemId: string; nomeItem: string; precoUnitario: number; quantidade: number };

function NovoPedidoDialog({ tenantId, open, onOpenChange }: { tenantId: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [tipo, setTipo] = useState("mesa");
  const [mesaNumero, setMesaNumero] = useState("");
  const [clienteNome, setClienteNome] = useState("");
  const [clienteTelefone, setClienteTelefone] = useState("");
  const [enderecoEntrega, setEnderecoEntrega] = useState("");
  const [carrinho, setCarrinho] = useState<CarrinhoItem[]>([]);

  const { data: cardapio = [] } = useQuery<any[]>({
    queryKey: ["food-cardapio", tenantId, "disponivel"],
    queryFn: () =>
      fetch(`/api/tenants/${tenantId}/food/cardapio?disponivel=true`, { headers: authHeaders() }).then((r) => r.json()),
    enabled: !!tenantId && open,
  });

  const criarPedido = useMutation({
    mutationFn: () =>
      fetch(`/api/tenants/${tenantId}/food/pedidos`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          tipo, mesaNumero: tipo === "mesa" ? mesaNumero : null,
          clienteNome: clienteNome || null, clienteTelefone: clienteTelefone || null,
          enderecoEntrega: tipo === "delivery" ? enderecoEntrega : null,
          itens: carrinho.map((c) => ({ cardapioItemId: c.cardapioItemId, nomeItem: c.nomeItem, precoUnitario: c.precoUnitario, quantidade: c.quantidade })),
        }),
      }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Erro");
        return r.json();
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["food-pedidos", tenantId] });
      toast({ title: "Pedido criado!" });
      onOpenChange(false);
      setCarrinho([]); setMesaNumero(""); setClienteNome(""); setClienteTelefone(""); setEnderecoEntrega("");
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  function addItem(item: any) {
    setCarrinho((prev) => {
      const existente = prev.find((c) => c.cardapioItemId === item.id);
      if (existente) {
        return prev.map((c) => c.cardapioItemId === item.id ? { ...c, quantidade: c.quantidade + 1 } : c);
      }
      return [...prev, { cardapioItemId: item.id, nomeItem: item.nome, precoUnitario: Number(item.preco), quantidade: 1 }];
    });
  }
  function decItem(id: string) {
    setCarrinho((prev) => prev.flatMap((c) => {
      if (c.cardapioItemId !== id) return [c];
      if (c.quantidade <= 1) return [];
      return [{ ...c, quantidade: c.quantidade - 1 }];
    }));
  }
  function removeItem(id: string) {
    setCarrinho((prev) => prev.filter((c) => c.cardapioItemId !== id));
  }

  const total = carrinho.reduce((sum, c) => sum + c.precoUnitario * c.quantidade, 0);

  function handleSubmit() {
    if (!carrinho.length) {
      toast({ title: "Adicione pelo menos 1 item", variant: "destructive" });
      return;
    }
    if (tipo === "mesa" && !mesaNumero) {
      toast({ title: "Informe o número da mesa", variant: "destructive" });
      return;
    }
    if (tipo === "delivery" && !enderecoEntrega) {
      toast({ title: "Informe o endereço de entrega", variant: "destructive" });
      return;
    }
    criarPedido.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Novo Pedido</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {tipo === "mesa" && (
            <div className="space-y-1.5">
              <Label>Número da mesa <span className="text-destructive">*</span></Label>
              <Input value={mesaNumero} onChange={(e) => setMesaNumero(e.target.value)} placeholder="ex: 12" />
            </div>
          )}
          {tipo === "delivery" && (
            <div className="space-y-1.5">
              <Label>Endereço de entrega <span className="text-destructive">*</span></Label>
              <Input value={enderecoEntrega} onChange={(e) => setEnderecoEntrega(e.target.value)} placeholder="Rua, número, bairro" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Cliente</Label>
              <Input value={clienteNome} onChange={(e) => setClienteNome(e.target.value)} placeholder="opcional" />
            </div>
            <div className="space-y-1.5">
              <Label>Telefone</Label>
              <Input value={clienteTelefone} onChange={(e) => setClienteTelefone(e.target.value)} placeholder="opcional" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Itens do cardápio</Label>
            <div className="border rounded-lg divide-y max-h-40 overflow-y-auto">
              {cardapio.length === 0 ? (
                <p className="text-xs text-muted-foreground p-3">Nenhum item disponível no cardápio.</p>
              ) : cardapio.map((item: any) => (
                <button key={item.id} type="button" onClick={() => addItem(item)} className="w-full flex items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted/40">
                  <span>{item.nome}</span>
                  <span className="text-muted-foreground">{fmt(item.preco)}</span>
                </button>
              ))}
            </div>
          </div>

          {carrinho.length > 0 && (
            <div className="space-y-1.5">
              <Label>Carrinho</Label>
              <div className="border rounded-lg divide-y">
                {carrinho.map((c) => (
                  <div key={c.cardapioItemId} className="flex items-center gap-2 px-3 py-2">
                    <span className="flex-1 text-sm truncate">{c.nomeItem}</span>
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => decItem(c.cardapioItemId)}><Minus className="h-3 w-3" /></Button>
                    <span className="text-sm w-5 text-center">{c.quantidade}</span>
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => addItem({ id: c.cardapioItemId, nome: c.nomeItem, preco: c.precoUnitario })}><Plus className="h-3 w-3" /></Button>
                    <span className="text-sm w-16 text-right">{fmt(c.precoUnitario * c.quantidade)}</span>
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeItem(c.cardapioItemId)}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                ))}
              </div>
              <p className="text-right text-sm font-semibold pt-1">Total: {fmt(total)}</p>
            </div>
          )}

          <div className="flex gap-2 justify-end pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="button" onClick={handleSubmit} disabled={criarPedido.isPending}>
              {criarPedido.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Criar Pedido
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function FoodPedidos() {
  const { toast } = useToast();
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const qc = useQueryClient();
  const [novoPedidoOpen, setNovoPedidoOpen] = useState(false);

  const { data: pedidos = [], isLoading } = useQuery<any[]>({
    queryKey: ["food-pedidos", tenantId],
    queryFn: () => fetch(`/api/tenants/${tenantId}/food/pedidos`, { headers: authHeaders() }).then((r) => r.json()),
    enabled: !!tenantId,
    refetchInterval: 20000,
  });

  const avancarStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      fetch(`/api/tenants/${tenantId}/food/pedidos/${id}/status`, {
        method: "PATCH", headers: authHeaders(), body: JSON.stringify({ status }),
      }).then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error ?? "Não foi possível atualizar o pedido.");
        return body;
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["food-pedidos", tenantId] }),
    onError: (error: Error) => toast({ title: "Erro ao atualizar pedido", description: error.message, variant: "destructive" }),
  });

  const ativos = pedidos.filter((p) => p.status !== "entregue" && p.status !== "cancelado");
  const finalizados = pedidos.filter((p) => p.status === "entregue" || p.status === "cancelado");

  function renderPedido(p: any) {
    const proximoStatus = STATUS_FLOW[p.status];
    return (
      <div key={p.id} className="border rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={`text-xs ${STATUS_COLORS[p.status] ?? ""}`}>{STATUS_LABELS[p.status] ?? p.status}</Badge>
            <span className="text-sm font-medium">
              {p.tipo === "mesa" ? `Mesa ${p.mesaNumero ?? "—"}` : p.tipo === "delivery" ? "Delivery" : "Retirada"}
            </span>
            {p.clienteNome && <span className="text-xs text-muted-foreground">{p.clienteNome}</span>}
          </div>
          <span className="text-sm font-semibold">{fmt(p.valorTotal)}</span>
        </div>
        <ul className="text-xs text-muted-foreground space-y-0.5">
          {(p.itens ?? []).map((item: any) => (
            <li key={item.id}>{item.quantidade}x {item.nomeItem}</li>
          ))}
        </ul>
        {p.tipo === "delivery" && p.enderecoEntrega && (
          <p className="text-xs text-muted-foreground">📍 {p.enderecoEntrega}</p>
        )}
        <div className="flex gap-2 justify-end pt-1">
          {p.status !== "cancelado" && p.status !== "entregue" && (
            <Button size="sm" variant="ghost" className="text-destructive text-xs h-7" onClick={() => avancarStatus.mutate({ id: p.id, status: "cancelado" })}>
              Cancelar
            </Button>
          )}
          {proximoStatus && (
            <Button size="sm" className="text-xs h-7" onClick={() => avancarStatus.mutate({ id: p.id, status: proximoStatus })} disabled={avancarStatus.isPending}>
              Marcar como {STATUS_LABELS[proximoStatus]}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ClipboardList className="h-5 w-5" /> Pedidos
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Mesa, delivery e retirada — atualiza a cada 20s</p>
        </div>
        <Button onClick={() => setNovoPedidoOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Novo Pedido
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : (
        <>
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground mb-2">Em andamento ({ativos.length})</h2>
            {ativos.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Nenhum pedido em andamento.</CardContent></Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {ativos.map(renderPedido)}
              </div>
            )}
          </div>
          {finalizados.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground mb-2">Finalizados hoje ({finalizados.length})</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 opacity-70">
                {finalizados.map(renderPedido)}
              </div>
            </div>
          )}
        </>
      )}

      <NovoPedidoDialog tenantId={tenantId} open={novoPedidoOpen} onOpenChange={setNovoPedidoOpen} />
    </div>
  );
}
