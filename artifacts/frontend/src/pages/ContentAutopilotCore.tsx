import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import ContentAutopilotLegacyUI from "./ContentAutopilotLegacyUI";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Bot,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  FileText,
  Lightbulb,
  Loader2,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Wand2,
} from "lucide-react";

type AutopilotMode = "suggestion" | "semi" | "automatic";

type SitePlan = {
  generatedAt: string;
  summary: {
    sites: number;
    publishedSites: number;
    keywords: number;
    discoveredKeywords: number;
    approvedKeywords: number;
    articles: number;
    publishedArticles: number;
    reviewArticles: number;
    lowSeoArticles: number;
    autopilotActive: boolean;
    siteConnected: boolean;
  };
  opportunities: Array<{
    id: string;
    priority: "alta" | "media" | "baixa";
    area: "site" | "seo" | "conteudo" | "autopilot";
    title: string;
    description: string;
    action: string;
  }>;
  weeks: Array<{ week: number; focus: string; action: string }>;
};

function authHeaders() {
  const token = localStorage.getItem("vendorai_token");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

const MODE_COPY: Record<AutopilotMode, { title: string; description: string }> = {
  suggestion: {
    title: "Sugestão",
    description: "A IA identifica oportunidades e propõe alterações. Nada é produzido ou publicado automaticamente.",
  },
  semi: {
    title: "Semiautomático",
    description: "A IA prepara conteúdos e melhorias para revisão. A publicação continua dependendo de aprovação.",
  },
  automatic: {
    title: "Automático",
    description: "O job contínuo do Autopilot fica ativo para produzir a partir de oportunidades aprovadas.",
  },
};

function priorityVariant(priority: "alta" | "media" | "baixa") {
  if (priority === "alta") return "destructive" as const;
  if (priority === "media") return "secondary" as const;
  return "outline" as const;
}

export default function ContentAutopilotCore() {
  const { user } = useAuth();
  const tenantId = (user as any)?.tenantId ?? "";
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const storageKey = `vendorai_site_autopilot_mode:${tenantId}`;
  const [mode, setMode] = useState<AutopilotMode>(() => {
    const saved = localStorage.getItem(storageKey) as AutopilotMode | null;
    return saved && ["suggestion", "semi", "automatic"].includes(saved) ? saved : "suggestion";
  });
  const [savingMode, setSavingMode] = useState(false);

  const { data: plan, isLoading, refetch } = useQuery<SitePlan>({
    queryKey: ["content-autopilot-site-plan", tenantId],
    queryFn: async () => {
      const response = await fetch(`/api/tenants/${tenantId}/content-autopilot/site-plan`, { headers: authHeaders() });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Não foi possível montar o plano do site");
      return body;
    },
    enabled: !!tenantId,
  });

  useEffect(() => {
    if (!plan) return;
    const saved = localStorage.getItem(storageKey);
    if (!saved && plan.summary.autopilotActive) setMode("automatic");
  }, [plan, storageKey]);

  async function changeMode(next: AutopilotMode) {
    if (!tenantId) return;
    setSavingMode(true);
    try {
      // O backend existente já possui o controle operacional `ativo`.
      // Sugestão e Semiautomático mantêm o job recorrente pausado; Automático o ativa.
      const response = await fetch(`/api/tenants/${tenantId}/content-autopilot/config`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ ativo: next === "automatic" }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Não foi possível alterar o modo");
      setMode(next);
      localStorage.setItem(storageKey, next);
      queryClient.invalidateQueries({ queryKey: ["content-autopilot-config", tenantId] });
      queryClient.invalidateQueries({ queryKey: ["content-autopilot-site-plan", tenantId] });
      toast({ title: `Modo ${MODE_COPY[next].title} ativado` });
    } catch (error: any) {
      toast({ title: "Erro ao alterar modo", description: error.message, variant: "destructive" });
    } finally {
      setSavingMode(false);
    }
  }

  function openProduction() {
    document.getElementById("content-autopilot-production")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="space-y-6">
      <Card className="border-primary/20">
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg"><Bot className="h-5 w-5 text-primary" /> Autopilot do Site</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">Motor editorial e de crescimento conectado ao Gerador de Sites, SEO e conteúdo real do tenant.</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={plan?.summary.autopilotActive ? "default" : "secondary"}>{plan?.summary.autopilotActive ? "Ativo" : "Job pausado"}</Badge>
              <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isLoading}>
                {isLoading ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-2 h-3.5 w-3.5" />}Atualizar diagnóstico
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nível de automação</p>
            <div className="grid gap-3 md:grid-cols-3">
              {(Object.keys(MODE_COPY) as AutopilotMode[]).map((item) => {
                const active = mode === item;
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => changeMode(item)}
                    disabled={savingMode}
                    className={`rounded-xl border p-4 text-left transition-all ${active ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "hover:border-primary/40"}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold">{MODE_COPY[item].title}</span>
                      {active && <CheckCircle2 className="h-4 w-4 text-primary" />}
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{MODE_COPY[item].description}</p>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" /> Conteúdo bloqueado ou aprovado continua protegido; ativar o job não autoriza reescrever elementos travados do site.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><CalendarDays className="h-4 w-4" /> Plano de Conteúdo do Site</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {isLoading && (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Analisando sites, keywords e conteúdos reais...</div>
          )}

          {plan && (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Sites / LPs</p><p className="mt-1 text-xl font-bold">{plan.summary.sites}</p><p className="text-[11px] text-muted-foreground">{plan.summary.publishedSites} publicados</p></div>
                <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Keywords</p><p className="mt-1 text-xl font-bold">{plan.summary.keywords}</p><p className="text-[11px] text-muted-foreground">{plan.summary.approvedKeywords} aprovadas</p></div>
                <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Artigos</p><p className="mt-1 text-xl font-bold">{plan.summary.articles}</p><p className="text-[11px] text-muted-foreground">{plan.summary.publishedArticles} publicados</p></div>
                <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Aguardando revisão</p><p className="mt-1 text-xl font-bold">{plan.summary.reviewArticles}</p><p className="text-[11px] text-muted-foreground">conteúdos reais</p></div>
                <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">SEO abaixo de 70</p><p className="mt-1 text-xl font-bold">{plan.summary.lowSeoArticles}</p><p className="text-[11px] text-muted-foreground">itens a otimizar</p></div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-3">
                  <div className="flex items-center justify-between"><p className="text-sm font-semibold">Oportunidades encontradas</p><Badge variant="secondary">{plan.opportunities.length}</Badge></div>
                  {plan.opportunities.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nenhuma pendência estrutural detectada com os dados atuais. Continue acompanhando desempenho e novas demandas.</div>
                  ) : (
                    plan.opportunities.map((opportunity) => (
                      <div key={opportunity.id} className="rounded-lg border p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2"><Badge variant={priorityVariant(opportunity.priority)} className="text-[10px]">{opportunity.priority}</Badge><span className="text-[10px] uppercase text-muted-foreground">{opportunity.area}</span></div>
                            <p className="mt-2 text-sm font-semibold">{opportunity.title}</p>
                            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{opportunity.description}</p>
                          </div>
                          <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                        </div>
                        <button type="button" onClick={openProduction} className="mt-3 text-xs font-medium text-primary hover:underline">{opportunity.action}</button>
                      </div>
                    ))
                  )}
                </div>

                <div className="space-y-3">
                  <p className="text-sm font-semibold">Plano sugerido — próximos 30 dias</p>
                  {plan.weeks.map((week) => (
                    <div key={week.week} className="flex gap-3 rounded-lg border p-4">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">S{week.week}</div>
                      <div><p className="text-sm font-semibold">{week.focus}</p><p className="mt-1 text-xs text-muted-foreground">{week.action}</p></div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                <div className="flex items-start gap-3">
                  <Lightbulb className="mt-0.5 h-4 w-4 text-primary" />
                  <div>
                    <p className="text-sm font-semibold">Ciclo integrado</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">CRM e dúvidas recorrentes devem alimentar oportunidades → conteúdo → site/LP → SEO → leads → oportunidades → vendas → AI Marketing Manager → próximo conteúdo. Esta tela começa pela parte que já possui dados reais: sites, keywords e artigos.</p>
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div id="content-autopilot-production" className="scroll-mt-4 space-y-3">
        <div className="flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-primary" />
          <div><p className="text-sm font-semibold">Produção, SEO e publicação</p><p className="text-xs text-muted-foreground">Ferramentas existentes preservadas: configuração, keywords, geração, otimização e posts do blog.</p></div>
        </div>
        <ContentAutopilotLegacyUI />
      </div>

      <Card className="border-dashed">
        <CardContent className="grid gap-3 p-4 md:grid-cols-3">
          <div className="flex gap-2"><Search className="mt-0.5 h-4 w-4 text-primary" /><div><p className="text-xs font-semibold">SEO</p><p className="text-[11px] text-muted-foreground">Palavras-chave e otimização orientam novas páginas e artigos.</p></div></div>
          <div className="flex gap-2"><FileText className="mt-0.5 h-4 w-4 text-primary" /><div><p className="text-xs font-semibold">Conteúdo</p><p className="text-[11px] text-muted-foreground">Artigos publicados entram no blog nativo do site gerado.</p></div></div>
          <div className="flex gap-2"><Target className="mt-0.5 h-4 w-4 text-primary" /><div><p className="text-xs font-semibold">Conversão</p><p className="text-[11px] text-muted-foreground">O próximo estágio conecta conteúdo a origem, lead, oportunidade e venda.</p></div></div>
        </CardContent>
      </Card>
    </div>
  );
}
