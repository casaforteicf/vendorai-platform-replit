import { buildInstagramGrowthIntelligence, type InstagramGrowthIntelligence } from "@workspace/vendor-brain/instagram-growth";
import { logger } from "../lib/logger.js";
import { getInstagramConnectionByTenantId } from "./instagram-oauth.js";
import { getMetaGrowthOverview } from "./meta-growth.js";
import { getWindsorMarketingSnapshot } from "./windsor-marketing-provider.js";

export type InstagramGrowthBrainSnapshot = {
  tenantId: string;
  source: "windsor+native" | "native";
  primaryObjective: "grow_audience";
  generatedAt: string;
  native: Awaited<ReturnType<typeof getMetaGrowthOverview>>;
  intelligence: InstagramGrowthIntelligence | null;
  plannerDirectives: string[];
};

function nativeDirectives(native: Awaited<ReturnType<typeof getMetaGrowthOverview>>): string[] {
  const directives: string[] = [];
  if (!native.instagramConnected) {
    directives.push("Conectar o Instagram antes de gerar um plano de crescimento do canal.");
    return directives;
  }
  if ((native.followers ?? 0) < 100) {
    directives.push("Conta em estágio inicial: priorizar descoberta, alcance em não seguidores e consistência antes de aumentar peso de conversão comercial.");
  }
  if ((native.followersDelta7d ?? 0) <= 0) {
    directives.push("Sem crescimento semanal confirmado: o próximo ciclo deve ter meta explícita de novos seguidores e conteúdo orientado à descoberta.");
  }
  if ((native.reach30d ?? 0) < 500) {
    directives.push("Alcance mensal baixo: priorizar Reels curtos, séries recorrentes, demonstrações e temas de dor do segmento.");
  }
  if ((native.profileVisits30d ?? 0) > 0 && (native.followersDelta30d ?? 0) <= 0) {
    directives.push("Há visitas ao perfil sem crescimento proporcional: revisar promessa do perfil, bio, posts fixados e CTA para seguir.");
  }
  return directives;
}

export async function getInstagramGrowthBrainSnapshot(tenantId: string): Promise<InstagramGrowthBrainSnapshot> {
  const native = await getMetaGrowthOverview(tenantId);
  const connection = await getInstagramConnectionByTenantId(tenantId);
  const accountId = connection?.accountId?.trim();

  let intelligence: InstagramGrowthIntelligence | null = null;
  let source: InstagramGrowthBrainSnapshot["source"] = "native";

  if (native.instagramConnected && accountId) {
    try {
      const windsor = await getWindsorMarketingSnapshot({
        tenantId,
        connector: "instagram",
        accountIds: [accountId],
        datePreset: "last_30dT",
        automationMode: "RECOMMEND",
      });
      intelligence = buildInstagramGrowthIntelligence({
        records: windsor.records,
        automationMode: "RECOMMEND",
      });
      source = "windsor+native";
    } catch (error) {
      logger.warn({ tenantId, accountId, error }, "instagram growth brain: Windsor indisponível; usando leitura nativa");
    }
  }

  const plannerDirectives = [
    ...(intelligence?.actions.map((item) => `${item.decision}: ${item.action} Evidência: ${item.evidence}`) ?? []),
    ...nativeDirectives(native),
  ].slice(0, 6);

  return {
    tenantId,
    source,
    primaryObjective: "grow_audience",
    generatedAt: new Date().toISOString(),
    native,
    intelligence,
    plannerDirectives,
  };
}

export function instagramGrowthContextForPlanner(snapshot: InstagramGrowthBrainSnapshot): string {
  const native = snapshot.native;
  const growth = snapshot.intelligence;
  const lines = [
    "INSTAGRAM — OBJETIVO PRIORITÁRIO OBRIGATÓRIO: crescer audiência qualificada.",
    `Fonte analítica: ${snapshot.source}.`,
    `Seguidores atuais: ${native.followers ?? growth?.metrics.currentFollowers ?? "não disponível"}.`,
    `Variação 7 dias: ${native.followersDelta7d ?? "coletando histórico"}.`,
    `Variação 30 dias: ${native.followersDelta30d ?? "coletando histórico"}.`,
    `Alcance 30 dias: ${native.reach30d ?? growth?.metrics.reach ?? "não disponível"}.`,
    growth ? `Growth Score: ${growth.growthScore}/100 (${growth.status}).` : "Growth Score Windsor ainda indisponível; usar sinais nativos.",
    growth?.metrics.averageSkipRate != null ? `Skip médio: ${(growth.metrics.averageSkipRate * 100).toFixed(1)}%.` : "",
    growth?.metrics.engagementRate != null ? `Engajamento por alcance: ${(growth.metrics.engagementRate * 100).toFixed(1)}%.` : "",
    growth?.metrics.followerConversionRate != null ? `Conversão alcance -> seguidores: ${(growth.metrics.followerConversionRate * 100).toFixed(2)}%.` : "",
    ...snapshot.plannerDirectives.map((directive, index) => `Diretriz ${index + 1}: ${directive}`),
    "Ao criar o plano, Instagram não deve ser tratado como canal genérico. Cada conteúdo precisa declarar hipótese de crescimento e KPI de alcance, retenção, interação ou conversão em seguidor.",
  ];
  return lines.filter(Boolean).join("\n");
}
