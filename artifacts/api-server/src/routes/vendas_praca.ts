import { Router, type IRouter } from "express";
import { db, tenantsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const router: IRouter = Router();

/**
 * Resumo de vendas originadas do Praça.ai (deals com origem_pedido_praca_id
 * preenchido, etapa 'ganho'), nos 4 recortes de período pedidos: diário
 * (hoje), semanal (últimos 7 dias), mensal (mês corrente), anual (ano
 * corrente). A comissão é CALCULADA aqui pra fins de conferência/exibição —
 * a retenção real acontece no momento da transação via Asaas Split, do lado
 * do Praça.ai (ainda não implementado de verdade, pendente de chave de API
 * do Asaas). Esse endpoint não move dinheiro, só mostra o valor esperado.
 */
router.get("/tenants/:tenantId/vendas-praca-resumo", async (req, res) => {
  const { tenantId } = req.params;
  const user = (req as any).user;

  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (user.role !== "super_admin" && user.tenantId !== tenantId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [tenant] = await db
    .select({ comissaoPercentual: tenantsTable.comissaoPracaAiPercentual })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId));

  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  const comissaoPercentual = Number(tenant.comissaoPercentual ?? 8);

  const periodos = [
    { chave: "diario", condicaoData: sql`created_at >= date_trunc('day', now())` },
    { chave: "semanal", condicaoData: sql`created_at >= now() - interval '7 days'` },
    { chave: "mensal", condicaoData: sql`created_at >= date_trunc('month', now())` },
    { chave: "anual", condicaoData: sql`created_at >= date_trunc('year', now())` },
  ];

  const resumo: Record<string, { totalVendido: number; totalPedidos: number; comissaoCalculada: number }> = {};

  for (const periodo of periodos) {
    const result = await db.execute(sql`
      SELECT
        coalesce(sum(valor), 0)::numeric AS total_vendido,
        count(*)::int AS total_pedidos
      FROM deals
      WHERE tenant_id = ${tenantId}
        AND origem_pedido_praca_id IS NOT NULL
        AND etapa = 'ganho'
        AND ${periodo.condicaoData}
    `);
    const row = result.rows[0] as { total_vendido: string; total_pedidos: number } | undefined;

    const totalVendido = Number(row?.total_vendido ?? 0);
    resumo[periodo.chave] = {
      totalVendido,
      totalPedidos: Number(row?.total_pedidos ?? 0),
      comissaoCalculada: Math.round(totalVendido * (comissaoPercentual / 100) * 100) / 100,
    };
  }

  res.json({ comissaoPercentual, resumo });
});

export default router;
