import { useEffect, useState } from "react";
import { BarChart3, Loader2, RefreshCw, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type SocialPublication = {
  id: string;
  provider?: string | null;
  status?: string | null;
  publishedAt?: string | null;
  createdAt?: string | null;
};

type PerformanceInsight = {
  baseadoEmPosts?: number;
  atualizadoEm?: string | null;
  aprendizados?: {
    temasQueFuncionam?: string[];
    temasQueNaoFuncionam?: string[];
    formatoQueMaisEngaja?: string;
    observacoes?: string;
  } | null;
};

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("vendorai_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export function MarketingResultsSummary({ tenantId }: { tenantId: string }) {
  const [insight, setInsight] = useState<PerformanceInsight | null>(null);
  const [publications, setPublications] = useState<SocialPublication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    if (!tenantId) return;
    setLoading(true);
    setError("");
    try {
      const [insightResponse, publicationsResponse] = await Promise.all([
        fetch(`/api/tenants/${tenantId}/content-performance/insights`, { headers: authHeaders(), cache: "no-store" }),
        fetch(`/api/tenants/${tenantId}/social-publications`, { headers: authHeaders(), cache: "no-store" }),
      ]);
      if (!insightResponse.ok) throw new Error("Não foi possível carregar o desempenho agora.");
      setInsight(await insightResponse.json() as PerformanceInsight);
      if (publicationsResponse.ok) {
        const body = await publicationsResponse.json().catch(() => ({})) as { publications?: SocialPublication[] };
        setPublications(Array.isArray(body.publications) ? body.publications : []);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar o desempenho agora.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const learnings = insight?.aprendizados ?? null;
  const posts = Number(insight?.baseadoEmPosts ?? 0);
  const hasData = posts > 0 && Boolean(learnings);
  const published = publications.filter((item) => item.status === "published");
  const inFlight = publications.filter((item) => ["queued", "scheduled", "publishing"].includes(String(item.status ?? "")));
  const lastPublishedAt = published
    .map((item) => item.publishedAt ?? item.createdAt ?? "")
    .filter(Boolean)
    .sort()
    .at(-1);
  const works = (learnings?.temasQueFuncionam ?? []).filter(Boolean).slice(0, 4);
  const misses = (learnings?.temasQueNaoFuncionam ?? []).filter(Boolean).slice(0, 4);

  return (
    <Card className="border-primary/20 bg-primary/[0.02]">
      <CardContent className="py-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">Desempenho dos conteúdos publicados</p>
              {hasData && <Badge variant="outline" className="text-[10px]">{posts} post(s) analisado(s)</Badge>}
              {insight?.atualizadoEm && <span className="text-[11px] text-muted-foreground">atualizado em {formatDate(insight.atualizadoEm)}</span>}
            </div>
            <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
              O VendorAI lê o desempenho dos conteúdos publicados e transforma em direção para o próximo ciclo. Publicar e conectar os canais alimenta este painel.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
            Atualizar
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-lg border bg-background px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Publicados</p>
            <p className="mt-0.5 text-lg font-semibold">{published.length}</p>
          </div>
          <div className="rounded-lg border bg-background px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Na fila</p>
            <p className="mt-0.5 text-lg font-semibold">{inFlight.length}</p>
          </div>
          <div className="rounded-lg border bg-background px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Posts analisados</p>
            <p className="mt-0.5 text-lg font-semibold">{posts}</p>
          </div>
          <div className="rounded-lg border bg-background px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Última publicação</p>
            <p className="mt-0.5 text-sm font-semibold">{formatDate(lastPublishedAt) || "—"}</p>
          </div>
        </div>

        {error ? (
          <p className="text-xs font-medium text-destructive">{error}</p>
        ) : loading ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Lendo o desempenho dos conteúdos…</p>
        ) : !hasData ? (
          <div className="rounded-lg border border-dashed bg-background px-3 py-4 text-xs text-muted-foreground">
            Ainda não há dados suficientes para aprender com o ciclo. Publique os conteúdos aprovados e conecte Instagram/Meta para o painel começar a comparar temas, formatos e engajamento.
          </div>
        ) : (
          <div className="grid gap-2 md:grid-cols-3">
            <div className="rounded-lg border bg-background px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Formato que mais engaja</p>
              <p className="mt-1 text-sm font-semibold">{learnings?.formatoQueMaisEngaja?.trim() || "Ainda medindo"}</p>
            </div>
            <div className="rounded-lg border bg-background px-3 py-2.5">
              <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-emerald-700"><TrendingUp className="h-3 w-3" />Temas que funcionam</p>
              <p className="mt-1 text-xs">{works.length ? works.join(" · ") : "Sem destaque ainda"}</p>
            </div>
            <div className="rounded-lg border bg-background px-3 py-2.5">
              <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-amber-700"><TrendingDown className="h-3 w-3" />Temas que não funcionam</p>
              <p className="mt-1 text-xs">{misses.length ? misses.join(" · ") : "Sem destaque ainda"}</p>
            </div>
            {learnings?.observacoes?.trim() ? (
              <div className="rounded-lg border bg-background px-3 py-2.5 md:col-span-3">
                <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground"><Sparkles className="h-3 w-3" />Aprendizado do ciclo</p>
                <p className="mt-1 text-xs">{learnings.observacoes}</p>
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
