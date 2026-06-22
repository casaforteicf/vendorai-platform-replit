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
  isNull,
  lt,
  ne,
  count,
  sum,
  avg,
  sql,
  desc,
  gte,
} from "drizzle-orm";
import { callOpenAI as gatewayCallOpenAI } from "../lib/ai-gateway.js";

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
      .where(eq(leadsTable.tenantId, tenantId))
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
      .where(eq(leadsTable.tenantId, tenantId)),

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
        .where(eq(leadsTable.tenantId, tenantId)),
      db
        .select({
          valor: leadsTable.dorPrincipal,
          total: sql<number>`count(*)::integer`.mapWith(Number),
        })
        .from(leadsTable)
        .where(and(eq(leadsTable.tenantId, tenantId), isNotNull(leadsTable.dorPrincipal), ne(leadsTable.dorPrincipal, "")))
        .groupBy(leadsTable.dorPrincipal)
        .orderBy(desc(sql`count(*)`))
        .limit(5),
      db
        .select({ valor: leadsTable.urgencia, total: sql<number>`count(*)::integer`.mapWith(Number) })
        .from(leadsTable)
        .where(and(eq(leadsTable.tenantId, tenantId), isNotNull(leadsTable.urgencia), ne(leadsTable.urgencia, "")))
        .groupBy(leadsTable.urgencia),
      db
        .select({ valor: leadsTable.orcamento, total: sql<number>`count(*)::integer`.mapWith(Number) })
        .from(leadsTable)
        .where(and(eq(leadsTable.tenantId, tenantId), isNotNull(leadsTable.orcamento), ne(leadsTable.orcamento, "")))
        .groupBy(leadsTable.orcamento)
        .orderBy(desc(sql`count(*)`)),
      db
        .select({
          b2b: sql<number>`count(*) filter (where ${leadsTable.empresa} is not null and ${leadsTable.empresa} != '')`.mapWith(Number),
          b2c: sql<number>`count(*) filter (where ${leadsTable.empresa} is null or ${leadsTable.empresa} = '')`.mapWith(Number),
        })
        .from(leadsTable)
        .where(eq(leadsTable.tenantId, tenantId)),
      db
        .select({ valor: dealsTable.motivoPerda, total: sql<number>`count(*)::integer`.mapWith(Number) })
        .from(dealsTable)
        .where(and(eq(dealsTable.tenantId, tenantId), isNotNull(dealsTable.motivoPerda), ne(dealsTable.motivoPerda, "")))
        .groupBy(dealsTable.motivoPerda)
        .orderBy(desc(sql`count(*)`))
        .limit(5),
      db
        .select({ count: sql<number>`count(*)`.mapWith(Number), somaValor: sum(dealsTable.valor) })
        .from(dealsTable)
        .where(and(eq(dealsTable.tenantId, tenantId), eq(dealsTable.etapa, "ganho"))),
      db
        .select({ ticketMedio: sql<string | null>`avg(${dealsTable.valor})::text` })
        .from(dealsTable)
        .where(and(eq(dealsTable.tenantId, tenantId), eq(dealsTable.etapa, "ganho"), isNotNull(dealsTable.valor))),
      db
        .select({
          naoInformado: sql<number>`count(*) filter (where ${leadsTable.dataNascimento} is null or ${leadsTable.dataNascimento} = '')`.mapWith(Number),
          de36a45: sql<number>`count(*) filter (where ${leadsTable.dataNascimento} ~ '^\\d{4}-\\d{2}-\\d{2}$' and extract(year from age(now(), to_date(${leadsTable.dataNascimento}, 'YYYY-MM-DD'))) between 36 and 45)`.mapWith(Number),
        })
        .from(leadsTable)
        .where(eq(leadsTable.tenantId, tenantId)),
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

export default router;
