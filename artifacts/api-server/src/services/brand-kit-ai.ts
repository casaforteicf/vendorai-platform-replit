import { pool } from "@workspace/db";
import { getOpenAIForTenant } from "../lib/agent-engine.js";

export type BrandStudioMode = "maintain" | "evolve" | "rebuild";

export type BrandStudioProposal = {
  mode: BrandStudioMode;
  diagnosis: string;
  rationale: string;
  brandName: string;
  slogan: string;
  tagline: string;
  positioning: string;
  valueProposition: string;
  audiences: string[];
  toneOfVoice: string[];
  keyMessages: string[];
  wordsToUse: string[];
  wordsToAvoid: string[];
  palette: Array<{ name: string; hex: string; use: string }>;
  typography: {
    headline: string;
    body: string;
    notes: string;
  };
  visualStyle: string;
  photographyStyle: string;
  videoStyle: string;
  logoDirection: {
    action: "keep" | "refine" | "redesign";
    concept: string;
    construction: string;
    symbolIdea: string;
    wordmarkNotes: string;
    restrictions: string[];
  };
  applications: string[];
  doList: string[];
  dontList: string[];
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function safeString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function safeStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 20)
    : [];
}

function normalizeHex(value: unknown): string {
  const raw = safeString(value).toUpperCase();
  return /^#[0-9A-F]{6}$/.test(raw) ? raw : "#111111";
}

function normalizeProposal(value: unknown, mode: BrandStudioMode, fallbackName: string): BrandStudioProposal {
  const raw = asRecord(value);
  const typography = asRecord(raw["typography"]);
  const logoDirection = asRecord(raw["logoDirection"]);
  const palette = Array.isArray(raw["palette"]) ? raw["palette"].slice(0, 6).map((item) => {
    const row = asRecord(item);
    return {
      name: safeString(row["name"], "Cor"),
      hex: normalizeHex(row["hex"]),
      use: safeString(row["use"], "Uso institucional"),
    };
  }) : [];

  const actionRaw = safeString(logoDirection["action"], mode === "rebuild" ? "redesign" : mode === "evolve" ? "refine" : "keep");
  const action = actionRaw === "redesign" || actionRaw === "refine" ? actionRaw : "keep";

  return {
    mode,
    diagnosis: safeString(raw["diagnosis"]),
    rationale: safeString(raw["rationale"]),
    brandName: safeString(raw["brandName"], fallbackName),
    slogan: safeString(raw["slogan"]),
    tagline: safeString(raw["tagline"]),
    positioning: safeString(raw["positioning"]),
    valueProposition: safeString(raw["valueProposition"]),
    audiences: safeStrings(raw["audiences"]),
    toneOfVoice: safeStrings(raw["toneOfVoice"]),
    keyMessages: safeStrings(raw["keyMessages"]),
    wordsToUse: safeStrings(raw["wordsToUse"]),
    wordsToAvoid: safeStrings(raw["wordsToAvoid"]),
    palette,
    typography: {
      headline: safeString(typography["headline"]),
      body: safeString(typography["body"]),
      notes: safeString(typography["notes"]),
    },
    visualStyle: safeString(raw["visualStyle"]),
    photographyStyle: safeString(raw["photographyStyle"]),
    videoStyle: safeString(raw["videoStyle"]),
    logoDirection: {
      action,
      concept: safeString(logoDirection["concept"]),
      construction: safeString(logoDirection["construction"]),
      symbolIdea: safeString(logoDirection["symbolIdea"]),
      wordmarkNotes: safeString(logoDirection["wordmarkNotes"]),
      restrictions: safeStrings(logoDirection["restrictions"]),
    },
    applications: safeStrings(raw["applications"]),
    doList: safeStrings(raw["doList"]),
    dontList: safeStrings(raw["dontList"]),
  };
}

async function loadBrandStudioContext(tenantId: string) {
  const tenantResult = await pool.query(
    `SELECT id, name, nome_empresa, segmento, vertical, site, descricao, logo_url, cor_primaria
       FROM tenants WHERE id = $1 LIMIT 1`,
    [tenantId],
  );
  if (!tenantResult.rowCount) throw new Error("Tenant não encontrado");
  const tenant = tenantResult.rows[0];

  const knowledgeResult = await pool.query(
    `SELECT titulo, conteudo, categoria, tags
       FROM knowledge_base
      WHERE tenant_id = $1 AND ativo = true
      ORDER BY updated_at DESC
      LIMIT 20`,
    [tenantId],
  );

  const brandKitResult = await pool.query(
    `SELECT name, logo_asset_id, visual_config, metadata
       FROM media_brand_video_kits
      WHERE tenant_id = $1 AND status = 'active'
      LIMIT 1`,
    [tenantId],
  );

  const assetsResult = await pool.query(
    `SELECT id, type, role, source, original_filename, metadata
       FROM media_assets
      WHERE tenant_id = $1 AND type IN ('image','video')
      ORDER BY created_at DESC
      LIMIT 40`,
    [tenantId],
  );

  return {
    tenant,
    knowledge: knowledgeResult.rows.map((row) => ({
      title: String(row.titulo ?? ""),
      category: String(row.categoria ?? ""),
      content: String(row.conteudo ?? "").slice(0, 1600),
      tags: Array.isArray(row.tags) ? row.tags : [],
    })),
    currentBrandKit: brandKitResult.rows[0] ?? null,
    mediaReferences: assetsResult.rows.map((row) => ({
      id: String(row.id),
      type: String(row.type),
      role: String(row.role ?? ""),
      source: String(row.source ?? ""),
      filename: row.original_filename ? String(row.original_filename) : null,
      metadata: asRecord(row.metadata),
    })),
  };
}

export async function buildBrandStudioProposal(input: {
  tenantId: string;
  mode: BrandStudioMode;
  notes?: string | null;
}): Promise<{ proposal: BrandStudioProposal; contextSummary: Record<string, unknown> }> {
  const context = await loadBrandStudioContext(input.tenantId);
  const tenant = context.tenant;
  const brandName = safeString(tenant.nome_empresa) || safeString(tenant.name) || "Marca";

  const modeInstruction = input.mode === "maintain"
    ? "MANTER: preserve reconhecimento, nome e essência. Organize, normalize e complete lacunas. Só recomende mudança de logo se houver problema funcional claro."
    : input.mode === "evolve"
      ? "EVOLUIR: preserve reconhecimento e ativos fortes, mas modernize slogan, paleta, tipografia, linguagem e logo quando necessário."
      : "REFAZER: proponha uma direção de identidade renovada e coerente com o negócio. Pode recomendar redesign de logo, novo slogan, nova paleta e nova linguagem visual, sem alterar fatos da empresa.";

  const system = [
    "Você é o Brand Studio AI do Vendor.ai, especialista em estratégia de marca, design systems, identidade visual e comunicação.",
    "Use SOMENTE fatos presentes no contexto do tenant para descrever empresa, produtos, diferenciais e públicos. Não invente fatos comerciais.",
    "Você pode criar propostas criativas de slogan, tagline, paleta, tipografia, linguagem visual e direção de logo.",
    "A resposta é uma PROPOSTA, nunca deve substituir a identidade oficial automaticamente.",
    "Retorne JSON válido, sem markdown.",
    modeInstruction,
  ].join("\n");

  const prompt = {
    mode: input.mode,
    notes: input.notes ?? null,
    tenant: {
      name: tenant.name,
      companyName: tenant.nome_empresa,
      segment: tenant.segmento ?? tenant.vertical,
      site: tenant.site,
      description: tenant.descricao,
      logoUrl: tenant.logo_url,
      primaryColor: tenant.cor_primaria,
    },
    knowledge: context.knowledge,
    currentBrandKit: context.currentBrandKit,
    mediaReferences: context.mediaReferences.map((item) => ({
      type: item.type,
      role: item.role,
      source: item.source,
      filename: item.filename,
      metadata: item.metadata,
    })),
    expectedShape: {
      diagnosis: "string",
      rationale: "string",
      brandName: "string",
      slogan: "string",
      tagline: "string",
      positioning: "string",
      valueProposition: "string",
      audiences: ["string"],
      toneOfVoice: ["string"],
      keyMessages: ["string"],
      wordsToUse: ["string"],
      wordsToAvoid: ["string"],
      palette: [{ name: "string", hex: "#RRGGBB", use: "string" }],
      typography: { headline: "string", body: "string", notes: "string" },
      visualStyle: "string",
      photographyStyle: "string",
      videoStyle: "string",
      logoDirection: {
        action: "keep|refine|redesign",
        concept: "string",
        construction: "string",
        symbolIdea: "string",
        wordmarkNotes: "string",
        restrictions: ["string"],
      },
      applications: ["string"],
      doList: ["string"],
      dontList: ["string"],
    },
  };

  const openai = await getOpenAIForTenant(input.tenantId);
  const completion = await openai.chat.completions.create({
    model: process.env["VENDORAI_BRAND_STUDIO_MODEL"]?.trim() || "gpt-5.6-luna",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: JSON.stringify(prompt) },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: unknown = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("A IA não retornou uma proposta de marca válida");
  }

  return {
    proposal: normalizeProposal(parsed, input.mode, brandName),
    contextSummary: {
      knowledgeCount: context.knowledge.length,
      mediaReferenceCount: context.mediaReferences.length,
      hasCurrentBrandKit: Boolean(context.currentBrandKit),
      hasLogo: Boolean(tenant.logo_url || context.currentBrandKit?.logo_asset_id),
      source: "tenant+knowledge+brand-kit+media-library",
    },
  };
}

export async function approveBrandStudioProposal(input: {
  tenantId: string;
  userId?: string | null;
  proposal: BrandStudioProposal;
}) {
  const current = await pool.query(
    `SELECT id, visual_config, metadata
       FROM media_brand_video_kits
      WHERE tenant_id = $1 AND status = 'active'
      LIMIT 1`,
    [input.tenantId],
  );

  const identity = {
    ...input.proposal,
    state: "approved",
    approvedAt: new Date().toISOString(),
    approvedByUserId: input.userId ?? null,
  };

  const visualPatch = {
    brandStudio: {
      palette: input.proposal.palette,
      typography: input.proposal.typography,
      visualStyle: input.proposal.visualStyle,
      photographyStyle: input.proposal.photographyStyle,
      videoStyle: input.proposal.videoStyle,
      logoDirection: input.proposal.logoDirection,
    },
  };

  if (current.rowCount) {
    const row = current.rows[0];
    const visualConfig = { ...asRecord(row.visual_config), ...visualPatch };
    const metadata = { ...asRecord(row.metadata), brandIdentity: identity };
    const saved = await pool.query(
      `UPDATE media_brand_video_kits
          SET visual_config = $3::jsonb,
              metadata = $4::jsonb,
              updated_at = NOW()
        WHERE tenant_id = $1 AND id = $2
        RETURNING *`,
      [input.tenantId, String(row.id), JSON.stringify(visualConfig), JSON.stringify(metadata)],
    );
    return saved.rows[0];
  }

  const saved = await pool.query(
    `INSERT INTO media_brand_video_kits
      (id, tenant_id, created_by_user_id, name, status, caption_preset, visual_config, metadata, created_at, updated_at)
     VALUES (gen_random_uuid()::text, $1, $2, 'Kit principal', 'active', 'reels_bold', $3::jsonb, $4::jsonb, NOW(), NOW())
     RETURNING *`,
    [input.tenantId, input.userId ?? null, JSON.stringify(visualPatch), JSON.stringify({ brandIdentity: identity })],
  );
  return saved.rows[0];
}
