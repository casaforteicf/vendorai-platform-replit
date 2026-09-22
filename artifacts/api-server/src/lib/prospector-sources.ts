export type ProspectorSourceKey =
  | "google_places"
  | "cnpj_cnae"
  | "meta_ads"
  | "revenue_scout"
  | "construction_radar"
  | "imported_lists"
  | "website_research"
  | "referrals"
  | "events"
  | "linkedin"
  | "social_discovery";

export type ProspectorSourceAvailability = "active" | "manual" | "planned";

export type ProspectorSourceDefinition = {
  key: ProspectorSourceKey;
  label: string;
  description: string;
  availability: ProspectorSourceAvailability;
  leadSources: string[];
  defaultEnabled: boolean;
  universal: boolean;
};

export const PROSPECTOR_SOURCE_CATALOG: ProspectorSourceDefinition[] = [
  {
    key: "google_places",
    label: "Empresas locais",
    description: "Google Places + enriquecimento + deduplicação.",
    availability: "active",
    leadSources: ["prospector", "prospector_auto", "google_maps_prospecting", "google_business_profile"],
    defaultEnabled: true,
    universal: true,
  },
  {
    key: "cnpj_cnae",
    label: "CNPJ / CNAE",
    description: "Empresas por atividade, cidade, porte e data de abertura.",
    availability: "active",
    leadSources: ["cnpj", "recem_aberta"],
    defaultEnabled: true,
    universal: true,
  },
  {
    key: "meta_ads",
    label: "Anunciantes",
    description: "Empresas com anúncios públicos na Meta Ad Library.",
    availability: "active",
    leadSources: ["ad_library"],
    defaultEnabled: true,
    universal: true,
  },
  {
    key: "revenue_scout",
    label: "Revenue Scout",
    description: "Sinais de expansão, oportunidade e receita já detectados pelo sistema.",
    availability: "active",
    leadSources: ["revenue_scout"],
    defaultEnabled: true,
    universal: true,
  },
  {
    key: "construction_radar",
    label: "Radar de Obras",
    description: "Obras, projetos e sinais públicos da construção civil.",
    availability: "active",
    leadSources: ["construction_radar", "obra_radar"],
    defaultEnabled: false,
    universal: false,
  },
  {
    key: "imported_lists",
    label: "Listas importadas",
    description: "Leads trazidos por planilha ou base autorizada do tenant.",
    availability: "manual",
    leadSources: ["imported_prospect_list"],
    defaultEnabled: true,
    universal: true,
  },
  {
    key: "website_research",
    label: "Sites empresariais",
    description: "Pesquisa manual ou assistida em sites públicos de empresas.",
    availability: "manual",
    leadSources: ["website_prospecting", "business_directory", "public_registry"],
    defaultEnabled: true,
    universal: true,
  },
  {
    key: "referrals",
    label: "Indicações",
    description: "Oportunidades indicadas por clientes, parceiros e rede comercial.",
    availability: "manual",
    leadSources: ["referral_prospecting"],
    defaultEnabled: true,
    universal: true,
  },
  {
    key: "events",
    label: "Eventos",
    description: "Contatos captados em feiras, eventos e ações comerciais.",
    availability: "manual",
    leadSources: ["event_prospecting"],
    defaultEnabled: true,
    universal: true,
  },
  {
    key: "linkedin",
    label: "LinkedIn",
    description: "Provider dedicado de descoberta ainda não automatizado.",
    availability: "planned",
    leadSources: ["linkedin_prospecting"],
    defaultEnabled: false,
    universal: true,
  },
  {
    key: "social_discovery",
    label: "Descoberta em redes sociais",
    description: "Pesquisa fria dedicada em Instagram/Facebook ainda não automatizada.",
    availability: "planned",
    leadSources: ["instagram_prospecting", "facebook_prospecting"],
    defaultEnabled: false,
    universal: true,
  },
];

const CONSTRUCTION_SEGMENT_RE =
  /constr|arquitet|engenhar|obra|esquadr|acabamento|revest|piscina|material(?:is)?\s+de\s+constru|imobili|incorpor/i;

export function isConstructionRelevantSegment(value?: string | null): boolean {
  return CONSTRUCTION_SEGMENT_RE.test((value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
}

export function configurableProspectorSourceKeys(): ProspectorSourceKey[] {
  return PROSPECTOR_SOURCE_CATALOG
    .filter((source) => source.availability !== "planned")
    .map((source) => source.key);
}

export function resolveProspectorEnabledSources(
  raw: unknown,
  segment?: string | null,
): ProspectorSourceKey[] {
  const allowed = new Set(configurableProspectorSourceKeys());

  if (Array.isArray(raw)) {
    return [...new Set(
      raw
        .filter((item): item is string => typeof item === "string")
        .filter((item): item is ProspectorSourceKey => allowed.has(item as ProspectorSourceKey)),
    )];
  }

  return PROSPECTOR_SOURCE_CATALOG
    .filter((source) => {
      if (source.availability === "planned") return false;
      if (source.key === "construction_radar") return isConstructionRelevantSegment(segment);
      return source.defaultEnabled;
    })
    .map((source) => source.key);
}

export function prospectorSourceCatalogForTenant(params: {
  enabled: ProspectorSourceKey[];
  segment?: string | null;
}) {
  const enabledSet = new Set(params.enabled);
  const constructionRelevant = isConstructionRelevantSegment(params.segment);

  return PROSPECTOR_SOURCE_CATALOG.map((source) => ({
    ...source,
    enabled: enabledSet.has(source.key),
    recommended:
      source.key === "construction_radar"
        ? constructionRelevant
        : source.availability !== "planned",
    visible:
      source.universal ||
      source.key !== "construction_radar" ||
      constructionRelevant ||
      enabledSet.has(source.key),
    canToggle: source.availability !== "planned",
  }));
}

export function isProspectorSourceEnabled(
  key: ProspectorSourceKey,
  raw: unknown,
  segment?: string | null,
): boolean {
  return resolveProspectorEnabledSources(raw, segment).includes(key);
}
