import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Flame, Globe2, MapPin, MonitorSmartphone, MousePointerClick, Radio, Smartphone } from "lucide-react";

const API_BASE = import.meta.env.PROD ? "/api" : (import.meta.env.VITE_API_URL || "/api");

type JourneyItem = { path: string | null; pageUrl: string | null; at: string | null };
type VisitorSurface = "site" | "app" | "mobile" | "unknown";
type SessionStatus = "all" | "online" | "hot" | "identified" | "anonymous";
type IntentSummary = {
  score: number;
  tier: "baixo" | "medio" | "alto" | "muito_alto";
  tierLabel: string;
  recommendedAction: string;
  reasons: string[];
};
type VisitorSession = {
  sessionId: string;
  surface: VisitorSurface;
  online: boolean;
  hotOpportunity: boolean;
  identified: boolean;
  leadId: string | null;
  currentPath: string | null;
  referrer: string | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  durationMs: number;
  pageViews: number;
  ctaClicks: number;
  formStarts: number;
  formSubmits: number;
  maxScrollDepth: number;
  maxEngagedMs: number;
  intent: IntentSummary;
  geo: { country: string | null; region: string | null; city: string | null };
  device: { type: string | null; browser: string | null; os: string | null };
  source: string | null;
  medium: string | null;
  campaign: string | null;
  journey: JourneyItem[];
};

type VisitorResponse = {
  generatedAt: string;
  totals: {
    visitors: number;
    pageViews: number;
    conversions: number;
    onlineNow: number;
    identified: number;
    hotNow: number;
    siteVisitors: number;
    appVisitors: number;
    mobileVisitors: number;
  };
  hotOpportunities: VisitorSession[];
  sessions: VisitorSession[];
};

function duration(ms: number) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function locationLabel(session: VisitorSession) {
  return [session.geo.city, session.geo.region, session.geo.country].filter(Boolean).join(" / ") || "Localização não disponível";
}

function sourceLabel(session: VisitorSession) {
  return [session.source, session.medium, session.campaign].filter(Boolean).join(" · ") || session.referrer || "Direto / desconhecido";
}

function surfaceLabel(surface: VisitorSurface) {
  if (surface === "site") return "Site";
  if (surface === "app") return "App Web";
  if (surface === "mobile") return "App Mobile";
  return "Origem não classificada";
}

function intentClass(tier: IntentSummary["tier"]) {
  if (tier === "muito_alto") return "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300";
  if (tier === "alto") return "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300";
  if (tier === "medio") return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  return "border-border bg-muted text-muted-foreground";
}

function matchesStatus(session: VisitorSession, status: SessionStatus) {
  if (status === "online") return session.online;
  if (status === "hot") return session.hotOpportunity;
  if (status === "identified") return session.identified;
  if (status === "anonymous") return !session.identified;
  return true;
}

function matchesSearch(session: VisitorSession, query: string) {
  if (!query) return true;
  const haystack = [
    session.sessionId,
    session.currentPath,
    session.referrer,
    session.geo.city,
    session.geo.region,
    session.geo.country,
    session.source,
    session.medium,
    session.campaign,
    session.device.type,
    session.device.browser,
    session.device.os,
    surfaceLabel(session.surface),
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("pt-BR");
  return haystack.includes(query);
}

async function loadVisitors(minutes: number): Promise<VisitorResponse> {
  const token = window.localStorage.getItem("vendorai_token");
  if (!token) throw new Error("Sessão não autenticada");

  const response = await fetch(`${API_BASE}/visitor-intelligence?minutes=${minutes}`, {
    credentials: "include",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error("Falha ao carregar Visitor Intelligence");
  return response.json();
}

export default function VisitorIntelligence() {
  const [minutes, setMinutes] = useState(60);
  const [surface, setSurface] = useState<"all" | VisitorSurface>("all");
  const [status, setStatus] = useState<SessionStatus>("all");
  const [search, setSearch] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["visitor-intelligence", minutes],
    queryFn: () => loadVisitors(minutes),
    refetchInterval: 15_000,
  });

  const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
  const filteredSessions = useMemo(
    () => (query.data?.sessions ?? []).filter((session) =>
      (surface === "all" || session.surface === surface)
      && matchesStatus(session, status)
      && matchesSearch(session, normalizedSearch),
    ),
    [query.data, surface, status, normalizedSearch],
  );

  const filteredHot = useMemo(
    () => filteredSessions.filter((session) => session.hotOpportunity),
    [filteredSessions],
  );

  const selected = useMemo(
    () => query.data?.sessions.find((session) => session.sessionId === selectedSessionId) ?? null,
    [query.data, selectedSessionId],
  );

  const totals = query.data?.totals ?? {
    visitors: 0,
    pageViews: 0,
    conversions: 0,
    onlineNow: 0,
    identified: 0,
    hotNow: 0,
    siteVisitors: 0,
    appVisitors: 0,
    mobileVisitors: 0,
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Visitor Intelligence</h1>
          <p className="text-sm text-muted-foreground">Site, app web e app mobile em uma visão única, com origem, cidade, tela atual, jornada e intenção comercial.</p>
        </div>
        <select
          className="h-10 rounded-md border bg-background px-3 text-sm"
          value={minutes}
          onChange={(event) => setMinutes(Number(event.target.value))}
        >
          <option value={30}>Últimos 30 min</option>
          <option value={60}>Última hora</option>
          <option value={360}>Últimas 6 horas</option>
          <option value={1440}>Últimas 24 horas</option>
        </select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {[
          { label: "Quentes agora", value: totals.hotNow, icon: Flame },
          { label: "Online agora", value: totals.onlineNow, icon: Radio },
          { label: "Site", value: totals.siteVisitors, icon: Globe2 },
          { label: "App Web", value: totals.appVisitors, icon: MonitorSmartphone },
          { label: "App Mobile", value: totals.mobileVisitors, icon: Smartphone },
          { label: "Conversões", value: totals.conversions, icon: MousePointerClick },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between text-muted-foreground"><span className="text-sm">{label}</span><Icon className="h-4 w-4" /></div>
            <div className="mt-2 text-2xl font-semibold">{value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-card px-4 py-3"><div className="text-xs text-muted-foreground">Visitantes no período</div><div className="mt-1 text-lg font-semibold">{totals.visitors}</div></div>
        <div className="rounded-lg border bg-card px-4 py-3"><div className="text-xs text-muted-foreground">Páginas/telas vistas</div><div className="mt-1 text-lg font-semibold">{totals.pageViews}</div></div>
        <div className="rounded-lg border bg-card px-4 py-3"><div className="text-xs text-muted-foreground">Identificados</div><div className="mt-1 text-lg font-semibold">{totals.identified}</div></div>
      </div>

      <div className="grid gap-2 rounded-xl border bg-card p-3 md:grid-cols-[minmax(220px,1fr)_180px_180px_auto]">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar cidade, estado, origem, campanha ou tela..."
          className="h-10 min-w-0 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <select
          className="h-10 rounded-md border bg-background px-3 text-sm"
          value={surface}
          onChange={(event) => setSurface(event.target.value as "all" | VisitorSurface)}
        >
          <option value="all">Todas as superfícies</option>
          <option value="site">Site</option>
          <option value="app">App Web</option>
          <option value="mobile">App Mobile</option>
          <option value="unknown">Não classificado</option>
        </select>
        <select
          className="h-10 rounded-md border bg-background px-3 text-sm"
          value={status}
          onChange={(event) => setStatus(event.target.value as SessionStatus)}
        >
          <option value="all">Todos os status</option>
          <option value="online">Online agora</option>
          <option value="hot">Oportunidades quentes</option>
          <option value="identified">Identificados</option>
          <option value="anonymous">Anônimos</option>
        </select>
        <button
          type="button"
          onClick={() => { setSearch(""); setSurface("all"); setStatus("all"); }}
          className="h-10 rounded-md border px-3 text-sm font-medium hover:bg-muted"
        >
          Limpar filtros
        </button>
      </div>

      {filteredHot.length ? (
        <div className="rounded-xl border border-orange-500/30 bg-orange-500/[0.04] p-4">
          <div className="flex items-center gap-2">
            <Flame className="h-5 w-5 text-orange-600" />
            <div>
              <h2 className="font-semibold">Oportunidades quentes agora</h2>
              <p className="text-xs text-muted-foreground">Visitantes online com Behavior Intent a partir de 60/100 dentro dos filtros atuais.</p>
            </div>
          </div>
          <div className="mt-3 grid gap-2 lg:grid-cols-2 xl:grid-cols-3">
            {filteredHot.slice(0, 6).map((session) => (
              <button
                key={session.sessionId}
                type="button"
                onClick={() => setSelectedSessionId(session.sessionId)}
                className="rounded-lg border bg-background p-3 text-left transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{session.identified ? "Visitante identificado" : `Visitante ${session.sessionId.slice(0, 8)}`}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${intentClass(session.intent.tier)}`}>{session.intent.score}/100</span>
                </div>
                <div className="mt-1 text-[11px] font-medium text-muted-foreground">{surfaceLabel(session.surface)}</div>
                <div className="mt-1 truncate text-xs text-muted-foreground">{session.currentPath || "/"} · {locationLabel(session)}</div>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.8fr)]">
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="font-medium">Sessões recentes</h2>
            <span className="text-xs text-muted-foreground">{filteredSessions.length} exibida(s)</span>
          </div>
          <div className="divide-y">
            {query.isLoading && <div className="p-6 text-sm text-muted-foreground">Carregando visitantes…</div>}
            {query.isError && <div className="p-6 text-sm text-destructive">Não foi possível carregar os visitantes.</div>}
            {!query.isLoading && filteredSessions.length === 0 && <div className="p-6 text-sm text-muted-foreground">Nenhuma sessão neste filtro.</div>}
            {filteredSessions.map((session) => (
              <button
                type="button"
                key={session.sessionId}
                onClick={() => setSelectedSessionId(session.sessionId)}
                className="grid w-full gap-2 px-4 py-3 text-left hover:bg-muted/50 md:grid-cols-[minmax(180px,1.1fr)_110px_minmax(150px,0.7fr)_minmax(160px,1fr)_minmax(160px,1fr)_auto] md:items-center"
              >
                <div>
                  <div className="flex items-center gap-2 font-medium">
                    <span className={`h-2.5 w-2.5 rounded-full ${session.online ? "bg-emerald-500" : "bg-muted-foreground/30"}`} />
                    {session.identified ? "Visitante identificado" : `Visitante ${session.sessionId.slice(0, 8)}`}
                    {session.hotOpportunity ? <Flame className="h-4 w-4 text-orange-600" /> : null}
                  </div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">{session.currentPath || "/"}</div>
                </div>
                <div className="text-xs font-medium text-muted-foreground">{surfaceLabel(session.surface)}</div>
                <div><span className={`rounded-full border px-2 py-1 text-xs font-semibold ${intentClass(session.intent.tier)}`}>{session.intent.score}/100 · {session.intent.tierLabel}</span></div>
                <div className="text-sm"><MapPin className="mr-1 inline h-3.5 w-3.5" />{locationLabel(session)}</div>
                <div className="truncate text-sm text-muted-foreground">{sourceLabel(session)}</div>
                <div className="text-xs text-muted-foreground">{session.pageViews} pág. · {duration(session.durationMs)}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4">
          {!selected ? (
            <div className="flex min-h-72 flex-col items-center justify-center text-center text-sm text-muted-foreground">
              <MonitorSmartphone className="mb-3 h-7 w-7" />
              Selecione uma sessão para ver a jornada completa.
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${selected.online ? "bg-emerald-500" : "bg-muted-foreground/30"}`} /><h2 className="font-medium">{selected.identified ? "Visitante identificado" : `Visitante ${selected.sessionId.slice(0, 8)}`}</h2></div>
                <p className="mt-1 text-xs text-muted-foreground">{surfaceLabel(selected.surface)} · {locationLabel(selected)}</p>
              </div>

              <div className={`rounded-lg border p-3 ${intentClass(selected.intent.tier)}`}>
                <div className="flex items-center justify-between gap-3">
                  <div><div className="text-xs opacity-80">Behavior Intent</div><div className="text-lg font-semibold">{selected.intent.score}/100 · {selected.intent.tierLabel}</div></div>
                  {selected.hotOpportunity ? <Flame className="h-6 w-6" /> : null}
                </div>
                <p className="mt-2 text-xs leading-5">{selected.intent.recommendedAction}</p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><div className="text-xs text-muted-foreground">Superfície</div><div className="mt-1">{surfaceLabel(selected.surface)}</div></div>
                <div><div className="text-xs text-muted-foreground">Página/tela atual</div><div className="mt-1 break-all">{selected.currentPath || "/"}</div></div>
                <div><div className="text-xs text-muted-foreground">Origem</div><div className="mt-1 break-all">{sourceLabel(selected)}</div></div>
                <div><div className="text-xs text-muted-foreground">Dispositivo</div><div className="mt-1">{[selected.device.type, selected.device.browser, selected.device.os].filter(Boolean).join(" · ") || "—"}</div></div>
                <div><div className="text-xs text-muted-foreground">Páginas/telas</div><div className="mt-1">{selected.pageViews}</div></div>
                <div><div className="text-xs text-muted-foreground">CTAs</div><div className="mt-1">{selected.ctaClicks}</div></div>
                <div><div className="text-xs text-muted-foreground">Scroll máx.</div><div className="mt-1">{selected.maxScrollDepth}%</div></div>
                <div><div className="text-xs text-muted-foreground">Tempo</div><div className="mt-1">{duration(selected.durationMs)}</div></div>
              </div>

              {selected.intent.reasons.length ? (
                <div>
                  <h3 className="text-sm font-medium">Por que recebeu esse score</h3>
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {selected.intent.reasons.map((reason) => <li key={reason}>• {reason}</li>)}
                  </ul>
                </div>
              ) : null}

              <div>
                <h3 className="text-sm font-medium">Jornada</h3>
                <div className="mt-3 space-y-3 border-l pl-4">
                  {selected.journey.map((item, index) => (
                    <div key={`${item.at}-${index}`} className="relative text-sm">
                      <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border bg-background" />
                      <div className="break-all">{item.path || "/"}</div>
                      <div className="text-xs text-muted-foreground">{item.at ? new Date(item.at).toLocaleString("pt-BR") : ""}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
