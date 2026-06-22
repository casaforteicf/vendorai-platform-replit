import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import {
  db,
  prospectEnrichmentsTable,
  prospectApprovalsTable,
} from "@workspace/db";
import { callOpenAI as gatewayCallOpenAI } from "../lib/ai-gateway.js";

const router: IRouter = Router();

// ── Google Places (New) — Text Search ─────────────────────────────────────────
type PlacesResult = {
  nomeEmpresa: string | null;
  endereco: string | null;
  rating: number | null;
  reviewCount: number | null;
  telefone: string | null;
  siteOficial: string | null;
};

async function searchPlace(query: string, log?: { error: (o: unknown, m?: string) => void }): Promise<PlacesResult | null> {
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
  leadId: z.string().optional(),
  tenantId: z.string().optional(),
});

router.post("/prospector/enrich", async (req, res) => {
  const parsed = enrichBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Dados inválidos", details: parsed.error.flatten() });
  }
  const { nomeEmpresa, endereco, leadId, tenantId: bodyTenantId } = parsed.data;
  const tenantId = resolveTenantId(req, bodyTenantId);

  // 1. Google Places lookup
  const query = endereco ? `${nomeEmpresa} ${endereco}` : nomeEmpresa;
  const place = await searchPlace(query, req.log);

  const nome = place?.nomeEmpresa ?? nomeEmpresa;
  const ender = place?.endereco ?? endereco ?? null;
  const telefone = place?.telefone ?? null;
  const site = place?.siteOficial ?? null;

  // 2. AI Gateway — pontos fortes e dores principais (enriquecimento básico)
  let pontosFortes: string[] = [];
  let doresPrincipais: string[] = [];
  try {
    const ai = await gatewayCallOpenAI(
      tenantId,
      "intelligence_analysis",
      [
        {
          role: "system",
          content:
            "Você é um analista de prospecção B2B. Dado os dados públicos de uma empresa, responda APENAS um JSON no formato " +
            '{"pontos_fortes": string[], "dores_principais": string[]} com no máximo 4 itens em cada lista, em português.',
        },
        {
          role: "user",
          content: JSON.stringify({
            nome,
            endereco: ender,
            rating: place?.rating ?? null,
            reviewCount: place?.reviewCount ?? null,
            telefone,
            site,
          }),
        },
      ],
      { responseFormat: { type: "json_object" }, maxTokens: 500, log: req.log },
    );
    const json = JSON.parse(ai.content) as { pontos_fortes?: string[]; dores_principais?: string[] };
    pontosFortes = Array.isArray(json.pontos_fortes) ? json.pontos_fortes : [];
    doresPrincipais = Array.isArray(json.dores_principais) ? json.dores_principais : [];
  } catch (err) {
    req.log.error({ err }, "prospector: AI enrichment failed");
  }

  // 3. Persist
  const [record] = await db
    .insert(prospectEnrichmentsTable)
    .values({
      tenantId,
      leadId: leadId ?? null,
      nomeEmpresa: nome,
      endereco: ender,
      rating: place?.rating != null ? String(place.rating) : null,
      reviewCount: place?.reviewCount ?? null,
      telefone,
      siteOficial: site,
      pontosFortes,
      doresPrincipais,
      temContato: Boolean(telefone || site),
    })
    .returning();

  return res.status(201).json(record);
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
