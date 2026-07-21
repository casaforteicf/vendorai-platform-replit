import { and, eq, inArray } from "drizzle-orm";
import type { Logger } from "pino";
import {
  db,
  scoutRegrasTable,
  scoutOportunidadesTable,
  insuranceAccountProfilesTable,
  insuranceProductsTable,
  insuranceAccountProductPositionsTable,
} from "@workspace/db";

export const DEFAULT_INSURANCE_PRODUCTS = [
  { code: "frota", name: "Seguro Frota" },
  { code: "vida_grupo", name: "Seguro Vida em Grupo" },
  { code: "saude_odonto", name: "Seguro Saúde/Odonto Corporativo", healthSensitive: true },
  { code: "patrimonial", name: "Seguro Patrimonial" },
  { code: "rc_geral", name: "Responsabilidade Civil Geral" },
  { code: "do", name: "D&O" },
  { code: "cyber", name: "Seguro Cyber" },
  { code: "transporte_carga", name: "Seguro Transporte/Carga" },
  { code: "engenharia_obra", name: "Seguro de Engenharia/Obra" },
  { code: "garantia", name: "Seguro Garantia" },
  { code: "previdencia_beneficios", name: "Previdência e Benefícios" },
] as const;

export interface InsuranceProfileInput {
  setor?: string | null;
  porte?: string | null;
  headcount?: number | null;
  fleetSize?: number | null;
  declaredAssets?: number | null;
  highRisk?: boolean | null;
}

export function expectedInsuranceProductCodes(profile: InsuranceProfileInput): string[] {
  const sector = (profile.setor ?? "").toLocaleLowerCase("pt-BR");
  const expected = new Set<string>(["rc_geral", "cyber"]);

  if ((profile.headcount ?? 0) > 0) expected.add("vida_grupo");
  if ((profile.headcount ?? 0) >= 20) expected.add("saude_odonto");
  if ((profile.fleetSize ?? 0) > 0) expected.add("frota");
  if ((profile.declaredAssets ?? 0) > 0) expected.add("patrimonial");
  if (profile.porte === "grande") {
    expected.add("do");
    expected.add("previdencia_beneficios");
  }
  if (profile.highRisk) expected.add("patrimonial");
  if (/transport|logistic|carga/.test(sector)) {
    expected.add("frota");
    expected.add("transporte_carga");
  }
  if (/constr|incorpor|engenhar|obra/.test(sector)) {
    expected.add("engenharia_obra");
    expected.add("garantia");
    expected.add("frota");
  }
  if (/tecnolog|software|digital|e-commerce|finance/.test(sector)) expected.add("cyber");

  return [...expected];
}

async function seedProducts(tenantId: string) {
  for (const product of DEFAULT_INSURANCE_PRODUCTS) {
    await db
      .insert(insuranceProductsTable)
      .values({
        tenantId,
        code: product.code,
        name: product.name,
        healthSensitive: "healthSensitive" in product ? product.healthSensitive : false,
        targetProfile: {},
        correlatedProductCodes: [],
      } as any)
      .onConflictDoNothing();
  }
}

async function ensureWhitespaceRule(tenantId: string): Promise<string> {
  const [existing] = await db
    .select({ id: scoutRegrasTable.id })
    .from(scoutRegrasTable)
    .where(and(eq(scoutRegrasTable.tenantId, tenantId), eq(scoutRegrasTable.tipo, "whitespace_seguro")))
    .limit(1);
  if (existing) return existing.id;

  const [created] = await db
    .insert(scoutRegrasTable)
    .values({
      tenantId,
      nome: "Whitespace por perfil corporativo",
      tipo: "whitespace_seguro",
      condicoes: { source: "insurance_profile_template" },
      acao: { requiresApproval: true, autoSend: false },
      ativo: true,
    } as any)
    .returning({ id: scoutRegrasTable.id });
  if (!created) throw new Error("Não foi possível criar regra de whitespace");
  return created.id;
}

export async function runInsuranceWhitespaceForTenant(tenantId: string, log: Logger) {
  await seedProducts(tenantId);
  const ruleId = await ensureWhitespaceRule(tenantId);
  const profiles = await db
    .select()
    .from(insuranceAccountProfilesTable)
    .where(eq(insuranceAccountProfilesTable.tenantId, tenantId));

  let gapsCreated = 0;
  let opportunitiesCreated = 0;

  for (const profile of profiles) {
    const expectedCodes = expectedInsuranceProductCodes({
      setor: profile.setor,
      porte: profile.porte,
      headcount: profile.headcount,
      fleetSize: profile.quantidadeFrota,
      declaredAssets: Number(profile.patrimonioDeclarado ?? 0),
      highRisk: profile.operacaoRiscoElevado,
    });
    if (expectedCodes.length === 0) continue;

    const expectedProducts = await db
      .select({ id: insuranceProductsTable.id, code: insuranceProductsTable.code, name: insuranceProductsTable.name })
      .from(insuranceProductsTable)
      .where(and(
        eq(insuranceProductsTable.tenantId, tenantId),
        inArray(insuranceProductsTable.code, expectedCodes),
        eq(insuranceProductsTable.active, true),
      ));

    const current = await db
      .select({ productId: insuranceAccountProductPositionsTable.productId })
      .from(insuranceAccountProductPositionsTable)
      .where(and(
        eq(insuranceAccountProductPositionsTable.tenantId, tenantId),
        eq(insuranceAccountProductPositionsTable.accountId, profile.accountId),
      ));
    const currentIds = new Set(current.map((item) => item.productId));

    for (const product of expectedProducts) {
      if (currentIds.has(product.id)) continue;

      const [position] = await db
        .insert(insuranceAccountProductPositionsTable)
        .values({
          tenantId,
          accountId: profile.accountId,
          productId: product.id,
          stage: "whitespace",
          profileFitScore: "70",
          source: "profile_template",
        } as any)
        .onConflictDoNothing()
        .returning({ id: insuranceAccountProductPositionsTable.id });
      if (!position) continue;
      gapsCreated += 1;

      await db.insert(scoutOportunidadesTable).values({
        tenantId,
        clienteId: profile.accountId,
        regraId: ruleId,
        insurancePositionId: position.id,
        tipo: "whitespace",
        descricao: `Gap de cobertura identificado: ${product.name}`,
        status: "pendente_aprovacao",
        scoreOportunidade: "70",
        humanRequired: true,
        blocked: false,
        explanation: {
          facts: {
            setor: profile.setor,
            porte: profile.porte,
            headcount: profile.headcount,
            fleetSize: profile.quantidadeFrota,
            declaredAssets: profile.patrimonioDeclarado,
          },
          inference: {
            productCode: product.code,
            source: "profile_template",
            confidence: "media",
          },
          autonomy: { cap: 3, requiresHumanApproval: true, autoSend: false },
        },
      } as any);
      opportunitiesCreated += 1;
    }
  }

  const result = { profilesEvaluated: profiles.length, gapsCreated, opportunitiesCreated };
  log.info({ tenantId, ...result }, "insurance-whitespace: varredura concluída");
  return result;
}
