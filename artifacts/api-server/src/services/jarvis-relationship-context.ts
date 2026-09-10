import { and, desc, eq, inArray } from "drizzle-orm";
import { db, dealsTable, leadsTable, propostasTable } from "@workspace/db";

const MAX_RELATIONSHIPS = 10;

function compact(value: string | null | undefined, max = 220) {
  if (!value) return "";
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

export type JarvisRelationshipContext = {
  relationships: Array<{
    leadId: string;
    leadName: string;
    company: string | null;
    leadStatus: string;
    nextAction: string | null;
    dealId: string | null;
    dealTitle: string | null;
    dealStage: string | null;
    probability: number | null;
    proposalId: string | null;
    proposalTitle: string | null;
    proposalStatus: string | null;
    proposalValidUntil: Date | null;
  }>;
  coverage: {
    leads: number;
    withDeal: number;
    withProposal: number;
    withNextAction: number;
  };
};

/**
 * Builds a tenant-scoped relationship graph from the CRM's canonical tables.
 * Read-only and intentionally bounded: three batched queries per context load.
 */
export async function loadJarvisRelationshipContext(tenantId: string): Promise<JarvisRelationshipContext> {
  const leads = await db
    .select({
      id: leadsTable.id,
      nome: leadsTable.nome,
      empresa: leadsTable.empresa,
      status: leadsTable.status,
      proximaAcao: leadsTable.proximaAcao,
      updatedAt: leadsTable.updatedAt,
    })
    .from(leadsTable)
    .where(and(eq(leadsTable.tenantId, tenantId), eq(leadsTable.pipelineExempt, false)))
    .orderBy(desc(leadsTable.updatedAt))
    .limit(MAX_RELATIONSHIPS);

  if (!leads.length) {
    return { relationships: [], coverage: { leads: 0, withDeal: 0, withProposal: 0, withNextAction: 0 } };
  }

  const leadIds = leads.map((lead) => lead.id);
  const [deals, proposals] = await Promise.all([
    db
      .select({
        id: dealsTable.id,
        leadId: dealsTable.leadId,
        titulo: dealsTable.titulo,
        etapa: dealsTable.etapa,
        probabilidade: dealsTable.probabilidade,
        updatedAt: dealsTable.updatedAt,
      })
      .from(dealsTable)
      .where(and(eq(dealsTable.tenantId, tenantId), inArray(dealsTable.leadId, leadIds)))
      .orderBy(desc(dealsTable.updatedAt)),
    db
      .select({
        id: propostasTable.id,
        leadId: propostasTable.leadId,
        titulo: propostasTable.titulo,
        status: propostasTable.status,
        validadeAte: propostasTable.validadeAte,
        updatedAt: propostasTable.updatedAt,
      })
      .from(propostasTable)
      .where(and(eq(propostasTable.tenantId, tenantId), inArray(propostasTable.leadId, leadIds)))
      .orderBy(desc(propostasTable.updatedAt)),
  ]);

  const latestDealByLead = new Map<string, (typeof deals)[number]>();
  for (const deal of deals) {
    if (deal.leadId && !latestDealByLead.has(deal.leadId)) latestDealByLead.set(deal.leadId, deal);
  }

  const latestProposalByLead = new Map<string, (typeof proposals)[number]>();
  for (const proposal of proposals) {
    if (!latestProposalByLead.has(proposal.leadId)) latestProposalByLead.set(proposal.leadId, proposal);
  }

  const rows = leads.map((lead) => {
    const deal = latestDealByLead.get(lead.id) ?? null;
    const proposal = latestProposalByLead.get(lead.id) ?? null;
    return {
      leadId: lead.id,
      leadName: compact(lead.nome, 120),
      company: lead.empresa ? compact(lead.empresa, 120) : null,
      leadStatus: lead.status,
      nextAction: lead.proximaAcao ? compact(lead.proximaAcao, 220) : null,
      dealId: deal?.id ?? null,
      dealTitle: deal?.titulo ? compact(deal.titulo, 160) : null,
      dealStage: deal?.etapa ?? null,
      probability: deal?.probabilidade ?? null,
      proposalId: proposal?.id ?? null,
      proposalTitle: proposal?.titulo ? compact(proposal.titulo, 160) : null,
      proposalStatus: proposal?.status ?? null,
      proposalValidUntil: proposal?.validadeAte ?? null,
    };
  });

  return {
    relationships: rows,
    coverage: {
      leads: rows.length,
      withDeal: rows.filter((row) => Boolean(row.dealId)).length,
      withProposal: rows.filter((row) => Boolean(row.proposalId)).length,
      withNextAction: rows.filter((row) => Boolean(row.nextAction)).length,
    },
  };
}

export function formatJarvisRelationshipContext(context: JarvisRelationshipContext): string {
  if (!context.relationships.length) return "";
  const lines = [
    "### Mapa de relações CRM — clientes, negócios e propostas",
    `Cobertura desta leitura: leads=${context.coverage.leads} | com_negócio=${context.coverage.withDeal} | com_proposta=${context.coverage.withProposal} | com_próxima_ação=${context.coverage.withNextAction}`,
  ];

  for (const item of context.relationships) {
    const metadata = [
      `lead=${item.leadId}`,
      `nome=${item.leadName}`,
      item.company ? `empresa=${item.company}` : null,
      `status_lead=${item.leadStatus}`,
      item.dealId ? `deal=${item.dealId}` : null,
      item.dealTitle ? `negócio=${item.dealTitle}` : null,
      item.dealStage ? `etapa=${item.dealStage}` : null,
      item.probability == null ? null : `probabilidade=${item.probability}%`,
      item.proposalId ? `proposta=${item.proposalId}` : null,
      item.proposalTitle ? `título_proposta=${item.proposalTitle}` : null,
      item.proposalStatus ? `status_proposta=${item.proposalStatus}` : null,
      item.proposalValidUntil ? `validade_proposta=${item.proposalValidUntil.toISOString()}` : null,
    ].filter(Boolean).join(" | ");
    lines.push(`- ${metadata}`);
    if (item.nextAction) lines.push(`  Próxima ação registrada: ${item.nextAction}`);
  }

  lines.push("Use este mapa para conectar cliente → negócio → proposta e evitar respostas isoladas por módulo. Ausência de vínculo é uma lacuna de cobertura, não prova de que o relacionamento não exista fora dos dados persistidos.");
  return lines.join("\n");
}
