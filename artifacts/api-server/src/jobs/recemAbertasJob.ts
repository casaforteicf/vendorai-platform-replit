/**
 * Cmd 23 — Job: Recém-abertas
 *
 * Busca semanalmente empresas abertas nos últimos 30 dias para os
 * CNAEs configurados no tenant e cria Prospects pré-Lead para qualificação.
 */
import { eq, and, sql } from "drizzle-orm";
import type { Logger } from "pino";
import {
  db,
  leadsTable,
  prospectorConfigTable,
  tenantsTable,
} from "@workspace/db";
import { searchByCnae, normalizeCnpj } from "../services/cnpjService.js";
import { logger as rootLogger } from "../lib/logger.js";
import { normalizeLeadEmail } from "../lib/lead-registration-standard.js";
import { intakeColdProspect } from "../services/cold-prospect-intake.js";

const DEFAULT_CNAES = [
  "4120-4/00", // Construção
  "5611-2/01", // Restaurantes
  "9602-5/01", // Cabeleireiros
  "8630-5/01", // Médicos
  "8630-5/02", // Odontólogos
  "4711-3/01", // Supermercados
  "6821-8/01", // Imobiliárias
  "4771-7/01", // Farmácias
];

export async function runRecemAbertas(log: Logger = rootLogger, onlyTenantId?: string, dryRun = false): Promise<{ created: number; tenants: number; dryRun: boolean }> {
  log.info("recem-abertas: starting weekly new-companies scan");

  const tenants = await db
    .select({ id: tenantsTable.id })
    .from(tenantsTable)
    .where(onlyTenantId
      ? and(eq(tenantsTable.status, "active"), eq(tenantsTable.id, onlyTenantId))
      : eq(tenantsTable.status, "active"));

  let totalCreated = 0;

  for (const tenant of tenants) {
    try {
      // Get tenant prospector config
      const [config] = await db
        .select()
        .from(prospectorConfigTable)
        .where(and(
          eq(prospectorConfigTable.tenantId, tenant.id),
          eq(prospectorConfigTable.ativo, true),
        ));

      if (!config) continue;

      // Determine which CNAEs to scan
      const cnaeAlvo: string[] = (config as unknown as { cnaeAlvo?: string[] }).cnaeAlvo?.length
        ? (config as unknown as { cnaeAlvo: string[] }).cnaeAlvo
        : DEFAULT_CNAES;

      // Get the city from config
      const cidade = config.cidade ?? "";
      const uf = "";

      for (const cnae of cnaeAlvo.slice(0, 5)) {
        const result = await searchByCnae({
          cnae,
          municipio: cidade || undefined,
          uf: uf || undefined,
          aberturaDias: 30,
          limit: 10,
        });

        if (result.apiKeyRequired) {
          log.info({ tenantId: tenant.id }, "recem-abertas: CNPJ_API_KEY not set, skipping");
          break;
        }

        for (const empresa of result.empresas) {
          if (!empresa.telefone && !empresa.email) continue;
          if (empresa.situacao.toUpperCase() !== "ATIVA") continue;

          // Deduplicate by CNPJ or phone
          const cnpjClean = normalizeCnpj(empresa.cnpj);
          const [existing] = await db
            .select({ id: leadsTable.id })
            .from(leadsTable)
            .where(and(
              eq(leadsTable.tenantId, tenant.id),
              sql`(
                (${leadsTable.documento} = ${cnpjClean} AND ${leadsTable.documento} IS NOT NULL)
                OR
                (${leadsTable.telefone} = ${empresa.telefone} AND ${leadsTable.telefone} IS NOT NULL)
              )`,
            ))
            .limit(1);

          if (existing) continue;

          if (dryRun) {
            totalCreated++;
            continue;
          }

          // Calculate how many days since opening
          const abertura = empresa.dataAbertura ? new Date(empresa.dataAbertura) : null;
          const diasAberto = abertura
            ? Math.floor((Date.now() - abertura.getTime()) / 86_400_000)
            : null;

          const result = await intakeColdProspect({
            tenantId: tenant.id,
            source: "recem_aberta",
            sourceRef: `recem_aberta:${cnpjClean}`,
            displayName: empresa.nomeFantasia || empresa.razaoSocial,
            cnpj: cnpjClean,
            razaoSocial: empresa.razaoSocial,
            phone: empresa.telefone,
            email: normalizeLeadEmail(empresa.email),
            address: empresa.enderecoCompleto,
            segment: empresa.cnaeDescricao,
            city: empresa.municipio,
            fitScore: 78,
            vendoraiFitScore: 75,
            arqdorFitScore: /(constru|arquitet|engenhar|esquadr|material|imobili)/i.test(empresa.cnaeDescricao ?? "") ? 72 : 15,
            qualification: {
              facts: [
                { key: "cnpj", value: cnpjClean, confidence: 100, source: "recem_aberta", confirmed: true, observedAt: new Date().toISOString() },
                ...(empresa.dataAbertura ? [{ key: "data_abertura", value: empresa.dataAbertura, confidence: 100, source: "recem_aberta", confirmed: true, observedAt: new Date().toISOString() }] : []),
                ...(empresa.socios[0]?.nome ? [{ key: "qsa_contact", value: empresa.socios[0].nome, confidence: 100, source: "recem_aberta", confirmed: true, observedAt: new Date().toISOString() }] : []),
              ],
            },
            opportunitySummary: diasAberto != null
              ? `Empresa aberta há ${diasAberto} dias; validar estrutura comercial e operação em formação.`
              : "Empresa recém-aberta; validar estrutura comercial e operação em formação.",
          });

          if (result.created) totalCreated++;
        }
      }
    } catch (err) {
      log.error({ err, tenantId: tenant.id }, "recem-abertas: tenant scan failed");
    }
  }

  log.info({ totalCreated, tenants: tenants.length, onlyTenantId: onlyTenantId ?? null, dryRun }, "recem-abertas: done");
  return { created: totalCreated, tenants: tenants.length, dryRun };
}
