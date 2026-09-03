/**
 * Job diário do Content Autopilot — roda a cadeia completa para tenants cuja
 * automação está habilitada.
 *
 * Modos persistidos:
 * - suggestion: não gera nem publica automaticamente;
 * - semi: gera + otimiza usando keywords aprovadas e mantém revisão humana;
 * - automatic: a autorização do tenant permite que a IA escolha oportunidades
 *   descobertas, gere, otimize e publique sem aprovação manual de cada item.
 */
import {
  agentConfigsTable,
  contentAutopilotConfigTable,
  contentAutopilotKeywordsTable,
  contentAutopilotRunsTable,
  db,
} from "@workspace/db";
import { and, desc, eq, or } from "drizzle-orm";
import type { Logger } from "pino";
import { generateArticle } from "./contentAutopilotCriador.js";
import { optimizeArticle } from "./contentAutopilotOtimizador.js";
import { publishToNativeSite } from "./contentAutopilotPublicador.js";
import { createAndPublishAutonomousFeed } from "./contentSocialPublisher.js";

export async function processTenant(tenantId: string, log: Logger): Promise<{ artigosGerados: number; erros: string[] }> {
  const erros: string[] = [];
  let artigosGerados = 0;

  const [[config], [agentConfig]] = await Promise.all([
    db.select().from(contentAutopilotConfigTable).where(eq(contentAutopilotConfigTable.tenantId, tenantId)),
    db
      .select({ autonomyEnabledAt: agentConfigsTable.autonomyEnabledAt })
      .from(agentConfigsTable)
      .where(eq(agentConfigsTable.tenantId, tenantId))
      .limit(1),
  ]);
  if (!config) return { artigosGerados: 0, erros: [] };

  const automationMode = config.automationMode ?? (config.ativo ? "semi" : "suggestion");
  if (!config.ativo || automationMode === "suggestion") {
    log.info({ tenantId, automationMode }, "content-autopilot/job: modo sugestão ou automação pausada, pulando tenant");
    return { artigosGerados: 0, erros: [] };
  }

  if (config.tetoGastoMensal != null && Number(config.gastoAcumulado) >= Number(config.tetoGastoMensal)) {
    log.info({ tenantId }, "content-autopilot/job: teto de gasto mensal atingido, pulando tenant");
    return { artigosGerados: 0, erros: [] };
  }

  const autonomousPublishing = automationMode === "automatic" && Boolean(agentConfig?.autonomyEnabledAt);
  if (automationMode === "automatic" && !autonomousPublishing) {
    log.warn({ tenantId }, "content-autopilot/job: modo automático sem autonomia global ativa; geração segue, publicação social fica protegida");
  }

  const statusFilter = automationMode === "automatic"
    ? or(
        eq(contentAutopilotKeywordsTable.status, "aprovada"),
        eq(contentAutopilotKeywordsTable.status, "descoberta"),
      )
    : eq(contentAutopilotKeywordsTable.status, "aprovada");

  const keywords = await db
    .select()
    .from(contentAutopilotKeywordsTable)
    .where(and(eq(contentAutopilotKeywordsTable.tenantId, tenantId), statusFilter))
    .orderBy(desc(contentAutopilotKeywordsTable.volumeBusca))
    .limit(config.artigosPorDia);

  if (keywords.length === 0) {
    log.info(
      { tenantId, automationMode },
      automationMode === "automatic"
        ? "content-autopilot/job: nenhuma oportunidade descoberta/aprovada disponível"
        : "content-autopilot/job: nenhuma keyword aprovada disponível",
    );
    return { artigosGerados: 0, erros: [] };
  }

  for (const keyword of keywords) {
    try {
      const { articleId } = await generateArticle(tenantId, keyword.id);
      await optimizeArticle(tenantId, articleId, keyword.termo);

      if (config.canalPublicacao === "site_proprio") {
        await publishToNativeSite(tenantId, articleId, { publish: automationMode === "automatic" });
      }

      let social: Awaited<ReturnType<typeof createAndPublishAutonomousFeed>> | null = null;
      if (autonomousPublishing) {
        social = await createAndPublishAutonomousFeed({
          tenantId,
          theme: keyword.termo,
          log,
        });
        if (social.warning) {
          log.warn(
            { tenantId, articleId, contentGenerationId: social.contentGenerationId, warning: social.warning },
            "content-autopilot/job: conteúdo social preparado com ressalva",
          );
        }
      }

      artigosGerados++;
      log.info(
        {
          tenantId,
          keywordId: keyword.id,
          articleId,
          automationMode,
          autoPublishedSite: automationMode === "automatic" && config.canalPublicacao === "site_proprio",
          autonomousPublishing,
          socialContentGenerationId: social?.contentGenerationId ?? null,
          instagramPublished: social?.published ?? false,
          instagramPostId: social?.postId ?? null,
        },
        "content-autopilot/job: conteúdo processado com sucesso",
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      erros.push(`keyword ${keyword.termo}: ${msg}`);
      log.error({ err, tenantId, keywordId: keyword.id, automationMode }, "content-autopilot/job: falha ao processar keyword");
    }
  }

  return { artigosGerados, erros };
}

export async function runContentAutopilotJob(log: Logger): Promise<void> {
  log.info("content-autopilot/job: iniciando rodada diária");

  const activeConfigs = await db
    .select({ tenantId: contentAutopilotConfigTable.tenantId, automationMode: contentAutopilotConfigTable.automationMode })
    .from(contentAutopilotConfigTable)
    .where(eq(contentAutopilotConfigTable.ativo, true));

  const executableConfigs = activeConfigs.filter((config) => config.automationMode !== "suggestion");

  for (const { tenantId, automationMode } of executableConfigs) {
    const iniciadoEm = new Date();
    let artigosGerados = 0;
    let erros: string[] = [];

    try {
      const result = await processTenant(tenantId, log);
      artigosGerados = result.artigosGerados;
      erros = result.erros;
    } catch (err) {
      erros.push(err instanceof Error ? err.message : String(err));
      log.error({ err, tenantId, automationMode }, "content-autopilot/job: tenant falhou (non-fatal)");
    }

    await db.insert(contentAutopilotRunsTable).values({
      tenantId,
      iniciadoEm,
      finalizadoEm: new Date(),
      artigosGerados,
      erros,
    });
  }

  log.info({ tenants: executableConfigs.length }, "content-autopilot/job: rodada diária concluída");
}
