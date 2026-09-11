import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Flame,
  Globe2,
  Layers3,
  MapPin,
  Megaphone,
  MonitorSmartphone,
  MousePointerClick,
  Radio,
  RefreshCw,
  Repeat2,
  Search,
  Smartphone,
  Target,
  UserRound,
  Users,
} from "lucide-react";

const API_BASE = import.meta.env.PROD ? "/api" : (import.meta.env.VITE_API_URL || "/api");

type VisitorSurface = "site" | "app" | "mobile" | "unknown";
type CommercialStatus = "all" | "hot" | "returning" | "identified" | "remarketing";

type PageEngagement = {
  path: string;
  views: number;
  engagedMs: number;
  maxScrollDepth: number;
};

type ClickSignal = {
  label: string;
  href: string | null;
  path: string | null;
  at: string | null;
};

type CampaignHistory = {
  kind: "crm" | "paid";
  id: string;
  name: string;
  status: string;
  channel: string | null;
  firstInteractionAt: string | null;
  lastInteractionAt: string | null;
  converted: boolean;
};

type RecommendedMaterial = {
  id: string;
  title: string;
  category: string;
  tags: string[];
};

type CommercialProfile = {
  profileKey: string;
  leadId: string | null;
  userId: string | null;
  visitorId: string | null;
  sessionId: string;
  identity: {
    displayName: string | null;
    email: string | null;
    phone: string | null;
    company: string | null;
    source: "lead" | "user" | null;
  };
  identified: boolean;
  surface: VisitorSurface;
  online: boolean;
  sessionsCount: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  currentPath: string | null;
  sourceLabel: string | null;
  campaign: string | null;
  geo: { country: string | null; region: string | null; city: string | null };
  device: { type: string | null; browser: string | null; os: string | null };
  totalDurationMs: number;
  pageViews: number;
  ctaClicks: number;
  conversions: number;
  pricingViews: number;
  formStarts: number;
  formSubmits: number;
  commercialScore: number;
  commercialStage: "descoberta" | "aquecimento" | "quente" | "oportunidade";
  hotOpportunity: boolean;
  commercialReading: string;
  recommendedAction: string;
  audienceTags: string[];
  remarketingEligible: boolean;
  pageEngagement: PageEngagement[];
  clicks: ClickSignal[];
  campaignHistory: CampaignHistory[];
  recommendedMaterials: RecommendedMaterial[];
};

type VisitorResponse = {
  generatedAt: string;
  truncated: boolean;
  totals: {
    onlineNow: number;
    uniqueVisitors: number;
    identified: number;
  };
  commercial: {
    hotProfiles: number;
    returningProfiles: number;
    pricingProfiles: number;
    ctaProfiles: number;
    formAbandoners: number;
    remarketingEligible: number;
    identifiedProfiles: number;
  };
  profiles: CommercialProfile[];
  sessions?: Array<Record<string, unknown>>;
};

function duration(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m ${String(rest).padStart(2, "0")}s`;
}

function dateTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("pt-BR");
}

function safeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function safeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function fallbackProfiles(sessions: Array<Record<string, unknown>>): CommercialProfile[] {
  return sessions.map((raw, index) => {
    const identity = safeRecord(raw.identity);
    const geo = safeRecord(raw.geo);
    const device = safeRecord(raw.device);
    const intent = safeRecord(raw.intent);
    const sessionId = typeof raw.sessionId === "string" ? raw.sessionId : `legacy-${index}`;
    const score = Number(raw.commercialScore ?? intent.score ?? 0) || 0;
    const stage = score >= 80 ? "oportunidade" : score >= 60 ? "quente" : score >= 35 ? "aquecimento" : "descoberta";
    return {
      profileKey: `session:${sessionId}`,
      leadId: typeof raw.leadId === "string" ? raw.leadId : null,
      userId: typeof raw.userId === "string" ? raw.userId : null,
      visitorId: typeof raw.visitorId === "string" ? raw.visitorId : null,
      sessionId,
      identity: {
        displayName: typeof identity.displayName === "string" ? identity.displayName : null,
        email: typeof identity.email === "string" ? identity.email : null,
        phone: typeof identity.phone === "string" ? identity.phone : null,
        company: typeof identity.company === "string" ? identity.company : null,
        source: identity.source === "lead" || identity.source === "user" ? identity.source : null,
      },
      identified: Boolean(raw.identified),
      surface: raw.surface === "site" || raw.surface === "app" || raw.surface === "mobile" ? raw.surface : "unknown",
      online: Boolean(raw.online),
      sessionsCount: Number(raw.recurrenceCount ?? 1) || 1,
      firstSeenAt: typeof raw.firstSeenAt === "string" ? raw.firstSeenAt : null,
      lastSeenAt: typeof raw.lastSeenAt === "string" ? raw.lastSeenAt : null,
      currentPath: typeof raw.currentPath === "string" ? raw.currentPath : null,
      sourceLabel: typeof raw.sourceLabel === "string" ? raw.sourceLabel : null,
      campaign: typeof raw.campaign === "string" ? raw.campaign : null,
      geo: {
        country: typeof geo.country === "string" ? geo.country : null,
        region: typeof geo.region === "string" ? geo.region : null,
        city: typeof geo.city === "string" ? geo.city : null,
      },
      device: {
        type: typeof device.type === "string" ? device.type : null,
        browser: typeof device.browser === "string" ? device.browser : null,
        os: typeof device.os === "string" ? device.os : null,
      },
      totalDurationMs: Number(raw.durationMs ?? 0) || 0,
      pageViews: Number(raw.pageViews ?? 0) || 0,
      ctaClicks: Number(raw.ctaClicks ?? 0) || 0,
      conversions: Number(raw.conversions ?? 0) || 0,
      pricingViews: Number(raw.pricingViews ?? 0) || 0,
      formStarts: Number(raw.formStarts ?? 0) || 0,
      formSubmits: Number(raw.formSubmits ?? 0) || 0,
      commercialScore: score,
      commercialStage: stage,
      hotOpportunity: Boolean(raw.hotOpportunity),
      commercialReading: typeof raw.commercialReading === "string" ? raw.commercialReading : "Sinais comerciais ainda em formação.",
      recommendedAction: typeof raw.recommendedAction === "string" ? raw.recommendedAction : "Continuar acompanhando e nutrindo conforme novos sinais.",
      audienceTags: safeArray<string>(raw.audienceTags),
      remarketingEligible: Boolean(raw.remarketingEligible),
      pageEngagement: safeArray<PageEngagement>(raw.pageEngagement),
      clicks: safeArray<ClickSignal>(raw.clicks),
      campaignHistory: [],
      recommendedMaterials: [],
    };
  });
}

function normalizeResponse(raw: unknown): VisitorResponse {
  const data = safeRecord(raw);
  const totals = safeRecord(data.totals);
  const commercial = safeRecord(data.commercial);
  const sessions = safeArray<Record<string, unknown>>(data.sessions);
  const profiles = safeArray<CommercialProfile>(data.profiles);
  return {
    generatedAt: typeof data.generatedAt === "string" ? data.generatedAt : new Date().toISOString(),
    truncated: Boolean(data.truncated),
    totals: {
      onlineNow: Number(totals.onlineNow ?? 0) || 0,
      uniqueVisitors: Number(totals.uniqueVisitors ?? profiles.length ?? 0) || 0,
      identified: Number(totals.identified ?? 0) || 0,
    },
    commercial: {
      hotProfiles: Number(commercial.hotProfiles ?? profiles.filter((item) => item.commercialScore >= 60).length) || 0,
      returningProfiles: Number(commercial.returningProfiles ?? profiles.filter((item) => item.sessionsCount > 1).length) || 0,
      pricingProfiles: Number(commercial.pricingProfiles ?? profiles.filter((item) => item.pricingViews > 0).length) || 0,
      ctaProfiles: Number(commercial.ctaProfiles ?? profiles.filter((item) => item.ctaClicks > 0).length) || 0,
      formAbandoners: Number(commercial.formAbandoners ?? 0) || 0,
      remarketingEligible: Number(commercial.remarketingEligible ?? profiles.filter((item) => item.remarketingEligible).length) || 0,
      identifiedProfiles: Number(commercial.identifiedProfiles ?? profiles.filter((item) => item.identified).length) || 0,
    },
    profiles: profiles.length ? profiles : fallbackProfiles(sessions),
    sessions,
  };
}

async function loadVisitors(minutes: number): Promise<VisitorResponse> {
  const token = window.localStorage.getItem("vendorai_token");
  if (!token) throw new Error("Sessão não autenticada");
  const response = await fetch(`${API_BASE}/visitor-intelligence?minutes=${minutes}`, {
    credentials: "include",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error("Falha ao carregar rastreamento comercial");
  return normalizeResponse(await response.json());
}

function visitorLabel(profile: CommercialProfile) {
  return profile.identity.displayName
    || (profile.identified ? "Lead identificado" : `Visitante ${profile.visitorId?.slice(0, 8) || profile.sessionId.slice(0, 8)}`);
}

function surfaceLabel(surface: VisitorSurface) {
  if (surface === "site") return "Site / LP";
  if (surface === "app") return "App Web";
  if (surface === "mobile") return "App Mobile";
  return "Não classificado";
}

function stageLabel(stage: CommercialProfile["commercialStage"]) {
  if (stage === "oportunidade") return "Oportunidade";
  if (stage === "quente") return "Quente";
  if (stage === "aquecimento") return "Aquecimento";
  return "Descoberta";
}

function scoreClass(score: number) {
  if (score >= 80) return "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300";
  if (score >= 60) return "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300";
  if (score >= 35) return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  return "border-border bg-muted text-muted-foreground";
}

function locationLabel(profile: CommercialProfile) {
  return [profile.geo.city, profile.geo.region].filter(Boolean).join(" / ") || "Localização não disponível";
}

function audienceLabel(tag: string) {
  const labels: Record<string, string> = {
    all_site_visitors_30d: "Todos visitantes 30d",
    returning_visitors: "Visitantes recorrentes",
    pricing_visitors: "Visitou preço/orçamento",
    cta_engaged: "Clicou em CTA",
    form_abandoners: "Abandonou formulário",
    high_intent: "Alta intenção",
    identified_leads: "Leads identificados",
    converted_form: "Converteu formulário",
  };
  return labels[tag] ?? tag.replace(/^stage:/, "Etapa: ").replaceAll("_", " ");
}

export default function VisitorIntelligence() {
  const [, setLocation] = useLocation();
  const [minutes, setMinutes] = useState(7 * 24 * 60);
  const [surface, setSurface] = useState<"all" | VisitorSurface>("site");
  const [status, setStatus] = useState<CommercialStatus>("all");
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["visitor-intelligence-commercial", minutes],
    queryFn: () => loadVisitors(minutes),
    refetchInterval: 20_000,
  });

  const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
  const profiles = useMemo(() => (query.data?.profiles ?? []).filter((profile) => {
    if (surface !== "all" && profile.surface !== surface) return false;
    if (status === "hot" && profile.commercialScore < 60) return false;
    if (status === "returning" && profile.sessionsCount < 2) return false;
    if (status === "identified" && !profile.identified) return false;
    if (status === "remarketing" && !profile.remarketingEligible) return false;
    if (!normalizedSearch) return true;
    const haystack = [
      visitorLabel(profile),
      profile.identity.company,
      profile.identity.email,
      profile.currentPath,
      profile.sourceLabel,
      profile.campaign,
      profile.geo.city,
      profile.geo.region,
      ...profile.audienceTags,
    ].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");
    return haystack.includes(normalizedSearch);
  }), [query.data, surface, status, normalizedSearch]);

  const selected = useMemo(() => {
    if (!profiles.length) return null;
    return profiles.find((profile) => profile.profileKey === selectedKey) ?? profiles[0];
  }, [profiles, selectedKey]);

  const commercial = query.data?.commercial ?? {
    hotProfiles: 0,
    returningProfiles: 0,
    pricingProfiles: 0,
    ctaProfiles: 0,
    formAbandoners: 0,
    remarketingEligible: 0,
    identifiedProfiles: 0,
  };

  return (
    <div className="space-y-5 p-1 md:p-2">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-semibold tracking-tight">Rastreamento comercial</h1>
          </div>
          <p className="mt-1 max-w-4xl text-sm text-muted-foreground">
            Transforma visitas em sinais para remarketing, SDR, nutrição, follow-up e Pipeline. A jornada do lead continua mesmo quando uma campanha termina.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="h-10 rounded-md border bg-background px-3 text-sm" value={minutes} onChange={(event) => setMinutes(Number(event.target.value))}>
            <option value={60}>Última hora</option>
            <option value={1440}>Últimas 24 horas</option>
            <option value={10080}>Últimos 7 dias</option>
            <option value={43200}>Últimos 30 dias</option>
            <option value={129600}>Últimos 90 dias</option>
          </select>
          <button type="button" onClick={() => query.refetch()} className="inline-flex h-10 items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium hover:bg-muted">
            <RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} /> Atualizar
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {[
          { label: "Alta intenção", value: commercial.hotProfiles, icon: Flame },
          { label: "Retornaram", value: commercial.returningProfiles, icon: Repeat2 },
          { label: "Viram preço/orçamento", value: commercial.pricingProfiles, icon: Target },
          { label: "Clicaram em CTA", value: commercial.ctaProfiles, icon: MousePointerClick },
          { label: "Leads identificados", value: commercial.identifiedProfiles, icon: Users },
          { label: "Remarketing liberado", value: commercial.remarketingEligible, icon: Megaphone },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between text-muted-foreground"><span className="text-xs">{label}</span><Icon className="h-4 w-4" /></div>
            <div className="mt-2 text-2xl font-semibold">{value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-2 rounded-xl border bg-card p-3 lg:grid-cols-[minmax(260px,1fr)_180px_190px_auto]">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar lead, cidade, origem, campanha, página ou audiência..." className="h-10 w-full rounded-md border bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </div>
        <select className="h-10 rounded-md border bg-background px-3 text-sm" value={surface} onChange={(event) => setSurface(event.target.value as "all" | VisitorSurface)}>
          <option value="site">Site / Landing Pages</option>
          <option value="all">Todas as superfícies</option>
          <option value="app">Uso do App Web</option>
          <option value="mobile">Uso do App Mobile</option>
        </select>
        <select className="h-10 rounded-md border bg-background px-3 text-sm" value={status} onChange={(event) => setStatus(event.target.value as CommercialStatus)}>
          <option value="all">Todos os sinais</option>
          <option value="hot">Alta intenção</option>
          <option value="returning">Recorrentes</option>
          <option value="identified">Identificados</option>
          <option value="remarketing">Prontos p/ remarketing</option>
        </select>
        <button type="button" onClick={() => { setSearch(""); setSurface("site"); setStatus("all"); }} className="h-10 rounded-md border px-3 text-sm font-medium hover:bg-muted">Limpar</button>
      </div>

      {query.data?.truncated ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-800 dark:text-amber-200">O período tem volume alto. A leitura comercial prioriza os eventos mais recentes.</div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(380px,.9fr)]">
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="border-b px-4 py-3">
            <h2 className="font-semibold">Visitantes e leads em movimento</h2>
            <p className="text-xs text-muted-foreground">{profiles.length} perfil(is) dentro dos filtros · prioridade por sinal comercial, não por volume técnico.</p>
          </div>
          <div className="divide-y">
            {query.isLoading ? <div className="p-6 text-sm text-muted-foreground">Carregando sinais…</div> : null}
            {query.isError ? <div className="p-6 text-sm text-destructive">Não foi possível carregar o rastreamento.</div> : null}
            {!query.isLoading && !profiles.length ? <div className="p-6 text-sm text-muted-foreground">Nenhum perfil neste filtro.</div> : null}
            {profiles.map((profile) => (
              <button
                type="button"
                key={profile.profileKey}
                onClick={() => setSelectedKey(profile.profileKey)}
                className={`w-full px-4 py-4 text-left transition-colors hover:bg-muted/40 ${selected?.profileKey === profile.profileKey ? "bg-muted/40 ring-1 ring-inset ring-primary/20" : ""}`}
              >
                <div className="grid gap-3 lg:grid-cols-[minmax(220px,1.2fr)_135px_minmax(180px,.9fr)_130px] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${profile.online ? "bg-emerald-500" : "bg-muted-foreground/30"}`} />
                      <span className="truncate font-semibold">{visitorLabel(profile)}</span>
                      {profile.commercialScore >= 60 ? <Flame className="h-4 w-4 text-orange-600" /> : null}
                      {profile.identified ? <span className="rounded-full border px-1.5 py-0.5 text-[10px]">Lead</span> : <span className="rounded-full border px-1.5 py-0.5 text-[10px] text-muted-foreground">Anônimo</span>}
                      {profile.sessionsCount > 1 ? <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-300"><Repeat2 className="h-3 w-3" />{profile.sessionsCount} sessões</span> : null}
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{profile.commercialReading}</p>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      <span>{profile.currentPath || "/"}</span>
                      <span>{dateTime(profile.lastSeenAt)}</span>
                    </div>
                  </div>
                  <div>
                    <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${scoreClass(profile.commercialScore)}`}>{profile.commercialScore}/100 · {stageLabel(profile.commercialStage)}</span>
                  </div>
                  <div className="min-w-0 text-xs text-muted-foreground">
                    <div className="truncate"><MapPin className="mr-1 inline h-3.5 w-3.5" />{locationLabel(profile)}</div>
                    <div className="mt-1 truncate"><Globe2 className="mr-1 inline h-3.5 w-3.5" />{profile.sourceLabel || "Direto / desconhecido"}</div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <div><Clock3 className="mr-1 inline h-3.5 w-3.5" />{duration(profile.totalDurationMs)}</div>
                    <div className="mt-1">{profile.pageViews} pág. · {profile.ctaClicks} CTA</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4">
          {!selected ? (
            <div className="flex min-h-96 flex-col items-center justify-center text-center text-sm text-muted-foreground">
              <Target className="mb-3 h-8 w-8" />
              Selecione um visitante para entender interesse, páginas, cliques, audiências e próxima ação.
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${selected.online ? "bg-emerald-500" : "bg-muted-foreground/30"}`} />
                  <h2 className="font-semibold">{visitorLabel(selected)}</h2>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${scoreClass(selected.commercialScore)}`}>{selected.commercialScore}/100</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{surfaceLabel(selected.surface)} · {locationLabel(selected)} · {selected.sourceLabel || "Direto"}</p>
              </div>

              <div className="rounded-xl border border-primary/20 bg-primary/[0.035] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold"><Target className="h-4 w-4 text-primary" />Leitura comercial</div>
                <p className="mt-2 text-sm leading-6">{selected.commercialReading}</p>
                <div className="mt-3 rounded-lg border bg-background/80 p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Próxima melhor ação</div>
                  <p className="mt-1 text-sm font-medium">{selected.recommendedAction}</p>
                </div>
                {selected.leadId ? (
                  <button type="button" onClick={() => setLocation(`/leads/${selected.leadId}`)} className="mt-3 inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                    <UserRound className="h-4 w-4" /> Abrir lead no CRM <ArrowRight className="h-4 w-4" />
                  </button>
                ) : null}
              </div>

              <div>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">Audiências automáticas</h3>
                  <span className={`text-[11px] ${selected.remarketingEligible ? "text-emerald-700" : "text-muted-foreground"}`}>
                    {selected.remarketingEligible ? "apto para sincronização com mídia" : "tracking interno / consentimento pendente"}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {selected.audienceTags.map((tag) => <span key={tag} className="rounded-full border bg-muted/40 px-2 py-1 text-[11px]">{audienceLabel(tag)}</span>)}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold">Tempo e interesse por página</h3>
                <div className="mt-2 space-y-2">
                  {!selected.pageEngagement.length ? <p className="text-xs text-muted-foreground">Ainda sem tempo por página disponível.</p> : null}
                  {selected.pageEngagement.slice(0, 8).map((page) => (
                    <div key={page.path} className="rounded-lg border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <span className="min-w-0 break-all text-xs font-medium">{page.path}</span>
                        <span className="shrink-0 text-xs font-semibold">{duration(page.engagedMs)}</span>
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">{page.views} visualização(ões) · scroll máx. {page.maxScrollDepth}%</div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold">Cliques relevantes</h3>
                <div className="mt-2 space-y-2">
                  {!selected.clicks.length ? <p className="text-xs text-muted-foreground">Nenhum CTA registrado neste período.</p> : null}
                  {selected.clicks.slice(0, 8).map((click, index) => (
                    <div key={`${click.at}-${index}`} className="rounded-lg border p-3 text-xs">
                      <div className="flex items-start gap-2"><MousePointerClick className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /><div className="min-w-0"><div className="font-medium">{click.label}</div><div className="mt-0.5 break-all text-muted-foreground">{click.path || "—"}</div>{click.href ? <div className="mt-0.5 break-all text-muted-foreground">→ {click.href}</div> : null}<div className="mt-1 text-[10px] text-muted-foreground">{dateTime(click.at)}</div></div></div>
                    </div>
                  ))}
                </div>
              </div>

              {selected.recommendedMaterials.length ? (
                <div>
                  <h3 className="text-sm font-semibold">Materiais de valor sugeridos ao SDR</h3>
                  <div className="mt-2 space-y-2">
                    {selected.recommendedMaterials.map((material) => (
                      <div key={material.id} className="rounded-lg border p-3">
                        <div className="flex items-start gap-2"><Layers3 className="mt-0.5 h-4 w-4 text-primary" /><div><div className="text-sm font-medium">{material.title}</div><div className="text-[11px] text-muted-foreground">{material.category}</div></div></div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {selected.campaignHistory.length ? (
                <div>
                  <h3 className="text-sm font-semibold">Histórico de campanhas</h3>
                  <p className="mt-1 text-[11px] text-muted-foreground">A campanha termina; o histórico e a jornada do lead continuam para futuras campanhas.</p>
                  <div className="mt-2 space-y-2">
                    {selected.campaignHistory.slice(0, 8).map((campaign) => (
                      <div key={`${campaign.kind}-${campaign.id}`} className="rounded-lg border p-3 text-xs">
                        <div className="flex items-center justify-between gap-2"><span className="font-medium">{campaign.name}</span>{campaign.converted ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : null}</div>
                        <div className="mt-1 text-muted-foreground">{campaign.kind === "paid" ? "Mídia paga" : "Nutrição/CRM"} · {campaign.channel || "canal não informado"} · {campaign.status}</div>
                        <div className="mt-1 text-[10px] text-muted-foreground">Última interação: {dateTime(campaign.lastInteractionAt)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/20 p-3 text-xs">
                <div><span className="text-muted-foreground">Sessões</span><div className="mt-1 font-semibold">{selected.sessionsCount}</div></div>
                <div><span className="text-muted-foreground">Conversões</span><div className="mt-1 font-semibold">{selected.conversions}</div></div>
                <div><span className="text-muted-foreground">Campanha atual/origem</span><div className="mt-1 break-words font-medium">{selected.campaign || "—"}</div></div>
                <div><span className="text-muted-foreground">Dispositivo</span><div className="mt-1 break-words font-medium">{[selected.device.type, selected.device.browser, selected.device.os].filter(Boolean).join(" · ") || "—"}</div></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
