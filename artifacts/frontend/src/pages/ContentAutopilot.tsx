import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { SiteGeneratorTab } from "./SiteGenerator";
import ContentAutopilotCore from "./ContentAutopilotCore";
import ConfiguracoesLegacy from "./ConfiguracoesLegacy";
import SiteDomainAssistant from "@/components/SiteDomainAssistant";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  BarChart3,
  Bot,
  CheckCircle2,
  FileText,
  Globe,
  Lightbulb,
  Loader2,
  Search,
  Settings2,
  Sparkles,
  Target,
  Wand2,
} from "lucide-react";

type HubView = "overview" | "generator" | "autopilot" | "seo" | "analytics" | "settings";

type SiteSummary = {
  id: string;
  name: string;
  siteType: string;
  updatedAt: string;
};

type AutopilotConfigResponse = {
  config: {
    ativo?: boolean;
    siteUrl?: string | null;
  } | null;
};

type KeywordsResponse = { keywords?: Array<{ id: string; status: string }> };
type ArticlesResponse = { articles?: Array<{ id: string; status: string; seoScore?: number | null }> };
type BlogPostsResponse = { posts?: Array<{ id: string; publicado: boolean }> };

type SiteAnalytics = {
  summary: {
    interactions: number;
    sessions: number;
    pageViews: number;
    ctaClicks: number;
    formSubmits: number;
    attributedLeads: number;
    opportunities: number;
    wonDeals: number;
    pipelineValue: number;
    revenue: number;
    attributionCampaigns: number;
  };
  byPage: Array<{
    page: string;
    events: number;
    pageViews: number;
    ctaClicks: number;
    formSubmits: number;
    sessions: number;
  }>;
  attributionNote: string;
};

const VIEWS: HubView[] = ["overview", "generator", "autopilot", "seo", "analytics", "settings"];

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("vendorai_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function initialView(): HubView {
  const params = new URLSearchParams(window.location.search);
  const requested = params.get("view") as HubView | null;
  return requested && VIEWS.includes(requested) ? requested : "overview";
}

function updateLocation(view: HubView) {
  const url = new URL(window.location.href);
  url.searchParams.set("view", view);
  if (view === "settings") url.searchParams.set("tab", "site");
  else url.searchParams.delete("tab");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

function MetricCard({ label, value, helper }: { label: string; value: string | number; helper: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-2 text-3xl font-bold tracking-tight">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
      </CardContent>
    </Card>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value || 0);
}

function SiteSettingsBridge({ tenantId }: { tenantId: string }) {
  const [ready, setReady] = useState(false);
  const bridgeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("tab") !== "site") {
      url.searchParams.set("tab", "site");
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || !bridgeRef.current) return;
    const root = bridgeRef.current;

    function addFieldHelp(
      labelText: string,
      key: string,
      instruction: string,
      href: string,
      linkText: string,
    ) {
      const label = Array.from(root.querySelectorAll("label")).find(
        (item) => item.textContent?.trim() === labelText,
      );
      const container = label?.parentElement;
      if (!container || container.querySelector(`[data-vendor-inline-help="${key}"]`)) return;

      const legacyHelper = Array.from(container.querySelectorAll("p")).find((item) =>
        item.className.includes("text-xs") && item.className.includes("text-muted-foreground"),
      ) as HTMLElement | undefined;
      if (legacyHelper) legacyHelper.style.display = "none";

      const help = document.createElement("div");
      help.dataset.vendorInlineHelp = key;
      help.className = "space-y-1 pt-0.5 text-xs text-muted-foreground";

      const text = document.createElement("p");
      text.textContent = instruction;
      help.appendChild(text);

      const link = document.createElement("a");
      link.href = href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.className = "inline-flex items-center gap-1 font-medium text-primary hover:underline";
      link.textContent = `${linkText} ↗`;
      help.appendChild(link);

      container.appendChild(help);
    }

    function addDnsHelp() {
      const dnsBlocks = Array.from(root.querySelectorAll("div.text-xs.text-muted-foreground")).filter((item) =>
        item.textContent?.includes("Crie um registro CNAME em seu DNS:"),
      );
      for (const block of dnsBlocks) {
        if (block.querySelector('[data-vendor-inline-help="cloudflare-dns"]')) continue;
        const help = document.createElement("div");
        help.dataset.vendorInlineHelp = "cloudflare-dns";
        help.className = "mt-1 space-y-1 text-xs text-muted-foreground";

        const text = document.createElement("p");
        text.textContent = "No Cloudflare, selecione este domínio → DNS → Registros e crie um CNAME usando exatamente o nome e o destino mostrados acima.";
        help.appendChild(text);

        const link = document.createElement("a");
        link.href = "https://dash.cloudflare.com/?to=/:account/:zone/dns/records";
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.className = "inline-flex items-center gap-1 font-medium text-primary hover:underline";
        link.textContent = "Abrir Registros DNS no Cloudflare ↗";
        help.appendChild(link);
        block.appendChild(help);
      }
    }

    function applyInlineHelp() {
      addFieldHelp(
        "ID de conversão do Google Ads",
        "google-ads-conversion",
        "No Google Ads, abra Metas → Conversões → Resumo. Selecione uma conversão do site e, em Configuração da tag, copie o ID que começa com AW-.",
        "https://ads.google.com/aw/conversions",
        "Abrir Conversões no Google Ads",
      );
      addFieldHelp(
        "ID do Meta Pixel",
        "meta-pixel",
        "Na Meta, selecione a empresa correta → Origens de dados e escolha o Pixel/Conjunto de dados do site. Copie o ID numérico exibido nos detalhes.",
        "https://www.facebook.com/events_manager2/overview",
        "Abrir Gerenciador de Eventos da Meta",
      );
      addDnsHelp();
    }

    applyInlineHelp();
    const observer = new MutationObserver(applyInlineHelp);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [ready]);

  if (!ready) return null;

  return (
    <div className="space-y-5">
      <SiteDomainAssistant tenantId={tenantId} />
      <div ref={bridgeRef} className="vendor-site-settings-bridge">
        <style>{`
          .vendor-site-settings-bridge > div > div:first-child { display: none; }
          .vendor-site-settings-bridge [role="tablist"] { display: none !important; }
          .vendor-site-settings-bridge [role="tabpanel"] > div:first-child { display: none; }
        `}</style>
        <ConfiguracoesLegacy />
      </div>
    </div>
  );
}

function Overview({ tenantId, onNavigate }: { tenantId: string; onNavigate: (view: HubView) => void }) {
  const sitesQuery = useQuery<SiteSummary[]>({
    queryKey: ["marketing-sites-hub", tenantId],
    queryFn: async () => {
      const response = await fetch(`/api/tenants/${tenantId}/site-generator`, { headers: authHeaders() });
      if (!response.ok) return [];
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!tenantId,
  });

  const configQuery = useQuery<AutopilotConfigResponse>({
    queryKey: ["marketing-sites-autopilot-config", tenantId],
    queryFn: async () => {
      const response = await fetch(`/api/tenants/${tenantId}/content-autopilot/config`, { headers: authHeaders() });
      if (!response.ok) return { config: null };
      return response.json();
    },
    enabled: !!tenantId,
  });

  const keywordsQuery = useQuery<KeywordsResponse>({
    queryKey: ["marketing-sites-autopilot-keywords", tenantId],
    queryFn: async () => {
      const response = await fetch(`/api/tenants/${tenantId}/content-autopilot/keywords`, { headers: authHeaders() });
      if (!response.ok) return { keywords: [] };
      return response.json();
    },
    enabled: !!tenantId,
  });

  const articlesQuery = useQuery<ArticlesResponse>({
    queryKey: ["marketing-sites-autopilot-articles", tenantId],
    queryFn: async () => {
      const response = await fetch(`/api/tenants/${tenantId}/content-autopilot/articles`, { headers: authHeaders() });
      if (!response.ok) return { articles: [] };
      return response.json();
    },
    enabled: !!tenantId,
  });

  const postsQuery = useQuery<BlogPostsResponse>({
    queryKey: ["marketing-sites-autopilot-posts", tenantId],
    queryFn: async () => {
      const response = await fetch(`/api/tenants/${tenantId}/content-autopilot/site-blog-posts`, { headers: authHeaders() });
      if (!response.ok) return { posts: [] };
      return response.json();
    },
    enabled: !!tenantId,
  });

  const analyticsQuery = useQuery<SiteAnalytics>({
    queryKey: ["marketing-sites-analytics-summary", tenantId],
    queryFn: async () => {
      const response = await fetch(`/api/tenants/${tenantId}/site-generator/analytics`, { headers: authHeaders() });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Não foi possível carregar analytics");
      return body;
    },
    enabled: !!tenantId,
  });

  const sites = sitesQuery.data ?? [];
  const keywords = keywordsQuery.data?.keywords ?? [];
  const articles = articlesQuery.data?.articles ?? [];
  const posts = postsQuery.data?.posts ?? [];
  const publishedPosts = posts.filter((post) => post.publicado).length;
  const approvedKeywords = keywords.filter((keyword) => ["aprovada", "em_uso"].includes(keyword.status)).length;
  const autopilotActive = Boolean(configQuery.data?.config?.ativo);

  const averageSeo = useMemo(() => {
    const scores = articles.map((article) => article.seoScore).filter((score): score is number => typeof score === "number");
    if (scores.length === 0) return "—";
    return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
  }, [articles]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Sites e LPs" value={sites.length} helper="Projetos existentes neste tenant" />
        <MetricCard label="Conteúdos" value={articles.length} helper={`${publishedPosts} post${publishedPosts === 1 ? "" : "s"} publicado${publishedPosts === 1 ? "" : "s"}`} />
        <MetricCard label="Keywords aprovadas" value={approvedKeywords} helper={`${keywords.length} oportunidade${keywords.length === 1 ? "" : "s"} mapeada${keywords.length === 1 ? "" : "s"}`} />
        <MetricCard label="SEO médio" value={averageSeo} helper="Média dos artigos com score disponível" />
      </div>

      {analyticsQuery.data && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Sessões do site" value={analyticsQuery.data.summary.sessions} helper={`${analyticsQuery.data.summary.pageViews} page views registradas`} />
          <MetricCard label="Leads atribuídos" value={analyticsQuery.data.summary.attributedLeads} helper="Atribuição por campanha/UTM registrada" />
          <MetricCard label="Oportunidades" value={analyticsQuery.data.summary.opportunities} helper={formatMoney(analyticsQuery.data.summary.pipelineValue)} />
          <MetricCard label="Receita ganha" value={formatMoney(analyticsQuery.data.summary.revenue)} helper={`${analyticsQuery.data.summary.wonDeals} negócio${analyticsQuery.data.summary.wonDeals === 1 ? " ganho" : "s ganhos"}`} />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              Ciclo de crescimento do site
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["1", "Gerar", "Negócio + catálogo + público + estratégia"],
                ["2", "Publicar", "Site, LP, produto, serviço ou e-commerce"],
                ["3", "Aprender", "SEO, CRM, comportamento, campanhas e vendas"],
                ["4", "Melhorar", "Autopilot cria e otimiza novas oportunidades"],
              ].map(([number, title, description]) => (
                <div key={number} className="rounded-xl border bg-muted/20 p-4">
                  <Badge variant="secondary" className="mb-3">{number}</Badge>
                  <p className="text-sm font-semibold">{title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
              <p className="text-sm font-semibold">Content Autopilot conectado ao site</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Blog, SEO, produtos, categorias, serviços, landing pages, FAQ, cases, depoimentos,
                campanhas, SEO local, datas comerciais, CRM e novos produtos fazem parte da mesma estratégia.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2 text-base">
              <span className="flex items-center gap-2"><Bot className="h-4 w-4" /> Autopilot do Site</span>
              <Badge variant={autopilotActive ? "default" : "secondary"}>{autopilotActive ? "Ativo" : "Pausado"}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              O Autopilot usa contexto do negócio, dúvidas do CRM e desempenho real para manter o ativo digital relevante.
            </p>
            <Button className="w-full justify-between" onClick={() => onNavigate("autopilot")}>
              Abrir Content Autopilot <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="cursor-pointer transition-colors hover:border-primary/40" onClick={() => onNavigate("generator")}>
          <CardContent className="p-5">
            <Wand2 className="h-5 w-5 text-primary" />
            <p className="mt-3 font-semibold">Criar, remodelar e versionar</p>
            <p className="mt-1 text-sm text-muted-foreground">Gerador com remodelação estrutural, proteção de seções e novas versões.</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer transition-colors hover:border-primary/40" onClick={() => onNavigate("seo")}>
          <CardContent className="p-5">
            <Search className="h-5 w-5 text-primary" />
            <p className="mt-3 font-semibold">SEO e conteúdo</p>
            <p className="mt-1 text-sm text-muted-foreground">Keywords, artigos, dúvidas do CRM e kit multicanal com IA.</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer transition-colors hover:border-primary/40" onClick={() => onNavigate("analytics")}>
          <CardContent className="p-5">
            <BarChart3 className="h-5 w-5 text-primary" />
            <p className="mt-3 font-semibold">Resultado comercial</p>
            <p className="mt-1 text-sm text-muted-foreground">Sessão → interação → lead atribuído → oportunidade → venda e receita.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SeoOverview({ onNavigate }: { onNavigate: (view: HubView) => void }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Search className="h-4 w-4" /> SEO e otimização contínua</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>O score SEO do Gerador, pesquisa de palavras-chave, dúvidas reais do CRM, otimização dos artigos e publicação no blog fazem parte do mesmo ativo digital.</p>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border p-4"><CheckCircle2 className="mb-2 h-4 w-4 text-green-600" /><strong className="text-foreground">SEO do site</strong><p className="mt-1 text-xs">Título, meta description, cabeçalhos, legibilidade e imagens.</p></div>
            <div className="rounded-lg border p-4"><Target className="mb-2 h-4 w-4 text-primary" /><strong className="text-foreground">Oportunidades</strong><p className="mt-1 text-xs">Keywords e dúvidas recorrentes alimentam o plano editorial.</p></div>
            <div className="rounded-lg border p-4"><FileText className="mb-2 h-4 w-4 text-primary" /><strong className="text-foreground">Distribuição</strong><p className="mt-1 text-xs">Uma fonte pode virar site, LP, social, vídeo, e-mail, WhatsApp e anúncios.</p></div>
          </div>
          <Button onClick={() => onNavigate("autopilot")}><Sparkles className="mr-2 h-4 w-4" />Gerenciar no Autopilot</Button>
        </CardContent>
      </Card>
    </div>
  );
}

function AnalyticsOverview({ tenantId, onNavigate }: { tenantId: string; onNavigate: (view: HubView) => void }) {
  const analyticsQuery = useQuery<SiteAnalytics>({
    queryKey: ["marketing-sites-analytics", tenantId],
    queryFn: async () => {
      const response = await fetch(`/api/tenants/${tenantId}/site-generator/analytics`, { headers: authHeaders() });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Não foi possível carregar analytics");
      return body;
    },
    enabled: !!tenantId,
  });

  const data = analyticsQuery.data;

  return (
    <div className="space-y-4">
      {analyticsQuery.isLoading && (
        <Card><CardContent className="flex items-center gap-2 p-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Consolidando comportamento e atribuição comercial...</CardContent></Card>
      )}

      {analyticsQuery.isError && (
        <Card><CardContent className="p-6 text-sm text-destructive">Não foi possível carregar os indicadores do site.</CardContent></Card>
      )}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Sessões" value={data.summary.sessions} helper={`${data.summary.pageViews} visualizações de página`} />
            <MetricCard label="Ações de conversão" value={data.summary.ctaClicks + data.summary.formSubmits} helper={`${data.summary.ctaClicks} CTAs · ${data.summary.formSubmits} formulários`} />
            <MetricCard label="Leads atribuídos" value={data.summary.attributedLeads} helper={`${data.summary.attributionCampaigns} campanhas com sinal registrado`} />
            <MetricCard label="Oportunidades" value={data.summary.opportunities} helper={formatMoney(data.summary.pipelineValue)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <MetricCard label="Negócios ganhos" value={data.summary.wonDeals} helper="Deals em etapa ganho com atribuição compatível" />
            <MetricCard label="Receita atribuída" value={formatMoney(data.summary.revenue)} helper="Somente negócios ganhos vinculados a leads atribuídos" />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><BarChart3 className="h-4 w-4" /> Desempenho por página / ativo</CardTitle>
            </CardHeader>
            <CardContent>
              {data.byPage.length === 0 ? (
                <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">Ainda não há eventos de Site Intelligence registrados. Novas visitas a sites publicados começarão a alimentar este painel.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-xs">
                    <thead className="border-b text-muted-foreground">
                      <tr>
                        <th className="py-2 pr-4 font-medium">Página</th>
                        <th className="py-2 pr-4 font-medium">Sessões</th>
                        <th className="py-2 pr-4 font-medium">Views</th>
                        <th className="py-2 pr-4 font-medium">CTAs</th>
                        <th className="py-2 pr-4 font-medium">Formulários</th>
                        <th className="py-2 font-medium">Interações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byPage.map((page) => (
                        <tr key={page.page} className="border-b last:border-0">
                          <td className="max-w-64 truncate py-3 pr-4 font-medium">{page.page}</td>
                          <td className="py-3 pr-4">{page.sessions}</td>
                          <td className="py-3 pr-4">{page.pageViews}</td>
                          <td className="py-3 pr-4">{page.ctaClicks}</td>
                          <td className="py-3 pr-4">{page.formSubmits}</td>
                          <td className="py-3">{page.events}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-4">
              <p className="text-sm font-semibold">Regra de atribuição</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{data.attributionNote}</p>
            </CardContent>
          </Card>
        </>
      )}

      <Button variant="outline" onClick={() => onNavigate("settings")}><Settings2 className="mr-2 h-4 w-4" />Configurar Pixel, Google Ads e Search Console</Button>
    </div>
  );
}

export default function MarketingSitesHub() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const [view, setView] = useState<HubView>(initialView);

  function navigate(next: HubView) {
    setView(next);
    updateLocation(next);
  }

  useEffect(() => {
    updateLocation(view);
  }, []);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary"><Sparkles className="h-4 w-4" /> Marketing</div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><Globe className="h-6 w-6" /> Sites & Content Autopilot</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Crie, remodele, proteja, publique e mantenha sites e landing pages conectados ao CRM, conteúdo, SEO, campanhas e resultados comerciais do VendorAI.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => navigate("autopilot")}><Bot className="mr-2 h-4 w-4" />Content Autopilot</Button>
          <Button onClick={() => navigate("generator")}><Wand2 className="mr-2 h-4 w-4" />Criar site ou LP</Button>
        </div>
      </div>

      <Tabs value={view} onValueChange={(value) => navigate(value as HubView)}>
        <div className="overflow-x-auto pb-1">
          <TabsList className="w-max min-w-full justify-start">
            <TabsTrigger value="overview">Visão Geral</TabsTrigger>
            <TabsTrigger value="generator">Gerador de Sites</TabsTrigger>
            <TabsTrigger value="autopilot">Content Autopilot</TabsTrigger>
            <TabsTrigger value="seo">SEO & Otimização</TabsTrigger>
            <TabsTrigger value="analytics">Analytics & Conversões</TabsTrigger>
            <TabsTrigger value="settings">Configurações do Site</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="mt-5"><Overview tenantId={tenantId} onNavigate={navigate} /></TabsContent>
        <TabsContent value="generator" className="mt-5"><SiteGeneratorTab /></TabsContent>
        <TabsContent value="autopilot" className="mt-5"><ContentAutopilotCore /></TabsContent>
        <TabsContent value="seo" className="mt-5"><SeoOverview onNavigate={navigate} /></TabsContent>
        <TabsContent value="analytics" className="mt-5"><AnalyticsOverview tenantId={tenantId} onNavigate={navigate} /></TabsContent>
        <TabsContent value="settings" className="mt-5"><SiteSettingsBridge tenantId={tenantId} /></TabsContent>
      </Tabs>

      <Card className="border-dashed">
        <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Lightbulb className="mt-0.5 h-4 w-4 text-amber-500" />
            <div>
              <p className="text-sm font-medium">Princípio do módulo</p>
              <p className="text-xs text-muted-foreground">Gerador cria e governa o ativo. Content Autopilot mantém, distribui e melhora o ativo com base em CRM, SEO, comportamento e resultado comercial reais.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
