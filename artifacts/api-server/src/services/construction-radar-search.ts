import { getOpenAIForTenant } from "../lib/agent-engine.js";

export type ConstructionSourceFamily =
  | "prefeitura_alvara"
  | "diario_oficial"
  | "crea_cau"
  | "licenciamento_ambiental"
  | "incorporadora_construtora"
  | "arquiteto_engenheiro"
  | "noticia_portal"
  | "portal_imobiliario"
  | "outro";

export type ConstructionSourceAuthority = "oficial" | "primaria" | "secundaria";

export type ConstructionWorkSignal = {
  id: string;
  obra: string;
  categoria: string | null;
  local: string;
  endereco: string | null | undefined;
  proprietario: string | null | undefined;
  proprietarioTipo: "pessoa" | "empresa" | "orgao_publico" | "nao_informado";
  responsavelTecnico: string | null | undefined;
  construtora: string | null | undefined;
  incorporadora: string | null | undefined;
  fase: string | null | undefined;
  evidencia: string;
  dataReferencia: string | null | undefined;
  sourceUrl: string | null;
  sourceTitle: string | null;
  sourceFamily: ConstructionSourceFamily;
  sourceAuthority: ConstructionSourceAuthority;
  confidence: number;
  opportunityScore: number;
  priority: "alta" | "media" | "baixa";
  priorityReason: string;
  recommendedActor: "proprietario" | "responsavel_tecnico" | "construtora" | "incorporadora" | "identificar";
};

export type ConstructionWorkSearchResult = {
  query: string;
  works: ConstructionWorkSignal[];
  sources: Array<{
    url: string;
    title: string;
    family: ConstructionSourceFamily;
    authority: ConstructionSourceAuthority;
  }>;
  retrievedAt: string;
};

type RawWork = {
  obra?: unknown;
  categoria?: unknown;
  local?: unknown;
  endereco?: unknown;
  proprietario?: unknown;
  proprietarioTipo?: unknown;
  responsavelTecnico?: unknown;
  construtora?: unknown;
  incorporadora?: unknown;
  fase?: unknown;
  evidencia?: unknown;
  dataReferencia?: unknown;
  sourceUrl?: unknown;
  sourceTitle?: unknown;
  confidence?: unknown;
};

type SearchPass = {
  id: "official" | "primary";
  instruction: string;
};

const SOURCE_FAMILY_LABELS: Record<ConstructionSourceFamily, string> = {
  prefeitura_alvara: "Prefeitura / Alvará / Aprovação",
  diario_oficial: "Diário Oficial",
  crea_cau: "CREA / CAU / Responsabilidade técnica",
  licenciamento_ambiental: "Licenciamento ambiental",
  incorporadora_construtora: "Construtora / Incorporadora",
  arquiteto_engenheiro: "Arquiteto / Engenheiro",
  noticia_portal: "Notícia / Portal local",
  portal_imobiliario: "Portal imobiliário",
  outro: "Outra fonte pública",
};

function nullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function nullableHttpUrl(value: unknown): string | null {
  const normalized = nullableString(value);
  if (!normalized) return null;
  try {
    const url = new URL(normalized);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function canonicalUrl(value: string): string | null {
  try {
    const url = new URL(value);
    url.hash = "";
    return `${url.origin}${url.pathname.replace(/\/$/, "")}${url.search}`;
  } catch {
    return null;
  }
}

function isGovernmentHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "gov.br" || host.endsWith(".gov.br") || host.endsWith(".leg.br");
}

export function classifyConstructionSource(
  sourceUrl: string,
  sourceTitle = "",
): { family: ConstructionSourceFamily; authority: ConstructionSourceAuthority } {
  let host = "";
  let path = "";
  try {
    const url = new URL(sourceUrl);
    host = url.hostname.toLowerCase();
    path = decodeURIComponent(url.pathname).toLocaleLowerCase("pt-BR");
  } catch {
    // A URL já é validada antes; fallback conservador.
  }

  const text = `${host} ${path} ${sourceTitle}`.toLocaleLowerCase("pt-BR");
  const government = isGovernmentHost(host);

  if (
    /di[aá]rio.{0,15}oficial|diariomunicipal|dom\b|doe\b|imprensa.{0,10}oficial/.test(text)
  ) {
    return { family: "diario_oficial", authority: "oficial" };
  }

  if (/\bcrea\b|confea|\bcau\b|caubr|causc|rrt\b|art\b/.test(text)) {
    return { family: "crea_cau", authority: "oficial" };
  }

  if (
    /licen[cç]a.{0,15}ambiental|licenciamento.{0,15}ambiental|\bima\b|ibama|fatma|meio.{0,10}ambiente/.test(text)
  ) {
    return { family: "licenciamento_ambiental", authority: government ? "oficial" : "primaria" };
  }

  if (
    government &&
    /alvar[aá]|habite[- ]?se|aprova[cç][aã]o|edifica[cç][aã]o|obra|urbanismo|planejamento|projeto/.test(text)
  ) {
    return { family: "prefeitura_alvara", authority: "oficial" };
  }

  if (/prefeitura|municipio|munic[ií]pio|secretaria.{0,20}urbanismo/.test(text) && government) {
    return { family: "prefeitura_alvara", authority: "oficial" };
  }

  if (/incorporadora|construtora|empreendimento|loteamento/.test(text)) {
    return { family: "incorporadora_construtora", authority: "primaria" };
  }

  if (/arquitet|engenheir|escrit[oó]rio.{0,10}arquitet/.test(text)) {
    return { family: "arquiteto_engenheiro", authority: "primaria" };
  }

  if (/im[oó]vel|imobili[aá]ri|lan[cç]amento|apartamento|condom[ií]nio/.test(text)) {
    return { family: "portal_imobiliario", authority: "secundaria" };
  }

  if (government) {
    return { family: "outro", authority: "oficial" };
  }

  return { family: "noticia_portal", authority: "secundaria" };
}

function extractSources(response: any): Array<{
  url: string;
  title: string;
  family: ConstructionSourceFamily;
  authority: ConstructionSourceAuthority;
}> {
  const sources: Array<{ url: string; title: string }> = [];
  for (const item of response?.output ?? []) {
    if (item?.type !== "message") continue;
    for (const content of item?.content ?? []) {
      if (content?.type !== "output_text") continue;
      for (const annotation of content?.annotations ?? []) {
        if (annotation?.type !== "url_citation" || !annotation?.url) continue;
        const url = nullableHttpUrl(annotation.url);
        if (!url) continue;
        sources.push({
          url,
          title: String(annotation.title || annotation.url),
        });
      }
    }
  }

  const seen = new Set<string>();
  return sources
    .filter((source) => {
      const canonical = canonicalUrl(source.url) ?? source.url;
      if (seen.has(canonical)) return false;
      seen.add(canonical);
      return true;
    })
    .map((source) => ({
      ...source,
      ...classifyConstructionSource(source.url, source.title),
    }))
    .slice(0, 30);
}

function cleanJsonText(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) return trimmed.slice(first, last + 1);
  return trimmed;
}

function normalizeConfidence(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function sourceConfidenceBonus(authority: ConstructionSourceAuthority): number {
  if (authority === "oficial") return 12;
  if (authority === "primaria") return 6;
  return 0;
}

function normalizedPhase(phase: string | null | undefined): string {
  return (phase ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

export function scoreConstructionOpportunity(work: {
  sourceAuthority: ConstructionSourceAuthority;
  confidence: number;
  fase: string | null | undefined;
  proprietario: string | null | undefined;
  responsavelTecnico: string | null | undefined;
  construtora: string | null | undefined;
  incorporadora: string | null | undefined;
  endereco: string | null | undefined;
  dataReferencia: string | null | undefined;
}): {
  score: number;
  priority: "alta" | "media" | "baixa";
  reason: string;
  recommendedActor: "proprietario" | "responsavel_tecnico" | "construtora" | "incorporadora" | "identificar";
} {
  let score = 0;
  const reasons: string[] = [];

  if (work.sourceAuthority === "oficial") {
    score += 25;
    reasons.push("fonte oficial");
  } else if (work.sourceAuthority === "primaria") {
    score += 16;
    reasons.push("fonte primária");
  } else {
    score += 7;
  }

  score += Math.round(Math.max(0, Math.min(100, work.confidence)) * 0.25);

  const phase = normalizedPhase(work.fase);
  if (/projeto|aprovacao|licenc|alvara/.test(phase)) {
    score += 22;
    reasons.push("fase ideal para definição de fornecedor");
  } else if (/fundacao|terraplen|movimentacao|inicio/.test(phase)) {
    score += 18;
    reasons.push("obra em início");
  } else if (/estrutura/.test(phase)) {
    score += 12;
  } else if (/fechamento|alvenaria|cobertura/.test(phase)) {
    score += 7;
  } else if (/acabamento/.test(phase)) {
    score += 3;
  } else if (/conclu/.test(phase)) {
    score -= 18;
  }

  if (work.proprietario) {
    score += 8;
    reasons.push("proprietário identificado");
  }
  if (work.responsavelTecnico) {
    score += 9;
    reasons.push("responsável técnico identificado");
  }
  if (work.construtora || work.incorporadora) score += 5;
  if (work.endereco) score += 4;

  if (work.dataReferencia) {
    const time = new Date(`${work.dataReferencia}T12:00:00Z`).getTime();
    if (Number.isFinite(time)) {
      const ageDays = Math.max(0, Math.floor((Date.now() - time) / 86_400_000));
      if (ageDays <= 30) {
        score += 7;
        reasons.push("sinal recente");
      } else if (ageDays <= 90) {
        score += 4;
      } else if (ageDays > 365) {
        score -= 8;
      }
    }
  }

  score = Math.max(0, Math.min(100, score));
  const priority = score >= 80 ? "alta" : score >= 60 ? "media" : "baixa";

  let recommendedActor: "proprietario" | "responsavel_tecnico" | "construtora" | "incorporadora" | "identificar" = "identificar";
  if (/projeto|aprovacao|licenc|alvara/.test(phase) && work.responsavelTecnico) {
    recommendedActor = "responsavel_tecnico";
  } else if (work.proprietario) {
    recommendedActor = "proprietario";
  } else if (work.responsavelTecnico) {
    recommendedActor = "responsavel_tecnico";
  } else if (work.incorporadora) {
    recommendedActor = "incorporadora";
  } else if (work.construtora) {
    recommendedActor = "construtora";
  }

  return {
    score,
    priority,
    reason: reasons.slice(0, 4).join(" · ") || "sinal de obra a validar",
    recommendedActor,
  };
}

function findCitedSource(
  candidateUrl: string | null,
  sources: Array<{
    url: string;
    title: string;
    family: ConstructionSourceFamily;
    authority: ConstructionSourceAuthority;
  }>,
) {
  if (!candidateUrl) return null;
  const candidate = canonicalUrl(candidateUrl);
  if (!candidate) return null;

  return sources.find((source) => {
    const cited = canonicalUrl(source.url);
    if (!cited) return false;
    return cited === candidate || cited.startsWith(candidate) || candidate.startsWith(cited);
  }) ?? null;
}

function makeId(input: {
  obra: string;
  local: string;
  sourceUrl: string | null;
  index: number;
}): string {
  const raw = [input.obra, input.local, input.sourceUrl ?? "", String(input.index)]
    .join("|")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9à-ú]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return raw || `obra-${input.index + 1}`;
}

function normalizeCitySlug(locality: string): string | null {
  const city = locality.split(",")[0]?.trim();
  if (!city) return null;
  return city
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim() || null;
}

function detectUf(locality: string): string | null {
  const match = locality.toUpperCase().match(/(?:,|\s)\s*(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)(?:\b|$)/);
  return match?.[1] ?? null;
}

function buildSpecificSourceHints(locality: string): string[] {
  const uf = detectUf(locality);
  const citySlug = normalizeCitySlug(locality);
  const hints = [
    "Portal oficial da Prefeitura/Secretaria de Urbanismo: alvará de construção, aprovação de projeto, licenças, processos urbanísticos, habite-se e dados abertos.",
    "Diário Oficial do Município e Diário Oficial do Estado: aprovações, licenças, autorizações, editais e atos administrativos ligados à obra.",
    "CREA/CONFEA e CAU: páginas públicas indexáveis sobre ART/RRT, responsável técnico, empresas e profissionais relacionados à obra.",
    "Órgãos ambientais municipais/estaduais e IBAMA quando a obra exigir licenciamento ambiental.",
    "Site oficial da incorporadora/construtora e do arquiteto/engenheiro responsável, quando citarem o empreendimento específico.",
    "Notícias locais e portais imobiliários somente como fonte complementar; prefira confirmar com uma fonte oficial ou primária.",
  ];

  if (uf === "SC") {
    hints.push(
      "Santa Catarina: pesquise especialmente Diário Oficial dos Municípios de SC (diariomunicipal.sc.gov.br), Diário Oficial do Estado de SC, CREA-SC, CAU/SC e IMA-SC.",
    );
    if (citySlug) {
      hints.push(
        `Para município em SC, tente também o portal municipal oficial e buscas do tipo site:${citySlug}.sc.gov.br alvará obra aprovação projeto.`,
      );
    }
  }

  return hints;
}

function searchPasses(locality: string): SearchPass[] {
  const hints = buildSpecificSourceHints(locality);
  return [
    {
      id: "official",
      instruction: [
        "PASSO A — FONTES OFICIAIS/REGULATÓRIAS. Faça buscas específicas e não genéricas.",
        ...hints.slice(0, 4),
        "Priorize endereço da obra, número/nome do empreendimento, proprietário/contratante quando explicitamente publicado e responsável técnico.",
      ].join("\n"),
    },
    {
      id: "primary",
      instruction: [
        "PASSO B — FONTES PRIMÁRIAS E COMPLEMENTARES.",
        ...hints.slice(4),
        "Procure páginas do empreendimento, construtora/incorporadora, arquiteto/engenheiro, notícias locais e portais imobiliários.",
        "Use fonte secundária apenas quando ela trouxer uma obra individualizada e verificável.",
      ].join("\n"),
    },
  ];
}

function buildSchemaExample() {
  return JSON.stringify({
    works: [
      {
        obra: "Nome ou descrição curta da obra",
        categoria: "residencial|comercial|empreendimento|industrial|outro",
        local: "Cidade/UF ou bairro/cidade",
        endereco: "Endereço da obra quando publicado, ou null",
        proprietario: "Proprietário/contratante quando explicitamente público, ou null",
        proprietarioTipo: "pessoa|empresa|orgao_publico|nao_informado",
        responsavelTecnico: "Arquiteto/engenheiro quando publicado, ou null",
        construtora: "Construtora quando publicada, ou null",
        incorporadora: "Incorporadora quando publicada, ou null",
        fase: "projeto|aprovação|fundação|estrutura|fechamento|acabamento|concluída|a validar",
        evidencia: "Resumo factual de até 220 caracteres explicando por que é uma obra real e atual/relevante",
        dataReferencia: "YYYY-MM-DD quando houver data verificável, ou null",
        sourceUrl: "URL pública principal citada pela própria pesquisa, ou null",
        sourceTitle: "Título/nome da fonte, ou null",
        confidence: 0,
      },
    ],
  });
}

function parsePass(
  response: any,
  input: {
    locality: string;
    maxResults: number;
  },
): {
  works: ConstructionWorkSignal[];
  sources: ConstructionWorkSearchResult["sources"];
} {
  const outputText = String(response?.output_text ?? "").trim();
  const sources = extractSources(response);
  if (!outputText) return { works: [], sources };

  let parsed: { works?: RawWork[] };
  try {
    parsed = JSON.parse(cleanJsonText(outputText)) as { works?: RawWork[] };
  } catch {
    return { works: [], sources };
  }

  const rawWorks = Array.isArray(parsed.works) ? parsed.works.slice(0, input.maxResults) : [];
  const works = rawWorks
    .map((raw, index): ConstructionWorkSignal | null => {
      const obra = nullableString(raw.obra);
      const local = nullableString(raw.local) ?? input.locality.trim();
      const evidencia = nullableString(raw.evidencia);
      if (!obra || !evidencia) return null;

      const requestedSourceUrl = nullableHttpUrl(raw.sourceUrl);
      const citedSource = findCitedSource(requestedSourceUrl, sources);
      const sourceUrl = citedSource?.url ?? null;
      const sourceTitle = citedSource?.title ?? nullableString(raw.sourceTitle);
      const classification = sourceUrl
        ? classifyConstructionSource(sourceUrl, sourceTitle ?? "")
        : { family: "outro" as const, authority: "secundaria" as const };

      // Dados de proprietário só são mantidos quando existe fonte efetivamente citada.
      const proprietario = citedSource ? nullableString(raw.proprietario) : null;
      const ownerTypeRaw = nullableString(raw.proprietarioTipo);
      const proprietarioTipo: ConstructionWorkSignal["proprietarioTipo"] =
        proprietario && (
          ownerTypeRaw === "pessoa" ||
          ownerTypeRaw === "empresa" ||
          ownerTypeRaw === "orgao_publico"
        )
          ? ownerTypeRaw
          : "nao_informado";

      const normalizedWork = {
        id: makeId({ obra, local, sourceUrl, index }),
        obra,
        categoria: nullableString(raw.categoria),
        local,
        endereco: nullableString(raw.endereco),
        proprietario,
        proprietarioTipo,
        responsavelTecnico: nullableString(raw.responsavelTecnico),
        construtora: nullableString(raw.construtora),
        incorporadora: nullableString(raw.incorporadora),
        fase: nullableString(raw.fase),
        evidencia,
        dataReferencia: nullableString(raw.dataReferencia),
        sourceUrl,
        sourceTitle,
        sourceFamily: classification.family,
        sourceAuthority: classification.authority,
        confidence: Math.min(
          100,
          normalizeConfidence(raw.confidence) + sourceConfidenceBonus(classification.authority),
        ),
      };
      const opportunity = scoreConstructionOpportunity(normalizedWork);
      return {
        ...normalizedWork,
        opportunityScore: opportunity.score,
        priority: opportunity.priority,
        priorityReason: opportunity.reason,
        recommendedActor: opportunity.recommendedActor,
      };
    })
    .filter((item): item is ConstructionWorkSignal => item !== null);

  return { works, sources };
}

function workDedupeKey(work: ConstructionWorkSignal): string {
  return [
    work.endereco || work.obra,
    work.local,
  ]
    .join("|")
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mergeWorks(works: ConstructionWorkSignal[], maxResults: number): ConstructionWorkSignal[] {
  const bestByKey = new Map<string, ConstructionWorkSignal>();

  for (const work of works) {
    const key = workDedupeKey(work);
    const current = bestByKey.get(key);
    if (!current || work.confidence > current.confidence) {
      bestByKey.set(key, work);
    }
  }

  return [...bestByKey.values()]
    .sort((a, b) => {
      const authorityWeight = { oficial: 3, primaria: 2, secundaria: 1 } as const;
      const scoreDiff = b.opportunityScore - a.opportunityScore;
      if (scoreDiff) return scoreDiff;
      const authorityDiff = authorityWeight[b.sourceAuthority] - authorityWeight[a.sourceAuthority];
      return authorityDiff || b.confidence - a.confidence;
    })
    .slice(0, maxResults);
}

function mergeSources(
  sourceLists: ConstructionWorkSearchResult["sources"][],
): ConstructionWorkSearchResult["sources"] {
  const seen = new Set<string>();
  const merged: ConstructionWorkSearchResult["sources"] = [];

  for (const source of sourceLists.flat()) {
    const key = canonicalUrl(source.url) ?? source.url;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(source);
  }

  return merged.slice(0, 40);
}

export async function searchConstructionWorkSignals(input: {
  tenantId: string;
  category: string;
  model: string;
  locality: string;
  intervention?: string;
  standard?: string;
  phase?: string;
  productInterest?: string;
  geo?: { lat: number; lng: number; radiusKm: number };
  maxResults?: number;
}): Promise<ConstructionWorkSearchResult> {
  const retrievedAt = new Date().toISOString();
  const maxResults = Math.max(1, Math.min(15, input.maxResults ?? 10));
  const query = [
    input.category,
    input.model,
    input.intervention,
    input.standard,
    input.phase,
    input.productInterest,
    input.locality,
  ].filter(Boolean).join(" · ");

  const openai = await getOpenAIForTenant(input.tenantId);
  const model =
    process.env.PROSPECTOR_WORKS_WEB_MODEL?.trim() ||
    process.env.JARVIS_WEB_SEARCH_MODEL?.trim() ||
    "gpt-5.6-luna";

  const commonSystem = [
    "Você é o Radar de Obras da VendorAI.",
    "Pesquise a web agora e identifique obras/empreendimentos reais, individualizados e compatíveis com os filtros.",
    "NÃO retorne apenas empresas genéricas. Cada item deve representar uma obra, endereço, empreendimento, projeto ou processo de obra específico.",
    "O campo proprietario/contratante só pode ser preenchido quando o nome estiver explicitamente publicado em uma fonte pública citada e diretamente ligada à obra.",
    "Nunca deduza proprietário por endereço, sobrenome, empresa semelhante, cadastro imobiliário ou qualquer outra inferência.",
    "Não inclua telefone, e-mail, CPF, RG, documento pessoal ou endereço residencial do proprietário.",
    "Nome de pessoa só pode aparecer quando publicado no contexto profissional/cadastral da obra.",
    "Se não houver proprietário público, use null e mantenha a obra se houver evidência suficiente.",
    "Não invente endereço, fase, responsável técnico, construtora, incorporadora, data ou fonte.",
    "O sourceUrl deve ser uma URL que a sua própria pesquisa web realmente consultou/citou. Não fabrique URL.",
    "Retorne APENAS JSON válido, sem markdown e sem texto fora do JSON.",
  ].join("\n");

  const commonUser = [
    `Localidade alvo: ${input.locality}`,
    ...(input.geo ? [
      `Centro geográfico: latitude ${input.geo.lat}, longitude ${input.geo.lng}`,
      `Raio máximo: ${input.geo.radiusKm} km. Priorize e retorne somente obras compatíveis com essa área geográfica; descarte sinais claramente fora do raio.`,
    ] : []),
    `Categoria: ${input.category}`,
    `Modelo/tipo: ${input.model}`,
    `Intervenção: ${input.intervention || "não especificada"}`,
    `Padrão: ${input.standard || "não especificado"}`,
    `Fase desejada: ${input.phase || "não especificada"}`,
    `Produto/serviço de interesse: ${input.productInterest || "não especificado"}`,
    `Máximo de resultados neste passe: ${Math.max(4, Math.ceil(maxResults * 0.8))}`,
    "",
    "Formato exato:",
    buildSchemaExample(),
  ].join("\n");

  const passes = searchPasses(input.locality);
  const responses = await Promise.all(
    passes.map((pass) =>
      (openai.responses.create as any)({
        model,
        tools: [{ type: "web_search" }],
        tool_choice: "auto",
        input: [
          {
            role: "system",
            content: `${commonSystem}\n\n${pass.instruction}`,
          },
          {
            role: "user",
            content: commonUser,
          },
        ],
        max_output_tokens: 3600,
      }),
    ),
  );

  const parsed = responses.map((response) =>
    parsePass(response, {
      locality: input.locality,
      maxResults: Math.max(4, Math.ceil(maxResults * 0.8)),
    }),
  );

  const works = mergeWorks(parsed.flatMap((item) => item.works), maxResults);
  const sources = mergeSources(parsed.map((item) => item.sources));

  return { query, works, sources, retrievedAt };
}

export function constructionSourceLabel(family: ConstructionSourceFamily): string {
  return SOURCE_FAMILY_LABELS[family];
}
