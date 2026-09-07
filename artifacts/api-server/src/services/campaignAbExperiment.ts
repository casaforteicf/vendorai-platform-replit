import { and, eq } from "drizzle-orm";
import { campaignsTable, db } from "@workspace/db";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { evaluateCampaignAbTest } from "./campaignAbLearning.js";
import "./campaignAbWinnerRuntime.js";

export type CampaignAbVariable = "gancho" | "oferta" | "cta" | "formato" | "mensagem";

export type ConfigureCampaignAbInput = {
  tenantId: string;
  campaignId: string;
  variable: CampaignAbVariable;
  samplePct?: number;
};

type ExperimentMetadata = {
  variable: CampaignAbVariable;
  hypothesis: string;
  createdAt: string;
  baselineMessage: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function channelRule(tipo: string) {
  if (tipo === "whatsapp") return "WhatsApp: curto, pessoal, direto, um CTA principal e sem mudar o público.";
  if (tipo === "email") return "E-mail: preserve estrutura, tamanho aproximado, proposta e público; altere apenas a variável escolhida.";
  return "Instagram: preserve canal, público, proposta e formato-base; altere apenas a variável escolhida.";
}

function experimentPrompt(input: {
  campaignName: string;
  channel: string;
  originalMessage: string;
  variable: CampaignAbVariable;
  context: Record<string, unknown>;
}) {
  return `Você é um cientista de crescimento e copywriter. Crie um teste A/B controlado para uma campanha real.

CAMPANHA: ${input.campaignName}
CANAL: ${input.channel}
MENSAGEM BASE: ${input.originalMessage}
VARIÁVEL ÚNICA A TESTAR: ${input.variable}
CONTEXTO DISPONÍVEL: ${JSON.stringify(input.context).slice(0, 3500)}
REGRA DO CANAL: ${channelRule(input.channel)}

REGRAS EXPERIMENTAIS OBRIGATÓRIAS:
- A e B devem ter o mesmo objetivo, público, oferta comercial base e nível de detalhe, exceto quando a variável escolhida for "oferta".
- Mude UMA variável principal: ${input.variable}.
- Não mude simultaneamente tom, promessa, CTA, oferta e formato.
- Não invente desconto, prazo, prova social, números ou condição comercial não presentes no contexto.
- As duas variantes precisam ser plausíveis e suficientemente diferentes na variável testada.
- A hipótese deve dizer o que muda e qual comportamento se espera observar, sem afirmar causalidade antes do teste.
- Português do Brasil natural.

Retorne APENAS JSON válido:
{"variantA":"...","variantB":"...","hypothesis":"..."}`;
}

export async function configureControlledCampaignAbTest(input: ConfigureCampaignAbInput) {
  const [campaign] = await db
    .select({
      id: campaignsTable.id,
      tenantId: campaignsTable.tenantId,
      nome: campaignsTable.nome,
      tipo: campaignsTable.tipo,
      mensagem: campaignsTable.mensagem,
      contexto: campaignsTable.contexto,
      segmentoFiltro: campaignsTable.segmentoFiltro,
    })
    .from(campaignsTable)
    .where(and(
      eq(campaignsTable.id, input.campaignId),
      eq(campaignsTable.tenantId, input.tenantId),
    ))
    .limit(1);

  if (!campaign) throw new Error("Campanha não encontrada para este tenant.");
  if (!campaign.mensagem?.trim()) throw new Error("A campanha precisa de uma mensagem base antes do teste A/B.");

  const context = {
    ...asRecord(campaign.contexto),
    segmentoFiltro: campaign.segmentoFiltro ?? null,
  };

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1200,
    system: "Você responde apenas com JSON válido, sem markdown e sem texto fora do JSON.",
    messages: [{
      role: "user",
      content: experimentPrompt({
        campaignName: campaign.nome,
        channel: campaign.tipo,
        originalMessage: campaign.mensagem,
        variable: input.variable,
        context,
      }),
    }],
  });

  const raw = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.type === "text" ? block.text : "")
    .join("\n")
    .trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("IA não retornou variantes A/B válidas.");

  let parsed: { variantA?: unknown; variantB?: unknown; hypothesis?: unknown };
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    throw new Error("IA retornou um experimento A/B em formato inválido.");
  }

  const variantA = typeof parsed.variantA === "string" ? parsed.variantA.trim() : "";
  const variantB = typeof parsed.variantB === "string" ? parsed.variantB.trim() : "";
  const hypothesis = typeof parsed.hypothesis === "string" ? parsed.hypothesis.trim() : "";
  if (!variantA || !variantB || variantA === variantB) {
    throw new Error("As variantes A/B precisam ser diferentes e não vazias.");
  }
  if (!hypothesis) throw new Error("O teste precisa de uma hipótese explícita.");

  const samplePct = Math.min(50, Math.max(10, Math.round(input.samplePct ?? 30)));
  const metadata: ExperimentMetadata = {
    variable: input.variable,
    hypothesis,
    createdAt: new Date().toISOString(),
    baselineMessage: campaign.mensagem,
  };
  const nextContext = {
    ...asRecord(campaign.contexto),
    abExperiment: metadata,
  };

  const [saved] = await db
    .update(campaignsTable)
    .set({
      abTestEnabled: 1,
      abTestSamplePct: samplePct,
      variantAText: variantA,
      variantBText: variantB,
      winningVariant: null,
      contexto: nextContext as any,
      updatedAt: new Date(),
    })
    .where(and(
      eq(campaignsTable.id, campaign.id),
      eq(campaignsTable.tenantId, input.tenantId),
    ))
    .returning({
      id: campaignsTable.id,
      abTestEnabled: campaignsTable.abTestEnabled,
      abTestSamplePct: campaignsTable.abTestSamplePct,
      variantAText: campaignsTable.variantAText,
      variantBText: campaignsTable.variantBText,
      winningVariant: campaignsTable.winningVariant,
      contexto: campaignsTable.contexto,
    });

  return {
    campaign: saved,
    experiment: metadata,
    guardrails: {
      minPerVariant: 20,
      minRelativeLift: 0.2,
      conversionPriorityAfterTotalConversions: 2,
    },
  };
}

export async function getControlledCampaignAbStatus(tenantId: string, campaignId: string) {
  const [campaign] = await db
    .select({ id: campaignsTable.id, contexto: campaignsTable.contexto })
    .from(campaignsTable)
    .where(and(eq(campaignsTable.id, campaignId), eq(campaignsTable.tenantId, tenantId)))
    .limit(1);
  if (!campaign) throw new Error("Campanha não encontrada para este tenant.");

  const verdict = await evaluateCampaignAbTest(campaignId);
  const experiment = asRecord(asRecord(campaign.contexto).abExperiment);
  return { verdict, experiment };
}

export async function stopControlledCampaignAbTest(tenantId: string, campaignId: string) {
  const [campaign] = await db
    .select({ id: campaignsTable.id })
    .from(campaignsTable)
    .where(and(eq(campaignsTable.id, campaignId), eq(campaignsTable.tenantId, tenantId)))
    .limit(1);
  if (!campaign) throw new Error("Campanha não encontrada para este tenant.");

  const [saved] = await db
    .update(campaignsTable)
    .set({ abTestEnabled: 0, updatedAt: new Date() })
    .where(and(eq(campaignsTable.id, campaignId), eq(campaignsTable.tenantId, tenantId)))
    .returning({ id: campaignsTable.id, winningVariant: campaignsTable.winningVariant });

  return { stopped: true, campaign: saved };
}
