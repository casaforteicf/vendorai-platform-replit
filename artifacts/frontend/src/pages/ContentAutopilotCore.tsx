import { useEffect, useMemo, useState } from "react";
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
  MessageSquareText,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Wand2,
} from "lucide-react";

type AutopilotMode = "suggestion" | "semi" | "automatic";
type SourceType = "site" | "article" | "product";

type ConfigResponse = {
  config: {
    ativo?: boolean;
    automationMode?: AutopilotMode;
  } | null;
};

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

type ContentSignal = {
  id: string;
  question: string;
  occurrences: number;
  channels: string[];
  lastSeen: string;
  recommendations: string[];
};

type SignalsResponse = {
  analyzedIncomingMessages: number;
  signals: ContentSignal[];
};

type SimpleSource = { id: string; label: string };
type RepurposeOutput = { channel: string; title?: string; content: string };

const REPURPOSE_CHANNELS = [
  ["article", "Artigo"],
  ["instagram", "Instagram"],
  ["facebook", "Facebook"],
  ["linkedin", "LinkedIn"],
  ["reels", "Reels"],
  ["video_script", "Roteiro de vídeo"],
  ["email", "E-mail"],
  ["whatsapp", "WhatsApp"],
  ["meta_ad", "Anúncio Meta"],
  ["google_ads", "Google Ads"],
  ["landing_page", "Landing Page"],
] as const;

function authHeaders() {
  const token = localStorage.getItem("vendorai_token");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

const MODE_COPY: Record<AutopilotMode, { title: string; description: string; badge: string }> = {
  suggestion: {
    title: "Sugestão",
    description: "A IA identifica oportunidades e propõe alterações. Nada é produzido ou publicado automaticamente.",
    badge: "Somente recomendações",
  },
  semi: {
    title: "Semiautomático",
    description: "A IA gera e otimiza conteúdos a partir de keywords aprovadas e deixa tudo como rascunho para revisão humana.",
    badge: "Gera rascunhos",
  },
  automatic: {
    title: "Automático",
    description: "A IA gera, otimiza e publica automaticamente no site próprio, somente a partir de keywords previamente aprovadas.",
    badge: "Publicação autorizada",
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
  const [mode, setMode] = useState<AutopilotMode>("suggestion");
  const [savingMode, setSavingMode] = useState(false);
  const [sourceType, setSourceType] = useState<SourceType>("site");
  const [sourceId, setSourceId] = useState("");
  const [selectedChannels, setSelectedChannels] = useState<string[]>(["instagram", "reels", "whatsapp", "meta_ad", "landing_page"]);
  const [generatingKit, setGeneratingKit] = useState(false);
  const [outputs, setOutputs] = useState<RepurposeOutput[]>([]);

  const configQuery = useQuery<ConfigResponse>({
    queryKey: ["content-autopilot-config", tenantId],
    queryFn: async () => {
      const response = await fetch(`/api/tenants/${tenantId}/content-autopilot/config`, { headers: authHeaders() });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Não foi possível carregar a configuração do Autopilot");
      return body;
    },
    enabled: !!tenantId,
  });

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

  const signalsQuery = useQuery<SignalsResponse>({
    queryKey: ["content-autopilot-crm-signals", tenantId],
    queryFn: async () => {
      const response = await fetch(`/api/tenants/${tenantId}/site-generator/content-signals`, { headers: authHeaders() });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Não foi possível ler os sinais do CRM");
      return body;
    },
    enabled: !!tenantId,
  });

  const sitesQuery = useQuery<any[]>({
    queryKey: ["autopilot-repurpose-sites", tenantId],
    queryFn: async () => {
      const response = await fetch(`/api/tenants/${tenantId}/site-generator`, { headers: authHeaders() });
      if (!response.ok) return [];
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!tenantId,
  });

  const articlesQuery = useQuery<{ articles?: any[] }>({
    queryKey: ["autopilot-repurpose-articles", tenantId],
    queryFn: async () => {
      const response = await fetch(`/api/tenants/${tenantId}/content-autopilot/articles`, { headers: authHeaders() });
      if (!response.ok) return { articles: [] };
      return response.json();
    },
    enabled: !!tenantId,
  });

  const productsQuery = useQuery<any[]>({
    queryKey: ["autopilot-repurpose-products", tenantId],
    queryFn: async () => {
      const response = await fetch(`/api/tenants/${tenantId}/produtos-catalogo`, { headers: authHeaders() });
      if (!response.ok) return [];
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!tenantId,
  });

  const sources = useMemo<SimpleSource[]>(() => {
    if (sourceType === "site") return (sitesQuery.data ?? []).map((site) => ({ id: site.id, label: site.name ?? "Site" }));
    if (sourceType === "article") return (articlesQuery.data?.articles ?? []).map((article) => ({ id: article.id, label: article.titulo ?? "Artigo sem título" }));
    return (productsQuery.data ?? []).map((product) => ({ id: product.id, label: product.nome ?? product.name ?? "Produto" }));
  }, [sourceType, sitesQuery.data, articlesQuery.data, productsQuery.data]);

  useEffect(() => {
    const config = configQuery.data?.config;
    if (!config) return;
    setMode(config.automationMode ?? (config.ativo ? "semi" : "suggestion"));
  }, [configQuery.data]);

  useEffect(() => {
    setSourceId((current) => sources.some((source) => source.id === current) ? current : sources[0]?.id ?? "");
  }, [sources]);

  async function changeMode(next: AutopilotMode) {
    if (!tenantId) return;
    setSavingMode(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/content-autopilot/config`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ automationMode: next, ativo: next !== "suggestion" }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Não foi possível alterar o modo");
      setMode(next);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["content-autopilot-config", tenantId] }),
        queryClient.invalidateQueries({ queryKey: ["content-autopilot-site-plan", tenantId] }),
      ]);
      toast({
        title: `Modo ${MODE_COPY[next].title} ativado`,
        description: next === "automatic"
          ? "Somente keywords aprovadas poderão seguir até publicação automática."
          : MODE_COPY[next].description,
      });
    } catch (error: any) {
      toast({ title: "Erro ao alterar modo", description: error.message, variant: "destructive" });
    } finally {
      setSavingMode(false);
    }
  }

  function openProduction() {
    document.getElementById("content-autopilot-production")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function toggleChannel(channel: string) {
    setSelectedChannels((current) => current.includes(channel) ? current.filter((item) => item !== channel) : [...current, channel]);
  }

  async function generateKit() {
    if (!sourceId || selectedChannels.length === 0) {
      toast({ title: "Escolha uma fonte e ao menos um canal", variant: "destructive" });
      return;
    }
    setGeneratingKit(true);
    setOutputs([]);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/site-generator/repurpose`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ sourceType, sourceId, channels: selectedChannels }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Não foi possível gerar o kit");
      setOutputs(Array.isArray(body.outputs) ? body.outputs : []);
      toast({ title: "Kit multicanal gerado", description: `${Array.isArray(body.outputs) ? body.outputs.length : 0} entregas criadas a partir da mesma fonte.` });
    } catch (error: any) {
      toast({ title: "Erro ao gerar kit", description: error.message, variant: "destructive" });
    } finally {
      setGeneratingKit(false);
    }
  }

  const signals = signalsQuery.data?.signals ?? [];
  const jobActive = mode !== "suggestion";

  return (
    <div className="space-y-6">
      <Card className="border-primary/20">
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg"><Bot className="h-5 w-5 text-primary" /> Autopilot do Site</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">Motor editorial e de crescimento conectado ao Gerador de Sites, CRM, SEO, conteúdo e desempenho comercial.</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={jobActive ? "default" : "secondary"}>{jobActive ? MODE_COPY[mode].badge : "Job pausado"}</Badge>
              <Button size="sm" variant="outline" onClick={() => { void refetch(); void signalsQuery.refetch(); void configQuery.refetch(); }} disabled={isLoading}>
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
                    disabled={savingMode || configQuery.isLoading}
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
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" /> Automático não elimina governança: só consome keywords aprovadas, e seções bloqueadas no Gerador continuam protegidas.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><CalendarDays className="h-4 w-4" /> Plano de Conteúdo do Site</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          {isLoading && <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Analisando sites, keywords e conteúdos reais...</div>}
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
                  <div className="flex items-center justify-between"><p className="text-sm font-semibold">Oportunidades encontradas</p><Badge variant="secondary">{plan.opportunities.length + signals.length}</Badge></div>
                  {plan.opportunities.length === 0 && signals.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nenhuma pendência estrutural detectada com os dados atuais. Continue acompanhando desempenho e novas demandas.</div>
                  ) : plan.opportunities.map((opportunity) => (
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
                  ))}
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
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base"><MessageSquareText className="h-4 w-4 text-primary" /> Dúvidas reais do CRM → oportunidades de conteúdo</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">O VendorAI analisa perguntas recebidas de leads reais, excluindo contatos classificados como não-lead.</p>
            </div>
            <Badge variant="secondary">{signalsQuery.data?.analyzedIncomingMessages ?? 0} perguntas analisadas</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {signalsQuery.isLoading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Analisando conversas...</div>
          ) : signals.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Ainda não há uma dúvida recorrente com repetição suficiente para virar recomendação automática.</div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {signals.map((signal) => (
                <div key={signal.id} className="rounded-xl border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div><p className="text-sm font-semibold">“{signal.question}”</p><p className="mt-1 text-xs text-muted-foreground">Detectada {signal.occurrences} vezes · {signal.channels.join(", ")}</p></div>
                    <Badge>{signal.occurrences}x</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">{signal.recommendations.map((item) => <Badge key={item} variant="outline" className="text-[10px]">{item}</Badge>)}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Wand2 className="h-4 w-4 text-primary" /> Criar campanha a partir deste conteúdo</CardTitle>
          <p className="text-xs text-muted-foreground">Escolha um site, artigo ou produto e gere vários materiais preservando a mesma oferta, público, posicionamento e CTA.</p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-[180px_1fr]">
            <div>
              <label className="mb-1.5 block text-xs font-medium">Fonte</label>
              <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={sourceType} onChange={(event) => { setSourceType(event.target.value as SourceType); setOutputs([]); }}>
                <option value="site">Site / Landing Page</option><option value="article">Artigo</option><option value="product">Produto</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium">Conteúdo de origem</label>
              <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={sourceId} onChange={(event) => { setSourceId(event.target.value); setOutputs([]); }}>
                {sources.length === 0 && <option value="">Nenhum item disponível</option>}
                {sources.map((source) => <option key={source.id} value={source.id}>{source.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium">Gerar para</p>
            <div className="flex flex-wrap gap-2">
              {REPURPOSE_CHANNELS.map(([channel, label]) => {
                const active = selectedChannels.includes(channel);
                return <button key={channel} type="button" onClick={() => toggleChannel(channel)} className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${active ? "border-primary bg-primary/10 text-primary" : "hover:border-primary/40"}`}>{active && "✓ "}{label}</button>;
              })}
            </div>
          </div>

          <Button onClick={generateKit} disabled={generatingKit || !sourceId || selectedChannels.length === 0}>
            {generatingKit ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}Gerar kit multicanal
          </Button>

          {outputs.length > 0 && (
            <div className="grid gap-3 lg:grid-cols-2">
              {outputs.map((output, index) => (
                <div key={`${output.channel}-${index}`} className="rounded-xl border p-4">
                  <div className="mb-2 flex items-center justify-between gap-2"><p className="text-sm font-semibold">{output.title || REPURPOSE_CHANNELS.find(([channel]) => channel === output.channel)?.[1] || output.channel}</p><Badge variant="secondary">{output.channel}</Badge></div>
                  <div className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{output.content}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div id="content-autopilot-production" className="scroll-mt-4 space-y-3">
        <div className="flex items-center gap-2"><Wand2 className="h-4 w-4 text-primary" /><div><p className="text-sm font-semibold">Produção, SEO e publicação</p><p className="text-xs text-muted-foreground">Ferramentas existentes preservadas: configuração, keywords, geração, otimização e posts do blog.</p></div></div>
        <ContentAutopilotLegacyUI />
      </div>

      <Card className="border-dashed">
        <CardContent className="grid gap-3 p-4 md:grid-cols-3">
          <div className="flex gap-2"><Search className="mt-0.5 h-4 w-4 text-primary" /><div><p className="text-xs font-semibold">SEO</p><p className="text-[11px] text-muted-foreground">Palavras-chave e otimização orientam novas páginas e artigos.</p></div></div>
          <div className="flex gap-2"><FileText className="mt-0.5 h-4 w-4 text-primary" /><div><p className="text-xs font-semibold">CRM → Conteúdo</p><p className="text-[11px] text-muted-foreground">Perguntas reais viram FAQ, artigos, comparativos, vídeos e campanhas.</p></div></div>
          <div className="flex gap-2"><Target className="mt-0.5 h-4 w-4 text-primary" /><div><p className="text-xs font-semibold">Conversão</p><p className="text-[11px] text-muted-foreground">Comportamento do site e atribuição comercial alimentam o próximo ciclo.</p></div></div>
        </CardContent>
      </Card>

      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
        <div className="flex items-start gap-3"><Lightbulb className="mt-0.5 h-4 w-4 text-primary" /><div><p className="text-sm font-semibold">Ciclo fechado</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">CRM → dúvidas reais → conteúdo → site/LP → SEO e campanhas → comportamento → lead → oportunidade → venda → AI Marketing Manager → próximo conteúdo melhor.</p></div></div>
      </div>
    </div>
  );
}
