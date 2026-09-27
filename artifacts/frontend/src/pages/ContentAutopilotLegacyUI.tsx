import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Loader2, Search, Check, X, Wand2, ExternalLink, Globe, EyeOff } from "lucide-react";
import { getContentAutopilotBlogPostUrl } from "@/lib/contentAutopilotBlogUrl";

function authHeaders() {
  const token = localStorage.getItem("vendorai_token");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

function normalizeSiteUrlForBrowser(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(candidate);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname) return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function displaySiteHostname(raw: string | null | undefined): string {
  const normalized = normalizeSiteUrlForBrowser(raw);
  if (!normalized) return "seu site";
  try { return new URL(normalized).hostname; } catch { return "seu site"; }
}

interface Config {
  siteUrl: string | null;
  canalPublicacao: string;
  artigosPorDia: number;
  tetoGastoMensal: string | null;
  gastoAcumulado: string;
  ativo: boolean;
  brandTone: unknown;
}
interface Keyword {
  id: string; termo: string; volumeBusca: number | null; status: string;
}
interface Article {
  id: string; titulo: string | null; status: string; seoScore: number | null;
  imagens: { url: string; altText: string }[]; createdAt: string;
}
interface BlogPost {
  id: string; slug: string; titulo: string; imagemCapaUrl: string | null;
  publicado: boolean; publicadoEm: string | null;
}
interface WebsiteConnection {
  siteUrl: string | null;
  hostname: string | null;
  source: "autopilot_config" | "tenant_profile" | "tenant_domain" | "vendorai_subdomain" | "none";
  platform: "vendorai" | "wordpress" | "wix" | "webflow" | "shopify" | "generic" | null;
  platformLabel: string;
  status: "connected_native" | "detected_needs_auth" | "not_configured";
  canPublish: boolean;
  publicationMode: "native" | "cms_required" | "not_configured";
  needsCmsConnection: boolean;
  nativeSiteSlug: string | null;
  replacedPlatformDefault: boolean;
  message: string;
}

const STATUS_LABEL: Record<string, string> = {
  descoberta: "Descoberta", aprovada: "Aprovada", em_uso: "Em uso", descartada: "Descartada",
  pesquisando: "Pesquisando", gerando: "Gerando", otimizando: "Otimizando",
  pronto_revisao: "Pronto p/ revisão", publicado: "Publicado", erro: "Erro",
};

export default function ContentAutopilot() {
  const { user } = useAuth();
  const tenantId = (user as any)?.tenantId ?? "";
  const qc = useQueryClient();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState("config");
  const [siteUrl, setSiteUrl] = useState<string | null>(null);
  const [seedInput, setSeedInput] = useState("");

  const { data, isLoading } = useQuery<{ config: Config | null; dataForSeoConfigured: boolean }>({
    queryKey: ["content-autopilot-config", tenantId],
    queryFn: () => fetch(`/api/tenants/${tenantId}/content-autopilot/config`, { headers: authHeaders() }).then((r) => r.json()),
    enabled: !!tenantId,
  });
  const config = data?.config;
  const dataForSeoConfigured = data?.dataForSeoConfigured ?? false;

  const { data: websiteConnectionData } = useQuery<{ connection: WebsiteConnection }>({
    queryKey: ["content-autopilot-website-connection", tenantId],
    queryFn: () => fetch(`/api/tenants/${tenantId}/content-autopilot/website-connection`, { headers: authHeaders() })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error((body as { error?: string }).error ?? "Erro ao identificar site do cliente");
        return body as { connection: WebsiteConnection };
      }),
    enabled: !!tenantId,
  });
  const websiteConnection = websiteConnectionData?.connection;
  const effectiveSiteUrl = websiteConnection?.siteUrl ?? config?.siteUrl ?? null;
  const publicationReady = websiteConnection?.canPublish ?? false;

  const { data: keywordsData } = useQuery<{ keywords: Keyword[] }>({
    queryKey: ["content-autopilot-keywords", tenantId],
    queryFn: () => fetch(`/api/tenants/${tenantId}/content-autopilot/keywords`, { headers: authHeaders() }).then((r) => r.json()),
    enabled: !!tenantId,
  });
  const keywords = keywordsData?.keywords ?? [];

  const { data: articlesData } = useQuery<{ articles: Article[] }>({
    queryKey: ["content-autopilot-articles", tenantId],
    queryFn: () => fetch(`/api/tenants/${tenantId}/content-autopilot/articles`, { headers: authHeaders() }).then((r) => r.json()),
    enabled: !!tenantId,
  });
  const articles = articlesData?.articles ?? [];

  const { data: blogPostsData } = useQuery<{ posts: BlogPost[] }>({
    queryKey: ["content-autopilot-blog-posts", tenantId],
    queryFn: () => fetch(`/api/tenants/${tenantId}/content-autopilot/site-blog-posts`, { headers: authHeaders() }).then((r) => r.json()),
    enabled: !!tenantId,
  });
  const blogPosts = blogPostsData?.posts ?? [];

  const saveConfigMutation = useMutation({
    mutationFn: (payload: Partial<Config>) =>
      fetch(`/api/tenants/${tenantId}/content-autopilot/config`, { method: "PUT", headers: authHeaders(), body: JSON.stringify(payload) })
        .then(async (r) => {
          const body = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error((body as { error?: string }).error ?? "Erro ao salvar");
          return body;
        }),
    onSuccess: () => {
      setSiteUrl(null);
      qc.invalidateQueries({ queryKey: ["content-autopilot-config", tenantId] });
      qc.invalidateQueries({ queryKey: ["content-autopilot-website-connection", tenantId] });
      toast({ title: "Configuração salva" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const analyzeSiteMutation = useMutation({
    mutationFn: async () => {
      const targetSiteUrl = normalizeSiteUrlForBrowser(effectiveSiteUrl);
      if (!targetSiteUrl) throw new Error("Defina o site principal do cliente antes de analisar.");

      const configuredSiteUrl = normalizeSiteUrlForBrowser(config?.siteUrl);
      if (configuredSiteUrl !== targetSiteUrl) {
        const saveResponse = await fetch(`/api/tenants/${tenantId}/content-autopilot/config`, {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({ siteUrl: targetSiteUrl }),
        });
        const saveBody = await saveResponse.json().catch(() => ({}));
        if (!saveResponse.ok) throw new Error((saveBody as { error?: string }).error ?? "Erro ao sincronizar o site principal");
      }

      const response = await fetch(`/api/tenants/${tenantId}/content-autopilot/analyze-site`, { method: "POST", headers: authHeaders() });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error((body as { error?: string }).error ?? "Erro ao analisar site");
      return body;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["content-autopilot-config", tenantId] });
      qc.invalidateQueries({ queryKey: ["content-autopilot-website-connection", tenantId] });
      toast({ title: "Site do cliente analisado e tom de marca extraído" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const runNowMutation = useMutation({
    mutationFn: () =>
      fetch(`/api/tenants/${tenantId}/content-autopilot/run-now`, { method: "POST", headers: authHeaders() })
        .then(async (r) => {
          const body = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error((body as { error?: string }).error ?? "Erro ao executar o Autopilot");
          return body as { artigosGerados: number; erros: string[] };
        }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["content-autopilot-articles", tenantId] });
      qc.invalidateQueries({ queryKey: ["content-autopilot-keywords", tenantId] });
      qc.invalidateQueries({ queryKey: ["content-autopilot-blog-posts", tenantId] });
      toast({
        title: `Autopilot executado: ${res.artigosGerados} artigo${res.artigosGerados === 1 ? "" : "s"} gerado${res.artigosGerados === 1 ? "" : "s"}`,
        description: res.erros?.length ? `${res.erros.length} item(ns) com erro — consulte os logs.` : undefined,
      });
    },
    onError: (e: Error) => toast({ title: "Erro ao executar Autopilot", description: e.message, variant: "destructive" }),
  });

  const researchMutation = useMutation({
    mutationFn: (seedKeywords: string[]) =>
      fetch(`/api/tenants/${tenantId}/content-autopilot/keywords/research`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ seedKeywords }) })
        .then((r) => { if (!r.ok) throw new Error("Erro na pesquisa"); return r.json(); }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["content-autopilot-keywords", tenantId] });
      toast({ title: `${res.inseridas} keywords novas encontradas`, description: "Pesquisa concluída com sucesso." });
      setSeedInput("");
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const patchKeywordMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const response = await fetch(`/api/tenants/${tenantId}/content-autopilot/keywords/${id}`, { method: "PATCH", headers: authHeaders(), body: JSON.stringify({ status }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error((body as { error?: string }).error ?? "Não foi possível atualizar a keyword.");
      return body;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["content-autopilot-keywords", tenantId] }),
    onError: (error: Error) => toast({ title: "Erro ao atualizar keyword", description: error.message, variant: "destructive" }),
  });

  const generateArticleMutation = useMutation({
    mutationFn: (keywordId: string) =>
      fetch(`/api/tenants/${tenantId}/content-autopilot/keywords/${keywordId}/generate-article`, { method: "POST", headers: authHeaders() })
        .then((r) => { if (!r.ok) throw new Error("Erro ao gerar artigo"); return r.json(); }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["content-autopilot-articles", tenantId] });
      qc.invalidateQueries({ queryKey: ["content-autopilot-keywords", tenantId] });
      toast({ title: "Artigo gerado!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const optimizeMutation = useMutation({
    mutationFn: (articleId: string) =>
      fetch(`/api/tenants/${tenantId}/content-autopilot/articles/${articleId}/optimize`, { method: "POST", headers: authHeaders() })
        .then((r) => { if (!r.ok) throw new Error("Erro ao otimizar"); return r.json(); }),
    onSuccess: (res) => { qc.invalidateQueries({ queryKey: ["content-autopilot-articles", tenantId] }); toast({ title: `Score SEO: ${res.seoScore}/100` }); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const publishNativeMutation = useMutation({
    mutationFn: (articleId: string) =>
      fetch(`/api/tenants/${tenantId}/content-autopilot/articles/${articleId}/publish-native`, { method: "POST", headers: authHeaders() })
        .then(async (r) => {
          const body = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error((body as { error?: string }).error ?? "Erro ao publicar");
          return body;
        }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["content-autopilot-articles", tenantId] });
      qc.invalidateQueries({ queryKey: ["content-autopilot-blog-posts", tenantId] });
      toast({ title: "Rascunho criado no blog do site conectado" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const togglePublishMutation = useMutation({
    mutationFn: ({ id, publish }: { id: string; publish: boolean }) =>
      fetch(`/api/tenants/${tenantId}/content-autopilot/site-blog-posts/${id}/${publish ? "publish" : "unpublish"}`, { method: "PATCH", headers: authHeaders() })
        .then(async (r) => {
          const body = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error((body as { error?: string }).error ?? "Erro ao atualizar publicação");
          return body;
        }),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ["content-autopilot-blog-posts", tenantId] });
      toast({ title: vars.publish ? "Post publicado — já está no ar!" : "Post despublicado" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  if (isLoading) {
    return <div className="space-y-3"><Skeleton className="h-10 w-64" /><Skeleton className="h-40 w-full" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Sparkles className="h-5 w-5" /> Content Autopilot
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Pesquisa, gera e publica conteúdo SEO automaticamente no site do cliente.</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="config">Configuração</TabsTrigger>
          <TabsTrigger value="keywords">Keywords ({keywords.length})</TabsTrigger>
          <TabsTrigger value="articles">Artigos ({articles.length})</TabsTrigger>
          <TabsTrigger value="posts">Posts do Blog ({blogPosts.length})</TabsTrigger>
        </TabsList>

        {/* ── Configuração ─────────────────────────────────────────── */}
        <TabsContent value="config" className="space-y-4 mt-4">
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Módulo ativo (roda sozinho todo dia às 05h)</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Só processa keywords já aprovadas por você na aba Keywords.</p>
                </div>
                <Switch
                  checked={config?.ativo ?? false}
                  onCheckedChange={(v) => saveConfigMutation.mutate({ ativo: v })}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
                <div className="flex items-center gap-2 text-xs">
                  <Badge variant={dataForSeoConfigured ? "outline" : "destructive"}>
                    DataForSEO {dataForSeoConfigured ? "conectado" : "não configurado"}
                  </Badge>
                  <span className="text-muted-foreground">
                    {config?.ativo ? "Automação diária ativa" : "Automação diária pausada"}
                  </span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => runNowMutation.mutate()}
                  disabled={!config?.ativo || runNowMutation.isPending}
                >
                  {runNowMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                  Executar agora
                </Button>
              </div>

              <div className="space-y-2 rounded-lg border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <Label>Site principal do cliente</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">O VendorAI usa este site para aprender a marca e como destino das publicações.</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {websiteConnection?.hostname ? <Badge variant="outline">{websiteConnection.hostname}</Badge> : null}
                    {websiteConnection?.platformLabel ? <Badge variant="outline">{websiteConnection.platformLabel}</Badge> : null}
                    {websiteConnection?.status === "connected_native" ? <Badge>Publicação direta</Badge> : null}
                    {websiteConnection?.status === "detected_needs_auth" ? <Badge variant="secondary">CMS precisa ser conectado</Badge> : null}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="https://site-do-cliente.com"
                    value={siteUrl ?? effectiveSiteUrl ?? ""}
                    onChange={(e) => setSiteUrl(e.target.value)}
                  />
                  <Button
                    variant="outline"
                    onClick={() => {
                      const normalized = normalizeSiteUrlForBrowser(siteUrl);
                      if (!normalized) {
                        toast({ title: "URL inválida", description: "Informe o domínio público do cliente.", variant: "destructive" });
                        return;
                      }
                      saveConfigMutation.mutate({ siteUrl: normalized });
                    }}
                    disabled={siteUrl === null || !siteUrl.trim() || saveConfigMutation.isPending}
                  >
                    Salvar
                  </Button>
                </div>
                {websiteConnection?.replacedPlatformDefault ? (
                  <p className="text-xs text-amber-700">
                    O endereço padrão da VendorAI foi ignorado porque este tenant já possui um site próprio cadastrado. O site do cliente passa a ser a referência.
                  </p>
                ) : null}
                {websiteConnection?.needsCmsConnection ? (
                  <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                    Site externo identificado. O VendorAI pode analisar este domínio agora, mas não vai marcar nenhum artigo como publicado nele até o CMS ser autenticado. A camada de conexão atende WordPress, Wix/Wix Studio, Webflow, Shopify ou API do site.
                  </div>
                ) : null}
                {!websiteConnection?.siteUrl ? (
                  <p className="text-xs text-muted-foreground">Se o cliente já possui site, informe-o aqui. O Gerador de Sites só deve ser usado quando o cliente quiser criar um novo.</p>
                ) : null}
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => analyzeSiteMutation.mutate()} disabled={!effectiveSiteUrl || analyzeSiteMutation.isPending}>
                  {analyzeSiteMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wand2 className="h-4 w-4 mr-2" />}
                  Analisar / reanalisar site do cliente
                </Button>
                {config?.brandTone ? <Badge variant="outline" className="text-xs">Tom já extraído</Badge> : null}
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                <div>
                  <p className="text-xs text-muted-foreground">Automação</p>
                  <p className="text-sm font-semibold">{config?.ativo ? "Ativa" : "Pausada"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Pesquisa externa</p>
                  <p className="text-sm font-semibold">{dataForSeoConfigured ? "Disponível" : "Não configurada"}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Keywords ─────────────────────────────────────────────── */}
        <TabsContent value="keywords" className="space-y-4 mt-4">
          <Card>
            <CardContent className="p-4 space-y-2">
              <Label className="text-sm">Pesquisar novas keywords (Pesquisador via DataForSEO)</Label>
              <div className="flex gap-2">
                <Input placeholder="Termos separados por vírgula" value={seedInput} onChange={(e) => setSeedInput(e.target.value)} />
                <Button
                  onClick={() => researchMutation.mutate(seedInput.split(",").map((s) => s.trim()).filter(Boolean))}
                  disabled={!seedInput.trim() || researchMutation.isPending || !dataForSeoConfigured}
                >
                  {researchMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
                  Pesquisar
                </Button>
              </div>
              {!dataForSeoConfigured && (
                <p className="text-xs text-amber-600">
                  Pesquisa de keywords indisponível até as credenciais DataForSEO serem configuradas pela plataforma.
                </p>
              )}
            </CardContent>
          </Card>

          {keywords.length === 0 ? (
            <div className="border rounded-lg p-8 text-center text-muted-foreground text-sm">Nenhuma keyword descoberta ainda.</div>
          ) : (
            <div className="space-y-1.5">
              {keywords.map((k) => (
                <Card key={k.id}>
                  <CardContent className="p-3 flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-[160px]">
                      <p className="text-sm font-medium">{k.termo}</p>
                      <p className="text-xs text-muted-foreground">{k.volumeBusca != null ? `${k.volumeBusca} buscas/mês` : "volume desconhecido"}</p>
                    </div>
                    <Badge variant="outline" className="text-xs">{STATUS_LABEL[k.status] ?? k.status}</Badge>
                    {k.status === "descoberta" && (
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="outline" onClick={() => patchKeywordMutation.mutate({ id: k.id, status: "aprovada" })}>
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => patchKeywordMutation.mutate({ id: k.id, status: "descartada" })}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                    {k.status === "aprovada" && (
                      <Button size="sm" onClick={() => generateArticleMutation.mutate(k.id)} disabled={generateArticleMutation.isPending}>
                        {generateArticleMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
                        Gerar artigo agora
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Artigos ──────────────────────────────────────────────── */}
        <TabsContent value="articles" className="space-y-2 mt-4">
          {articles.length === 0 ? (
            <div className="border rounded-lg p-8 text-center text-muted-foreground text-sm">Nenhum artigo gerado ainda.</div>
          ) : (
            articles.map((a) => (
              <Card key={a.id}>
                <CardContent className="p-4 flex gap-4 flex-wrap items-center">
                  {a.imagens?.[0]?.url && (
                    <img src={a.imagens[0].url} alt="" className="w-20 h-14 object-cover rounded-md shrink-0" />
                  )}
                  <div className="flex-1 min-w-[200px]">
                    <p className="text-sm font-medium">{a.titulo ?? "(gerando...)"}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-xs">{STATUS_LABEL[a.status] ?? a.status}</Badge>
                      {a.seoScore != null && <Badge variant="outline" className="text-xs">SEO {a.seoScore}/100</Badge>}
                    </div>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    {a.status === "otimizando" && (
                      <Button size="sm" variant="outline" onClick={() => optimizeMutation.mutate(a.id)} disabled={optimizeMutation.isPending}>
                        Otimizar
                      </Button>
                    )}
                    {a.status === "pronto_revisao" && (
                      <Button
                        size="sm"
                        variant={publicationReady ? "default" : "outline"}
                        onClick={() => {
                          if (publicationReady) {
                            publishNativeMutation.mutate(a.id);
                            return;
                          }
                          setActiveTab("config");
                          toast({
                            title: websiteConnection?.siteUrl ? "Conecte o CMS para publicar" : "Defina o site principal para publicar",
                            description: websiteConnection?.siteUrl
                              ? `O artigo não será marcado como publicado até ${displaySiteHostname(effectiveSiteUrl)} estar autenticado.`
                              : undefined,
                          });
                        }}
                        disabled={publishNativeMutation.isPending}
                      >
                        <Globe className="h-3.5 w-3.5 mr-1.5" />
                        {publicationReady ? "Criar rascunho no site" : "Preparar publicação"}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* ── Posts do Blog ────────────────────────────────────────── */}
        <TabsContent value="posts" className="space-y-2 mt-4">
          <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
            {publicationReady ? (
              <>Destino ativo: <strong>{displaySiteHostname(effectiveSiteUrl)}</strong>. Os botões abaixo controlam o blog hospedado pelo VendorAI para este tenant.</>
            ) : websiteConnection?.siteUrl ? (
              <>Destino principal: <strong>{displaySiteHostname(effectiveSiteUrl)}</strong>. Como é um site externo, nenhum item abaixo será tratado como publicado no site do cliente até a conexão do CMS ser autenticada.</>
            ) : (
              <>Nenhum site principal definido. Configure o site do cliente antes de publicar artigos.</>
            )}
          </div>
          {blogPosts.length === 0 ? (
            <div className="border rounded-lg p-8 text-center text-muted-foreground text-sm">Nenhum post ainda. Gere um artigo na aba Artigos primeiro.</div>
          ) : (
            blogPosts.map((p) => {
              const publicPostUrl = publicationReady ? getContentAutopilotBlogPostUrl(effectiveSiteUrl, p.slug) : null;
              return (
              <Card key={p.id}>
                <CardContent className="p-4 flex gap-4 flex-wrap items-center">
                  {p.imagemCapaUrl && <img src={p.imagemCapaUrl} alt="" className="w-20 h-14 object-cover rounded-md shrink-0" />}
                  <div className="flex-1 min-w-[200px]">
                    <p className="text-sm font-medium">{p.titulo}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {publicationReady ? (
                        <Badge variant={p.publicado ? "default" : "outline"} className="text-xs">
                          {p.publicado ? "No ar" : "Rascunho (não visível)"}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          {p.publicado ? "Publicação nativa antiga — não confirma o site atual" : "Rascunho local"}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    {!publicationReady ? (
                      <Badge variant="secondary">Conectar CMS para publicar</Badge>
                    ) : p.publicado ? (
                      <>
                        {publicPostUrl ? (
                          <Button size="sm" variant="outline" asChild>
                            <a href={publicPostUrl} target="_blank" rel="noreferrer">
                            <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Ver
                            </a>
                          </Button>
                        ) : null}
                        <Button size="sm" variant="ghost" onClick={() => togglePublishMutation.mutate({ id: p.id, publish: false })} disabled={togglePublishMutation.isPending}>
                          <EyeOff className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" onClick={() => togglePublishMutation.mutate({ id: p.id, publish: true })} disabled={togglePublishMutation.isPending}>
                        {togglePublishMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Globe className="h-3.5 w-3.5 mr-1.5" />}
                        Publicar
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
              );
            })
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}