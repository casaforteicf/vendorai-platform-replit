import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ExecutiveDashboardModern from "@/components/dashboard/ExecutiveDashboardModern";
import { ServiceHome } from "@/components/dashboard/ServiceHome";
import type { Ui20Module } from "@/lib/ui20ServiceVisibility";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { dashboardSnapshotQueryKey, fetchDashboardSnapshot } from "@/lib/dashboardSnapshot";

const BusinessGoalsDialog = lazy(() => import("@/components/dashboard/BusinessGoalsDialog"));
const StrategicObserver = lazy(() => import("@/components/dashboard/StrategicObserver"));
const JarvisHistory = lazy(() => import("@/components/dashboard/JarvisHistory"));
const JarvisObserverCaseSync = lazy(() => import("@/components/dashboard/JarvisObserverCaseSync"));
const JarvisNewsMarket = lazy(() => import("@/components/dashboard/JarvisNewsMarket"));

type CommandCenterProps = Parameters<typeof ExecutiveDashboardModern>[0];
type OfficialMetrics = CommandCenterProps["data"];
type ExecutiveSnapshot = CommandCenterProps["executive"];
type AgentConfigItem = { ativo?: boolean };

function calendarDateForDisplay(value?: string) {
  if (!value) return value;
  const datePart = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  return datePart ? `${datePart}T12:00:00` : value;
}

export default function Dashboard() {
  const { user, token } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const [official, setOfficial] = useState<OfficialMetrics>(null);
  const ui20NavQuery = useQuery<Ui20Module[]>({
    queryKey: ["tenant-nav-modules", tenantId],
    enabled: import.meta.env.VITE_UI20_SERVICE_TABS === "true" && Boolean(tenantId && token),
    staleTime: 60_000,
    queryFn: async () => {
      const response = await fetch(`/api/tenants/${tenantId}/nav-modules`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error("Não foi possível verificar os serviços do tenant");
      return response.json() as Promise<Ui20Module[]>;
    },
    retry: false,
  });
  const [activeAgents, setActiveAgents] = useState<number | undefined>(undefined);
  const [loadingOfficial, setLoadingOfficial] = useState(false);
  const queryClient = useQueryClient();
  const dashboardQuery = useQuery<NonNullable<ExecutiveSnapshot>>({
    queryKey: dashboardSnapshotQueryKey(tenantId),
    enabled: Boolean(tenantId && token),
    queryFn: () => fetchDashboardSnapshot(token!) as Promise<NonNullable<ExecutiveSnapshot>>,
    staleTime: 30_000,
  });
  const executive = useMemo<ExecutiveSnapshot>(() => {
    if (!dashboardQuery.data) return null;
    return {
      ...dashboardQuery.data,
      ia: {
        ...dashboardQuery.data.ia,
        agentesAtivos: activeAgents ?? dashboardQuery.data.ia?.agentesAtivos,
      },
    };
  }, [dashboardQuery.data, activeAgents]);
  const loading = loadingOfficial || dashboardQuery.isLoading;
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => {
    setRefreshKey((value) => value + 1);
    void queryClient.invalidateQueries({ queryKey: dashboardSnapshotQueryKey(tenantId) });
  }, [queryClient, tenantId]);

  useEffect(() => {
    if (!tenantId || !token) {
      setOfficial(null);
      setActiveAgents(undefined);
      setLoadingOfficial(false);
      return;
    }

    let cancelled = false;
    const headers = { Authorization: `Bearer ${token}` };
    setLoadingOfficial(true);

    Promise.allSettled([
      fetch(`/api/tenants/${tenantId}/dashboard/command-center`, {
        headers,
        cache: "no-store",
      }).then(async (response) => {
        if (!response.ok) throw new Error("Falha ao carregar métricas oficiais");
        return response.json();
      }),
      fetch("/api/agent-configs", {
        headers,
        cache: "no-store",
      }).then(async (response) => {
        if (!response.ok) throw new Error("Falha ao carregar agentes ativos");
        return response.json() as Promise<AgentConfigItem[]>;
      }),
]).then(([officialResult, agentsResult]) => {
      if (cancelled) return;

      if (officialResult.status === "fulfilled") {
        const metrics = officialResult.value as NonNullable<OfficialMetrics>;
        setOfficial({
          ...metrics,
          period: metrics.period ? {
            ...metrics.period,
            start: calendarDateForDisplay(metrics.period.start),
            end: calendarDateForDisplay(metrics.period.end),
          } : metrics.period,
        });
      } else {
        setOfficial(null);
      }

      if (agentsResult.status === "fulfilled") {
        setActiveAgents(agentsResult.value.filter((agent) => agent.ativo === true).length);
      } else {
        setActiveAgents(undefined);
      }

      setLoadingOfficial(false);
    });

    return () => {
      cancelled = true;
    };
  }, [tenantId, token, refreshKey]);

  return (
    <div className="w-full vendor-dashboard-v2">
      {import.meta.env.VITE_UI20_SERVICE_TABS === "true" ? (
        <ServiceHome
          name={user?.name ?? ""}
          tenantId={tenantId}
          userId={user?.id ?? ""}
          token={token}
          isAdmin={user?.platformRole === "super_admin" || user?.userFunction === "administrador"}
          modules={ui20NavQuery.data}
          overdueTasks={official?.operation?.overdueTasks}
          unassignedLeads={official?.commercial?.unassignedLeads}
          overdueTaskItems={official?.operation?.overdueTaskItems}
          recentActivity={executive?.atividade?.ultimas20}
          loading={!ui20NavQuery.isSuccess}
          erpVisible={ui20NavQuery.data?.some((module) => module.moduleKey === "financeiro" && module.isEnabled) ?? false}
          arqdorVisible={Boolean(user?.tenantVertical && /constr|arquit|obra|marcen|m[oó]ve|design/i.test(user.tenantVertical))}
        />
      ) : null}
      <Tabs defaultValue="overview" className="w-full">
      <div className="vendor-product-page pb-0">
        <TabsList className="vendor-product-tabs grid max-w-[520px] grid-cols-2">
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="news">Notícias & Mercado</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="overview" className="mt-2">
        <ExecutiveDashboardModern
          data={official}
          executive={executive}
          loading={loading}
          userName={user?.name ?? ""}
          onRefresh={refresh}
          goalsAction={
            <Suspense fallback={null}>
              <BusinessGoalsDialog onChanged={refresh} />
            </Suspense>
          }
        />
        <Suspense fallback={null}>
          <JarvisObserverCaseSync token={token} />

          <div className="mx-auto mt-6 max-w-[1600px] space-y-3">
            <details open className="group overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">Inteligência avançada</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Observador Estratégico, oportunidades territoriais, sinais e análises aprofundadas.</p>
                </div>
                <span className="shrink-0 text-xs font-medium text-primary group-open:hidden">Abrir</span>
                <span className="hidden shrink-0 text-xs font-medium text-primary group-open:inline">Ocultar</span>
              </summary>
              <div className="border-t border-border/60 p-4 md:p-5">
                <StrategicObserver
                  tenantId={tenantId}
                  token={token}
                  official={official}
                  refreshKey={refreshKey}
                />
              </div>
            </details>

            <details className="group overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">Histórico do JARVIS</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Atividades, análises e registros anteriores sem ocupar a visão executiva principal.</p>
                </div>
                <span className="shrink-0 text-xs font-medium text-primary group-open:hidden">Abrir</span>
                <span className="hidden shrink-0 text-xs font-medium text-primary group-open:inline">Ocultar</span>
              </summary>
              <div className="max-w-full overflow-hidden border-t border-border/60 p-4 md:p-5 [&_a]:break-all [&_pre]:overflow-x-auto [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto">
                <JarvisHistory token={token} refreshKey={refreshKey} />
              </div>
            </details>
          </div>
        </Suspense>
      </TabsContent>

      <TabsContent value="news" className="vendor-product-page pt-4">
        <Suspense fallback={null}>
          <JarvisNewsMarket token={token} />
        </Suspense>
      </TabsContent>
      </Tabs>
    </div>
  );
}