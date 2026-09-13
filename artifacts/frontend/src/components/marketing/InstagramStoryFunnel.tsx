import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Eye, MessageCircle, MousePointerClick, ShoppingCart, Target, Users } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

type StoryFunnel = {
  periodDays: number;
  attribution: string;
  totals: {
    stories: number;
    reach: number;
    views: number;
    replies: number;
    linkClicks: number;
    dms: number;
    leads: number;
    opportunities: number;
    sales: number;
    revenue: number;
  };
  rates: {
    interactionPerReach: number | null;
    dmPerInteraction: number | null;
    leadPerDm: number | null;
    opportunityPerLead: number | null;
    salePerOpportunity: number | null;
  };
  topStories: Array<{
    mediaId: string;
    theme?: string | null;
    caption?: string | null;
    publishedAt: string;
    reach: number;
    views: number;
    replies: number;
    linkClicks: number;
    dms: number;
    leads: number;
    opportunities: number;
    sales: number;
    revenue: number;
  }>;
};

type Overview = { storyFunnel?: StoryFunnel | null };

function n(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function pct(value: number | null) {
  return value == null ? "—" : `${value.toFixed(1)}%`;
}

export function InstagramStoryFunnel() {
  const { user, tenantOverride, token } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const [data, setData] = useState<StoryFunnel | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId || !token) return;
    let active = true;
    setLoading(true);
    fetch(`/api/tenants/${tenantId}/meta-growth/overview`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => {
        if (!response.ok) throw new Error("Falha ao carregar funil de Stories");
        return response.json() as Promise<Overview>;
      })
      .then((overview) => { if (active) setData(overview.storyFunnel ?? null); })
      .catch(() => { if (active) setData(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [tenantId, token]);

  if (!tenantId || !token) return null;

  return (
    <Card className="border-fuchsia-500/20">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Funil dos Stories</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">30 dias · interação do Story separada da conversão realmente atribuída ao CRM.</p>
          </div>
          <Badge variant="outline">Atribuição por media_id</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando funil…</p>
        ) : !data ? (
          <p className="text-sm text-muted-foreground">O funil ficará disponível quando houver Stories publicados e dados de atribuição do Instagram.</p>
        ) : (
          <>
            <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
              <Stage icon={<Eye className="h-4 w-4" />} label="Alcance" value={n(data.totals.reach)} detail={`${data.totals.stories} Stories`} />
              <Stage icon={<MousePointerClick className="h-4 w-4" />} label="Respostas + cliques" value={n(data.totals.replies + data.totals.linkClicks)} detail={pct(data.rates.interactionPerReach)} />
              <Stage icon={<MessageCircle className="h-4 w-4" />} label="DMs atribuídas" value={n(data.totals.dms)} detail={pct(data.rates.dmPerInteraction)} />
              <Stage icon={<Users className="h-4 w-4" />} label="Leads" value={n(data.totals.leads)} detail={pct(data.rates.leadPerDm)} />
              <Stage icon={<Target className="h-4 w-4" />} label="Oportunidades" value={n(data.totals.opportunities)} detail={pct(data.rates.opportunityPerLead)} />
              <Stage icon={<ShoppingCart className="h-4 w-4" />} label="Vendas" value={n(data.totals.sales)} detail={pct(data.rates.salePerOpportunity)} />
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{n(data.totals.views)} views</span><ArrowRight className="h-3 w-3" />
              <span>{n(data.totals.replies)} respostas</span><ArrowRight className="h-3 w-3" />
              <span>{n(data.totals.linkClicks)} cliques</span><ArrowRight className="h-3 w-3" />
              <span className="font-medium text-foreground">{money(data.totals.revenue)} em vendas atribuídas</span>
            </div>

            {data.topStories.length > 0 && (
              <div className="rounded-lg border">
                <div className="border-b px-3 py-2 text-sm font-semibold">Stories com melhor sinal comercial</div>
                <div className="divide-y">
                  {data.topStories.slice(0, 5).map((story) => (
                    <div key={story.mediaId} className="grid gap-2 px-3 py-3 md:grid-cols-[1fr_auto] md:items-center">
                      <div>
                        <p className="text-sm font-medium">{story.theme || story.caption?.slice(0, 80) || "Story publicado"}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{n(story.views)} views · {n(story.replies)} respostas · {n(story.linkClicks)} cliques · {n(story.dms)} DMs</p>
                      </div>
                      <div className="text-left md:text-right">
                        <p className="text-sm font-semibold">{story.leads} leads · {story.sales} vendas</p>
                        <p className="text-xs text-muted-foreground">{money(story.revenue)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-[11px] text-muted-foreground">Clique ou resposta só entra como interação. Lead, oportunidade e venda só entram quando o evento do Instagram está ligado ao mesmo Story e ao CRM.</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Stage({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}{label}</div>
      <p className="mt-2 text-xl font-semibold">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{detail}</p>
    </div>
  );
}
