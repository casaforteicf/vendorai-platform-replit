type AutonomyLevel = "manual" | "assistido" | "autonomo";

type AgentEntry = {
  enabled?: boolean;
  autonomyLevel?: AutonomyLevel;
};

type AgentConfigResponse = {
  agents?: Record<string, AgentEntry | undefined>;
  autonomyEnabledAt?: string | null;
};

type AreaAutonomy = {
  area: string;
  agents: Array<{ agent: string; level: AutonomyLevel }>;
  effectiveLevel: AutonomyLevel | "misto" | "sem_agente_ativo";
};

const AREA_AGENTS: Record<string, string[]> = {
  comercial: ["sdr", "closer", "followup", "reactivation", "relacionamento"],
  atendimento: ["service", "reception", "onboarding"],
  agenda: ["scheduler"],
  financeiro: ["financeiro", "cobranca"],
};

let tenantIdCache = "";
let autonomyCache: { tenantId: string; loadedAt: number; areas: AreaAutonomy[] } | null = null;
const CACHE_MS = 30_000;

function tenantFromUrl(url: string) {
  const match = url.match(/\/api\/tenants\/([^/]+)\/(?:agent-tasks|agent-config)(?:\/|\?|$)/);
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}

function legacyAutonomyEnabled(config: AgentConfigResponse) {
  if (!config.autonomyEnabledAt) return false;
  const time = new Date(config.autonomyEnabledAt).getTime();
  return Number.isFinite(time) && time <= Date.now();
}

function effectiveLevel(entry: AgentEntry | undefined, legacyEnabled: boolean): AutonomyLevel {
  if (entry?.autonomyLevel) return entry.autonomyLevel;
  return legacyEnabled ? "autonomo" : "manual";
}

function buildAreas(config: AgentConfigResponse): AreaAutonomy[] {
  const agents = config.agents ?? {};
  const legacyEnabled = legacyAutonomyEnabled(config);

  return Object.entries(AREA_AGENTS).map(([area, names]) => {
    const active = names
      .filter((name) => agents[name]?.enabled)
      .map((name) => ({ agent: name, level: effectiveLevel(agents[name], legacyEnabled) }));
    const uniqueLevels = Array.from(new Set(active.map((item) => item.level)));
    return {
      area,
      agents: active,
      effectiveLevel: active.length === 0
        ? "sem_agente_ativo"
        : uniqueLevels.length === 1
          ? uniqueLevels[0]!
          : "misto",
    };
  });
}

async function loadAutonomy(previousFetch: typeof window.fetch) {
  if (!tenantIdCache) return null;
  if (
    autonomyCache
    && autonomyCache.tenantId === tenantIdCache
    && Date.now() - autonomyCache.loadedAt < CACHE_MS
  ) return autonomyCache.areas;

  try {
    const token = localStorage.getItem("vendorai_token");
    const response = await previousFetch(`/api/tenants/${encodeURIComponent(tenantIdCache)}/agent-config`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!response.ok) return null;
    const config = await response.json() as AgentConfigResponse;
    const areas = buildAreas(config);
    autonomyCache = { tenantId: tenantIdCache, loadedAt: Date.now(), areas };
    return areas;
  } catch {
    return null;
  }
}

function enrichRequest(init: RequestInit | undefined, areas: AreaAutonomy[] | null) {
  if (!areas || typeof init?.body !== "string") return init;
  try {
    const payload = JSON.parse(init.body) as {
      context?: Record<string, unknown>;
      [key: string]: unknown;
    };
    return {
      ...init,
      body: JSON.stringify({
        ...payload,
        context: {
          ...(payload.context ?? {}),
          autonomy: {
            source: "agent_configs",
            areas,
            guardrail: "Autonomia informa capacidade operacional configurada. Ações sensíveis continuam exigindo aprovação conforme as regras do backend.",
          },
        },
      }),
    };
  } catch {
    return init;
  }
}

if (typeof window !== "undefined") {
  const previousFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

    const discoveredTenant = tenantFromUrl(url);
    if (discoveredTenant && discoveredTenant !== tenantIdCache) {
      tenantIdCache = discoveredTenant;
      autonomyCache = null;
    }

    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const isJarvisChat = method === "POST" && /(?:^|\/)api\/support\/chat(?:\?|$)/.test(url);
    if (!isJarvisChat) return previousFetch(input, init);

    const areas = await loadAutonomy(previousFetch);
    return previousFetch(input, enrichRequest(init, areas));
  };
}

export {};
