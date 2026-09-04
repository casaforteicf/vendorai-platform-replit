import { useEffect, useState } from "react";
import { AlertTriangle, BarChart3, Loader2, Search, Sparkles, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type CampaignMarketingIntelligence = {
  version: 1;
  generatedAt: string;
  source: "google_ads_keyword_planner" | "briefing_internal";
  providerStatus: {
    googleAdsConnected: boolean;
    googleAdsUsed: boolean;
    geoTarget?: { resourceName: string; name?: string; targetType?: string };
  };
  seedKeywords: string[];
  keywords: Array<{
    text: string;
    avgMonthlySearches?: number;
    competition?: string;
    competitionIndex?: number;
    lowTopOfPageBidMicros?: number;
    highTopOfPageBidMicros?: number;
  }>;
  seo: {
    primaryKeyword: string;
    secondaryKeywords: string[];
    title: string;
    metaDescription: string;
    slug: string;
    h1: string;
    h2: string[];
    faq: Array<{ question: string; answer: string }>;
    imageAlt: string[];
  };
  tracking: {
    campaignKey: string;
    utmCampaign: string;
    conversionGoal?: string;
    channels: Record<string, { source: string; medium: string; content: string }>;
  };
  warnings: string[];
};

function authHeaders(json = false): Record<string, string> {
  const token = localStorage.getItem("vendorai_token");
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

function formatSearches(value: number | undefined) {
  if (typeof value !== "number") return null;
  return new Intl.NumberFormat("pt-BR", { notation: value >= 10000 ? "compact" : "standard" }).format(value);
}

function competitionLabel(value: string | undefined) {
  if (!value) return null;
  const normalized = value.toUpperCase();
  if (normalized.includes("LOW")) return "baixa concorrência";
  if (normalized.includes("MEDIUM")) return "média concorrência";
  if (normalized.includes("HIGH")) return "alta concorrência";
  return value.toLowerCase().replaceAll("_", " ");
}

export function CampaignMarketingIntelligencePanel({
  tenantId,
  campaignId,
  campaignName,
  researchEnabled,
  compact = false,
  onGenerated,
}: {
  tenantId: string;
  campaignId?: string;
  campaignName?: string;
  researchEnabled?: boolean;
  compact?: boolean;
  onGenerated?: (pack: CampaignMarketingIntelligence) => void;
}) {
  const [pack, setPack] = useState<CampaignMarketingIntelligence | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId || !campaignId) {
      setPack(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/tenants/${tenantId}/campaigns/${campaignId}/marketing-intelligence`, {
      headers: authHeaders(),
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Não foi possível carregar a pesquisa desta campanha.");
        return response.json();
      })
      .then((data) => {
        if (cancelled) return;
        const next = (data?.marketingIntelligence ?? null) as CampaignMarketingIntelligence | null;
        setPack(next);
        if (next) onGenerated?.(next);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Erro ao carregar pesquisa.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // onGenerated apenas hidrata o briefing atual; depender da identidade da callback
    // faria a leitura remota repetir a cada render do formulário.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, campaignId]);

  async function runIntelligence() {
    if (!tenantId || !campaignId || running) return;
    setRunning(true);
    setError(null);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/campaigns/${campaignId}/marketing-intelligence`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ countryCode: "BR" }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error ?? "Não foi possível montar a estratégia.");
      const next = body?.marketingIntelligence as CampaignMarketingIntelligence | undefined;
      if (!next) throw new Error("A pesquisa não retornou um resultado válido.");
      setPack(next);
      onGenerated?.(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao montar pesquisa e estratégia.");
    } finally {
      setRunning(false);
    }
  }

  if (!campaignId) {
    return (
      <div className="rounded-lg border border-dashed px-3 py-3 text-xs text-muted-foreground">
        Salve a campanha para liberar pesquisa, SEO e tracking vinculados ao mesmo briefing.
      </div>
    );
  }

  const topKeywords = pack?.keywords?.slice(0, compact ? 4 : 8) ?? [];

  return (
    <section className="rounded-xl border border-primary/20 bg-primary/[0.035] p-4 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Search className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold">Pesquisa & estratégia</p>
            {campaignName && <Badge variant="secondary" className="max-w-52 truncate">{campaignName}</Badge>}
            {pack && (
              <Badge variant="outline" className="text-[10px]">
                {pack.providerStatus.googleAdsUsed ? "Google Ads real" : "Briefing interno"}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Une intenção de busca, SEO e tracking para que todos os canais trabalhem com a mesma estratégia.
          </p>
        </div>
        <Button type="button" size="sm" onClick={runIntelligence} disabled={running || loading} className="shrink-0">
          {running ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1.5" />}
          {running ? "Pesquisando…" : researchEnabled ? "Pesquisar e montar estratégia" : "Montar estratégia"}
        </Button>
      </div>

      {loading && !pack && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando pesquisa salva…
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {pack && (
        <>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg border bg-background p-3">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Target className="h-3.5 w-3.5" /> Palavra-chave principal</div>
              <p className="mt-1 text-sm font-semibold leading-snug">{pack.seo.primaryKeyword || "—"}</p>
            </div>
            <div className="rounded-lg border bg-background p-3">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><BarChart3 className="h-3.5 w-3.5" /> Termos priorizados</div>
              <p className="mt-1 text-sm font-semibold">{pack.keywords.length}</p>
            </div>
            <div className="rounded-lg border bg-background p-3">
              <div className="text-[11px] text-muted-foreground">Tracking da campanha</div>
              <p className="mt-1 text-xs font-mono break-all">{pack.tracking.utmCampaign}</p>
            </div>
          </div>

          {topKeywords.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold">Termos de busca</p>
              <div className="flex flex-wrap gap-1.5">
                {topKeywords.map((keyword) => {
                  const searches = formatSearches(keyword.avgMonthlySearches);
                  const competition = competitionLabel(keyword.competition);
                  return (
                    <Badge key={keyword.text} variant="outline" className="bg-background font-normal text-[11px] py-1">
                      {keyword.text}
                      {searches ? ` · ${searches}/mês` : ""}
                      {competition ? ` · ${competition}` : ""}
                    </Badge>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-lg border bg-background p-3 space-y-1.5">
              <p className="text-xs font-semibold">SEO da campanha</p>
              <p className="text-sm font-medium">{pack.seo.title}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{pack.seo.metaDescription}</p>
              <p className="text-[11px] text-muted-foreground">Slug: <span className="font-mono">/{pack.seo.slug}</span></p>
            </div>
            <div className="rounded-lg border bg-background p-3 space-y-1.5">
              <p className="text-xs font-semibold">Aplicação automática</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                O snapshot fica ligado à campanha e pode ser reutilizado por Sites/LP, Google Ads, social, YouTube e WhatsApp sem alterar a identificação de tracking a cada nova peça.
              </p>
              <p className="text-[11px] text-muted-foreground">
                Atualizado em {new Date(pack.generatedAt).toLocaleString("pt-BR")}.
              </p>
            </div>
          </div>

          {pack.warnings?.length > 0 && (
            <div className="space-y-1">
              {pack.warnings.map((warning) => (
                <p key={warning} className="flex items-start gap-1.5 text-[11px] text-amber-700">
                  <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" /> {warning}
                </p>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
