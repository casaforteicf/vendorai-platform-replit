import { useCallback, useEffect, useState } from "react";
import { BarChart3, Loader2, RefreshCw, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type CampaignAttribution = {
  campaignId: string;
  campaignName: string;
  leads: number;
  won: number;
  revenue: number;
  cost: number;
  cpl: number | null;
  roas: number | null;
};

type AttributionResponse = {
  mediaPlanId: string | null;
  campaigns: CampaignAttribution[];
  hasLinkedCampaigns: boolean;
  note: string | null;
};

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("vendorai_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function currency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export function MarketingAttributionPanel({ tenantId }: { tenantId: string }) {
  const [data, setData] = useState<AttributionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/tenants/${tenantId}/marketing/attribution`, {
        headers: authHeaders(),
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Não foi possível carregar a atribuição por campanha.");
      setData(await response.json() as AttributionResponse);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar a atribuição por campanha.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { void load(); }, [load]);

  return (
    <Card>
      <CardContent className="py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">Atribuição por campanha</p>
              {data?.campaigns.length ? <Badge variant="outline" className="text-[10px]">{data.campaigns.length} campanha(s)</Badge> : null}
            </div>
            <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
              Leads, negócios ganhos e receita ligados à campanha do Plano de Mídia. A ligação vem do anúncio (UTM) ou do
              campo de campanha na captura do lead.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
            Atualizar
          </Button>
        </div>

        {error ? (
          <p className="mt-3 text-xs font-medium text-destructive">{error}</p>
        ) : loading ? (
          <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />Somando leads e vendas por campanha…
          </p>
        ) : !data || data.campaigns.length === 0 ? (
          <div className="mt-3 rounded-lg border border-dashed bg-background px-3 py-4 text-xs text-muted-foreground">
            {data?.note ?? "Ainda não há leads atribuídos a campanhas do plano."}
            {data?.hasLinkedCampaigns ? " Use os links/UTMs gerados pelo plano para que a atribuição comece." : null}
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 pr-3 font-semibold">Campanha</th>
                  <th className="py-2 pr-3 text-right font-semibold">Leads</th>
                  <th className="py-2 pr-3 text-right font-semibold">Ganhos</th>
                  <th className="py-2 pr-3 text-right font-semibold">Receita</th>
                  <th className="py-2 pr-3 text-right font-semibold">Custo</th>
                  <th className="py-2 pr-3 text-right font-semibold">CPL</th>
                  <th className="py-2 text-right font-semibold">ROAS</th>
                </tr>
              </thead>
              <tbody>
                {data.campaigns.map((campaign) => (
                  <tr key={campaign.campaignId} className="border-b last:border-0">
                    <td className="py-2 pr-3">
                      <p className="font-medium">{campaign.campaignName}</p>
                      <p className="text-[10px] text-muted-foreground">{campaign.campaignId}</p>
                    </td>
                    <td className="py-2 pr-3 text-right">{campaign.leads}</td>
                    <td className="py-2 pr-3 text-right">{campaign.won}</td>
                    <td className="py-2 pr-3 text-right">{currency(campaign.revenue)}</td>
                    <td className="py-2 pr-3 text-right">{campaign.cost > 0 ? currency(campaign.cost) : "—"}</td>
                    <td className="py-2 pr-3 text-right">{campaign.cpl !== null ? currency(campaign.cpl) : "—"}</td>
                    <td className="py-2 text-right">{campaign.roas !== null ? `${campaign.roas.toFixed(2)}x` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
              <BarChart3 className="h-3 w-3" />
              Custo/ROAS só aparecem quando a campanha de anúncio tem snapshot de investimento.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
