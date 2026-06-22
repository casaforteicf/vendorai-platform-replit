import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { and, eq, desc, or, sql, inArray } from "drizzle-orm";
import {
  db,
  prospectEnrichmentsTable,
  prospectApprovalsTable,
  leadsTable,
  tenantsTable,
  notificationsTable,
} from "@workspace/db";
import {
  callOpenAI as gatewayCallOpenAI,
  generateEmbedding,
} from "../lib/ai-gateway.js";

// Quantidade de aprovações (approved + edited) para liberar a automação.
const AUTOMATION_THRESHOLD = 50;

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
    .orderBy(sql`${prospectApprovalsTable.embedding} <=> ${vec}::vector`)
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

export default router;
