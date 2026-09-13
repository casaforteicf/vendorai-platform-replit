import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Megaphone, Repeat2, Sparkles, Trophy } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

type Metrics = {
  reach?: number;
  views?: number;
  plays?: number;
  likes?: number;
  comments?: number;
  saved?: number;
  shares?: number;
  replies?: number;
  linkClicks?: number;
};

type PublishedPost = {
  id: string;
  contentType: string;
  theme?: string | null;
  captionOuTexto?: string | null;
  metricas?: Metrics | null;
  publishedAt: string;
};

function score(metrics: Metrics | null | undefined) {
  if (!metrics) return 0;
  const reach = Math.max(1, metrics.reach ?? metrics.views ?? metrics.plays ?? 0);
  const quality = (metrics.saved ?? 0) * 5 + (metrics.shares ?? 0) * 6 + (metrics.comments ?? 0) * 3 + (metrics.replies ?? 0) * 4 + (metrics.linkClicks ?? 0) * 5 + (metrics.likes ?? 0);
  return quality / reach;
}

function n(value: number | null | undefined) {
  return new Intl.NumberFormat("pt-BR").format(value ?? 0);
}

export function FollowerWinnerEngine() {
  const { user, tenantOverride, token } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const [posts, setPosts] = useState<PublishedPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId || !token) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/tenants/${tenantId}/content-performance/posts`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => {
        if (!response.ok) throw new Error("Não foi possível carregar a performance dos conteúdos.");
        return response.json() as Promise<PublishedPost[]>;
      })
      .then((data) => { if (!cancelled) setPosts(data); })
      .catch(() => { if (!cancelled) setPosts([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tenantId, token]);

  const ranked = useMemo(() => {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return posts
      .filter((post) => new Date(post.publishedAt).getTime() >= cutoff)
      .filter((post) => (post.metricas?.reach ?? post.metricas?.views ?? post.metricas?.plays ?? 0) > 0)
      .map((post) => ({ post, score: score(post.metricas) }))
      .sort((a, b) => b.score - a.score);
  }, [posts]);

  const winner = ranked[0] ?? null;
  const runnerUp = ranked[1] ?? null;
  const winnerReach = winner?.post.metricas?.reach ?? winner?.post.metricas?.views ?? winner?.post.metricas?.plays ?? 0;
  const enoughData = ranked.length >= 3 && winnerReach >= 300;
  const clearLead = Boolean(winner && (!runnerUp || winner.score >= runnerUp.score * 1.15));
  const boostReady = Boolean(winner && enoughData && clearLead);

  if (!tenantId || !token) return null;
  if (loading) return <Card><CardContent className="flex items-center gap-2 py-5 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Analisando conteúdo vencedor…</CardContent></Card>;

  return (
    <Card className="border-amber-500/25">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-amber-600" />
          <div>
            <CardTitle className="text-base">Motor de Conteúdo Vencedor</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Escolhe o que merece ser replicado e só recomenda mídia paga quando há sinal real de tração.</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!winner ? (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Ainda não há conteúdo com métricas suficientes nos últimos 30 dias.</div>
        ) : (
          <>
            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2"><Badge>Vencedor atual</Badge><Badge variant="outline">{winner.post.contentType}</Badge></div>
                  <p className="mt-2 font-semibold">{winner.post.theme || winner.post.captionOuTexto?.slice(0, 90) || "Conteúdo sem título"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{n(winnerReach)} alcance/views · score de qualidade {(winner.score * 100).toFixed(2)}</p>
                </div>
                <Badge variant={boostReady ? "default" : "outline"}>{boostReady ? "Pronto para testar mídia" : "Ainda coletando sinal"}</Badge>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border p-3">
                <div className="flex items-center gap-2"><Repeat2 className="h-4 w-4" /><p className="text-sm font-semibold">Replicar agora</p></div>
                <p className="mt-1 text-xs text-muted-foreground">Criar 3 novas variações mantendo a mesma dor central e mudando gancho, abertura e CTA.</p>
                <Button size="sm" className="mt-3 w-full" onClick={() => window.location.assign(`/content?tab=gerador&from=follower-winner&sourcePostId=${encodeURIComponent(winner.post.id)}`)}>Criar 3 variações</Button>
              </div>

              <div className="rounded-lg border p-3">
                <div className="flex items-center gap-2"><Megaphone className="h-4 w-4" /><p className="text-sm font-semibold">Mídia paga seletiva</p></div>
                <p className="mt-1 text-xs text-muted-foreground">{boostReady ? "O conteúdo tem volume e vantagem suficientes para um teste controlado de impulsionamento." : "Ainda não há confiança suficiente para gastar mídia. Primeiro colete mais alcance e comparação."}</p>
                <Button size="sm" variant="outline" className="mt-3 w-full" disabled={!boostReady} onClick={() => window.location.assign(`/content?tab=campanhas&from=follower-winner&sourcePostId=${encodeURIComponent(winner.post.id)}`)}>Preparar teste de impulsionamento</Button>
              </div>
            </div>

            <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-2 font-medium text-foreground"><Sparkles className="h-4 w-4" />Regra atual</div>
              <p className="mt-1">Só liberamos recomendação de mídia com pelo menos 3 conteúdos comparáveis, mínimo de 300 de alcance/views no vencedor e vantagem de 15% sobre o segundo colocado.</p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
