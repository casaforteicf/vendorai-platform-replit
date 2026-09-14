import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { BarChart3, MousePointerClick, RefreshCw, Target, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

type ThesisPerformance = {
  editorialId: string;
  thesis: string;
  series: string;
  publications: number;
  reach: number;
  impressions: number;
  views: number;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
  clicks: number;
  visits: number;
  leads: number;
  opportunities: number;
  wonDeals: number;
  wonRevenue: number;
  engagement: number;
  engagementRate: number | null;
  visitToLeadRate: number | null;
  leadToOpportunityRate: number | null;
  opportunityToWinRate: number | null;
  lastPublishedAt: string | null;
};

type PerformanceResponse = {
  theses: ThesisPerformance[];
  totals: { publications: number; reach: number; clicks: number; visits: number; leads: number; opportunities: number; wonDeals: number; wonRevenue: number };
  attributionLevel: string;
  note?: string;
};

function isResultsPath() {
  const params = new URLSearchParams(window.location.search);
  return window.location.pathname === "/content" && params.get("tab") === "resultados";
}

export function EditorialPerformanceBridge() {
  const { user, token } = useAuth();
  const tenantId = user?.tenantId;
  const [visible, setVisible] = useState(() => isResultsPath());
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [data, setData] = useState<PerformanceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setVisible(isResultsPath());
    window.addEventListener("popstate", sync);
    const timer = window.setInterval(sync, 400);
    return () => { window.removeEventListener("popstate", sync); window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!visible) { setHost(null); return; }
    const attach = () => {
      const main = document.querySelector("main") ?? document.querySelector("[role='main']");
      if (!(main instanceof HTMLElement)) return false;
      let node = document.getElementById("vendorai-editorial-performance-bridge");
      if (!(node instanceof HTMLElement)) {
        node = document.createElement("section");
        node.id = "vendorai-editorial-performance-bridge";
        node.className = "mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6";
        main.appendChild(node);
      }
      setHost(node);
      return true;
    };
    if (attach()) return;
    const timer = window.setInterval(() => { if (attach()) window.clearInterval(timer); }, 300);
    return () => window.clearInterval(timer);
  }, [visible]);

  async function load() {
    if (!tenantId || !token) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/marketing/editorial/performance`, { headers: { Authorization: `Bearer ${token}` } });
      const payload = await response.json() as PerformanceResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível carregar a performance editorial.");
      setData(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao carregar performance editorial.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (visible && tenantId && token) void load(); }, [visible, tenantId, token]);

  const winner = useMemo(() => data?.theses?.[0] ?? null, [data]);
  if (!visible || !host) return null;

  return createPortal(
    <div className="rounded-2xl border border-orange-500/25 bg-background p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-orange-600" /><h2 className="text-base font-semibold">Performance por tese</h2><Badge variant="outline">First-party</Badge></div>
          <p className="mt-1 text-sm text-muted-foreground">Mostra quais mensagens geram atenção e quais avançam para visita, lead, oportunidade e venda no CRM.</p>
        </div>
        <Button size="sm" variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} />Atualizar</Button>
      </div>

      {error ? <p className="mt-3 rounded-md border border-destructive/30 p-2 text-xs text-destructive">{error}</p> : null}
      {data ? <>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Publicações</p><p className="mt-1 text-2xl font-semibold">{data.totals.publications}</p></div>
          <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Visitas</p><p className="mt-1 text-2xl font-semibold">{data.totals.visits}</p></div>
          <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Leads</p><p className="mt-1 text-2xl font-semibold">{data.totals.leads}</p></div>
          <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Oportunidades</p><p className="mt-1 text-2xl font-semibold">{data.totals.opportunities}</p></div>
          <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Vendas ganhas</p><p className="mt-1 text-2xl font-semibold">{data.totals.wonDeals}</p></div>
          <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Receita ganha</p><p className="mt-1 text-2xl font-semibold">{data.totals.wonRevenue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p></div>
        </div>
        {winner ? <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3 text-sm"><Target className="h-4 w-4 text-emerald-600" /><strong>Tese líder:</strong><span>{winner.thesis}</span>{winner.wonRevenue > 0 ? <Badge>{winner.wonRevenue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</Badge> : winner.opportunities > 0 ? <Badge>{winner.opportunities} oportunidade(s)</Badge> : winner.engagementRate != null ? <Badge>{(winner.engagementRate * 100).toFixed(1)}% eng.</Badge> : null}</div> : null}
        <div className="mt-4 space-y-2">
          {data.theses.length === 0 ? <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Ainda não há dados atribuídos por tese.</div> : data.theses.map((item) => <div key={item.editorialId} className="rounded-xl border p-3"><div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between"><div><p className="text-sm font-semibold">{item.thesis}</p><p className="mt-1 text-[11px] text-muted-foreground">{item.editorialId} · {item.publications} publicação(ões)</p></div><div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4 xl:grid-cols-7"><Metric label="Alcance" value={item.reach.toLocaleString("pt-BR")} /><Metric label="Cliques" value={item.clicks.toLocaleString("pt-BR")} icon /><Metric label="Visitas" value={String(item.visits)} /><Metric label="Leads" value={String(item.leads)} /><Metric label="Oportunidades" value={String(item.opportunities)} /><Metric label="Vendas" value={String(item.wonDeals)} /><Metric label="Receita" value={item.wonRevenue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} /></div></div><div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground"><span>Visita→Lead: {item.visitToLeadRate == null ? "—" : `${(item.visitToLeadRate * 100).toFixed(1)}%`}</span><span>Lead→Oportunidade: {item.leadToOpportunityRate == null ? "—" : `${(item.leadToOpportunityRate * 100).toFixed(1)}%`}</span><span>Oportunidade→Venda: {item.opportunityToWinRate == null ? "—" : `${(item.opportunityToWinRate * 100).toFixed(1)}%`}</span></div></div>)}
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">{data.note}</p>
      </> : null}
    </div>,
    host,
  );
}

function Metric({ label, value, icon = false }: { label: string; value: string; icon?: boolean }) {
  return <div><p className="text-[10px] uppercase text-muted-foreground">{label}</p><p className="flex items-center gap-1 text-sm font-semibold">{icon ? <MousePointerClick className="h-3.5 w-3.5" /> : label === "Receita" ? <TrendingUp className="h-3.5 w-3.5" /> : null}{value}</p></div>;
}