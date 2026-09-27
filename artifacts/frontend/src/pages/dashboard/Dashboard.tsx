import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import OfficialCommandCenter from "@/components/dashboard/OfficialCommandCenter";

const BusinessGoalsDialog = lazy(() => import("@/components/dashboard/BusinessGoalsDialog"));
const StrategicObserver = lazy(() => import("@/components/dashboard/StrategicObserver"));
const JarvisHistory = lazy(() => import("@/components/dashboard/JarvisHistory"));
const JarvisObserverCaseSync = lazy(() => import("@/components/dashboard/JarvisObserverCaseSync"));
const JarvisNewsMarket = lazy(() => import("@/components/dashboard/JarvisNewsMarket"));

type CommandCenterProps = Parameters<typeof OfficialCommandCenter>[0];
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
  const [executive, setExecutive] = useState<ExecutiveSnapshot>(null);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((value) => value + 1), []);

  useEffect(() => {
    if (!tenantId || !token) {
      setOfficial(null);
      setExecutive(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const headers = { Authorization: `Bearer ${token}` };
    setLoading(true);

    Promise.allSettled([
      fetch(`/api/tenants/${tenantId}/dashboard/command-center`, {
        headers,
        cache: "no-store",
      }).then(async (response) => {
        if (!response.ok) throw new Error("Falha ao carregar métricas oficiais");
        return response.json();
      }),
      fetch("/api/dashboard", {
        headers,
        cache: "no-store",
      }).then(async (response) => {
        if (!response.ok) throw new Error("Falha ao carregar visão executiva");
        return response.json();
      }),
      fetch("/api/agent-configs", {
        headers,
        cache: "no-store",
      }).then(async (response) => {
        if (!response.ok) throw new Error("Falha ao carregar agentes ativos");
        return response.json() as Promise<AgentConfigItem[]>;
      }),
    ]).then(([officialResult, executiveResult, agentsResult]) => {
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

      if (executiveResult.status === "fulfilled") {
        const snapshot = executiveResult.value as NonNullable<ExecutiveSnapshot>;
        const activeAgents = agentsResult.status === "fulfilled"
          ? agentsResult.value.filter((agent) => agent.ativo === true).length
          : snapshot.ia?.agentesAtivos;

        setExecutive({
          ...snapshot,
          ia: {
            ...snapshot.ia,
            agentesAtivos: activeAgents,
          },
        });
      } else {
        setExecutive(null);
      }

      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [tenantId, token, refreshKey]);

  return (
    <Tabs defaultValue="overview" className="w-full">
      <div className="mx-auto w-full max-w-[1600px] px-4 pt-3 sm:px-6 lg:px-8">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="news">Notícias & Mercado</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="overview" className="mt-0">
        <OfficialCommandCenter
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
          <StrategicObserver
            tenantId={tenantId}
            token={token}
            official={official}
            refreshKey={refreshKey}
          />
          <JarvisObserverCaseSync token={token} />
          <JarvisHistory token={token} refreshKey={refreshKey} />
        </Suspense>
      </TabsContent>

      <TabsContent value="news" className="mt-4">
        <Suspense fallback={null}>
          <JarvisNewsMarket token={token} />
        </Suspense>
      </TabsContent>
    </Tabs>
  );
}
