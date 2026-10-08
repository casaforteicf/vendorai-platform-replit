import { and, eq, or, sql } from "drizzle-orm";
import {
  crmCompaniesMasterTable,
  crmTenantCompaniesTable,
  db,
  prospectsTable,
  type ProspectQualification,
} from "@workspace/db";
import { decideProspectNextAction } from "./prospect-decision-engine.js";
import { enforceTenantSolutionPolicy, resolveColdProspectingConfig } from "./cold-prospecting-config.js";

function digits(value?: string | null) {
  return String(value ?? "").replace(/\D/g, "");
}

function domain(value?: string | null): string | null {
  if (!value) return null;
  try {
    const raw = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

export type ColdProspectIntakeInput = {
  tenantId: string;
  source: string;
  sourceRef: string;
  displayName: string;
  cnpj?: string | null;
  razaoSocial?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  address?: string | null;
  segment?: string | null;
  city?: string | null;
  vendoraiFitScore?: number | null;
  arqdorFitScore?: number | null;
  fitScore?: number | null;
  qualification?: ProspectQualification;
  opportunitySummary?: string | null;
  assignedUserId?: string | null;
  nextActionAt?: Date | null;
};

async function resolveOrCreateCompany(input: ColdProspectIntakeInput): Promise<string | null> {
  const cnpj = digits(input.cnpj);
  if (cnpj.length === 14) {
    const [company] = await db.insert(crmCompaniesMasterTable).values({
      cnpj,
      razaoSocial: input.razaoSocial ?? input.displayName,
      nomeFantasia: input.displayName,
      telefone: input.phone ?? null,
      email: input.email ?? null,
      website: input.website ?? null,
      endereco: input.address ? { logradouro: input.address } : undefined,
      source: input.source,
      enrichmentData: { sourceRef: input.sourceRef },
      enrichedAt: new Date(),
    }).onConflictDoUpdate({
      target: crmCompaniesMasterTable.cnpj,
      set: {
        razaoSocial: input.razaoSocial ?? input.displayName,
        nomeFantasia: input.displayName,
        telefone: input.phone ?? null,
        email: input.email ?? null,
        website: input.website ?? null,
        updatedAt: new Date(),
      },
    }).returning({ id: crmCompaniesMasterTable.id });

    if (!company) return null;
    await db.insert(crmTenantCompaniesTable).values({
      tenantId: input.tenantId,
      companyId: company.id,
      relationshipType: "prospect",
      status: "ativo",
      metadata: { source: input.source, sourceRef: input.sourceRef },
    }).onConflictDoUpdate({
      target: [crmTenantCompaniesTable.tenantId, crmTenantCompaniesTable.companyId],
      set: { status: "ativo", updatedAt: new Date() },
    });
    return company.id;
  }

  const phone = digits(input.phone);
  const host = domain(input.website);
  const matchers: any[] = [];
  if (phone) {
    matchers.push(sql`regexp_replace(coalesce(${crmCompaniesMasterTable.telefone}, ''), '[^0-9]', '', 'g') = ${phone}`);
  }
  if (host) {
    matchers.push(sql`lower(regexp_replace(regexp_replace(coalesce(${crmCompaniesMasterTable.website}, ''), '^https?://', ''), '^www\\.', '')) LIKE ${host + '%'}`);
  }
  if (!matchers.length) return null;

  const [company] = await db.select({ id: crmCompaniesMasterTable.id })
    .from(crmCompaniesMasterTable)
    .where(matchers.length === 1 ? matchers[0] : or(...matchers))
    .limit(1);
  if (!company) return null;

  await db.insert(crmTenantCompaniesTable).values({
    tenantId: input.tenantId,
    companyId: company.id,
    relationshipType: "prospect",
    status: "ativo",
    metadata: { source: input.source, sourceRef: input.sourceRef },
  }).onConflictDoUpdate({
    target: [crmTenantCompaniesTable.tenantId, crmTenantCompaniesTable.companyId],
    set: { status: "ativo", updatedAt: new Date() },
  });
  return company.id;
}

export async function intakeColdProspect(input: ColdProspectIntakeInput) {
  const companyId = await resolveOrCreateCompany(input);
  const [existing] = await db.select().from(prospectsTable).where(and(
    eq(prospectsTable.tenantId, input.tenantId),
    or(
      and(eq(prospectsTable.source, input.source), eq(prospectsTable.sourceRef, input.sourceRef)),
      companyId ? eq(prospectsTable.companyId, companyId) : sql`FALSE`,
    ),
  )).limit(1);

  const runtime = await resolveColdProspectingConfig(input.tenantId);
  const qualification = input.qualification ?? {};
  const vendoraiFitScore = input.vendoraiFitScore ?? 60;
  const arqdorFitScore = runtime.allowedSolutions.includes("arqdor") ? (input.arqdorFitScore ?? 0) : 0;
  const decision = enforceTenantSolutionPolicy(decideProspectNextAction({
    stage: existing?.stage ?? "analisado",
    vendoraiFitScore,
    arqdorFitScore,
    qualification,
    opportunitySummary: input.opportunitySummary ?? null,
  }), runtime);

  const values = {
    companyId,
    displayName: input.displayName,
    phone: input.phone ?? null,
    email: input.email ?? null,
    website: input.website ?? null,
    address: input.address ?? null,
    segment: input.segment ?? null,
    city: input.city ?? null,
    fitScore: input.fitScore ?? Math.max(vendoraiFitScore, arqdorFitScore),
    vendoraiFitScore,
    arqdorFitScore,
    recommendedSolution: decision.recommendedSolution,
    primaryHook: decision.primaryHook,
    stage: decision.stage,
    currentState: decision.currentState,
    currentObjective: decision.currentObjective,
    nextBestAction: decision.nextBestAction,
    nextBestActionReason: decision.nextBestActionReason,
    qualification,
    opportunitySummary: input.opportunitySummary ?? null,
    assignedUserId: input.assignedUserId ?? null,
    nextActionAt: input.nextActionAt ?? new Date(),
    updatedAt: new Date(),
  };

  if (existing) {
    const [updated] = await db.update(prospectsTable).set(values)
      .where(eq(prospectsTable.id, existing.id)).returning();
    return { prospect: updated!, created: false, companyId };
  }

  const [created] = await db.insert(prospectsTable).values({
    tenantId: input.tenantId,
    source: input.source,
    sourceRef: input.sourceRef,
    ...values,
  }).returning();
  if (!created) throw new Error("prospect_intake_failed");
  return { prospect: created, created: true, companyId };
}
