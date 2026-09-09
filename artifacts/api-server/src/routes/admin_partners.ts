import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { z } from "zod/v4";
import bcrypt from "bcryptjs";
import { db, partnersTable, usersTable, tenantsTable } from "@workspace/db";
import { requireRole } from "../middlewares/auth.js";
import { createSubaccount, isAsaasConfigured } from "../lib/asaas.js";
import { vendorPool } from "../lib/vendorDb.js";

const router: IRouter = Router();

const partnerTypeSchema = z.enum([
  "revendedor",
  "representante",
  "influenciador",
  "afiliado",
  "indicador",
  "agencia",
  "consultor",
  "integrador",
  "outro",
]);

const percentageSchema = z.number().min(0).max(100).optional();
const couponApplicationSchema = z.enum([
  "geral",
  "implantacao",
  "mensalidade",
  "produto",
  "servico",
  "marketplace",
]);

const createPartnerSchema = z.object({
  name: z.string().min(1),
  email: z.email(),
  password: z.string().min(8),
  cnpj: z.string().min(11, "CPF/CNPJ deve ter ao menos 11 caracteres").optional(),
  phone: z.string().min(10, "Telefone deve ter ao menos 10 caracteres").optional(),
  tipoParceiro: partnerTypeSchema.optional().default("revendedor"),
  comissaoPercentual: percentageSchema,
  comissaoRecorrentePercentual: percentageSchema,
  cupomCodigo: z.string().min(3).max(40).optional(),
  descontoCupomPercentual: percentageSchema,
  cupomAtivo: z.boolean().optional().default(false),
  cupomValidoAte: z.coerce.date().nullable().optional(),
  cupomAplicacao: couponApplicationSchema.optional().default("geral"),
});

const updatePartnerSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.email().optional(),
  cnpj: z.string().min(11).optional(),
  phone: z.string().min(10).optional(),
  tipoParceiro: partnerTypeSchema.optional(),
  comissaoPercentual: percentageSchema,
  comissaoRecorrentePercentual: percentageSchema,
  cupomCodigo: z.string().min(3).max(40).nullable().optional(),
  descontoCupomPercentual: percentageSchema,
  cupomAtivo: z.boolean().optional(),
  cupomValidoAte: z.coerce.date().nullable().optional(),
  cupomAplicacao: couponApplicationSchema.optional(),
});

const referralClickSchema = z.object({
  sessionId: z.string().min(8).max(120),
  source: z.string().max(80).optional().nullable(),
  landingPath: z.string().max(1500).optional().nullable(),
  utmSource: z.string().max(200).optional().nullable(),
  utmMedium: z.string().max(200).optional().nullable(),
  utmCampaign: z.string().max(200).optional().nullable(),
});

const linkTenantSchema = z.object({ partnerId: z.string().nullable() });

function normalizeCoupon(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.trim().toUpperCase().replace(/\s+/g, "");
  return normalized || null;
}

// Public validation endpoint used by lead forms, landing pages and checkout.
// It intentionally never returns partner commission information.
router.get("/partners/coupons/:code/validate", async (req, res) => {
  const code = normalizeCoupon(String(req.params["code"] ?? ""));
  if (!code || code.length < 3) {
    res.status(422).json({ valid: false, error: "Cupom inválido" });
    return;
  }

  const [partner] = await db
    .select({
      id: partnersTable.id,
      name: partnersTable.name,
      nomeFantasia: partnersTable.nomeFantasia,
      status: partnersTable.status,
      tipoParceiro: partnersTable.tipoParceiro,
      cupomCodigo: partnersTable.cupomCodigo,
      descontoCupomPercentual: partnersTable.descontoCupomPercentual,
      cupomAtivo: partnersTable.cupomAtivo,
      cupomValidoAte: partnersTable.cupomValidoAte,
      cupomAplicacao: partnersTable.cupomAplicacao,
    })
    .from(partnersTable)
    .where(eq(partnersTable.cupomCodigo, code))
    .limit(1);

  if (!partner || !partner.cupomAtivo || partner.status !== "ativo") {
    res.status(404).json({ valid: false, error: "Cupom não encontrado ou inativo" });
    return;
  }

  if (partner.cupomValidoAte && partner.cupomValidoAte.getTime() < Date.now()) {
    res.status(410).json({ valid: false, error: "Cupom expirado" });
    return;
  }

  res.json({
    valid: true,
    code: partner.cupomCodigo,
    partnerId: partner.id,
    partnerName: partner.nomeFantasia || partner.name,
    partnerType: partner.tipoParceiro,
    discountPercent: Number(partner.descontoCupomPercentual ?? 0),
    application: partner.cupomAplicacao,
  });
});

// Public click collection for referral links. One click is counted per partner/session,
// avoiding inflated numbers from page reloads. No IP or personal data is stored.
router.post("/partners/referrals/:code/click", async (req, res) => {
  const code = normalizeCoupon(String(req.params["code"] ?? ""));
  const parsed = referralClickSchema.safeParse(req.body);
  if (!code || code.length < 3 || !parsed.success) {
    res.status(422).json({ tracked: false });
    return;
  }

  const [partner] = await db
    .select({
      id: partnersTable.id,
      status: partnersTable.status,
      cupomAtivo: partnersTable.cupomAtivo,
      cupomValidoAte: partnersTable.cupomValidoAte,
    })
    .from(partnersTable)
    .where(eq(partnersTable.cupomCodigo, code))
    .limit(1);

  if (!partner || partner.status !== "ativo" || !partner.cupomAtivo) {
    res.status(404).json({ tracked: false });
    return;
  }
  if (partner.cupomValidoAte && partner.cupomValidoAte.getTime() < Date.now()) {
    res.status(410).json({ tracked: false });
    return;
  }

  const data = parsed.data;
  await vendorPool.query(
    `INSERT INTO partner_referral_events
      (partner_id,coupon_code,event_type,session_id,source,landing_path,utm_source,utm_medium,utm_campaign)
     VALUES ($1,$2,'click',$3,$4,$5,$6,$7,$8)
     ON CONFLICT (partner_id,session_id,event_type) DO NOTHING`,
    [
      partner.id,
      code,
      data.sessionId,
      data.source ?? null,
      data.landingPath ?? null,
      data.utmSource ?? null,
      data.utmMedium ?? null,
      data.utmCampaign ?? null,
    ],
  );

  res.status(202).json({ tracked: true });
});

router.get("/admin/partners-commercial", requireRole("super_admin"), async (_req, res) => {
  const partners = await db
    .select({
      id: partnersTable.id,
      name: partnersTable.name,
      nomeFantasia: partnersTable.nomeFantasia,
      email: partnersTable.email,
      cnpj: partnersTable.cnpj,
      phone: partnersTable.phone,
      telefone: partnersTable.telefone,
      status: partnersTable.status,
      tipoParceiro: partnersTable.tipoParceiro,
      comissaoPercentual: partnersTable.comissaoPercentual,
      comissaoRecorrentePercentual: partnersTable.comissaoRecorrentePercentual,
      cupomCodigo: partnersTable.cupomCodigo,
      descontoCupomPercentual: partnersTable.descontoCupomPercentual,
      cupomAtivo: partnersTable.cupomAtivo,
      cupomValidoAte: partnersTable.cupomValidoAte,
      cupomAplicacao: partnersTable.cupomAplicacao,
      asaasWalletId: partnersTable.asaasWalletId,
      createdAt: partnersTable.createdAt,
    })
    .from(partnersTable)
    .orderBy(desc(partnersTable.createdAt));

  res.json(partners);
});

// Funnel: click -> lead -> sale -> commission. The public UI never receives these values;
// this endpoint is restricted to super_admin.
router.get("/admin/partners-commercial/analytics", requireRole("super_admin"), async (_req, res) => {
  const result = await vendorPool.query(`
    WITH click_stats AS (
      SELECT partner_id, count(*)::int AS clicks
      FROM partner_referral_events
      WHERE event_type='click'
      GROUP BY partner_id
    ), lead_stats AS (
      SELECT indicado_por AS partner_id, count(*)::int AS leads
      FROM leads
      WHERE indicado_por IS NOT NULL AND excluido_em IS NULL
      GROUP BY indicado_por
    ), order_stats AS (
      SELECT partner_id,
             count(*) FILTER (WHERE status <> 'cancelado')::int AS orders,
             count(*) FILTER (WHERE status IN (
               'pago','em_separacao','pronto_coleta','coleta_agendada','coletado','em_rota','entregue','devolucao_solicitada','devolvido'
             ))::int AS sales
      FROM praca_pedidos
      WHERE partner_id IS NOT NULL
      GROUP BY partner_id
    ), commission_stats AS (
      SELECT partner_id,
             count(*)::int AS commissions,
             coalesce(sum(valor),0)::numeric AS commission_amount,
             coalesce(sum(valor) FILTER (WHERE status='pago'),0)::numeric AS paid_commission_amount
      FROM partner_commissions
      GROUP BY partner_id
    )
    SELECT p.id AS "partnerId",
           coalesce(c.clicks,0)::int AS clicks,
           coalesce(l.leads,0)::int AS leads,
           coalesce(o.orders,0)::int AS orders,
           coalesce(o.sales,0)::int AS sales,
           coalesce(cs.commissions,0)::int AS commissions,
           coalesce(cs.commission_amount,0)::text AS "commissionAmount",
           coalesce(cs.paid_commission_amount,0)::text AS "paidCommissionAmount",
           CASE WHEN coalesce(c.clicks,0)>0
             THEN round((coalesce(l.leads,0)::numeric / c.clicks::numeric) * 100, 2)
             ELSE 0 END::text AS "leadConversionPercent",
           CASE WHEN coalesce(c.clicks,0)>0
             THEN round((coalesce(o.sales,0)::numeric / c.clicks::numeric) * 100, 2)
             ELSE 0 END::text AS "saleConversionPercent",
           CASE WHEN coalesce(l.leads,0)>0
             THEN round((coalesce(o.sales,0)::numeric / l.leads::numeric) * 100, 2)
             ELSE 0 END::text AS "leadToSalePercent"
      FROM partners p
      LEFT JOIN click_stats c ON c.partner_id=p.id
      LEFT JOIN lead_stats l ON l.partner_id=p.id
      LEFT JOIN order_stats o ON o.partner_id=p.id
      LEFT JOIN commission_stats cs ON cs.partner_id=p.id
     ORDER BY p.created_at DESC
  `);
  res.json(result.rows);
});

router.post("/admin/partners", requireRole("super_admin"), async (req, res) => {
  const parsed = createPartnerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const data = parsed.data;
  const superAdminUser = await db
    .select({ tenantId: usersTable.tenantId })
    .from(usersTable)
    .where(eq(usersTable.id, req.user!.sub));

  if (!superAdminUser[0]) {
    res.status(500).json({ error: "Could not resolve super_admin tenant" });
    return;
  }

  const tenantId = superAdminUser[0].tenantId;
  const hashed = await bcrypt.hash(data.password, 12);

  try {
    const [user] = await db
      .insert(usersTable)
      .values({
        tenantId,
        name: data.name,
        email: data.email,
        password: hashed,
        role: "member",
        platformRole: "partner",
      })
      .returning({
        id: usersTable.id,
        email: usersTable.email,
        name: usersTable.name,
        platformRole: usersTable.platformRole,
      });

    const normalizedCoupon = normalizeCoupon(data.cupomCodigo);
    const [partner] = await db
      .insert(partnersTable)
      .values({
        name: data.name,
        nomeFantasia: data.name,
        email: data.email,
        cnpj: data.cnpj,
        phone: data.phone,
        telefone: data.phone,
        userId: user.id,
        tipoParceiro: data.tipoParceiro,
        comissaoPercentual:
          data.comissaoPercentual == null ? null : String(data.comissaoPercentual),
        comissaoRecorrentePercentual:
          data.comissaoRecorrentePercentual == null
            ? null
            : String(data.comissaoRecorrentePercentual),
        cupomCodigo: normalizedCoupon,
        descontoCupomPercentual:
          data.descontoCupomPercentual == null
            ? null
            : String(data.descontoCupomPercentual),
        cupomAtivo: Boolean(data.cupomAtivo && normalizedCoupon),
        cupomValidoAte: data.cupomValidoAte ?? null,
        cupomAplicacao: data.cupomAplicacao,
      })
      .returning();

    if (data.cnpj && data.phone && (await isAsaasConfigured())) {
      try {
        const subaccount = await createSubaccount({
          name: data.name,
          email: data.email,
          cpfCnpj: data.cnpj.replace(/\D/g, ""),
          mobilePhone: data.phone.replace(/\D/g, ""),
          companyType: "LIMITED",
        });

        const [updated] = await db
          .update(partnersTable)
          .set({ asaasAccountId: subaccount.id, asaasWalletId: subaccount.walletId })
          .where(eq(partnersTable.id, partner.id))
          .returning();

        res.status(201).json({ partner: updated, user, asaasSubconta: true });
        return;
      } catch (err) {
        req.log.warn({ err, partnerId: partner.id }, "Asaas subaccount creation failed");
      }
    }

    res.status(201).json({ partner, user, asaasSubconta: false });
  } catch (err: unknown) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "Email, CPF/CNPJ ou cupom já cadastrado" });
      return;
    }
    throw err;
  }
});

router.patch("/admin/partners/:id", requireRole("super_admin"), async (req, res) => {
  const partnerId = String(req.params["id"]);
  const parsed = updatePartnerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const data = parsed.data;
  const patch = {
    ...(data.name !== undefined ? { name: data.name, nomeFantasia: data.name } : {}),
    ...(data.email !== undefined ? { email: data.email } : {}),
    ...(data.cnpj !== undefined ? { cnpj: data.cnpj } : {}),
    ...(data.phone !== undefined ? { phone: data.phone, telefone: data.phone } : {}),
    ...(data.tipoParceiro !== undefined ? { tipoParceiro: data.tipoParceiro } : {}),
    ...(data.comissaoPercentual !== undefined
      ? { comissaoPercentual: String(data.comissaoPercentual) }
      : {}),
    ...(data.comissaoRecorrentePercentual !== undefined
      ? { comissaoRecorrentePercentual: String(data.comissaoRecorrentePercentual) }
      : {}),
    ...(data.cupomCodigo !== undefined
      ? { cupomCodigo: normalizeCoupon(data.cupomCodigo) }
      : {}),
    ...(data.descontoCupomPercentual !== undefined
      ? { descontoCupomPercentual: String(data.descontoCupomPercentual) }
      : {}),
    ...(data.cupomAtivo !== undefined ? { cupomAtivo: data.cupomAtivo } : {}),
    ...(data.cupomValidoAte !== undefined
      ? { cupomValidoAte: data.cupomValidoAte }
      : {}),
    ...(data.cupomAplicacao !== undefined
      ? { cupomAplicacao: data.cupomAplicacao }
      : {}),
  };

  try {
    const [partner] = await db
      .update(partnersTable)
      .set(patch)
      .where(eq(partnersTable.id, partnerId))
      .returning();

    if (!partner) {
      res.status(404).json({ error: "Partner not found" });
      return;
    }

    res.json(partner);
  } catch (err: unknown) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "Email, CPF/CNPJ ou cupom já cadastrado" });
      return;
    }
    throw err;
  }
});

router.patch("/admin/tenants/:id/partner", requireRole("super_admin"), async (req, res) => {
  const parsed = linkTenantSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const tenantId = String(req.params["id"]);
  const { partnerId } = parsed.data;

  if (partnerId) {
    const [exists] = await db
      .select({ id: partnersTable.id })
      .from(partnersTable)
      .where(eq(partnersTable.id, partnerId));

    if (!exists) {
      res.status(404).json({ error: "Partner not found" });
      return;
    }
  }

  const [tenant] = await db
    .update(tenantsTable)
    .set({ partnerId: partnerId ?? null, updatedAt: new Date() })
    .where(eq(tenantsTable.id, tenantId))
    .returning();

  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  res.json(tenant);
});

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "23505"
  );
}

export default router;
