import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link2, MapPin, Search, Target } from "lucide-react";
import type { MarketingContextValue } from "@/components/marketing/MarketingContextSelector";

const ACTIVE_BRIEFING_KEY = "vendorai_active_marketing_briefing_v1";

type SavedCampaign = {
  id: string;
  nome: string;
  status?: string;
  segmentoFiltro?: { marketingContext?: Partial<MarketingContextValue> } | null;
  contexto?: (Partial<MarketingContextValue> & { marketingContext?: Partial<MarketingContextValue> }) | null;
};

type ActiveBriefingSnapshot = {
  tenantId: string;
  campaignId?: string;
  campaignName?: string;
  marketingContext: MarketingContextValue;
  updatedAt?: string;
};

export type SiteCampaignBriefing = {
  campaignId: string;
  campaignName: string;
  marketingContext: MarketingContextValue;
};

function normalizeContext(source: Partial<MarketingContextValue> | null | undefined): MarketingContextValue {
  return {
    nicheId: source?.nicheId ?? "",
    nicheName: source?.nicheName ?? "",
    productIds: Array.isArray(source?.productIds) ? source.productIds : [],
    productNames: Array.isArray(source?.productNames) ? source.productNames : [],
    businessVertical: source?.businessVertical,
    businessVerticalSlug: source?.businessVerticalSlug,
    audienceSegment: source?.audienceSegment,
    audienceNiche: source?.audienceNiche,
    campaignGoal: source?.campaignGoal,
    locationCity: source?.locationCity,
    locationState: source?.locationState,
    locationRegion: source?.locationRegion,
    projectName: source?.projectName,
    specificDetails: source?.specificDetails,
    mandatoryDifferentiators: source?.mandatoryDifferentiators,
    restrictions: source?.restrictions,
    primaryKpi: source?.primaryKpi,
    researchEnabled: source?.researchEnabled,
    seoTrackingEnabled: source?.seoTrackingEnabled,
    campaignId: source?.campaignId,
    campaignName: source?.campaignName,
  };
}

function contextFromCampaign(campaign: SavedCampaign): SiteCampaignBriefing | null {
  const raw = campaign.segmentoFiltro?.marketingContext
    ?? campaign.contexto?.marketingContext
    ?? campaign.contexto;
  if (!raw) return null;
  const marketingContext = normalizeContext(raw);
  if (!marketingContext.nicheName && !marketingContext.audienceNiche && marketingContext.productNames.length === 0) return null;
  return {
    campaignId: campaign.id,
    campaignName: campaign.nome,
    marketingContext: {
      ...marketingContext,
      campaignId: campaign.id,
      campaignName: campaign.nome,
    },
  };
}

function parseActiveSnapshot(tenantId: string): SiteCampaignBriefing | null {
  try {
    const raw = sessionStorage.getItem(ACTIVE_BRIEFING_KEY);
    if (!raw) return null;
    const snapshot = JSON.parse(raw) as ActiveBriefingSnapshot;
    if (snapshot.tenantId !== tenantId || !snapshot.marketingContext) return null;
    const context = normalizeContext(snapshot.marketingContext);
    const campaignId = snapshot.campaignId ?? context.campaignId;
    const campaignName = snapshot.campaignName ?? context.campaignName ?? "Briefing ativo";
    if (!campaignId) return null;
    return { campaignId, campaignName, marketingContext: { ...context, campaignId, campaignName } };
  } catch {
    return null;
  }
}

export function inferCampaignSiteObjective(goal: string | undefined): "leads" | "quote" | "sales" | "schedule" | "whatsapp" | "brand" {
  const value = (goal ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/whatsapp|chamar|conversar|falar/.test(value)) return "whatsapp";
  if (/orcamento|cotacao|proposta|preco/.test(value)) return "quote";
  if (/vender|venda|comprar|compra|pedido/.test(value)) return "sales";
  if (/agendar|agenda|visita|demonstracao/.test(value)) return "schedule";
  if (/marca|branding|apresentar empresa|institucional/.test(value)) return "brand";
  return "leads";
}

export function buildCampaignSiteContextText(briefing: SiteCampaignBriefing | null): string {
  if (!briefing) return "";
  const context = briefing.marketingContext;
  const location = [context.locationCity, context.locationState].filter(Boolean).join("/");
  return [
    `BRIEFING MESTRE DA CAMPANHA: ${briefing.campaignName} (${briefing.campaignId})`,
    context.businessVertical && `Negócio/vertical: ${context.businessVertical}`,
    context.audienceSegment && `Tipo de público: ${context.audienceSegment}`,
    context.audienceNiche && `Nicho/público prioritário: ${context.audienceNiche}`,
    context.productNames.length > 0 && `Oferta(s): ${context.productNames.join(", ")}`,
    context.campaignGoal && `Objetivo comercial: ${context.campaignGoal}`,
    location && `Local: ${location}`,
    context.locationRegion && `Bairro/região: ${context.locationRegion}`,
    context.projectName && `Empreendimento/local específico: ${context.projectName}`,
    context.specificDetails && `Detalhes específicos da ação: ${context.specificDetails}`,
    context.mandatoryDifferentiators && `Diferenciais obrigatórios: ${context.mandatoryDifferentiators}`,
    context.restrictions && `RESTRIÇÕES OBRIGATÓRIAS — não afirmar, inventar ou mostrar fora disto: ${context.restrictions}`,
    context.primaryKpi && `Meta/KPI: ${context.primaryKpi}`,
    context.researchEnabled === true && "Pesquisa pública solicitada: usar apenas dados reais/verificáveis disponíveis. Se algo não estiver confirmado, não tratar como fato.",
    context.seoTrackingEnabled === true && "SEO e tracking solicitados: preparar a página para intenção de busca, título/meta description, headings, FAQ/alt quando fizer sentido e rastreamento consistente; não inventar volume, posição ou desempenho.",
  ].filter(Boolean).join("\n");
}

export function CampaignSiteBriefingPicker({
  tenantId,
  token,
  value,
  onApply,
  disabled = false,
}: {
  tenantId: string;
  token?: string | null;
  value: SiteCampaignBriefing | null;
  onApply: (briefing: SiteCampaignBriefing | null) => void;
  disabled?: boolean;
}) {
  const [campaigns, setCampaigns] = useState<SavedCampaign[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoApplied, setAutoApplied] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/tenants/${tenantId}/campaigns`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      cache: "no-store",
    })
      .then((response) => response.ok ? response.json() : [])
      .then((rows) => {
        if (!cancelled) setCampaigns(Array.isArray(rows) ? rows : []);
      })
      .catch(() => { if (!cancelled) setCampaigns([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tenantId, token]);

  const reusable = useMemo(
    () => campaigns.map(contextFromCampaign).filter((item): item is SiteCampaignBriefing => Boolean(item)),
    [campaigns],
  );

  useEffect(() => {
    if (autoApplied || !tenantId) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("from") === "revenue-scout") {
      setAutoApplied(true);
      return;
    }
    const requestedId = params.get("campaignId");
    if (requestedId && reusable.length > 0) {
      const requested = reusable.find((item) => item.campaignId === requestedId);
      if (requested) {
        onApply(requested);
        setAutoApplied(true);
        return;
      }
    }
    const active = parseActiveSnapshot(tenantId);
    if (active) onApply(active);
    if (!requestedId || !loading) setAutoApplied(true);
  }, [autoApplied, tenantId, reusable, loading, onApply]);

  function selectCampaign(campaignId: string) {
    if (campaignId === "none") {
      sessionStorage.removeItem(ACTIVE_BRIEFING_KEY);
      onApply(null);
      return;
    }
    const briefing = reusable.find((item) => item.campaignId === campaignId);
    if (!briefing) return;
    onApply(briefing);
    sessionStorage.setItem(ACTIVE_BRIEFING_KEY, JSON.stringify({
      tenantId,
      campaignId: briefing.campaignId,
      campaignName: briefing.campaignName,
      marketingContext: briefing.marketingContext,
      updatedAt: new Date().toISOString(),
    } satisfies ActiveBriefingSnapshot));
  }

  const context = value?.marketingContext;
  const location = [context?.locationCity, context?.locationState].filter(Boolean).join("/");

  return (
    <div className="rounded-xl border border-primary/25 bg-primary/[0.04] p-4 space-y-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold"><Link2 className="h-4 w-4 text-primary" />Briefing de campanha</p>
          <p className="mt-1 text-xs text-muted-foreground">Reutilize exatamente o mesmo público, oferta, local, empreendimento, objetivo, SEO e restrições já definidos no Marketing.</p>
        </div>
        <div className="w-full md:w-[320px]">
          <Label className="sr-only">Campanha</Label>
          <Select value={value?.campaignId ?? "none"} onValueChange={selectCampaign} disabled={disabled || loading}>
            <SelectTrigger><SelectValue placeholder={loading ? "Carregando campanhas..." : "Usar campanha salva"} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sem campanha vinculada</SelectItem>
              {reusable.map((item) => <SelectItem key={item.campaignId} value={item.campaignId}>{item.campaignName}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {value && context && (
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary"><Target className="mr-1 h-3 w-3" />{value.campaignName}</Badge>
          {context.productNames.length > 0 && <Badge variant="outline">Oferta: {context.productNames.join(", ")}</Badge>}
          {(context.audienceNiche || context.audienceSegment) && <Badge variant="outline">Público: {context.audienceNiche || context.audienceSegment}</Badge>}
          {location && <Badge variant="outline"><MapPin className="mr-1 h-3 w-3" />{location}</Badge>}
          {context.projectName && <Badge variant="outline">Local: {context.projectName}</Badge>}
          {context.researchEnabled && <Badge variant="outline"><Search className="mr-1 h-3 w-3" />Pesquisa solicitada</Badge>}
          {context.seoTrackingEnabled && <Badge variant="outline">SEO + tracking</Badge>}
        </div>
      )}
    </div>
  );
}
