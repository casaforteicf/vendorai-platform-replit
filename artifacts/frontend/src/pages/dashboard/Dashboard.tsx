import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import OfficialCommandCenter from "@/components/dashboard/OfficialCommandCenter";

type CommandCenterProps = Parameters<typeof OfficialCommandCenter>[0];
type OfficialMetrics = CommandCenterProps["data"];
type ExecutiveSnapshot = CommandCenterProps["executive"];
type AgentConfigItem = { ativo?: boolean };

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

      setOfficial(officialResult.status === "fulfilled" ? officialResult.value as OfficialMetrics : null);

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
    <OfficialCommandCenter
      data={official}
      executive={executive}
      loading={loading}
      userName={user?.name ?? ""}
      onRefresh={refresh}
    />
  );
}
