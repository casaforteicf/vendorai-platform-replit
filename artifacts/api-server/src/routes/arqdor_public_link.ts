import { Router, type Request } from "express";
import rateLimit from "express-rate-limit";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db, pool, leadsTable } from "@workspace/db";
import { signGuestConceptToken } from "../lib/jwt.js";
import { findLeadByDedup, storePhone } from "../lib/dedup.js";
import { pickNextVendedor } from "../lib/round-robin.js";
import { leadRegistrationMetadata, normalizeInstagramHandle, normalizeLeadEmail, normalizeLeadName } from "../lib/lead-registration-standard.js";

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
};

async function findLinkBySlug(slug: string): Promise<PublicLinkRow | null> {
  const result = await pool.query<PublicLinkRow>(
    `SELECT t.id AS tenant_id, t.name AS tenant_name, t.slug, l.enabled, l.owner_user_id
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
  return res.json({ tenantName: link.tenant_name, slug: link.slug });
});

// Botão "Projete sua casa" para o site montado em blocos (sem HTML gerado): o frontend pergunta
// se o tenant ativou a opção. Responde 404 quando desligado, sem revelar mais nada.
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
              updated_at = now()
        WHERE id = $1 AND tenant_id = $2`,
      [leadId, tenantId, data.instagram, address, data.email],
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
  }>(
    `SELECT t.slug, l.enabled, l.renders_per_day, l.show_on_site, l.site_button_label, l.site_button_color
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
    canManage: isTenantAdmin(req),
  });
});

arqdorPublicLinkAdminRouter.put("/arch/public-link", async (req, res) => {
  const user = req.user;
  if (!user?.tenantId || user.accessScope === "preprojeto") return res.status(403).json({ error: "Acesso negado." });
  if (!isTenantAdmin(req)) return res.status(403).json({ error: "Somente o administrador pode ativar o link público." });
  const enabled = req.body?.enabled === true;
  // Botão no site do tenant: opcional (desligado por padrão), com texto e cor escolhidos.
  const showOnSite = req.body?.showOnSite === true;
  const label = typeof req.body?.siteButtonLabel === "string" ? req.body.siteButtonLabel.trim().slice(0, 40) : "";
  const color = typeof req.body?.siteButtonColor === "string" && /^#[0-9a-fA-F]{6}$/.test(req.body.siteButtonColor)
    ? req.body.siteButtonColor
    : DEFAULT_SITE_BUTTON_COLOR;
  // Os pré-projetos que chegam pelo link ficam na lista de quem ativou.
  await pool.query(
    `INSERT INTO arqdor_public_links (tenant_id, enabled, owner_user_id, show_on_site, site_button_label, site_button_color)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (tenant_id) DO UPDATE SET enabled = EXCLUDED.enabled, owner_user_id = EXCLUDED.owner_user_id,
       show_on_site = EXCLUDED.show_on_site, site_button_label = EXCLUDED.site_button_label,
       site_button_color = EXCLUDED.site_button_color, updated_at = now()`,
    [user.tenantId, enabled, user.sub, showOnSite, label || DEFAULT_SITE_BUTTON_LABEL, color],
  );
  return res.json({ enabled, showOnSite, siteButtonLabel: label || DEFAULT_SITE_BUTTON_LABEL, siteButtonColor: color });
});
