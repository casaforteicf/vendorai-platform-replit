import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import OfficialCommandCenter from "@/components/dashboard/OfficialCommandCenter";
import DashboardLegacy from "./DashboardLegacy";

type OfficialMetrics = Parameters<typeof OfficialCommandCenter>[0]["data"];

export default function Dashboard() {
  const { user, token } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const [official, setOfficial] = useState<OfficialMetrics>(null);
  const [officialLoading, setOfficialLoading] = useState(false);

  useEffect(() => {
    if (!tenantId || !token) {
      setOfficial(null);
      setOfficialLoading(false);
      return;
    }

    let cancelled = false;
    setOfficialLoading(true);

    fetch(`/api/tenants/${tenantId}/dashboard/command-center`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Falha ao carregar métricas oficiais");
        return response.json();
      })
      .then((data) => {
        if (!cancelled) setOfficial(data as OfficialMetrics);
      })
      .catch(() => {
        if (!cancelled) setOfficial(null);
      })
      .finally(() => {
        if (!cancelled) setOfficialLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tenantId, token]);

  const horaAtual = new Date().getHours();
  const saudacao = horaAtual < 12 ? "Bom dia" : horaAtual < 18 ? "Boa tarde" : "Boa noite";
  const primeiroNome = user?.name?.split(" ")[0] ?? "";

  return (
    <div className="space-y-6 md:space-y-8">
      <div>
        <h1 className="vendor-page-title">
          {saudacao}{primeiroNome ? `, ${primeiroNome}` : ""}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Aqui está o resumo do seu negócio hoje.
        </p>
      </div>

      <OfficialCommandCenter data={official} loading={officialLoading} />

      <div className="dashboard-legacy-details">
        <DashboardLegacy />
      </div>

      <style>{`
        .dashboard-legacy-details > div > div:first-child {
          display: none;
        }
        .dashboard-legacy-details > div > div:has(+ div > [data-testid="card-total-leads"]) {
          display: none;
        }
        .dashboard-legacy-details div:has(> [data-testid="card-total-leads"]) {
          display: none;
        }
        .dashboard-legacy-details div:has(> [data-testid="card-total-leads"]) + .grid {
          display: none;
        }
      `}</style>
    </div>
  );
}
