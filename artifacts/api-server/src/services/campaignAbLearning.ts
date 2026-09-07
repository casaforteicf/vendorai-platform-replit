import { and, eq } from "drizzle-orm";
import { campaignsTable, campaignSentLogsTable, db } from "@workspace/db";

export type CampaignAbStatus = "sem_teste" | "coletando" | "inconclusivo" | "sinal_provisorio" | "vencedor";

export type CampaignAbVerdict = {
  campaignId: string;
  winner: "A" | "B" | null;
  provisionalLeader: "A" | "B" | null;
  status: CampaignAbStatus;
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

export type VariantEvidenceInput = {
  sampleA: number;
  sampleB: number;
  readsA: number;
  readsB: number;
  conversionsA: number;
  conversionsB: number;
};

export type VariantEvidence = {
  winner: "A" | "B" | null;
  provisionalLeader: "A" | "B" | null;
  status: Exclude<CampaignAbStatus, "sem_teste">;
  reason: string;
  readRateA: number;
  readRateB: number;
  conversionRateA: number;
  conversionRateB: number;
  relativeLift: number;
};

export function evaluateVariantEvidence(input: VariantEvidenceInput): VariantEvidence {
  const readRateA = rate(input.readsA, input.sampleA);
  const readRateB = rate(input.readsB, input.sampleB);
  const conversionRateA = rate(input.conversionsA, input.sampleA);
  const conversionRateB = rate(input.conversionsB, input.sampleB);
  const totalConversions = input.conversionsA + input.conversionsB;

  const base = {
    winner: null,
    provisionalLeader: null,
    readRateA,
    readRateB,
    conversionRateA,
    conversionRateB,
    relativeLift: 0,
  } as const;

  if (input.sampleA < MIN_PER_VARIANT || input.sampleB < MIN_PER_VARIANT) {
    return {
      ...base,
      status: "coletando",
      reason: "Aguardando amostra mínima por variante.",
    };
  }

  const useConversion = totalConversions >= MIN_CONVERSIONS_TOTAL;
  const metricA = useConversion ? conversionRateA : readRateA;
  const metricB = useConversion ? conversionRateB : readRateB;
  const best = Math.max(metricA, metricB);
  const worst = Math.min(metricA, metricB);
  const relativeLift = worst > 0 ? (best - worst) / worst : best > 0 ? 1 : 0;

  if (relativeLift < MIN_RELATIVE_LIFT) {
    return {
      ...base,
      relativeLift,
      status: "inconclusivo",
      reason: "Diferença menor que 20%; não há evidência suficiente para declarar vencedor.",
    };
  }

  const leader: "A" | "B" = metricA > metricB ? "A" : "B";
  if (!useConversion) {
    return {
      ...base,
      provisionalLeader: leader,
      relativeLift,
      status: "sinal_provisorio",
      reason: `Liderança provisória por leitura da variante ${leader}, com lift relativo de ${(relativeLift * 100).toFixed(1)}%; conversões ainda insuficientes para declarar vencedor.`,
    };
  }

  return {
    ...base,
    winner: leader,
    relativeLift,
    status: "vencedor",
    reason: `Vencedor por conversão, com lift relativo de ${(relativeLift * 100).toFixed(1)}%.`,
  };
}

/**
 * Avalia o estado atual do experimento sem persistir qualquer decisão.
 * Isso mantém GETs, painéis e builders de prompt como operações somente leitura.
 * A persistência do vencedor acontece exclusivamente no fluxo explícito de
 * aplicação (`applyCampaignAbWinner`), sujeito à autorização humana/autonomia.
 */
export async function evaluateCampaignAbTest(campaignId: string): Promise<CampaignAbVerdict> {
  const [campaign] = await db
    .select({
      id: campaignsTable.id,
      abTestEnabled: campaignsTable.abTestEnabled,
      variantAText: campaignsTable.variantAText,
      variantBText: campaignsTable.variantBText,
    })
    .from(campaignsTable)
    .where(eq(campaignsTable.id, campaignId))
    .limit(1);

  if (!campaign || campaign.abTestEnabled !== 1 || !campaign.variantAText || !campaign.variantBText) {
    return {
      campaignId,
      winner: null,
      provisionalLeader: null,
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
  const evidence = evaluateVariantEvidence({
    sampleA: a.length,
    sampleB: b.length,
    readsA,
    readsB,
    conversionsA,
    conversionsB,
  });

  return {
    campaignId,
    winner: evidence.winner,
    provisionalLeader: evidence.provisionalLeader,
    status: evidence.status,
    reason: evidence.reason,
    sampleA: a.length,
    sampleB: b.length,
    readsA,
    readsB,
    conversionsA,
    conversionsB,
    readRateA: evidence.readRateA,
    readRateB: evidence.readRateB,
    conversionRateA: evidence.conversionRateA,
    conversionRateB: evidence.conversionRateB,
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
    .filter(({ result }) => result.status === "vencedor" || result.status === "sinal_provisorio" || result.status === "inconclusivo")
    .map(({ campaign, result }) => {
      if (result.winner) {
        return `- ${campaign.nome}: variante ${result.winner} venceu por conversão. A ${result.sampleA} envios (${(result.conversionRateA * 100).toFixed(1)}% conv.); B ${result.sampleB} envios (${(result.conversionRateB * 100).toFixed(1)}% conv.).`;
      }
      if (result.provisionalLeader) {
        return `- ${campaign.nome}: variante ${result.provisionalLeader} lidera provisoriamente por leitura, mas ainda NÃO é vencedora; aguarde conversões suficientes antes de promover.`;
      }
      return `- ${campaign.nome}: teste inconclusivo após A ${result.sampleA} / B ${result.sampleB} envios; não repetir como verdade causal.`;
    });

  if (lines.length === 0) return "";

  return `\n## Aprendizado de testes A/B controlados\n${lines.join("\n")}\nRegra: altere uma variável principal por teste (gancho, oferta, CTA, formato ou mensagem), preserve o restante e priorize conversão sobre abertura. Sinal de leitura é apenas provisório e nunca deve promover automaticamente uma variante. Não generalize vencedor para outro público/canal sem novo teste.\n`;
}
