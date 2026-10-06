/**
 * Cmd 23 — Job: Recém-abertas
 *
 * Busca semanalmente empresas abertas nos últimos 30 dias para os
 * CNAEs configurados no tenant, cria leads com boost +20 no score.
 */
import { eq, and, sql } from "drizzle-orm";
import type { Logger } from "pino";
import {
  db,
  leadsTable,
  dealsTable,
  activitiesTable,
  prospectorConfigTable,
  tenantsTable,
  funisTable,
} from "@workspace/db";
import { searchByCnae, normalizeCnpj } from "../services/cnpjService.js";
import { enrichLead } from "./leadEnrichment.js";
import { logger as rootLogger } from "../lib/logger.js";
import { leadRegistrationMetadata, normalizeLeadEmail, normalizeLeadName } from "../lib/lead-registration-standard.js";

const BOOST_SCORE = 20;
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

      const [firstFunil] = await db
        .select({ id: funisTable.id })
        .from(funisTable)
        .where(eq(funisTable.tenantId, tenant.id))
        .limit(1);

      if (!firstFunil) continue;

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

          const [lead] = await db.insert(leadsTable).values({
            tenantId: tenant.id,
            nome: normalizeLeadName(empresa.nomeFantasia || empresa.razaoSocial, "Empresa recém-aberta"),
            empresa: empresa.razaoSocial,
            telefone: empresa.telefone,
            documento: cnpjClean,
            endereco: empresa.enderecoCompleto,
            tipoPessoa: "juridica",
            source: "recem_aberta",
            email: normalizeLeadEmail(empresa.email),
            enrichmentStatus: "pending",
            mercadoSegmento: empresa.cnaeDescricao,
            dadosPj: {
              cnpj: cnpjClean,
              razaoSocial: empresa.razaoSocial,
              segmento: empresa.cnaeDescricao,
              socios: empresa.socios.map((s) => ({ nome: s.nome } as any)),
            },
            metadata: leadRegistrationMetadata({
              origem: "recem_aberta",
              prospectado_em: new Date().toISOString(),
              cnae: empresa.cnaeCode,
              data_abertura: empresa.dataAbertura,
              dias_aberto: diasAberto,
              cidade: empresa.municipio,
            }, {
              entryChannel: "prospeccao",
              entrySource: "recem_aberta",
              details: { cnpj: cnpjClean },
            }),
            priorityReason: diasAberto != null
              ? `Empresa aberta há ${diasAberto} dias — montando operação`
              : "Empresa recém-aberta — montando operação",
          }).returning({ id: leadsTable.id });

          if (!lead) continue;

          // Create deal
          await db.insert(dealsTable).values({
            tenantId: tenant.id,
            leadId: lead.id,
            funilId: firstFunil.id,
            titulo: `${empresa.nomeFantasia || empresa.razaoSocial} — Recém-aberta`,
            etapa: "novo",
          });

          // Log activity
          await db.insert(activitiesTable).values({
            tenantId: tenant.id,
            leadId: lead.id,
            tipo: "tarefa",
            titulo: "Lead importado via Recém-abertas",
            descricao: `Lead gerado via Recém-abertas (CNAE ${empresa.cnaeCode} as any) — ${empresa.municipio}`,
            status: "concluida",
          });

          // Enrich with +20 score boost
          enrichLead({
            leadId: lead.id,
            tenantId: tenant.id,
            scoreBoost: BOOST_SCORE,
            boostReason: "empresa_recem_aberta",
          }).catch((err) =>
            log.error({ err, leadId: lead.id }, "recem-abertas: enrichLead failed"),
          );

          totalCreated++;
        }
      }
    } catch (err) {
      log.error({ err, tenantId: tenant.id }, "recem-abertas: tenant scan failed");
    }
  }

  log.info({ totalCreated, tenants: tenants.length, onlyTenantId: onlyTenantId ?? null, dryRun }, "recem-abertas: done");
  return { created: totalCreated, tenants: tenants.length, dryRun };
}
