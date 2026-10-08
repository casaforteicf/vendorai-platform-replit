import { Router, type IRouter } from "express";
import type { Logger } from "pino";
import { z } from "zod/v4";
import { and, asc, eq, desc, or, sql, inArray, isNotNull } from "drizzle-orm";
import {
  db,
  prospectEnrichmentsTable,
  prospectApprovalsTable,
  leadsTable,
  tenantsTable,
  notificationsTable,
  funisTable,
  dealsTable,
  activitiesTable,
  prospectorConfigTable,
  prospectorQueueTable,
  sdrVerticalProfilesTable,
  segmentBenchmarksTable,
  leadEventsTable,
  cnaeVerticalMapTable,
  prospectFeedbackTable,
  campaignsTable,
  businessProfilesTable,
  produtosCatalogoTable,
  insertProspectFeedbackSchema,
} from "@workspace/db";
import { registerLeadFeedback } from "../lib/prospectorMemory.js";
import {
  callOpenAI as gatewayCallOpenAI,
  generateEmbedding,
} from "../lib/ai-gateway.js";
import { checkApiQuota, getApiUsage } from "../lib/api-quota.js";
import { dispatchAgentBackground } from "../services/agent-dispatch.js";
import { enrichLead } from "../jobs/leadEnrichment.js";
import { searchConstructionWorkSignals, scoreConstructionOpportunity } from "../services/construction-radar-search.js";
import {
  searchByCnae,
  getCompanyByCnpj,
  searchMetaAds,
  buildLinkedInSearchUrl,
  normalizeCnpj,
  normalizeName,
} from "../services/cnpjService.js";
import { leadRegistrationMetadata, normalizeInstagramHandle, normalizeLeadEmail, normalizeLeadName } from "../lib/lead-registration-standard.js";
import { intakeColdProspect } from "../services/cold-prospect-intake.js";

// Quantidade de aprovações (approved + edited) para liberar a automação.
const AUTOMATION_THRESHOLD = 50;

// ── Briefing automático de IA — fire-and-forget após criar deal ───────────────
async function gerarBriefingDeal(
  tenantId: string,
  dealId: string,
  nome: string,
  endereco: string | null,
  telefone: string | null,
  site: string | null,
  rating: number | null,
  reviewCount: number | null,
  pontosFortes: string[],
  doresPrincipais: string[],
  log: Logger,
): Promise<void> {
  try {
    const ai = await gatewayCallOpenAI(
      tenantId,
      "intelligence_analysis",
      [
        {
          role: "system",
          content:
            "Você é um analista de inteligência comercial da Vendor.ai. Gere um briefing comercial estruturado para orientar o time de vendas.",
        },
        {
          role: "user",
          content: `Empresa: ${nome}
Endereço: ${endereco ?? "não disponível"}
Telefone: ${telefone ?? "não disponível"}
Site: ${site ?? "não disponível"}
Avaliação Google: ${rating != null ? `${rating}★ (${reviewCount ?? 0} avaliações)` : "não disponível"}
Pontos fortes identificados: ${pontosFortes.join(", ") || "nenhum"}
Possíveis dores: ${doresPrincipais.join(", ") || "nenhum"}

Gere um briefing com exatamente estas seções:

1. PERFIL DO NEGÓCIO (2-3 linhas): O que a empresa faz, porte estimado, posicionamento
2. PONTOS DE DOR PROVÁVEIS (3 bullets): Principais problemas em vendas, atendimento e gestão
3. OPORTUNIDADE VENDOR.AI (2-3 linhas): Como a Vendor.ai resolve os problemas identificados
4. ABORDAGEM RECOMENDADA (1-2 linhas): Tom e ângulo ideal para a primeira abordagem
5. SCORE DE POTENCIAL: Alta / Média / Baixa — com justificativa em 1 linha

Seja específico para o segmento e localidade. Não seja genérico.`,
        },
      ],
      { maxTokens: 700, log },
    );
    await db
      .update(dealsTable)
      .set({ aiBriefing: ai.content, aiBriefingGeneratedAt: new Date() })
      .where(eq(dealsTable.id, dealId));
  } catch (err) {
    log.error({ err }, "prospector: gerarBriefingDeal falhou");
  }
}

// Formata um vetor JS para o literal aceito pelo pgvector (ex: "[0.1,0.2,...]").
function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

const router: IRouter = Router();

// Garante que um leadId opcional pertence ao tenant resolvido (isolamento multi-tenant)
async function assertLeadInTenant(leadId: string, tenantId: string): Promise<void> {
  const [lead] = await db
    .select({ id: leadsTable.id })
    .from(leadsTable)
    .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)))
    .limit(1);
  if (!lead) {
    throw Object.assign(new Error("Lead não encontrado para este tenant"), { status: 404 });
  }
}

// ── Google Places (New) — Text Search ─────────────────────────────────────────
type PlacesResult = {
  nomeEmpresa: string | null;
  endereco: string | null;
  rating: number | null;
  reviewCount: number | null;
  telefone: string | null;
  siteOficial: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

type PlacesResultWithId = PlacesResult & { placeId: string };

const PLACES_FIELD_MASK =
  "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.nationalPhoneNumber,places.websiteUri";

/** Fetches one page of Places results; returns items + nextPageToken */
async function fetchPlacesPage(
  query: string,
  pageToken: string | null,
  log?: { error: (o: unknown, m?: string) => void },
): Promise<{ items: PlacesResultWithId[]; nextPageToken: string | null }> {
  const apiKey = process.env["GOOGLE_PLACES_API_KEY"];
  if (!apiKey) throw Object.assign(new Error("GOOGLE_PLACES_API_KEY não configurada"), { status: 500 });

  const body: Record<string, unknown> = {
    textQuery: query,
    languageCode: "pt-BR",
    maxResultCount: 20,
  };
  if (pageToken) body["pageToken"] = pageToken;

  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": PLACES_FIELD_MASK,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    log?.error({ status: res.status, text }, "prospector: Google Places page call failed");
    throw Object.assign(new Error(`Google Places API erro ${res.status}`), { status: 502 });
  }

  const data = (await res.json()) as {
    places?: Array<{
      id?: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      rating?: number;
      userRatingCount?: number;
      nationalPhoneNumber?: string;
      websiteUri?: string;
    }>;
    nextPageToken?: string;
  };

  const items: PlacesResultWithId[] = (data.places ?? [])
    .filter((p) => !!p.id)
    .map((p) => ({
      placeId: p.id!,
      nomeEmpresa: p.displayName?.text ?? null,
      endereco: p.formattedAddress ?? null,
      rating: typeof p.rating === "number" ? p.rating : null,
      reviewCount: typeof p.userRatingCount === "number" ? p.userRatingCount : null,
      telefone: p.nationalPhoneNumber ?? null,
      siteOficial: p.websiteUri ?? null,
    }));

  return { items, nextPageToken: data.nextPageToken ?? null };
}

/**
 * Paginates through ALL Google Places results for a given query (max 60 — 3 pages of 20).
 * Used by the automatic cron job that populates prospector_queue.
 */
export async function searchAllPlaces(
  query: string,
  log?: { error: (o: unknown, m?: string) => void },
  geo?: { lat: number; lng: number; radiusKm: number },
): Promise<PlacesResultWithId[]> {
  const all: PlacesResultWithId[] = [];
  const effectiveQuery = geo
    ? `${query} num raio de ${geo.radiusKm} km do ponto ${geo.lat}, ${geo.lng}`
    : query;
  let pageToken: string | null = null;
  let pages = 0;
  const MAX_PAGES = 3; // Google Places (New) returns max 60 results total

  do {
    const { items, nextPageToken } = await fetchPlacesPage(effectiveQuery, pageToken, log);
    all.push(...items);
    pageToken = nextPageToken;
    pages++;
    // Brief pause between pages to avoid rate-limit
    if (pageToken && pages < MAX_PAGES) await new Promise((r) => setTimeout(r, 300));
  } while (pageToken && pages < MAX_PAGES);

  return all;
}

async function searchPlace(
  query: string,
  log?: { error: (o: unknown, m?: string) => void },
): Promise<PlacesResult | null> {
  const apiKey = process.env["GOOGLE_PLACES_API_KEY"];
  if (!apiKey) {
    throw Object.assign(new Error("GOOGLE_PLACES_API_KEY não configurada"), { status: 500 });
  }

  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.nationalPhoneNumber,places.websiteUri",
    },
    body: JSON.stringify({ textQuery: query, languageCode: "pt-BR", maxResultCount: 1 }),
  });

  if (!res.ok) {
    const text = await res.text();
    log?.error({ status: res.status, text }, "prospector: Google Places call failed");
    throw Object.assign(new Error(`Google Places API erro ${res.status}`), { status: 502 });
  }

  const data = (await res.json()) as {
    places?: Array<{
      displayName?: { text?: string };
      formattedAddress?: string;
      rating?: number;
      userRatingCount?: number;
      nationalPhoneNumber?: string;
      websiteUri?: string;
    }>;
  };

  const place = data.places?.[0];
  if (!place) return null;

  return {
    nomeEmpresa: place.displayName?.text ?? null,
    endereco: place.formattedAddress ?? null,
    rating: typeof place.rating === "number" ? place.rating : null,
    reviewCount: typeof place.userRatingCount === "number" ? place.userRatingCount : null,
    telefone: place.nationalPhoneNumber ?? null,
    siteOficial: place.websiteUri ?? null,
  };
}

// Busca múltiplos estabelecimentos por atividade comercial + localidade.
async function searchPlaces(
  query: string,
  maxResults: number,
  log?: { error: (o: unknown, m?: string) => void },
  geo?: { lat: number; lng: number; radiusKm: number },
): Promise<PlacesResult[]> {
  const apiKey = process.env["GOOGLE_PLACES_API_KEY"];
  if (!apiKey) {
    throw Object.assign(new Error("GOOGLE_PLACES_API_KEY não configurada"), { status: 500 });
  }

  const requestBody: Record<string, unknown> = {
    textQuery: query,
    languageCode: "pt-BR",
    maxResultCount: Math.min(Math.max(maxResults, 1), 20),
  };
  if (geo) {
    requestBody["locationBias"] = {
      circle: {
        center: { latitude: geo.lat, longitude: geo.lng },
        radius: Math.min(Math.max(geo.radiusKm, 1), 100) * 1000,
      },
    };
  }

  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.nationalPhoneNumber,places.websiteUri,places.location",
    },
    body: JSON.stringify(requestBody),
  });

  if (!res.ok) {
    const text = await res.text();
    log?.error({ status: res.status, text }, "prospector: Google Places list call failed");
    throw Object.assign(new Error(`Google Places API erro ${res.status}`), { status: 502 });
  }

  const data = (await res.json()) as {
    places?: Array<{
      displayName?: { text?: string };
      formattedAddress?: string;
      rating?: number;
      userRatingCount?: number;
      nationalPhoneNumber?: string;
      websiteUri?: string;
      location?: { latitude?: number; longitude?: number };
    }>;
  };

  const mapped = (data.places ?? []).map((place) => ({
    nomeEmpresa: place.displayName?.text ?? null,
    endereco: place.formattedAddress ?? null,
    rating: typeof place.rating === "number" ? place.rating : null,
    reviewCount: typeof place.userRatingCount === "number" ? place.userRatingCount : null,
    telefone: place.nationalPhoneNumber ?? null,
    siteOficial: place.websiteUri ?? null,
    latitude: typeof place.location?.latitude === "number" ? place.location.latitude : null,
    longitude: typeof place.location?.longitude === "number" ? place.location.longitude : null,
  }));

  if (!geo) return mapped;

  const earthRadiusKm = 6371;
  const toRad = (value: number) => value * Math.PI / 180;
  return mapped.filter((place) => {
    if (place.latitude == null || place.longitude == null) return false;
    const dLat = toRad(place.latitude - geo.lat);
    const dLng = toRad(place.longitude - geo.lng);
    const lat1 = toRad(geo.lat);
    const lat2 = toRad(place.latitude);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    const distanceKm = 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
    return distanceKm <= geo.radiusKm;
  });
}

// ── ReceitaWS — consulta pública de CNPJ ──────────────────────────────────────
type ReceitaResult = {
  cnpj: string;
  razaoSocial: string | null;
  nomeFantasia: string | null;
  situacaoCadastral: string | null;
  atividadePrincipal: string | null;
  telefone: string | null;
};

async function fetchReceita(
  rawCnpj: string,
  log?: { error: (o: unknown, m?: string) => void },
): Promise<ReceitaResult | null> {
  const cnpj = rawCnpj.replace(/\D/g, "");
  if (cnpj.length !== 14) return null;

  try {
    const res = await fetch(`https://receitaws.com.br/v1/cnpj/${cnpj}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      log?.error({ status: res.status }, "prospector: ReceitaWS call failed");
      return null;
    }
    const data = (await res.json()) as {
      status?: string;
      nome?: string;
      fantasia?: string;
      situacao?: string;
      telefone?: string;
      atividade_principal?: Array<{ text?: string }>;
    };
    if (data.status === "ERROR") return null;
    return {
      cnpj,
      razaoSocial: data.nome ?? null,
      nomeFantasia: data.fantasia ?? null,
      situacaoCadastral: data.situacao ?? null,
      atividadePrincipal: data.atividade_principal?.[0]?.text ?? null,
      telefone: data.telefone ? data.telefone.split("/")[0]?.trim() ?? null : null,
    };
  } catch (err) {
    log?.error({ err }, "prospector: ReceitaWS request error");
    return null;
  }
}

// ── WhatsApp heurístico ───────────────────────────────────────────────────────
// Telefone celular brasileiro (9 dígitos, iniciando por 9 após o DDD) tem WhatsApp.
function deriveWhatsapp(telefone: string | null): string | null {
  if (!telefone) return null;
  const digits = telefone.replace(/\D/g, "");
  const local = digits.length > 11 ? digits.slice(-11) : digits; // remove DDI se houver
  if (local.length === 11 && local[2] === "9") return telefone;
  return null;
}

// ── Lead Scoring ──────────────────────────────────────────────────────────────
// ATENÇÃO: esquema PROVISÓRIO. Substituir pelos pesos exatos dos "critérios do
// Módulo 3" quando fornecidos. Função isolada de propósito para facilitar a troca.
type ScoreInput = {
  temContato: boolean;
  rating: number | null;
  reviewCount: number | null;
  siteOficial: string | null;
  instagram: string | null;
  situacaoCadastral: string | null;
  nivelPresencaDigital: string | null;
};

function computeScore(i: ScoreInput): number {
  let score = 0;
  if (i.temContato) score += 25;

  if (i.rating != null) {
    if (i.rating >= 4.5) score += 20;
    else if (i.rating >= 4.0) score += 15;
    else if (i.rating >= 3.0) score += 5;
  }

  if (i.reviewCount != null) {
    if (i.reviewCount >= 100) score += 15;
    else if (i.reviewCount >= 30) score += 10;
    else if (i.reviewCount >= 5) score += 5;
  }

  if (i.siteOficial) score += 10;
  if (i.instagram) score += 10;
  if (i.situacaoCadastral && /ativa/i.test(i.situacaoCadastral)) score += 10;

  const nivel = (i.nivelPresencaDigital ?? "").toLowerCase();
  if (nivel.includes("alto")) score += 10;
  else if (nivel.includes("médio") || nivel.includes("medio")) score += 5;

  return Math.min(100, score);
}

function resolveTenantId(req: Express.Request, bodyTenantId?: string): string {
  const user = req.user;
  if (!user) throw Object.assign(new Error("Não autenticado"), { status: 401 });
  if (user.platformRole === "super_admin") {
    const tid = bodyTenantId ?? user.tenantId ?? undefined;
    if (!tid) throw Object.assign(new Error("tenantId é obrigatório para super_admin"), { status: 400 });
    return tid;
  }
  const tid = user.tenantId;
  if (!tid) throw Object.assign(new Error("Usuário sem tenant associado"), { status: 403 });
  return tid;
}

// ── POST /prospector/enrich ───────────────────────────────────────────────────
const enrichBodySchema = z.object({
  nomeEmpresa: z.string().min(2, "Informe o nome da empresa"),
  endereco: z.string().optional(),
  cnpj: z.string().optional(),
  instagram: z.string().optional(),
  leadId: z.string().optional(),
  tenantId: z.string().optional(),
});

router.post("/prospector/enrich", async (req, res) => {
  const parsed = enrichBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Dados inválidos", details: parsed.error.flatten() });
  }
  const { nomeEmpresa, endereco, cnpj, instagram, leadId, tenantId: bodyTenantId } = parsed.data;
  const tenantId = resolveTenantId(req, bodyTenantId);
  if (leadId) await assertLeadInTenant(leadId, tenantId);

  // 1. Google Places lookup (cota por tenant)
  await checkApiQuota(tenantId, "google_places", req.log);
  const query = endereco ? `${nomeEmpresa} ${endereco}` : nomeEmpresa;
  const place = await searchPlace(query, req.log);

  // 2. ReceitaWS (apenas quando um CNPJ é informado)
  const receita = cnpj ? await fetchReceita(cnpj, req.log) : null;

  const nome = receita?.nomeFantasia ?? place?.nomeEmpresa ?? nomeEmpresa;
  const ender = place?.endereco ?? endereco ?? null;
  const telefone = place?.telefone ?? receita?.telefone ?? null;
  const whatsapp = deriveWhatsapp(telefone);
  const igHandle = instagram ?? null;
  const site = place?.siteOficial ?? null;

  // 3. AI Gateway — análise de negócio (NÃO chama OpenAI diretamente)
  let pontosFortes: string[] = [];
  let doresPrincipais: string[] = [];
  let publicoAlvo: string | null = null;
  let tipoNegocio: string | null = null;
  let nivelPresencaDigital: string | null = null;
  let resumoNegocio: string | null = null;
  try {
    const ai = await gatewayCallOpenAI(
      tenantId,
      "intelligence_analysis",
      [
        {
          role: "system",
          content:
            "Você é um analista de prospecção B2B. Dado os dados públicos de uma empresa, responda APENAS " +
            "um JSON no formato " +
            '{"pontos_fortes": string[], "dores_principais": string[], "publico_alvo": string, ' +
            '"tipo_negocio": string, "nivel_presenca_digital": "alto"|"médio"|"baixo", "resumo_negocio": string}. ' +
            "Listas com no máximo 4 itens. Tudo em português do Brasil.",
        },
        {
          role: "user",
          content: JSON.stringify({
            nome,
            endereco: ender,
            rating: place?.rating ?? null,
            reviewCount: place?.reviewCount ?? null,
            telefone,
            instagram: igHandle,
            site,
            atividadePrincipal: receita?.atividadePrincipal ?? null,
            situacaoCadastral: receita?.situacaoCadastral ?? null,
          }),
        },
      ],
      { responseFormat: { type: "json_object" }, maxTokens: 700, log: req.log },
    );
    const json = JSON.parse(ai.content) as {
      pontos_fortes?: string[];
      dores_principais?: string[];
      publico_alvo?: string;
      tipo_negocio?: string;
      nivel_presenca_digital?: string;
      resumo_negocio?: string;
    };
    pontosFortes = Array.isArray(json.pontos_fortes) ? json.pontos_fortes : [];
    doresPrincipais = Array.isArray(json.dores_principais) ? json.dores_principais : [];
    publicoAlvo = typeof json.publico_alvo === "string" ? json.publico_alvo : null;
    tipoNegocio = typeof json.tipo_negocio === "string" ? json.tipo_negocio : null;
    nivelPresencaDigital =
      typeof json.nivel_presenca_digital === "string" ? json.nivel_presenca_digital : null;
    resumoNegocio = typeof json.resumo_negocio === "string" ? json.resumo_negocio : null;
  } catch (err) {
    req.log.error({ err }, "prospector: AI enrichment failed");
  }

  // 4. Regra de filtragem — sem nenhum canal de contato, não salva.
  const temContato = Boolean(telefone || whatsapp || igHandle);
  const collected = {
    nomeEmpresa: nome,
    endereco: ender,
    rating: place?.rating ?? null,
    reviewCount: place?.reviewCount ?? null,
    telefone,
    whatsapp,
    instagram: igHandle,
    siteOficial: site,
    cnpj: receita?.cnpj ?? (cnpj ? cnpj.replace(/\D/g, "") : null),
    razaoSocial: receita?.razaoSocial ?? null,
    nomeFantasia: receita?.nomeFantasia ?? null,
    situacaoCadastral: receita?.situacaoCadastral ?? null,
    atividadePrincipal: receita?.atividadePrincipal ?? null,
    pontosFortes,
    doresPrincipais,
    publicoAlvo,
    tipoNegocio,
    nivelPresencaDigital,
    resumoNegocio,
  };

  if (!temContato) {
    return res.status(200).json({
      saved: false,
      reason: "Sem telefone, WhatsApp ou Instagram (tem_contato = false)",
      enrichment: { ...collected, temContato: false, scoreProspector: computeScore({ ...collected, temContato: false }) },
    });
  }

  // 5. Lead Scoring (esquema provisório — ver computeScore)
  const scoreProspector = computeScore({ ...collected, temContato });

  // 6. Deduplicação de leads — telefone ou CNPJ antes de criar novo registro.
  let resolvedLeadId = leadId ?? null;
  let isDuplicate = false;
  if (!resolvedLeadId) {
    const cnpjDigits = collected.cnpj;
    const telDigits = telefone ? telefone.replace(/\D/g, "") : null;
    const conds = [eq(leadsTable.tenantId, tenantId)];
    const matchers = [] as ReturnType<typeof eq>[];
    if (telDigits) {
      // Compara apenas dígitos para evitar duplicatas por formatação distinta.
      matchers.push(
        sql`regexp_replace(${leadsTable.telefone}, '[^0-9]', '', 'g') = ${telDigits}` as ReturnType<
          typeof eq
        >,
      );
    }
    if (cnpjDigits) matchers.push(eq(leadsTable.documento, cnpjDigits));
    if (matchers.length > 0) {
      const [existing] = await db
        .select({ id: leadsTable.id })
        .from(leadsTable)
        .where(and(conds[0]!, matchers.length === 1 ? matchers[0]! : or(...matchers)!))
        .limit(1);
      if (existing) {
        resolvedLeadId = existing.id;
        isDuplicate = true;
      }
    }
    if (!resolvedLeadId) {
      const [created] = await db
        .insert(leadsTable)
        .values({
          tenantId,
          nome: normalizeLeadName(nome, "Lead prospectado"),
          telefone,
          documento: cnpjDigits ?? null,
          empresa: collected.razaoSocial ?? nome,
          endereco: ender,
          instagramHandle: normalizeInstagramHandle(igHandle),
          websiteUrl: site,
          source: "prospector",
          tipoPessoa: "juridica",
          dadosPj: {
            cnpj: collected.cnpj ?? null,
            razaoSocial: collected.razaoSocial ?? null,
            segmento: collected.atividadePrincipal ?? null,
          },
          metadata: leadRegistrationMetadata({
            rating: place?.rating ?? null,
            total_ratings: place?.reviewCount ?? null,
            prospectado_em: new Date().toISOString(),
          }, {
            entryChannel: "prospeccao",
            entrySource: "prospector",
            details: { provider: "google_places" },
          }),
        })
        .returning({ id: leadsTable.id });
      resolvedLeadId = created?.id ?? null;
    }
  }

  // 6b. Criar deal no primeiro funil do tenant (apenas para leads novos)
  let dealId: string | null = null;
  if (resolvedLeadId && !isDuplicate) {
    try {
      const [funil] = await db
        .select({ id: funisTable.id })
        .from(funisTable)
        .where(eq(funisTable.tenantId, tenantId))
        .orderBy(asc(funisTable.createdAt))
        .limit(1);

      const [newDeal] = await db
        .insert(dealsTable)
        .values({
          tenantId,
          leadId: resolvedLeadId,
          titulo: `${nome} — Prospectado`,
          funilId: funil?.id ?? null,
          etapa: "novo",
        })
        .returning({ id: dealsTable.id });
      dealId = newDeal?.id ?? null;

      if (dealId) {
        await db.insert(activitiesTable).values({
          tenantId,
          leadId: resolvedLeadId,
          dealId,
          tipo: "tarefa",
          titulo: "Lead importado via Prospector",
          descricao: `Lead importado via Prospector (Google Places).${place?.rating != null ? ` Avaliação: ${place.rating}★${place?.reviewCount != null ? ` (${place.reviewCount})` : ""}.` : ""}`,
          status: "concluida",
        });

        // Briefing de IA — fire-and-forget para não bloquear a resposta
        gerarBriefingDeal(
          tenantId,
          dealId,
          nome,
          ender,
          telefone,
          site,
          place?.rating ?? null,
          place?.reviewCount ?? null,
          pontosFortes,
          doresPrincipais,
          req.log,
        ).catch(() => undefined);
      }
    } catch (err) {
      req.log.error({ err }, "prospector: criação de deal falhou (não-fatal)");
    }
  }

  // Todo lead novo de Google Places entra no mesmo motor preditivo/fila do Prospector.
  if (resolvedLeadId && !isDuplicate) {
    enrichLead({ leadId: resolvedLeadId, tenantId, log: req.log }).catch(() => undefined);
  }

  // 7. Persiste o enriquecimento
  const [record] = await db
    .insert(prospectEnrichmentsTable)
    .values({
      tenantId,
      leadId: resolvedLeadId,
      nomeEmpresa: nome,
      endereco: ender,
      rating: place?.rating != null ? String(place.rating) : null,
      reviewCount: place?.reviewCount ?? null,
      telefone,
      whatsapp,
      instagram: igHandle,
      siteOficial: site,
      cnpj: collected.cnpj,
      razaoSocial: collected.razaoSocial,
      nomeFantasia: collected.nomeFantasia,
      situacaoCadastral: collected.situacaoCadastral,
      atividadePrincipal: collected.atividadePrincipal,
      pontosFortes,
      doresPrincipais,
      publicoAlvo,
      tipoNegocio,
      nivelPresencaDigital,
      resumoNegocio,
      scoreProspector,
      temContato,
    })
    .returning();

  return res.status(201).json({ saved: true, isDuplicate, leadId: resolvedLeadId, dealId, enrichment: record });
});

// ── POST /prospector/search — busca empresas por atividade + localidade ───────
const searchBodySchema = z.object({
  atividade: z.string().min(2, "Informe a atividade comercial"),
  localidade: z.string().min(2, "Informe a localidade"),
  maxResults: z.number().int().min(1).max(20).optional().default(10),
  geo: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    radiusKm: z.number().min(1).max(100),
  }).optional(),
  tenantId: z.string().optional(),
});

router.post("/prospector/search", async (req, res) => {
  const parsed = searchBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Dados inválidos", details: parsed.error.flatten() });
  }
  const { atividade, localidade, maxResults, geo, tenantId: bodyTenantId } = parsed.data;

  let tenantIdSearch: string;
  try {
    tenantIdSearch = resolveTenantId(req, bodyTenantId);
  } catch (err: unknown) {
    const status = (err as { status?: number }).status ?? 401;
    const message = err instanceof Error ? err.message : "Não autenticado";
    return res.status(status).json({ error: message });
  }

  try {
    await checkApiQuota(tenantIdSearch, "google_places", req.log);
  } catch (err: unknown) {
    const status = (err as { status?: number }).status ?? 500;
    const message = err instanceof Error ? err.message : "Erro ao verificar cota";
    return res.status(status).json({ error: message });
  }

  const query = `${atividade.trim()} em ${localidade.trim()}`;

  let places: Awaited<ReturnType<typeof searchPlaces>>;
  try {
    places = await searchPlaces(query, maxResults, req.log, geo);
  } catch (err: unknown) {
    const status = (err as { status?: number }).status ?? 502;
    const message = err instanceof Error ? err.message : "Erro ao buscar no Google Places";
    req.log.error({ err }, "prospector/search: searchPlaces failed");
    return res.status(status).json({ error: message });
  }

  const results = places
    .filter((p) => p.nomeEmpresa)
    .map((p) => ({
      nomeEmpresa: p.nomeEmpresa,
      endereco: p.endereco,
      telefone: p.telefone,
      whatsapp: deriveWhatsapp(p.telefone),
      rating: p.rating,
      reviewCount: p.reviewCount,
      siteOficial: p.siteOficial,
    }));

  return res.status(200).json({ query, total: results.length, results, geoApplied: geo ?? null });
});


// ── POST /prospector/construction-signals/search — busca obras privadas individualizadas ──
const constructionSignalsSearchBodySchema = z.object({
  category: z.string().min(2),
  model: z.string().min(2),
  locality: z.string().min(2, "Informe a localidade"),
  intervention: z.string().optional(),
  standard: z.string().optional(),
  phase: z.string().optional(),
  productInterest: z.string().optional(),
  geo: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    radiusKm: z.number().min(1).max(100),
  }).optional(),
  maxResults: z.number().int().min(1).max(15).optional().default(10),
  tenantId: z.string().optional(),
});

router.post("/prospector/construction-signals/search", async (req, res) => {
  const parsed = constructionSignalsSearchBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Dados inválidos", details: parsed.error.flatten() });
  }

  const {
    category,
    model,
    locality,
    intervention,
    standard,
    phase,
    productInterest,
    geo,
    maxResults,
    tenantId: bodyTenantId,
  } = parsed.data;

  let tenantId: string;
  try {
    tenantId = resolveTenantId(req, bodyTenantId);
  } catch (err: unknown) {
    const status = (err as { status?: number }).status ?? 401;
    const message = err instanceof Error ? err.message : "Não autenticado";
    return res.status(status).json({ error: message });
  }

  try {
    const result = await searchConstructionWorkSignals({
      tenantId,
      category,
      model,
      locality: locality.trim(),
      intervention,
      standard,
      phase,
      productInterest,
      geo,
      maxResults,
    });

    return res.status(200).json({
      ...result,
      total: result.works.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro ao pesquisar obras privadas";
    req.log.error({ err }, "prospector/construction-signals/search failed");
    return res.status(502).json({ error: message });
  }
});


// ── POST /prospector/construction-signals/prospect — envia obra ao Prospecctor ──
const constructionSignalProspectBodySchema = z.object({
  work: z.object({
    id: z.string().min(1),
    obra: z.string().min(2),
    categoria: z.string().nullish(),
    local: z.string().min(2),
    endereco: z.string().nullish(),
    proprietario: z.string().nullish(),
    proprietarioTipo: z.enum(["pessoa", "empresa", "orgao_publico", "nao_informado"]),
    responsavelTecnico: z.string().nullish(),
    construtora: z.string().nullish(),
    incorporadora: z.string().nullish(),
    fase: z.string().nullish(),
    evidencia: z.string().min(5),
    dataReferencia: z.string().nullish(),
    sourceUrl: z.string().url().nullish(),
    sourceTitle: z.string().nullish(),
    sourceFamily: z.enum([
      "prefeitura_alvara",
      "diario_oficial",
      "crea_cau",
      "licenciamento_ambiental",
      "incorporadora_construtora",
      "arquiteto_engenheiro",
      "noticia_portal",
      "portal_imobiliario",
      "outro",
    ]),
    sourceAuthority: z.enum(["oficial", "primaria", "secundaria"]),
    confidence: z.number().min(0).max(100),
  }),
  actor: z.enum(["auto", "proprietario", "responsavel_tecnico", "construtora", "incorporadora"]).optional().default("auto"),
  tenantId: z.string().optional(),
});

function compactConstructionKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 220);
}

function constructionWorkKey(work: z.infer<typeof constructionSignalProspectBodySchema>["work"]): string {
  // A identidade comercial da obra não deve mudar quando uma nova fonte pública
  // passa a confirmá-la. Fonte é evidência; endereço/nome/local são identidade.
  return compactConstructionKey(
    work.endereco
      ? `${work.endereco}|${work.obra}|${work.local}`
      : `${work.obra}|${work.local}`,
  );
}

router.post("/prospector/construction-signals/prospect", async (req, res) => {
  const parsed = constructionSignalProspectBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Dados inválidos", details: parsed.error.flatten() });
  }

  const tenantId = resolveTenantId(req, parsed.data.tenantId);
  const work = parsed.data.work;
  const scored = scoreConstructionOpportunity(work);

  const requestedActor = parsed.data.actor;
  const autoActor = scored.recommendedActor;
  const actorRole = requestedActor === "auto" ? autoActor : requestedActor;
  const actorName =
    actorRole === "proprietario" ? work.proprietario :
    actorRole === "responsavel_tecnico" ? work.responsavelTecnico :
    actorRole === "construtora" ? work.construtora :
    actorRole === "incorporadora" ? work.incorporadora :
    null;

  const actorType =
    actorRole === "construtora" || actorRole === "incorporadora" ||
    (actorRole === "proprietario" && work.proprietarioTipo === "empresa")
      ? "empresa"
      : actorName
        ? "pessoa"
        : "a_identificar";

  let telefone: string | null = null;
  let websiteUrl: string | null = null;

  // Só tenta contato empresarial público. Nunca procura telefone pessoal de
  // proprietário ou responsável técnico pessoa física.
  if (actorName && actorType === "empresa") {
    try {
      await checkApiQuota(tenantId, "google_places", req.log);
      const place = await searchPlace(`${actorName} ${work.local}`, req.log);
      if (place?.nomeEmpresa) {
        const expected = normalizeName(actorName);
        const found = normalizeName(place.nomeEmpresa);
        const sameBusiness = expected === found || expected.includes(found) || found.includes(expected);
        if (sameBusiness) {
          telefone = place.telefone;
          websiteUrl = place.siteOficial;
        }
      }
    } catch (err) {
      req.log.info({ err, actorName }, "prospector/construction-signals/prospect: business contact lookup unavailable");
    }
  }

  const workKey = constructionWorkKey(work);
  const actorLabel = actorName || `Oportunidade — ${work.obra}`;
  const prospectKey = compactConstructionKey(`${workKey}|${actorRole}|${actorLabel}`);

  const [existing] = await db
    .select({
      id: leadsTable.id,
      nome: leadsTable.nome,
      metadata: leadsTable.metadata,
      telefone: leadsTable.telefone,
      websiteUrl: leadsTable.websiteUrl,
    })
    .from(leadsTable)
    .where(and(
      eq(leadsTable.tenantId, tenantId),
      sql`${leadsTable.metadata}->>'construction_prospect_key' = ${prospectKey}`,
    ))
    .limit(1);

  const now = new Date().toISOString();
  const evidenceItem = {
    key: "construction_work_signal",
    label: "Obra/projeto identificado em fonte pública",
    value: `${work.obra}${work.fase ? ` · fase ${work.fase}` : ""}`,
    source: work.sourceUrl ?? work.sourceTitle ?? "Radar de Obras",
    confidence: work.sourceAuthority === "oficial" ? "high" : work.sourceAuthority === "primaria" ? "medium" : "low",
    observedAt: now,
  };

  const metadataPatch = {
    origem: "construction_radar",
    source: "construction_radar",
    source_family: work.sourceFamily,
    cidade: work.local,
    localidade: work.local,
    construction_work_key: workKey,
    construction_prospect_key: prospectKey,
    construction_actor_role: actorRole,
    construction_actor_name: actorName,
    construction_actor_type: actorType,
    construction_signal: work.evidencia,
    construction_signal_url: work.sourceUrl,
    construction_signal_title: work.sourceTitle,
    construction_signal_authority: work.sourceAuthority,
    construction_signal_confidence: work.confidence,
    construction_opportunity_score: scored.score,
    construction_priority: scored.priority,
    construction_priority_reason: scored.reason,
    construction_recommended_actor: scored.recommendedActor,
    construction_work: {
      obra: work.obra,
      categoria: work.categoria,
      local: work.local,
      endereco: work.endereco,
      proprietario: work.proprietario,
      proprietarioTipo: work.proprietarioTipo,
      responsavelTecnico: work.responsavelTecnico,
      construtora: work.construtora,
      incorporadora: work.incorporadora,
      fase: work.fase,
      evidencia: work.evidencia,
      dataReferencia: work.dataReferencia,
      sourceUrl: work.sourceUrl,
      sourceTitle: work.sourceTitle,
      sourceFamily: work.sourceFamily,
      sourceAuthority: work.sourceAuthority,
      confidence: work.confidence,
    },
    coldProspectDossier: {
      status: actorName ? "ready_for_research" : "needs_actor",
      evidence: [evidenceItem],
      fitScore: scored.score,
      painScore: 0,
      playbook: {
        segment: "construcao",
        niche: work.categoria ?? "obra",
        focusSignals: ["construction_stage", "public_work_signal", "owner_or_technical_responsible"],
        recommendedModules: ["prospector", "crm", "sdr", "agendamento"],
      },
    },
    prospectado_em: now,
  };

  if (existing) {
    await db.update(leadsTable)
      .set({
        telefone: existing.telefone ?? telefone ?? undefined,
        websiteUrl: existing.websiteUrl ?? websiteUrl ?? undefined,
        endereco: work.endereco ?? undefined,
        constructionStage: work.fase ?? undefined,
        propensityScore: Math.max(scored.score, 0),
        priorityReason: `Radar de Obras: ${scored.reason}`,
        proximaAcao: actorName
          ? "Prospecctor: pesquisar contexto e iniciar diagnóstico consultivo"
          : "Identificar proprietário, arquiteto/engenheiro ou empresa responsável antes da abordagem",
        metadata: {
          ...((existing.metadata ?? {}) as Record<string, unknown>),
          ...metadataPatch,
        },
        updatedAt: new Date(),
      })
      .where(and(eq(leadsTable.id, existing.id), eq(leadsTable.tenantId, tenantId)));

    await db.insert(activitiesTable).values({
      tenantId,
      leadId: existing.id,
      tipo: "tarefa",
      titulo: "Radar de Obras — sinal atualizado",
      descricao: `${work.obra} · ${work.local} · prioridade ${scored.priority} (${scored.score}/100). ${work.evidencia}`,
      status: "concluida",
    });

    return res.status(200).json({
      leadId: existing.id,
      merged: true,
      actor: { role: actorRole, name: actorName, type: actorType },
      opportunityScore: scored.score,
      priority: scored.priority,
      priorityReason: scored.reason,
      readyForOutreach: Boolean(existing.telefone ?? telefone),
      message: `Sinal atualizado no Prospecctor para ${existing.nome}.`,
    });
  }

  const result = await intakeColdProspect({
    tenantId,
    source: "construction_radar",
    sourceRef: `construction_radar:${prospectKey}`,
    displayName: actorName || work.obra,
    phone: telefone ?? null,
    website: websiteUrl ?? null,
    address: work.endereco ?? null,
    segment: `Construção civil ${work.categoria ?? "residencial"}`,
    city: work.local ?? null,
    fitScore: scored.score,
    vendoraiFitScore: Math.max(60, scored.score - 10),
    arqdorFitScore: Math.max(75, scored.score),
    qualification: {
      inferredPains: [],
      facts: [
        {
          key: "construction_work_signal",
          value: `${work.obra}${work.fase ? ` · fase ${work.fase}` : ""}`,
          confidence: work.sourceAuthority === "oficial" ? 100 : work.sourceAuthority === "primaria" ? 85 : 65,
          source: work.sourceUrl ?? work.sourceTitle ?? "Radar de Obras",
          confirmed: true,
          observedAt: now,
        },
        ...(actorName ? [{
          key: "known_actor",
          value: { name: actorName, role: actorRole, type: actorType },
          confidence: 90,
          source: "construction_radar",
          confirmed: true,
          observedAt: now,
        }] : []),
      ],
    },
    opportunitySummary: `${work.obra} · ${work.local}. Prioridade ${scored.priority} (${scored.score}/100). ${work.evidencia}`,
  });

  return res.status(result.created ? 201 : 200).json({
    prospectId: result.prospect.id,
    companyId: result.companyId,
    merged: !result.created,
    actor: { role: actorRole, name: actorName, type: actorType },
    opportunityScore: scored.score,
    priority: scored.priority,
    priorityReason: scored.reason,
    readyForOutreach: Boolean(telefone),
    stage: result.prospect.stage,
    message: actorName
      ? `Obra enviada à Prospecção IA com ${actorName} como contato recomendado.`
      : "Obra enviada à Prospecção IA; falta identificar um contato público antes da abordagem.",
  });
});

// ── GET /prospector/export — exporta enriquecimentos do tenant em CSV ─────────
router.get("/prospector/export", async (req, res) => {
  const bodyTenantId = typeof req.query["tenantId"] === "string" ? req.query["tenantId"] : undefined;
  const tenantId = resolveTenantId(req, bodyTenantId);

  const rows = await db
    .select()
    .from(prospectEnrichmentsTable)
    .where(eq(prospectEnrichmentsTable.tenantId, tenantId))
    .orderBy(desc(prospectEnrichmentsTable.scoreProspector));

  const headers = [
    "nome_empresa", "razao_social", "endereco", "telefone", "whatsapp", "instagram",
    "site_oficial", "cnpj", "situacao_cadastral", "atividade_principal", "rating",
    "review_count", "score_prospector", "tem_contato", "publico_alvo", "tipo_negocio",
    "nivel_presenca_digital", "resumo_negocio", "created_at",
  ];

  const escape = (v: unknown): string => {
    if (v == null) return "";
    let s = Array.isArray(v) ? v.join("; ") : String(v);
    // Neutraliza CSV injection (fórmulas em Excel/Sheets) prefixando aspa simples.
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.nomeEmpresa, r.razaoSocial, r.endereco, r.telefone, r.whatsapp, r.instagram,
        r.siteOficial, r.cnpj, r.situacaoCadastral, r.atividadePrincipal, r.rating,
        r.reviewCount, r.scoreProspector, r.temContato, r.publicoAlvo, r.tipoNegocio,
        r.nivelPresencaDigital, r.resumoNegocio, r.createdAt?.toISOString(),
      ]
        .map(escape)
        .join(","),
    );
  }

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="prospector_leads.csv"');
  return res.status(200).send("\uFEFF" + lines.join("\n"));
});

// ── POST /prospector/generate-message ─────────────────────────────────────────
const generateMessageBodySchema = z.object({
  messageType: z.string().min(1).default("whatsapp"),
  nomeEmpresa: z.string().optional(),
  contexto: z.string().optional(),
  leadId: z.string().optional(),
  tenantId: z.string().optional(),
});

// Busca os N exemplos de aprovações anteriores (approved/edited) mais similares
// ao contexto do lead via pgvector (cosine distance: operador `<=>`).
async function findSimilarApprovals(
  tenantId: string,
  queryEmbedding: number[],
  limit: number,
): Promise<{ messageType: string | null; text: string }[]> {
  const vec = toVectorLiteral(queryEmbedding);
  const rows = await db
    .select({
      messageType: prospectApprovalsTable.messageType,
      approvedText: prospectApprovalsTable.approvedText,
      generatedText: prospectApprovalsTable.generatedText,
    })
    .from(prospectApprovalsTable)
    .where(
      and(
        eq(prospectApprovalsTable.tenantId, tenantId),
        inArray(prospectApprovalsTable.action, ["approved", "edited"]),
        sql`${prospectApprovalsTable.embedding} IS NOT NULL`,
      ),
    )
    .orderBy(sql`${prospectApprovalsTable.embedding} OPERATOR(extensions.<=>) ${vec}::extensions.vector`)
    .limit(limit);

  return rows.map((r) => ({
    messageType: r.messageType,
    text: (r.approvedText ?? r.generatedText ?? "").trim(),
  }));
}

router.post("/prospector/generate-message", async (req, res) => {
  const parsed = generateMessageBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Dados inválidos", details: parsed.error.flatten() });
  }
  const { messageType, nomeEmpresa, contexto, leadId, tenantId: bodyTenantId } = parsed.data;
  const tenantId = resolveTenantId(req, bodyTenantId);
  if (leadId) await assertLeadInTenant(leadId, tenantId);

  // 1. Reúne o contexto do lead (do enrichment quando houver leadId).
  let dorPrincipal: string | null = null;
  let resumoNegocio: string | null = null;
  if (leadId) {
    const [enr] = await db
      .select({
        doresPrincipais: prospectEnrichmentsTable.doresPrincipais,
        resumoNegocio: prospectEnrichmentsTable.resumoNegocio,
      })
      .from(prospectEnrichmentsTable)
      .where(
        and(
          eq(prospectEnrichmentsTable.tenantId, tenantId),
          eq(prospectEnrichmentsTable.leadId, leadId),
        ),
      )
      .orderBy(desc(prospectEnrichmentsTable.createdAt))
      .limit(1);
    dorPrincipal = enr?.doresPrincipais?.[0] ?? null;
    resumoNegocio = enr?.resumoNegocio ?? null;
  }

  const queryText = [nomeEmpresa, resumoNegocio, dorPrincipal, contexto]
    .filter(Boolean)
    .join(" — ");

  // 2. Busca semântica dos 3 melhores exemplos aprovados (few-shot).
  let fewShot: { messageType: string | null; text: string }[] = [];
  try {
    if (queryText.trim().length > 0) {
      const { embedding } = await generateEmbedding(tenantId, queryText, { log: req.log });
      fewShot = await findSimilarApprovals(tenantId, embedding, 3);
    }
  } catch (err) {
    req.log.error({ err }, "prospector: few-shot retrieval failed (non-fatal)");
  }

  const fewShotBlock =
    fewShot.length > 0
      ? "Exemplos de mensagens aprovadas anteriormente por este time (imite o tom, NÃO copie):\n" +
        fewShot.map((f, i) => `Exemplo ${i + 1} (${f.messageType ?? "geral"}):\n${f.text}`).join("\n\n")
      : "Ainda não há exemplos aprovados; use as melhores práticas de prospecção B2B.";

  // 3. Geração via aiGateway — rascunhos de e-mail (<=150 palavras) e WhatsApp (<=60 palavras).
  const ai = await gatewayCallOpenAI(
    tenantId,
    "content_generator",
    [
      {
        role: "system",
        content:
          "Você é um SDR especialista em prospecção B2B no Brasil. Gere rascunhos de primeiro contato " +
          "personalizados e cordiais, em português do Brasil. Responda APENAS um JSON no formato " +
          '{"email": string, "whatsapp": string}. ' +
          "O e-mail deve ter NO MÁXIMO 150 palavras; o WhatsApp NO MÁXIMO 60 palavras. " +
          "Sem aspas extras nem comentários fora do JSON.\n\n" +
          fewShotBlock,
      },
      {
        role: "user",
        content: JSON.stringify({
          nomeEmpresa: nomeEmpresa ?? null,
          dorPrincipal,
          resumoNegocio,
          contexto: contexto ?? null,
        }),
      },
    ],
    { maxTokens: 700, temperature: 0.8, responseFormat: { type: "json_object" }, log: req.log },
  );

  let email = "";
  let whatsapp = "";
  try {
    const json = JSON.parse(ai.content) as { email?: string; whatsapp?: string };
    email = typeof json.email === "string" ? json.email.trim() : "";
    whatsapp = typeof json.whatsapp === "string" ? json.whatsapp.trim() : "";
  } catch (err) {
    req.log.error({ err }, "prospector: generate-message JSON parse failed");
  }

  // 4. Persiste o rascunho (action='generated') com embedding para futuras buscas.
  const draftText = messageType === "email" ? email : whatsapp;
  let embedding: number[] | null = null;
  try {
    if (draftText) {
      const r = await generateEmbedding(tenantId, draftText, { log: req.log });
      embedding = r.embedding;
    }
  } catch (err) {
    req.log.error({ err }, "prospector: draft embedding failed (non-fatal)");
  }

  const [approval] = await db
    .insert(prospectApprovalsTable)
    .values({
      tenantId,
      leadId: leadId ?? null,
      messageType,
      generatedText: JSON.stringify({ email, whatsapp }),
      action: "generated",
      ...(embedding ? { embedding } : {}),
    })
    .returning();

  return res.status(201).json({ email, whatsapp, approval });
});

// ── GET /prospector/approvals — rascunhos pendentes (action='generated') ───────
router.get("/prospector/approvals", async (req, res) => {
  const bodyTenantId = typeof req.query["tenantId"] === "string" ? req.query["tenantId"] : undefined;
  const tenantId = resolveTenantId(req, bodyTenantId);

  const drafts = await db
    .select({
      id: prospectApprovalsTable.id,
      leadId: prospectApprovalsTable.leadId,
      messageType: prospectApprovalsTable.messageType,
      generatedText: prospectApprovalsTable.generatedText,
      createdAt: prospectApprovalsTable.createdAt,
      leadNome: leadsTable.nome,
      leadEmpresa: leadsTable.empresa,
    })
    .from(prospectApprovalsTable)
    .leftJoin(leadsTable, eq(leadsTable.id, prospectApprovalsTable.leadId))
    .where(
      and(
        eq(prospectApprovalsTable.tenantId, tenantId),
        eq(prospectApprovalsTable.action, "generated"),
      ),
    )
    .orderBy(desc(prospectApprovalsTable.createdAt))
    .limit(100);

  // Enriquecimento (dor principal + score) por lead, em uma única query.
  const leadIds = [...new Set(drafts.map((d) => d.leadId).filter((x): x is string => !!x))];
  const enrichByLead = new Map<string, { dorPrincipal: string | null; score: number | null; empresa: string | null }>();
  if (leadIds.length > 0) {
    const enrichments = await db
      .select({
        leadId: prospectEnrichmentsTable.leadId,
        nomeEmpresa: prospectEnrichmentsTable.nomeEmpresa,
        doresPrincipais: prospectEnrichmentsTable.doresPrincipais,
        scoreProspector: prospectEnrichmentsTable.scoreProspector,
        createdAt: prospectEnrichmentsTable.createdAt,
      })
      .from(prospectEnrichmentsTable)
      .where(
        and(
          eq(prospectEnrichmentsTable.tenantId, tenantId),
          inArray(prospectEnrichmentsTable.leadId, leadIds),
        ),
      )
      .orderBy(desc(prospectEnrichmentsTable.createdAt));
    for (const e of enrichments) {
      if (!e.leadId || enrichByLead.has(e.leadId)) continue; // mantém o mais recente
      enrichByLead.set(e.leadId, {
        dorPrincipal: e.doresPrincipais?.[0] ?? null,
        score: e.scoreProspector ?? null,
        empresa: e.nomeEmpresa ?? null,
      });
    }
  }

  const items = drafts.map((d) => {
    let email = "";
    let whatsapp = "";
    try {
      const j = JSON.parse(d.generatedText ?? "{}") as { email?: string; whatsapp?: string };
      email = j.email ?? "";
      whatsapp = j.whatsapp ?? "";
    } catch {
      whatsapp = d.generatedText ?? "";
    }
    const enr = d.leadId ? enrichByLead.get(d.leadId) : undefined;
    return {
      id: d.id,
      leadId: d.leadId,
      messageType: d.messageType,
      email,
      whatsapp,
      createdAt: d.createdAt.toISOString(),
      empresa: d.leadEmpresa ?? enr?.empresa ?? d.leadNome ?? null,
      dorPrincipal: enr?.dorPrincipal ?? null,
      score: enr?.score ?? null,
    };
  });

  return res.status(200).json({ items });
});

// ── PATCH /prospector/approvals/:id — aprovar / aprovar com edição / rejeitar ──
const patchApprovalSchema = z.object({
  action: z.enum(["approved", "edited", "rejected"]),
  approvedText: z.string().optional(),
  tenantId: z.string().optional(),
});

router.patch("/prospector/approvals/:id", async (req, res) => {
  const parsed = patchApprovalSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Dados inválidos", details: parsed.error.flatten() });
  }
  const { action, approvedText, tenantId: bodyTenantId } = parsed.data;
  const tenantId = resolveTenantId(req, bodyTenantId);
  const approvalId = req.params["id"]!;

  if (action === "edited" && (!approvedText || approvedText.trim().length === 0)) {
    return res.status(400).json({ error: "approvedText é obrigatório para 'edited'" });
  }

  // Verifica posse pelo tenant.
  const [existing] = await db
    .select({ id: prospectApprovalsTable.id })
    .from(prospectApprovalsTable)
    .where(
      and(eq(prospectApprovalsTable.id, approvalId), eq(prospectApprovalsTable.tenantId, tenantId)),
    )
    .limit(1);
  if (!existing) {
    return res.status(404).json({ error: "Aprovação não encontrada para este tenant" });
  }

  // Re-embedding quando o texto é editado (busca semântica usa a versão corrigida).
  let newEmbedding: number[] | null = null;
  if (action === "edited" && approvedText) {
    try {
      const r = await generateEmbedding(tenantId, approvedText.trim(), { log: req.log });
      newEmbedding = r.embedding;
    } catch (err) {
      req.log.error({ err }, "prospector: re-embedding on edit failed (non-fatal)");
    }
  }

  await db
    .update(prospectApprovalsTable)
    .set({
      action,
      ...(approvedText ? { approvedText: approvedText.trim() } : {}),
      ...(newEmbedding ? { embedding: newEmbedding } : {}),
    })
    .where(eq(prospectApprovalsTable.id, approvalId));

  // Contagem de treinamento: approved + edited.
  let automationUnlocked = false;
  let approvedCount = 0;
  if (action === "approved" || action === "edited") {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(prospectApprovalsTable)
      .where(
        and(
          eq(prospectApprovalsTable.tenantId, tenantId),
          inArray(prospectApprovalsTable.action, ["approved", "edited"]),
        ),
      );
    approvedCount = count ?? 0;

    if (approvedCount >= AUTOMATION_THRESHOLD) {
      const [tenant] = await db
        .select({ prospectStatus: tenantsTable.prospectStatus })
        .from(tenantsTable)
        .where(eq(tenantsTable.id, tenantId))
        .limit(1);
      if (tenant && tenant.prospectStatus !== "automated") {
        await db
          .update(tenantsTable)
          .set({ prospectStatus: "automated", updatedAt: new Date() })
          .where(eq(tenantsTable.id, tenantId));
        await db.insert(notificationsTable).values({
          tenantId,
          title: "Automação liberada 🎉",
          message: "Seu Agente Prospector já aprendeu com você! Automação liberada.",
          type: "info",
          category: "prospector",
        });
        automationUnlocked = true;
      }
    }
  }

  return res.status(200).json({ ok: true, action, approvedCount, automationUnlocked });
});

// ── GET /prospector/config ────────────────────────────────────────────────────
router.get("/prospector/config", async (req, res) => {
  const tenantId = resolveTenantId(req, undefined);
  const [config] = await db
    .select()
    .from(prospectorConfigTable)
    .where(eq(prospectorConfigTable.tenantId, tenantId))
    .limit(1);
  return res.status(200).json({ config: config ?? null });
});

// ── PUT /prospector/config ────────────────────────────────────────────────────
const prospectorConfigBodySchema = z.object({
  setor:       z.string().nullable().optional(),
  cidade:      z.string().nullable().optional(),
  raioKm:      z.number().int().min(1).max(100).nullable().optional(),
  ritmoDiario: z.number().int().min(1).max(500).optional(),
  ativo:       z.boolean().optional(),
  horarioCron: z.string().optional(),

  coldProspectingMode: z.enum(["off", "assisted", "autonomous"]).optional(),
  allowedSolutions: z.array(z.enum(["vendorai", "arqdor"])).min(1).max(2).optional(),
  targetSegments: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
  targetPersonas: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
  allowedChannels: z.array(z.enum(["whatsapp", "email", "phone", "instagram"])).min(1).max(4).optional(),
  contactWindowStart: z.string().regex(/^([01]\\d|2[0-3]):[0-5]\\d$/).optional(),
  contactWindowEnd: z.string().regex(/^([01]\\d|2[0-3]):[0-5]\\d$/).optional(),
  timezone: z.string().min(1).max(100).optional(),
  maxContactsPerPerson7d: z.number().int().min(1).max(30).optional(),
  qualificationThreshold: z.number().int().min(0).max(100).optional(),
  meetingReadinessThreshold: z.number().int().min(0).max(100).optional(),
  autoSendApprovedContent: z.boolean().optional(),
  conversionCriteria: z.object({
    requireResponsible: z.boolean().optional(),
    requireConfirmedPain: z.boolean().optional(),
    requireDecisionMakerOrPath: z.boolean().optional(),
    requireMeetingAccepted: z.boolean().optional(),
  }).optional(),
});

router.put("/prospector/config", async (req, res) => {
  const tenantId = resolveTenantId(req, undefined);
  const parsed = prospectorConfigBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Dados inválidos", details: parsed.error.issues });
  }
  const now = new Date();
  const data = { ...parsed.data, updatedAt: now };

  const [existing] = await db
    .select({ id: prospectorConfigTable.id })
    .from(prospectorConfigTable)
    .where(eq(prospectorConfigTable.tenantId, tenantId))
    .limit(1);

  let config;
  if (existing) {
    [config] = await db
      .update(prospectorConfigTable)
      .set(data)
      .where(eq(prospectorConfigTable.tenantId, tenantId))
      .returning();
  } else {
    [config] = await db
      .insert(prospectorConfigTable)
      .values({ tenantId, ...data })
      .returning();
  }
  return res.status(200).json({ config });
});

// ── GET /tenant/api-usage — uso mensal da Places API ──────────────────────────
router.get("/prospector/tenant/api-usage", async (req, res) => {
  const api = (req.query["api"] as string | undefined) ?? "google_places";
  if (api !== "google_places") {
    return res.status(400).json({ error: "api inválida" });
  }
  const tenantId = resolveTenantId(req, undefined);
  const usage = await getApiUsage(tenantId, "google_places");
  return res.status(200).json(usage);
});


// ── POST /prospector/campaign-package — Revenue Scout → Marketing ─────────────
const campaignPackageBodySchema = z.object({
  leadIds: z.array(z.string().min(1)).min(1).max(50),
  tenantId: z.string().optional(),
});

type RevenueScoutCampaignStrategy = {
  campaignName: string;
  audienceSegment: string;
  audienceNiche: string;
  campaignGoal: string;
  message: string;
  recommendedChannel: "whatsapp" | "email" | "instagram";
  recommendedPaidPlatform: "meta" | "google";
  offer: string;
  chosenProductIds: string[];
  opportunity: string;
  region: string;
  adsHeadline: string;
  adsDescription: string;
  lpHeadline: string;
  lpSubheadline: string;
};

function safeStrategyText(value: unknown, fallback: string, max = 500): string {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback;
}

router.post("/prospector/campaign-package", async (req, res) => {
  const parsed = campaignPackageBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Dados inválidos", details: parsed.error.flatten() });
  }

  const tenantId = resolveTenantId(req, parsed.data.tenantId);
  const leadIds = [...new Set(parsed.data.leadIds)];

  const selectedLeads = await db
    .select({
      id: leadsTable.id,
      nome: leadsTable.nome,
      empresa: leadsTable.empresa,
      telefone: leadsTable.telefone,
      endereco: leadsTable.endereco,
      mercadoSegmento: leadsTable.mercadoSegmento,
      propensityScore: leadsTable.propensityScore,
      priorityReason: leadsTable.priorityReason,
      roiEstimate: leadsTable.roiEstimate,
      enrichmentData: leadsTable.enrichmentData,
      metadata: leadsTable.metadata,
    })
    .from(leadsTable)
    .where(and(eq(leadsTable.tenantId, tenantId), inArray(leadsTable.id, leadIds)))
    .orderBy(desc(leadsTable.propensityScore), desc(leadsTable.createdAt));

  const foundIds = new Set(selectedLeads.map((lead) => lead.id));
  const missing = leadIds.filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    return res.status(404).json({
      error: "Um ou mais prospects não pertencem a este tenant",
      missingLeadIds: missing,
    });
  }

  const [tenantRows, profileRows, catalogRows] = await Promise.all([
    db
      .select({
        id: tenantsTable.id,
        name: tenantsTable.name,
        nomeEmpresa: tenantsTable.nomeEmpresa,
        vertical: tenantsTable.vertical,
        segmento: tenantsTable.segmento,
        descricao: tenantsTable.descricao,
      })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, tenantId))
      .limit(1),
    db
      .select({
        razaoSocial: businessProfilesTable.razaoSocial,
        nomeFantasia: businessProfilesTable.nomeFantasia,
        vertical: businessProfilesTable.vertical,
        diferenciais: businessProfilesTable.diferenciais,
        publicoAlvo: businessProfilesTable.publicoAlvo,
        produtos: businessProfilesTable.produtos,
        discoveryData: businessProfilesTable.discoveryData,
      })
      .from(businessProfilesTable)
      .where(eq(businessProfilesTable.tenantId, tenantId))
      .limit(1),
    db
      .select({
        id: produtosCatalogoTable.id,
        nome: produtosCatalogoTable.nome,
        descricao: produtosCatalogoTable.descricao,
        marca: produtosCatalogoTable.marca,
        ativo: produtosCatalogoTable.ativo,
      })
      .from(produtosCatalogoTable)
      .where(eq(produtosCatalogoTable.tenantId, tenantId)),
  ]);

  const tenant = tenantRows[0] ?? null;
  const profile = profileRows[0] ?? null;
  const tenantName =
    profile?.nomeFantasia ??
    tenant?.nomeEmpresa ??
    tenant?.name ??
    profile?.razaoSocial ??
    "Empresa";
  const businessVertical =
    profile?.vertical ?? tenant?.segmento ?? tenant?.vertical ?? "";

  const activeCatalog = catalogRows.filter((item) => item.ativo !== false).slice(0, 30);
  const profileProducts = Array.isArray(profile?.produtos) ? profile.produtos : [];
  const availableOffers = activeCatalog.length > 0
    ? activeCatalog.map((item) => ({
        id: item.id,
        nome: item.nome,
        descricao: item.descricao ?? "",
        marca: item.marca ?? "",
      }))
    : profileProducts.slice(0, 20).map((item, index) => ({
        id: `profile:${index}`,
        nome: item.nome,
        descricao: item.descricao ?? "",
        marca: "",
      }));

  const scores = selectedLeads
    .map((lead) => Number(lead.propensityScore))
    .filter((score) => Number.isFinite(score));
  const averageScore = scores.length > 0
    ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
    : 0;
  const segmentCandidates = selectedLeads
    .map((lead) => lead.mercadoSegmento?.trim())
    .filter((value): value is string => Boolean(value));
  const fallbackNiche = segmentCandidates[0] ?? "empresas qualificadas pelo Revenue Scout";
  const addressCandidates = selectedLeads
    .map((lead) => lead.endereco?.trim())
    .filter((value): value is string => Boolean(value))
    .slice(0, 3);
  const fallbackRegion = addressCandidates.length > 0 ? addressCandidates.join(" • ") : "região comercial do tenant";
  const defaultOffer = availableOffers[0] ?? null;
  const fallbackOpportunity = selectedLeads.find((lead) => lead.priorityReason)?.priorityReason
    ?? "oportunidade comercial identificada pelo Revenue Scout";

  let strategy: RevenueScoutCampaignStrategy = {
    campaignName: `${fallbackNiche} — Revenue Scout`.slice(0, 180),
    audienceSegment: "Empresas (B2B)",
    audienceNiche: fallbackNiche,
    campaignGoal: `Gerar oportunidades comerciais para ${tenantName} junto a ${selectedLeads.length} prospect(s) qualificado(s).`,
    message: `Olá! Somos da ${tenantName}. Identificamos uma oportunidade de parceria que pode fazer sentido para sua empresa. Posso te apresentar rapidamente?`,
    recommendedChannel: "whatsapp",
    recommendedPaidPlatform: "meta",
    offer: defaultOffer?.nome ?? "solução comercial do tenant",
    chosenProductIds: defaultOffer ? [defaultOffer.id] : [],
    opportunity: fallbackOpportunity,
    region: fallbackRegion,
    adsHeadline: `${tenantName}: uma solução para ${fallbackNiche}`.slice(0, 120),
    adsDescription: `Conheça a oferta da ${tenantName} pensada para ${fallbackNiche}.`.slice(0, 220),
    lpHeadline: `${tenantName} para ${fallbackNiche}`.slice(0, 160),
    lpSubheadline: `Uma proposta comercial preparada para empresas com o perfil identificado pelo Revenue Scout.`.slice(0, 260),
  };

  const leadsForAi = selectedLeads.map((lead) => ({
    nome: lead.nome,
    empresa: lead.empresa,
    segmento: lead.mercadoSegmento,
    endereco: lead.endereco,
    score: lead.propensityScore,
    motivo_prioridade: lead.priorityReason,
    roi: lead.roiEstimate,
    sinais: JSON.stringify(lead.enrichmentData ?? {}).slice(0, 700),
  }));

  try {
    const ai = await gatewayCallOpenAI(
      tenantId,
      "content_generator",
      [
        {
          role: "system",
          content:
            "Você é o Marketing Manager do CLIENTE/TENANT do VendorAI. A empresa anunciante é o tenant informado, " +
            "e os leads do Revenue Scout são o público/prospects. Nunca trate o VendorAI como o produto a vender, " +
            "a menos que isso esteja explicitamente no catálogo do tenant. Use somente produtos/ofertas fornecidos. " +
            "Crie uma estratégia prática que possa alimentar campanha orgânica, Meta/Google Ads e landing page. " +
            "Responda APENAS JSON válido.",
        },
        {
          role: "user",
          content: JSON.stringify({
            tenant: {
              nome: tenantName,
              vertical: businessVertical,
              descricao: tenant?.descricao ?? null,
              diferenciais: profile?.diferenciais ?? null,
              publico_alvo_atual: profile?.publicoAlvo ?? null,
              discovery: profile?.discoveryData ?? null,
            },
            ofertas_disponiveis: availableOffers,
            prospects: leadsForAi,
            score_medio: averageScore,
            regras: {
              selectedProductIdsMustExistInOffers: true,
              noInventedProducts: true,
              campaignMustBelongToTenant: true,
              paidMediaIsDraftOnly: true,
            },
            output: {
              campaignName: "string",
              audienceSegment: "string",
              audienceNiche: "string",
              campaignGoal: "string",
              message: "string de primeiro contato curto",
              recommendedChannel: "whatsapp|email|instagram",
              recommendedPaidPlatform: "meta|google",
              offer: "string",
              chosenProductIds: ["ids existentes em ofertas_disponiveis"],
              opportunity: "string",
              region: "string",
              adsHeadline: "string",
              adsDescription: "string",
              lpHeadline: "string",
              lpSubheadline: "string",
            },
          }),
        },
      ],
      { responseFormat: { type: "json_object" }, maxTokens: 1200, temperature: 0.5, log: req.log },
    );

    const parsedAi = JSON.parse(ai.content) as Partial<RevenueScoutCampaignStrategy>;
    const channel = ["whatsapp", "email", "instagram"].includes(String(parsedAi.recommendedChannel))
      ? parsedAi.recommendedChannel as RevenueScoutCampaignStrategy["recommendedChannel"]
      : strategy.recommendedChannel;
    const paid = ["meta", "google"].includes(String(parsedAi.recommendedPaidPlatform))
      ? parsedAi.recommendedPaidPlatform as RevenueScoutCampaignStrategy["recommendedPaidPlatform"]
      : strategy.recommendedPaidPlatform;
    const allowedIds = new Set(availableOffers.map((item) => item.id));
    const selectedIds = Array.isArray(parsedAi.chosenProductIds)
      ? parsedAi.chosenProductIds.filter((id): id is string => typeof id === "string" && allowedIds.has(id))
      : strategy.chosenProductIds;

    strategy = {
      campaignName: safeStrategyText(parsedAi.campaignName, strategy.campaignName, 180),
      audienceSegment: safeStrategyText(parsedAi.audienceSegment, strategy.audienceSegment, 120),
      audienceNiche: safeStrategyText(parsedAi.audienceNiche, strategy.audienceNiche, 180),
      campaignGoal: safeStrategyText(parsedAi.campaignGoal, strategy.campaignGoal, 500),
      message: safeStrategyText(parsedAi.message, strategy.message, 900),
      recommendedChannel: channel,
      recommendedPaidPlatform: paid,
      offer: safeStrategyText(parsedAi.offer, strategy.offer, 300),
      chosenProductIds: selectedIds,
      opportunity: safeStrategyText(parsedAi.opportunity, strategy.opportunity, 500),
      region: safeStrategyText(parsedAi.region, strategy.region, 300),
      adsHeadline: safeStrategyText(parsedAi.adsHeadline, strategy.adsHeadline, 120),
      adsDescription: safeStrategyText(parsedAi.adsDescription, strategy.adsDescription, 240),
      lpHeadline: safeStrategyText(parsedAi.lpHeadline, strategy.lpHeadline, 180),
      lpSubheadline: safeStrategyText(parsedAi.lpSubheadline, strategy.lpSubheadline, 320),
    };
  } catch (err) {
    req.log.warn({ err }, "prospector/campaign-package: strategy AI unavailable, using safe fallback");
  }

  const chosenOffers = availableOffers.filter((item) => strategy.chosenProductIds.includes(item.id));
  const productIds = chosenOffers.map((item) => item.id);
  const productNames = chosenOffers.map((item) => item.nome);
  const prospectorBatchId = crypto.randomUUID();
  const marketingContext = {
    nicheId: `revenue_scout:${prospectorBatchId}`,
    nicheName: [
      businessVertical ? `Negócio: ${businessVertical}` : `Negócio: ${tenantName}`,
      `Público: ${strategy.audienceSegment}`,
      `Nicho do público: ${strategy.audienceNiche}`,
      `Objetivo: ${strategy.campaignGoal}`,
    ].join(" | "),
    productIds,
    productNames,
    businessVertical: businessVertical || tenantName,
    audienceSegment: strategy.audienceSegment,
    audienceNiche: strategy.audienceNiche,
    campaignGoal: strategy.campaignGoal,
  };

  const campaignContext = {
    origin: "revenue_scout",
    prospectorBatchId,
    leadIds,
    tenantName,
    businessVertical: businessVertical || undefined,
    region: strategy.region,
    opportunity: strategy.opportunity,
    averageScore,
    offer: strategy.offer,
    productIds,
    productNames,
    audienceSegment: strategy.audienceSegment,
    audienceNiche: strategy.audienceNiche,
    campaignGoal: strategy.campaignGoal,
    recommendedChannel: strategy.recommendedChannel,
    recommendedPaidPlatform: strategy.recommendedPaidPlatform,
    adsHeadline: strategy.adsHeadline,
    adsDescription: strategy.adsDescription,
    lpHeadline: strategy.lpHeadline,
    lpSubheadline: strategy.lpSubheadline,
    marketingContext,
    createdFromRevenueScoutAt: new Date().toISOString(),
  };

  const [campaign] = await db
    .insert(campaignsTable)
    .values({
      tenantId,
      nome: strategy.campaignName,
      tipo: strategy.recommendedChannel,
      mensagem: strategy.message,
      status: "rascunho",
      totalDestinatarios: selectedLeads.length,
      segmentoFiltro: { leadIds, marketingContext },
      contexto: campaignContext,
    })
    .returning();

  if (!campaign) {
    return res.status(500).json({ error: "Falha ao criar campanha" });
  }

  await db.insert(activitiesTable).values(
    selectedLeads.map((lead) => ({
      tenantId,
      leadId: lead.id,
      tipo: "tarefa" as const,
      titulo: "Campanha criada pelo Revenue Scout",
      descricao: `Prospect vinculado à campanha "${campaign.nome}" (${campaign.id}).`,
      status: "concluida" as const,
    })),
  );

  await Promise.all(
    selectedLeads.map(async (lead) => {
      const metadata = (lead.metadata ?? {}) as Record<string, unknown>;
      const current = Array.isArray(metadata["revenue_scout_campaign_ids"])
        ? metadata["revenue_scout_campaign_ids"].filter((id): id is string => typeof id === "string")
        : [];
      const nextIds = [...new Set([...current, campaign.id])];
      await db
        .update(leadsTable)
        .set({
          metadata: { ...metadata, revenue_scout_campaign_ids: nextIds },
          updatedAt: new Date(),
        })
        .where(and(eq(leadsTable.id, lead.id), eq(leadsTable.tenantId, tenantId)));
    }),
  );

  return res.status(201).json({
    campaignId: campaign.id,
    campaign,
    strategy: {
      ...strategy,
      productIds,
      productNames,
      marketingContext,
      averageScore,
    },
    marketingUrl: `/content?tab=campanhas&view=organicas&campaignId=${encodeURIComponent(campaign.id)}&from=revenue-scout`,
    adsUrl: `/ads?from=revenue-scout&campaignId=${encodeURIComponent(campaign.id)}`,
    lpUrl: `/content?tab=campanhas&view=lp&campaignId=${encodeURIComponent(campaign.id)}&from=revenue-scout`,
  });
});

// ── GET /prospector/fila — fila priorizada por score ─────────────────────────
router.get("/prospector/fila", async (req, res) => {
  const tenantId = resolveTenantId(req, undefined);
  const limitParam = Math.min(Number(req.query["limit"] ?? 50), 100);

  const leads = await db
    .select({
      id: leadsTable.id,
      nome: leadsTable.nome,
      empresa: leadsTable.empresa,
      telefone: leadsTable.telefone,
      endereco: leadsTable.endereco,
      mercadoSegmento: leadsTable.mercadoSegmento,
      websiteUrl: leadsTable.websiteUrl,
      enrichmentStatus: leadsTable.enrichmentStatus,
      propensityScore: leadsTable.propensityScore,
      roiEstimate: leadsTable.roiEstimate,
      enrichmentData: leadsTable.enrichmentData,
      priorityReason: leadsTable.priorityReason,
      metadata: leadsTable.metadata,
      createdAt: leadsTable.createdAt,
    })
    .from(leadsTable)
    .where(
      and(
        eq(leadsTable.tenantId, tenantId),
        inArray(leadsTable.source, ["prospector_auto", "prospector", "cnpj", "recem_aberta", "ad_library"]),
        inArray(leadsTable.enrichmentStatus, ["pending", "enriched", "scored"]),
      ),
    )
    .orderBy(desc(leadsTable.propensityScore), desc(leadsTable.createdAt))
    .limit(limitParam);

  // Load active events (score boosts)
  const leadIds = leads.map((l) => l.id);
  const events = leadIds.length > 0
    ? await db
      .select()
      .from(leadEventsTable)
      .where(
        and(
          inArray(leadEventsTable.leadId, leadIds),
          sql`${leadEventsTable.expiresAt} IS NULL OR ${leadEventsTable.expiresAt} > now()`,
        ),
      )
    : [];

  const eventsByLead = events.reduce<Record<string, typeof events>>((acc, e) => {
    if (!acc[e.leadId]) acc[e.leadId] = [];
    acc[e.leadId]!.push(e);
    return acc;
  }, {});

  // Load threshold from config
  const [config] = await db
    .select({ autoDispatchThreshold: prospectorConfigTable.autoDispatchThreshold })
    .from(prospectorConfigTable)
    .where(eq(prospectorConfigTable.tenantId, tenantId))
    .limit(1);

  return res.status(200).json({
    leads: leads.map((l) => ({
      ...l,
      events: eventsByLead[l.id] ?? [],
    })),
    autoDispatchThreshold: config?.autoDispatchThreshold ?? 80,
    total: leads.length,
  });
});

// ── POST /prospector/dispatch-sdr/:leadId — dispara SDR manualmente ─────────
router.post("/prospector/dispatch-sdr/:leadId", async (req, res) => {
  const tenantId = resolveTenantId(req, undefined);
  const { leadId } = req.params as { leadId: string };

  const [lead] = await db
    .select()
    .from(leadsTable)
    .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)))
    .limit(1);

  if (!lead) return res.status(404).json({ error: "Lead não encontrado" });

  const segmento = lead.mercadoSegmento?.toLowerCase().replace(/\s+/g, "_") ?? "geral";
  const enrichData = lead.enrichmentData as Record<string, unknown> | null;
  const growth = (enrichData?.["growth"] ?? {}) as Record<string, unknown>;
  const digital = (enrichData?.["digital"] ?? {}) as Record<string, unknown>;

  const sinalPrincipal = growth["multiplas_unidades"]
    ? "expansão com múltiplas unidades"
    : Number(growth["reviews_velocity"] ?? 0) > 5
      ? "alta velocidade de avaliações"
      : digital["tem_ecommerce"]
        ? "presença digital em crescimento"
        : "oportunidade operacional identificada";

  const roiEstimate = lead.roiEstimate as Record<string, unknown> | null;

  const trigger =
    `[PROSPECÇÃO MANUAL] Lead selecionado da fila preditiva com score ${lead.propensityScore ?? "?"}. ` +
    `Use o contexto de inteligência para gerar uma primeira mensagem altamente personalizada. ` +
    (lead.priorityReason ? `Razão de prioridade: ${lead.priorityReason}.` : "");

  dispatchAgentBackground({
    tenantId,
    leadId,
    mensagem: trigger,
    log: req.log,
    forcedAgent: "sdr",
    scenario: {
      cold_outreach: true,
      origem: "prospector_predictive",
      propensity_score: lead.propensityScore,
      sinal_growth_principal: sinalPrincipal,
      perda_estimada: roiEstimate?.["perda_estimada_mes"],
      dor_digital: !digital["indicio_crm"] ? "sem_crm" : !digital["tem_site"] ? "sem_site" : null,
      segmento,
    },
  });

  await db
    .update(leadsTable)
    .set({ enrichmentStatus: "dispatched", updatedAt: new Date() })
    .where(eq(leadsTable.id, leadId));

  return res.status(200).json({ ok: true, leadId });
});

// ── POST /prospector/dispatch-top — dispara SDR nos top N leads ──────────────
router.post("/prospector/dispatch-top", async (req, res) => {
  const tenantId = resolveTenantId(req, undefined);
  const n = Math.min(Number(req.body?.["n"] ?? 10), 50);

  const leads = await db
    .select({ id: leadsTable.id })
    .from(leadsTable)
    .where(
      and(
        eq(leadsTable.tenantId, tenantId),
        inArray(leadsTable.enrichmentStatus, ["enriched", "scored"]),
        isNotNull(leadsTable.propensityScore),
      ),
    )
    .orderBy(desc(leadsTable.propensityScore))
    .limit(n);

  for (const lead of leads) {
    dispatchAgentBackground({
      tenantId,
      leadId: lead.id,
      mensagem: "[PROSPECÇÃO EM LOTE] Lead da fila preditiva. Gere uma primeira mensagem personalizada.",
      log: req.log,
      forcedAgent: "sdr",
      scenario: { cold_outreach: true, origem: "prospector_predictive" },
    });
  }

  await db
    .update(leadsTable)
    .set({ enrichmentStatus: "dispatched", updatedAt: new Date() })
    .where(
      and(
        eq(leadsTable.tenantId, tenantId),
        inArray(leadsTable.id, leads.map((l) => l.id)),
      ),
    );

  return res.status(200).json({ ok: true, dispatched: leads.length });
});

// ── POST /prospector/fila/discard/:leadId — descarta lead da fila ─────────────
router.post("/prospector/fila/discard/:leadId", async (req, res) => {
  const tenantId = resolveTenantId(req, undefined);
  const { leadId } = req.params as { leadId: string };

  await db
    .update(leadsTable)
    .set({ enrichmentStatus: "discarded", updatedAt: new Date() })
    .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)));

  return res.status(200).json({ ok: true });
});

// ── PUT /prospector/config/threshold — salva auto_dispatch_threshold ──────────
router.put("/prospector/config/threshold", async (req, res) => {
  const tenantId = resolveTenantId(req, undefined);
  const threshold = Number(req.body?.["threshold"] ?? 80);
  if (threshold < 0 || threshold > 100) {
    return res.status(400).json({ error: "threshold deve ser entre 0 e 100" });
  }

  const [existing] = await db
    .select({ id: prospectorConfigTable.id })
    .from(prospectorConfigTable)
    .where(eq(prospectorConfigTable.tenantId, tenantId))
    .limit(1);

  if (existing) {
    await db
      .update(prospectorConfigTable)
      .set({ autoDispatchThreshold: threshold, updatedAt: new Date() })
      .where(eq(prospectorConfigTable.tenantId, tenantId));
  } else {
    await db.insert(prospectorConfigTable).values({
      tenantId,
      autoDispatchThreshold: threshold,
    });
  }

  return res.status(200).json({ ok: true, threshold });
});

// ── Cmd 23: CNPJ/CNAE routes ───────────────────────────────────────────────

/** GET /prospector/cnpj/cnaes — list all CNAE entries with labels */
router.get("/prospector/cnpj/cnaes", async (req, res) => {
  const cnaes = await db
    .select()
    .from(cnaeVerticalMapTable)
    .orderBy(cnaeVerticalMapTable.prioridade, cnaeVerticalMapTable.label);
  return res.json({ cnaes });
});

/** POST /prospector/cnpj/search — bulk search by CNAE + city + opening date */
router.post("/prospector/cnpj/search", async (req, res) => {
  const schema = z.object({
    cnae: z.string().min(4),
    uf: z.string().length(2).optional(),
    municipio: z.string().optional(),
    aberturaDias: z.number().int().min(7).max(365).optional(),
    porte: z.enum(["MEI", "ME", "EPP", "DEMAIS"]).optional(),
    limit: z.number().int().min(1).max(50).optional().default(20),
    tenantId: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });

  const { cnae, uf, municipio, aberturaDias, porte, limit } = parsed.data;

  const result = await searchByCnae({ cnae, uf, municipio, aberturaDias, porte, limit });

  return res.json({
    empresas: result.empresas,
    total: result.total,
    apiKeyRequired: result.apiKeyRequired,
  });
});

/** GET /prospector/cnpj/lookup/:cnpj — single CNPJ lookup */
router.get("/prospector/cnpj/lookup/:cnpj", async (req, res) => {
  const cnpj = normalizeCnpj(req.params.cnpj ?? "");
  if (cnpj.length !== 14) return res.status(400).json({ error: "CNPJ inválido" });

  const company = await getCompanyByCnpj(cnpj);
  if (!company) return res.status(404).json({ error: "CNPJ não encontrado" });

  return res.json({ empresa: company });
});

/** POST /prospector/cnpj/prospectar — create lead/deal from a CNPJ result */
router.post("/prospector/cnpj/prospectar", async (req, res) => {
  const schema = z.object({
    cnpj: z.string().min(14),
    razaoSocial: z.string().min(2),
    nomeFantasia: z.string().nullish(),
    cnaeCode: z.string().optional(),
    cnaeDescricao: z.string().optional(),
    endereco: z.string().optional(),
    municipio: z.string().optional(),
    uf: z.string().optional(),
    telefone: z.string().nullish(),
    email: z.string().nullish(),
    dataAbertura: z.string().optional(),
    porte: z.string().nullish(),
    socios: z.array(z.object({ nome: z.string(), qualificacao: z.string().optional() })).optional().default([]),
    source: z.enum(["cnpj", "recem_aberta", "ad_library"]).optional().default("cnpj"),
    tenantId: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });

  const tenantId = resolveTenantId(req, parsed.data.tenantId);
  const d = parsed.data;

  const cnpjClean = normalizeCnpj(d.cnpj);

  // Deduplication check
  const [existing] = await db
    .select({ id: leadsTable.id, nome: leadsTable.nome })
    .from(leadsTable)
    .where(and(
      eq(leadsTable.tenantId, tenantId),
      or(
        eq(leadsTable.documento, cnpjClean),
        d.telefone ? eq(leadsTable.telefone, d.telefone) : sql`FALSE`,
      ),
    ))
    .limit(1);

  if (existing) {
    // Merge: update missing fields
    await db.update(leadsTable)
      .set({
        ...(d.telefone ? { telefone: d.telefone } : {}),
        ...(d.email ? { email: d.email } : {}),
        updatedAt: new Date(),
      })
      .where(eq(leadsTable.id, existing.id));

    return res.json({
      leadId: existing.id,
      merged: true,
      message: `Lead "${existing.nome}" já existe — dados mesclados`,
    });
  }

  // New cold discovery: stay as Prospect until qualification.
  const abertura = d.dataAbertura ? new Date(d.dataAbertura) : null;
  const diasAberto = abertura ? Math.floor((Date.now() - abertura.getTime()) / 86_400_000) : null;
  const isRecemAberta = diasAberto != null && diasAberto <= 90;
  const source = isRecemAberta ? "recem_aberta" : d.source;
  const sourceRef = `${source}:${cnpjClean}`;

  const result = await intakeColdProspect({
    tenantId,
    source,
    sourceRef,
    displayName: d.nomeFantasia || d.razaoSocial,
    cnpj: cnpjClean,
    razaoSocial: d.razaoSocial,
    phone: d.telefone ?? null,
    email: normalizeLeadEmail(d.email) ?? null,
    address: d.endereco ?? null,
    segment: d.cnaeDescricao ?? null,
    city: d.municipio ?? null,
    fitScore: isRecemAberta ? 75 : 65,
    vendoraiFitScore: 70,
    arqdorFitScore: /(constru|arquitet|engenhar|esquadr|material|imobili)/i.test(d.cnaeDescricao ?? "") ? 75 : 15,
    qualification: {
      facts: [
        { key: "cnpj", value: cnpjClean, confidence: 100, source, confirmed: true, observedAt: new Date().toISOString() },
        ...(d.dataAbertura ? [{ key: "data_abertura", value: d.dataAbertura, confidence: 100, source, confirmed: true, observedAt: new Date().toISOString() }] : []),
        ...(d.socios[0]?.nome ? [{ key: "qsa_contact", value: d.socios[0].nome, confidence: 100, source, confirmed: true, observedAt: new Date().toISOString() }] : []),
      ],
    },
    opportunitySummary: isRecemAberta
      ? `Empresa aberta há ${diasAberto} dias; oportunidade para diagnóstico da operação em formação.`
      : null,
  });

  return res.status(result.created ? 201 : 200).json({
    prospectId: result.prospect.id,
    companyId: result.companyId,
    merged: !result.created,
    isRecemAberta,
    linkedInUrl: buildLinkedInSearchUrl(d.razaoSocial, d.municipio ?? ""),
    decisorNome: d.socios[0]?.nome ?? null,
    stage: result.prospect.stage,
  });
});

/** POST /prospector/ads/search — discover companies via Meta Ad Library */
router.post("/prospector/ads/search", async (req, res) => {
  const schema = z.object({
    searchTerms: z.string().min(2),
    limit: z.number().int().min(1).max(50).optional().default(20),
    tenantId: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });

  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) {
    return res.status(400).json({
      error: "INSTAGRAM_ACCESS_TOKEN não configurado",
      hint: "Configure o token do Instagram/Meta para usar esta funcionalidade",
    });
  }

  const result = await searchMetaAds(parsed.data.searchTerms, token, parsed.data.limit);

  return res.json({
    ads: result.ads,
    hasAds: result.hasAds,
    searchTerms: parsed.data.searchTerms,
  });
});

/** POST /prospector/ads/prospectar — ingest a Meta/Instagram advertiser into the canonical Prospector */
router.post("/prospector/ads/prospectar", async (req, res) => {
  const schema = z.object({
    pageId: z.string().min(1),
    pageName: z.string().min(2),
    snapshotUrl: z.string().url().nullish(),
    startDate: z.string().nullish(),
    searchTerms: z.string().optional(),
    tenantId: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });

  const tenantId = resolveTenantId(req, parsed.data.tenantId);
  const d = parsed.data;

  // Cross-enrich Meta discovery with Google Places when quota/provider are available.
  let place: PlacesResult | null = null;
  try {
    await checkApiQuota(tenantId, "google_places", req.log);
    place = await searchPlace(d.pageName, req.log);
  } catch (err) {
    req.log.warn({ err, pageId: d.pageId }, "prospector/meta: Google cross-enrichment unavailable (non-fatal)");
  }

  const telefone = place?.telefone ?? null;
  const whatsapp = deriveWhatsapp(telefone);
  const now = new Date().toISOString();
  const metaSignal = {
    origem: "ad_library",
    meta_page_id: d.pageId,
    meta_page_name: d.pageName,
    meta_ad_snapshot_url: d.snapshotUrl ?? null,
    meta_ad_start_date: d.startDate ?? null,
    meta_search_terms: d.searchTerms ?? null,
    meta_anunciante_ativo: true,
    rating: place?.rating ?? null,
    total_ratings: place?.reviewCount ?? null,
    prospectado_em: now,
  };

  // Deduplicate inside the tenant by Meta page id, phone or exact business name.
  const [existing] = await db
    .select({ id: leadsTable.id, nome: leadsTable.nome, metadata: leadsTable.metadata })
    .from(leadsTable)
    .where(and(
      eq(leadsTable.tenantId, tenantId),
      or(
        sql`${leadsTable.metadata}->>'meta_page_id' = ${d.pageId}`,
        telefone ? eq(leadsTable.telefone, telefone) : sql`FALSE`,
        sql`lower(${leadsTable.nome}) = lower(${d.pageName})`,
      ),
    ))
    .limit(1);

  if (existing) {
    await db.update(leadsTable)
      .set({
        telefone: telefone ?? undefined,
        websiteUrl: place?.siteOficial ?? undefined,
        endereco: place?.endereco ?? undefined,
        metadata: {
          ...((existing.metadata ?? {}) as Record<string, unknown>),
          ...metaSignal,
        },
        priorityReason: "Anunciante Meta/Instagram ativo — sinal comercial atualizado",
        updatedAt: new Date(),
      })
      .where(eq(leadsTable.id, existing.id));

    return res.status(200).json({
      leadId: existing.id,
      dealId: null,
      merged: true,
      message: `Lead "${existing.nome}" já existe — sinal Meta atualizado`,
    });
  }

  const result = await intakeColdProspect({
    tenantId,
    source: "ad_library",
    sourceRef: `ad_library:${d.pageId}`,
    displayName: d.pageName,
    phone: telefone,
    website: place?.siteOficial ?? null,
    address: place?.endereco ?? null,
    segment: d.searchTerms ?? null,
    fitScore: 72,
    vendoraiFitScore: 78,
    arqdorFitScore: /(constru|arquitet|engenhar|esquadr|material|imobili)/i.test(d.searchTerms ?? "") ? 68 : 15,
    qualification: {
      inferredPains: ["possível perda de leads entre anúncio e atendimento"],
      facts: [
        { key: "active_meta_advertiser", value: true, confidence: 100, source: "ad_library", confirmed: true, observedAt: now },
        ...(place?.rating != null ? [{ key: "google_rating", value: place.rating, confidence: 100, source: "google_places", confirmed: true, observedAt: now }] : []),
      ],
    },
    opportunitySummary: "Empresa identificada investindo ativamente em mídia paga; validar processo comercial antes de propor solução.",
  });

  return res.status(result.created ? 201 : 200).json({
    prospectId: result.prospect.id,
    companyId: result.companyId,
    merged: !result.created,
    whatsapp,
    stage: result.prospect.stage,
  });
});

/** POST /prospector/cnpj/recem-abertas — manual trigger of new-company scan */
router.post("/prospector/cnpj/recem-abertas", async (req, res) => {
  const schema = z.object({
    cnae: z.string().min(4),
    municipio: z.string().optional(),
    uf: z.string().length(2).optional(),
    aberturaDias: z.number().int().min(7).max(365).optional().default(30),
    limit: z.number().int().min(1).max(20).optional().default(10),
    tenantId: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });

  const tenantId = resolveTenantId(req, parsed.data.tenantId);
  const { cnae, municipio, uf, aberturaDias, limit } = parsed.data;

  const result = await searchByCnae({ cnae, municipio, uf, aberturaDias, limit });

  if (result.apiKeyRequired) {
    return res.status(400).json({
      error: "CNPJ_API_KEY não configurada",
      hint: "Configure CNPJ_API_KEY (CNPJá ou similar) para buscar empresas recém-abertas",
      apiKeyRequired: true,
    });
  }

  // Filter: only companies opened within aberturaDias
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (aberturaDias ?? 30));

  const recemAbertas = result.empresas.filter((e) => {
    if (!e.dataAbertura) return false;
    return new Date(e.dataAbertura) >= cutoff;
  });

  return res.json({
    empresas: recemAbertas,
    total: recemAbertas.length,
    apiKeyRequired: false,
  });
});

/** POST /prospector/dedup-check — check if company already exists as lead */
router.post("/prospector/dedup-check", async (req, res) => {
  const schema = z.object({
    cnpj: z.string().optional(),
    nome: z.string().optional(),
    cidade: z.string().optional(),
    telefone: z.string().optional(),
    tenantId: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });

  const tenantId = resolveTenantId(req, parsed.data.tenantId);
  const { cnpj, nome, telefone } = parsed.data;

  if (!cnpj && !nome && !telefone) {
    return res.status(400).json({ error: "Informe pelo menos cnpj, nome ou telefone" });
  }

  const cnpjClean = cnpj ? normalizeCnpj(cnpj) : null;

  const conditions = [];
  if (cnpjClean) conditions.push(eq(leadsTable.documento, cnpjClean));
  if (telefone) conditions.push(eq(leadsTable.telefone, telefone));
  if (nome) {
    const nameNorm = normalizeName(nome);
    conditions.push(sql`extensions.unaccent(lower(${leadsTable.nome})) LIKE '%' || ${nameNorm} || '%'`);
  }

  const [existing] = await db
    .select({ id: leadsTable.id, nome: leadsTable.nome, source: leadsTable.source })
    .from(leadsTable)
    .where(and(eq(leadsTable.tenantId, tenantId), or(...conditions)))
    .limit(1);

  return res.json({
    exists: !!existing,
    leadId: existing?.id ?? null,
    leadNome: existing?.nome ?? null,
    source: existing?.source ?? null,
  });
});

// ── POST /tenants/:id/leads/:leadId/feedback — rate a lead ───────────────────
router.post(
  "/tenants/:id/leads/:leadId/feedback",
  async (req, res) => {
    const tenantId = resolveTenantId(req, req.params["id"]);
    const leadId = String(req.params["leadId"]);

    const parsed = insertProspectFeedbackSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: parsed.error.message });
      return;
    }

    const [lead] = await db
      .select({ id: leadsTable.id, tenantId: leadsTable.tenantId })
      .from(leadsTable)
      .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)));

    if (!lead) {
      res.status(404).json({ error: "Lead não encontrado" });
      return;
    }

    const result = await registerLeadFeedback({
      tenantId,
      leadId,
      userId: req.user!.sub,
      rating: parsed.data.rating,
      comment: parsed.data.comment,
    });

    res.status(201).json({ success: true, avgRating: result.avgRating });
  }
);

// ── GET /tenants/:id/leads/:leadId/feedback — list feedback for a lead ────────
router.get(
  "/tenants/:id/leads/:leadId/feedback",
  async (req, res) => {
    const tenantId = resolveTenantId(req, req.params["id"]);
    const leadId = String(req.params["leadId"]);

    const rows = await db
      .select({
        id: prospectFeedbackTable.id,
        rating: prospectFeedbackTable.rating,
        comment: prospectFeedbackTable.comment,
        converted: prospectFeedbackTable.converted,
        createdAt: prospectFeedbackTable.createdAt,
      })
      .from(prospectFeedbackTable)
      .where(
        and(
          eq(prospectFeedbackTable.tenantId, tenantId),
          eq(prospectFeedbackTable.leadId, leadId),
        )
      )
      .orderBy(desc(prospectFeedbackTable.createdAt));

    res.json(rows);
  }
);

export default router;

