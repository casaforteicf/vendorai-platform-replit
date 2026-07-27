import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { ShoppingCart, ChevronDown, Clock, CheckCircle2, Truck, XCircle, Package, ShieldAlert, Loader2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

function authHeaders() {
  const token = localStorage.getItem("vendorai_token");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

const STATUS_OPTIONS = [
  { value: "todos", label: "Todos" },
  { value: "aguardando_confirmacao", label: "Aguardando confirmação" },
  { value: "aguardando_receita", label: "Aguardando receita" },
  { value: "confirmado", label: "Confirmado" },
  { value: "em_separacao", label: "Em separação" },
  { value: "saiu_para_entrega", label: "Saiu p/ entrega" },
  { value: "entregue", label: "Entregue" },
  { value: "cancelado", label: "Cancelado" },
];

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  aguardando_confirmacao: { label: "Aguardando confirmação", color: "bg-yellow-50 text-yellow-700 border-yellow-200", icon: Clock },
  aguardando_receita:     { label: "Aguardando receita",     color: "bg-red-50 text-red-700 border-red-200",         icon: ShieldAlert },
  confirmado:             { label: "Confirmado",             color: "bg-blue-50 text-blue-700 border-blue-200",       icon: CheckCircle2 },
  em_separacao:           { label: "Em separação",           color: "bg-violet-50 text-violet-700 border-violet-200",icon: Package },
  saiu_para_entrega:      { label: "Saiu p/ entrega",         color: "bg-orange-50 text-orange-700 border-orange-200",icon: Truck },
  entregue:               { label: "Entregue",                color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  cancelado:              { label: "Cancelado",                color: "bg-red-50 text-red-700 border-red-200",         icon: XCircle },
};

const NEXT_STATUS: Record<string, { value: string; label: string }[]> = {
  aguardando_confirmacao: [{ value: "confirmado", label: "Confirmar" }, { value: "cancelado", label: "Cancelar" }],
  confirmado: [{ value: "em_separacao", label: "Iniciar separação" }, { value: "cancelado", label: "Cancelar" }],
  em_separacao: [{ value: "saiu_para_entrega", label: "Saiu para entrega" }],
  saiu_para_entrega: [{ value: "entregue", label: "Marcar entregue" }],
  entregue: [],
  cancelado: [],
  aguardando_receita: [],
};

function fmt(val: string | number) {
  return Number(val).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function AnexarReceitaDialog({ tenantId, pedidoId, open, onOpenChange }: { tenantId: string; pedidoId: string | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [url, setUrl] = useState("");

  const anexar = useMutation({
    mutationFn: () =>
      fetch(`/api/tenants/${tenantId}/farmacia/pedidos/${pedidoId}/anexar-receita`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ receitaUrl: url }),
      }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Erro");
        return r.json();
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["farmacia-pedidos"] });
      toast({ title: "Receita anexada — pedido liberado." });
      onOpenChange(false);
      setUrl("");
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Anexar receita</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          Cole o link da foto da receita (upload feito fora daqui por enquanto — sem storage de imagem integrado ainda).
        </p>
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => anexar.mutate()} disabled={!url || anexar.isPending}>
            {anexar.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Anexar e liberar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PedidoCard({ pedido, onUpdateStatus, onAnexarReceita }: { pedido: any; onUpdateStatus: (id: string, status: string) => void; onAnexarReceita: (id: string) => void }) {
  const cfg = STATUS_CONFIG[pedido.status];
  const nextOptions = NEXT_STATUS[pedido.status] ?? [];
  const Icon = cfg?.icon ?? Clock;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 rounded-xl border border-border bg-card hover:border-primary/20 transition-colors">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="flex flex-col items-center gap-1 w-12 shrink-0">
          <Icon className="h-5 w-5 text-muted-foreground" />
          <span className="text-[10px] font-mono font-bold text-muted-foreground">
            #{pedido.id.slice(-6).toUpperCase()}
          </span>
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={`text-[10px] px-1.5 py-0 h-4 border ${cfg?.color}`}>{cfg?.label}</Badge>
            {pedido.temItemControlado && (
              <span className="text-[10px] text-muted-foreground">contém item controlado</span>
            )}
          </div>
          <p className="text-sm font-semibold">{fmt(pedido.valorTotal)}</p>
          <p className="text-xs text-muted-foreground">
            {format(parseISO(pedido.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
          </p>
        </div>
      </div>

      {pedido.status === "aguardando_receita" ? (
        <Button size="sm" className="shrink-0" onClick={() => onAnexarReceita(pedido.id)}>
          <ShieldAlert className="h-3.5 w-3.5 mr-1" /> Anexar receita
        </Button>
      ) : nextOptions.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="shrink-0 gap-1 h-8">
              Ação <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {nextOptions.map((opt) => (
              <DropdownMenuItem key={opt.value} onClick={() => onUpdateStatus(pedido.id, opt.value)}>
                {opt.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

export default function FarmaciaPedidos() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const qc = useQueryClient();
  const { toast } = useToast();

  const [statusFilter, setStatusFilter] = useState("todos");
  const [receitaDialogPedidoId, setReceitaDialogPedidoId] = useState<string | null>(null);

  const { data: pedidos = [], isLoading } = useQuery<any[]>({
    queryKey: ["farmacia-pedidos", tenantId, statusFilter],
    queryFn: () => {
      const params = statusFilter !== "todos" ? `?status=${statusFilter}` : "";
      return fetch(`/api/tenants/${tenantId}/farmacia/pedidos${params}`, { headers: authHeaders() }).then((r) => r.json());
    },
    enabled: !!tenantId,
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      fetch(`/api/tenants/${tenantId}/farmacia/pedidos/${id}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ status }),
      }).then((r) => r.json()),
    onSuccess: () => {
      toast({ title: "Status atualizado." });
      qc.invalidateQueries({ queryKey: ["farmacia-pedidos"] });
    },
    onError: () => toast({ title: "Erro ao atualizar status", variant: "destructive" }),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Pedidos</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{pedidos.length} pedido{pedidos.length !== 1 ? "s" : ""}</p>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
      ) : pedidos.length === 0 ? (
        <div className="flex flex-col items-center py-16 gap-3 text-muted-foreground">
          <ShoppingCart className="h-12 w-12 opacity-20" />
          <p className="text-sm">Nenhum pedido encontrado</p>
        </div>
      ) : (
        <div className="space-y-2">
          {pedidos.map((p: any) => (
            <PedidoCard
              key={p.id}
              pedido={p}
              onUpdateStatus={(id, status) => updateStatus.mutate({ id, status })}
              onAnexarReceita={setReceitaDialogPedidoId}
            />
          ))}
        </div>
      )}

      <AnexarReceitaDialog
        tenantId={tenantId}
        pedidoId={receitaDialogPedidoId}
        open={!!receitaDialogPedidoId}
        onOpenChange={(v) => { if (!v) setReceitaDialogPedidoId(null); }}
      />
    </div>
  );
}
