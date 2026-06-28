/**
 * Job: Partner Commission Calculator
 * Schedule: 0 6 1 * * (dia 1 de cada mês às 06:00)
 *
 * 1. Busca todos os tenants ativos vinculados a um parceiro
 * 2. Para cada parceiro: conta clientes ativos → determina nível e percentual
 * 3. Para cada tenant: soma MRR pago no mês anterior → calcula comissão
 * 4. Insere partner_commissions (tipo='mensalidade', status='pendente')
 * 5. Upsert partner_indicators com totais do mês
 * 6. Atualiza partners.nivel conforme total de clientes ativos
 *
 * Env vars (com defaults):
 *   PARTNER_COMMISSION_TIER1          → % nível 1 (default 30)
 *   PARTNER_COMMISSION_TIER2          → % nível 2 (default 35)
 *   PARTNER_COMMISSION_TIER3          → % nível 3 (default 40)
 *   PARTNER_COMMISSION_CLIENTS_TIER1  → clientes para subir ao nível 2 (default 50)
 *   PARTNER_COMMISSION_CLIENTS_TIER2  → clientes para subir ao nível 3 (default 200)
 */

import { eq, and, gte, lt, isNotNull, sql } from "drizzle-orm";
import type { Logger } from "pino";
import {
  db,
  tenantsTable,
  partnersTable,
  invoicesTable,
  partnerCommissionsTable,
  partnerIndicatorsTable,
} from "@workspace/db";

// ── Configuração via env vars ──────────────────────────────────────────────

function getConfig() {
  return {
    tier1Pct: parseFloat(process.env["PARTNER_COMMISSION_TIER1"] ?? "30"),
    tier2Pct: parseFloat(process.env["PARTNER_COMMISSION_TIER2"] ?? "35"),
    tier3Pct: parseFloat(process.env["PARTNER_COMMISSION_TIER3"] ?? "40"),
    tier1Clients: parseInt(process.env["PARTNER_COMMISSION_CLIENTS_TIER1"] ?? "50", 10),
    tier2Clients: parseInt(process.env["PARTNER_COMMISSION_CLIENTS_TIER2"] ?? "200", 10),
  };
}

function resolveNivel(totalClients: number, cfg: ReturnType<typeof getConfig>): { nivel: number; pct: number } {
  if (totalClients < cfg.tier1Clients) return { nivel: 1, pct: cfg.tier1Pct };
  if (totalClients < cfg.tier2Clients) return { nivel: 2, pct: cfg.tier2Pct };
  return { nivel: 3, pct: cfg.tier3Pct };
}

// ── Datas do mês anterior ─────────────────────────────────────────────────

function prevMonthBounds(): { start: Date; end: Date; mesReferencia: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 1); // exclusive upper bound
  const mesReferencia = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-01`;
  return { start, end, mesReferencia };
}

// ── Upsert partner_indicators ─────────────────────────────────────────────

async function upsertIndicator(
  partnerId: string,
  mesReferencia: string,
  totalClientesAtivos: number,
  totalComissao: number,
): Promise<void> {
  const [existing] = await db
    .select({ id: partnerIndicatorsTable.id })
    .from(partnerIndicatorsTable)
    .where(
      and(
        eq(partnerIndicatorsTable.partnerId, partnerId),
        eq(partnerIndicatorsTable.mesReferencia, mesReferencia),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(partnerIndicatorsTable)
      .set({
        totalClientesAtivos,
        totalComissao: String(totalComissao.toFixed(2)),
      })
      .where(eq(partnerIndicatorsTable.id, existing.id));
  } else {
    await db.insert(partnerIndicatorsTable).values({
      partnerId,
      mesReferencia,
      totalClientesAtivos,
      totalComissao: String(totalComissao.toFixed(2)),
    });
  }
}

// ── Job principal ─────────────────────────────────────────────────────────

export async function runPartnerCommissions(log: Logger): Promise<void> {
  log.info("scheduler/partner-commissions: starting");

  const cfg = getConfig();
  const { start: prevStart, end: prevEnd, mesReferencia } = prevMonthBounds();

  log.info(
    { mesReferencia, tier1Pct: cfg.tier1Pct, tier2Pct: cfg.tier2Pct, tier3Pct: cfg.tier3Pct },
    "scheduler/partner-commissions: config loaded",
  );

  // 1. Buscar todos os tenants ativos com parceiro vinculado
  const tenants = await db
    .select({
      id: tenantsTable.id,
      partnerId: tenantsTable.partnerId,
    })
    .from(tenantsTable)
    .where(
      and(
        eq(tenantsTable.status, "active"),
        isNotNull(tenantsTable.partnerId),
      ),
    );

  if (tenants.length === 0) {
    log.info("scheduler/partner-commissions: no active tenants with partner — skipping");
    return;
  }

  // 2. Agrupar tenants por parceiro
  const byPartner = new Map<string, string[]>(); // partnerId → tenantIds[]
  for (const t of tenants) {
    const pid = t.partnerId!;
    if (!byPartner.has(pid)) byPartner.set(pid, []);
    byPartner.get(pid)!.push(t.id);
  }

  log.info(
    { partners: byPartner.size, tenants: tenants.length },
    "scheduler/partner-commissions: processing",
  );

  let totalInserted = 0;

  for (const [partnerId, tenantIds] of byPartner) {
    // 3. Determinar nível do parceiro com base no total de clientes ativos
    const totalClients = tenantIds.length;
    const { nivel, pct } = resolveNivel(totalClients, cfg);

    log.info(
      { partnerId, totalClients, nivel, pct },
      "scheduler/partner-commissions: partner resolved",
    );

    let totalComissaoPartner = 0;

    // 4. Para cada tenant: calcular MRR do mês anterior e inserir comissão
    for (const tenantId of tenantIds) {
      const [mrrRow] = await db
        .select({
          mrr: sql<string>`coalesce(sum(${invoicesTable.valor}), 0)::text`,
        })
        .from(invoicesTable)
        .where(
          and(
            eq(invoicesTable.tenantId, tenantId),
            eq(invoicesTable.status, "paga"),
            gte(invoicesTable.dataPagamento, prevStart),
            lt(invoicesTable.dataPagamento, prevEnd),
          ),
        );

      const mrr = parseFloat(mrrRow?.mrr ?? "0");
      if (mrr <= 0) {
        log.debug(
          { tenantId, partnerId, mrr },
          "scheduler/partner-commissions: zero MRR — skipping tenant",
        );
        continue;
      }

      const comissao = parseFloat((mrr * pct / 100).toFixed(2));
      totalComissaoPartner += comissao;

      await db.insert(partnerCommissionsTable).values({
        partnerId,
        tenantId,
        tipo: "mensalidade",
        valorBase: String(mrr.toFixed(2)),
        percentual: String(pct.toFixed(2)),
        valor: String(comissao.toFixed(2)),
        dataReferencia: mesReferencia,
        status: "pendente",
      });

      totalInserted++;

      log.debug(
        { tenantId, partnerId, mrr, pct, comissao },
        "scheduler/partner-commissions: commission inserted",
      );
    }

    // 5. Atualizar / criar partner_indicators
    await upsertIndicator(partnerId, mesReferencia, totalClients, totalComissaoPartner);

    // 6. Atualizar nivel do parceiro
    await db
      .update(partnersTable)
      .set({ nivel })
      .where(eq(partnersTable.id, partnerId));

    log.info(
      { partnerId, nivel, totalComissao: totalComissaoPartner },
      "scheduler/partner-commissions: partner updated",
    );
  }

  log.info(
    { commissionsInserted: totalInserted, partners: byPartner.size },
    "scheduler/partner-commissions: complete",
  );
}
