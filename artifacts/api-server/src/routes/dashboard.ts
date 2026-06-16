import { Router, IRouter } from "express";
import {
  db,
  leadsTable,
  dealsTable,
  activitiesTable,
  customerIntelligenceTable,
  propostasTable,
  businessProfilesTable,
} from "@workspace/db";
import {
  eq,
  and,
  notInArray,
  inArray,
  isNotNull,
  lt,
  count,
  sum,
  avg,
  sql,
  desc,
  gte,
} from "drizzle-orm";

const router: IRouter = Router();

type LeadsSummaryRow = { total: number; novosUltimos30Dias: number };
type DealsByStageRow = { etapa: string; total: number };
type OpenDealsValueRow = { totalValor: string | null };
type OverdueActivitiesRow = { total: number };
type ChurnDistRow = { baixo: number; medio: number; alto: number };
type Top5ChurnRow = {
  leadId: string;
  churnRisk: number | null;
  nome: string | null;
  email: string | null;
  telefone: string | null;
};
type GanhosMesRow = { count: number; somaValor: string | null };
type TicketMedioRow = { ticketMedio: string | null };
type PropostasAtivasRow = { count: number; somaValor: string | null };
type DealsByTipoRow = { tipoFechamento: string | null; total: number };
type TopOportunidadeRow = {
  dealId: string;
  titulo: string;
  valor: string | null;
  probabilidade: number | null;
  etapa: string;
  leadId: string | null;
  leadNome: string | null;
};
type FaixaEtariaRow = {
  naoInformado: number;
  ate25: number;
  de26a35: number;
  de36a45: number;
  de46a55: number;
  acima55: number;
};
type DiaSemanaRow = { dow: number; total: number };
type NegocioPerfilRow = {
  razaoSocial: string;
  nomeFantasia: string | null;
  endereco: string | null;
  telefone: string | null;
  email: string | null;
  publicoAlvo: string | null;
  vertical: string | null;
  canaisVenda: string[] | null;
  diferenciais: string | null;
  concorrentes: string[] | null;
  produtos: Array<{ nome: string; descricao?: string; preco?: number }> | null;
};

router.get("/tenants/:tenantId/dashboard", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    leadsRows,
    dealsByStageRows,
    openDealsValueRows,
    overdueActivitiesRows,
    churnDistRows,
    top5ChurnRows,
    ganhosMesRows,
    ticketMedioRows,
    propostasAtivasRows,
    dealsByTipoRows,
    topOportunidadesRows,
    faixaEtariaRows,
    diasSemanaRows,
    negocioPerfilRows,
  ] = (await Promise.all([
    // 1. Leads: total + novos nos últimos 30 dias
    db
      .select({
        total: count(),
        novosUltimos30Dias: sql<number>`count(*) filter (where ${leadsTable.createdAt} >= ${thirtyDaysAgo})`.mapWith(Number),
      })
      .from(leadsTable)
      .where(eq(leadsTable.tenantId, tenantId)),

    // 2. Deals por etapa
    db
      .select({
        etapa: sql<string>`${dealsTable.etapa}`,
        total: count(),
      })
      .from(dealsTable)
      .where(eq(dealsTable.tenantId, tenantId))
      .groupBy(dealsTable.etapa),

    // 3. Valor total em negociação (deals abertos)
    db
      .select({ totalValor: sum(dealsTable.valor) })
      .from(dealsTable)
      .where(
        and(
          eq(dealsTable.tenantId, tenantId),
          notInArray(dealsTable.etapa, ["ganho", "perdido"]),
        ),
      ),

    // 4. Atividades atrasadas: status=pendente + dataVencimento < now
    db
      .select({ total: count() })
      .from(activitiesTable)
      .where(
        and(
          eq(activitiesTable.tenantId, tenantId),
          eq(activitiesTable.status, "pendente"),
          isNotNull(activitiesTable.dataVencimento),
          lt(activitiesTable.dataVencimento, now),
        ),
      ),

    // 5. Distribuição churnRisk
    db
      .select({
        baixo: sql<number>`count(*) filter (where ${customerIntelligenceTable.churnRisk} < 30)`.mapWith(Number),
        medio: sql<number>`count(*) filter (where ${customerIntelligenceTable.churnRisk} >= 30 and ${customerIntelligenceTable.churnRisk} <= 70)`.mapWith(Number),
        alto: sql<number>`count(*) filter (where ${customerIntelligenceTable.churnRisk} > 70)`.mapWith(Number),
      })
      .from(customerIntelligenceTable)
      .where(
        and(
          eq(customerIntelligenceTable.tenantId, tenantId),
          isNotNull(customerIntelligenceTable.churnRisk),
        ),
      ),

    // 6. Top 5 leads por churnRisk
    db
      .select({
        leadId: customerIntelligenceTable.leadId,
        churnRisk: customerIntelligenceTable.churnRisk,
        nome: leadsTable.nome,
        email: leadsTable.email,
        telefone: leadsTable.telefone,
      })
      .from(customerIntelligenceTable)
      .innerJoin(leadsTable, eq(customerIntelligenceTable.leadId, leadsTable.id))
      .where(
        and(
          eq(customerIntelligenceTable.tenantId, tenantId),
          isNotNull(customerIntelligenceTable.churnRisk),
        ),
      )
      .orderBy(desc(customerIntelligenceTable.churnRisk))
      .limit(5),

    // 7. Deals ganhos este mês
    db
      .select({
        count: sql<number>`count(*)`.mapWith(Number),
        somaValor: sum(dealsTable.valor),
      })
      .from(dealsTable)
      .where(
        and(
          eq(dealsTable.tenantId, tenantId),
          eq(dealsTable.etapa, "ganho"),
          gte(dealsTable.updatedAt, startOfMonth),
        ),
      ),

    // 8. Ticket médio
    db
      .select({
        ticketMedio: sql<string | null>`avg(${dealsTable.valor})::text`,
      })
      .from(dealsTable)
      .where(
        and(
          eq(dealsTable.tenantId, tenantId),
          eq(dealsTable.etapa, "ganho"),
          isNotNull(dealsTable.valor),
        ),
      ),

    // 9. Propostas ativas (rascunho + enviada)
    db
      .select({
        count: sql<number>`count(*)`.mapWith(Number),
        somaValor: sum(propostasTable.valorTotal),
      })
      .from(propostasTable)
      .where(
        and(
          eq(propostasTable.tenantId, tenantId),
          inArray(propostasTable.status, ["rascunho", "enviada"]),
        ),
      ),

    // 10. Deals por tipo de fechamento
    db
      .select({
        tipoFechamento: sql<string | null>`${dealsTable.tipoFechamento}`,
        total: count(),
      })
      .from(dealsTable)
      .where(eq(dealsTable.tenantId, tenantId))
      .groupBy(dealsTable.tipoFechamento),

    // 11. Top 8 oportunidades (não ganho/perdido) ordenadas por probabilidade
    db
      .select({
        dealId: dealsTable.id,
        titulo: dealsTable.titulo,
        valor: dealsTable.valor,
        probabilidade: dealsTable.probabilidade,
        etapa: sql<string>`${dealsTable.etapa}`,
        leadId: dealsTable.leadId,
        leadNome: leadsTable.nome,
      })
      .from(dealsTable)
      .leftJoin(leadsTable, eq(dealsTable.leadId, leadsTable.id))
      .where(
        and(
          eq(dealsTable.tenantId, tenantId),
          notInArray(dealsTable.etapa, ["ganho", "perdido"]),
          isNotNull(dealsTable.probabilidade),
        ),
      )
      .orderBy(desc(dealsTable.probabilidade))
      .limit(8),

    // 12. Faixa etária dos leads (via dataNascimento em formato YYYY-MM-DD)
    db
      .select({
        naoInformado: sql<number>`count(*) filter (where ${leadsTable.dataNascimento} is null or ${leadsTable.dataNascimento} = '')`.mapWith(Number),
        ate25: sql<number>`count(*) filter (where ${leadsTable.dataNascimento} ~ '^\\d{4}-\\d{2}-\\d{2}$' and extract(year from age(now(), to_date(${leadsTable.dataNascimento}, 'YYYY-MM-DD'))) <= 25)`.mapWith(Number),
        de26a35: sql<number>`count(*) filter (where ${leadsTable.dataNascimento} ~ '^\\d{4}-\\d{2}-\\d{2}$' and extract(year from age(now(), to_date(${leadsTable.dataNascimento}, 'YYYY-MM-DD'))) between 26 and 35)`.mapWith(Number),
        de36a45: sql<number>`count(*) filter (where ${leadsTable.dataNascimento} ~ '^\\d{4}-\\d{2}-\\d{2}$' and extract(year from age(now(), to_date(${leadsTable.dataNascimento}, 'YYYY-MM-DD'))) between 36 and 45)`.mapWith(Number),
        de46a55: sql<number>`count(*) filter (where ${leadsTable.dataNascimento} ~ '^\\d{4}-\\d{2}-\\d{2}$' and extract(year from age(now(), to_date(${leadsTable.dataNascimento}, 'YYYY-MM-DD'))) between 46 and 55)`.mapWith(Number),
        acima55: sql<number>`count(*) filter (where ${leadsTable.dataNascimento} ~ '^\\d{4}-\\d{2}-\\d{2}$' and extract(year from age(now(), to_date(${leadsTable.dataNascimento}, 'YYYY-MM-DD'))) > 55)`.mapWith(Number),
      })
      .from(leadsTable)
      .where(eq(leadsTable.tenantId, tenantId)),

    // 13. Dias da semana com mais fechamentos (últimos 6 meses)
    db
      .select({
        dow: sql<number>`extract(dow from ${dealsTable.updatedAt})::integer`,
        total: sql<number>`count(*)::integer`.mapWith(Number),
      })
      .from(dealsTable)
      .where(
        and(
          eq(dealsTable.tenantId, tenantId),
          eq(dealsTable.etapa, "ganho"),
          gte(dealsTable.updatedAt, sixMonthsAgo),
        ),
      )
      .groupBy(sql`extract(dow from ${dealsTable.updatedAt})`),

    // 14. Perfil completo do negócio
    db
      .select({
        razaoSocial: businessProfilesTable.razaoSocial,
        nomeFantasia: businessProfilesTable.nomeFantasia,
        endereco: businessProfilesTable.endereco,
        telefone: businessProfilesTable.telefone,
        email: businessProfilesTable.email,
        publicoAlvo: businessProfilesTable.publicoAlvo,
        vertical: businessProfilesTable.vertical,
        canaisVenda: businessProfilesTable.canaisVenda,
        diferenciais: businessProfilesTable.diferenciais,
        concorrentes: businessProfilesTable.concorrentes,
        produtos: businessProfilesTable.produtos,
      })
      .from(businessProfilesTable)
      .where(eq(businessProfilesTable.tenantId, tenantId))
      .limit(1),
  ])) as [
    LeadsSummaryRow[],
    DealsByStageRow[],
    OpenDealsValueRow[],
    OverdueActivitiesRow[],
    ChurnDistRow[],
    Top5ChurnRow[],
    GanhosMesRow[],
    TicketMedioRow[],
    PropostasAtivasRow[],
    DealsByTipoRow[],
    TopOportunidadeRow[],
    FaixaEtariaRow[],
    DiaSemanaRow[],
    NegocioPerfilRow[],
  ];

  const ganhoCount = Number(dealsByStageRows.find((r) => r.etapa === "ganho")?.total ?? 0);
  const totalDeals = dealsByStageRows.reduce((acc, r) => acc + Number(r.total), 0);
  const taxaConversao =
    totalDeals > 0 ? Number((ganhoCount / totalDeals).toFixed(4)) : 0;

  const porEtapa: Record<string, number> = {};
  for (const row of dealsByStageRows) {
    porEtapa[row.etapa] = Number(row.total);
  }

  const dealsPorTipoFechamento: Record<string, number> = {};
  for (const row of dealsByTipoRows) {
    if (row.tipoFechamento) {
      dealsPorTipoFechamento[row.tipoFechamento] = Number(row.total);
    }
  }

  const diasSemanaGanhos: Record<string, number> = {};
  for (const row of diasSemanaRows) {
    diasSemanaGanhos[String(row.dow)] = row.total;
  }

  const perfil = negocioPerfilRows[0] ?? null;

  res.json({
    leads: {
      total: Number(leadsRows[0]?.total ?? 0),
      novosUltimos30Dias: leadsRows[0]?.novosUltimos30Dias ?? 0,
    },
    deals: {
      porEtapa,
      totalEmNegociacao: openDealsValueRows[0]?.totalValor ?? "0",
      totalDeals,
      taxaConversao,
    },
    atividadesAtrasadas: Number(overdueActivitiesRows[0]?.total ?? 0),
    churnRiskDistribuicao: {
      baixo: churnDistRows[0]?.baixo ?? 0,
      medio: churnDistRows[0]?.medio ?? 0,
      alto: churnDistRows[0]?.alto ?? 0,
    },
    top5ChurnRisk: top5ChurnRows.map((r) => ({
      leadId: r.leadId,
      nome: r.nome,
      email: r.email,
      telefone: r.telefone,
      churnRisk: r.churnRisk,
    })),
    ganhosMes: {
      count: ganhosMesRows[0]?.count ?? 0,
      somaValor: ganhosMesRows[0]?.somaValor ?? "0",
    },
    ticketMedio: ticketMedioRows[0]?.ticketMedio ?? null,
    propostas: {
      ativas: {
        count: propostasAtivasRows[0]?.count ?? 0,
        somaValor: propostasAtivasRows[0]?.somaValor ?? "0",
      },
    },
    dealsPorTipoFechamento,
    topOportunidades: topOportunidadesRows.map((r) => ({
      dealId: r.dealId,
      titulo: r.titulo,
      valor: r.valor ?? null,
      probabilidade: r.probabilidade ?? null,
      etapa: r.etapa,
      leadId: r.leadId ?? null,
      leadNome: r.leadNome ?? null,
    })),
    faixaEtaria: {
      naoInformado: faixaEtariaRows[0]?.naoInformado ?? 0,
      ate25: faixaEtariaRows[0]?.ate25 ?? 0,
      de26a35: faixaEtariaRows[0]?.de26a35 ?? 0,
      de36a45: faixaEtariaRows[0]?.de36a45 ?? 0,
      de46a55: faixaEtariaRows[0]?.de46a55 ?? 0,
      acima55: faixaEtariaRows[0]?.acima55 ?? 0,
    },
    diasSemanaGanhos,
    negocioPerfil: perfil
      ? {
          razaoSocial: perfil.razaoSocial,
          nomeFantasia: perfil.nomeFantasia ?? null,
          endereco: perfil.endereco ?? null,
          telefone: perfil.telefone ?? null,
          email: perfil.email ?? null,
          publicoAlvo: perfil.publicoAlvo ?? null,
          vertical: perfil.vertical ?? null,
          canaisVenda: perfil.canaisVenda ?? null,
          diferenciais: perfil.diferenciais ?? null,
          concorrentes: perfil.concorrentes ?? null,
          produtos: perfil.produtos ?? null,
        }
      : null,
  });
});

export default router;
