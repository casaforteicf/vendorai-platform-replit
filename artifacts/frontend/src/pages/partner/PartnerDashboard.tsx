import { useAuth } from "@/contexts/AuthContext";
import { PartnerLayout } from "@/components/partner/PartnerLayout";
import { PartnerIndicationForm } from "@/components/partner/PartnerIndicationForm";
import { usePartnerDashboard } from "@/lib/partnerApi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  Users,
  DollarSign,
  Award,
  MessageSquare,
  Plus,
  TrendingUp,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

const NIVEL_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: "Bronze", color: "bg-amber-700 text-white" },
  2: { label: "Prata", color: "bg-slate-400 text-white" },
  3: { label: "Ouro", color: "bg-yellow-400 text-black" },
};

function formatBRL(value: string | number) {
  return Number(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatMes(mesReferencia: string) {
  try {
    return format(parseISO(mesReferencia), "MMM/yy", { locale: ptBR });
  } catch {
    return mesReferencia;
  }
}

function CardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <Skeleton className="h-4 w-32" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-24" />
      </CardContent>
    </Card>
  );
}

export default function PartnerDashboard() {
  const { user } = useAuth();
  const partnerId = (user as any)?.partnerId as string | undefined;
  const { data, isLoading, isError } = usePartnerDashboard(partnerId);

  const nivelInfo = data ? (NIVEL_LABELS[data.cards.nivelAtual] ?? NIVEL_LABELS[1]) : null;

  const chartData = (data?.grafico ?? []).map((row) => ({
    mes: formatMes(row.mesReferencia),
    clientes: row.totalClientesAtivos,
    comissao: Number(row.totalComissao),
  }));

  return (
    <PartnerLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">
              Olá, {data?.partner.nomeFantasia ?? "Parceiro"} 👋
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Acompanhe seus resultados e indique novos clientes
            </p>
          </div>
          <PartnerIndicationForm
            trigger={
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Indicar Cliente
              </Button>
            }
          />
        </div>

        {/* Cards */}
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => <CardSkeleton key={i} />)}
          </div>
        ) : isError ? (
          <p className="text-destructive text-sm">Erro ao carregar dashboard.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Total Clientes Ativos */}
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Clientes Ativos
                </CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">
                  {data!.cards.totalClientesAtivos}
                </p>
              </CardContent>
            </Card>

            {/* Comissão do Mês */}
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Comissão do Mês
                </CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-emerald-600">
                  {formatBRL(data!.cards.comissaoMes)}
                </p>
              </CardContent>
            </Card>

            {/* Nível Atual */}
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Nível Atual
                </CardTitle>
                <Award className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="flex items-center gap-3">
                <p className="text-3xl font-bold">{data!.cards.nivelAtual}</p>
                {nivelInfo && (
                  <Badge className={nivelInfo.color}>{nivelInfo.label}</Badge>
                )}
              </CardContent>
            </Card>

            {/* Leads em Negociação */}
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Leads em Negociação
                </CardTitle>
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{data!.cards.leadsEmNegociacao}</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Gráfico: evolução de clientes */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4" />
              Evolução de Clientes Ativos (6 meses)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : chartData.length === 0 ? (
              <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                Nenhum dado disponível ainda
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData} barSize={32}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="mes"
                    tick={{ fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    formatter={(value: number) => [value, "Clientes"]}
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid hsl(var(--border))",
                    }}
                  />
                  <Bar
                    dataKey="clientes"
                    fill="hsl(var(--primary))"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </PartnerLayout>
  );
}
