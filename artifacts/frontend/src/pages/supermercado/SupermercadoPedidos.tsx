import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useListSupermercadoPedidos,
  useUpdateSupermercadoPedido,
  getListSupermercadoPedidosQueryKey,
  SupermercadoPedido,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ShoppingCart, ChevronDown, Clock, CheckCircle2, Truck, XCircle, Package } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

const STATUS_OPTIONS = [
  { value: "todos", label: "Todos" },
  { value: "aguardando_confirmacao", label: "Aguardando" },
  { value: "confirmado", label: "Confirmado" },
  { value: "em_separacao", label: "Em Separação" },
  { value: "saiu_para_entrega", label: "Saiu p/ Entrega" },
  { value: "entregue", label: "Entregue" },
  { value: "cancelado", label: "Cancelado" },
];

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  aguardando_confirmacao: { label: "Aguardando",     color: "bg-yellow-50 text-yellow-700 border-yellow-200",  icon: Clock },
  confirmado:            { label: "Confirmado",      color: "bg-blue-50 text-blue-700 border-blue-200",        icon: CheckCircle2 },
  em_separacao:          { label: "Em separação",    color: "bg-violet-50 text-violet-700 border-violet-200",  icon: Package },
  saiu_para_entrega:     { label: "Saiu p/ entrega", color: "bg-orange-50 text-orange-700 border-orange-200",  icon: Truck },
  entregue:              { label: "Entregue",        color: "bg-emerald-50 text-emerald-700 border-emerald-200",icon: CheckCircle2 },
  cancelado:             { label: "Cancelado",       color: "bg-red-50 text-red-700 border-red-200",           icon: XCircle },
};

const ORIGEM_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  app: "App",
  balcao: "Balcão",
};

const NEXT_STATUS: Record<string, { value: string; label: string }[]> = {
  aguardando_confirmacao: [{ value: "confirmado", label: "Confirmar" }, { value: "cancelado", label: "Cancelar" }],
  confirmado: [{ value: "em_separacao", label: "Iniciar separação" }, { value: "cancelado", label: "Cancelar" }],
  em_separacao: [{ value: "saiu_para_entrega", label: "Saiu para entrega" }],
  saiu_para_entrega: [{ value: "entregue", label: "Marcar entregue" }],
  entregue: [],
  cancelado: [],
};

function fmt(val: string | number) {
  return Number(val).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function PedidoCard({ pedido, onUpdateStatus }: { pedido: SupermercadoPedido; onUpdateStatus: (id: string, status: string) => void }) {
  const cfg = STATUS_CONFIG[pedido.status];
  const nextOptions = NEXT_STATUS[pedido.status] ?? [];
  const Icon = cfg?.icon ?? Clock;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 rounded-xl border border-border bg-card hover:border-primary/20 transition-colors">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="flex flex-col items-center gap-1 w-12 shrink-0">
          <ShoppingCart className="h-5 w-5 text-muted-foreground" />
          <span className="text-[10px] font-mono font-bold text-muted-foreground">
            #{pedido.id.slice(-6).toUpperCase()}
          </span>
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={`text-[10px] px-1.5 py-0 h-4 border ${cfg?.color}`}>
              {cfg?.label}
            </Badge>
            <span className="text-[10px] text-muted-foreground">
              via {ORIGEM_LABEL[pedido.origem]}
            </span>
          </div>
          <p className="text-sm font-semibold">{fmt(pedido.valorTotal)}</p>
          <p className="text-xs text-muted-foreground">
            {format(parseISO(pedido.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
          </p>
          {pedido.enderecoEntrega && (
            <p className="text-xs text-muted-foreground truncate">{pedido.enderecoEntrega}</p>
          )}
        </div>
      </div>

      {nextOptions.length > 0 && (
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
      )}
    </div>
  );
}

export default function SupermercadoPedidos() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const qc = useQueryClient();
  const { toast } = useToast();

  const [statusFilter, setStatusFilter] = useState("todos");

  const { data: pedidos = [], isLoading } = useListSupermercadoPedidos(tenantId, {
    status: statusFilter !== "todos" ? statusFilter : undefined,
  });

  const updateMut = useUpdateSupermercadoPedido();

  function handleUpdateStatus(pedidoId: string, status: string) {
    updateMut.mutate({ tenantId, pedidoId, data: { status: status as any } }, {
      onSuccess: () => {
        toast({ title: "Status atualizado." });
        qc.invalidateQueries({ queryKey: getListSupermercadoPedidosQueryKey(tenantId, {}) });
      },
      onError: () => toast({ title: "Erro ao atualizar status", variant: "destructive" }),
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Pedidos</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{pedidos.length} pedido{pedidos.length !== 1 ? "s" : ""}</p>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
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
          {pedidos.map((p) => (
            <PedidoCard key={p.id} pedido={p} onUpdateStatus={handleUpdateStatus} />
          ))}
        </div>
      )}
    </div>
  );
}
