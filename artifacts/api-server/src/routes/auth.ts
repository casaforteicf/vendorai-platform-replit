import { Router, type IRouter } from "express";
import { eq, and, desc, isNull } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "crypto";
import { z } from "zod/v4";
import { db, pool, usersTable, tenantsTable, partnersTable, passwordResetTokensTable, leadsTable, dealsTable, funisTable, plansTable, leadEventsTable } from "@workspace/db";
import { signToken } from "../lib/jwt.js";
import { authenticate, requireRole } from "../middlewares/auth.js";
import { sendPasswordResetEmail } from "../lib/email.js";
import { findLeadByDedup, storePhone } from "../lib/dedup.js";
import { getTenantCountryProfile } from "../lib/tenant-country-profile.js";
import { resolveSessionTenantContext } from "../lib/session-tenant-context.js";

const router: IRouter = Router();
const protectedRouter: IRouter = Router();
type AuthLookupUser = {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  password: string;
  role: "admin" | "member";
  platformRole: "super_admin" | "tenant_admin" | "tenant_seller" | "partner" | "member";
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  userFunction: "vendedor" | "representante_comercial" | "financeiro" | "suporte" | "entrega" | "administrador" | "outro" | null;
  telefone: string | null;
  forcePasswordReset: boolean;
  lastAssignedAt: Date | null;
  limiteEntregasPorTurno: string | null;
  changelogLidoEm: Date | null;
  permissions: string[] | null;
  customFunctionId: string | null;
  leadAssignmentEnabled: boolean | null;
  leadAssignmentCities: unknown;
  leadAssignmentRegions: unknown;
  leadAssignmentSegments: unknown;
  leadAssignmentLat: number | null;
  leadAssignmentLng: number | null;
  leadAssignmentRaioKm: number | null;
};

async function findUserForAuth(email: string): Promise<AuthLookupUser | undefined> {
  const result = await pool.query<AuthLookupUser>(
    `select
       id,
       tenant_id as "tenantId",
       name,
       email,
       password,
       role,
       platform_role as "platformRole",
       active,
       created_at as "createdAt",
       updated_at as "updatedAt",
       user_function as "userFunction",
       telefone,
       force_password_reset as "forcePasswordReset",
       last_assigned_at as "lastAssignedAt",
       limite_entregas_por_turno as "limiteEntregasPorTurno",
       changelog_lido_em as "changelogLidoEm",
       permissions,
       custom_function_id as "customFunctionId",
       lead_assignment_enabled as "leadAssignmentEnabled",
       lead_assignment_cities as "leadAssignmentCities",
       lead_assignment_regions as "leadAssignmentRegions",
       lead_assignment_segments as "leadAssignmentSegments",
       lead_assignment_lat as "leadAssignmentLat",
       lead_assignment_lng as "leadAssignmentLng",
       lead_assignment_raio_km as "leadAssignmentRaioKm"
     from app_security.lookup_user_for_auth($1)`,
    [email],
  );
  return result.rows[0];
}


async function markTenantFirstLogin(tenantId: string): Promise<void> {
  const now = new Date();
  await db
    .update(tenantsTable)
    .set({ firstLoginAt: now, updatedAt: now })
    .where(
      and(
        eq(tenantsTable.id, tenantId),
        eq(tenantsTable.isDemo, false),
        isNull(tenantsTable.firstLoginAt),
      ),
    );
}

// ── In-memory rate limiter for demo login ─────────────────────────
const demoLoginAttempts = new Map<string, number[]>();

function checkDemoRateLimit(clientKey: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const MINUTE_MS = 60_000;
  const HOUR_MS = 60 * MINUTE_MS;

  const attempts = demoLoginAttempts.get(clientKey) ?? [];
  const recent = attempts.filter((t) => now - t < HOUR_MS);

  // Max 5 per minute
  const inLastMinute = recent.filter((t) => now - t < MINUTE_MS).length;
  if (inLastMinute >= 5) {
    return { allowed: false, retryAfter: Math.ceil((MINUTE_MS - (now - recent[0]!)) / 1000) };
  }

  // Max 20 per hour
  if (recent.length >= 20) {
    return { allowed: false, retryAfter: Math.ceil((HOUR_MS - (now - recent[0]!)) / 1000) };
  }

  recent.push(now);
  demoLoginAttempts.set(clientKey, recent);
  return { allowed: true };
}

const PUBLIC_FIELDS = {
  id: usersTable.id,
  tenantId: usersTable.tenantId,
  name: usersTable.name,
  email: usersTable.email,
  role: usersTable.role,
  platformRole: usersTable.platformRole,
  userFunction: usersTable.userFunction,
  permissions: usersTable.permissions,
  telefone: usersTable.telefone,
  active: usersTable.active,
  forcePasswordReset: usersTable.forcePasswordReset,
  createdAt: usersTable.createdAt,
  updatedAt: usersTable.updatedAt,
} as const;

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1),
});

const registerSchema = z.object({
  tenantName: z.string().min(1),
  tenantSlug: z
    .string()
    .min(1)
    .transform((s) =>
      s
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
    )
    .refine((s) => s.length > 0, "Slug must contain valid characters"),
  name: z.string().min(1),
  email: z.email(),
  password: z.string().min(8),
});

const optionalTrialText = z.string().trim().max(2000).optional();
const optionalTrackingText = z.string().trim().max(2000).optional();

const demoSignupSchema = z.object({
  nomeEmpresa: z.string().min(1, "Nome da empresa é obrigatório"),
  nomePessoa: z.string().min(1, "Seu nome é obrigatório"),
  email: z.email(),
  senha: z.string().min(8, "Senha deve ter pelo menos 8 caracteres"),
  telefone: z.string().optional(),
  countryCode: z.enum(["BR", "PY", "AR", "UY", "CL"]).optional().default("BR"),
  segmento: optionalTrialText,
  nicho: optionalTrialText,
  produtosServicos: optionalTrialText,
  clienteIdeal: optionalTrialText,
  objetivoPrincipal: optionalTrialText,
  dorPrincipal: optionalTrialText,
  canalPrincipal: optionalTrialText,
  regiaoAtuacao: optionalTrialText,
  volumeLeads: optionalTrialText,
  tamanhoEquipe: optionalTrialText,
  utmSource: optionalTrackingText,
  utmMedium: optionalTrackingText,
  utmCampaign: optionalTrackingText,
  utmContent: optionalTrackingText,
  utmTerm: optionalTrackingText,
  gclid: optionalTrackingText,
  fbclid: optionalTrackingText,
  pageUrl: optionalTrackingText,
  referrer: optionalTrackingText,
  landingPageSlug: optionalTrackingText,
  offerCode: z.string().trim().max(160).optional(),
  behaviorSessionId: z.string().trim().max(120).optional(),
  adDataConsent: z.boolean().optional(),
  rfqToken: z.string().uuid().optional(),
  // Código de embaixador do Praça.ai (?ref=CODIGO) — se vier, dispara
  // registro de indicação de lojista pro Praça.ai depois do cadastro.
  codigoIndicacaoPraca: z.string().optional(),
});

const pracaSignupSchema = z.object({
  nomeEmpresa: z.string().min(1, "Nome da loja é obrigatório"),
  nomePessoa: z.string().min(1, "Seu nome é obrigatório"),
  email: z.email(),
  senha: z.string().min(8, "Senha deve ter pelo menos 8 caracteres"),
  telefone: z.string().optional(),
  codigoIndicacaoPraca: z.string().optional(),
});

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function compactRecord(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== ""));
}

async function linkRfqSupplierAccount(params: {
  rfqToken: string;
  accountTenantId: string;
  companyName: string;
  personName: string;
  email: string;
  phone?: string;
}): Promise<boolean> {
  const invitationResult = await pool.query(
    `SELECT i.*, p.category, p.discipline
       FROM arch_rfq_invitations i
       JOIN arch_rfq_packages p ON p.id=i.package_id
      WHERE i.public_token=$1::uuid
      LIMIT 1`,
    [params.rfqToken],
  );
  const invitation = invitationResult.rows[0];
  if (!invitation) return false;

  const invitedEmail = String(invitation.supplier_email || "").trim().toLowerCase();
  const invitedPhone = String(invitation.supplier_phone || "").replace(/\D/g, "");
  const accountEmail = params.email.trim().toLowerCase();
  const accountPhone = String(params.phone || "").replace(/\D/g, "");
  const identityMatches =
    (invitedEmail && invitedEmail === accountEmail)
    || (!invitedEmail && invitedPhone && accountPhone && invitedPhone === accountPhone);
  if (!identityMatches) return false;

  const supplierExisting = await pool.query(
    `SELECT id FROM fornecedores
      WHERE tenant_id=$1
        AND (
          ($2<>'' AND lower(COALESCE(email,''))=lower($2))
          OR ($3<>'' AND regexp_replace(COALESCE(telefone,''),'[^0-9]','','g')=$3)
        )
      ORDER BY created_at DESC
      LIMIT 1`,
    [invitation.tenant_id, accountEmail, accountPhone],
  );
  let supplierId = supplierExisting.rows[0]?.id ?? null;
  if (!supplierId) {
    const categories = invitation.category ? [String(invitation.category)] : [];
    const disciplines = invitation.discipline ? [String(invitation.discipline)] : [];
    const createdSupplier = await pool.query(
      `INSERT INTO fornecedores
        (id,tenant_id,nome,contato,telefone,email,categorias,disciplinas,regioes,marcas,ativo,created_at,updated_at)
       VALUES(gen_random_uuid()::text,$1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,'[]'::jsonb,'[]'::jsonb,true,now(),now())
       RETURNING id`,
      [
        invitation.tenant_id,
        params.companyName,
        params.personName,
        params.phone || invitation.supplier_phone || null,
        accountEmail,
        JSON.stringify(categories),
        JSON.stringify(disciplines),
      ],
    );
    supplierId = createdSupplier.rows[0]?.id ?? null;
  }

  let activationCommissionId: string | null = null;
  if (invitation.referrer_partner_id) {
    const tenantAttribution = await pool.query(
      `UPDATE tenants
          SET partner_id=COALESCE(partner_id,$2),
              indicado_por=COALESCE(indicado_por,$2),
              origem_cliente=COALESCE(origem_cliente,'rfq_supplier_referral'),
              updated_at=now()
        WHERE id=$1
        RETURNING partner_id,taxa_implantacao_valor`,
      [params.accountTenantId, invitation.referrer_partner_id],
    );
    const attributedTenant = tenantAttribution.rows[0];
    if (String(attributedTenant?.partner_id || "") === String(invitation.referrer_partner_id)) {
      const existingCommission = await pool.query(
        `SELECT id FROM partner_commissions
          WHERE partner_id=$1 AND tenant_id=$2 AND tipo='rfq_supplier_activation'
          ORDER BY created_at ASC LIMIT 1`,
        [invitation.referrer_partner_id, params.accountTenantId],
      );
      activationCommissionId = existingCommission.rows[0]?.id ? String(existingCommission.rows[0].id) : null;

      if (!activationCommissionId) {
        const partnerResult = await pool.query(
          `SELECT comissao_percentual FROM partners WHERE id=$1 LIMIT 1`,
          [invitation.referrer_partner_id],
        );
        const baseValue = Number(attributedTenant?.taxa_implantacao_valor ?? 0);
        const percent = Number(partnerResult.rows[0]?.comissao_percentual ?? 0);
        const commissionValue = baseValue > 0 && percent > 0 ? (baseValue * percent) / 100 : null;
        const createdCommission = await pool.query(
          `INSERT INTO partner_commissions
            (id,partner_id,tenant_id,tipo,valor_base,percentual,valor,data_referencia,status,created_at)
           VALUES(gen_random_uuid()::text,$1,$2,'rfq_supplier_activation',$3,$4,$5,CURRENT_DATE,'pendente',now())
           RETURNING id`,
          [
            invitation.referrer_partner_id,
            params.accountTenantId,
            baseValue > 0 ? String(baseValue) : null,
            percent > 0 ? String(percent) : null,
            commissionValue == null ? null : String(commissionValue),
          ],
        );
        activationCommissionId = createdCommission.rows[0]?.id ? String(createdCommission.rows[0].id) : null;
      }
    }
  }

  await pool.query(
    `UPDATE arch_rfq_invitations
        SET access_mode='converted',
            converted_tenant_id=$1,
            converted_at=COALESCE(converted_at,now()),
            supplier_id=COALESCE($2,supplier_id),
            supplier_name=COALESCE(NULLIF($3,''),supplier_name),
            contact_name=COALESCE(NULLIF($4,''),contact_name),
            supplier_email=COALESCE(NULLIF($5,''),supplier_email),
            supplier_phone=COALESCE(NULLIF($6,''),supplier_phone),
            activation_commission_id=COALESCE($7,activation_commission_id),
            updated_at=now()
      WHERE id=$8::uuid`,
    [params.accountTenantId, supplierId, params.companyName, params.personName, accountEmail, params.phone || "", activationCommissionId, invitation.id],
  );
  return true;
}

function accountExistsResponse(res: import("express").Response): void {
  res.status(409).json({
    code: "ACCOUNT_EXISTS",
    error: "Este e-mail já possui uma conta VendorAI. Entre na sua conta ou recupere sua senha.",
    loginUrl: "/login",
    forgotPasswordUrl: "/esqueci-senha",
  });
}

router.post("/auth/demo-signup", async (req, res) => {
  const parsed = demoSignupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const {
    nomeEmpresa,
    nomePessoa,
    email,
    senha,
    telefone,
    countryCode,
    codigoIndicacaoPraca,
    segmento,
    nicho,
    produtosServicos,
    clienteIdeal,
    objetivoPrincipal,
    dorPrincipal,
    canalPrincipal,
    regiaoAtuacao,
    volumeLeads,
    tamanhoEquipe,
    utmSource,
    utmMedium,
    utmCampaign,
    utmContent,
    utmTerm,
    gclid,
    fbclid,
    pageUrl,
    referrer,
    landingPageSlug,
    offerCode,
    behaviorSessionId,
    adDataConsent,
    rfqToken,
  } = parsed.data;
  const countryProfile = getTenantCountryProfile(countryCode);

  // Evita criar um tenant que depois ficaria órfão quando o e-mail já existe.
  const existingUser = await findUserForAuth(email);
  if (existingUser) {
    if (rfqToken) {
      try {
        await linkRfqSupplierAccount({
          rfqToken,
          accountTenantId: existingUser.tenantId,
          companyName: nomeEmpresa,
          personName: nomePessoa,
          email,
          phone: telefone,
        });
      } catch (rfqLinkError) {
        req.log?.error({ err: rfqLinkError, tenantId: existingUser.tenantId }, "auth: failed to link existing supplier account to RFQ");
      }
    }
    accountExistsResponse(res);
    return;
  }

  const slugBase = nomeEmpresa.toLowerCase().replace(/[^a-z0-9]/g, "-").substring(0, 30);
  const slug = `${slugBase}-${Math.random().toString(36).substring(2, 8)}`;
  const demoExpiresAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
  const hashed = await bcrypt.hash(senha, 12);

  try {
    // Tenant e usuário precisam nascer ou falhar juntos. Isso elimina tenants
    // órfãos em conflito de e-mail, erro de banco ou corrida entre cadastros.
    const { tenant, user } = await db.transaction(async (tx) => {
      const [tenant] = await tx
        .insert(tenantsTable)
        .values({
          name: nomeEmpresa,
          slug,
          status: "active",
          isDemo: true,
          demoExpiresAt,
          planId: null,
          provisioningMethod: "trial",
          countryCode,
          defaultLocale: countryProfile.defaultLocale,
          timezone: countryProfile.timezone,
          defaultCurrency: countryProfile.defaultCurrency,
          supportedCurrencies: [countryProfile.defaultCurrency],
          taxIdentifierType: countryProfile.taxIdentifierType,
          codigoIndicacaoPraca: codigoIndicacaoPraca ?? null,
        })
        .returning();

      if (!tenant) throw new Error("TRIAL_TENANT_NOT_CREATED");

      const [user] = await tx
        .insert(usersTable)
        .values({
          tenantId: tenant.id,
          name: nomePessoa,
          email,
          password: hashed,
          role: "admin",
          platformRole: "tenant_admin",
          telefone: telefone ?? null,
        })
        .returning(PUBLIC_FIELDS);

      if (!user) throw new Error("TRIAL_USER_NOT_CREATED");
      return { tenant, user };
    });

    // Side effects externos só acontecem depois que tenant + usuário foram
    // confirmados no banco.
    if (codigoIndicacaoPraca) {
      const pracaBaseUrl = process.env.PRACA_API_BASE_URL || "https://praca.ai/api";
      fetch(`${pracaBaseUrl}/embaixadores/indicar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo: codigoIndicacaoPraca, indicadoTenantId: tenant.id }),
        signal: AbortSignal.timeout(8000),
      }).catch((err) => {
        req.log?.error({ err, tenantId: tenant.id }, "auth: falha ao registrar indicação de lojista no Praça.ai");
      });
    }

    // A Demo deve nascer limpa para o usuário conhecer o produto com os próprios
    // dados. A fixture seedDemoData continua disponível internamente, mas não é
    // executada automaticamente no cadastro de trial.

    // ── Pipeline: promover o MESMO lead aquecido ao iniciar o trial ──
    try {
      const [vendorai] = await db
        .select()
        .from(tenantsTable)
        .where(eq(tenantsTable.slug, "vendorai"));
      if (vendorai) {
        const now = new Date();
        const normalizedPhone = storePhone(telefone);
        const qualification = compactRecord({
          countryCode,
          segmento,
          nicho,
          produtosServicos,
          clienteIdeal,
          objetivoPrincipal,
          dorPrincipal,
          canalPrincipal,
          regiaoAtuacao,
          volumeLeads,
          tamanhoEquipe,
        });
        const attribution = compactRecord({
          utmSource,
          utmMedium,
          utmCampaign,
          utmContent,
          utmTerm,
          gclid,
          fbclid,
          pageUrl,
          referrer,
          landingPageSlug,
          offerCode,
          behaviorSessionId,
          adDataConsent,
        });

        const dedup = await findLeadByDedup(vendorai.id, telefone, null, nomePessoa);
        let lead: typeof leadsTable.$inferSelect;

        if (dedup.found) {
          const currentDiscovery = asRecord(dedup.lead.discoveryData);
          const currentQualification = asRecord(currentDiscovery["qualification"]);
          const currentAttribution = asRecord(currentDiscovery["attribution"]);
          const originalSource = typeof currentDiscovery["originalSource"] === "string"
            ? currentDiscovery["originalSource"]
            : dedup.lead.source;
          const trialNote = `Trial de 5 dias iniciado em ${now.toISOString()}. Tenant: ${tenant.id}.`;

          [lead] = await db
            .update(leadsTable)
            .set({
              nome: nomePessoa,
              empresa: nomeEmpresa,
              email,
              telefone: normalizedPhone ?? dedup.lead.telefone,
              source: "trial_signup",
              notasNutricao: [dedup.lead.notasNutricao, trialNote].filter(Boolean).join("\n"),
              proximaAcao: "Acompanhar ativação do trial e ajudar o cliente a chegar ao primeiro valor.",
              discoveryData: {
                ...currentDiscovery,
                originalSource,
                trialTenantId: tenant.id,
                lifecycleStage: "trial",
                trialStartedAt: now.toISOString(),
                qualification: { ...currentQualification, ...qualification },
                attribution: { ...currentAttribution, ...attribution },
              },
              updatedAt: now,
            })
            .where(and(eq(leadsTable.id, dedup.lead.id), eq(leadsTable.tenantId, vendorai.id)))
            .returning();
        } else {
          [lead] = await db
            .insert(leadsTable)
            .values({
              tenantId: vendorai.id,
              nome: nomePessoa,
              empresa: nomeEmpresa,
              email,
              telefone: normalizedPhone,
              source: "trial_signup",
              status: "novo",
              proximaAcao: "Acompanhar ativação do trial e ajudar o cliente a chegar ao primeiro valor.",
              notasNutricao: `Trial de 5 dias iniciado em ${now.toISOString()}. Tenant: ${tenant.id}.`,
              discoveryData: {
                originalSource: "demo_signup",
                trialTenantId: tenant.id,
                lifecycleStage: "trial",
                trialStartedAt: now.toISOString(),
                qualification,
                attribution,
              },
            })
            .returning();
        }

        const [funil] = await db
          .select()
          .from(funisTable)
          .where(
            and(
              eq(funisTable.tenantId, vendorai.id),
              eq(funisTable.nome, "Funil de Vendas — VendorAI")
            )
          );

        const [existingDeal] = await db
          .select()
          .from(dealsTable)
          .where(and(eq(dealsTable.tenantId, vendorai.id), eq(dealsTable.leadId, lead.id)))
          .orderBy(desc(dealsTable.createdAt))
          .limit(1);

        if (existingDeal) {
          await db
            .update(dealsTable)
            .set({
              titulo: `Trial — ${nomeEmpresa}`,
              funilId: existingDeal.funilId ?? funil?.id ?? null,
              probabilidade: Math.max(Number(existingDeal.probabilidade ?? 0), 55),
              updatedAt: now,
            })
            .where(eq(dealsTable.id, existingDeal.id));
        } else {
          await db.insert(dealsTable).values({
            tenantId: vendorai.id,
            leadId: lead.id,
            titulo: `Trial — ${nomeEmpresa}`,
            etapa: "em_aquecimento",
            funilId: funil?.id ?? null,
            probabilidade: 55,
          });
        }

        await db.insert(leadEventsTable).values({
          leadId: lead.id,
          tipo: "trial_started",
          descricao: `Trial de 5 dias iniciado. Tenant ${tenant.id} preservará os dados se o cliente continuar.`,
          scoreBoost: 20,
        });
      }
    } catch (pipelineError) {
      // Falha no pipeline não bloqueia o cadastro de demo, mas fica observável.
      req.log?.error({ err: pipelineError, tenantId: tenant.id }, "auth: falha ao promover lead do trial");
    }

    if (rfqToken) {
      try {
        await linkRfqSupplierAccount({
          rfqToken,
          accountTenantId: tenant.id,
          companyName: nomeEmpresa,
          personName: nomePessoa,
          email,
          phone: telefone,
        });
      } catch (rfqLinkError) {
        req.log?.error({ err: rfqLinkError, tenantId: tenant.id }, "auth: failed to link RFQ supplier conversion");
      }
    }

    const token = signToken({
      sub: user.id,
      email: user.email,
      platformRole: user.platformRole,
      tenantId: user.tenantId,
      role: user.role,
    });

    res.status(201).json({
      token,
      user,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        isDemo: true,
        demoExpiresAt,
        countryCode,
        defaultLocale: countryProfile.defaultLocale,
        defaultCurrency: countryProfile.defaultCurrency,
      },
      demoUrl: `/app?tenant=${tenant.slug}`,
    });
  } catch (err: unknown) {
    if (isUniqueViolation(err)) {
      const existingUserAfterRace = await findUserForAuth(email);
      if (existingUserAfterRace) {
        accountExistsResponse(res);
        return;
      }
      res.status(409).json({
        code: "TRIAL_CONFLICT",
        error: "Não foi possível criar seu teste agora. Tente novamente.",
      });
      return;
    }
    throw err;
  }
});

// Cadastro gratuito e PERMANENTE pra vender no Praça.ai — diferente do
// /auth/demo-signup acima (que é trial de 5 dias, isDemo=true). Aqui o
// tenant nasce ativo, no plano Start (grátis, sem custo, ferramentas
// mínimas: Catálogo/Pedidos/Configurações), já habilitado pra vender no
// Praça.ai (vendeNoPracaAi=true) com a comissão padrão (8%, editável só
// por super_admin depois, caso a caso). Lojista pode assinar um plano
// pago a qualquer momento pra liberar mais ferramentas — nunca é cobrado
// nesse cadastro.
router.post("/auth/praca-signup", async (req, res) => {
  const parsed = pracaSignupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const { nomeEmpresa, nomePessoa, email, senha, telefone, codigoIndicacaoPraca } = parsed.data;

  const slugBase = nomeEmpresa.toLowerCase().replace(/[^a-z0-9]/g, "-").substring(0, 30);
  const slug = `${slugBase}-${Math.random().toString(36).substring(2, 8)}`;
  const hashed = await bcrypt.hash(senha, 12);

  try {
    const [startPlan] = await db.select().from(plansTable).where(eq(plansTable.slug, "start"));

    const [tenant] = await db
      .insert(tenantsTable)
      .values({
        name: nomeEmpresa,
        slug,
        status: "active",
        isDemo: false,
        planId: startPlan?.id ?? null,
        provisioningMethod: "self_service",
        vendeNoPracaAi: false,
        codigoIndicacaoPraca: codigoIndicacaoPraca ?? null,
      })
      .returning();

    // Registra a indicação de lojista no Praça.ai — fire-and-forget, nunca
    // trava nem falha o cadastro se o Praça.ai estiver fora do ar.
    if (codigoIndicacaoPraca) {
      const pracaBaseUrl = process.env.PRACA_API_BASE_URL || "https://praca.ai/api";
      fetch(`${pracaBaseUrl}/embaixadores/indicar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo: codigoIndicacaoPraca, indicadoTenantId: tenant.id }),
        signal: AbortSignal.timeout(8000),
      }).catch((err) => {
        req.log?.error({ err, tenantId: tenant.id }, "auth: falha ao registrar indicação de lojista no Praça.ai");
      });
    }

    const [user] = await db
      .insert(usersTable)
      .values({
        tenantId: tenant.id,
        name: nomePessoa,
        email,
        password: hashed,
        role: "admin",
        platformRole: "tenant_admin",
        telefone: telefone ?? null,
      })
      .returning(PUBLIC_FIELDS);

    // Mesmo pipeline de acompanhamento comercial do trial — registra como
    // lead/deal no tenant de vendas da VendorAI, só que já sinalizando que
    // entrou grátis pelo Praça.ai (não é trial expirando).
    try {
      const [vendorai] = await db.select().from(tenantsTable).where(eq(tenantsTable.slug, "vendorai"));
      if (vendorai) {
        const [funil] = await db
          .select()
          .from(funisTable)
          .where(and(eq(funisTable.tenantId, vendorai.id), eq(funisTable.nome, "Funil de Vendas — VendorAI")));
        const [lead] = await db
          .insert(leadsTable)
          .values({ tenantId: vendorai.id, nome: nomePessoa, empresa: nomeEmpresa, email, telefone: telefone ?? null, source: "praca_ai_signup" })
          .returning();
        await db.insert(dealsTable).values({
          tenantId: vendorai.id,
          leadId: lead.id,
          titulo: `Plano Start (Praça.ai) — ${nomeEmpresa}`,
          etapa: "novo",
          funilId: funil?.id ?? null,
          probabilidade: 15,
        });
      }
    } catch {
      // Falha no pipeline não bloqueia o cadastro
    }

    const token = signToken({
      sub: user.id,
      email: user.email,
      platformRole: user.platformRole,
      tenantId: user.tenantId,
      role: user.role,
    });

    res.status(201).json({
      token,
      user,
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, vendeNoPracaAi: tenant.vendeNoPracaAi, comissaoPracaAiPercentual: tenant.comissaoPracaAiPercentual },
      appUrl: `/app?tenant=${tenant.slug}`,
    });
  } catch (err: unknown) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "Email ou slug do tenant já existe" });
      return;
    }
    throw err;
  }
});

router.post("/auth/demo-login", async (req, res) => {
  const { email, password } = req.body;

  // Rate limiting check for demo credentials
  const isDemoCredentials = email === "demo" && password === "demo";
  if (!isDemoCredentials) {
    res.status(401).json({ error: "Invalid demo credentials" });
    return;
  }

  // Apply rate limiting (by IP)
  const clientKey = req.ip ?? "unknown";
  const rateLimit = checkDemoRateLimit(clientKey);
  if (!rateLimit.allowed) {
    res.status(429).json({ error: "Muitas tentativas de login demo. Tente novamente em breve.", retryAfter: rateLimit.retryAfter });
    return;
  }

  // Find or create demo tenant
  let [tenant] = await db
    .select()
    .from(tenantsTable)
    .where(eq(tenantsTable.slug, "demo"));

  if (!tenant) {
    [tenant] = await db
      .insert(tenantsTable)
      .values({
        name: "Demo",
        slug: "demo",
        status: "active",
        isDemo: true,
        onboardingConcluido: true,
        integracoesConcluido: true,
        demoExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
        planId: null,
      })
      .returning();
  }

  // Older demo tenants predate onboarding flags. Repair only the dedicated
  // shared demo tenant so its public preview can reach CRM endpoints.
  if (tenant.isDemo && (!tenant.onboardingConcluido || !tenant.integracoesConcluido)) {
    [tenant] = await db.update(tenantsTable)
      .set({ onboardingConcluido: true, integracoesConcluido: true })
      .where(and(eq(tenantsTable.id, tenant.id), eq(tenantsTable.isDemo, true)))
      .returning();
  }

  // Find or create demo user — scoped to the demo tenant to avoid
  // authenticating a conflicting account that reuses demo@demo.com.
  let [user] = await db
    .select()
    .from(usersTable)
    .where(
      and(
        eq(usersTable.email, "demo@demo.com"),
        eq(usersTable.tenantId, tenant.id),
      ),
    );

  if (!user) {
    const hashed = await bcrypt.hash("demo", 12);
    [user] = await db
      .insert(usersTable)
      .values({
        tenantId: tenant.id,
        name: "Demo User",
        email: "demo@demo.com",
        password: hashed,
        role: "admin",
        platformRole: "tenant_admin",
      })
      .returning();
  }

  // Seed if not seeded
  if (!tenant.demoSeeded) {
    const { seedDemoData } = await import("./tenants.js");
    await seedDemoData(tenant.id);
  }

  const token = signToken({
    sub: user.id,
    email: user.email,
    platformRole: user.platformRole,
    tenantId: user.tenantId,
    role: user.role,
    userFunction: user.userFunction ?? undefined,
  });

  const { password: _pw, ...publicUser } = user;
  res.json({
    token,
    user: publicUser,
    tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, isDemo: true },
  });
});

router.post("/auth/homolog-login", async (req, res) => {
  // Passwordless access is intentionally restricted to the isolated homolog
  // environment. Production never has VENDORAI_HOMOLOGATION_SEED=1.
  if (process.env.VENDORAI_HOMOLOGATION_SEED !== "1") {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const user = await findUserForAuth("marcos@vendor.ai");
  if (!user || !user.active) {
    req.log?.error({ authFailure: "homolog_fixture_missing" }, "auth: homolog passwordless login unavailable");
    res.status(503).json({ error: "Homologation user unavailable" });
    return;
  }

  const token = signToken({
    sub: user.id,
    email: user.email,
    platformRole: user.platformRole,
    tenantId: user.tenantId,
    role: user.role,
    userFunction: user.userFunction ?? undefined,
  });

  const { password: _pw, ...publicUser } = user;
  res.json({ token, user: publicUser, homologation: true });
});

router.post("/auth/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const { email, password } = parsed.data;

  const user = await findUserForAuth(email);

  if (!user || !user.active) {
    req.log?.warn(
      { authFailure: "user_missing_or_inactive", emailHash: createHash("sha256").update(email).digest("hex").slice(0, 12) },
      "auth: login rejected",
    );
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    req.log?.warn(
      { authFailure: "password_mismatch", userId: user.id, tenantId: user.tenantId },
      "auth: login rejected",
    );
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  if (user.platformRole === "tenant_admin" && !user.forcePasswordReset) {
    try {
      await markTenantFirstLogin(user.tenantId);
    } catch (err) {
      req.log?.error({ err, tenantId: user.tenantId }, "auth: failed to record tenant first login");
    }
  }

  let partnerId: string | undefined;
  if (user.platformRole === "partner") {
    const [partnerRow] = await db
      .select({ id: partnersTable.id })
      .from(partnersTable)
      .where(eq(partnersTable.userId, user.id));
    partnerId = partnerRow?.id;
  }

  const token = signToken({
    sub: user.id,
    email: user.email,
    platformRole: user.platformRole,
    tenantId: user.tenantId,
    role: user.role,
    userFunction: user.userFunction ?? undefined,
    ...(partnerId ? { partnerId } : {}),
  });

  const { password: _pw, ...publicUser } = user;
  res.json({ token, user: publicUser });
});

router.post("/auth/register", authenticate, requireRole("super_admin"), async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const { tenantName, tenantSlug, name, email, password } = parsed.data;

  const hashed = await bcrypt.hash(password, 12);

  try {
    const [tenant] = await db
      .insert(tenantsTable)
      .values({ name: tenantName, slug: tenantSlug })
      .returning();

    const [user] = await db
      .insert(usersTable)
      .values({
        tenantId: tenant.id,
        name,
        email,
        password: hashed,
        role: "admin",
        platformRole: "super_admin",
      })
      .returning(PUBLIC_FIELDS);

    const token = signToken({
      sub: user.id,
      email: user.email,
      platformRole: user.platformRole,
      tenantId: user.tenantId,
      role: user.role,
    });

    res.status(201).json({ token, user });
  } catch (err: unknown) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "Email or tenant slug already exists" });
      return;
    }
    throw err;
  }
});

protectedRouter.get("/auth/me", async (req, res) => {
  const [user] = await db
    .select(PUBLIC_FIELDS)
    .from(usersTable)
    .where(eq(usersTable.id, req.user!.sub));

  if (!user || !user.active) {
    res.status(401).json({ error: "User not found or inactive" });
    return;
  }

  const sessionTenant = await resolveSessionTenantContext({
    userId: user.id,
    baseTenantId: user.tenantId,
    tokenTenantId: req.user!.tenantId,
    platformRole: user.platformRole,
  });

  if (!sessionTenant.ok) {
    res.status(403).json({
      error: "SESSION_TENANT_FORBIDDEN",
      reason: sessionTenant.reason,
    });
    return;
  }

  res.json({
    ...user,
    tenantId: sessionTenant.tenant.id,
    tenantVertical: sessionTenant.tenant.vertical,
    tenantLogoUrl: sessionTenant.tenant.logoUrl,
    tenantWhiteLabel: sessionTenant.tenant.whiteLabelCompleto,
  });
});

protectedRouter.post("/auth/refresh", async (req, res) => {
  const [user] = await db
    .select(PUBLIC_FIELDS)
    .from(usersTable)
    .where(eq(usersTable.id, req.user!.sub));

  if (!user || !user.active) {
    res.status(401).json({ error: "User not found or inactive" });
    return;
  }

  const sessionTenant = await resolveSessionTenantContext({
    userId: user.id,
    baseTenantId: user.tenantId,
    tokenTenantId: req.user!.tenantId,
    platformRole: user.platformRole,
  });

  if (!sessionTenant.ok) {
    res.status(403).json({
      error: "SESSION_TENANT_FORBIDDEN",
      reason: sessionTenant.reason,
    });
    return;
  }

  let partnerId: string | undefined;
  if (user.platformRole === "partner") {
    const [partnerRow] = await db
      .select({ id: partnersTable.id })
      .from(partnersTable)
      .where(eq(partnersTable.userId, user.id));
    partnerId = partnerRow?.id;
  }

  const sessionUser = {
    ...user,
    tenantId: sessionTenant.tenant.id,
  };

  const token = signToken({
    sub: user.id,
    email: user.email,
    platformRole: user.platformRole,
    tenantId: sessionTenant.tenant.id,
    role: user.role,
    userFunction: user.userFunction ?? undefined,
    ...(partnerId ? { partnerId } : {}),
  });

  res.json({ token, user: sessionUser });
});

// ── Forgot password ───────────────────────────────────────────────────────

const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
});

router.post("/auth/forgot-password", async (req, res) => {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: "Email inválido" });
    return;
  }

  const { email } = parsed.data;

  const user = await findUserForAuth(email);

  // Always respond 200 to avoid user enumeration
  if (!user || !user.active) {
    res.json({ ok: true });
    return;
  }

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await db.insert(passwordResetTokensTable).values({
    userId: user.id,
    tokenHash,
    expiresAt,
  });

  // Achado real: usava REPLIT_DOMAINS (variável antiga, de antes da
  // migração pra Railway/Vercel) -- gerava link apontando pro domínio
  // do BACKEND (Railway), não pro site (Vercel), onde /app/redefinir-
  // senha nem existe como rota. APP_URL é a variável correta, já usada
  // em todos os outros fluxos de OAuth (Google/Meta/Instagram/WhatsApp).
  const appUrl = (process.env["APP_URL"] ?? "http://localhost:3000").replace(/\/$/, "");
  const resetUrl = `${appUrl}/redefinir-senha?token=${rawToken}`;

  await sendPasswordResetEmail(user.email, resetUrl);

  res.json({ ok: true });
});

// ── Reset password ─────────────────────────────────────────────────────────

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8, "A senha deve ter pelo menos 8 caracteres"),
});

router.post("/auth/reset-password", async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" });
    return;
  }

  const { token, newPassword } = parsed.data;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const now = new Date();

  const [resetRecord] = await db
    .select()
    .from(passwordResetTokensTable)
    .where(eq(passwordResetTokensTable.tokenHash, tokenHash));
  if (!resetRecord || resetRecord.usedAt || resetRecord.expiresAt < now) {
    res.status(400).json({ error: "Link inválido ou expirado. Solicite um novo link." });
    return;
  }

  const hashed = await bcrypt.hash(newPassword, 12);

  const [updatedUser] = await db
    .update(usersTable)
    .set({ password: hashed, updatedAt: now })
    .where(eq(usersTable.id, resetRecord.userId))
    .returning();

  await db
    .update(passwordResetTokensTable)
    .set({ usedAt: now })
    .where(eq(passwordResetTokensTable.id, resetRecord.id));

  // Auto-login: return a JWT so the client can skip the login step
  if (!updatedUser) {
    res.json({ ok: true });
    return;
  }

  let partnerId: string | undefined;
  if (updatedUser.platformRole === "partner") {
    const [partnerRow] = await db
      .select({ id: partnersTable.id })
      .from(partnersTable)
      .where(eq(partnersTable.userId, updatedUser.id));
    partnerId = partnerRow?.id;
  }

  const jwtToken = signToken({
    sub: updatedUser.id,
    email: updatedUser.email,
    platformRole: updatedUser.platformRole,
    tenantId: updatedUser.tenantId,
    role: updatedUser.role,
    userFunction: updatedUser.userFunction ?? undefined,
    ...(partnerId ? { partnerId } : {}),
  });

  const { password: _pw, ...publicUser } = updatedUser;
  res.json({ ok: true, token: jwtToken, user: publicUser });
});

// ── Force password change (first login) ───────────────────────────────────
protectedRouter.post("/auth/change-password", async (req, res) => {
  const { z } = await import("zod/v4");
  const schema = z.object({ newPassword: z.string().min(8) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: "Nova senha deve ter no mínimo 8 caracteres" });
    return;
  }

  const [existing] = await db.select({
    id: usersTable.id,
    tenantId: usersTable.tenantId,
    platformRole: usersTable.platformRole,
    forcePasswordReset: usersTable.forcePasswordReset,
  })
    .from(usersTable).where(eq(usersTable.id, req.user!.sub));
  if (!existing) { res.status(404).json({ error: "User not found" }); return; }

  const hashed = await bcrypt.hash(parsed.data.newPassword, 12);
  await db.update(usersTable)
    .set({ password: hashed, forcePasswordReset: false, updatedAt: new Date() })
    .where(eq(usersTable.id, existing.id));

  if (existing.forcePasswordReset && existing.platformRole === "tenant_admin") {
    try {
      await markTenantFirstLogin(existing.tenantId);
    } catch (err) {
      req.log?.error({ err, tenantId: existing.tenantId }, "auth: failed to record tenant first login after password change");
    }
  }

  res.json({ ok: true });
});

function isPgCode(err: unknown, code: string): boolean {
  if (typeof err !== "object" || err === null) return false;
  if ("code" in err && (err as { code: string }).code === code) return true;
  if ("cause" in err) return isPgCode((err as { cause: unknown }).cause, code);
  return false;
}

function isUniqueViolation(err: unknown): boolean {
  return isPgCode(err, "23505");
}

export { protectedRouter as authProtectedRouter };
export default router;