import { Router } from "express";
import { and, eq, or } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  dealsTable,
  usersTable,
  tenantsTable,
  tenantCommercialPartnershipsTable,
  dealTenantParticipationsTable,
  intercompanyCommissionsTable,
  intercompanyCommissionPaymentsTable,
  erpTitulosTable,
  erpPagamentosTable,
} from "@workspace/db";

const router = Router();

const DEFAULT_PARTNER_PERMISSIONS = [
  "view_lead",
  "view_contacts",
  "create_activities",
  "move_pipeline",
  "create_proposal",
  "send_proposal",
  "negotiate",
  "close_deal",
  "assign_partner_user",
];

function isSuperAdmin(req: any) {
  return req.user?.platformRole === "super_admin";
}

function canManageOwnerTenant(req: any, tenantId: string) {
  return isSuperAdmin(req) || (
    req.user?.tenantId === tenantId &&
    req.user?.platformRole === "tenant_admin"
  );
}

function currentTenantId(req: any) {
  return String(req.user?.tenantId ?? "");
}

function money(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function commissionAmount(baseAmount: number, type: "percent" | "fixed", percent: number, fixedAmount?: number | null) {
  if (type === "fixed") return Math.max(0, fixedAmount ?? 0);
  return Math.max(0, baseAmount * (percent / 100));
}

async function validatePartnerUsers(partnerTenantId: string, userIds: string[]) {
  if (userIds.length === 0) return true;
  const rows = await db.select({ id: usersTable.id }).from(usersTable)
    .where(and(eq(usersTable.tenantId, partnerTenantId), eq(usersTable.active, true)));
  const ids = new Set(rows.map((row) => row.id));
  return userIds.every((id) => ids.has(id));
}

async function assertParticipationAccess(req: any, participationId: string) {
  const [participation] = await db.select().from(dealTenantParticipationsTable)
    .where(eq(dealTenantParticipationsTable.id, participationId)).limit(1);
  if (!participation || participation.status !== "active") return { error: "NOT_FOUND" as const };

  if (isSuperAdmin(req)) return { participation };

  const tenantId = currentTenantId(req);
  if (tenantId !== participation.ownerTenantId && tenantId !== participation.partnerTenantId) {
    return { error: "FORBIDDEN" as const };
  }

  if (tenantId === participation.partnerTenantId) {
    const [partnership] = participation.partnershipId
      ? await db.select().from(tenantCommercialPartnershipsTable)
          .where(eq(tenantCommercialPartnershipsTable.id, participation.partnershipId)).limit(1)
      : [null];

    const authorized = partnership?.authorizedUserIds ?? [];
    if (authorized.length > 0 && !authorized.includes(String(req.user?.sub ?? ""))) {
      return { error: "FORBIDDEN" as const };
    }
  }

  return { participation };
}

const createPartnershipSchema = z.object({
  partnerTenantId: z.string().min(1),
  relationshipType: z.string().trim().min(2).max(80).default("representante_comercial"),
  defaultCommissionPercent: z.coerce.number().min(0).max(100).default(15),
  defaultPermissions: z.array(z.string()).max(100).default(DEFAULT_PARTNER_PERMISSIONS),
  authorizedUserIds: z.array(z.string()).max(200).default([]),
  distributionMode: z.enum(["partner_queue", "manual_user", "round_robin", "least_loaded", "territory"]).default("partner_queue"),
  notes: z.string().trim().max(4000).nullable().optional(),
});

router.get("/tenants/:tenantId/commercial-partnerships", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!isSuperAdmin(req) && currentTenantId(req) !== tenantId) {
    return res.status(403).json({ error: "FORBIDDEN" });
  }

  const rows = await db
    .select({
      partnership: tenantCommercialPartnershipsTable,
      ownerName: tenantsTable.name,
    })
    .from(tenantCommercialPartnershipsTable)
    .leftJoin(tenantsTable, eq(tenantsTable.id, tenantCommercialPartnershipsTable.ownerTenantId))
    .where(or(
      eq(tenantCommercialPartnershipsTable.ownerTenantId, tenantId),
      eq(tenantCommercialPartnershipsTable.partnerTenantId, tenantId),
    ));

  const enriched = await Promise.all(rows.map(async ({ partnership, ownerName }) => {
    const [partner] = await db.select({ name: tenantsTable.name, tenantCode: tenantsTable.tenantCode })
      .from(tenantsTable).where(eq(tenantsTable.id, partnership.partnerTenantId)).limit(1);
    return { ...partnership, ownerName, partnerName: partner?.name ?? null, partnerTenantCode: partner?.tenantCode ?? null };
  }));

  return res.json(enriched);
});

router.post("/tenants/:tenantId/commercial-partnerships", async (req, res) => {
  const ownerTenantId = String(req.params.tenantId);
  if (!canManageOwnerTenant(req, ownerTenantId)) return res.status(403).json({ error: "FORBIDDEN" });

  const parsed = createPartnershipSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });
  if (parsed.data.partnerTenantId === ownerTenantId) {
    return res.status(422).json({ error: "A empresa representante deve ser diferente da empresa representada." });
  }

  const [partner] = await db.select({ id: tenantsTable.id, status: tenantsTable.status })
    .from(tenantsTable).where(eq(tenantsTable.id, parsed.data.partnerTenantId)).limit(1);
  if (!partner || partner.status !== "active") {
    return res.status(404).json({ error: "Empresa representante não encontrada ou inativa." });
  }

  if (!(await validatePartnerUsers(parsed.data.partnerTenantId, parsed.data.authorizedUserIds))) {
    return res.status(422).json({ error: "Um ou mais usuários autorizados não pertencem à empresa representante ou estão inativos." });
  }

  const [existing] = await db.select({ id: tenantCommercialPartnershipsTable.id })
    .from(tenantCommercialPartnershipsTable)
    .where(and(
      eq(tenantCommercialPartnershipsTable.ownerTenantId, ownerTenantId),
      eq(tenantCommercialPartnershipsTable.partnerTenantId, parsed.data.partnerTenantId),
      eq(tenantCommercialPartnershipsTable.relationshipType, parsed.data.relationshipType),
    )).limit(1);

  if (existing) return res.status(409).json({ error: "Esta representação já está cadastrada." });

  const [created] = await db.insert(tenantCommercialPartnershipsTable).values({
    ownerTenantId,
    partnerTenantId: parsed.data.partnerTenantId,
    relationshipType: parsed.data.relationshipType,
    status: "active",
    defaultCommissionPercent: String(parsed.data.defaultCommissionPercent),
    defaultPermissions: [...new Set(parsed.data.defaultPermissions)],
    authorizedUserIds: [...new Set(parsed.data.authorizedUserIds)],
    distributionMode: parsed.data.distributionMode,
    notes: parsed.data.notes ?? null,
    createdByUserId: req.user?.sub ?? null,
  }).returning();

  return res.status(201).json(created);
});

const updatePartnershipSchema = createPartnershipSchema.omit({ partnerTenantId: true }).partial();

router.patch("/commercial-partnerships/:partnershipId", async (req, res) => {
  const partnershipId = String(req.params.partnershipId);
  const [existing] = await db.select().from(tenantCommercialPartnershipsTable)
    .where(eq(tenantCommercialPartnershipsTable.id, partnershipId)).limit(1);
  if (!existing) return res.status(404).json({ error: "Representação não encontrada." });
  if (!canManageOwnerTenant(req, existing.ownerTenantId)) return res.status(403).json({ error: "FORBIDDEN" });

  const parsed = updatePartnershipSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  if (parsed.data.authorizedUserIds && !(await validatePartnerUsers(existing.partnerTenantId, parsed.data.authorizedUserIds))) {
    return res.status(422).json({ error: "Um ou mais usuários autorizados não pertencem à empresa representante ou estão inativos." });
  }

  const [updated] = await db.update(tenantCommercialPartnershipsTable).set({
    ...(parsed.data.relationshipType !== undefined ? { relationshipType: parsed.data.relationshipType } : {}),
    ...(parsed.data.defaultCommissionPercent !== undefined ? { defaultCommissionPercent: String(parsed.data.defaultCommissionPercent) } : {}),
    ...(parsed.data.defaultPermissions !== undefined ? { defaultPermissions: [...new Set(parsed.data.defaultPermissions)] } : {}),
    ...(parsed.data.authorizedUserIds !== undefined ? { authorizedUserIds: [...new Set(parsed.data.authorizedUserIds)] } : {}),
    ...(parsed.data.distributionMode !== undefined ? { distributionMode: parsed.data.distributionMode } : {}),
    ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
    updatedAt: new Date(),
  }).where(eq(tenantCommercialPartnershipsTable.id, partnershipId)).returning();

  return res.json(updated);
});

const shareDealSchema = z.object({
  partnershipId: z.string().min(1),
  role: z.enum(["responsible", "participant"]).default("responsible"),
  operationalUserId: z.string().min(1).nullable().optional(),
  permissions: z.array(z.string()).max(100).optional(),
  commissionType: z.enum(["percent", "fixed"]).default("percent"),
  commissionPercent: z.coerce.number().min(0).max(100).optional(),
  commissionFixedAmount: z.coerce.number().min(0).nullable().optional(),
});

router.post("/deals/:dealId/share-with-partner", async (req, res) => {
  const dealId = String(req.params.dealId);
  const [deal] = await db.select().from(dealsTable).where(eq(dealsTable.id, dealId)).limit(1);
  if (!deal) return res.status(404).json({ error: "Negócio não encontrado." });
  if (!canManageOwnerTenant(req, deal.tenantId)) return res.status(403).json({ error: "FORBIDDEN" });

  const parsed = shareDealSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [partnership] = await db.select().from(tenantCommercialPartnershipsTable)
    .where(and(
      eq(tenantCommercialPartnershipsTable.id, parsed.data.partnershipId),
      eq(tenantCommercialPartnershipsTable.ownerTenantId, deal.tenantId),
      eq(tenantCommercialPartnershipsTable.status, "active"),
    )).limit(1);
  if (!partnership) return res.status(422).json({ error: "Representação ativa não encontrada para este negócio." });

  if (parsed.data.operationalUserId) {
    const ok = await validatePartnerUsers(partnership.partnerTenantId, [parsed.data.operationalUserId]);
    if (!ok) return res.status(422).json({ error: "O responsável operacional precisa pertencer à empresa representante." });
  }

  const [ownerTenantForFinance] = await db.select({ name: tenantsTable.name })
    .from(tenantsTable).where(eq(tenantsTable.id, deal.tenantId)).limit(1);
  const [partnerTenantForFinance] = await db.select({ name: tenantsTable.name })
    .from(tenantsTable).where(eq(tenantsTable.id, partnership.partnerTenantId)).limit(1);
  const ownerTenantNameForFinance = ownerTenantForFinance?.name ?? deal.tenantId;
  const partnerTenantNameForFinance = partnerTenantForFinance?.name ?? partnership.partnerTenantId;

  const commissionPercent = parsed.data.commissionPercent ?? Number(partnership.defaultCommissionPercent ?? 15);
  const baseAmount = money(deal.valor);
  const fixedAmount = parsed.data.commissionFixedAmount ?? null;
  const amount = commissionAmount(baseAmount, parsed.data.commissionType, commissionPercent, fixedAmount);
  const permissions = [...new Set(parsed.data.permissions ?? partnership.defaultPermissions ?? DEFAULT_PARTNER_PERMISSIONS)];

  const result = await db.transaction(async (tx) => {
    // Only one company can be the primary responsible at a time. Previous
    // representatives remain participants so their history/commission is preserved.
    if (parsed.data.role === "responsible") {
      await tx.update(dealTenantParticipationsTable).set({
        role: "participant",
        updatedAt: new Date(),
      }).where(and(
        eq(dealTenantParticipationsTable.dealId, dealId),
        eq(dealTenantParticipationsTable.status, "active"),
        eq(dealTenantParticipationsTable.role, "responsible"),
      ));
    }

    const [current] = await tx.select().from(dealTenantParticipationsTable)
      .where(and(
        eq(dealTenantParticipationsTable.dealId, dealId),
        eq(dealTenantParticipationsTable.partnerTenantId, partnership.partnerTenantId),
      )).limit(1);

    const participation = current
      ? (await tx.update(dealTenantParticipationsTable).set({
          partnershipId: partnership.id,
          role: parsed.data.role,
          status: "active",
          operationalUserId: parsed.data.operationalUserId ?? null,
          permissions,
          commissionType: parsed.data.commissionType,
          commissionPercent: String(commissionPercent),
          commissionFixedAmount: fixedAmount === null ? null : String(fixedAmount),
          endedAt: null,
          updatedAt: new Date(),
        }).where(eq(dealTenantParticipationsTable.id, current.id)).returning())[0]
      : (await tx.insert(dealTenantParticipationsTable).values({
          dealId,
          ownerTenantId: deal.tenantId,
          partnerTenantId: partnership.partnerTenantId,
          partnershipId: partnership.id,
          role: parsed.data.role,
          status: "active",
          operationalUserId: parsed.data.operationalUserId ?? null,
          permissions,
          commissionType: parsed.data.commissionType,
          commissionPercent: String(commissionPercent),
          commissionFixedAmount: fixedAmount === null ? null : String(fixedAmount),
          sharedByUserId: req.user?.sub ?? null,
        }).returning())[0];

    if (!participation) throw new Error("Failed to create deal participation");

    const [existingCommission] = await tx.select().from(intercompanyCommissionsTable)
      .where(eq(intercompanyCommissionsTable.participationId, participation.id)).limit(1);

    const commission = existingCommission
      ? (await tx.update(intercompanyCommissionsTable).set({
          commissionType: parsed.data.commissionType,
          percent: String(commissionPercent),
          fixedAmount: fixedAmount === null ? null : String(fixedAmount),
          baseAmount: String(baseAmount.toFixed(2)),
          amount: String(amount.toFixed(2)),
          adjustedByUserId: req.user?.sub ?? null,
          updatedAt: new Date(),
        }).where(eq(intercompanyCommissionsTable.id, existingCommission.id)).returning())[0]
      : (await tx.insert(intercompanyCommissionsTable).values({
          dealId,
          participationId: participation.id,
          payerTenantId: deal.tenantId,
          beneficiaryTenantId: partnership.partnerTenantId,
          commissionType: parsed.data.commissionType,
          percent: String(commissionPercent),
          fixedAmount: fixedAmount === null ? null : String(fixedAmount),
          baseAmount: String(baseAmount.toFixed(2)),
          amount: String(amount.toFixed(2)),
          status: "prevista",
          adjustedByUserId: req.user?.sub ?? null,
        }).returning())[0];

    // Financeiro/fluxo de caixa nasce junto com a comissão prevista, não só
    // na primeira baixa. Os dois títulos compartilham a mesma origem lógica.
    let commissionWithFinance = commission;
    let payerTitleId = commission.payerTitleId;
    let beneficiaryTitleId = commission.beneficiaryTitleId;
    const dueAt = commission.dueAt ?? deal.dataFechamentoPrevista ?? new Date();

    if (!payerTitleId) {
      const [payerTitle] = await tx.insert(erpTitulosTable).values({
        tenantId: deal.tenantId,
        tipo: "pagar",
        categoria: "despesa",
        descricao: `Comissão de representação • ${deal.titulo}`,
        pessoa: partnerTenantNameForFinance,
        valorOriginal: String(amount.toFixed(2)),
        valorPago: String(money(commission.paidAmount).toFixed(2)),
        vencimento: dueAt,
        status: money(commission.paidAmount) >= amount && amount > 0 ? "pago" : "pendente",
        origemTipo: "intercompany_commission",
        origemId: commission.id,
        observacoes: "Comissão inter-tenant prevista a partir do negócio compartilhado.",
      }).returning();
      payerTitleId = payerTitle?.id ?? null;
    }

    if (!beneficiaryTitleId) {
      const [beneficiaryTitle] = await tx.insert(erpTitulosTable).values({
        tenantId: partnership.partnerTenantId,
        tipo: "receber",
        categoria: "receita",
        descricao: `Comissão de representação • ${deal.titulo}`,
        pessoa: ownerTenantNameForFinance,
        valorOriginal: String(amount.toFixed(2)),
        valorPago: String(money(commission.paidAmount).toFixed(2)),
        vencimento: dueAt,
        status: money(commission.paidAmount) >= amount && amount > 0 ? "pago" : "pendente",
        origemTipo: "intercompany_commission",
        origemId: commission.id,
        observacoes: "Comissão inter-tenant prevista a partir do negócio compartilhado.",
      }).returning();
      beneficiaryTitleId = beneficiaryTitle?.id ?? null;
    }

    if (payerTitleId !== commission.payerTitleId || beneficiaryTitleId !== commission.beneficiaryTitleId) {
      const [synced] = await tx.update(intercompanyCommissionsTable).set({
        payerTitleId,
        beneficiaryTitleId,
        dueAt,
        updatedAt: new Date(),
      }).where(eq(intercompanyCommissionsTable.id, commission.id)).returning();
      if (synced) commissionWithFinance = synced;
    }

    return { participation, commission: commissionWithFinance };
  });

  return res.status(201).json(result);
});

router.get("/tenants/:tenantId/representation-work", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!isSuperAdmin(req) && currentTenantId(req) !== tenantId) return res.status(403).json({ error: "FORBIDDEN" });

  const rows = await db.select({
    participation: dealTenantParticipationsTable,
    deal: dealsTable,
    commission: intercompanyCommissionsTable,
  }).from(dealTenantParticipationsTable)
    .innerJoin(dealsTable, eq(dealsTable.id, dealTenantParticipationsTable.dealId))
    .leftJoin(intercompanyCommissionsTable, eq(intercompanyCommissionsTable.participationId, dealTenantParticipationsTable.id))
    .where(and(
      eq(dealTenantParticipationsTable.partnerTenantId, tenantId),
      eq(dealTenantParticipationsTable.status, "active"),
    ));

  const visible = [];
  for (const row of rows) {
    const access = await assertParticipationAccess(req, row.participation.id);
    if (!("error" in access)) visible.push(row);
  }
  return res.json(visible);
});

const assignSchema = z.object({ operationalUserId: z.string().min(1).nullable() });

router.patch("/representation-work/:participationId/assign", async (req, res) => {
  const participationId = String(req.params.participationId);
  const access = await assertParticipationAccess(req, participationId);
  if ("error" in access) return res.status(access.error === "NOT_FOUND" ? 404 : 403).json({ error: access.error });

  const parsed = assignSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const p = access.participation;
  if (!isSuperAdmin(req) && currentTenantId(req) !== p.partnerTenantId) return res.status(403).json({ error: "FORBIDDEN" });
  if (!p.permissions.includes("assign_partner_user")) return res.status(403).json({ error: "A parceria não permite redistribuição interna." });

  if (parsed.data.operationalUserId && !(await validatePartnerUsers(p.partnerTenantId, [parsed.data.operationalUserId]))) {
    return res.status(422).json({ error: "Usuário operacional inválido para a empresa representante." });
  }

  const [updated] = await db.update(dealTenantParticipationsTable).set({
    operationalUserId: parsed.data.operationalUserId,
    updatedAt: new Date(),
  }).where(eq(dealTenantParticipationsTable.id, p.id)).returning();

  return res.json(updated);
});

const stageSchema = z.object({ etapa: z.string().trim().min(1).max(80) });

router.patch("/representation-work/:participationId/stage", async (req, res) => {
  const participationId = String(req.params.participationId);
  const access = await assertParticipationAccess(req, participationId);
  if ("error" in access) return res.status(access.error === "NOT_FOUND" ? 404 : 403).json({ error: access.error });

  const parsed = stageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });
  if (!access.participation.permissions.includes("move_pipeline")) {
    return res.status(403).json({ error: "A representação não possui autonomia para movimentar a pipeline." });
  }

  const [updated] = await db.update(dealsTable).set({
    etapa: parsed.data.etapa,
    updatedAt: new Date(),
  }).where(eq(dealsTable.id, access.participation.dealId)).returning();

  return res.json({ deal: updated, participation: access.participation });
});

const adjustCommissionSchema = z.object({
  commissionType: z.enum(["percent", "fixed"]),
  percent: z.coerce.number().min(0).max(100).default(15),
  fixedAmount: z.coerce.number().min(0).nullable().optional(),
  baseAmount: z.coerce.number().min(0).optional(),
  dueAt: z.coerce.date().nullable().optional(),
  reason: z.string().trim().min(2).max(2000),
});

router.patch("/intercompany-commissions/:commissionId", async (req, res) => {
  const commissionId = String(req.params.commissionId);
  const [commission] = await db.select().from(intercompanyCommissionsTable)
    .where(eq(intercompanyCommissionsTable.id, commissionId)).limit(1);
  if (!commission) return res.status(404).json({ error: "Comissão não encontrada." });
  if (!canManageOwnerTenant(req, commission.payerTenantId)) return res.status(403).json({ error: "FORBIDDEN" });

  const parsed = adjustCommissionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [deal] = await db.select({ valor: dealsTable.valor }).from(dealsTable)
    .where(eq(dealsTable.id, commission.dealId)).limit(1);
  const baseAmount = parsed.data.baseAmount ?? money(deal?.valor ?? commission.baseAmount);
  const amount = commissionAmount(baseAmount, parsed.data.commissionType, parsed.data.percent, parsed.data.fixedAmount ?? null);
  if (money(commission.paidAmount) > amount + 0.0001) {
    return res.status(409).json({ error: "A nova comissão não pode ser menor que o valor já pago." });
  }

  const [updated] = await db.update(intercompanyCommissionsTable).set({
    commissionType: parsed.data.commissionType,
    percent: String(parsed.data.percent),
    fixedAmount: parsed.data.fixedAmount == null ? null : String(parsed.data.fixedAmount),
    baseAmount: String(baseAmount.toFixed(2)),
    amount: String(amount.toFixed(2)),
    dueAt: parsed.data.dueAt ?? null,
    adjustedByUserId: req.user?.sub ?? null,
    adjustmentReason: parsed.data.reason,
    updatedAt: new Date(),
  }).where(eq(intercompanyCommissionsTable.id, commissionId)).returning();

  await db.update(dealTenantParticipationsTable).set({
    commissionType: parsed.data.commissionType,
    commissionPercent: String(parsed.data.percent),
    commissionFixedAmount: parsed.data.fixedAmount == null ? null : String(parsed.data.fixedAmount),
    updatedAt: new Date(),
  }).where(eq(dealTenantParticipationsTable.id, commission.participationId));

  // Keep both forecast titles synchronized with the negotiated amount.
  const paidAmount = money(commission.paidAmount);
  const titleStatus = paidAmount >= amount && amount > 0 ? "pago" : "pendente";
  if (commission.payerTitleId) {
    await db.update(erpTitulosTable).set({
      valorOriginal: String(amount.toFixed(2)),
      valorPago: String(paidAmount.toFixed(2)),
      vencimento: parsed.data.dueAt ?? commission.dueAt ?? new Date(),
      status: titleStatus,
      updatedAt: new Date(),
    }).where(eq(erpTitulosTable.id, commission.payerTitleId));
  }
  if (commission.beneficiaryTitleId) {
    await db.update(erpTitulosTable).set({
      valorOriginal: String(amount.toFixed(2)),
      valorPago: String(paidAmount.toFixed(2)),
      vencimento: parsed.data.dueAt ?? commission.dueAt ?? new Date(),
      status: titleStatus,
      updatedAt: new Date(),
    }).where(eq(erpTitulosTable.id, commission.beneficiaryTitleId));
  }

  return res.json(updated);
});

const paymentSchema = z.object({
  amount: z.coerce.number().positive(),
  payerAccount: z.string().trim().min(1).max(200),
  beneficiaryAccount: z.string().trim().min(1).max(200),
  paymentMethod: z.string().trim().max(100).nullable().optional(),
  proofUrl: z.string().url().nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  paidAt: z.coerce.date().optional(),
});

router.post("/intercompany-commissions/:commissionId/payments", async (req, res) => {
  const commissionId = String(req.params.commissionId);
  const [commission] = await db.select().from(intercompanyCommissionsTable)
    .where(eq(intercompanyCommissionsTable.id, commissionId)).limit(1);
  if (!commission) return res.status(404).json({ error: "Comissão não encontrada." });
  if (!canManageOwnerTenant(req, commission.payerTenantId)) return res.status(403).json({ error: "FORBIDDEN" });

  const parsed = paymentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const total = money(commission.amount);
  const alreadyPaid = money(commission.paidAmount);
  const remaining = Math.max(0, total - alreadyPaid);
  if (parsed.data.amount > remaining + 0.0001) {
    return res.status(422).json({ error: `Pagamento excede o saldo da comissão. Saldo atual: R$ ${remaining.toFixed(2)}.` });
  }

  const [payerTenant] = await db.select({ name: tenantsTable.name }).from(tenantsTable)
    .where(eq(tenantsTable.id, commission.payerTenantId)).limit(1);
  const [beneficiaryTenant] = await db.select({ name: tenantsTable.name }).from(tenantsTable)
    .where(eq(tenantsTable.id, commission.beneficiaryTenantId)).limit(1);

  const paidAt = parsed.data.paidAt ?? new Date();
  const result = await db.transaction(async (tx) => {
    let payerTitleId = commission.payerTitleId;
    let beneficiaryTitleId = commission.beneficiaryTitleId;
    const dueAt = commission.dueAt ?? paidAt;

    if (!payerTitleId) {
      const [title] = await tx.insert(erpTitulosTable).values({
        tenantId: commission.payerTenantId,
        tipo: "pagar",
        categoria: "despesa",
        descricao: `Comissão intercompany • negócio ${commission.dealId}`,
        pessoa: beneficiaryTenant?.name ?? commission.beneficiaryTenantId,
        valorOriginal: String(total.toFixed(2)),
        valorPago: "0",
        vencimento: dueAt,
        status: "pendente",
        origemTipo: "intercompany_commission",
        origemId: commission.id,
        observacoes: "Comissão de representação comercial entre tenants.",
      }).returning();
      payerTitleId = title?.id ?? null;
    }

    if (!beneficiaryTitleId) {
      const [title] = await tx.insert(erpTitulosTable).values({
        tenantId: commission.beneficiaryTenantId,
        tipo: "receber",
        categoria: "receita",
        descricao: `Comissão intercompany • negócio ${commission.dealId}`,
        pessoa: payerTenant?.name ?? commission.payerTenantId,
        valorOriginal: String(total.toFixed(2)),
        valorPago: "0",
        vencimento: dueAt,
        status: "pendente",
        origemTipo: "intercompany_commission",
        origemId: commission.id,
        observacoes: "Comissão recebível de representação comercial entre tenants.",
      }).returning();
      beneficiaryTitleId = title?.id ?? null;
    }

    if (!payerTitleId || !beneficiaryTitleId) throw new Error("Failed to create ERP titles for intercompany commission");

    const [payerPayment] = await tx.insert(erpPagamentosTable).values({
      tenantId: commission.payerTenantId,
      tituloId: payerTitleId,
      valor: String(parsed.data.amount.toFixed(2)),
      forma: parsed.data.paymentMethod ?? null,
      contaBancaria: parsed.data.payerAccount,
      pagoEm: paidAt,
    }).returning();

    const [beneficiaryPayment] = await tx.insert(erpPagamentosTable).values({
      tenantId: commission.beneficiaryTenantId,
      tituloId: beneficiaryTitleId,
      valor: String(parsed.data.amount.toFixed(2)),
      forma: parsed.data.paymentMethod ?? null,
      contaBancaria: parsed.data.beneficiaryAccount,
      pagoEm: paidAt,
    }).returning();

    const newPaid = alreadyPaid + parsed.data.amount;
    const fullyPaid = newPaid >= total - 0.0001;
    const newStatus = fullyPaid ? "paga" : "parcialmente_paga";

    await tx.update(erpTitulosTable).set({
      valorPago: String(newPaid.toFixed(2)),
      status: fullyPaid ? "pago" : "pendente",
      pagoEm: fullyPaid ? paidAt : null,
      contaBancaria: parsed.data.payerAccount,
      updatedAt: new Date(),
    }).where(eq(erpTitulosTable.id, payerTitleId));

    await tx.update(erpTitulosTable).set({
      valorPago: String(newPaid.toFixed(2)),
      status: fullyPaid ? "pago" : "pendente",
      pagoEm: fullyPaid ? paidAt : null,
      contaBancaria: parsed.data.beneficiaryAccount,
      updatedAt: new Date(),
    }).where(eq(erpTitulosTable.id, beneficiaryTitleId));

    const [payment] = await tx.insert(intercompanyCommissionPaymentsTable).values({
      commissionId: commission.id,
      payerTenantId: commission.payerTenantId,
      beneficiaryTenantId: commission.beneficiaryTenantId,
      amount: String(parsed.data.amount.toFixed(2)),
      payerAccount: parsed.data.payerAccount,
      beneficiaryAccount: parsed.data.beneficiaryAccount,
      paymentMethod: parsed.data.paymentMethod ?? null,
      proofUrl: parsed.data.proofUrl ?? null,
      notes: parsed.data.notes ?? null,
      payerPaymentId: payerPayment?.id ?? null,
      beneficiaryPaymentId: beneficiaryPayment?.id ?? null,
      paidByUserId: req.user?.sub ?? null,
      paidAt,
    }).returning();

    const [updatedCommission] = await tx.update(intercompanyCommissionsTable).set({
      paidAmount: String(newPaid.toFixed(2)),
      status: newStatus,
      payerTitleId,
      beneficiaryTitleId,
      updatedAt: new Date(),
    }).where(eq(intercompanyCommissionsTable.id, commission.id)).returning();

    return { commission: updatedCommission, payment, payerTitleId, beneficiaryTitleId };
  });

  return res.status(201).json(result);
});

router.get("/tenants/:tenantId/intercompany-commissions", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!isSuperAdmin(req) && currentTenantId(req) !== tenantId) return res.status(403).json({ error: "FORBIDDEN" });

  const rows = await db.select().from(intercompanyCommissionsTable).where(or(
    eq(intercompanyCommissionsTable.payerTenantId, tenantId),
    eq(intercompanyCommissionsTable.beneficiaryTenantId, tenantId),
  ));
  return res.json(rows);
});

router.get("/tenants/:tenantId/deal-participations", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!isSuperAdmin(req) && currentTenantId(req) !== tenantId) return res.status(403).json({ error: "FORBIDDEN" });

  const rows = await db.select({
    participation: dealTenantParticipationsTable,
    commission: intercompanyCommissionsTable,
  }).from(dealTenantParticipationsTable)
    .leftJoin(intercompanyCommissionsTable, eq(intercompanyCommissionsTable.participationId, dealTenantParticipationsTable.id))
    .where(and(
      eq(dealTenantParticipationsTable.status, "active"),
      or(
        eq(dealTenantParticipationsTable.ownerTenantId, tenantId),
        eq(dealTenantParticipationsTable.partnerTenantId, tenantId),
      ),
    ));

  const enriched = [];
  for (const row of rows) {
    const [partner] = await db.select({ name: tenantsTable.name, tenantCode: tenantsTable.tenantCode })
      .from(tenantsTable).where(eq(tenantsTable.id, row.participation.partnerTenantId)).limit(1);
    const [operator] = row.participation.operationalUserId
      ? await db.select({ name: usersTable.name, email: usersTable.email })
          .from(usersTable).where(eq(usersTable.id, row.participation.operationalUserId)).limit(1)
      : [null];
    enriched.push({
      ...row.participation,
      partnerName: partner?.name ?? null,
      partnerTenantCode: partner?.tenantCode ?? null,
      operationalUserName: operator?.name ?? operator?.email ?? null,
      commission: row.commission ?? null,
    });
  }
  return res.json(enriched);
});

router.get("/commercial-partnerships/:partnershipId/users", async (req, res) => {
  const partnershipId = String(req.params.partnershipId);
  const [partnership] = await db.select().from(tenantCommercialPartnershipsTable)
    .where(eq(tenantCommercialPartnershipsTable.id, partnershipId)).limit(1);
  if (!partnership) return res.status(404).json({ error: "Representação não encontrada." });

  const tenantId = currentTenantId(req);
  if (!isSuperAdmin(req) && tenantId !== partnership.ownerTenantId && tenantId !== partnership.partnerTenantId) {
    return res.status(403).json({ error: "FORBIDDEN" });
  }

  const rows = await db.select({
    id: usersTable.id,
    name: usersTable.name,
    email: usersTable.email,
    active: usersTable.active,
    userFunction: usersTable.userFunction,
  }).from(usersTable).where(and(
    eq(usersTable.tenantId, partnership.partnerTenantId),
    eq(usersTable.active, true),
  ));

  const authorizedIds = partnership.authorizedUserIds ?? [];
  return res.json(authorizedIds.length > 0 ? rows.filter((user) => authorizedIds.includes(user.id)) : rows);
});

router.get("/intercompany-commissions/:commissionId/payments", async (req, res) => {
  const commissionId = String(req.params.commissionId);
  const [commission] = await db.select().from(intercompanyCommissionsTable)
    .where(eq(intercompanyCommissionsTable.id, commissionId)).limit(1);
  if (!commission) return res.status(404).json({ error: "Comissão não encontrada." });

  const tenantId = currentTenantId(req);
  if (!isSuperAdmin(req) && tenantId !== commission.payerTenantId && tenantId !== commission.beneficiaryTenantId) {
    return res.status(403).json({ error: "FORBIDDEN" });
  }

  const payments = await db.select().from(intercompanyCommissionPaymentsTable)
    .where(eq(intercompanyCommissionPaymentsTable.commissionId, commissionId));
  return res.json(payments);
});

export default router;
