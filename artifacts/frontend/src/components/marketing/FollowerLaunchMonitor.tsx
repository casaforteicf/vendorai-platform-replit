import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Loader2, Megaphone, Repeat2, Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

type Metrics = Record<string, number>;
type Publication = {
  id: string;
  provider: string;
  contentType: string;
  text?: string | null;
  status: string;
  metrics?: Metrics | null;
  publishedAt?: string | null;
  createdAt?: string | null;
};

type Signal = "collecting" | "organic" | "paid";

function reach(metrics: Metrics | null | undefined) {
  return metrics?.reach ?? metrics?.views ?? metrics?.plays ?? metrics?.impressions ?? 0;
}

function quality(metrics: Metrics | null | undefined) {
  if (!metrics) return 0;
  const base = Math.max(1, reach(metrics));
  const weighted = (metrics.shares ?? 0) * 6 + (metrics.saved ?? metrics.saves ?? 0) * 5 + (metrics.comments ?? 0) * 3 + (metrics.replies ?? 0) * 4 + (metrics.linkClicks ?? metrics.clicks ?? 0) * 5 + (metrics.likes ?? 0);
  return weighted / base;
}

function classify(publication: Publication): Signal {
  const r = reach(publication.metrics);
  const q = quality(publication.metrics);
  if (r >= 500 && q >= 0.08) return "paid";
  if (r >= 300 && q >= 0.04) return "organic";
  return "collecting";
}

export function FollowerLaunchMonitor() {
  const { user, tenantOverride, token } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const [publications, setPublications] = useState<Publication[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId || !token) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/tenants/${tenantId}/social-publications`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const payload = await response.json() as { publications?: Publication[] };
        return payload.publications ?? [];
      })
      .then((data) => { if (!cancelled) setPublications(data); })
      .catch(() => { if (!cancelled) setPublications([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tenantId, token]);

  const recent = useMemo(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return publications
      .filter((item) => ["instagram", "facebook"].includes(item.provider))
      .filter((item) => item.status === "published" || Boolean(item.publishedAt))
      .filter((item) => new Date(item.publishedAt || item.createdAt || 0).getTime() >= cutoff)
      .map((item) => ({ item, signal: classify(item), score: quality(item.metrics) }))
      .sort((a, b) => b.score - a.score);
  }, [publications]);

  if (!tenantId || !token) return null;
  if (loading) return <Card><CardContent className="flex items-center gap-2 py-5 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Lendo as primeiras horas das publicações…</CardContent></Card>;

  return (
    <Card className="border-fuchsia-500/25">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2"><Activity className="h-5 w-5 text-fuchsia-600" /><CardTitle className="text-base">Monitor de lançamento · primeiras 24h</CardTitle></div>
            <p className="mt-1 text-xs text-muted-foreground">Lê a tração inicial e indica se a peça deve continuar orgânica, ser replicada ou entrar em teste pago.</p>
          </div>
          <Badge variant="outline">{recent.length} publicações recentes</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!recent.length ? (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Ainda não há publicação Meta com dados das últimas 24 horas.</div>
        ) : recent.slice(0, 6).map(({ item, signal, score }) => {
          const r = reach(item.metrics);
          const label = signal === "paid" ? "Candidata a teste pago" : signal === "organic" ? "Replicar organicamente" : "Coletando sinal";
          return (
            <div key={item.id} className="rounded-lg border p-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><Badge variant={signal === "paid" ? "default" : "outline"}>{label}</Badge><Badge variant="outline">{item.provider} · {item.contentType}</Badge></div>
                  <p className="mt-2 line-clamp-2 text-sm font-medium">{item.text || "Publicação sem texto"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{r.toLocaleString("pt-BR")} alcance/views · índice de qualidade {(score * 100).toFixed(1)}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {signal !== "collecting" ? <Button size="sm" variant="outline" onClick={() => window.location.assign(`/content?tab=gerador&from=follower-launch-monitor&sourcePublicationId=${encodeURIComponent(item.id)}`)}><Repeat2 className="mr-1.5 h-4 w-4" />Replicar</Button> : null}
                  <Button size="sm" disabled={signal !== "paid"} onClick={() => window.location.assign(`/content?tab=campanhas&from=follower-launch-monitor&sourcePublicationId=${encodeURIComponent(item.id)}`)}><Megaphone className="mr-1.5 h-4 w-4" />Preparar teste pago</Button>
                </div>
              </div>
            </div>
          );
        })}
        <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground"><div className="flex items-center gap-2 font-medium text-foreground"><Sparkles className="h-4 w-4" />Regra inicial</div><p className="mt-1">Menos de 300 de alcance/views: coletar sinal. A partir de 300 com índice de qualidade ≥ 4%: replicar organicamente. A partir de 500 e ≥ 8%: considerar teste pago. Nenhum gasto é ativado automaticamente.</p></div>
      </CardContent>
    </Card>
  );
}
