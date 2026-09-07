import { and, eq } from "drizzle-orm";
import { campaignsTable, campaignSentLogsTable, db } from "@workspace/db";

export type CampaignAbVerdict = {
  campaignId: string;
  winner: "A" | "B" | null;
  status: "sem_teste" | "coletando" | "inconclusivo" | "vencedor";
  reason: string;
  sampleA: number;
  sampleB: number;
  readsA: number;
  readsB: number;
  conversionsA: number;
  conversionsB: number;
  readRateA: number;
  readRateB: number;
  conversionRateA: number;
  conversionRateB: number;
};

const MIN_PER_VARIANT = 20;
const MIN_CONVERSIONS_TOTAL = 2;
const MIN_RELATIVE_LIFT = 0.2;

function rate(num: number, den: number) {
  return den > 0 ? num / den : 0;
}

export async function evaluateCampaignAbTest(campaignId: string): Promise<CampaignAbVerdict> {
  const [campaign] = await db
    .select({
      id: campaignsTable.id,
      abTestEnabled: campaignsTable.abTestEnabled,
      variantAText: campaignsTable.variantAText,
      variantBText: campaignsTable.variantBText,
      winningVariant: campaignsTable.winningVariant,
    })
    .from(campaignsTable)
    .where(eq(campaignsTable.id, campaignId))
    .limit(1);

  if (!campaign || campaign.abTestEnabled !== 1 || !campaign.variantAText || !campaign.variantBText) {
    return {
      campaignId,
      winner: null,
      status: "sem_teste",
      reason: "Campanha sem teste A/B ativo e duas variantes válidas.",
      sampleA: 0,
      sampleB: 0,
      readsA: 0,
      readsB: 0,
      conversionsA: 0,
      conversionsB: 0,
      readRateA: 0,
      readRateB: 0,
      conversionRateA: 0,
      conversionRateB: 0,
    };
  }

  const logs = await db
    .select({
      variant: campaignSentLogsTable.variant,
      readAt: campaignSentLogsTable.readAt,
      convertedAt: campaignSentLogsTable.convertedAt,
    })
    .from(campaignSentLogsTable)
    .where(and(
      eq(campaignSentLogsTable.campaignId, campaignId),
    ));

  const a = logs.filter((row) => row.variant === "A");
  const b = logs.filter((row) => row.variant === "B");
  const readsA = a.filter((row) => row.readAt).length;
  const readsB = b.filter((row) => row.readAt).length;
  const conversionsA = a.filter((row) => row.convertedAt).length;
  const conversionsB = b.filter((row) => row.convertedAt).length;
  const readRateA = rate(readsA, a.length);
  const readRateB = rate(readsB, b.length);
  const conversionRateA = rate(conversionsA, a.length);
  const conversionRateB = rate(conversionsB, b.length);

  const base: CampaignAbVerdict = {
    campaignId,
    winner: null,
    status: "coletando",
    reason: "Aguardando amostra mínima por variante.",
    sampleA: a.length,
    sampleB: b.length,
    readsA,
    readsB,
    conversionsA,
    conversionsB,
    readRateA,
    readRateB,
    conversionRateA,
    conversionRateB,
  };

  if (a.length < MIN_PER_VARIANT || b.length < MIN_PER_VARIANT) return base;

  const totalConversions = conversionsA + conversionsB;
  const metricA = totalConversions >= MIN_CONVERSIONS_TOTAL ? conversionRateA : readRateA;
  const metricB = totalConversions >= MIN_CONVERSIONS_TOTAL ? conversionRateB : readRateB;
  const best = Math.max(metricA, metricB);
  const worst = Math.min(metricA, metricB);
  const relativeLift = worst > 0 ? (best - worst) / worst : best > 0 ? 1 : 0;

  if (relativeLift < MIN_RELATIVE_LIFT) {
    return {
      ...base,
      status: "inconclusivo",
      reason: "Diferença menor que 20%; não há evidência suficiente para declarar vencedor.",
    };
  }

  const winner: "A" | "B" = metricA > metricB ? "A" : "B";
  await db
    .update(campaignsTable)
    .set({ winningVariant: winner, updatedAt: new Date() })
    .where(eq(campaignsTable.id, campaignId));

  return {
    ...base,
    winner,
    status: "vencedor",
    reason: totalConversions >= MIN_CONVERSIONS_TOTAL
      ? `Vencedor por conversão, com lift relativo de ${(relativeLift * 100).toFixed(1)}%.`
      : `Vencedor provisório por leitura, com lift relativo de ${(relativeLift * 100).toFixed(1)}%; conversões ainda insuficientes.`,
  };
}

export async function buildCampaignAbLearningPromptBlock(tenantId: string): Promise<string> {
  const campaigns = await db
    .select({ id: campaignsTable.id, nome: campaignsTable.nome })
    .from(campaignsTable)
    .where(and(eq(campaignsTable.tenantId, tenantId), eq(campaignsTable.abTestEnabled, 1)));

  if (campaigns.length === 0) return "";

  const results = await Promise.all(campaigns.slice(0, 12).map(async (campaign) => ({
    campaign,
    result: await evaluateCampaignAbTest(campaign.id),
  })));

  const lines = results
    .filter(({ result }) => result.status === "vencedor" || result.status === "inconclusivo")
    .map(({ campaign, result }) => {
      const metric = result.conversionsA + result.conversionsB >= MIN_CONVERSIONS_TOTAL ? "conversão" : "leitura";
      return result.winner
        ? `- ${campaign.nome}: variante ${result.winner} venceu por ${metric}. A ${result.sampleA} envios (${(result.conversionRateA * 100).toFixed(1)}% conv.); B ${result.sampleB} envios (${(result.conversionRateB * 100).toFixed(1)}% conv.).`
        : `- ${campaign.nome}: teste inconclusivo após A ${result.sampleA} / B ${result.sampleB} envios; não repetir como verdade causal.`;
    });

  if (lines.length === 0) return "";

  return `\n## Aprendizado de testes A/B controlados\n${lines.join("\n")}\nRegra: altere uma variável principal por teste (gancho, oferta, CTA, formato ou mensagem), preserve o restante e priorize conversão sobre abertura quando houver volume. Não generalize vencedor para outro público/canal sem novo teste.\n`;
}
