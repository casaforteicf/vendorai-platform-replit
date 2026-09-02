/**
 * Job diário do Content Autopilot — roda a cadeia completa para tenants cuja
 * automação está habilitada, sempre consumindo somente keywords aprovadas.
 *
 * Modos persistidos:
 * - suggestion: não gera nem publica automaticamente;
 * - semi: gera + otimiza + cria rascunho para aprovação humana;
 * - automatic: gera + otimiza + publica no site próprio, mas somente a partir
 *   de keyword explicitamente aprovada.
 */
import { db, contentAutopilotConfigTable, contentAutopilotKeywordsTable, contentAutopilotRunsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import type { Logger } from "pino";
import { generateArticle } from "./contentAutopilotCriador.js";
import { optimizeArticle } from "./contentAutopilotOtimizador.js";
import { publishToNativeSite } from "./contentAutopilotPublicador.js";

export async function processTenant(tenantId: string, log: Logger): Promise<{ artigosGerados: number; erros: string[] }> {
  const erros: string[] = [];
  let artigosGerados = 0;

  const [config] = await db.select().from(contentAutopilotConfigTable).where(eq(contentAutopilotConfigTable.tenantId, tenantId));
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

  const keywords = await db
    .select()
    .from(contentAutopilotKeywordsTable)
    .where(and(eq(contentAutopilotKeywordsTable.tenantId, tenantId), eq(contentAutopilotKeywordsTable.status, "aprovada")))
    .orderBy(desc(contentAutopilotKeywordsTable.volumeBusca))
    .limit(config.artigosPorDia);

  if (keywords.length === 0) {
    log.info({ tenantId, automationMode }, "content-autopilot/job: nenhuma keyword aprovada disponível");
    return { artigosGerados: 0, erros: [] };
  }

  for (const keyword of keywords) {
    try {
      const { articleId } = await generateArticle(tenantId, keyword.id);
      await optimizeArticle(tenantId, articleId, keyword.termo);

      if (config.canalPublicacao === "site_proprio") {
        await publishToNativeSite(tenantId, articleId, { publish: automationMode === "automatic" });
      }

      artigosGerados++;
      log.info(
        { tenantId, keywordId: keyword.id, articleId, automationMode, autoPublished: automationMode === "automatic" && config.canalPublicacao === "site_proprio" },
        "content-autopilot/job: artigo processado com sucesso",
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
