import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { and, eq, desc, or, sql } from "drizzle-orm";
import {
  db,
  prospectEnrichmentsTable,
  prospectApprovalsTable,
  leadsTable,
} from "@workspace/db";
import { callOpenAI as gatewayCallOpenAI } from "../lib/ai-gateway.js";

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
};

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

  // 1. Google Places lookup
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
          nome,
          telefone,
          documento: cnpjDigits,
          empresa: collected.razaoSocial ?? nome,
          endereco: ender,
          instagramHandle: igHandle,
          source: "prospector",
        })
        .returning({ id: leadsTable.id });
      resolvedLeadId = created?.id ?? null;
    }
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

  return res.status(201).json({ saved: true, isDuplicate, leadId: resolvedLeadId, enrichment: record });
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

router.post("/prospector/generate-message", async (req, res) => {
  const parsed = generateMessageBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Dados inválidos", details: parsed.error.flatten() });
  }
  const { messageType, nomeEmpresa, contexto, leadId, tenantId: bodyTenantId } = parsed.data;
  const tenantId = resolveTenantId(req, bodyTenantId);
  if (leadId) await assertLeadInTenant(leadId, tenantId);

  const ai = await gatewayCallOpenAI(
    tenantId,
    "content_generator",
    [
      {
        role: "system",
        content:
          "Você é um SDR especialista em prospecção. Escreva uma mensagem de primeiro contato " +
          `para o canal "${messageType}", curta, personalizada e cordial, em português do Brasil. ` +
          "Responda apenas com o texto da mensagem, sem aspas nem comentários.",
      },
      {
        role: "user",
        content: JSON.stringify({ nomeEmpresa: nomeEmpresa ?? null, contexto: contexto ?? null }),
      },
    ],
    { maxTokens: 400, temperature: 0.8, log: req.log },
  );

  const [approval] = await db
    .insert(prospectApprovalsTable)
    .values({
      tenantId,
      leadId: leadId ?? null,
      messageType,
      generatedText: ai.content,
      action: "generated",
    })
    .returning();

  return res.status(201).json({ text: ai.content, approval });
});

export default router;
