import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Copy, Loader2, Sparkles, Video } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

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

type Learning = {
  aprendizados?: {
    temasQueFuncionam?: string[];
    formatoQueMaisEngaja?: string;
    observacoes?: string;
  } | null;
};

type Pack = {
  title: string;
  hook: string;
  script: string;
  cta: string;
  caption: string;
  visual: string;
};

function score(metrics: Metrics | null | undefined) {
  if (!metrics) return 0;
  const reach = Math.max(1, metrics.reach ?? metrics.views ?? metrics.plays ?? 0);
  const quality = (metrics.saved ?? 0) * 5 + (metrics.shares ?? 0) * 6 + (metrics.comments ?? 0) * 3 + (metrics.replies ?? 0) * 4 + (metrics.linkClicks ?? 0) * 5 + (metrics.likes ?? 0);
  return quality / reach;
}

function buildPacks(theme: string, winner: PublishedPost | null): Pack[] {
  const base = theme.trim() || "uma dor real do cliente";
  const winnerText = winner?.theme || winner?.captionOuTexto?.slice(0, 80) || base;
  return [
    {
      title: "Reel 1 · Dor forte",
      hook: `Se você ainda sofre com ${base}, provavelmente está atacando o problema errado.`,
      script: `Abra mostrando a dor em 2 segundos. Em seguida explique o erro mais comum relacionado a ${base}. Mostre uma alternativa prática e feche com uma pequena prova ou demonstração. Duração sugerida: 20–30s.`,
      cta: "Siga o perfil para ver a próxima parte amanhã.",
      caption: `A maioria tenta resolver ${base} pelo caminho mais óbvio — e perde tempo. Aqui vamos mostrar o que realmente muda o resultado. Salve e siga para acompanhar a sequência.`,
      visual: "Vertical 9:16, cortes rápidos, legenda grande, primeira frase ocupando a tela nos 2 primeiros segundos e demonstração real no meio do vídeo.",
    },
    {
      title: "Reel 2 · Continuação do vencedor",
      hook: `O que quase ninguém percebe sobre ${winnerText}.`,
      script: `Use a mesma dor central do conteúdo vencedor, mas comece pela consequência mais inesperada. Mostre 3 pontos rápidos, um por corte, e termine com uma aplicação prática. Duração sugerida: 25–35s.`,
      cta: "Comente 'parte 2' se quiser a continuação e siga para não perder.",
      caption: `Esse é o desdobramento do conteúdo que mais chamou atenção recentemente. A ideia é simples: repetir o que funcionou sem repetir o mesmo vídeo.`,
      visual: "Mesmo estilo visual do vencedor, mudando enquadramento, abertura e texto de tela para criar reconhecimento sem parecer repetição.",
    },
    {
      title: "Reel 3 · Prova / demonstração",
      hook: `Veja o que muda quando você aplica isso a ${base}.`,
      script: `Comece com o resultado final. Depois volte e mostre rapidamente como chegou nele. Use antes/depois, tela do sistema, demonstração ou comparação objetiva. Duração sugerida: 20–40s.`,
      cta: "Siga para acompanhar os próximos testes e resultados.",
      caption: `Menos teoria, mais prova. Este conteúdo mostra na prática como ${base} pode ser tratado de forma mais simples e mensurável.`,
      visual: "Abrir com resultado, números ou transformação visível. Evitar introdução longa. Inserir CTA final em tela por 2 segundos.",
    },
  ];
}

export function FollowerContentPack() {
  const { user, tenantOverride, token } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const { toast } = useToast();
  const [posts, setPosts] = useState<PublishedPost[]>([]);
  const [learning, setLearning] = useState<Learning | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId || !token) return;
    let cancelled = false;
    const headers = { Authorization: `Bearer ${token}` };
    setLoading(true);
    Promise.all([
      fetch(`/api/tenants/${tenantId}/content-performance/posts`, { headers }),
      fetch(`/api/tenants/${tenantId}/content-performance/insights`, { headers }),
    ])
      .then(async ([postsResponse, learningResponse]) => {
        if (!postsResponse.ok || !learningResponse.ok) throw new Error();
        return Promise.all([
          postsResponse.json() as Promise<PublishedPost[]>,
          learningResponse.json() as Promise<Learning | null>,
        ]);
      })
      .then(([postsData, learningData]) => {
        if (cancelled) return;
        setPosts(postsData);
        setLearning(learningData);
      })
      .catch(() => {
        if (cancelled) return;
        setPosts([]);
        setLearning(null);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tenantId, token]);

  const winner = useMemo(() => {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return [...posts]
      .filter((post) => new Date(post.publishedAt).getTime() >= cutoff)
      .filter((post) => (post.metricas?.reach ?? post.metricas?.views ?? post.metricas?.plays ?? 0) > 0)
      .sort((a, b) => score(b.metricas) - score(a.metricas))[0] ?? null;
  }, [posts]);

  const theme = learning?.aprendizados?.temasQueFuncionam?.[0]
    || winner?.theme
    || winner?.captionOuTexto?.slice(0, 70)
    || "uma dor real do cliente";
  const packs = useMemo(() => buildPacks(theme, winner), [theme, winner]);

  async function copyPack(pack: Pack) {
    const text = [pack.title, `Gancho: ${pack.hook}`, `Roteiro: ${pack.script}`, `CTA: ${pack.cta}`, `Legenda: ${pack.caption}`, `Direção visual: ${pack.visual}`].join("\n\n");
    await navigator.clipboard?.writeText(text).catch(() => undefined);
    toast({ title: "Pacote copiado", description: "Gancho, roteiro, CTA, legenda e direção visual foram copiados." });
  }

  function openGenerator(pack: Pack) {
    const prompt = [pack.hook, pack.script, pack.cta, pack.caption, pack.visual].join(" | ");
    window.location.assign(`/content?tab=gerador&from=follower-content-pack&format=reel&theme=${encodeURIComponent(theme)}&brief=${encodeURIComponent(prompt)}`);
  }

  if (!tenantId || !token) return null;
  if (loading) return <Card><CardContent className="flex items-center gap-2 py-5 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Montando pacote de conteúdo de hoje…</CardContent></Card>;

  return (
    <Card className="border-violet-500/25">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-violet-600" /><CardTitle className="text-base">Pacote diário pronto para produção</CardTitle></div>
            <p className="mt-1 text-xs text-muted-foreground">Transforma o tema que está funcionando em 3 conteúdos quase prontos, com gancho, roteiro, CTA, legenda e direção visual.</p>
          </div>
          <Badge variant="outline">Tema: {theme}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {packs.map((pack) => (
          <div key={pack.title} className="rounded-lg border p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><p className="font-semibold">{pack.title}</p><p className="mt-1 text-sm">{pack.hook}</p></div>
              <Badge variant="outline">Reel</Badge>
            </div>
            <div className="mt-3 grid gap-2 text-xs md:grid-cols-2">
              <div className="rounded-md bg-muted/40 p-3"><span className="font-semibold">Roteiro</span><p className="mt-1 text-muted-foreground">{pack.script}</p></div>
              <div className="rounded-md bg-muted/40 p-3"><span className="font-semibold">Direção visual</span><p className="mt-1 text-muted-foreground">{pack.visual}</p></div>
              <div className="rounded-md bg-muted/40 p-3"><span className="font-semibold">CTA</span><p className="mt-1 text-muted-foreground">{pack.cta}</p></div>
              <div className="rounded-md bg-muted/40 p-3"><span className="font-semibold">Legenda</span><p className="mt-1 text-muted-foreground">{pack.caption}</p></div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => openGenerator(pack)}><Video className="mr-1.5 h-4 w-4" />Abrir no gerador</Button>
              <Button size="sm" variant="outline" onClick={() => void copyPack(pack)}><Copy className="mr-1.5 h-4 w-4" />Copiar pacote</Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
