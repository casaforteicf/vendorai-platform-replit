import { and, eq } from 'drizzle-orm';
import { adCampaignsTable, db } from '@workspace/db';
import { getMetaAdsConnectionByTenantId, refreshMetaAdsToken, META_GRAPH_BASE } from './meta-ads-oauth.js';
import { getGoogleAdsConnectionByTenantId, refreshGoogleAdsToken } from './google-ads-oauth.js';
import { resolveMarketingAgentAutonomyPolicy } from './marketingAgentAutonomyPolicy.js';
import { buildTenantPaidMediaBudgetRedistributionPlan } from './paidMediaBudgetOptimizer.js';

const GOOGLE_ADS_API_BASE = 'https://googleads.googleapis.com/v25';
const GOOGLE_ADS_DEVELOPER_TOKEN = process.env['GOOGLE_ADS_DEVELOPER_TOKEN'] ?? '';

export type BudgetChangeAuthorization = 'human-approved' | 'agent-autonomous';

export type RemainingBudgetSchedule = {
  targetAllocation: number;
  spend: number;
  remainingBudget: number;
  remainingDays: number;
  dailyBudget: number;
};

export type ExecutePaidMediaBudgetInput = {
  tenantId: string;
  mediaPlanId: string;
  campaignId: string;
  authorization: BudgetChangeAuthorization;
  maxTransferFractionPerCycle?: number;
  now?: Date;
};

function floorCurrency(value: number): number {
  return Math.max(0, Math.floor((value + Number.EPSILON) * 100) / 100);
}

function saoPauloDate(now: Date): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

function inclusiveDays(fromDate: string, endDate: string): number {
  const from = Date.parse(`${fromDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(end) || end < from) return 0;
  return Math.floor((end - from) / 86_400_000) + 1;
}

/**
 * Converte o alvo TOTAL aprovado em verba diária apenas para o período restante.
 * O gasto já ocorrido nunca volta a ser disponibilizado.
 */
export function buildRemainingBudgetSchedule(input: {
  targetAllocation: number;
  spend: number;
  endDate: string;
  now?: Date;
}): RemainingBudgetSchedule {
  const targetAllocation = floorCurrency(input.targetAllocation);
  const spend = floorCurrency(input.spend);
  if (targetAllocation < spend) {
    throw new Error('Orçamento alvo inválido: não é permitido reduzir a alocação abaixo do gasto já realizado.');
  }

  const today = saoPauloDate(input.now ?? new Date());
  const remainingDays = inclusiveDays(today, input.endDate);
  if (remainingDays <= 0) throw new Error('Campanha fora do período aprovado: não há dias restantes para redistribuir orçamento.');

  const remainingBudget = floorCurrency(targetAllocation - spend);
  const dailyBudget = floorCurrency(remainingBudget / remainingDays);
  if (remainingBudget > 0 && dailyBudget <= 0) {
    throw new Error('Saldo restante abaixo do mínimo operacional de R$ 0,01 por dia.');
  }

  return { targetAllocation, spend, remainingBudget, remainingDays, dailyBudget };
}

async function assertAuthorization(tenantId: string, authorization: BudgetChangeAuthorization) {
  if (authorization === 'human-approved') return null;
  const autonomy = await resolveMarketingAgentAutonomyPolicy(tenantId);
  if (!autonomy.allowed) {
    throw new Error(`Marketing Agent sem autorização autônoma para alterar orçamento: ${autonomy.reason}`);
  }
  return autonomy;
}

async function validMetaToken(tenantId: string): Promise<string> {
  let connection = await getMetaAdsConnectionByTenantId(tenantId);
  if (!connection || connection.status !== 'active') throw new Error('Tenant sem conexão ativa com Meta Ads.');
  const expiresAt = connection.tokenExpiresAt ? new Date(connection.tokenExpiresAt).getTime() : 0;
  if (!connection.accessToken || expiresAt < Date.now() + 3 * 24 * 60 * 60 * 1000) {
    await refreshMetaAdsToken(connection.id);
    connection = await getMetaAdsConnectionByTenantId(tenantId);
  }
  if (!connection?.accessToken) throw new Error('Não foi possível obter token válido do Meta Ads.');
  return connection.accessToken;
}

async function metaRequest<T>(path: string, accessToken: string, method: 'GET' | 'POST', params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${META_GRAPH_BASE}/${path}`);
  if (method === 'GET') {
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    url.searchParams.set('access_token', accessToken);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Meta Ads recusou ajuste de orçamento (${response.status}): ${(await response.text()).slice(0, 300)}`);
    return response.json() as Promise<T>;
  }
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...params, access_token: accessToken }),
  });
  if (!response.ok) throw new Error(`Meta Ads recusou ajuste de orçamento (${response.status}): ${(await response.text()).slice(0, 300)}`);
  return response.json() as Promise<T>;
}

async function setMetaDailyBudget(tenantId: string, externalCampaignId: string, dailyBudget: number) {
  const accessToken = await validMetaToken(tenantId);
  const adSets = await metaRequest<{ data?: Array<{ id?: string }> }>(
    `${externalCampaignId}/adsets`, accessToken, 'GET', { fields: 'id', limit: '10' },
  );
  const ids = (adSets.data ?? []).map((row) => row.id).filter(Boolean) as string[];
  if (ids.length !== 1) {
    throw new Error(`Ajuste automático bloqueado: campanha Meta possui ${ids.length} conjuntos de anúncios; o executor seguro suporta exatamente 1.`);
  }
  await metaRequest(ids[0]!, accessToken, 'POST', { daily_budget: String(Math.round(dailyBudget * 100)) });
  return { platform: 'meta' as const, externalBudgetResource: ids[0] };
}

async function validGoogleConnection(tenantId: string) {
  let connection = await getGoogleAdsConnectionByTenantId(tenantId);
  if (!connection || connection.status !== 'active' || !connection.customerId) {
    throw new Error('Tenant sem conexão ativa e conta selecionada no Google Ads.');
  }
  const expiresAt = connection.tokenExpiresAt ? new Date(connection.tokenExpiresAt).getTime() : 0;
  if (!connection.accessToken || expiresAt < Date.now() + 2 * 60 * 1000) {
    await refreshGoogleAdsToken(connection.id);
    connection = await getGoogleAdsConnectionByTenantId(tenantId);
  }
  if (!connection?.accessToken || !connection.customerId) throw new Error('Não foi possível obter credenciais válidas do Google Ads.');
  return connection;
}

function googleHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    'developer-token': GOOGLE_ADS_DEVELOPER_TOKEN,
    'Content-Type': 'application/json',
  };
}

async function setGoogleDailyBudget(tenantId: string, externalCampaignId: string, dailyBudget: number) {
  const connection = await validGoogleConnection(tenantId);
  const { accessToken, customerId } = connection;
  const query = `SELECT campaign.campaign_budget FROM campaign WHERE campaign.id = ${externalCampaignId}`;
  const search = await fetch(`${GOOGLE_ADS_API_BASE}/customers/${customerId}/googleAds:searchStream`, {
    method: 'POST', headers: googleHeaders(accessToken!), body: JSON.stringify({ query }),
  });
  if (!search.ok) throw new Error(`Google Ads recusou consulta de orçamento (${search.status}): ${(await search.text()).slice(0, 300)}`);
  const chunks = await search.json() as Array<{ results?: Array<{ campaign?: { campaignBudget?: string } }> }>;
  const budgetResources = [...new Set(chunks.flatMap((chunk) => chunk.results ?? []).map((row) => row.campaign?.campaignBudget).filter(Boolean) as string[])];
  if (budgetResources.length !== 1) throw new Error(`Ajuste automático bloqueado: Google retornou ${budgetResources.length} recursos de orçamento para a campanha.`);

  const mutate = await fetch(`${GOOGLE_ADS_API_BASE}/customers/${customerId}/campaignBudgets:mutate`, {
    method: 'POST',
    headers: googleHeaders(accessToken!),
    body: JSON.stringify({ operations: [{ update: { resourceName: budgetResources[0], amountMicros: String(Math.round(dailyBudget * 1_000_000)) }, updateMask: 'amount_micros' }] }),
  });
  if (!mutate.ok) throw new Error(`Google Ads recusou ajuste de orçamento (${mutate.status}): ${(await mutate.text()).slice(0, 300)}`);
  return { platform: 'google' as const, externalBudgetResource: budgetResources[0]! };
}

/**
 * Recalcula o plano no instante da execução e aplica somente a decisão atual.
 * Não publica nem ativa campanha; apenas ajusta verba de campanha já publicada.
 */
export async function executePaidMediaBudgetDecision(input: ExecutePaidMediaBudgetInput) {
  const autonomyPolicy = await assertAuthorization(input.tenantId, input.authorization);
  const [campaign] = await db.select().from(adCampaignsTable).where(and(
    eq(adCampaignsTable.id, input.campaignId),
    eq(adCampaignsTable.tenantId, input.tenantId),
  )).limit(1);
  if (!campaign) throw new Error('Campanha não encontrada para este tenant.');
  if (campaign.plataforma !== 'meta' && campaign.plataforma !== 'google') throw new Error('Ajuste nativo disponível somente para Meta e Google.');
  if (!campaign.externalCampaignId) throw new Error('Campanha ainda não foi publicada na plataforma; não existe orçamento externo para ajustar.');

  const segmentacao = (campaign.segmentacao ?? {}) as NonNullable<typeof campaign.segmentacao> & Record<string, unknown>;
  const marketingContext = segmentacao.marketingContext && typeof segmentacao.marketingContext === 'object'
    ? segmentacao.marketingContext as { mediaPlanId?: string }
    : {};
  if (marketingContext.mediaPlanId !== input.mediaPlanId) throw new Error('Campanha não pertence ao Plano de Mídia informado.');
  const endDate = segmentacao.campaignControl?.endDate;
  if (!endDate) throw new Error('Campanha sem data final aprovada.');

  const plan = await buildTenantPaidMediaBudgetRedistributionPlan(input.tenantId, input.mediaPlanId, {
    maxTransferFractionPerCycle: input.maxTransferFractionPerCycle,
  });
  if (!plan.humanCeilingRespected) throw new Error('Execução bloqueada: plano calculado ultrapassa o teto humano.');
  const decision = plan.decisions.find((row) => row.campaignId === input.campaignId);
  if (!decision) throw new Error('Campanha não possui decisão de orçamento no plano atual.');
  if (decision.action === 'hold' || decision.delta === 0) {
    return { applied: false, reason: decision.reason, decision, plan, autonomyPolicy };
  }

  const schedule = buildRemainingBudgetSchedule({
    targetAllocation: decision.targetAllocation,
    spend: decision.spend,
    endDate,
    now: input.now,
  });
  if (schedule.remainingBudget <= 0) {
    throw new Error('Ajuste de orçamento resultaria em saldo futuro zero; pause a campanha em vez de definir orçamento diário zero.');
  }

  const external = campaign.plataforma === 'meta'
    ? await setMetaDailyBudget(input.tenantId, campaign.externalCampaignId, schedule.dailyBudget)
    : await setGoogleDailyBudget(input.tenantId, campaign.externalCampaignId, schedule.dailyBudget);

  const draft = segmentacao.mediaPlanDraft && typeof segmentacao.mediaPlanDraft === 'object'
    ? segmentacao.mediaPlanDraft as Record<string, unknown>
    : {};
  const control = segmentacao.campaignControl;
  if (!control) throw new Error('Campanha sem controle de orçamento/período.');
  const nextSegmentacao = {
    ...segmentacao,
    campaignControl: { ...control, totalBudget: schedule.targetAllocation },
    mediaPlanDraft: {
      ...draft,
      allocatedTotalBudget: schedule.targetAllocation,
      budgetAdjustedAt: new Date().toISOString(),
      budgetAdjustmentAuthorization: input.authorization,
      budgetAdjustmentReason: decision.reason,
    },
  };
  await db.update(adCampaignsTable).set({
    orcamentoDiario: schedule.dailyBudget.toFixed(2),
    segmentacao: nextSegmentacao,
    updatedAt: new Date(),
  }).where(and(eq(adCampaignsTable.id, campaign.id), eq(adCampaignsTable.tenantId, input.tenantId)));

  return {
    applied: true,
    authorization: input.authorization,
    autonomyPolicy,
    decision,
    schedule,
    external,
    humanCeilingRespected: plan.humanCeilingRespected,
    planBudgetTotal: plan.planBudgetTotal,
  };
}
