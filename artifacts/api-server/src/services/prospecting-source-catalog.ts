export type ProspectingSourceKind = "company" | "signal" | "hybrid";
export type ProspectingSourceStatus = "active" | "connector_required" | "planned";

export type ProspectingSourceDefinition = {
  id: string;
  label: string;
  kind: ProspectingSourceKind;
  status: ProspectingSourceStatus;
  priority: number;
  defaultConfidence: number;
  description: string;
  requirements: string[];
  produces: Array<"company" | "contact" | "cnpj" | "qsa" | "work_signal" | "expansion_signal" | "purchase_intent" | "event_signal">;
};

export const PROSPECTING_SOURCE_CATALOG: ProspectingSourceDefinition[] = [
  {
    id: "google_places",
    label: "Google Places / Maps",
    kind: "company",
    status: "active",
    priority: 90,
    defaultConfidence: 80,
    description: "Empresas por atividade e localidade, com endereço, telefone e site quando disponíveis.",
    requirements: ["GOOGLE_PLACES_API_KEY"],
    produces: ["company", "contact"],
  },
  {
    id: "cnpj_registry",
    label: "CNPJ / Receita / BrasilAPI",
    kind: "hybrid",
    status: "active",
    priority: 95,
    defaultConfidence: 95,
    description: "Dados empresariais, situação cadastral, CNAE, endereço e QSA.",
    requirements: [],
    produces: ["company", "cnpj", "qsa", "contact"],
  },
  {
    id: "new_companies",
    label: "Empresas recém-abertas",
    kind: "company",
    status: "active",
    priority: 92,
    defaultConfidence: 92,
    description: "Empresas abertas recentemente por CNAE e localidade.",
    requirements: ["CNPJ_API_KEY"],
    produces: ["company", "cnpj", "qsa", "contact", "expansion_signal"],
  },
  {
    id: "construction_radar",
    label: "Radar de Obras",
    kind: "signal",
    status: "active",
    priority: 95,
    defaultConfidence: 82,
    description: "Obras, empreendimentos e sinais públicos de construção.",
    requirements: [],
    produces: ["work_signal", "purchase_intent"],
  },
  {
    id: "revenue_scout",
    label: "Revenue Scout",
    kind: "signal",
    status: "active",
    priority: 88,
    defaultConfidence: 78,
    description: "Oportunidades de receita identificadas a partir de dados internos e campanhas.",
    requirements: [],
    produces: ["purchase_intent"],
  },
  {
    id: "meta_ads",
    label: "Meta Ad Library",
    kind: "signal",
    status: "active",
    priority: 75,
    defaultConfidence: 72,
    description: "Empresas com anúncios ativos ou novos sinais de investimento em aquisição.",
    requirements: ["INSTAGRAM_ACCESS_TOKEN"],
    produces: ["company", "purchase_intent"],
  },
  {
    id: "permits_licenses",
    label: "Alvarás e licenças",
    kind: "signal",
    status: "connector_required",
    priority: 98,
    defaultConfidence: 90,
    description: "Alvarás de construção, reforma, funcionamento e licenciamento por município/órgão.",
    requirements: ["conector municipal/estadual por fonte"],
    produces: ["company", "work_signal", "expansion_signal", "purchase_intent"],
  },
  {
    id: "public_procurement",
    label: "Licitações e compras públicas",
    kind: "signal",
    status: "connector_required",
    priority: 92,
    defaultConfidence: 90,
    description: "Editais, vencedores, adjudicações e fornecedores relacionados a compras públicas.",
    requirements: ["conector PNCP/portais públicos"],
    produces: ["company", "purchase_intent"],
  },
  {
    id: "company_changes",
    label: "Alterações cadastrais e novas filiais",
    kind: "signal",
    status: "connector_required",
    priority: 94,
    defaultConfidence: 88,
    description: "Mudança de CNAE, endereço, capital, abertura de filial e outros sinais de expansão.",
    requirements: ["fonte histórica de alterações cadastrais"],
    produces: ["company", "cnpj", "expansion_signal", "purchase_intent"],
  },
  {
    id: "jobs_expansion",
    label: "Vagas e expansão de equipe",
    kind: "signal",
    status: "connector_required",
    priority: 84,
    defaultConfidence: 70,
    description: "Vagas e contratações que sinalizam nova unidade, obra, expansão ou investimento.",
    requirements: ["fonte pública de vagas autorizada"],
    produces: ["company", "expansion_signal"],
  },
  {
    id: "real_estate_launches",
    label: "Lançamentos e incorporações",
    kind: "signal",
    status: "connector_required",
    priority: 97,
    defaultConfidence: 86,
    description: "Novos empreendimentos, loteamentos, incorporações e lançamentos imobiliários.",
    requirements: ["fontes públicas/portais de lançamentos"],
    produces: ["company", "work_signal", "purchase_intent"],
  },
  {
    id: "social_signals",
    label: "Sinais sociais",
    kind: "signal",
    status: "connector_required",
    priority: 80,
    defaultConfidence: 65,
    description: "Postagens públicas como nova unidade, inauguração, mudança, obra, showroom ou expansão.",
    requirements: ["conectores sociais permitidos"],
    produces: ["company", "expansion_signal", "event_signal"],
  },
  {
    id: "events_exhibitors",
    label: "Feiras, eventos e expositores",
    kind: "hybrid",
    status: "connector_required",
    priority: 78,
    defaultConfidence: 76,
    description: "Listas públicas de expositores, patrocinadores e empresas participantes.",
    requirements: ["fontes públicas de eventos"],
    produces: ["company", "event_signal"],
  },
  {
    id: "news_market",
    label: "Notícias e mercado",
    kind: "signal",
    status: "active",
    priority: 76,
    defaultConfidence: 68,
    description: "Notícias públicas de expansão, investimento, mudança e novas operações já tratadas pelo JARVIS.",
    requirements: [],
    produces: ["company", "expansion_signal", "purchase_intent"],
  },
];

export function listProspectingSources() {
  return PROSPECTING_SOURCE_CATALOG.map((source) => ({ ...source }));
}

export function getProspectingSource(id: string) {
  return PROSPECTING_SOURCE_CATALOG.find((source) => source.id === id) ?? null;
}
