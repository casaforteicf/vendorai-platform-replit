import { useAuth } from "@/contexts/AuthContext";
import { useGetSupermercadoDashboard, useListSupermercadoPedidos } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ShoppingCart, TrendingUp, Package, Megaphone, Users,
  ShoppingBag, ArrowRight, MessageCircle,
} from "lucide-react";
import { Link } from "wouter";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

const STATUS_COLORS: Record<string, string> = {
  aguardando_confirmacao: "bg-yellow-50 text-yellow-700 border-yellow-200",
  confirmado: "bg-blue-50 text-blue-700 border-blue-200",
  em_separacao: "bg-violet-50 text-violet-700 border-violet-200",
  saiu_para_entrega: "bg-orange-50 text-orange-700 border-orange-200",
  entregue: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelado: "bg-red-50 text-red-700 border-red-200",
};

const STATUS_LABELS: Record<string, string> = {
  aguardando_confirmacao: "Aguardando",
  confirmado: "Confirmado",
  em_separacao: "Em separação",
  saiu_para_entrega: "Saiu p/ entrega",
  entregue: "Entregue",
  cancelado: "Cancelado",
};

function fmt(val: string | number | undefined) {
  return Number(val ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function SupermercadoDashboard() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";

  const { data, isLoading } = useGetSupermercadoDashboard(tenantId);

  const kpis = [
    { label: "Pedidos hoje", value: data?.pedidosHoje ?? 0, icon: ShoppingCart, color: "text-blue-500" },
    { label: "Pedidos na semana", value: data?.pedidosSemana ?? 0, icon: ShoppingBag, color: "text-violet-500" },
    { label: "Receita hoje", value: fmt(data?.receitaHoje), icon: TrendingUp, color: "text-emerald-500" },
    { label: "Receita na semana", value: fmt(data?.receitaSemana), icon: TrendingUp, color: "text-emerald-600" },
    { label: "Produtos ativos", value: data?.produtosAtivos ?? 0, icon: Package, color: "text-amber-500" },
    { label: "Campanhas enviadas", value: data?.campanhasEnviadas ?? 0, icon: Megaphone, color: "text-pink-500" },
    { label: "Clientes na base", value: data?.clientesAtivos ?? 0, icon: Users, color: "text-slate-500" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Supermercado</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Visão geral de pedidos, produtos e campanhas via WhatsApp.
        </p>
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <Card key={k.label} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs text-muted-foreground leading-tight">{k.label}</p>
                {isLoading
                  ? <Skeleton className="h-7 w-20 mt-1" />
                  : <p className="text-xl font-bold mt-1">{k.value}</p>
                }
              </div>
              <k.icon className={`h-5 w-5 shrink-0 mt-0.5 ${k.color}`} />
            </div>
          </Card>
        ))}

        {/* Quick action: new campaign */}
        <Card className="p-4 border-dashed border-primary/30 bg-primary/5 flex items-center justify-center">
          <Link href="/supermercado/campanhas">
            <button className="flex flex-col items-center gap-1 text-primary hover:opacity-80 transition-opacity">
              <Megaphone className="h-6 w-6" />
              <span className="text-xs font-medium">Nova campanha</span>
            </button>
          </Link>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* ── Últimos pedidos ── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Últimos Pedidos</CardTitle>
              <Link href="/supermercado/pedidos">
                <button className="flex items-center gap-1 text-xs text-primary hover:underline">
                  Ver todos <ArrowRight className="h-3 w-3" />
                </button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading
              ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)
              : data?.ultimosPedidos?.length === 0
              ? (
                <div className="flex flex-col items-center py-8 gap-2 text-muted-foreground">
                  <ShoppingCart className="h-8 w-8 opacity-20" />
                  <p className="text-sm">Nenhum pedido ainda</p>
                </div>
              )
              : data?.ultimosPedidos?.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2 text-sm py-1.5 border-b border-border/50 last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">#{p.id.slice(-6).toUpperCase()}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(parseISO(p.createdAt), "dd/MM HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-semibold">{fmt(p.valorTotal)}</span>
                    <Badge className={`text-[10px] px-1.5 py-0 h-4 border ${STATUS_COLORS[p.status]}`}>
                      {STATUS_LABELS[p.status]}
                    </Badge>
                  </div>
                </div>
              ))
            }
          </CardContent>
        </Card>

        {/* ── Últimas campanhas ── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Últimas Campanhas</CardTitle>
              <Link href="/supermercado/campanhas">
                <button className="flex items-center gap-1 text-xs text-primary hover:underline">
                  Ver todas <ArrowRight className="h-3 w-3" />
                </button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading
              ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)
              : data?.ultimasCampanhas?.length === 0
              ? (
                <div className="flex flex-col items-center py-8 gap-2 text-muted-foreground">
                  <MessageCircle className="h-8 w-8 opacity-20" />
                  <p className="text-sm">Nenhuma campanha ainda</p>
                </div>
              )
              : data?.ultimasCampanhas?.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2 text-sm py-1.5 border-b border-border/50 last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{c.titulo}</p>
                    <p className="text-xs text-muted-foreground capitalize">{c.tipo.replace("_", " ")}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {c.status === "concluida" && (
                      <span className="text-xs text-muted-foreground">{c.totalEnviados} enviados</span>
                    )}
                    <Badge className={`text-[10px] px-1.5 py-0 h-4 border ${
                      c.status === "concluida" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                      c.status === "agendada" ? "bg-blue-50 text-blue-700 border-blue-200" :
                      c.status === "enviando" ? "bg-amber-50 text-amber-700 border-amber-200" :
                      "bg-slate-50 text-slate-600 border-slate-200"
                    }`}>
                      {c.status}
                    </Badge>
                  </div>
                </div>
              ))
            }
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
