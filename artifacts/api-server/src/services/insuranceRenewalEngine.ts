import { and, eq, inArray, isNotNull, lte, notInArray } from "drizzle-orm";
import type { Logger } from "pino";
import {
  db,
  leadsTable,
  scoutRegrasTable,
  scoutOportunidadesTable,
  insuranceProductsTable,
  insuranceAccountProductPositionsTable,
  insurancePolicyClaimsTable,
} from "@workspace/db";
import { renewalWindow, scoreInsuranceOpportunity } from "./corporateInsuranceRevenuePack.js";
import { captureLeadFeatureSnapshot } from "../lib/mlFeatureStore.js";

const DAY_MS = 86_400_000;
const FINAL_STATUSES = ["converteu", "ignorado"] as const;
const OPEN_CLAIM_STATUSES = ["aberto", "documentacao_pendente", "analise_seguradora", "recurso"] as const;

async function ensureRenewalRule(tenantId: string): Promise<string> {
  const [existing] = await db
    .select({ id: scoutRegrasTable.id })
    .from(scoutRegrasTable)
    .where(and(
      eq(scoutRegrasTable.tenantId, tenantId),
      eq(scoutRegrasTable.tipo, "renovacao_seguro"),
    ))
    .limit(1);

  if (existing) return existing.id;

  const [created] = await db
    .insert(scoutRegrasTable)
    .values({
      tenantId,
      nome: "Renovação preventiva de apólices",
      tipo: "renovacao_seguro",
      condicoes: { janelasDias: [90, 60, 30, 10], launchAutonomyCap: 3 },
      acao: { canal: "whatsapp", requiresApproval: true, autoSend: false },
      ativo: true,
    } as any)
    .returning({ id: scoutRegrasTable.id });

  if (!created) throw new Error("Não foi possível criar a regra de renovação");
  return created.id;
}

export interface InsuranceRenewalRunResult {
  positionsEvaluated: number;
  opportunitiesCreated: number;
  opportunitiesUpdated: number;
  blocked: number;
  invalidExpiry: number;
}

export async function runInsuranceRenewalForTenant(
  tenantId: string,
  log: Logger,
  now = new Date(),
): Promise<InsuranceRenewalRunResult> {
  const result: InsuranceRenewalRunResult = {
    positionsEvaluated: 0,
    opportunitiesCreated: 0,
    opportunitiesUpdated: 0,
    blocked: 0,
    invalidExpiry: 0,
  };

  const ruleId = await ensureRenewalRule(tenantId);
  const horizon = new Date(now.getTime() + 90 * DAY_MS);

  const positions = await db
    .select({
      id: insuranceAccountProductPositionsTable.id,
      accountId: insuranceAccountProductPositionsTable.accountId,
      productId: insuranceAccountProductPositionsTable.productId,
      effectiveTo: insuranceAccountProductPositionsTable.effectiveTo,
      premium: insuranceAccountProductPositionsTable.premium,
      competitiveRisk: insuranceAccountProductPositionsTable.competitiveRisk,
      renewalRisk: insuranceAccountProductPositionsTable.renewalRisk,
      stage: insuranceAccountProductPositionsTable.stage,
      accountName: leadsTable.nome,
      productName: insuranceProductsTable.name,
    })
    .from(insuranceAccountProductPositionsTable)
    .innerJoin(leadsTable, and(
      eq(leadsTable.id, insuranceAccountProductPositionsTable.accountId),
      eq(leadsTable.tenantId, tenantId),
    ))
    .innerJoin(insuranceProductsTable, and(
      eq(insuranceProductsTable.id, insuranceAccountProductPositionsTable.productId),
      eq(insuranceProductsTable.tenantId, tenantId),
    ))
    .where(and(
      eq(insuranceAccountProductPositionsTable.tenantId, tenantId),
      inArray(insuranceAccountProductPositionsTable.stage, ["ativo", "risco_renovacao"]),
      isNotNull(insuranceAccountProductPositionsTable.effectiveTo),
      lte(insuranceAccountProductPositionsTable.effectiveTo, horizon),
    ));

  for (const position of positions) {
    result.positionsEvaluated += 1;
    if (!position.effectiveTo || Number.isNaN(position.effectiveTo.getTime())) {
      result.invalidExpiry += 1;
      continue;
    }

    const window = renewalWindow(position.effectiveTo, now);
    if (window === "fora_janela") continue;

    const openClaims = await db
      .select({ id: insurancePolicyClaimsTable.id })
      .from(insurancePolicyClaimsTable)
      .where(and(
        eq(insurancePolicyClaimsTable.tenantId, tenantId),
        eq(insurancePolicyClaimsTable.positionId, position.id),
        inArray(insurancePolicyClaimsTable.status, [...OPEN_CLAIM_STATUSES]),
      ))
      .limit(1);

    const score = scoreInsuranceOpportunity({
      expiresAt: position.effectiveTo,
      now,
      claimOpen: openClaims.length > 0,
      competitiveSignal: position.competitiveRisk,
      operationalDelay: position.renewalRisk,
      estimatedRevenue: Number(position.premium ?? 0),
    });

    const type = score.humanRequired ? "risco_nao_renovacao" : "renovacao";
    const explanation = {
      facts: {
        effectiveTo: position.effectiveTo.toISOString(),
        renewalWindow: window,
        openClaim: openClaims.length > 0,
        competitiveRisk: position.competitiveRisk,
        operationalDelay: position.renewalRisk,
      },
      inference: {
        score: score.score,
        priority: score.priority,
        reasons: score.reasons,
      },
      autonomy: {
        cap: 3,
        requiresHumanApproval: true,
        autoSend: false,
      },
    };

    const [existing] = await db
      .select({ id: scoutOportunidadesTable.id, status: scoutOportunidadesTable.status })
      .from(scoutOportunidadesTable)
      .where(and(
        eq(scoutOportunidadesTable.tenantId, tenantId),
        eq(scoutOportunidadesTable.insurancePositionId, position.id),
        notInArray(scoutOportunidadesTable.status, [...FINAL_STATUSES]),
      ))
      .limit(1);

    const values = {
      tipo: type,
      descricao: `${position.productName}: renovação ${window.replace("_", " ")} para ${position.accountName}`,
      valorEstimado: position.premium ?? undefined,
      status: existing?.status === "aprovado" && !score.blocked ? "aprovado" : "pendente_aprovacao",
      scoreOportunidade: String(score.score),
      renewalWindow: window,
      humanRequired: true,
      blocked: score.blocked,
      explanation,
    } as any;

    if (existing) {
      await db.update(scoutOportunidadesTable).set(values).where(eq(scoutOportunidadesTable.id, existing.id));
      result.opportunitiesUpdated += 1;
    } else {
      await db.insert(scoutOportunidadesTable).values({
        tenantId,
        clienteId: position.accountId,
        regraId: ruleId,
        insurancePositionId: position.id,
        ...values,
      });
      captureLeadFeatureSnapshot(tenantId, position.accountId, "scout_oportunidade_criada", { tipoRegra: "renovacao_seguro" }, log).catch(() => {});
      result.opportunitiesCreated += 1;
    }

    if (score.blocked) result.blocked += 1;
    if (score.humanRequired && position.stage !== "risco_renovacao") {
      await db
        .update(insuranceAccountProductPositionsTable)
        .set({ stage: "risco_renovacao", renewalRisk: true, updatedAt: now })
        .where(and(
          eq(insuranceAccountProductPositionsTable.id, position.id),
          eq(insuranceAccountProductPositionsTable.tenantId, tenantId),
        ));
    }
  }

  log.info({ tenantId, ...result }, "insurance-renewal: varredura concluída");
  return result;
}
