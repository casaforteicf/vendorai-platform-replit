import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { SiteGeneratorTab } from "./SiteGenerator";
import ContentAutopilotCore from "./ContentAutopilotCore";
import ConfiguracoesLegacy from "./ConfiguracoesLegacy";
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

const VIEWS: HubView[] = ["overview", "generator", "autopilot", "seo", "analytics", "settings"];

function authHeaders() {
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

function SiteSettingsBridge() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("tab") !== "site") {
      url.searchParams.set("tab", "site");
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    }
    setReady(true);
  }, []);

  if (!ready) return null;

  return (
    <div className="vendor-site-settings-bridge">
      <style>{`
        .vendor-site-settings-bridge > div > div:first-child { display: none; }
        .vendor-site-settings-bridge [role="tablist"] { display: none !important; }
        .vendor-site-settings-bridge [role="tabpanel"] > div:first-child { display: none; }
      `}</style>
      <ConfiguracoesLegacy />
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
                ["3", "Aprender", "SEO, conteúdo, campanhas e sinais comerciais"],
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
                campanhas, SEO local, datas comerciais e novos produtos passam a fazer parte da mesma estratégia.
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
              O Autopilot usa o contexto do negócio e o desempenho do conteúdo para manter o ativo digital relevante.
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
            <p className="mt-3 font-semibold">Criar ou remodelar</p>
            <p className="mt-1 text-sm text-muted-foreground">Gerador de Sites, LPs, páginas de produto, campanhas, catálogo e e-commerce.</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer transition-colors hover:border-primary/40" onClick={() => onNavigate("seo")}>
          <CardContent className="p-5">
            <Search className="h-5 w-5 text-primary" />
            <p className="mt-3 font-semibold">SEO e conteúdo</p>
            <p className="mt-1 text-sm text-muted-foreground">Keywords, artigos, posts, diagnóstico e otimização contínua com IA.</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer transition-colors hover:border-primary/40" onClick={() => onNavigate("settings")}>
          <CardContent className="p-5">
            <Settings2 className="h-5 w-5 text-primary" />
            <p className="mt-3 font-semibold">Publicação e integrações</p>
            <p className="mt-1 text-sm text-muted-foreground">Domínio, subdomínio, Meta Pixel, Google Ads e Search Console em um só lugar.</p>
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
          <p>
            O score SEO do Gerador, a pesquisa de palavras-chave, a otimização dos artigos e a publicação no blog
            já passam a ser vistos como partes do mesmo ativo digital.
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border p-4"><CheckCircle2 className="mb-2 h-4 w-4 text-green-600" /><strong className="text-foreground">SEO do site</strong><p className="mt-1 text-xs">Título, meta description, cabeçalhos, legibilidade e imagens.</p></div>
            <div className="rounded-lg border p-4"><Target className="mb-2 h-4 w-4 text-primary" /><strong className="text-foreground">Oportunidades</strong><p className="mt-1 text-xs">Keywords e temas aprovados alimentam o plano editorial.</p></div>
            <div className="rounded-lg border p-4"><FileText className="mb-2 h-4 w-4 text-primary" /><strong className="text-foreground">Conteúdo</strong><p className="mt-1 text-xs">Artigos otimizados podem virar posts nativos do site.</p></div>
          </div>
          <Button onClick={() => onNavigate("autopilot")}><Sparkles className="mr-2 h-4 w-4" />Gerenciar SEO no Autopilot</Button>
        </CardContent>
      </Card>
    </div>
  );
}

function AnalyticsOverview({ onNavigate }: { onNavigate: (view: HubView) => void }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><BarChart3 className="h-4 w-4" /> Analytics e conversões</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Esta área concentra a leitura comercial do site. Os IDs reais de Google Ads e Meta Pixel continuam
            disponíveis em Configurações do Site; os próximos indicadores devem conectar visita → lead → oportunidade → venda,
            sem inventar métricas que ainda não estejam registradas no backend.
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border p-4"><p className="text-xs uppercase text-muted-foreground">Origem</p><p className="mt-1 font-semibold">UTM / campanha / página</p></div>
            <div className="rounded-lg border p-4"><p className="text-xs uppercase text-muted-foreground">Conversão</p><p className="mt-1 font-semibold">Lead / WhatsApp / formulário</p></div>
            <div className="rounded-lg border p-4"><p className="text-xs uppercase text-muted-foreground">Resultado</p><p className="mt-1 font-semibold">Oportunidade / venda / receita</p></div>
          </div>
          <Button variant="outline" onClick={() => onNavigate("settings")}><Settings2 className="mr-2 h-4 w-4" />Configurar rastreamento</Button>
        </CardContent>
      </Card>
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
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
            <Sparkles className="h-4 w-4" /> Marketing
          </div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Globe className="h-6 w-6" /> Sites & Content Autopilot
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Crie, remodele, publique e mantenha sites e landing pages conectados ao conteúdo, SEO, campanhas e inteligência comercial do VendorAI.
          </p>
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
        <TabsContent value="analytics" className="mt-5"><AnalyticsOverview onNavigate={navigate} /></TabsContent>
        <TabsContent value="settings" className="mt-5"><SiteSettingsBridge /></TabsContent>
      </Tabs>

      <Card className="border-dashed">
        <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Lightbulb className="mt-0.5 h-4 w-4 text-amber-500" />
            <div>
              <p className="text-sm font-medium">Princípio do módulo</p>
              <p className="text-xs text-muted-foreground">Gerador cria o ativo. Content Autopilot mantém, expande e melhora o ativo com base em contexto real.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
