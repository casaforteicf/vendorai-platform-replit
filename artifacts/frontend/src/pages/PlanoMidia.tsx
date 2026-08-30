import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles, Loader2, TrendingUp, Target, Lightbulb, ListChecks,
  BarChart3, Search, RefreshCw,
} from "lucide-react";

interface MediaPlanCanal {
  canal: string;
  prioridade: "alta" | "media" | "baixa";
  motivo: string;
  tiposCampanhaSugeridos: string[];
  percentualOrcamento: number;
}

interface MediaPlanConteudo {
  diagnostico: string;
  pontosFortesAtuais: string[];
  oportunidades: string[];
  canais: MediaPlanCanal[];
  pilaresConteudo: string[];
  acoesImediatas: string[];
  concorrentesEncontrados?: Array<{ dominio: string; titulo: string; url: string }>;
  keywordsRelevantes?: Array<{ termo: string; volumeBusca: number | null }>;
}

interface MediaPlan {
  id: string;
  conteudo: MediaPlanConteudo;
  createdAt: string;
}

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` };
}

const PRIORIDADE_STYLE: Record<string, string> = {
  alta: "border-primary/40 text-primary bg-primary/5",
  media: "border-amber-300 text-amber-700 bg-amber-50",
  baixa: "border-muted-foreground/30 text-muted-foreground",
};

export default function PlanoMidia() {
  const { user } = useAuth();
  const { toast } = useToast();
  const tenantId = user?.tenantId ?? "";

  const [plan, setPlan] = useState<MediaPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [gerando, setGerando] = useState(false);

  async function carregar() {
    setLoading(true);
    try {
      const r = await fetch(`/api/tenants/${tenantId}/media-plan`, { headers: authHeaders() });
      const data = await r.json();
      setPlan(data);
    } catch {
      // silencioso -- tela simplesmente mostra o estado "gerar plano"
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (tenantId) void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  async function gerar() {
    setGerando(true);
    try {
      const r = await fetch(`/api/tenants/${tenantId}/media-plan/gerar`, {
        method: "POST",
        headers: authHeaders(),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error ?? "Falha ao gerar o plano");
      setPlan(data);
      toast({ title: "Plano de mídia gerado!" });
    } catch (err) {
      toast({ title: "Não foi possível gerar o plano", description: String(err instanceof Error ? err.message : err), variant: "destructive" });
    } finally {
      setGerando(false);
    }
  }

  const conteudo = plan?.conteudo;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="vendor-page-title flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Plano de Mídia
          </h1>
          <p className="mt-1 text-sm text-muted-foreground max-w-xl">
            A IA cruza o perfil do seu negócio (segmento, público-alvo, concorrentes, Instagram) com dados reais de busca
            do Google pra sugerir onde investir pra crescer online.
          </p>
        </div>
        <Button type="button" onClick={gerar} disabled={gerando}>
          {gerando ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
          {plan ? "Gerar novo plano" : "Gerar plano de mídia"}
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : !conteudo ? (
        <Card>
          <CardContent className="py-14 text-center space-y-3">
            <Sparkles className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Nenhum plano gerado ainda. Toque em "Gerar plano de mídia" — leva cerca de 20 segundos.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {plan?.createdAt && (
            <p className="text-xs text-muted-foreground">
              Gerado em {new Date(plan.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            </p>
          )}

          {/* Diagnóstico */}
          <Card>
            <CardContent className="pt-5 space-y-3">
              <p className="text-sm font-medium flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" />Diagnóstico</p>
              <p className="text-sm text-muted-foreground leading-relaxed">{conteudo.diagnostico}</p>
              {(conteudo.pontosFortesAtuais?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {conteudo.pontosFortesAtuais.map((p, i) => (
                    <Badge key={i} variant="outline" className="text-xs">{p}</Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Oportunidades */}
          {(conteudo.oportunidades?.length ?? 0) > 0 && (
            <Card>
              <CardContent className="pt-5 space-y-2">
                <p className="text-sm font-medium flex items-center gap-2"><Lightbulb className="h-4 w-4 text-primary" />Oportunidades</p>
                <ul className="space-y-1.5">
                  {conteudo.oportunidades.map((o, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex gap-2">
                      <span className="text-primary">·</span>{o}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Canais recomendados */}
          <div className="space-y-3">
            <p className="text-sm font-medium flex items-center gap-2"><Target className="h-4 w-4 text-primary" />Canais recomendados</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {conteudo.canais?.map((c, i) => (
                <Card key={i}>
                  <CardContent className="pt-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">{c.canal}</p>
                      <Badge variant="outline" className={`text-[10px] ${PRIORIDADE_STYLE[c.prioridade] ?? ""}`}>
                        prioridade {c.prioridade}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{c.motivo}</p>
                    <div className="flex items-center justify-between pt-1">
                      <div className="flex flex-wrap gap-1">
                        {c.tiposCampanhaSugeridos?.map((t, ti) => (
                          <span key={ti} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{t}</span>
                        ))}
                      </div>
                      <span className="text-xs font-medium text-primary shrink-0">{c.percentualOrcamento}% do orçamento</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Pilares de conteúdo */}
          {(conteudo.pilaresConteudo?.length ?? 0) > 0 && (
            <Card>
              <CardContent className="pt-5 space-y-2">
                <p className="text-sm font-medium flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" />Pilares de conteúdo</p>
                <div className="flex flex-wrap gap-1.5">
                  {conteudo.pilaresConteudo.map((p, i) => (
                    <Badge key={i} className="text-xs">{p}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Ações imediatas */}
          {(conteudo.acoesImediatas?.length ?? 0) > 0 && (
            <Card className="border-primary/30">
              <CardContent className="pt-5 space-y-2">
                <p className="text-sm font-medium flex items-center gap-2"><ListChecks className="h-4 w-4 text-primary" />Ações pra essa semana</p>
                <ul className="space-y-1.5">
                  {conteudo.acoesImediatas.map((a, i) => (
                    <li key={i} className="text-sm flex gap-2">
                      <span className="text-primary font-medium">{i + 1}.</span>{a}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Concorrência real (quando disponível) */}
          {(conteudo.concorrentesEncontrados?.length ?? 0) > 0 && (
            <Card>
              <CardContent className="pt-5 space-y-2">
                <p className="text-sm font-medium flex items-center gap-2"><Search className="h-4 w-4 text-primary" />Quem aparece hoje no Google pro seu termo principal</p>
                <div className="space-y-1.5">
                  {conteudo.concorrentesEncontrados!.map((c, i) => (
                    <a key={i} href={c.url} target="_blank" rel="noopener noreferrer" className="block text-xs hover:underline">
                      <span className="font-medium">{c.dominio}</span>
                      <span className="text-muted-foreground"> — {c.titulo}</span>
                    </a>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
