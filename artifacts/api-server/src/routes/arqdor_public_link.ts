import { Router, type Request } from "express";
import rateLimit from "express-rate-limit";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, pool, leadsTable, archMarketplaceItemsTable, tenantsTable } from "@workspace/db";
import { signGuestConceptToken } from "../lib/jwt.js";
import { findLeadByDedup, storePhone } from "../lib/dedup.js";
import { pickNextVendedor } from "../lib/round-robin.js";
import { leadRegistrationMetadata, normalizeInstagramHandle, normalizeLeadEmail, normalizeLeadName } from "../lib/lead-registration-standard.js";
import { evaluateMarketProtection, loadTenantMarketProtectionRules } from "../lib/arqdor-market-protection.js";

// Link público do pré-projeto (Arqdor).
// O cliente final abre o link no site do profissional, informa os dados pessoais, vira lead
// no CRM do tenant e recebe um acesso que só abre o próprio pré-projeto
// (accessScope "preprojeto", cercado em enforceAccessScope).

export const arqdorPublicLinkRouter = Router();
export const arqdorPublicLinkAdminRouter = Router();

const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitos cadastros deste endereço. Tente novamente mais tarde." },
});

const profileLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

export const DEFAULT_SITE_BUTTON_LABEL = "Projete sua casa";
export const DEFAULT_SITE_BUTTON_COLOR = "#f97316";

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char] ?? char
));

/**
 * Botão flutuante "Projete sua casa" no site gerado do tenant, só quando o link público está
 * ativo E o tenant marcou a opção de mostrar no site. Caso contrário devolve o HTML intacto.
 */
export async function injectArqdorSiteButton(html: string, tenantId: string): Promise<string> {
  try {
    const result = await pool.query<{ slug: string; site_button_label: string | null; site_button_color: string | null }>(
      `SELECT t.slug, l.site_button_label, l.site_button_color
         FROM arqdor_public_links l JOIN tenants t ON t.id = l.tenant_id
        WHERE l.tenant_id = $1 AND l.enabled = true AND l.show_on_site = true AND l.owner_user_id IS NOT NULL
        LIMIT 1`,
      [tenantId],
    );
    const row = result.rows[0];
    if (!row?.slug) return html;
    const base = (process.env.APP_URL?.trim() || "https://app.appvendorai.com").replace(/\/$/, "");
    const url = `${base}/projeto/${encodeURIComponent(row.slug)}`;
    const color = /^#[0-9a-fA-F]{6}$/.test(row.site_button_color ?? "") ? row.site_button_color : DEFAULT_SITE_BUTTON_COLOR;
    const label = escapeHtml((row.site_button_label ?? "").trim() || DEFAULT_SITE_BUTTON_LABEL);
    const button = `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" data-arqdor-site-button="true" style="position:fixed;left:16px;bottom:16px;z-index:2147483000;display:inline-flex;align-items:center;gap:8px;padding:14px 20px;border-radius:999px;background:${color};color:#fff;font:600 15px/1.2 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;text-decoration:none;box-shadow:0 10px 30px rgba(15,23,42,.25)">&#127968; ${label}</a>`;
    return /<\/body>/i.test(html) ? html.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${button}</body>`) : `${html}${button}`;
  } catch {
    return html;
  }
}

type PublicLinkRow = {
  tenant_id: string;
  tenant_name: string;
  slug: string;
  enabled: boolean | null;
  owner_user_id: string | null;
  market_enabled: boolean | null;
  public_headline: string | null;
  public_subheadline: string | null;
  public_logo_url: string | null;
  public_primary_color: string | null;
  embed_enabled: boolean | null;
  market_button_label: string | null;
};

async function findLinkBySlug(slug: string): Promise<PublicLinkRow | null> {
  const result = await pool.query<PublicLinkRow>(
    `SELECT t.id AS tenant_id, t.name AS tenant_name, t.slug, l.enabled, l.owner_user_id,
              l.market_enabled, l.public_headline, l.public_subheadline, l.public_logo_url,
              l.public_primary_color, l.embed_enabled, l.market_button_label
       FROM tenants t
       LEFT JOIN arqdor_public_links l ON l.tenant_id = t.id
      WHERE t.slug = $1
      LIMIT 1`,
    [slug],
  );
  return result.rows[0] ?? null;
}

const digits = (value: string) => value.replace(/\D/g, "");

const signupSchema = z.object({
  nome: z.string().trim().min(3, "Informe o nome completo.").max(120),
  telefone: z.string().trim().refine((value) => digits(value).length >= 10 && digits(value).length <= 13, "Informe o WhatsApp com DDD."),
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido.").max(160),
  instagram: z.string().trim().transform((value) => value.replace(/^@+/, "")).refine((value) => /^[A-Za-z0-9._]{2,30}$/.test(value), "Informe o Instagram (ex.: @seuperfil)."),
  endereco: z.object({
    cep: z.string().trim().refine((value) => digits(value).length === 8, "Informe o CEP."),
    rua: z.string().trim().min(2, "Informe a rua.").max(160),
    numero: z.string().trim().min(1, "Informe o número.").max(20),
    complemento: z.string().trim().max(80).optional().default(""),
    bairro: z.string().trim().min(2, "Informe o bairro.").max(100),
    cidade: z.string().trim().min(2, "Informe a cidade.").max(100),
    uf: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Informe a UF."),
  }),
  aceite: z.literal(true, { message: "É preciso aceitar o uso dos dados para continuar." }),
  originCampaignId: z.string().trim().max(160).optional().nullable(),
  // Campo invisível no formulário: robôs preenchem, pessoas não.
  site: z.string().max(0).optional().default(""),
});

function formatAddress(address: z.infer<typeof signupSchema>["endereco"]) {
  const cep = digits(address.cep).replace(/^(\d{5})(\d{3})$/, "$1-$2");
  return `${address.rua}, ${address.numero}${address.complemento ? ` - ${address.complemento}` : ""} - ${address.bairro}, ${address.cidade}/${address.uf} - CEP ${cep}`;
}

arqdorPublicLinkRouter.get("/public/arqdor/:slug", profileLimiter, async (req, res) => {
  const link = await findLinkBySlug(String(req.params.slug));
  if (!link || !link.enabled || !link.owner_user_id) {
    return res.status(404).json({ error: "Este link de pré-projeto não está disponível." });
  }
  const primaryColor = /^#[0-9a-fA-F]{6}$/.test(link.public_primary_color ?? "") ? link.public_primary_color : DEFAULT_SITE_BUTTON_COLOR;
  return res.json({
    tenantName: link.tenant_name,
    slug: link.slug,
    marketEnabled: Boolean(link.market_enabled),
    embedEnabled: link.embed_enabled !== false,
    headline: (link.public_headline ?? "").trim() || "Projete a sua casa",
    subheadline: (link.public_subheadline ?? "").trim() || "Crie seu pré-projeto e avance para soluções compatíveis com sua necessidade.",
    logoUrl: link.public_logo_url ?? null,
    primaryColor,
    marketButtonLabel: (link.market_button_label ?? "").trim() || "Ver produtos e soluções",
  });
});

// Botão "Projete sua casa" para o site montado em blocos (sem HTML gerado): o frontend pergunta
// se o tenant ativou a opção. Responde 404 quando desligado, sem revelar mais nada.
arqdorPublicLinkRouter.get("/public/arqdor/:slug/market", profileLimiter, async (req, res) => {
  const link = await findLinkBySlug(String(req.params.slug));
  if (!link || !link.enabled || !link.owner_user_id || !link.market_enabled) {
    return res.status(404).json({ error: "O Market não está disponível nesta experiência." });
  }

  const busca = typeof req.query.busca === "string" ? req.query.busca.trim() : "";
  const categoria = typeof req.query.categoria === "string" ? req.query.categoria.trim() : "";
  const rows = await db
    .select({
      id: archMarketplaceItemsTable.id,
      vendedorTenantId: archMarketplaceItemsTable.vendedorTenantId,
      nome: archMarketplaceItemsTable.nome,
      descricao: archMarketplaceItemsTable.descricao,
      categoria: archMarketplaceItemsTable.categoria,
      preco: archMarketplaceItemsTable.preco,
      imagens: archMarketplaceItemsTable.imagens,
      especificacoes: archMarketplaceItemsTable.especificacoes,
      totalVendas: archMarketplaceItemsTable.totalVendas,
      empresaNome: tenantsTable.name,
    })
    .from(archMarketplaceItemsTable)
    .innerJoin(tenantsTable, eq(tenantsTable.id, archMarketplaceItemsTable.vendedorTenantId))
    .where(eq(archMarketplaceItemsTable.ativo, true))
    .limit(300);

  const rules = await loadTenantMarketProtectionRules(link.tenant_id);
  const normalizedSearch = busca.toLocaleLowerCase("pt-BR");
  const normalizedCategory = categoria.toLocaleLowerCase("pt-BR");

  const produtos = rows
    .filter((row) => {
      if (normalizedSearch) {
        const hay = [row.nome, row.descricao, row.categoria].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");
        if (!hay.includes(normalizedSearch)) return false;
      }
      if (normalizedCategory && !String(row.categoria ?? "").toLocaleLowerCase("pt-BR").includes(normalizedCategory)) return false;
      return true;
    })
    .map((row) => ({
      row,
      decision: evaluateMarketProtection({
        vendedorTenantId: row.vendedorTenantId,
        categoria: row.categoria,
        nome: row.nome,
        especificacoes: (row.especificacoes ?? {}) as Record<string, unknown>,
      }, link.tenant_id, rules),
    }))
    .filter(({ decision }) => decision.incluir)
    .sort((a, b) => {
      if (b.decision.boost !== a.decision.boost) return b.decision.boost - a.decision.boost;
      return Number(b.row.totalVendas ?? 0) - Number(a.row.totalVendas ?? 0);
    })
    .slice(0, 80)
    .map(({ row, decision }) => ({
      id: row.id,
      fornecedorTenantId: row.vendedorTenantId,
      fornecedorNome: row.empresaNome,
      parceiroOrigem: row.vendedorTenantId === link.tenant_id,
      nome: row.nome,
      descricao: row.descricao,
      categoria: row.categoria,
      preco: row.preco == null ? null : Number(row.preco),
      imagens: row.imagens ?? [],
      especificacoes: row.especificacoes ?? {},
      acaoPrincipal: row.preco != null && Number(row.preco) > 0 ? "comprar" : "cotar",
      protecaoComercial: decision.modo,
    }));

  return res.json({
    tenantName: link.tenant_name,
    primaryColor: /^#[0-9a-fA-F]{6}$/.test(link.public_primary_color ?? "") ? link.public_primary_color : DEFAULT_SITE_BUTTON_COLOR,
    produtos,
  });
});

arqdorPublicLinkRouter.get("/public/arqdor/:slug/site-button", profileLimiter, async (req, res) => {
  const result = await pool.query<{ slug: string; site_button_label: string | null; site_button_color: string | null }>(
    `SELECT t.slug, l.site_button_label, l.site_button_color
       FROM tenants t JOIN arqdor_public_links l ON l.tenant_id = t.id
      WHERE (t.slug = $1 OR t.subdomain_slug = $1) AND l.enabled = true AND l.show_on_site = true AND l.owner_user_id IS NOT NULL
      LIMIT 1`,
    [String(req.params.slug)],
  );
  const row = result.rows[0];
  if (!row) return res.status(404).json({ enabled: false });
  return res.json({
    enabled: true,
    path: `/projeto/${encodeURIComponent(row.slug)}`,
    label: (row.site_button_label ?? "").trim() || DEFAULT_SITE_BUTTON_LABEL,
    color: /^#[0-9a-fA-F]{6}$/.test(row.site_button_color ?? "") ? row.site_button_color : DEFAULT_SITE_BUTTON_COLOR,
  });
});

arqdorPublicLinkRouter.post("/public/arqdor/:slug/cadastro", signupLimiter, async (req, res) => {
  const link = await findLinkBySlug(String(req.params.slug));
  if (!link || !link.enabled || !link.owner_user_id) {
    return res.status(404).json({ error: "Este link de pré-projeto não está disponível." });
  }

  const parsed = signupSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return res.status(400).json({ error: first?.message ?? "Confira os dados informados.", field: first?.path.join(".") });
  }
  const data = parsed.data;
  if (data.site) return res.status(400).json({ error: "Cadastro inválido." });

  const tenantId = link.tenant_id;
  const originSource = "arqdor_partner_public_link";
  const originCampaignId = data.originCampaignId || null;
  const address = formatAddress(data.endereco);
  const customerProfile = {
    name: data.nome,
    phone: data.telefone,
    email: data.email,
    instagram: data.instagram,
    address,
    addressParts: data.endereco,
    source: "link_publico",
    consentAt: new Date().toISOString(),
  };

  // Lead: reaproveita pelo e-mail ou telefone para não duplicar no CRM.
  let leadId: string | null = null;
  const byEmail = await pool.query<{ id: string }>(
    `SELECT id FROM leads WHERE tenant_id = $1 AND lower(email) = $2 AND excluido_em IS NULL LIMIT 1`,
    [tenantId, data.email],
  );
  leadId = byEmail.rows[0]?.id ?? null;
  if (!leadId) {
    const match = await findLeadByDedup(tenantId, data.telefone, null, data.nome);
    if (match.found) leadId = match.lead.id;
  }
  if (leadId) {
    await pool.query(
      `UPDATE leads
          SET instagram_handle = COALESCE(NULLIF(instagram_handle, ''), $3),
              endereco = COALESCE(NULLIF(endereco, ''), $4),
              email = COALESCE(NULLIF(email, ''), $5),
              origin_tenant_id = COALESCE(origin_tenant_id, $2),
              origin_source = COALESCE(origin_source, $6),
              origin_campaign_id = COALESCE(origin_campaign_id, $7),
              origin_captured_at = COALESCE(origin_captured_at, now()),
              updated_at = now()
        WHERE id = $1 AND tenant_id = $2`,
      [leadId, tenantId, data.instagram, address, data.email, originSource, originCampaignId],
    );
  } else {
    const assignedTo = await pickNextVendedor(tenantId, {});
    const [lead] = await db.insert(leadsTable).values({
      tenantId,
      nome: normalizeLeadName(data.nome, "Lead Arqdor"),
      telefone: storePhone(data.telefone),
      email: normalizeLeadEmail(data.email),
      instagramHandle: normalizeInstagramHandle(data.instagram),
      endereco: address,
      source: "arqdor_link_publico",
      originTenantId: tenantId,
      originSource,
      originCampaignId,
      originCapturedAt: new Date(),
      objetivo: "Projeto residencial (pré-projeto online)",
      assignedTo,
      metadata: leadRegistrationMetadata(null, {
        entryChannel: "site",
        entrySource: "arqdor_link_publico",
      }),
    }).returning({ id: leadsTable.id });
    leadId = lead?.id ?? null;
  }

  // Quem volta com o mesmo e-mail e telefone continua o pré-projeto que já tinha.
  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM arch_concept_projects
      WHERE tenant_id = $1 AND owner_user_id = $2
        AND lower(customer_profile->>'email') = $3
        AND regexp_replace(coalesce(customer_profile->>'phone', ''), '\\D', '', 'g') = $4
        AND customer_profile->>'source' = 'link_publico'
      ORDER BY updated_at DESC
      LIMIT 1`,
    [tenantId, link.owner_user_id, data.email, digits(data.telefone)],
  );

  let conceptId = existing.rows[0]?.id ?? null;
  if (!conceptId) {
    conceptId = randomUUID();
    await pool.query(
      `INSERT INTO arch_concept_projects
         (id, tenant_id, owner_user_id, title, status, current_step, lot, configuration, rooms, customer_profile)
       VALUES ($1, $2, $3, $4, 'draft', 4, $5::jsonb, $6::jsonb, '[]'::jsonb, $7::jsonb)`,
      [
        conceptId,
        tenantId,
        link.owner_user_id,
        `Pré-projeto — ${data.nome}`.slice(0, 120),
        JSON.stringify({ width: 12, depth: 30 }),
        JSON.stringify({ floors: 1, leadId }),
        JSON.stringify(customerProfile),
      ],
    );
  }

  const token = signGuestConceptToken({
    ownerUserId: link.owner_user_id,
    tenantId,
    conceptId,
    leadId,
    email: data.email,
  });
  return res.status(201).json({ token, conceptId, tenantName: link.tenant_name });
});

// ── Configuração pelo profissional (autenticado) ────────────────────────────────────────

function isTenantAdmin(req: Request) {
  const user = req.user;
  return user?.platformRole === "super_admin" || user?.platformRole === "tenant_admin" || user?.userFunction === "administrador";
}

arqdorPublicLinkAdminRouter.get("/arch/public-link", async (req, res) => {
  const user = req.user;
  if (!user?.tenantId || user.accessScope === "preprojeto") return res.status(403).json({ error: "Acesso negado." });
  const result = await pool.query<{
    slug: string; enabled: boolean | null; renders_per_day: number | null;
    show_on_site: boolean | null; site_button_label: string | null; site_button_color: string | null;
    market_enabled: boolean | null; public_headline: string | null; public_subheadline: string | null;
    public_logo_url: string | null; public_primary_color: string | null; embed_enabled: boolean | null; market_button_label: string | null;
  }>(
    `SELECT t.slug, l.enabled, l.renders_per_day, l.show_on_site, l.site_button_label, l.site_button_color,
            l.market_enabled, l.public_headline, l.public_subheadline, l.public_logo_url, l.public_primary_color, l.embed_enabled, l.market_button_label
       FROM tenants t LEFT JOIN arqdor_public_links l ON l.tenant_id = t.id
      WHERE t.id = $1`,
    [user.tenantId],
  );
  const row = result.rows[0];
  if (!row) return res.status(404).json({ error: "Empresa não encontrada." });
  return res.json({
    slug: row.slug,
    enabled: Boolean(row.enabled),
    rendersPerDay: row.renders_per_day ?? 5,
    showOnSite: Boolean(row.show_on_site),
    siteButtonLabel: row.site_button_label ?? DEFAULT_SITE_BUTTON_LABEL,
    siteButtonColor: row.site_button_color ?? DEFAULT_SITE_BUTTON_COLOR,
    marketEnabled: Boolean(row.market_enabled),
    headline: row.public_headline ?? "",
    subheadline: row.public_subheadline ?? "",
    logoUrl: row.public_logo_url ?? "",
    primaryColor: row.public_primary_color ?? DEFAULT_SITE_BUTTON_COLOR,
    embedEnabled: row.embed_enabled !== false,
    marketButtonLabel: row.market_button_label ?? "Ver produtos e soluções",
    publicPath: `/projeto/${encodeURIComponent(row.slug)}`,
    embedCode: row.embed_enabled === false ? null : `<iframe src="${(process.env.APP_URL?.trim() || "https://app.appvendorai.com").replace(/\/$/, "")}/projeto/${encodeURIComponent(row.slug)}?embed=1" title="Pré-Projeto Arqdor" loading="lazy" style="width:100%;min-height:820px;border:0;border-radius:16px"></iframe>`,
    canManage: isTenantAdmin(req),
  });
});

arqdorPublicLinkAdminRouter.put("/arch/public-link", async (req, res) => {
  const user = req.user;
  if (!user?.tenantId || user.accessScope === "preprojeto") return res.status(403).json({ error: "Acesso negado." });
  if (!isTenantAdmin(req)) return res.status(403).json({ error: "Somente o administrador pode ativar o link público." });

  const enabled = req.body?.enabled === true;
  const showOnSite = req.body?.showOnSite === true;
  const marketEnabled = req.body?.marketEnabled === true;
  const embedEnabled = req.body?.embedEnabled !== false;
  const label = typeof req.body?.siteButtonLabel === "string" ? req.body.siteButtonLabel.trim().slice(0, 40) : "";
  const marketButtonLabel = typeof req.body?.marketButtonLabel === "string" ? req.body.marketButtonLabel.trim().slice(0, 50) : "";
  const headline = typeof req.body?.headline === "string" ? req.body.headline.trim().slice(0, 100) : "";
  const subheadline = typeof req.body?.subheadline === "string" ? req.body.subheadline.trim().slice(0, 220) : "";
  const logoUrl = typeof req.body?.logoUrl === "string" ? req.body.logoUrl.trim().slice(0, 500) : "";
  const color = typeof req.body?.siteButtonColor === "string" && /^#[0-9a-fA-F]{6}$/.test(req.body.siteButtonColor)
    ? req.body.siteButtonColor
    : DEFAULT_SITE_BUTTON_COLOR;
  const primaryColor = typeof req.body?.primaryColor === "string" && /^#[0-9a-fA-F]{6}$/.test(req.body.primaryColor)
    ? req.body.primaryColor
    : color;

  await pool.query(
    `INSERT INTO arqdor_public_links
      (tenant_id, enabled, owner_user_id, show_on_site, site_button_label, site_button_color,
       market_enabled, public_headline, public_subheadline, public_logo_url, public_primary_color, embed_enabled, market_button_label)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (tenant_id) DO UPDATE SET
       enabled=EXCLUDED.enabled,
       owner_user_id=EXCLUDED.owner_user_id,
       show_on_site=EXCLUDED.show_on_site,
       site_button_label=EXCLUDED.site_button_label,
       site_button_color=EXCLUDED.site_button_color,
       market_enabled=EXCLUDED.market_enabled,
       public_headline=EXCLUDED.public_headline,
       public_subheadline=EXCLUDED.public_subheadline,
       public_logo_url=EXCLUDED.public_logo_url,
       public_primary_color=EXCLUDED.public_primary_color,
       embed_enabled=EXCLUDED.embed_enabled,
       market_button_label=EXCLUDED.market_button_label,
       updated_at=now()`,
    [
      user.tenantId, enabled, user.sub, showOnSite,
      label || DEFAULT_SITE_BUTTON_LABEL, color, marketEnabled,
      headline || null, subheadline || null, logoUrl || null, primaryColor,
      embedEnabled, marketButtonLabel || "Ver produtos e soluções",
    ],
  );

  return res.json({
    enabled,
    showOnSite,
    siteButtonLabel: label || DEFAULT_SITE_BUTTON_LABEL,
    siteButtonColor: color,
    marketEnabled,
    headline,
    subheadline,
    logoUrl,
    primaryColor,
    embedEnabled,
    marketButtonLabel: marketButtonLabel || "Ver produtos e soluções",
  });
});
