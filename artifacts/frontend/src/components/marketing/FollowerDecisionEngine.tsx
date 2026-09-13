import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Loader2, Megaphone, Repeat2, ShieldAlert, TrendingUp } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

type MetaGrowth = {
  followersDelta7d?: number | null;
  followersDelta30d?: number | null;
  profileVisits30d?: number | null;
  organicLeads30d?: number | null;
  paidSpend30d?: number | null;
  topContent?: Array<{ id: string; title: string; engagements: number }>;
};

type Publication = { id: string; provider: string; status: string; publishedAt?: string | null; createdAt?: string | null; metrics?: Record<string, number> | null };

type Decision = "collect" | "organic" | "replicate" | "paid" | "hold";

function reach(m?: Record<string, number> | null) { return m?.reach ?? m?.views ?? m?.plays ?? m?.impressions ?? 0; }
function quality(m?: Record<string, number> | null) {
  if (!m) return 0;
  const r = Math.max(1, reach(m));
  return ((m.shares ?? 0) * 6 + (m.saved ?? m.saves ?? 0) * 5 + (m.comments ?? 0) * 3 + (m.replies ?? 0) * 4 + (m.linkClicks ?? m.clicks ?? 0) * 5 + (m.likes ?? 0)) / r;
}

export function FollowerDecisionEngine() {
  const { user, tenantOverride, token } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const [growth, setGrowth] = useState<MetaGrowth | null>(null);
  const [publications, setPublications] = useState<Publication[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId || !token) return;
    let cancelled = false;
    const headers = { Authorization: `Bearer ${token}` };
    setLoading(true);
    Promise.all([
      fetch(`/api/tenants/${tenantId}/meta-growth/overview`, { headers }),
      fetch(`/api/tenants/${tenantId}/social-publications`, { headers }),
    ])
      .then(async ([g, p]) => {
        if (!g.ok || !p.ok) throw new Error();
        const gp = await g.json() as MetaGrowth;
        const pp = await p.json() as { publications?: Publication[] };
        return [gp, pp.publications ?? []] as const;
      })
      .then(([g, p]) => { if (!cancelled) { setGrowth(g); setPublications(p); } })
      .catch(() => { if (!cancelled) { setGrowth(null); setPublications([]); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tenantId, token]);

  const result = useMemo(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const recent = publications
      .filter((p) => ["instagram", "facebook"].includes(p.provider))
      .filter((p) => p.status === "published" || Boolean(p.publishedAt))
      .filter((p) => new Date(p.publishedAt || p.createdAt || 0).getTime() >= cutoff)
      .map((p) => ({ p, reach: reach(p.metrics), q: quality(p.metrics) }))
      .sort((a, b) => b.q - a.q);

    const best = recent[0] ?? null;
    const followers7d = growth?.followersDelta7d ?? 0;
    const followers30d = growth?.followersDelta30d ?? 0;
    const visits = growth?.profileVisits30d ?? 0;
    const leads = growth?.organicLeads30d ?? 0;
    const spend = growth?.paidSpend30d ?? 0;
    const cpf = followers30d > 0 && spend > 0 ? spend / followers30d : null;

    let decision: Decision = "collect";
    let title = "Coletar mais sinal";
    let reason = "Ainda não há volume suficiente para escalar com segurança.";
    let action = "Publicar o plano de hoje e medir as próximas 24h.";

    if (followers7d <= 0 && recent.length >= 3) {
      decision = "hold";
      title = "Não escalar mídia agora";
      reason = "A audiência não cresceu nos últimos 7 dias apesar de já haver volume de conteúdo recente.";
      action = "Trocar gancho/tema e melhorar conversão de visita ao perfil antes de investir.";
    }
    if (best && best.reach >= 300 && best.q >= 0.04) {
      decision = "replicate";
      title = "Replicar o vencedor";
      reason = "Há conteúdo com amostra mínima e qualidade suficiente para uma nova variação orgânica.";
      action = "Criar 3 variações do melhor conteúdo antes de ampliar orçamento.";
    }
    if (best && best.reach >= 500 && best.q >= 0.08 && followers7d > 0) {
      decision = "paid";
      title = "Preparar teste pago controlado";
      reason = "O melhor conteúdo tem tração forte e a conta já apresenta crescimento positivo de seguidores.";
      action = "Abrir campanha de teste com orçamento pequeno, sem ativação automática.";
    } else if (followers7d > 0 && (!best || best.reach < 300)) {
      decision = "organic";
      title = "Manter aceleração orgânica";
      reason = "A conta está crescendo, mas as peças recentes ainda não têm amostra suficiente para mídia paga.";
      action = "Manter frequência e concentrar produção nos temas que mais levam visitas ao perfil.";
    }

    return { decision, title, reason, action, best, followers7d, followers30d, visits, leads, cpf };
  }, [growth, publications]);

  if (!tenantId || !token) return null;
  if (loading) return <Card><CardContent className="flex items-center gap-2 py-5 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Calculando decisão de crescimento…</CardContent></Card>;

  const Icon = result.decision === "paid" ? Megaphone : result.decision === "replicate" ? Repeat2 : result.decision === "hold" ? ShieldAlert : TrendingUp;
  return (
    <Card className="border-cyan-500/25">
      <CardHeader className="pb-3"><div className="flex items-center gap-2"><Icon className="h-5 w-5 text-cyan-600" /><CardTitle className="text-base">Decisão de crescimento de hoje</CardTitle><Badge variant="outline">{result.decision}</Badge></div></CardHeader>
      <CardContent className="space-y-4">
        <div><p className="text-lg font-semibold">{result.title}</p><p className="mt-1 text-sm text-muted-foreground">{result.reason}</p></div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5 text-xs">
          <Metric label="Seguidores 7d" value={`${result.followers7d >= 0 ? "+" : ""}${result.followers7d}`} />
          <Metric label="Seguidores 30d" value={`${result.followers30d >= 0 ? "+" : ""}${result.followers30d}`} />
          <Metric label="Visitas ao perfil" value={String(result.visits)} />
          <Metric label="Leads orgânicos" value={String(result.leads)} />
          <Metric label="Custo misto/seguidor" value={result.cpf == null ? "—" : `R$ ${result.cpf.toFixed(2)}`} />
        </div>
        <div className="rounded-lg bg-muted/40 p-3 text-sm"><span className="font-medium">Próxima ação:</span> {result.action}</div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => window.location.assign(result.decision === "paid" ? "/content?tab=campanhas&objective=followers&from=follower-decision" : "/content?tab=gerador&objective=followers&from=follower-decision")}>Executar próxima ação<ArrowRight className="ml-2 h-4 w-4" /></Button>
          <Button variant="outline" onClick={() => window.location.assign("/content?tab=resultados")}>Ver resultados</Button>
        </div>
        <p className="text-[11px] text-muted-foreground">A decisão usa sinais disponíveis do tenant e não ativa publicação nem mídia paga automaticamente.</p>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border bg-background p-2"><p className="text-muted-foreground">{label}</p><p className="mt-1 font-semibold">{value}</p></div>;
}
