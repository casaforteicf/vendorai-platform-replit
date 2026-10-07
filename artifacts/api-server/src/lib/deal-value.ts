import { and, desc, eq, sql } from "drizzle-orm";
import { db, dealsTable, propostasTable } from "@workspace/db";

/**
 * Fonte comercial canônica do valor de um negócio.
 *
 * Regra oficial:
 * 1) orçamento/proposta vinculada mais recentemente atualizada;
 * 2) fallback para deals.valor (compatibilidade/negócios sem orçamento);
 * 3) zero quando nenhum valor existe.
 */
export const canonicalDealValueSql = sql<string>`coalesce(
  (
    select ${propostasTable.valorTotal}
    from ${propostasTable}
    where ${propostasTable.dealId} = ${dealsTable.id}
      and ${propostasTable.valorTotal} is not null
    order by ${propostasTable.updatedAt} desc, ${propostasTable.createdAt} desc
    limit 1
  ),
  ${dealsTable.valor},
  0
)`;

export async function resolveCanonicalDealValue(
  dealId: string,
  tenantId: string,
): Promise<number> {
  const [proposal] = await db
    .select({ valorTotal: propostasTable.valorTotal })
    .from(propostasTable)
    .where(and(
      eq(propostasTable.dealId, dealId),
      eq(propostasTable.tenantId, tenantId),
    ))
    .orderBy(desc(propostasTable.updatedAt), desc(propostasTable.createdAt))
    .limit(1);

  const proposalValue = Number(proposal?.valorTotal);
  if (Number.isFinite(proposalValue) && proposalValue >= 0) return proposalValue;

  const [deal] = await db
    .select({ valor: dealsTable.valor })
    .from(dealsTable)
    .where(and(eq(dealsTable.id, dealId), eq(dealsTable.tenantId, tenantId)))
    .limit(1);

  const dealValue = Number(deal?.valor);
  return Number.isFinite(dealValue) && dealValue >= 0 ? dealValue : 0;
}

export async function syncDealValueFromProposal(input: {
  dealId: string | null | undefined;
  tenantId: string;
  valorTotal: string | number | null | undefined;
}) {
  if (!input.dealId || input.valorTotal === null || input.valorTotal === undefined) return;

  const value = Number(input.valorTotal);
  if (!Number.isFinite(value) || value < 0) return;

  await db
    .update(dealsTable)
    .set({ valor: value.toFixed(2), updatedAt: new Date() })
    .where(and(
      eq(dealsTable.id, input.dealId),
      eq(dealsTable.tenantId, input.tenantId),
    ));
}
