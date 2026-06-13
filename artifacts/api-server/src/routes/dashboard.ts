import { Router, IRouter } from "express";
import {
  db,
  leadsTable,
  dealsTable,
  activitiesTable,
  invoicesTable,
  customerIntelligenceTable,
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
  sql,
  desc,
} from "drizzle-orm";

const router: IRouter = Router();

// Explicit row shapes so TypeScript doesn't lose inference inside Promise.all<7>
type LeadsSummaryRow = { total: number; novosUltimos30Dias: number };
type DealsByStageRow = { etapa: string; total: number };
type OpenDealsValueRow = { totalValor: string | null };
type InvoiceStatusRow = { status: string; total: number; somaValor: string | null };
type OverdueActivitiesRow = { total: number };
type ChurnDistRow = { baixo: number; medio: number; alto: number };
type Top5ChurnRow = {
  leadId: string;
  churnRisk: number | null;
  nome: string | null;
  email: string | null;
  telefone: string | null;
};

router.get("/tenants/:tenantId/dashboard", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const now = new Date();

  // Run all 7 aggregate queries in parallel
  const [
    leadsRows,
    dealsByStageRows,
    openDealsValueRows,
    invoicesRows,
    overdueActivitiesRows,
    churnDistRows,
    top5ChurnRows,
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

    // 4. Faturas pendente + atrasada: count e soma por status
    db
      .select({
        status: sql<string>`${invoicesTable.status}`,
        total: count(),
        somaValor: sum(invoicesTable.valor),
      })
      .from(invoicesTable)
      .where(
        and(
          eq(invoicesTable.tenantId, tenantId),
          inArray(invoicesTable.status, ["pendente", "atrasada"]),
        ),
      )
      .groupBy(invoicesTable.status),

    // 5. Atividades atrasadas: status=pendente + dataVencimento < now
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

    // 6. Distribuição churnRisk: baixo (<30), médio (30–70), alto (>70)
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

    // 7. Top 5 leads por churnRisk decrescente
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
  ])) as [
    LeadsSummaryRow[],
    DealsByStageRow[],
    OpenDealsValueRow[],
    InvoiceStatusRow[],
    OverdueActivitiesRow[],
    ChurnDistRow[],
    Top5ChurnRow[],
  ];

  // --- Deriva métricas de deals ---
  const ganhoCount = Number(dealsByStageRows.find((r) => r.etapa === "ganho")?.total ?? 0);
  const totalDeals = dealsByStageRows.reduce((acc, r) => acc + Number(r.total), 0);
  const taxaConversao =
    totalDeals > 0 ? Number((ganhoCount / totalDeals).toFixed(4)) : 0;

  const porEtapa: Record<string, number> = {};
  for (const row of dealsByStageRows) {
    porEtapa[row.etapa] = Number(row.total);
  }

  // --- Faturas por status ---
  const fPendente = invoicesRows.find((r) => r.status === "pendente");
  const fAtrasada = invoicesRows.find((r) => r.status === "atrasada");

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
    faturas: {
      pendente: {
        count: Number(fPendente?.total ?? 0),
        somaValor: fPendente?.somaValor ?? "0",
      },
      atrasada: {
        count: Number(fAtrasada?.total ?? 0),
        somaValor: fAtrasada?.somaValor ?? "0",
      },
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
  });
});

export default router;
