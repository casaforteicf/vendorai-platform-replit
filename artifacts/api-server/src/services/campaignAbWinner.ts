import { and, eq } from "drizzle-orm";
import { campaignsTable, db } from "@workspace/db";
import { evaluateCampaignAbTest } from "./campaignAbLearning.js";
import { resolveMarketingAgentAutonomyPolicy } from "./marketingAgentAutonomyPolicy.js";

export type CampaignAbWinnerAuthorization = "human-approved" | "agent-autonomous";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function applyCampaignAbWinner(input: {
  tenantId: string;
  campaignId: string;
  authorization: CampaignAbWinnerAuthorization;
}) {
  if (input.authorization === "agent-autonomous") {
    const policy = await resolveMarketingAgentAutonomyPolicy(input.tenantId);
    if (!policy.canOperateFull) {
      throw new Error("Aplicação autônoma do vencedor A/B exige nível 4 · Operação completa.");
    }
  }

  const [campaign] = await db
    .select({
      id: campaignsTable.id,
      tenantId: campaignsTable.tenantId,
      mensagem: campaignsTable.mensagem,
      variantAText: campaignsTable.variantAText,
      variantBText: campaignsTable.variantBText,
      winningVariant: campaignsTable.winningVariant,
      abTestEnabled: campaignsTable.abTestEnabled,
      contexto: campaignsTable.contexto,
    })
    .from(campaignsTable)
    .where(and(
      eq(campaignsTable.id, input.campaignId),
      eq(campaignsTable.tenantId, input.tenantId),
    ))
    .limit(1);

  if (!campaign) throw new Error("Campanha não encontrada para este tenant.");

  const verdict = await evaluateCampaignAbTest(input.campaignId);
  if (verdict.status !== "vencedor" || !verdict.winner) {
    return {
      applied: false,
      reason: verdict.reason,
      verdict,
      campaignId: input.campaignId,
    };
  }

  const winningText = verdict.winner === "A" ? campaign.variantAText : campaign.variantBText;
  if (!winningText?.trim()) throw new Error("A variante vencedora não possui conteúdo válido.");

  const context = asRecord(campaign.contexto);
  const experiment = asRecord(context.abExperiment);
  const alreadyApplied = campaign.abTestEnabled === 0
    && campaign.winningVariant === verdict.winner
    && campaign.mensagem === winningText;

  if (alreadyApplied) {
    return {
      applied: false,
      reason: `Variante ${verdict.winner} já está promovida como mensagem principal.`,
      verdict,
      campaignId: input.campaignId,
      winner: verdict.winner,
    };
  }

  const appliedAt = new Date().toISOString();
  const nextContext = {
    ...context,
    abExperiment: {
      ...experiment,
      finalizedAt: appliedAt,
      finalWinner: verdict.winner,
      finalizationAuthorization: input.authorization,
      finalVerdictReason: verdict.reason,
      promotedMessage: winningText,
    },
  };

  const [saved] = await db
    .update(campaignsTable)
    .set({
      mensagem: winningText,
      winningVariant: verdict.winner,
      abTestEnabled: 0,
      contexto: nextContext as any,
      updatedAt: new Date(),
    })
    .where(and(
      eq(campaignsTable.id, input.campaignId),
      eq(campaignsTable.tenantId, input.tenantId),
    ))
    .returning({
      id: campaignsTable.id,
      mensagem: campaignsTable.mensagem,
      winningVariant: campaignsTable.winningVariant,
      abTestEnabled: campaignsTable.abTestEnabled,
      contexto: campaignsTable.contexto,
    });

  return {
    applied: true,
    reason: `Variante ${verdict.winner} promovida e teste encerrado com evidência suficiente.`,
    verdict,
    campaign: saved,
    winner: verdict.winner,
    authorization: input.authorization,
  };
}
