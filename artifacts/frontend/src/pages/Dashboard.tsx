import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, MessageSquare, Briefcase, DollarSign, AlertCircle, Calendar } from "lucide-react";
// Assuming the hook might be useGetDashboard or similar if useGetTenantDashboard doesn't exist.
// Based on the prompt, it's useGetTenantDashboard
import { useGetTenantDashboard, getGetTenantDashboardQueryKey } from "@workspace/api-client-react";

export default function Dashboard() {
  const { user } = useAuth();
  const tenantId = user?.tenantId || "";

  // The prompt says useGetTenantDashboard(tenantId)
  // Let's wrap it in try-catch or assume it exists and handles loading
  const { data: dashboard, isLoading } = useGetTenantDashboard(tenantId, {
    query: {
      enabled: !!tenantId,
      queryKey: getGetTenantDashboardQueryKey(tenantId)
    }
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Carregando seus dados...</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="h-10"></CardHeader>
              <CardContent className="h-16"></CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const stats = [
    {
      title: "Total de Leads",
      value: dashboard?.leads?.total || 0,
      icon: Users,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      title: "Deals em Pipeline",
      value: dashboard?.deals?.totalDeals || 0,
      icon: Briefcase,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      title: "Valor em Negociação",
      value: `R$ ${dashboard?.deals?.totalEmNegociacao || "0,00"}`,
      icon: DollarSign,
      color: "text-emerald-500",
      bgColor: "bg-emerald-500/10",
    },
    {
      title: "Atividades Atrasadas",
      value: dashboard?.atividadesAtrasadas || 0,
      icon: AlertCircle,
      color: "text-destructive",
      bgColor: "bg-destructive/10",
    },
    {
      title: "Conversas Ativas",
      value: dashboard?.activeConversations || 0, // Fallback if property doesn't map exactly
      icon: MessageSquare,
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
    },
    {
      title: "Agendamentos",
      value: dashboard?.upcomingAgendamentos || 0, // Fallback
      icon: Calendar,
      color: "text-purple-500",
      bgColor: "bg-purple-500/10",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Visão Geral</h1>
        <p className="text-muted-foreground">Bem-vindo de volta, {user?.name}. Aqui está o resumo da sua operação.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat, index) => (
          <Card key={index} className="border-border">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <div className={`p-2 rounded-md ${stat.bgColor}`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
