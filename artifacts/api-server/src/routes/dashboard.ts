import { Router, IRouter } from "express";
import {
  db,
  leadsTable,
  dealsTable,
  activitiesTable,
  customerIntelligenceTable,
  propostasTable,
  businessProfilesTable,
  produtosCatalogoTable,
  messagesTable,
  aiUsageLogsTable,
  agentConfigsTable,
  whatsappConnectionsTable,
  tenantsTable,
  plansTable,
} from "@workspace/db";
import {
  eq,
  and,
  notInArray,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  count,
  sum,
  avg,
  sql,
  desc,
  asc,
  gte,
} from "drizzle-orm";
import { callOpenAI as gatewayCallOpenAI } from "../lib/ai-gateway.js";
import { authenticate } from "../middlewares/auth.js";
import { canonicalDealValueSql } from "../lib/deal-value.js";

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
type DorRow = { valor: string; total: number };
type UrgenciaRow = { valor: string | null; total: number };
type OrcamentoRow = { valor: string | null; total: number };
type PlanoRow = { valor: string | null; total: number };
type B2bB2cRow = { b2b: number; b2c: number };
type TempoFechamentoRow = { mediaDias: string | null };
type MotivoPerdaRow = { valor: string; total: number };
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
    doresRows,
    urgenciaRows,
    orcamentoRows,
    planosRows,
    b2bB2cRows,
    tempoFechamentoRows,
    motivosPerdaRows,
  ] = (await Promise.all([
    // 1. Leads: total + novos nos últimos 30 dias
    db
      .select({
        total: count(),
        novosUltimos30Dias: sql<number>`count(*) filter (where ${leadsTable.createdAt} >= ${thirtyDaysAgo})`.mapWith(Number),
      })
      .from(leadsTable)
      .where(and(eq(leadsTable.tenantId, tenantId), isNull(leadsTable.naoLeadTipo))),

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
      .select({ totalValor: sum(canonicalDealValueSql) })
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
          isNull(leadsTable.naoLeadTipo),
        ),
      )
      .orderBy(desc(customerIntelligenceTable.churnRisk))
      .limit(5),

    // 7. Deals ganhos este mês
    db
      .select({
        count: sql<number>`count(*)`.mapWith(Number),
        somaValor: sum(canonicalDealValueSql),
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
        ticketMedio: sql<string | null>`avg(${canonicalDealValueSql})::text`,
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
      .where(and(eq(leadsTable.tenantId, tenantId), isNull(leadsTable.naoLeadTipo))),

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

    // 15. Top 5 dores principais dos leads
    db
      .select({
        valor: leadsTable.dorPrincipal,
        total: sql<number>`count(*)::integer`.mapWith(Number),
      })
      .from(leadsTable)
      .where(
        and(
          eq(leadsTable.tenantId, tenantId),
          isNotNull(leadsTable.dorPrincipal),
          ne(leadsTable.dorPrincipal, ""),
          isNull(leadsTable.naoLeadTipo),
        ),
      )
      .groupBy(leadsTable.dorPrincipal)
      .orderBy(desc(sql`count(*)`))
      .limit(5),

    // 16. Distribuição de urgência dos leads
    db
      .select({
        valor: leadsTable.urgencia,
        total: sql<number>`count(*)::integer`.mapWith(Number),
      })
      .from(leadsTable)
      .where(and(eq(leadsTable.tenantId, tenantId), isNull(leadsTable.naoLeadTipo)))
      .groupBy(leadsTable.urgencia),

    // 17. Distribuição de orçamento dos leads
    db
      .select({
        valor: leadsTable.orcamento,
        total: sql<number>`count(*)::integer`.mapWith(Number),
      })
      .from(leadsTable)
      .where(
        and(
          eq(leadsTable.tenantId, tenantId),
          isNotNull(leadsTable.orcamento),
          ne(leadsTable.orcamento, ""),
          isNull(leadsTable.naoLeadTipo),
        ),
      )
      .groupBy(leadsTable.orcamento)
      .orderBy(desc(sql`count(*)`)),

    // 18. Distribuição de plano recomendado
    db
      .select({
        valor: leadsTable.planoRecomendado,
        total: sql<number>`count(*)::integer`.mapWith(Number),
      })
      .from(leadsTable)
      .where(
        and(
          eq(leadsTable.tenantId, tenantId),
          isNotNull(leadsTable.planoRecomendado),
          ne(leadsTable.planoRecomendado, ""),
          isNull(leadsTable.naoLeadTipo),
        ),
      )
      .groupBy(leadsTable.planoRecomendado)
      .orderBy(desc(sql`count(*)`)),

    // 19. Ratio B2B vs B2C
    db
      .select({
        b2b: sql<number>`count(*) filter (where ${leadsTable.empresa} is not null and ${leadsTable.empresa} != '')`.mapWith(Number),
        b2c: sql<number>`count(*) filter (where ${leadsTable.empresa} is null or ${leadsTable.empresa} = '')`.mapWith(Number),
      })
      .from(leadsTable)
      .where(and(eq(leadsTable.tenantId, tenantId), isNull(leadsTable.naoLeadTipo))),

    // 20. Tempo médio de fechamento (dias do created_at até updated_at em deals ganhos)
    db
      .select({
        mediaDias: sql<string | null>`avg(extract(epoch from (${dealsTable.updatedAt} - ${dealsTable.createdAt})) / 86400)::text`,
      })
      .from(dealsTable)
      .where(
        and(
          eq(dealsTable.tenantId, tenantId),
          eq(dealsTable.etapa, "ganho"),
        ),
      ),

    // 21. Top 5 motivos de perda
    db
      .select({
        valor: dealsTable.motivoPerda,
        total: sql<number>`count(*)::integer`.mapWith(Number),
      })
      .from(dealsTable)
      .where(
        and(
          eq(dealsTable.tenantId, tenantId),
          isNotNull(dealsTable.motivoPerda),
          ne(dealsTable.motivoPerda, ""),
        ),
      )
      .groupBy(dealsTable.motivoPerda)
      .orderBy(desc(sql`count(*)`))
      .limit(5),
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
    DorRow[],
    UrgenciaRow[],
    OrcamentoRow[],
    PlanoRow[],
    B2bB2cRow[],
    TempoFechamentoRow[],
    MotivoPerdaRow[],
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
  const catalogProducts = perfil
    ? await db
        .select({
          nome: produtosCatalogoTable.nome,
          descricao: produtosCatalogoTable.descricao,
          precoBase: produtosCatalogoTable.precoBase,
        })
        .from(produtosCatalogoTable)
        .where(
          and(
            eq(produtosCatalogoTable.tenantId, tenantId),
            eq(produtosCatalogoTable.ativo, true),
          ),
        )
        .orderBy(asc(produtosCatalogoTable.nome), asc(produtosCatalogoTable.id))
        .limit(20)
    : [];
  const productsForDashboard = catalogProducts.length > 0
    ? catalogProducts.map((product) => {
        const preco = Number(product.precoBase);
        return {
          nome: product.nome,
          descricao: product.descricao ?? null,
          preco: Number.isFinite(preco) ? preco : null,
        };
      })
    : perfil?.produtos ?? null;

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
          produtos: productsForDashboard,
        }
      : null,
    perfilCompra: {
      doresPrincipais: doresRows
        .filter((r) => r.valor != null)
        .map((r) => ({ valor: r.valor as string, count: r.total })),
      urgenciaDistribuicao: urgenciaRows.reduce<Record<string, number>>((acc, r) => {
        const key = r.valor ?? "não informado";
        acc[key] = r.total;
        return acc;
      }, {}),
      orcamentoDistribuicao: orcamentoRows.reduce<Record<string, number>>((acc, r) => {
        if (r.valor) acc[r.valor] = r.total;
        return acc;
      }, {}),
      b2bVsB2c: {
        b2b: b2bB2cRows[0]?.b2b ?? 0,
        b2c: b2bB2cRows[0]?.b2c ?? 0,
      },
      tempoMedioFechamentoDias: tempoFechamentoRows[0]?.mediaDias
        ? Number(Number(tempoFechamentoRows[0].mediaDias).toFixed(1))
        : null,
      motivosPerda: motivosPerdaRows
        .filter((r) => r.valor != null)
        .map((r) => ({ valor: r.valor as string, count: r.total })),
      planosRecomendados: planosRows.reduce<Record<string, number>>((acc, r) => {
        if (r.valor) acc[r.valor] = r.total;
        return acc;
      }, {}),
    },
  });
});

// POST /tenants/:tenantId/dashboard/perfil-insight — AI narrative for purchase profile
router.post("/tenants/:tenantId/dashboard/perfil-insight", async (req, res) => {
  const tenantId = String(req.params.tenantId);

  const [leadsRows, doresRows, urgenciaRows, orcamentoRows, b2bB2cRows, motivosPerdaRows, ganhosMesRows, ticketMedioRows, faixaEtariaRows] =
    (await Promise.all([
      db
        .select({ total: count() })
        .from(leadsTable)
        .where(and(eq(leadsTable.tenantId, tenantId), isNull(leadsTable.naoLeadTipo))),
      db
        .select({
          valor: leadsTable.dorPrincipal,
          total: sql<number>`count(*)::integer`.mapWith(Number),
        })
        .from(leadsTable)
        .where(and(eq(leadsTable.tenantId, tenantId), isNotNull(leadsTable.dorPrincipal), ne(leadsTable.dorPrincipal, ""), isNull(leadsTable.naoLeadTipo)))
        .groupBy(leadsTable.dorPrincipal)
        .orderBy(desc(sql`count(*)`))
        .limit(5),
      db
        .select({ valor: leadsTable.urgencia, total: sql<number>`count(*)::integer`.mapWith(Number) })
        .from(leadsTable)
        .where(and(eq(leadsTable.tenantId, tenantId), isNotNull(leadsTable.urgencia), ne(leadsTable.urgencia, ""), isNull(leadsTable.naoLeadTipo)))
        .groupBy(leadsTable.urgencia),
      db
        .select({ valor: leadsTable.orcamento, total: sql<number>`count(*)::integer`.mapWith(Number) })
        .from(leadsTable)
        .where(and(eq(leadsTable.tenantId, tenantId), isNotNull(leadsTable.orcamento), ne(leadsTable.orcamento, ""), isNull(leadsTable.naoLeadTipo)))
        .groupBy(leadsTable.orcamento)
        .orderBy(desc(sql`count(*)`)),
      db
        .select({
          b2b: sql<number>`count(*) filter (where ${leadsTable.empresa} is not null and ${leadsTable.empresa} != '')`.mapWith(Number),
          b2c: sql<number>`count(*) filter (where ${leadsTable.empresa} is null or ${leadsTable.empresa} = '')`.mapWith(Number),
        })
        .from(leadsTable)
        .where(and(eq(leadsTable.tenantId, tenantId), isNull(leadsTable.naoLeadTipo))),
      db
        .select({ valor: dealsTable.motivoPerda, total: sql<number>`count(*)::integer`.mapWith(Number) })
        .from(dealsTable)
        .where(and(eq(dealsTable.tenantId, tenantId), isNotNull(dealsTable.motivoPerda), ne(dealsTable.motivoPerda, "")))
        .groupBy(dealsTable.motivoPerda)
        .orderBy(desc(sql`count(*)`))
        .limit(5),
      db
        .select({ count: sql<number>`count(*)`.mapWith(Number), somaValor: sum(canonicalDealValueSql) })
        .from(dealsTable)
        .where(and(eq(dealsTable.tenantId, tenantId), eq(dealsTable.etapa, "ganho"))),
      db
        .select({ ticketMedio: sql<string | null>`avg(${canonicalDealValueSql})::text` })
        .from(dealsTable)
        .where(and(eq(dealsTable.tenantId, tenantId), eq(dealsTable.etapa, "ganho"))),
      db
        .select({
          naoInformado: sql<number>`count(*) filter (where ${leadsTable.dataNascimento} is null or ${leadsTable.dataNascimento} = '')`.mapWith(Number),
          de36a45: sql<number>`count(*) filter (where ${leadsTable.dataNascimento} ~ '^\\d{4}-\\d{2}-\\d{2}$' and extract(year from age(now(), to_date(${leadsTable.dataNascimento}, 'YYYY-MM-DD'))) between 36 and 45)`.mapWith(Number),
        })
        .from(leadsTable)
        .where(and(eq(leadsTable.tenantId, tenantId), isNull(leadsTable.naoLeadTipo))),
    ])) as [
      { total: number }[],
      { valor: string | null; total: number }[],
      { valor: string | null; total: number }[],
      { valor: string | null; total: number }[],
      { b2b: number; b2c: number }[],
      { valor: string | null; total: number }[],
      { count: number; somaValor: string | null }[],
      { ticketMedio: string | null }[],
      { naoInformado: number; de36a45: number }[],
    ];

  const totalLeads = Number(leadsRows[0]?.total ?? 0);
  if (totalLeads === 0) {
    res.status(400).json({ error: "Dados insuficientes para gerar análise. Adicione leads primeiro." });
    return;
  }

  const b2b = b2bB2cRows[0]?.b2b ?? 0;
  const b2c = b2bB2cRows[0]?.b2c ?? 0;
  const tipoCliente = b2b > b2c ? "predominantemente B2B (empresas)" : b2c > b2b ? "predominantemente B2C (pessoas físicas)" : "mix equilibrado B2B/B2C";
  const doresStr = doresRows.filter((r) => r.valor).map((r) => `"${r.valor}" (${r.total}x)`).join(", ") || "não identificadas";
  const urgenciaStr = urgenciaRows.filter((r) => r.valor).map((r) => `${r.valor}: ${r.total}`).join(", ") || "não informada";
  const orcamentoStr = orcamentoRows.filter((r) => r.valor).map((r) => `${r.valor} (${r.total} leads)`).join(", ") || "não informado";
  const ticketMedio = ticketMedioRows[0]?.ticketMedio ? `R$ ${Number(ticketMedioRows[0].ticketMedio).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "não calculado";
  const dealsGanhos = ganhosMesRows[0]?.count ?? 0;
  const motivosStr = motivosPerdaRows.filter((r) => r.valor).map((r) => `"${r.valor}" (${r.total}x)`).join(", ") || "nenhum registrado";

  const prompt = `Você é um analista de vendas e CRM especializado. Analise os dados abaixo e gere um relatório de perfil de compra dos clientes em português brasileiro, conciso e orientado a ação (máximo 4 parágrafos curtos).

DADOS DO TENANT:
- Total de leads: ${totalLeads}
- Perfil: ${tipoCliente} (B2B: ${b2b}, B2C: ${b2c})
- Principais dores/necessidades: ${doresStr}
- Urgência dos leads: ${urgenciaStr}
- Faixas de orçamento informadas: ${orcamentoStr}
- Deals fechados (ganhos): ${dealsGanhos}
- Ticket médio: ${ticketMedio}
- Principais motivos de perda: ${motivosStr}

Gere uma análise em 3-4 parágrafos cobrindo:
1. Quem é o cliente típico (perfil B2B/B2C, necessidades principais)
2. Padrões de compra e conversão (orçamento, urgência, ticket médio)
3. Pontos de atenção e oportunidades (motivos de perda, o que melhorar)
4. Uma recomendação prática de ação imediata

Seja direto, use dados concretos e fale em segunda pessoa para o usuário do CRM.`;

  const aiResult = await gatewayCallOpenAI(
    tenantId,
    "intelligence_analysis",
    [{ role: "user", content: prompt }],
    { model: "gpt-4o-mini", maxTokens: 600, temperature: 0.7, log: req.log },
  );

  const insight = aiResult.content || "Não foi possível gerar a análise.";

  res.json({ insight, generatedAt: new Date().toISOString() });
});

// ── GET /dashboard ─────────────────────────────────────────────────────────────
// Endpoint unificado: retorna todos os dados do dashboard em uma só chamada.
// Requer autenticação de tenant (tenantId extraído do JWT).
router.get("/dashboard", authenticate, async (req, res) => {
  const tenantId = req.user!.tenantId;
  if (!tenantId) {
    return res.status(403).json({ error: "Tenant não identificado" });
  }

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo  = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000);
  const todayStart    = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const tenantRow = await db
    .select({
      subdomainSlug: tenantsTable.subdomainSlug,
      aiQuotaUsd: plansTable.aiQuotaUsd,
    })
    .from(tenantsTable)
    .leftJoin(plansTable, eq(tenantsTable.planId, plansTable.id))
    .where(eq(tenantsTable.id, tenantId))
    .limit(1);
  const subdomainSlug = tenantRow[0]?.subdomainSlug ?? null;
  const aiQuotaUsd = tenantRow[0]?.aiQuotaUsd != null
    ? Number(tenantRow[0].aiQuotaUsd)
    : null;

  const [
    leadsCount,
    leadsNovosCount,
    leadsClienteCount,
    leadsStatusRaw,
    dealsFechadosRaw,
    mensagensHojeCount,
    mensagensMesCount,
    tokensMesRaw,
    custoIaMesRaw,
    usosPorAgenteRaw,
    agentConfigRaw,
    whatsappConnRaw,
    atividadeLeadsRaw,
    atividadeMessagesRaw,
    atividadeDealsRaw,
    atividadeClientesRaw,
    evolucaoLeadsRaw,
    dealsAbertosRaw,
    dealsGanhosMesRaw,
    riscoChurnRaw,
    leadsSemContatoRaw,
    pipelineRaw,
  ] = await Promise.all([
    // totalLeads no período (30d) — exclui leads com exclusão lógica e não-leads
    db.select({ c: count() }).from(leadsTable)
      .where(and(eq(leadsTable.tenantId, tenantId), isNull(leadsTable.excluidoEm), isNull(leadsTable.naoLeadTipo), gte(leadsTable.createdAt, thirtyDaysAgo))),

    // leadsNovos (últimos 7d)
    db.select({ c: count() }).from(leadsTable)
      .where(and(eq(leadsTable.tenantId, tenantId), isNull(leadsTable.excluidoEm), isNull(leadsTable.naoLeadTipo), gte(leadsTable.createdAt, sevenDaysAgo))),

    // leads convertidos (status='cliente') no período
    db.select({ c: count() }).from(leadsTable)
      .where(and(eq(leadsTable.tenantId, tenantId), isNull(leadsTable.excluidoEm), isNull(leadsTable.naoLeadTipo), eq(leadsTable.status, "cliente"), gte(leadsTable.createdAt, thirtyDaysAgo))),

    // leads por status (estado atual, sem filtro de período)
    db.select({ status: leadsTable.status, c: count() }).from(leadsTable)
      .where(and(eq(leadsTable.tenantId, tenantId), isNull(leadsTable.excluidoEm), isNull(leadsTable.naoLeadTipo)))
      .groupBy(leadsTable.status),

    // deals ganhos no período para ticket médio
    db.select({ valor: dealsTable.valor }).from(dealsTable)
      .where(and(
        eq(dealsTable.tenantId, tenantId),
        eq(dealsTable.etapa, "ganho"),
        gte(dealsTable.dataFechamento, thirtyDaysAgo),
      )),

    // mensagens de agente hoje
    db.select({ c: count() }).from(messagesTable)
      .where(and(
        eq(messagesTable.tenantId, tenantId),
        eq(messagesTable.enviadoPor, "agente_ia"),
        gte(messagesTable.createdAt, todayStart),
      )),

    // mensagens de agente no mês
    db.select({ c: count() }).from(messagesTable)
      .where(and(
        eq(messagesTable.tenantId, tenantId),
        eq(messagesTable.enviadoPor, "agente_ia"),
        gte(messagesTable.createdAt, monthStart),
      )),

    // tokens consumidos no mês (input + output)
    db.select({ total: sum(sql`${aiUsageLogsTable.inputTokens} + ${aiUsageLogsTable.outputTokens}`) })
      .from(aiUsageLogsTable)
      .where(and(eq(aiUsageLogsTable.tenantId, tenantId), gte(aiUsageLogsTable.createdAt, monthStart))),

    // custo financeiro no mês — mesma fonte usada no detalhe administrativo do tenant
    db.select({ total: sql<number>`coalesce(sum(${aiUsageLogsTable.costEstimateUsd}), 0)` })
      .from(aiUsageLogsTable)
      .where(and(eq(aiUsageLogsTable.tenantId, tenantId), gte(aiUsageLogsTable.createdAt, monthStart))),

    // uso por feature no mês (para usosPorAgente)
    db.select({ feature: aiUsageLogsTable.feature, c: count() })
      .from(aiUsageLogsTable)
      .where(and(eq(aiUsageLogsTable.tenantId, tenantId), gte(aiUsageLogsTable.createdAt, monthStart)))
      .groupBy(aiUsageLogsTable.feature)
      .orderBy(desc(count())),

    // configuração de agentes do tenant
    db.select({
      agents:            agentConfigsTable.agents,
      metaPhoneNumberId: agentConfigsTable.metaPhoneNumberId,
      evolutionConnected: agentConfigsTable.evolutionConnected,
      zapiInstanceId:    agentConfigsTable.zapiInstanceId,
    }).from(agentConfigsTable).where(eq(agentConfigsTable.tenantId, tenantId)).limit(1),

    // conexão WhatsApp ativa
    db.select({ status: whatsappConnectionsTable.status })
      .from(whatsappConnectionsTable)
      .where(eq(whatsappConnectionsTable.tenantId, tenantId))
      .limit(1),

    // atividade: últimos leads criados
    db.select({ id: leadsTable.id, nome: leadsTable.nome, createdAt: leadsTable.createdAt })
      .from(leadsTable).where(and(eq(leadsTable.tenantId, tenantId), isNull(leadsTable.naoLeadTipo)))
      .orderBy(desc(leadsTable.createdAt)).limit(20),

    // atividade: mensagens de agente recentes
    db.select({
      id:        messagesTable.id,
      agentName: messagesTable.agentName,
      leadId:    messagesTable.leadId,
      createdAt: messagesTable.createdAt,
    }).from(messagesTable)
      .where(and(eq(messagesTable.tenantId, tenantId), eq(messagesTable.enviadoPor, "agente_ia")))
      .orderBy(desc(messagesTable.createdAt)).limit(20),

    // atividade: deals atualizados recentemente
    db.select({ id: dealsTable.id, titulo: dealsTable.titulo, etapa: dealsTable.etapa, leadId: dealsTable.leadId, updatedAt: dealsTable.updatedAt })
      .from(dealsTable).where(eq(dealsTable.tenantId, tenantId))
      .orderBy(desc(dealsTable.updatedAt)).limit(20),

    // atividade: clientes convertidos recentemente
    db.select({ id: leadsTable.id, nome: leadsTable.nome, createdAt: leadsTable.createdAt })
      .from(leadsTable)
      .where(and(eq(leadsTable.tenantId, tenantId), eq(leadsTable.status, "cliente"), isNull(leadsTable.naoLeadTipo)))
      .orderBy(desc(leadsTable.createdAt)).limit(20),

    // evolução de leads: agrupado por dia nos últimos 30d (SQL raw)
    db.execute(sql`
      SELECT date_trunc('day', created_at)::date::text AS data,
             count(*)::int AS count
      FROM leads
      WHERE tenant_id = ${tenantId}
        AND created_at >= ${thirtyDaysAgo}
      GROUP BY date_trunc('day', created_at)::date
      ORDER BY data ASC
    `),

    // deals comerciais abertos — mesma definição usada pelo Command Center.
    // Aquecimento, parceiros, execução e estados terminais não pertencem ao pipeline Comercial.
    db.select({
      total: count(),
      somaValor: sum(canonicalDealValueSql),
    })
      .from(dealsTable)
      .innerJoin(leadsTable, and(
        eq(dealsTable.leadId, leadsTable.id),
        eq(leadsTable.tenantId, tenantId),
      ))
      .where(and(
        eq(dealsTable.tenantId, tenantId),
        notInArray(dealsTable.etapa, ["em_aquecimento", "parceiro", "em_execucao", "ganho", "entregue", "perdido"]),
        isNull(leadsTable.excluidoEm),
        isNull(leadsTable.naoLeadTipo),
      )),

    // deals ganhos este mês
    db.select({
      total: count(),
      somaValor: sum(canonicalDealValueSql),
    })
      .from(dealsTable)
      .where(and(
        eq(dealsTable.tenantId, tenantId),
        eq(dealsTable.etapa, "ganho"),
        gte(dealsTable.updatedAt, monthStart),
      )),

    // leads em risco — alto churnRisk (IA analisou)
    db.select({
      leadId:    customerIntelligenceTable.leadId,
      churnRisk: customerIntelligenceTable.churnRisk,
      nome:      leadsTable.nome,
      status:    leadsTable.status,
    })
      .from(customerIntelligenceTable)
      .innerJoin(leadsTable, eq(customerIntelligenceTable.leadId, leadsTable.id))
      .where(and(
        eq(customerIntelligenceTable.tenantId, tenantId),
        isNotNull(customerIntelligenceTable.churnRisk),
        sql`${customerIntelligenceTable.churnRisk} > 60`,
        notInArray(leadsTable.status, ["cliente", "perdido"]),
        isNull(leadsTable.naoLeadTipo),
      ))
      .orderBy(desc(customerIntelligenceTable.churnRisk))
      .limit(8),

    // leads em negociação sem contato há mais de 7 dias (sem dado de IA)
    db.select({
      leadId:  leadsTable.id,
      nome:    leadsTable.nome,
      status:  leadsTable.status,
      ultimoContato: leadsTable.updatedAt,
    })
      .from(leadsTable)
      .where(and(
        eq(leadsTable.tenantId, tenantId),
        inArray(leadsTable.status, ["negociando", "proposta"]),
        lt(leadsTable.updatedAt, sevenDaysAgo),
        isNull(leadsTable.naoLeadTipo),
      ))
      .orderBy(asc(leadsTable.updatedAt))
      .limit(8),

    // pipeline — leads ativos por etapa (máx 6 por coluna)
    db.select({
      id:        leadsTable.id,
      nome:      leadsTable.nome,
      status:    leadsTable.status,
      telefone:  leadsTable.telefone,
      iaAtiva:   leadsTable.iaAtiva,
      updatedAt: leadsTable.updatedAt,
    })
      .from(leadsTable)
      .where(and(
        eq(leadsTable.tenantId, tenantId),
        inArray(leadsTable.status, ["novo", "qualificado", "proposta", "negociando"]),
        isNull(leadsTable.naoLeadTipo),
      ))
      .orderBy(desc(leadsTable.updatedAt)),
  ]);

  // ── vendas ───────────────────────────────────────────────────────────────
  const totalLeads  = Number(leadsCount[0]?.c ?? 0);
  const leadsNovos  = Number(leadsNovosCount[0]?.c ?? 0);
  const leadsCliente = Number(leadsClienteCount[0]?.c ?? 0);
  const taxaConversao = totalLeads > 0
    ? Math.round((leadsCliente / totalLeads) * 1000) / 10
    : 0;

  const valoresFechados = dealsFechadosRaw
    .map(d => parseFloat(d.valor ?? "0"))
    .filter(v => v > 0);
  const ticketMedio = valoresFechados.length > 0
    ? Math.round(valoresFechados.reduce((a, b) => a + b, 0) / valoresFechados.length * 100) / 100
    : 0;

  const STATUS_KEYS = ["novo", "qualificado", "proposta", "negociando", "fechado", "perdido"] as const;
  const leadsPorStatus: Record<string, number> = Object.fromEntries(STATUS_KEYS.map(k => [k, 0]));
  for (const row of leadsStatusRaw) {
    if (row.status in leadsPorStatus) leadsPorStatus[row.status] = Number(row.c);
  }

  // preenche dias sem leads com count=0
  const evolucaoMap = new Map<string, number>();
  for (const row of evolucaoLeadsRaw.rows as { data: string; count: number }[]) {
    evolucaoMap.set(row.data, row.count);
  }
  const evolucaoLeads: { data: string; count: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().split("T")[0]!;
    evolucaoLeads.push({ data: key, count: evolucaoMap.get(key) ?? 0 });
  }

  // ── ia ───────────────────────────────────────────────────────────────────
  const mensagensHoje = Number(mensagensHojeCount[0]?.c ?? 0);
  const mensagensMes  = Number(mensagensMesCount[0]?.c ?? 0);

  const agentConfig  = agentConfigRaw[0] ?? null;
  const agentsMap    = (agentConfig?.agents ?? {}) as Record<string, { enabled?: boolean; nomePerfil?: string } | undefined>;
  const agentesAtivos = Object.values(agentsMap).filter(a => a?.enabled === true).length;

  const tokensMes = parseInt(String(tokensMesRaw[0]?.total ?? "0"), 10) || 0;
  const gastoIaMesUsd = Number(custoIaMesRaw[0]?.total ?? 0);
  // A quota comercial dos planos é financeira. O limite legado de tokens não
  // pode ser usado aqui, pois produz percentuais incompatíveis com a tela de custos.
  const quotaUsada = aiQuotaUsd != null && aiQuotaUsd > 0
    ? (gastoIaMesUsd / aiQuotaUsd) * 100
    : 0;
  const quotaUsadaExibicao = Math.round(quotaUsada * 10) / 10;

  const AGENT_PREFIX = "agent_";
  const usosPorAgente = usosPorAgenteRaw
    .filter(row => row.feature?.startsWith(AGENT_PREFIX))
    .map(row => {
      const agentKey = row.feature.slice(AGENT_PREFIX.length);
      return {
        agentKey,
        nome: agentsMap[agentKey]?.nomePerfil ?? agentKey,
        count: Number(row.c),
      };
    });

  // ── atividade ────────────────────────────────────────────────────────────
  type AtividadeItem = {
    tipo: string;
    descricao: string;
    entidade: string;
    entidadeId: string;
    createdAt: Date;
  };
  const atividades: AtividadeItem[] = [];

  for (const l of atividadeLeadsRaw) {
    atividades.push({ tipo: "lead_novo", descricao: `Novo lead: ${l.nome}`, entidade: "lead", entidadeId: l.id, createdAt: l.createdAt });
  }
  for (const m of atividadeMessagesRaw) {
    atividades.push({ tipo: "agente_mensagem", descricao: `Agente enviou mensagem${m.agentName ? ` (${m.agentName})` : ""}`, entidade: "message", entidadeId: m.id, createdAt: m.createdAt });
  }
  for (const d of atividadeDealsRaw) {
    atividades.push({ tipo: "deal_atualizado", descricao: `Deal atualizado: ${d.titulo}`, entidade: "deal", entidadeId: d.id, createdAt: d.updatedAt });
  }
  for (const c of atividadeClientesRaw) {
    atividades.push({ tipo: "cliente_convertido", descricao: `Cliente convertido: ${c.nome}`, entidade: "lead", entidadeId: c.id, createdAt: c.createdAt });
  }

  const ultimas20 = atividades
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 20);

  // ── alertas ──────────────────────────────────────────────────────────────
  type Alerta = { tipo: string; mensagem: string; severidade: "info" | "aviso" | "critico" };
  const alertas: Alerta[] = [];

  if (agentesAtivos === 0) {
    alertas.push({
      tipo: "sem_agente",
      mensagem: "Nenhum agente de IA está ativo. Ative pelo menos um agente para começar.",
      severidade: "aviso",
    });
  }
  if (quotaUsada >= 95) {
    alertas.push({
      tipo: "quota_critica",
      mensagem: `Quota de IA em ${quotaUsadaExibicao}% — risco de interrupção. Atualize seu plano.`,
      severidade: "critico",
    });
  } else if (quotaUsada >= 80) {
    alertas.push({
      tipo: "quota_alta",
      mensagem: `Quota de IA em ${quotaUsadaExibicao}% do limite mensal.`,
      severidade: "aviso",
    });
  }

  // Achado real reportado pelo Marcos: o painel mostrava 'WhatsApp não
  // conectado' mesmo com a Evolution API (QR Code) funcionando de
  // verdade -- essa checagem só olhava pra Meta e pra uma tabela OAuth
  // separada, nunca pro campo evolutionConnected nem pra Z-API.
  const hasMeta   = !!(agentConfig?.metaPhoneNumberId);
  const hasEvolution = !!(agentConfig?.evolutionConnected);
  const hasWaConn = whatsappConnRaw.some((connection) => connection.status === "active" && connection.provider === "evolution");
  if (!hasMeta && !hasEvolution && !hasWaConn) {
    alertas.push({
      tipo: "whatsapp_desconectado",
      mensagem: "WhatsApp não está conectado. Configure na seção de agentes.",
      severidade: "critico",
    });
  }

  // ── pipeline ─────────────────────────────────────────────────────────────
  const PIPELINE_STAGES = ["novo", "qualificado", "proposta", "negociando"] as const;
  type PipelineStage = typeof PIPELINE_STAGES[number];
  const pipeline: Record<PipelineStage, { id: string; nome: string; telefone: string | null; updatedAt: Date | null }[]> = {
    novo: [], qualificado: [], proposta: [], negociando: [],
  };
  for (const lead of pipelineRaw) {
    const stage = lead.status as PipelineStage;
    if (pipeline[stage] && pipeline[stage].length < 6) {
      pipeline[stage].push({ id: lead.id, nome: lead.nome ?? "Sem nome", telefone: lead.telefone ?? null, updatedAt: lead.updatedAt });
    }
  }

  // ── risco de perda ───────────────────────────────────────────────────────
  // Merge: prioriza leads com churnRisk da IA; complementa com leads sem contato há 7d
  const riscoChurnIds = new Set(riscoChurnRaw.map(r => r.leadId));
  const STATUS_LABEL: Record<string, string> = {
    novo: "Novo", qualificado: "Qualificado", proposta: "Proposta",
    negociando: "Negociando", fechado: "Fechado", perdido: "Perdido",
  };
  const riscoPerda = [
    ...riscoChurnRaw.map(r => ({
      leadId:    r.leadId,
      nome:      r.nome ?? "Lead sem nome",
      status:    r.status ?? "",
      statusLabel: STATUS_LABEL[r.status ?? ""] ?? r.status ?? "",
      churnRisk: r.churnRisk ?? null,
      motivo:    "ia" as const,
    })),
    ...leadsSemContatoRaw
      .filter(r => !riscoChurnIds.has(r.leadId))
      .map(r => ({
        leadId:    r.leadId,
        nome:      r.nome ?? "Lead sem nome",
        status:    r.status ?? "",
        statusLabel: STATUS_LABEL[r.status ?? ""] ?? r.status ?? "",
        churnRisk: null,
        motivo:    "sem_contato" as const,
      })),
  ].slice(0, 8);

  // ── negociação ────────────────────────────────────────────────────────────
  const dealsAbertos      = Number(dealsAbertosRaw[0]?.total ?? 0);
  const dealsAbertosValor = parseFloat(dealsAbertosRaw[0]?.somaValor ?? "0") || 0;
  const dealsGanhosMes      = Number(dealsGanhosMesRaw[0]?.total ?? 0);
  const dealsGanhosMesValor = parseFloat(dealsGanhosMesRaw[0]?.somaValor ?? "0") || 0;
  const leadsEmNegociacao   = (leadsPorStatus["negociando"] ?? 0) + (leadsPorStatus["proposta"] ?? 0);

  return res.json({
    vendas: {
      totalLeads,
      leadsNovos,
      taxaConversao,
      ticketMedio,
      leadsPorStatus,
      evolucaoLeads,
    },
    negociacao: {
      leadsEmNegociacao,
      dealsAbertos,
      dealsAbertosValor,
      dealsGanhosMes,
      dealsGanhosMesValor,
    },
    pipeline,
    riscoPerda,
    ia: {
      mensagensHoje,
      mensagensMes,
      agentesAtivos,
      tokensMes,
      gastoIaMesUsd,
      quotaUsd: aiQuotaUsd,
      quotaUsada: quotaUsadaExibicao,
      usosPorAgente,
    },
    atividade: {
      ultimas20,
    },
    alertas,
    periodo: {
      inicio: thirtyDaysAgo.toISOString(),
      fim:    now.toISOString(),
    },
    tenant: {
      subdomainSlug,
    },
  });
});

// ── GET /tenants/:tenantId/dashboard/agentes-em-execucao ────────────────────────
// Visão gerencial: todo lead com conversa em andamento, cujo status não é
// "convertido" e cujo deal mais recente (se houver) não está ganho/perdido.
type RunningAgentDbRow = {
  lead_id: string;
  nome: string;
  telefone: string | null;
  orcamento: string | null;
  conversation_id: string;
  conversation_started_at: Date;
  current_agent: string | null;
  agent_name: string | null;
  deal_valor: string | null;
  deal_etapa: string | null;
  proposta_valor: string | null;
};

router.get("/tenants/:tenantId/dashboard/agentes-em-execucao", async (req, res) => {
  const tenantId = String(req.params.tenantId);

  const result = await db.execute<RunningAgentDbRow>(sql`
    WITH latest_conv AS (
      SELECT id, lead_id, created_at, current_agent, agent_name,
             ROW_NUMBER() OVER (PARTITION BY lead_id ORDER BY created_at DESC) AS rn
      FROM conversations
      WHERE tenant_id = ${tenantId} AND lead_id IS NOT NULL
    ),
    latest_deal AS (
      SELECT id, lead_id, valor, etapa,
             ROW_NUMBER() OVER (PARTITION BY lead_id ORDER BY updated_at DESC) AS rn
      FROM deals
      WHERE tenant_id = ${tenantId}
    ),
    latest_proposta AS (
      SELECT id, lead_id, valor_total,
             ROW_NUMBER() OVER (PARTITION BY lead_id ORDER BY created_at DESC) AS rn
      FROM propostas
      WHERE tenant_id = ${tenantId}
    )
    SELECT
      l.id AS lead_id,
      l.nome AS nome,
      l.telefone AS telefone,
      l.orcamento AS orcamento,
      c.id AS conversation_id,
      c.created_at AS conversation_started_at,
      c.current_agent AS current_agent,
      c.agent_name AS agent_name,
      d.valor AS deal_valor,
      d.etapa AS deal_etapa,
      p.valor_total AS proposta_valor
    FROM leads l
    INNER JOIN latest_conv c ON c.lead_id = l.id AND c.rn = 1
    LEFT JOIN latest_deal d ON d.lead_id = l.id AND d.rn = 1
    LEFT JOIN latest_proposta p ON p.lead_id = l.id AND p.rn = 1
    WHERE l.tenant_id = ${tenantId}
      AND l.status <> 'convertido'
      AND (d.id IS NULL OR d.etapa NOT IN ('ganho', 'perdido'))
    ORDER BY c.created_at DESC
  `);

  const rows = (result.rows as unknown as RunningAgentDbRow[]).map((row) => {
    let valor: string | null = null;
    let valorOrigem: "proposta" | "deal" | "orcamento" | null = null;
    if (row.proposta_valor != null) {
      valor = row.proposta_valor;
      valorOrigem = "proposta";
    } else if (row.deal_valor != null) {
      valor = row.deal_valor;
      valorOrigem = "deal";
    } else if (row.orcamento != null && row.orcamento !== "") {
      valor = row.orcamento;
      valorOrigem = "orcamento";
    }

    return {
      leadId: row.lead_id,
      nome: row.nome,
      telefone: row.telefone,
      valor,
      valorOrigem,
      conversationId: row.conversation_id,
      conversationStartedAt: new Date(row.conversation_started_at).toISOString(),
      agenteAtivo: row.current_agent ?? row.agent_name ?? null,
      dealEtapa: row.deal_etapa,
    };
  });

  res.json(rows);
});

export default router;