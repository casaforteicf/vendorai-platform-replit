import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles, Loader2, TrendingUp, Target, Lightbulb, ListChecks,
  BarChart3, Search, RefreshCw, CalendarDays, Wand2, ExternalLink,
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

interface CalendarItem {
  id: string;
  dataAgendada: string;
  pilar: string;
  temaSugerido: string;
  tipo: "feed" | "stories" | "reels";
  status: "planejado" | "gerado" | "publicado" | "pulado";
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
  const [, navigate] = useLocation();
  const tenantId = user?.tenantId ?? "";

  const [plan, setPlan] = useState<MediaPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [gerando, setGerando] = useState(false);
  const [calendario, setCalendario] = useState<CalendarItem[]>([]);
  const [gerandoCalendario, setGerandoCalendario] = useState(false);
  const [gerandoConteudoId, setGerandoConteudoId] = useState<string | null>(null);

  async function carregar() {
    setLoading(true);
    try {
      const r = await fetch(`/api/tenants/${tenantId}/media-plan`, { headers: authHeaders() });
      const data = await r.json();
      setPlan(data);
      if (data?.id) {
        const rCal = await fetch(`/api/tenants/${tenantId}/content-calendar`, { headers: authHeaders() });
        setCalendario(await rCal.json());
      }
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
      setCalendario([]);
      toast({ title: "Plano de mídia gerado!" });
    } catch (err) {
      toast({ title: "Não foi possível gerar o plano", description: String(err instanceof Error ? err.message : err), variant: "destructive" });
    } finally {
      setGerando(false);
    }
  }

  async function gerarCalendario() {
    if (!plan) return;
    setGerandoCalendario(true);
    try {
      const r = await fetch(`/api/tenants/${tenantId}/content-calendar/gerar`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ mediaPlanId: plan.id, semanas: 2 }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error ?? "Falha ao gerar o calendário");
      setCalendario(data);
      toast({ title: `${data.length} posts planejados pras próximas 2 semanas!` });
    } catch (err) {
      toast({ title: "Não foi possível gerar o calendário", description: String(err instanceof Error ? err.message : err), variant: "destructive" });
    } finally {
      setGerandoCalendario(false);
    }
  }

  // Gera legenda + criativo pra esse post específico -- reaproveita
  // /content/generate, que já usa o perfil da marca automaticamente
  // (business_profiles), sem precisar duplicar essa lógica aqui.
  async function gerarConteudoItem(item: CalendarItem) {
    setGerandoConteudoId(item.id);
    try {
      const r = await fetch(`/api/tenants/${tenantId}/content/generate`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ type: item.tipo, theme: item.temaSugerido }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error ?? "Falha ao gerar conteúdo");
      await fetch(`/api/content-calendar/${item.id}`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ status: "gerado", contentGenerationId: data.id }),
      });
      setCalendario((atual) => atual.map((c) => (c.id === item.id ? { ...c, status: "gerado" } : c)));
      toast({ title: "Conteúdo gerado!", description: "Revise e publique na Central de Conteúdo." });
    } catch (err) {
      toast({ title: "Erro ao gerar conteúdo", description: String(err instanceof Error ? err.message : err), variant: "destructive" });
    } finally {
      setGerandoConteudoId(null);
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

          {/* Calendário de conteúdo -- transforma o plano em posts concretos,
              agendados, prontos pra gerar legenda+criativo e publicar. */}
          <div className="pt-2 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm font-medium flex items-center gap-2"><CalendarDays className="h-4 w-4 text-primary" />Calendário de conteúdo</p>
              <Button type="button" size="sm" variant="outline" onClick={gerarCalendario} disabled={gerandoCalendario}>
                {gerandoCalendario ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                {calendario.length > 0 ? "Gerar novo calendário (2 semanas)" : "Gerar calendário (2 semanas)"}
              </Button>
            </div>

            {calendario.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum post planejado ainda — gere o calendário pra transformar os pilares acima em posts concretos com data.</p>
            ) : (
              <div className="space-y-2">
                {calendario.map((item) => (
                  <Card key={item.id}>
                    <CardContent className="py-3 flex items-center gap-3">
                      <div className="text-center shrink-0 w-12">
                        <p className="text-[10px] text-muted-foreground uppercase">
                          {new Date(item.dataAgendada + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short" })}
                        </p>
                        <p className="text-sm font-semibold">
                          {new Date(item.dataAgendada + "T12:00:00").getDate()}
                        </p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge variant="outline" className="text-[10px]">{item.pilar}</Badge>
                          <span className="text-[10px] text-muted-foreground uppercase">{item.tipo}</span>
                        </div>
                        <p className="text-sm mt-0.5 truncate">{item.temaSugerido}</p>
                      </div>
                      {item.status === "planejado" ? (
                        <Button type="button" size="sm" variant="outline" className="shrink-0" disabled={gerandoConteudoId === item.id} onClick={() => gerarConteudoItem(item)}>
                          {gerandoConteudoId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5 mr-1.5" />}
                          {gerandoConteudoId === item.id ? "" : "Gerar"}
                        </Button>
                      ) : (
                        <Button type="button" size="sm" variant="ghost" className="shrink-0 text-primary" onClick={() => navigate("/content")}>
                          <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                          Revisar
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
