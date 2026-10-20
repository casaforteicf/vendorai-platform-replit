import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { Megaphone, Plus, Loader2, Sparkles, Check, Copy, Search, HelpCircle, Trash2, RefreshCw, AlertTriangle, Eye } from "lucide-react";
import { MarketingContextSelector, type MarketingContextValue } from "@/components/marketing/MarketingContextSelector";

function LabelTip({ children, tip }: { children: React.ReactNode; tip: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <Label>{children}</Label>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="text-muted-foreground hover:text-foreground" tabIndex={-1}>
            <HelpCircle className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-[280px] text-sm">{tip}</TooltipContent>
      </Tooltip>
    </div>
  );
}

function CollapsibleSection({ title, hint, count, children }: {
  title: string;
  hint: string;
  count: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(count > 0);
  return (
    <div className="border-t pt-4">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between text-left">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            {title}
            {count > 0 && <Badge variant="secondary" className="font-normal">{count} preenchido{count > 1 ? "s" : ""}</Badge>}
          </h3>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        <span className="text-xs text-muted-foreground shrink-0 ml-2">{open ? "Ocultar ▲" : "Mostrar ▼"}</span>
      </button>
      {open && <div className="space-y-3 mt-3">{children}</div>}
    </div>
  );
}

function authHeaders() {
  const token = localStorage.getItem("vendorai_token");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

function MultiSelectChips({ value, onChange, options, placeholder }: {
  value: string[];
  onChange: (next: string[]) => void;
  options?: string[];
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);

  function addValue(v: string) {
    const trimmed = v.trim();
    if (!trimmed || value.includes(trimmed)) return;
    onChange([...value, trimmed]);
    setDraft("");
  }
  function removeValue(v: string) {
    onChange(value.filter((x) => x !== v));
  }

  return (
    <div className="space-y-1.5">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((v) => (
            <Badge key={v} variant="secondary" className="font-normal gap-1 pr-1.5">
              {v}
              <button type="button" onClick={() => removeValue(v)} className="text-muted-foreground hover:text-destructive ml-0.5">×</button>
            </Badge>
          ))}
        </div>
      )}
      {options ? (
        <div className="flex flex-wrap gap-1.5">
          {options.filter((o) => !value.includes(o)).map((o) => (
            <button key={o} type="button" onClick={() => addValue(o)}
              className="text-xs rounded-full border border-dashed border-muted-foreground/40 px-2.5 py-1 text-muted-foreground hover:border-primary hover:text-primary transition-colors">
              + {o}
            </button>
          ))}
        </div>
      ) : (
        <div className="relative">
          <Input
            placeholder={placeholder ?? "Digite e pressione Enter..."}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addValue(draft); } }}
          />
          {open && draft.trim() && (
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => addValue(draft)}
              className="absolute left-0 right-0 top-full mt-1 z-10 text-left text-xs bg-background border rounded-md px-3 py-2 hover:bg-muted">
              Adicionar "{draft.trim()}"
            </button>
          )}
        </div>
      )}
    </div>
  );
}

type ItemTipo = "produto" | "veiculo" | "imovel" | "landing_page" | "livre";
type TipoAnuncio = "shopping" | "rsa_pmax" | "imagem" | "video";
type Modo = "unico" | "carrossel";
type DestinoClique = "landing_page" | "whatsapp" | "produto" | "formulario_lead";

interface AdCampaign {
  id: string;
  plataforma: string;
  tipoAnuncio: TipoAnuncio;
  vertical: string;
  itemTipo: ItemTipo;
  itemId: string | null;
  itemLabel: string | null;
  categoriaFiltro: string | null;
  modo: Modo;
  orcamentoDiario: string;
  status: string;
  externalCampaignId: string | null;
  utmCode: string | null;
  pausarAoInteresse: boolean;
  slaNegociacaoHoras: number;
  latestCreative: AdCreative | null;
  segmentacao?: {
    origemInstagram?: { mediaId: string; variationIndex: number; contentGenerationId: string; instagramConnectionId?: string };
    instagramConnectionId?: string;
    audiencePlan?: {
      summary: string;
      google: { keywords: string[] };
      meta: { interestQueries: string[]; resolvedInterests?: Array<{ id: string; name: string }> };
    };
    campaignControl?: { objective: string; startDate: string; endDate: string; totalBudget: number; specialAdCategory: string };
    platformReview?: {
      status: "nao_enviada" | "em_analise" | "aprovada" | "aprovada_limitada" | "reprovada" | "erro_pagamento" | "erro_conta";
      reason?: string;
      policyTopics?: string[];
      syncedAt: string;
    };
  };
}

interface VehicleReservation {
  id: string; campaignId: string; vehicleId: string; leadId: string; dealId: string;
  status: "em_negociacao" | "justificativa_pendente" | "liberado" | "vendido";
  justificationDueAt: string;
}

interface AdCreative {
  id: string;
  campaignId: string;
  headlines: string[];
  descriptions: string[];
  imagens: string[];
  status: "rascunho" | "aprovado";
}

interface ItemBusca { id: string; label: string; imagens?: string[] }

interface AdsOverviewAlert {
  id: string; campaignId: string; severity: string; message: string; eventType: string; createdAt: string;
}
interface AdsOverviewCampaign {
  campaignId: string; label: string; plataforma: string; status: string; objective: string | null;
  startDate: string | null; endDate: string | null; daysRemaining: number | null;
  plannedBudget: number; dailyBudget: number; spend: number; impressions: number; clicks: number;
  platformConversions: number; leads: number; sales: number; revenue: number;
  costPerLead: number | null; roas: number | null; alerts: AdsOverviewAlert[];
  recommendation: { title: string; reason: string; action: string; requiresApproval: boolean } | null;
}
interface AdsOverview {
  totals: { plannedBudget: number; spend: number; leads: number; sales: number; revenue: number; activeCampaigns: number; unresolvedAlerts: number };
  campaigns: AdsOverviewCampaign[];
}

interface ImportedContentDraft {
  contentGenerationId: string;
  variationIndex: number;
  theme: string;
  sourceType: string;
  suggestedPlatform: "google" | "meta";
  sourceVariationIndex?: number;
  creativeDraft: { headlines: string[]; descriptions: string[]; imagens: string[] };
}

interface RevenueScoutAdsDraft {
  campaignId: string;
  campaignName?: string;
  suggestedPlatform?: "google" | "meta";
  marketingContext?: MarketingContextValue;
  region?: string;
  opportunity?: string;
  offer?: string;
  headline?: string;
  description?: string;
}

type ActiveMarketingBriefing = {
  tenantId?: string;
  campaignId?: string;
  campaignName?: string;
  marketingContext?: MarketingContextValue;
};

const ACTIVE_BRIEFING_KEY = "vendorai_active_marketing_briefing_v1";

const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  aguardando_conexao_plataforma: "Aguardando conexão",
  ativo: "Ativa",
  pausado: "Pausada",
  encerrado: "Encerrada",
};
const STATUS_COLOR: Record<string, string> = {
  rascunho: "bg-muted text-muted-foreground",
  aguardando_conexao_plataforma: "bg-amber-100 text-amber-800",
  ativo: "bg-green-100 text-green-800",
  pausado: "bg-slate-200 text-slate-700",
  encerrado: "bg-red-100 text-red-700",
};

const EMPTY_FORM = {
  plataforma: "google" as "google" | "meta",
  itemTipo: "veiculo" as ItemTipo,
  itemId: "",
  itemLabel: "",
  tipoAnuncio: "rsa_pmax" as TipoAnuncio,
  modo: "unico" as Modo,
  categoriaFiltro: "",
  destinoClique: "whatsapp" as DestinoClique,
  orcamentoDiario: "",
  vertical: "",
  locais: "", tipoPresenca: "presenca" as "presenca" | "interesse" | "ambos", raioKm: "",
  idades: [] as string[], generos: [] as string[], statusParental: [] as string[], rendas: [] as string[],
  afinidade: [] as string[], noMercado: [] as string[], termosPesquisa: [] as string[], sites: [] as string[], aplicativos: [] as string[],
  remarketing: [] as string[], customerMatch: [] as string[], semelhantes: [] as string[],
  objective: "whatsapp" as "whatsapp" | "lead" | "sale" | "visit" | "awareness",
  startDate: new Date().toISOString().slice(0, 10),
  endDate: new Date(Date.now() + 6 * 86_400_000).toISOString().slice(0, 10),
  specialAdCategory: "NONE" as "NONE" | "HOUSING" | "EMPLOYMENT" | "CREDIT" | "ISSUES_ELECTIONS_POLITICS",
  conversionMode: "vendorai" as "vendorai" | "platform" | "clicks",
  conversionConfirmed: true,
  autoPauseNoResults: true,
  spendWithoutResultLimit: "",
  pausarAoInteresse: true, slaNegociacaoHoras: "48",
  imagemEscolhidaUrl: "" as string,
  contentGenerationId: "" as string,
  instagramConnectionId: "" as string,
};

const OPCOES_IDADE = ["18-24", "25-34", "35-44", "45-54", "55-64", "65+", "Desconhecida"];
const OPCOES_GENERO = ["Feminino", "Masculino", "Desconhecido"];
const OPCOES_STATUS_PARENTAL = ["Com filhos", "Sem filhos", "Desconhecido"];
const OPCOES_RENDA = ["10% superior", "11-20%", "21-30%", "31-40%", "41-50%", "50% inferior", "Desconhecida"];

const lista = (value: string) => value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
const campaignDays = (start: string, end: string) => {
  const from = new Date(`${start}T00:00:00`).getTime();
  const to = new Date(`${end}T00:00:00`).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return 0;
  return Math.floor((to - from) / 86_400_000) + 1;
};

export default function Ads() {
  const { user } = useAuth();
  const tenantId = (user as any)?.tenantId ?? "";
  const qc = useQueryClient();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [itemSearch, setItemSearch] = useState("");
  const [itemListaAberta, setItemListaAberta] = useState(false);
  const [expandedCreative, setExpandedCreative] = useState<Record<string, AdCreative | null>>({});
  const [reservationDecision, setReservationDecision] = useState<VehicleReservation | null>(null);
  const [decision, setDecision] = useState<"manter" | "avancar" | "perdido">("manter");
  const [justification, setJustification] = useState("");
  const [sourceDraft, setSourceDraft] = useState<ImportedContentDraft | null>(null);
  const [autoGenerateAfterCreate, setAutoGenerateAfterCreate] = useState(false);
  const [marketingContext, setMarketingContext] = useState<MarketingContextValue>({ nicheId: "", nicheName: "", productIds: [], productNames: [] });
  const [historyCampaignId, setHistoryCampaignId] = useState<string | null>(null);

  const { data: instagramConnectionStatus } = useQuery<{
    id?: string;
    connections?: Array<{ id: string; username?: string | null }>;
  }>({
    queryKey: ["ads-instagram-accounts", tenantId],
    queryFn: async () => {
      const response = await fetch(`/api/tenants/${tenantId}/instagram-connection`, {
        headers: authHeaders(),
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Não foi possível carregar as contas do Instagram.");
      return response.json();
    },
    enabled: Boolean(tenantId),
    staleTime: 30_000,
  });
  const instagramAccounts = instagramConnectionStatus?.connections ?? [];
  const defaultInstagramConnectionId =
    instagramConnectionStatus?.id || instagramAccounts[0]?.id || "";

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const source = params.get("from");

    if (source === "media-plan") {
      try {
        const raw = sessionStorage.getItem(ACTIVE_BRIEFING_KEY);
        const stored = raw ? JSON.parse(raw) as ActiveMarketingBriefing : null;
        const requestedCampaignId = params.get("campaignId")?.trim() ?? "";
        const storedMatchesTenant = !tenantId || stored?.tenantId === tenantId;
        const storedMatchesCampaign = !requestedCampaignId || stored?.campaignId === requestedCampaignId;
        const context = storedMatchesTenant && storedMatchesCampaign ? stored?.marketingContext : undefined;

        setSourceDraft(null);
        setAutoGenerateAfterCreate(false);

        if (context) {
          const hydratedContext: MarketingContextValue = {
            ...context,
            campaignId: stored?.campaignId || context.campaignId,
            campaignName: stored?.campaignName || context.campaignName,
          };
          const location = [hydratedContext.locationCity, hydratedContext.locationState, hydratedContext.locationRegion]
            .filter((value): value is string => Boolean(value?.trim()))
            .join(", ");
          const primaryOffer = hydratedContext.productNames[0] || hydratedContext.campaignName || hydratedContext.projectName || "Campanha do Plano de Mídia";

          setMarketingContext(hydratedContext);
          setForm({
            ...EMPTY_FORM,
            itemTipo: "livre",
            itemLabel: primaryOffer,
            destinoClique: "whatsapp",
            vertical: hydratedContext.businessVertical || hydratedContext.audienceNiche || "",
            locais: location,
            termosPesquisa: [hydratedContext.audienceNiche, primaryOffer].filter((value): value is string => Boolean(value?.trim())),
            objective: "lead",
          });
          toast({
            title: "Plano de Mídia carregado",
            description: "Campanha, oferta, público e região foram reaproveitados. Revise plataforma, período e orçamento antes de criar o rascunho.",
          });
        } else {
          setForm({ ...EMPTY_FORM, itemTipo: "livre", destinoClique: "whatsapp", objective: "lead" });
          toast({
            title: "Abrindo mídia paga",
            description: "O briefing da campanha não pôde ser confirmado. Revise os campos antes de criar o rascunho.",
            variant: "destructive",
          });
        }

        setOpen(true);
      } catch {
        setSourceDraft(null);
        setAutoGenerateAfterCreate(false);
        setForm({ ...EMPTY_FORM, itemTipo: "livre", destinoClique: "whatsapp", objective: "lead" });
        setOpen(true);
        toast({
          title: "Abrindo mídia paga",
          description: "O briefing salvo está inválido. Revise os campos antes de criar o rascunho.",
          variant: "destructive",
        });
      }
      return;
    }

    if (source === "revenue-scout") {
      try {
        const raw = sessionStorage.getItem("vendorai_ads_revenue_scout_draft_v1");
        if (!raw) return;
        const draft = JSON.parse(raw) as RevenueScoutAdsDraft;
        if (!draft.campaignId) return;
        const context = draft.marketingContext ?? { nicheId: "", nicheName: "", productIds: [], productNames: [] };
        setMarketingContext({
          ...context,
          campaignGoal: [context.campaignGoal, draft.description, draft.opportunity].filter(Boolean).join(" | "),
        });
        const platform = draft.suggestedPlatform ?? "meta";
        setSourceDraft(null);
        setAutoGenerateAfterCreate(false);
        setForm({
          ...EMPTY_FORM,
          plataforma: platform,
          tipoAnuncio: platform === "meta" ? "imagem" : "rsa_pmax",
          itemTipo: "livre",
          itemLabel: draft.offer || draft.campaignName || "Campanha do Revenue Scout",
          destinoClique: "whatsapp",
          vertical: context.businessVertical || context.audienceNiche || "",
          locais: draft.region ?? "",
          termosPesquisa: [context.audienceNiche, draft.opportunity].filter((value): value is string => Boolean(value)),
          objective: "lead",
        });
        setOpen(true);
        sessionStorage.removeItem("vendorai_ads_revenue_scout_draft_v1");
        toast({ title: "Plano do Revenue Scout carregado", description: "O anúncio continua em rascunho até você revisar orçamento, público e ativação." });
      } catch {
        sessionStorage.removeItem("vendorai_ads_revenue_scout_draft_v1");
      }
      return;
    }

    if (source !== "content") return;
    try {
      const raw = sessionStorage.getItem("vendorai_ads_content_draft_v1");
      if (!raw) return;
      const draft = JSON.parse(raw) as ImportedContentDraft;
      if (!draft.contentGenerationId || !draft.creativeDraft) return;
      setSourceDraft(draft);
      setAutoGenerateAfterCreate(
        draft.suggestedPlatform === "meta" && draft.creativeDraft.imagens.length === 0,
      );
      setForm({
        ...EMPTY_FORM,
        plataforma: draft.suggestedPlatform,
        tipoAnuncio: draft.suggestedPlatform === "meta" ? "imagem" : "rsa_pmax",
        itemTipo: "livre",
        itemLabel: draft.theme || "Conteúdo do Marketing",
        destinoClique: "whatsapp",
        imagemEscolhidaUrl: draft.creativeDraft.imagens[0] ?? "",
        contentGenerationId: draft.contentGenerationId,
      });
      setOpen(true);
      sessionStorage.removeItem("vendorai_ads_content_draft_v1");
      toast({ title: "Conteúdo carregado", description: "A variação escolhida já está anexada como criativo deste rascunho." });
    } catch {
      sessionStorage.removeItem("vendorai_ads_content_draft_v1");
    }
  }, []);

  const { data: campaigns = [], isLoading } = useQuery<AdCampaign[]>({
    queryKey: ["ad-campaigns", tenantId],
    queryFn: () => fetch(`/api/tenants/${tenantId}/ads/campaigns`, { headers: authHeaders() }).then((r) => r.json()),
    enabled: !!tenantId,
  });

  useEffect(() => {
    const pending = campaigns.filter((campaign) =>
      campaign.externalCampaignId &&
      (!campaign.segmentacao?.platformReview || campaign.segmentacao.platformReview.status === "em_analise"),
    );
    if (!tenantId || pending.length === 0) return;

    const sync = async () => {
      await Promise.allSettled(pending.map((campaign) =>
        fetch(`/api/tenants/${tenantId}/ads/campaigns/${campaign.id}/sync-status`, {
          method: "POST",
          headers: authHeaders(),
        }),
      ));
      qc.invalidateQueries({ queryKey: ["ad-campaigns", tenantId] });
    };
    void sync();
    const timer = window.setInterval(sync, 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [tenantId, campaigns.map((campaign) => `${campaign.id}:${campaign.segmentacao?.platformReview?.status ?? ""}`).join("|")]);

  const { data: adsOverview } = useQuery<AdsOverview>({
    queryKey: ["ads-overview", tenantId],
    queryFn: () => fetch(`/api/tenants/${tenantId}/ads/overview`, { headers: authHeaders() }).then((r) => {
      if (!r.ok) throw new Error("Não foi possível carregar os resultados");
      return r.json();
    }),
    enabled: !!tenantId,
    refetchInterval: 60_000,
  });
  const overviewByCampaign = new Map((adsOverview?.campaigns ?? []).map((item) => [item.campaignId, item]));

  const resolveAlert = useMutation({
    mutationFn: async (eventId: string) => {
      const r = await fetch(`/api/tenants/${tenantId}/ads/events/${eventId}/resolve`, { method: "POST", headers: authHeaders() });
      if (!r.ok) throw new Error("Não foi possível marcar o alerta como resolvido");
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ads-overview", tenantId] }),
  });

  const { data: campaignHistory = [] } = useQuery<Array<{ id: string; eventType: string; severity: string; message: string; metadata: Record<string, unknown>; createdAt: string }>>({
    queryKey: ["ads-campaign-history", tenantId, historyCampaignId],
    queryFn: () => fetch(`/api/tenants/${tenantId}/ads/campaigns/${historyCampaignId}/events`, { headers: authHeaders() }).then((r) => r.json()),
    enabled: !!tenantId && !!historyCampaignId,
  });

  const { data: reservations = [] } = useQuery<VehicleReservation[]>({
    queryKey: ["vehicle-ad-reservations", tenantId],
    queryFn: () => fetch(`/api/tenants/${tenantId}/ads/vehicle-reservations`, { headers: authHeaders() }).then((r) => r.json()),
    enabled: !!tenantId,
  });

  const { data: feedInfo } = useQuery<{ configured: boolean }>({
    queryKey: ["ads-shopping-feed-status", tenantId],
    queryFn: () => fetch(`/api/tenants/${tenantId}/ads/shopping-feed/url`, { headers: authHeaders() }).then((r) => r.json()),
    enabled: !!tenantId,
  });

  const copyShoppingFeedUrl = async () => {
    const response = await fetch(`/api/tenants/${tenantId}/ads/shopping-feed/copy-url`, {
      method: "POST",
      headers: authHeaders(),
    });
    if (!response.ok) {
      toast({ title: "Não foi possível copiar", description: "Tente novamente em instantes.", variant: "destructive" });
      return;
    }
    const { feedUrl } = await response.json() as { feedUrl: string };
    await navigator.clipboard.writeText(feedUrl);
    toast({ title: "URL protegida copiada", description: "O token não fica exposto na tela." });
  };

  const { data: itensDisponiveis = [] } = useQuery<ItemBusca[]>({
    queryKey: ["ads-item-search", tenantId, form.itemTipo, itemSearch],
    queryFn: async () => {
      if (form.itemTipo === "produto") {
        const r = await fetch(`/api/tenants/${tenantId}/produtos-catalogo`, { headers: authHeaders() });
        const data = r.ok ? await r.json() : [];
        return data.filter((p: any) => p.ativo !== false).map((p: any) => ({
          id: p.id, label: `${p.nome} — R$ ${p.precoBase}`,
          imagens: [p.imagemUrl, ...(Array.isArray(p.imagens) ? p.imagens : [])].filter(Boolean),
        }));
      }
      if (form.itemTipo === "veiculo") {
        const r = await fetch(`/api/tenants/${tenantId}/veiculos/estoque`, { headers: authHeaders() });
        const data = r.ok ? await r.json() : [];
        return data.map((v: any) => ({
          id: v.id, label: `${v.marca} ${v.modelo}${v.versao ? " " + v.versao : ""} — R$ ${v.valor}`,
          imagens: Array.isArray(v.fotos) ? v.fotos : [],
        }));
      }
      if (form.itemTipo === "landing_page") {
        const r = await fetch(`/api/tenants/${tenantId}/site-generator`, { headers: authHeaders() });
        const data = r.ok ? await r.json() : [];
        return data.map((s: any) => ({
          id: s.id, label: s.name || s.siteType,
          imagens: Array.isArray(s.config?.images) ? s.config.images : [],
        }));
      }
      const r = await fetch(`/api/tenants/${tenantId}/imoveis/propriedades`, { headers: authHeaders() });
      const data = r.ok ? await r.json() : [];
      return data.map((i: any) => ({
        id: i.id, label: `${i.titulo} — R$ ${i.valor}`,
        imagens: Array.isArray(i.fotos) ? i.fotos : [],
      }));
    },
    enabled: open && !!tenantId && form.itemTipo !== "livre",
  });

  const itensFiltrados = itemSearch.trim()
    ? itensDisponiveis.filter((i) => i.label.toLowerCase().includes(itemSearch.toLowerCase())).slice(0, 8)
    : itensDisponiveis.slice(0, 8);

  const criarCampanha = useMutation({
    mutationFn: async () => {
      const body = {
        tenantId,
        plataforma: form.plataforma,
        tipoAnuncio: form.tipoAnuncio,
        vertical: marketingContext.nicheName || form.vertical || form.itemTipo,
        itemTipo: form.itemTipo,
        itemId: form.modo === "unico" && form.itemTipo !== "livre" ? form.itemId : null,
        itemLabel: form.itemLabel || null,
        contentGenerationId: form.contentGenerationId || null,
        categoriaFiltro: form.modo === "carrossel" ? form.categoriaFiltro : null,
        modo: form.modo,
        destinoClique: form.destinoClique,
        landingPageId: form.itemTipo === "landing_page" && form.modo === "unico" ? form.itemId : null,
        orcamentoDiario: form.orcamentoDiario,
        segmentacao: {
          localizacao: { locais: lista(form.locais), tipoPresenca: form.tipoPresenca, raioKm: form.raioKm ? Number(form.raioKm) : null },
          demografia: { idades: form.idades, generos: form.generos, statusParental: form.statusParental, rendas: form.rendas },
          audiencias: { afinidade: form.afinidade, noMercado: form.noMercado, termosPesquisa: form.termosPesquisa, sites: form.sites, aplicativos: form.aplicativos },
          dadosProprios: { remarketing: form.remarketing, customerMatch: form.customerMatch, semelhantes: form.semelhantes },
          marketingContext: { ...marketingContext },
          ...(form.plataforma === "meta" && (form.instagramConnectionId || defaultInstagramConnectionId) ? { instagramConnectionId: form.instagramConnectionId || defaultInstagramConnectionId } : {}),
          campaignControl: {
            objective: form.objective,
            startDate: form.startDate,
            endDate: form.endDate,
            totalBudget: Number(form.orcamentoDiario) * campaignDays(form.startDate, form.endDate),
            specialAdCategory: form.specialAdCategory,
            conversionTracking: { mode: form.conversionMode, confirmed: form.conversionMode !== "platform" || form.conversionConfirmed },
            automation: {
              autoPauseNoResults: form.autoPauseNoResults,
              spendWithoutResultLimit: form.spendWithoutResultLimit ? Number(form.spendWithoutResultLimit) : null,
              allowBudgetIncrease: false,
            },
          },
        },
        pausarAoInteresse: form.itemTipo === "veiculo" && form.modo === "unico" ? form.pausarAoInteresse : false,
        slaNegociacaoHoras: Number(form.slaNegociacaoHoras || 48),
        imagemEscolhidaUrl: form.tipoAnuncio === "imagem" && form.imagemEscolhidaUrl ? form.imagemEscolhidaUrl : null,
        creativeDraft: sourceDraft?.creativeDraft ?? null,
        sourceVariationIndex: sourceDraft?.sourceVariationIndex ?? sourceDraft?.variationIndex ?? null,
      };
      const r = await fetch(`/api/tenants/${tenantId}/ads/campaigns`, {
        method: "POST", headers: authHeaders(), body: JSON.stringify(body),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        const fieldMsgs = data?.error?.fieldErrors
          ? Object.entries(data.error.fieldErrors).flatMap(([campo, msgs]) => (msgs as string[]).map((m) => `${campo}: ${m}`))
          : [];
        const formMsgs = data?.error?.formErrors ?? [];
        const todasMsgs = [...formMsgs, ...fieldMsgs];
        throw new Error(todasMsgs.length > 0 ? todasMsgs.join(" · ") : "Falha ao criar campanha");
      }
      return r.json();
    },
    onSuccess: (campaign: AdCampaign & { autonomousExecution?: { attempted: boolean; executed: boolean; published?: boolean; activated?: boolean; reason?: string; warning?: string } | null }) => {
      qc.invalidateQueries({ queryKey: ["ad-campaigns", tenantId] });
      const automation = campaign.autonomousExecution;
      const shouldAutoGenerate =
        !automation?.attempted &&
        autoGenerateAfterCreate &&
        (campaign.tipoAnuncio === "imagem" || campaign.tipoAnuncio === "rsa_pmax") &&
        !(campaign as any).latestCreative;
      toast({
        title: automation?.activated ? "IA publicou e ativou o patrocínio" : sourceDraft ? "Campanha de patrocínio criada" : "Campanha criada",
        description: automation?.activated
          ? "Criativo aprovado, campanha publicada e mídia ativada automaticamente dentro do orçamento e período definidos."
          : automation?.published
            ? `A IA publicou a campanha, mas a ativação ficou pendente: ${automation.warning ?? "aguardando a plataforma"}`
            : automation?.attempted && !automation.executed
              ? `Campanha preservada como rascunho. A automação não concluiu: ${automation.reason ?? "verifique a conexão da plataforma"}`
              : sourceDraft
                ? "O conteúdo do Marketing foi anexado. No modo Automático, a IA executa assim que todos os limites e conexões estiverem válidos."
                : shouldAutoGenerate ? "Rascunho criado. A IA está gerando texto e imagem do anúncio." : "Campanha criada com os limites definidos.",
      });
      setOpen(false);
      setForm({ ...EMPTY_FORM });
      setSourceDraft(null);
      setAutoGenerateAfterCreate(false);
      if (shouldAutoGenerate) gerarCriativo.mutate(campaign.id);
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const decidirReserva = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/tenants/${tenantId}/ads/vehicle-reservations/${reservationDecision!.id}/decision`, {
        method: "POST", headers: authHeaders(), body: JSON.stringify({ decision, justification }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Não foi possível registrar a decisão");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vehicle-ad-reservations", tenantId] });
      qc.invalidateQueries({ queryKey: ["ad-campaigns", tenantId] });
      setReservationDecision(null); setJustification("");
      toast({ title: "Decisão registrada", description: "A pipeline e o anúncio foram atualizados." });
    },
    onError: (e: any) => toast({ title: "Justificativa obrigatória", description: e.message, variant: "destructive" }),
  });

  const gerarCriativo = useMutation({
    mutationFn: async (campaignId: string) => {
      const r = await fetch(`/api/tenants/${tenantId}/ads/campaigns/${campaignId}/gerar-criativo`, {
        method: "POST", headers: authHeaders(),
      });
      if (!r.ok) throw new Error((await r.json())?.error ?? "Falha ao gerar criativo");
      return (await r.json()) as AdCreative;
    },
    onSuccess: (creative) => {
      setExpandedCreative((prev) => ({ ...prev, [creative.campaignId]: creative }));
      toast({ title: "Criativo gerado", description: "Revise os títulos e descrições antes de aprovar." });
    },
    onError: (e: any) => toast({ title: "Não foi possível gerar", description: e.message, variant: "destructive" }),
  });

  const corrigirReprovada = useMutation({
    mutationFn: async (campaignId: string) => {
      const r = await fetch(`/api/tenants/${tenantId}/ads/campaigns/${campaignId}/retry`, {
        method: "POST", headers: authHeaders(),
      });
      if (!r.ok) throw new Error((await r.json())?.error ?? "Falha ao preparar a correção");
      return (await r.json()) as AdCampaign;
    },
    onSuccess: (campaign) => {
      qc.invalidateQueries({ queryKey: ["ad-campaigns", tenantId] });
      toast({ title: "Nova versão criada", description: "A IA está refazendo o criativo considerando o motivo da reprovação." });
      gerarCriativo.mutate(campaign.id);
    },
    onError: (e: any) => toast({ title: "Não foi possível corrigir", description: e.message, variant: "destructive" }),
  });

  const prepararRecomendacao = useMutation({
    mutationFn: async ({ campaignId, action }: { campaignId: string; action: string }) => {
      const r = await fetch(`/api/tenants/${tenantId}/ads/campaigns/${campaignId}/prepare-recommendation`, {
        method: "POST", headers: authHeaders(), body: JSON.stringify({ action }),
      });
      const payload = await r.json();
      if (!r.ok) throw new Error(payload?.error ?? "Não foi possível preparar a recomendação");
      return payload as { campaign: AdCampaign; guidance: string[] };
    },
    onSuccess: ({ guidance }) => {
      qc.invalidateQueries({ queryKey: ["ad-campaigns", tenantId] });
      toast({ title: "Nova versão preparada", description: guidance.join(" ") });
    },
    onError: (e: any) => toast({ title: "Não foi possível preparar", description: e.message, variant: "destructive" }),
  });

  const aprovarCriativo = useMutation({
    mutationFn: async (creativeId: string) => {
      const r = await fetch(`/api/tenants/${tenantId}/ads/creatives/${creativeId}/aprovar`, {
        method: "POST", headers: authHeaders(),
      });
      if (!r.ok) throw new Error("Falha ao aprovar");
      return (await r.json()) as AdCreative;
    },
    onSuccess: (creative) => {
      setExpandedCreative((prev) => ({ ...prev, [creative.campaignId]: creative }));
      toast({ title: "Criativo aprovado" });
    },
    onError: (error: Error) => toast({ title: "Não foi possível aprovar o criativo", description: error.message, variant: "destructive" }),
  });

  const publicarCampanha = useMutation({
    mutationFn: async (campaignId: string) => {
      const r = await fetch(`/api/tenants/${tenantId}/ads/campaigns/${campaignId}/publicar`, {
        method: "POST", headers: authHeaders(), body: JSON.stringify({ activate: false }),
      });
      if (!r.ok) throw new Error((await r.json())?.error ?? "Falha ao publicar");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ad-campaigns", tenantId] });
      toast({ title: "Campanha publicada pausada", description: "Ela foi enviada para análise. O gasto só começa quando você clicar em Ativar." });
    },
    onError: (e: any) => toast({ title: "Erro ao publicar", description: e.message, variant: "destructive" }),
  });

  const alterarStatusCampanha = useMutation({
    mutationFn: async ({ campaignId, ativar }: { campaignId: string; ativar: boolean }) => {
      const r = await fetch(`/api/tenants/${tenantId}/ads/campaigns/${campaignId}/${ativar ? "ativar" : "pausar"}`, {
        method: "POST", headers: authHeaders(),
      });
      if (!r.ok) throw new Error((await r.json())?.error ?? "Falha ao alterar status");
      return r.json();
    },
    onSuccess: (_data, { ativar }) => {
      qc.invalidateQueries({ queryKey: ["ad-campaigns", tenantId] });
      toast({ title: ativar ? "Campanha ativada — gasto real começou" : "Campanha pausada" });
    },
    onError: (e: any) => toast({ title: "Erro ao alterar status", description: e.message, variant: "destructive" }),
  });

  const sincronizarSituacao = useMutation({
    mutationFn: async (campaignId: string) => {
      const response = await fetch(`/api/tenants/${tenantId}/ads/campaigns/${campaignId}/sync-status`, {
        method: "POST",
        headers: authHeaders(),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error ?? "Não foi possível consultar a plataforma");
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ad-campaigns", tenantId] });
      toast({ title: "Situação atualizada" });
    },
    onError: (error: any) => toast({ title: "Falha ao consultar plataforma", description: error.message, variant: "destructive" }),
  });

  const excluirCampanha = useMutation({
    mutationFn: async (campaignId: string) => {
      const r = await fetch(`/api/tenants/${tenantId}/ads/campaigns/${campaignId}`, {
        method: "DELETE", headers: authHeaders(),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? "Falha ao excluir campanha");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ad-campaigns", tenantId] });
      toast({ title: "Rascunho excluído" });
    },
    onError: (e: any) => toast({ title: "Não foi possível excluir", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Megaphone className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-semibold">Anúncios</h1>
        </div>
        <Button onClick={() => {
          setAutoGenerateAfterCreate(true);
          setSourceDraft(null);
          setForm({ ...EMPTY_FORM });
          setOpen(true);
        }}>
          <Plus className="h-4 w-4 mr-1" /> Criar campanha
        </Button>
      </div>

      {adsOverview && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
            <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Campanhas ativas</p><p className="text-xl font-bold">{adsOverview.totals.activeCampaigns}</p></CardContent></Card>
            <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Planejado</p><p className="text-xl font-bold">R$ {adsOverview.totals.plannedBudget.toFixed(2)}</p></CardContent></Card>
            <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Gasto real</p><p className="text-xl font-bold">R$ {adsOverview.totals.spend.toFixed(2)}</p></CardContent></Card>
            <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Leads</p><p className="text-xl font-bold">{adsOverview.totals.leads}</p></CardContent></Card>
            <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Vendas</p><p className="text-xl font-bold">{adsOverview.totals.sales}</p></CardContent></Card>
            <Card className={adsOverview.totals.unresolvedAlerts > 0 ? "border-amber-300 bg-amber-50" : ""}><CardContent className="p-3"><p className="text-xs text-muted-foreground">Alertas</p><p className="text-xl font-bold">{adsOverview.totals.unresolvedAlerts}</p></CardContent></Card>
          </div>
          {adsOverview.campaigns.some((item) => item.alerts.length > 0) && (
            <Card className="border-amber-200">
              <CardContent className="pt-4 space-y-2">
                <h2 className="font-semibold flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-600" />Atenção necessária</h2>
                {adsOverview.campaigns.flatMap((item) => item.alerts.map((alert) => ({ ...alert, label: item.label }))).slice(0, 8).map((alert) => (
                  <div key={alert.id} className="flex items-start justify-between gap-3 rounded-md border p-2 text-sm">
                    <div><p className="font-medium">{alert.label}</p><p className="text-xs text-muted-foreground">{alert.message}</p></div>
                    {!alert.id.startsWith("computed-") && <Button size="sm" variant="ghost" onClick={() => resolveAlert.mutate(alert.id)}>Resolvido</Button>}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <Card className="bg-muted/30">
        <CardContent className="pt-4 text-sm space-y-2">
          <p className="font-medium">Como colocar um anúncio no ar</p>
          <div className="grid gap-2 sm:grid-cols-3 py-2">
            {["1. Configurar público e oferta", "2. Gerar e aprovar", "3. Publicar pausada e ativar"].map((step) => (
              <div key={step} className="rounded-md border bg-background px-2 py-2 text-center text-xs font-medium">{step}</div>
            ))}
          </div>
          <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
            <li>Plataformas disponíveis agora: <strong>Google</strong> (Search, Shopping) e <strong>Meta</strong> (Facebook + Instagram, anúncio de imagem). TikTok e LinkedIn entram depois.</li>
            <li>Veículos, imóveis e serviços usam texto gerado por IA (Google Search) ou foto gerada por IA (Meta).</li>
            <li>Farmácia (venda livre), mercado e distribuidoras usam o feed do Google Shopping. Medicamento que exige receita nunca entra no feed.</li>
            <li>Anúncio na Meta exige Meta Ads conectado. Para veicular no Instagram, a conta profissional precisa estar vinculada à Página do Facebook acessível pela mesma conexão Meta.</li>
            <li><strong>Publicar</strong> envia a campanha em modo pausado para análise. Somente <strong>Ativar</strong> inicia o gasto real.</li>
            <li>A mídia é cobrada diretamente pelo Google ou pela Meta usando a forma de pagamento da conta do cliente.</li>
          </ul>
          {feedInfo?.configured && (
            <div className="flex items-center gap-2 pt-2">
              <span className="text-xs text-muted-foreground">Feed do Google Shopping configurado</span>
              <Button size="sm" variant="outline" className="h-7 gap-1.5" onClick={copyShoppingFeedUrl}>
                <Copy className="h-3 w-3" />
                Copiar URL protegida
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : campaigns.length === 0 ? (
        <Card><CardContent className="pt-6 text-center text-muted-foreground">Nenhuma campanha ainda. Clique em "Criar campanha" para começar.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => {
            const creative = expandedCreative[c.id] ?? c.latestCreative;
            const result = overviewByCampaign.get(c.id);
            return (
              <Card key={c.id}>
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="capitalize">{c.itemTipo}</Badge>
                        <Badge variant="outline" className="capitalize">{c.plataforma === "meta" ? "Meta" : "Google"}</Badge>
                        <Badge variant="outline" className="capitalize">{c.tipoAnuncio === "shopping" ? "Shopping" : c.tipoAnuncio === "imagem" ? "Imagem" : "Search (IA)"}</Badge>
                        <Badge variant="outline" className="capitalize">{c.modo === "unico" ? "Item único" : "Carrossel"}</Badge>
                        {c.segmentacao?.origemInstagram && <Badge className="bg-pink-100 text-pink-800">Publicação do Instagram</Badge>}
                      </div>
                      {c.itemLabel && <p className="text-sm font-medium mt-1">Divulgando: {c.itemLabel}</p>}
                      {c.segmentacao?.audiencePlan && (
                        <div className="mt-2 rounded-md border bg-muted/30 p-2 space-y-1">
                          <p className="text-xs font-semibold">Segmentação preparada para revisão</p>
                          <p className="text-xs text-muted-foreground">{c.segmentacao.audiencePlan.summary}</p>
                          {c.plataforma === "google" ? (
                            <div className="flex flex-wrap gap-1">
                              {c.segmentacao.audiencePlan.google.keywords.map((keyword) => <Badge key={keyword} variant="secondary" className="font-normal">{keyword}</Badge>)}
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {c.segmentacao.audiencePlan.meta.interestQueries.map((interest) => <Badge key={interest} variant="secondary" className="font-normal">{interest}</Badge>)}
                            </div>
                          )}
                          <p className="text-[11px] text-muted-foreground">A publicação continuará pausada. Revise este plano antes de publicar e ativar.</p>
                        </div>
                      )}
                      <p className="text-sm text-muted-foreground mt-1">Orçamento diário: R$ {c.orcamentoDiario}</p>
                      {c.utmCode && <p className="text-xs text-muted-foreground">Código de atribuição: <code className="bg-muted px-1 rounded">{c.utmCode}</code></p>}
                      {c.itemTipo === "veiculo" && c.modo === "unico" && <p className="text-xs text-muted-foreground">Reserva automática: {c.pausarAoInteresse ? "pausa o patrocínio" : "não pausa"} · SLA {c.slaNegociacaoHoras}h</p>}
                      {c.segmentacao?.platformReview && (
                        <div className={`mt-2 rounded-md border p-2 ${
                          c.segmentacao.platformReview.status === "reprovada" || c.segmentacao.platformReview.status === "erro_pagamento" || c.segmentacao.platformReview.status === "erro_conta"
                            ? "border-red-200 bg-red-50"
                            : c.segmentacao.platformReview.status === "aprovada" || c.segmentacao.platformReview.status === "aprovada_limitada"
                              ? "border-green-200 bg-green-50"
                              : "border-amber-200 bg-amber-50"
                        }`}>
                          <p className="text-xs font-semibold">
                            {c.segmentacao.platformReview.status === "em_analise" ? "Em análise pela plataforma"
                              : c.segmentacao.platformReview.status === "aprovada" ? "Aprovada pela plataforma"
                              : c.segmentacao.platformReview.status === "aprovada_limitada" ? "Aprovada com limitações"
                              : c.segmentacao.platformReview.status === "reprovada" ? "Reprovada pela plataforma"
                              : c.segmentacao.platformReview.status === "erro_pagamento" ? "Problema no pagamento da mídia"
                              : "Problema na conta de anúncios"}
                          </p>
                          {c.segmentacao.platformReview.reason && <p className="text-xs mt-1">{c.segmentacao.platformReview.reason}</p>}
                          {c.segmentacao.platformReview.status === "reprovada" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="mt-2"
                              disabled={corrigirReprovada.isPending}
                              onClick={() => corrigirReprovada.mutate(c.id)}
                            >
                              {corrigirReprovada.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
                              Corrigir com IA
                            </Button>
                          )}
                          {c.segmentacao.platformReview.policyTopics && c.segmentacao.platformReview.policyTopics.length > 0 && (
                            <p className="text-[11px] mt-1">Políticas: {c.segmentacao.platformReview.policyTopics.join(", ")}</p>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={STATUS_COLOR[c.status] ?? ""}>{STATUS_LABEL[c.status] ?? c.status}</Badge>
                      <Button size="sm" variant="ghost" className="h-8" onClick={() => setHistoryCampaignId(c.id)}>
                        <Eye className="h-3.5 w-3.5 mr-1" /> Histórico
                      </Button>
                      {!c.externalCampaignId && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          title="Excluir rascunho"
                          disabled={excluirCampanha.isPending}
                          onClick={() => {
                            if (window.confirm("Excluir este rascunho e seus criativos? Esta ação não pode ser desfeita.")) excluirCampanha.mutate(c.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {result && (
                    <div className="rounded-lg border bg-background p-3 space-y-3">
                      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 text-center">
                        <div><p className="text-[11px] text-muted-foreground">Gasto</p><p className="text-sm font-semibold">R$ {result.spend.toFixed(2)}</p></div>
                        <div><p className="text-[11px] text-muted-foreground">Impressões</p><p className="text-sm font-semibold">{result.impressions}</p></div>
                        <div><p className="text-[11px] text-muted-foreground">Cliques</p><p className="text-sm font-semibold">{result.clicks}</p></div>
                        <div><p className="text-[11px] text-muted-foreground">Leads</p><p className="text-sm font-semibold">{result.leads}</p></div>
                        <div><p className="text-[11px] text-muted-foreground">Custo/lead</p><p className="text-sm font-semibold">{result.costPerLead == null ? "—" : `R$ ${result.costPerLead.toFixed(2)}`}</p></div>
                        <div><p className="text-[11px] text-muted-foreground">Vendas</p><p className="text-sm font-semibold">{result.sales}</p></div>
                        <div><p className="text-[11px] text-muted-foreground">Receita</p><p className="text-sm font-semibold">R$ {result.revenue.toFixed(2)}</p></div>
                        <div><p className="text-[11px] text-muted-foreground">ROAS</p><p className="text-sm font-semibold">{result.roas == null ? "—" : `${result.roas.toFixed(2)}x`}</p></div>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {result.daysRemaining != null && <Badge variant="outline">{result.daysRemaining} dia(s) restante(s)</Badge>}
                        <Badge variant="outline">Limite R$ {result.plannedBudget.toFixed(2)}</Badge>
                      </div>
                      {result.recommendation && (
                        <div className="rounded-md border border-blue-200 bg-blue-50 p-2">
                          <p className="text-xs font-semibold flex items-center gap-1"><Sparkles className="h-3.5 w-3.5" />Recomendação do VendorAI: {result.recommendation.title}</p>
                          <p className="text-xs text-muted-foreground mt-1">{result.recommendation.reason}</p>
                          {result.recommendation.requiresApproval && <p className="text-[11px] font-medium mt-1">Qualquer mudança de prazo ou orçamento exigirá sua confirmação.</p>}
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-2"
                            disabled={prepararRecomendacao.isPending || corrigirReprovada.isPending}
                            onClick={() => {
                              if (result.recommendation?.action === "correct_creative") {
                                corrigirReprovada.mutate(c.id);
                                return;
                              }
                              if (result.recommendation?.requiresApproval && !window.confirm("Preparar uma nova versão para sua revisão? Nenhum gasto será alterado ou ativado agora.")) return;
                              prepararRecomendacao.mutate({ campaignId: c.id, action: result.recommendation!.action });
                            }}
                          >
                            {(prepararRecomendacao.isPending || corrigirReprovada.isPending) && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                            {result.recommendation.action === "correct_creative" ? "Preparar correção" : "Aplicar em novo rascunho"}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {(c.tipoAnuncio === "rsa_pmax" || c.tipoAnuncio === "imagem") && (
                    <div className="space-y-2">
                      {!creative ? (
                        <Button size="sm" variant="secondary" disabled={gerarCriativo.isPending}
                          onClick={() => gerarCriativo.mutate(c.id)}>
                          {gerarCriativo.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
                          Gerar criativo
                        </Button>
                      ) : (
                        <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
                          {c.tipoAnuncio === "imagem" && creative.imagens[0] && (
                            <img src={creative.imagens[0]} alt="Criativo gerado" className="rounded-md w-full max-w-xs border border-border" />
                          )}
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1">{c.tipoAnuncio === "imagem" ? "Título + texto principal" : `Títulos (${creative.headlines.length})`}</p>
                            <div className="flex flex-wrap gap-1">
                              {creative.headlines.map((h, i) => <Badge key={i} variant="secondary" className="font-normal">{h}</Badge>)}
                            </div>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1">Descrições ({creative.descriptions.length})</p>
                            <div className="space-y-1">
                              {creative.descriptions.map((d, i) => <p key={i} className="text-sm">{d}</p>)}
                            </div>
                          </div>
                          <div className="flex gap-2 pt-1">
                            {creative.status === "aprovado" ? (
                              <Badge className="bg-green-100 text-green-800"><Check className="h-3 w-3 mr-1" /> Aprovado</Badge>
                            ) : (
                              <Button size="sm" onClick={() => aprovarCriativo.mutate(creative.id)} disabled={aprovarCriativo.isPending}>
                                {aprovarCriativo.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
                                Aprovar criativo
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" onClick={() => gerarCriativo.mutate(c.id)} disabled={gerarCriativo.isPending}>
                              Gerar de novo
                            </Button>
                          </div>

                          <div className="border-t pt-2 mt-1">
                            {!c.externalCampaignId ? (
                              <Button size="sm" onClick={() => {
                                if (window.confirm(`Publicar esta campanha em modo pausado? Nenhum gasto começa agora. Depois da publicação, use Ativar quando quiser iniciar a veiculação de até R$ ${c.orcamentoDiario} por dia.`)) {
                                  publicarCampanha.mutate(c.id);
                                }
                              }} disabled={publicarCampanha.isPending || creative.status !== "aprovado"}>
                                {publicarCampanha.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Megaphone className="h-4 w-4 mr-1" />}
                                Publicar no {c.plataforma === "meta" ? "Meta Ads" : "Google Ads"}
                              </Button>
                            ) : (
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-xs text-muted-foreground">Publicada na conta {c.plataforma === "meta" ? "Meta Ads" : "Google Ads"} (ID {c.externalCampaignId}).</p>
                                <Button size="sm" variant="ghost" onClick={() => sincronizarSituacao.mutate(c.id)} disabled={sincronizarSituacao.isPending}>
                                  {sincronizarSituacao.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
                                  Atualizar análise
                                </Button>
                                {c.status === "ativo" ? (
                                  <Button size="sm" variant="outline" onClick={() => alterarStatusCampanha.mutate({ campaignId: c.id, ativar: false })} disabled={alterarStatusCampanha.isPending}>
                                    Pausar
                                  </Button>
                                ) : (
                                  <Button size="sm" onClick={() => {
                                    if (window.confirm(`Ativar esta campanha agora? O gasto real de até R$ ${c.orcamentoDiario} por dia começará na plataforma.`)) {
                                      alterarStatusCampanha.mutate({ campaignId: c.id, ativar: true });
                                    }
                                  }} disabled={alterarStatusCampanha.isPending}>
                                    {alterarStatusCampanha.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                                    Ativar (liga o gasto real)
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {c.tipoAnuncio === "shopping" && (
                    <p className="text-xs text-muted-foreground">Este item entra automaticamente no feed do Shopping acima — não precisa de criativo gerado à parte.</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {reservations.some((r) => r.status === "em_negociacao" || r.status === "justificativa_pendente") && (
        <Card><CardContent className="pt-4 space-y-3"><h2 className="font-semibold">Reservas de veículos em negociação</h2>
          {reservations.filter((r) => r.status === "em_negociacao" || r.status === "justificativa_pendente").map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 border rounded-lg p-3">
              <div className="text-sm"><p className="font-medium">Negócio {r.dealId}</p><p className="text-muted-foreground">Prazo: {new Date(r.justificationDueAt).toLocaleString("pt-BR")}</p></div>
              <Button size="sm" variant={r.status === "justificativa_pendente" ? "default" : "outline"} onClick={() => setReservationDecision(r)}>{r.status === "justificativa_pendente" ? "Justificar agora" : "Atualizar negociação"}</Button>
            </div>
          ))}
        </CardContent></Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nova campanha</DialogTitle></DialogHeader>
          <TooltipProvider delayDuration={300}>
          <div className="space-y-4">
            {sourceDraft && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
                <div className="flex items-center gap-2 font-medium"><Sparkles className="h-4 w-4 text-primary" />Conteúdo do Marketing carregado</div>
                <p className="text-xs text-muted-foreground mt-1">{sourceDraft.theme} · variação {sourceDraft.variationIndex + 1}. O texto e a mídia escolhidos serão salvos como o primeiro criativo da campanha.</p>
              </div>
            )}
            <MarketingContextSelector tenantId={tenantId} value={marketingContext} onChange={setMarketingContext} />

            <div>
              <LabelTip tip="Onde o anúncio vai rodar. Meta cobre Facebook e Instagram juntos.">Plataforma</LabelTip>
              <Select value={form.plataforma} onValueChange={(v) => setForm((f) => ({
                ...f,
                plataforma: v as "google" | "meta",
                tipoAnuncio: v === "meta" ? "imagem" : "rsa_pmax",
                instagramConnectionId: v === "meta" ? (f.instagramConnectionId || defaultInstagramConnectionId) : "",
              }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="google">Google (Search, Shopping)</SelectItem>
                  <SelectItem value="meta">Meta (Facebook + Instagram — anúncio de imagem)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.plataforma === "meta" && instagramAccounts.length > 0 && (
              <div>
                <LabelTip tip="Define qual conta profissional do Instagram será usada como identidade do anúncio e para localizar publicações que serão patrocinadas.">
                  Instagram da campanha
                </LabelTip>
                <Select
                  value={form.instagramConnectionId || defaultInstagramConnectionId}
                  onValueChange={(value) => setForm((current) => ({ ...current, instagramConnectionId: value }))}
                >
                  <SelectTrigger><SelectValue placeholder="Escolha a conta do Instagram" /></SelectTrigger>
                  <SelectContent>
                    {instagramAccounts.map((account, index) => (
                      <SelectItem key={account.id} value={account.id}>
                        @{account.username || "instagram"}{index === 0 ? " · principal" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">
                  O anúncio será vinculado à Página/identidade Meta correspondente a esta conta.
                </p>
              </div>
            )}

            <div>
              <LabelTip tip="Sobre o que é o anúncio: veículo do estoque, imóvel, produto do catálogo, uma landing page gerada, ou livre (sem vínculo com item específico — institucional, campanha de marca).">Tipo de item</LabelTip>
              <Select value={form.itemTipo} onValueChange={(v) => {
                const itemTipo = v as ItemTipo;
                const destinoClique: DestinoClique = itemTipo === "landing_page" ? "landing_page" : itemTipo === "livre" ? "whatsapp" : "produto";
                setSourceDraft(null);
                setForm((f) => ({ ...f, itemTipo, itemId: "", itemLabel: "", destinoClique, contentGenerationId: "" }));
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="veiculo">Veículo</SelectItem>
                  <SelectItem value="imovel">Imóvel</SelectItem>
                  <SelectItem value="produto">Produto (catálogo)</SelectItem>
                  <SelectItem value="landing_page">Landing Page (gerada)</SelectItem>
                  <SelectItem value="livre">Livre (institucional/marca)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <LabelTip tip="Search: texto gerado por IA, aparece na busca do Google. Google Shopping: foto + preço, feed direto do catálogo. Imagem: usa foto gerada por IA, roda no Feed do Facebook/Instagram.">Tipo de anúncio</LabelTip>
              <Select value={form.tipoAnuncio} onValueChange={(v) => setForm((f) => ({ ...f, tipoAnuncio: v as TipoAnuncio }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {form.plataforma === "google" ? (
                    <>
                      <SelectItem value="rsa_pmax">Google Search (texto gerado por IA)</SelectItem>
                      <SelectItem value="shopping">Google Shopping (feed de produto)</SelectItem>
                      <SelectItem value="pmax_future" disabled>Performance Max completa — em implantação</SelectItem>
                    </>
                  ) : (
                    <>
                      <SelectItem value="imagem">Imagem (Feed Facebook/Instagram)</SelectItem>
                      <SelectItem value="meta_carousel_future" disabled>Carrossel Meta — em implantação</SelectItem>
                      <SelectItem value="meta_stories_future" disabled>Stories nativo — em implantação</SelectItem>
                      <SelectItem value="meta_reels_future" disabled>Reels / vídeo novo — em implantação</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
              {form.plataforma === "meta" && (
                <p className="text-xs text-muted-foreground mt-1">Imagem é o formato publicável agora. Carrossel, Stories e Reels/vídeo estão visíveis como próximos formatos, mas bloqueados até a integração real ficar pronta.</p>
              )}
            </div>

            {form.itemTipo !== "livre" && form.plataforma === "google" && (
              <div>
                <LabelTip tip="Um único item ou vários de uma vez (ex: toda uma categoria do estoque).">Modo</LabelTip>
                <Select value={form.modo} onValueChange={(v) => setForm((f) => ({ ...f, modo: v as Modo }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unico">Só este item</SelectItem>
                    <SelectItem value="carrossel">Carrossel (este + sugestões relacionadas)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {form.itemTipo === "livre" ? (
              <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                <LabelTip tip="Explique em uma frase o produto, serviço, oferta ou mensagem que a IA deve transformar em anúncio.">O que você quer anunciar?</LabelTip>
                <Input placeholder="Ex: orçamento gratuito de esquadrias de PVC para casas de alto padrão" value={form.itemLabel} onChange={(e) => setForm((f) => ({ ...f, itemLabel: e.target.value }))} />
                <p className="text-xs text-muted-foreground">A IA combina esta orientação com o perfil real do negócio para gerar texto e imagem.</p>
              </div>
            ) : form.modo === "unico" ? (
              <div>
                <LabelTip tip={form.itemTipo === "landing_page" ? "Escolhe qual landing page gerada esse anúncio divulga." : "Encontra o item específico que o anúncio vai divulgar."}>
                  {form.itemTipo === "landing_page" ? "Landing page a divulgar" : "Buscar item"}
                </LabelTip>
                <div className="relative">
                  <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
                  <Input
                    className="pl-8"
                    placeholder={form.itemTipo === "landing_page" ? "Clique pra ver a lista..." : "Digite pra buscar..."}
                    value={itemSearch}
                    onChange={(e) => setItemSearch(e.target.value)}
                    onFocus={() => setItemListaAberta(true)}
                    onBlur={() => setTimeout(() => setItemListaAberta(false), 150)}
                  />
                </div>
                {form.itemId && <p className="text-xs text-muted-foreground mt-1">Selecionado: {form.itemLabel}</p>}
                {(itemListaAberta || itemSearch) && (
                  <div className="border rounded-md mt-1 max-h-40 overflow-y-auto">
                    {itensFiltrados.map((it) => (
                      <button key={it.id} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => { setForm((f) => ({ ...f, itemId: it.id, itemLabel: it.label, imagemEscolhidaUrl: "" })); setItemSearch(""); setItemListaAberta(false); }}>
                        {it.label}
                      </button>
                    ))}
                    {itensFiltrados.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">{form.itemTipo === "landing_page" ? "Nenhuma landing page gerada ainda" : "Nada encontrado"}</p>}
                  </div>
                )}
              </div>
            ) : (
              <div>
                <Label>Categoria/segmento pra puxar sugestões</Label>
                <Input placeholder="Ex: SUV, Farmácia > Higiene" value={form.categoriaFiltro} onChange={(e) => setForm((f) => ({ ...f, categoriaFiltro: e.target.value }))} />
              </div>
            )}

            {form.tipoAnuncio === "imagem" && form.itemTipo !== "livre" && form.modo === "unico" && form.itemId && (() => {
              const itemAtual = itensDisponiveis.find((i) => i.id === form.itemId);
              const fotosReais = itemAtual?.imagens ?? [];
              return (
                <div className="border-t pt-4 space-y-2">
                  <LabelTip tip="Escolha entre a IA criar uma nova imagem publicitária ou preservar uma foto real do item. Nos dois casos, a IA também melhora títulos, texto principal e descrição.">Imagem e texto do anúncio</LabelTip>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => setForm((f) => ({ ...f, imagemEscolhidaUrl: "" }))}
                      className={`flex flex-col items-center justify-center gap-1 h-20 w-20 rounded-lg border-2 text-[10px] text-center px-1 ${!form.imagemEscolhidaUrl ? "border-primary bg-primary/5 text-primary" : "border-dashed border-muted-foreground/40 text-muted-foreground"}`}>
                      <Sparkles className="h-4 w-4" />
                      Criar nova com IA
                    </button>
                    {fotosReais.length === 0 ? (
                      <p className="text-xs text-muted-foreground self-center">Esse item ainda não tem fotos próprias cadastradas.</p>
                    ) : fotosReais.map((url) => (
                      <button key={url} type="button" onClick={() => setForm((f) => ({ ...f, imagemEscolhidaUrl: url }))}
                        className={`h-20 w-20 rounded-lg border-2 overflow-hidden shrink-0 ${form.imagemEscolhidaUrl === url ? "border-primary" : "border-transparent"}`}>
                        <img src={url} alt="" className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}

            <div>
              <LabelTip tip="Pra onde vai quem clica no anúncio.">Destino do clique</LabelTip>
              <Select value={form.destinoClique} onValueChange={(v) => setForm((f) => ({ ...f, destinoClique: v as DestinoClique }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="produto">Página do produto/estoque</SelectItem>
                  <SelectItem value="landing_page">Landing Page gerada</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp (clique-pra-conversar)</SelectItem>
                  <SelectItem value="formulario_lead">Formulário de lead nativo</SelectItem>
                </SelectContent>
              </Select>
              {form.destinoClique === "whatsapp" && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Padrão Vendor.ai: o anúncio abre o número definido para entrada de anúncios e prepara a mensagem para o lead enviar.
                </p>
              )}
            </div>

            <div>
              <LabelTip tip="Teto de gasto por dia. Pode pausar ou mudar a qualquer momento.">Orçamento diário (R$)</LabelTip>
              <Input type="number" step="0.01" placeholder="50.00" value={form.orcamentoDiario} onChange={(e) => setForm((f) => ({ ...f, orcamentoDiario: e.target.value }))} />
            </div>

            {form.itemTipo === "veiculo" && form.modo === "unico" && (
              <div className="rounded-lg border bg-amber-50 p-4 space-y-3">
                <h3 className="font-semibold">Veículo único</h3>
                <div className="flex items-center gap-1.5">
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.pausarAoInteresse} onChange={(e) => setForm((f) => ({ ...f, pausarAoInteresse: e.target.checked }))} /> Pausar o patrocínio quando o lead confirmar interesse</label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="text-muted-foreground hover:text-foreground" tabIndex={-1}><HelpCircle className="h-3.5 w-3.5" /></button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[280px] text-sm">Pausa sozinho assim que alguém demonstra interesse real, evitando gastar anunciando um item já em negociação.</TooltipContent>
                  </Tooltip>
                </div>
                <div><LabelTip tip="Tempo que o vendedor tem pra dar retorno antes do sistema cobrar atualização.">Prazo do vendedor para atualizar (horas)</LabelTip><Input type="number" min="1" max="720" value={form.slaNegociacaoHoras} onChange={(e) => setForm((f) => ({ ...f, slaNegociacaoHoras: e.target.value }))} /></div>
                <p className="text-xs text-muted-foreground">Ao vencer, o negócio fica bloqueado até o vendedor justificar manter, avançar ou perder.</p>
              </div>
            )}

            <div className="border-t pt-4 space-y-4">
              <div>
                <h3 className="font-semibold">Objetivo, período e limite total</h3>
                <p className="text-xs text-muted-foreground">Essas escolhas definem como o anúncio será medido e impedem que ele fique rodando sem prazo.</p>
              </div>
              <div>
                <LabelTip tip="Escolha o resultado que você espera, não apenas o tipo de anúncio.">O que deve acontecer?</LabelTip>
                <Select value={form.objective} onValueChange={(v) => setForm((f) => ({ ...f, objective: v as typeof f.objective, conversionMode: v === "awareness" ? "clicks" : "vendorai" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whatsapp">Receber conversas no WhatsApp</SelectItem>
                    <SelectItem value="lead">Receber cadastros de interessados</SelectItem>
                    <SelectItem value="sale">Gerar vendas</SelectItem>
                    <SelectItem value="visit">Agendar visita ou atendimento</SelectItem>
                    <SelectItem value="awareness">Divulgar a marca</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><Label>Começa em</Label><Input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} /></div>
                <div><Label>Termina em</Label><Input type="date" min={form.startDate} value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} /></div>
              </div>
              <div className="rounded-lg border bg-primary/5 p-3 text-sm">
                <p><strong>{campaignDays(form.startDate, form.endDate)} dias</strong> · até <strong>R$ {Number(form.orcamentoDiario || 0).toFixed(2)}/dia</strong></p>
                <p className="text-base mt-1">Limite planejado: <strong>R$ {(Number(form.orcamentoDiario || 0) * campaignDays(form.startDate, form.endDate)).toFixed(2)}</strong></p>
                <p className="text-xs text-muted-foreground mt-1">O VendorAI nunca aumenta o orçamento automaticamente.</p>
              </div>
              <div>
                <LabelTip tip="Habitação, emprego, crédito e política possuem restrições obrigatórias nas plataformas.">Este anúncio pertence a uma categoria especial?</LabelTip>
                <Select value={form.specialAdCategory} onValueChange={(v) => setForm((f) => ({ ...f, specialAdCategory: v as typeof f.specialAdCategory, idades: v === "NONE" ? f.idades : [], generos: v === "NONE" ? f.generos : [], rendas: v === "NONE" ? f.rendas : [] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">Não</SelectItem>
                    <SelectItem value="HOUSING">Habitação — imóveis, locação ou financiamento habitacional</SelectItem>
                    <SelectItem value="EMPLOYMENT">Emprego — vagas e recrutamento</SelectItem>
                    <SelectItem value="CREDIT">Crédito — empréstimo, cartão ou financiamento</SelectItem>
                    <SelectItem value="ISSUES_ELECTIONS_POLITICS">Política, eleição ou tema social</SelectItem>
                  </SelectContent>
                </Select>
                {form.specialAdCategory !== "NONE" && <p className="text-xs text-amber-700 mt-1">Filtros de idade, gênero e renda serão removidos para respeitar as regras da plataforma.</p>}
              </div>
              <div>
                <LabelTip tip="O VendorAI consegue ligar contatos recebidos à campanha usando o código da própria campanha.">Como medir o resultado?</LabelTip>
                <Select value={form.conversionMode} onValueChange={(v) => setForm((f) => ({ ...f, conversionMode: v as typeof f.conversionMode, conversionConfirmed: v !== "platform" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vendorai">Contatos e negócios registrados no VendorAI</SelectItem>
                    <SelectItem value="platform">Conversão já instalada no Google/Meta</SelectItem>
                    <SelectItem value="clicks" disabled={form.objective !== "awareness"}>Somente cliques (apenas divulgação de marca)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.conversionMode === "platform" && (
                <label className="flex items-start gap-2 text-sm rounded-lg border p-3">
                  <input type="checkbox" className="mt-1" checked={form.conversionConfirmed} onChange={(e) => setForm((f) => ({ ...f, conversionConfirmed: e.target.checked }))} />
                  Confirmo que a conversão foi instalada e testada na conta de anúncios.
                </label>
              )}
              <label className="flex items-start gap-2 text-sm rounded-lg border p-3">
                <input type="checkbox" className="mt-1" checked={form.autoPauseNoResults} onChange={(e) => setForm((f) => ({ ...f, autoPauseNoResults: e.target.checked }))} />
                <span><strong>Pausar se gastar sem gerar resultado</strong><span className="block text-xs text-muted-foreground">O sistema poderá reduzir desperdício, mas nunca aumentar o orçamento.</span></span>
              </label>
              {form.autoPauseNoResults && <div><Label>Limite gasto sem resultado (R$)</Label><Input type="number" min="1" placeholder="Ex: 150" value={form.spendWithoutResultLimit} onChange={(e) => setForm((f) => ({ ...f, spendWithoutResultLimit: e.target.value }))} /></div>}
            </div>

            <div className="border-t pt-4 space-y-4">
              <div><h3 className="font-semibold">Localização obrigatória</h3><p className="text-xs text-muted-foreground">Informe cidades, estados ou CEPs separados por vírgula. O sistema bloqueia campanhas sem uma região reconhecida para evitar anunciar para o Brasil inteiro.</p></div>
              <Input placeholder="Ex: Curitiba, Paraná, 80000-000" value={form.locais} onChange={(e) => setForm((f) => ({ ...f, locais: e.target.value }))} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><LabelTip tip="Pra quem está fisicamente na região agora vs. quem só demonstra interesse nela.">Intenção de local / presença</LabelTip><Select value={form.tipoPresenca} onValueChange={(v) => setForm((f) => ({ ...f, tipoPresenca: v as typeof f.tipoPresenca }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="presenca">Pessoas presentes na região</SelectItem><SelectItem value="interesse">Pessoas interessadas na região</SelectItem><SelectItem value="ambos">Presença ou interesse</SelectItem></SelectContent></Select></div>
                <div><LabelTip tip="Raio em km ao redor do endereço informado.">Raio em torno do endereço (km)</LabelTip><Input type="number" min="1" placeholder="Ex: 30" value={form.raioKm} onChange={(e) => setForm((f) => ({ ...f, raioKm: e.target.value }))} /></div>
              </div>
            </div>

            <CollapsibleSection
              title="Perfil demográfico"
              hint="Opcional — pode ficar em branco sem problema. Clique nas opções pra adicionar."
              count={form.idades.length + form.generos.length + form.statusParental.length + form.rendas.length}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><LabelTip tip="Faixas etárias do público.">Faixas de idade</LabelTip><MultiSelectChips value={form.idades} onChange={(v) => setForm((f) => ({ ...f, idades: v }))} options={OPCOES_IDADE} /></div>
                <div><Label>Gêneros</Label><MultiSelectChips value={form.generos} onChange={(v) => setForm((f) => ({ ...f, generos: v }))} options={OPCOES_GENERO} /></div>
                <div><Label>Status parental</Label><MultiSelectChips value={form.statusParental} onChange={(v) => setForm((f) => ({ ...f, statusParental: v }))} options={OPCOES_STATUS_PARENTAL} /></div>
                <div><Label>Renda familiar</Label><MultiSelectChips value={form.rendas} onChange={(v) => setForm((f) => ({ ...f, rendas: v }))} options={OPCOES_RENDA} /></div>
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              title="Comportamento e intenção de compra"
              hint="Opcional, mais avançado. Digite um termo e pressione Enter pra adicionar."
              count={form.afinidade.length + form.noMercado.length + form.termosPesquisa.length + form.sites.length + form.aplicativos.length}
            >
              <div><LabelTip tip="Interesse de longo prazo, estilo de vida (ex: entusiastas de automóveis) — diferente de In-market, que é pesquisa ativa de compra agora.">Afinidade</LabelTip><MultiSelectChips value={form.afinidade} onChange={(v) => setForm((f) => ({ ...f, afinidade: v }))} placeholder="Ex: Entusiastas de automóveis" /></div>
              <div><LabelTip tip="Pesquisa ativa de compra agora — diferente de Afinidade, que é interesse de longo prazo.">No mercado (In-market)</LabelTip><MultiSelectChips value={form.noMercado} onChange={(v) => setForm((f) => ({ ...f, noMercado: v }))} placeholder="Ex: Compra de veículos" /></div>
              <div><Label>Termos de pesquisa personalizados</Label><MultiSelectChips value={form.termosPesquisa} onChange={(v) => setForm((f) => ({ ...f, termosPesquisa: v }))} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><div><Label>Sites visitados</Label><MultiSelectChips value={form.sites} onChange={(v) => setForm((f) => ({ ...f, sites: v }))} placeholder="exemplo.com.br" /></div><div><Label>Aplicativos utilizados</Label><MultiSelectChips value={form.aplicativos} onChange={(v) => setForm((f) => ({ ...f, aplicativos: v }))} /></div></div>
            </CollapsibleSection>

            <CollapsibleSection
              title="Rastreamento e dados próprios"
              hint="100% opcional. Só serve se você já tem listas de público criadas dentro do próprio Google Ads (Ferramentas → Gerenciador de públicos). Nunca mexeu nisso? Pode pular essa seção inteira e deixar em branco — não afeta o resto da campanha."
              count={form.remarketing.length + form.customerMatch.length + form.semelhantes.length}
            >
              <a href="https://ads.google.com/aw/audiences" target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline underline-offset-2 block -mt-1">
                Abrir o Gerenciador de públicos do Google Ads (cria as listas por lá)
              </a>
              <div><LabelTip tip="Uma lista de gente que já visitou seu site mas não comprou, criada dentro do próprio Google Ads (não aqui). Se você já tem uma configurada lá, digita o nome dela pra focar o anúncio nessas pessoas.">Remarketing</LabelTip><MultiSelectChips value={form.remarketing} onChange={(v) => setForm((f) => ({ ...f, remarketing: v }))} placeholder="Visitantes do site, YouTube..." /></div>
              <div><LabelTip tip="Uma lista de e-mails/telefones dos seus clientes, subida diretamente no Google Ads (Ferramentas → Gerenciador de públicos → Segmento personalizado). Aqui você só digita o NOME que deu pra essa lista lá — os dados dos clientes nunca passam por este formulário.">Customer Match</LabelTip><MultiSelectChips value={form.customerMatch} onChange={(v) => setForm((f) => ({ ...f, customerMatch: v }))} placeholder="Nome ou ID da lista" /></div>
              <div><LabelTip tip="A partir de uma das listas acima (Remarketing ou Customer Match), o Google Ads acha sozinho outras pessoas com perfil parecido. Só funciona se você já tiver uma lista de origem configurada — coloque o nome dela aqui.">Públicos semelhantes</LabelTip><MultiSelectChips value={form.semelhantes} onChange={(v) => setForm((f) => ({ ...f, semelhantes: v }))} placeholder="Nome ou ID da lista de origem" /></div>
            </CollapsibleSection>

            <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
              <div className="flex items-start gap-2">
                <input
                  id="ads-auto-creative"
                  type="checkbox"
                  className="mt-1"
                  checked={autoGenerateAfterCreate}
                  onChange={(e) => setAutoGenerateAfterCreate(e.target.checked)}
                />
                <label htmlFor="ads-auto-creative" className="text-sm">
                  <span className="font-medium">Gerar o criativo automaticamente com IA</span>
                  <span className="block text-xs text-muted-foreground">
                    {form.plataforma === "meta"
                      ? form.imagemEscolhidaUrl
                        ? "Preserva a foto real escolhida e usa IA para melhorar título, texto principal e descrição."
                        : "Usa IA para criar uma nova imagem publicitária e melhorar título, texto principal e descrição."
                      : form.tipoAnuncio === "shopping"
                        ? "O Shopping usa automaticamente foto, título e preço do catálogo."
                        : "Gera títulos e descrições para o anúncio do Google Search."}
                  </span>
                </label>
              </div>
              {form.plataforma === "meta" && form.itemTipo === "livre" && (
                <p className="text-xs text-muted-foreground">
                  Para usar uma publicação pronta, abra Marketing → Gerador, escolha o conteúdo e clique em “Patrocinar este conteúdo”.
                </p>
              )}
            </div>

            <Button className="w-full" disabled={criarCampanha.isPending || !form.orcamentoDiario || campaignDays(form.startDate, form.endDate) < 1 || (form.conversionMode === "platform" && !form.conversionConfirmed) || !form.locais.trim() || !marketingContext.nicheId || marketingContext.productIds.length === 0 || (form.plataforma === "meta" && instagramAccounts.length > 1 && !(form.instagramConnectionId || defaultInstagramConnectionId)) || (form.modo === "unico" && form.itemTipo !== "livre" && !form.itemId)}
              onClick={() => criarCampanha.mutate()}>
              {criarCampanha.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Criar campanha (rascunho)
            </Button>
            <p className="text-xs text-muted-foreground text-center -mt-2">Nada publica nem cobra ainda — só vai ao ar depois de revisão e confirmação.</p>
          </div>
          </TooltipProvider>
        </DialogContent>
      </Dialog>
      <Dialog open={!!historyCampaignId} onOpenChange={(value) => !value && setHistoryCampaignId(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Histórico da campanha</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {campaignHistory.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma ação registrada ainda.</p> : campaignHistory.map((event) => (
              <div key={event.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline">{event.eventType.replaceAll("_", " ")}</Badge>
                  <span className="text-[11px] text-muted-foreground">{new Date(event.createdAt).toLocaleString("pt-BR")}</span>
                </div>
                <p className="text-sm mt-2">{event.message}</p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!reservationDecision} onOpenChange={(value) => !value && setReservationDecision(null)}>
        <DialogContent><DialogHeader><DialogTitle>Atualizar negociação do veículo</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Decisão</Label><Select value={decision} onValueChange={(v) => setDecision(v as typeof decision)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="manter">Manter nesta etapa por mais 48h</SelectItem><SelectItem value="avancar">Avançar para proposta</SelectItem><SelectItem value="perdido">Marcar como perdido e liberar veículo</SelectItem></SelectContent></Select></div>
            <div><Label>Justificativa obrigatória</Label><Textarea value={justification} onChange={(e) => setJustification(e.target.value)} placeholder="Descreva o contato, o retorno do cliente e o próximo passo..." /></div>
            <Button className="w-full" disabled={justification.trim().length < 10 || decidirReserva.isPending} onClick={() => decidirReserva.mutate()}>Registrar decisão</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
