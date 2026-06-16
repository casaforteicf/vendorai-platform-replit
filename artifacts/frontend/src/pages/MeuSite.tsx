import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Globe, Wand2, Loader2, ExternalLink, LayoutTemplate,
  ShoppingCart, RefreshCw, Eye, CheckCircle2, Zap,
} from "lucide-react";

interface SiteConfig {
  id: string;
  tenantId: string;
  tipo: string;
  status: string;
  ativo: boolean;
  heroImageUrl: string | null;
  tagline: string | null;
  corPrimaria: string | null;
  generatedContent: Record<string, unknown> | null;
  updatedAt: string;
}

const TIPO_OPTIONS = [
  {
    id: "landing_page",
    icon: LayoutTemplate,
    label: "Landing Page",
    desc: "Apresentação profissional da sua empresa com serviços, depoimentos e formulário de contato.",
    tag: "Mais popular",
  },
  {
    id: "ecommerce",
    icon: ShoppingCart,
    label: "E-commerce",
    desc: "Loja virtual completa com catálogo de produtos, preços e botão de compra pelo WhatsApp.",
    tag: "Venda online",
  },
];

export default function MeuSite() {
  const { user, token } = useAuth();
  const tenantId = user?.tenantId;
  const tenantSlug = (user as any)?.tenantSlug ?? tenantId;
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

  const [siteConfig, setSiteConfig] = useState<SiteConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTipo, setSelectedTipo] = useState<string>("landing_page");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
    return { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra };
  }

  const fetchConfig = useCallback(async () => {
    if (!tenantId) return;
    try {
      const r = await fetch(`${base}/api/tenants/${tenantId}/site-config`, {
        headers: authHeaders(),
      });
      if (r.ok) {
        const data: SiteConfig = await r.json();
        setSiteConfig(data);
        setSelectedTipo(data.tipo ?? "landing_page");
      }
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, base, token]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  async function handleGenerate() {
    if (!tenantId) return;
    setGenerating(true);
    setError(null);
    try {
      const r = await fetch(`${base}/api/tenants/${tenantId}/site-config/generate`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ tipo: selectedTipo }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.error ?? "Erro ao gerar site");
        return;
      }
      setSiteConfig(data.siteConfig);
    } finally {
      setGenerating(false);
    }
  }

  async function handleTogglePublish() {
    if (!siteConfig) return;
    const r = await fetch(`${base}/api/site-config/${siteConfig.id}`, {
      method: "PATCH",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ ativo: !siteConfig.ativo }),
    });
    if (r.ok) {
      const updated = await r.json();
      setSiteConfig(updated);
    }
  }

  const publicUrl = `${window.location.origin}${base}/site/${tenantSlug}`;

  const hero = siteConfig?.generatedContent?.["hero"] as Record<string, string> | undefined;
  const cores = siteConfig?.generatedContent?.["cores"] as Record<string, string> | undefined;
  const primaryColor = cores?.primaria ?? siteConfig?.corPrimaria ?? "#1e3a5f";

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Globe className="h-6 w-6 text-primary" />
            Meu Site
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            A IA gera seu site profissional completo — texto, estrutura e imagens — em segundos.
          </p>
        </div>

        {/* Type selector */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {TIPO_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const isSelected = selectedTipo === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSelectedTipo(opt.id)}
                className={`text-left p-5 rounded-2xl border-2 transition-all ${
                  isSelected
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-xl ${isSelected ? "bg-primary text-white" : "bg-gray-100 text-gray-500"}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-sm">{opt.label}</p>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${isSelected ? "bg-primary/10 text-primary" : "bg-gray-100 text-gray-500"}`}>
                        {opt.tag}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{opt.desc}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Generate button */}
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-primary/10 rounded-xl">
                <Wand2 className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold">
                  {siteConfig?.generatedContent ? "Regenerar site com IA" : "Gerar site com IA"}
                </h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  A IA usa os dados do seu perfil e questionário para criar textos, seções e imagens personalizados.
                  {siteConfig?.generatedContent && " Isso substituirá o conteúdo atual."}
                </p>
              </div>
            </div>

            {error && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

            <Button
              onClick={handleGenerate}
              disabled={generating}
              size="lg"
              className="w-full gap-2"
            >
              {generating ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Gerando seu site… pode levar 30s</>
              ) : (
                <><Wand2 className="h-4 w-4" /> {siteConfig?.generatedContent ? "Regenerar com IA" : "Gerar site agora"}</>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Published site card */}
        {!loading && siteConfig?.generatedContent && (
          <Card className="overflow-hidden">
            {/* Mini preview strip */}
            {siteConfig.heroImageUrl && (
              <div
                className="h-28 w-full bg-cover bg-center relative"
                style={{ backgroundImage: `url(${siteConfig.heroImageUrl})` }}
              >
                <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center text-white text-center px-4">
                  <p className="font-bold text-base leading-tight">
                    {hero?.headline ?? "Seu Site"}
                  </p>
                  {hero?.subheadline && (
                    <p className="text-xs opacity-80 mt-1 max-w-xs">{hero.subheadline}</p>
                  )}
                </div>
                <div
                  className="absolute bottom-0 left-0 right-0 h-1"
                  style={{ backgroundColor: primaryColor }}
                />
              </div>
            )}

            <CardHeader className="pb-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  Site gerado
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={siteConfig.ativo
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-gray-100 text-gray-500 border-gray-200"
                    }
                  >
                    {siteConfig.ativo ? "Publicado" : "Oculto"}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {siteConfig.tipo === "ecommerce" ? "E-commerce" : "Landing Page"}
                  </Badge>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 text-sm">
                <Globe className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                <span className="text-muted-foreground truncate flex-1 font-mono text-xs">{publicUrl}</span>
                <a href={publicUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3.5 w-3.5 text-primary" />
                </a>
              </div>

              <div className="flex gap-2 flex-wrap">
                <a href={publicUrl} target="_blank" rel="noreferrer" className="flex-1">
                  <Button variant="outline" size="sm" className="w-full gap-2">
                    <Eye className="h-4 w-4" /> Ver site
                  </Button>
                </a>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-2"
                  onClick={handleTogglePublish}
                >
                  {siteConfig.ativo ? (
                    <><Globe className="h-4 w-4" /> Ocultar</>
                  ) : (
                    <><CheckCircle2 className="h-4 w-4" /> Publicar</>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2 text-muted-foreground"
                  onClick={fetchConfig}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </div>

              <p className="text-xs text-muted-foreground text-center">
                Última geração: {new Date(siteConfig.updatedAt).toLocaleString("pt-BR")}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Empty state */}
        {!loading && !siteConfig?.generatedContent && (
          <div className="text-center py-8 text-muted-foreground">
            <Zap className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Seu site ainda não foi gerado. Clique em "Gerar site agora" acima.</p>
          </div>
        )}
    </div>
  );
}
