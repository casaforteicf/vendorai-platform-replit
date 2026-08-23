/**
 * Job diário do Content Autopilot — roda a cadeia completa (Criador →
 * Otimizador → Publicador) pra tenants com `content_autopilot_config.ativo
 * = true`, gerando até `artigos_por_dia` artigos por tenant a partir de
 * keywords já aprovadas por humano (status "aprovada" — nunca inventa
 * keyword nova nem publica sem essa aprovação prévia).
 *
 * NÃO chama o Pesquisador sozinho: descobrir keyword nova exige termos-
 * semente que só um humano decide (ver POST .../keywords/research). Esse
 * job só consome keywords que já passaram por aprovação manual.
 *
 * Publicador: só o canal "site_proprio" está implementado — WordPress fica
 * pra depois. Artigo sempre sai como rascunho (publicado=false); nunca
 * publica de verdade sozinho, mesmo rodando todo dia.
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
  if (!config || !config.ativo) return { artigosGerados: 0, erros: [] };

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
    log.info({ tenantId }, "content-autopilot/job: nenhuma keyword aprovada disponível");
    return { artigosGerados: 0, erros: [] };
  }

  for (const keyword of keywords) {
    try {
      const { articleId } = await generateArticle(tenantId, keyword.id);
      await optimizeArticle(tenantId, articleId, keyword.termo);
      if (config.canalPublicacao === "site_proprio") {
        await publishToNativeSite(tenantId, articleId);
      }
      artigosGerados++;
      log.info({ tenantId, keywordId: keyword.id, articleId }, "content-autopilot/job: artigo gerado com sucesso");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      erros.push(`keyword ${keyword.termo}: ${msg}`);
      log.error({ err, tenantId, keywordId: keyword.id }, "content-autopilot/job: falha ao processar keyword");
    }
  }

  return { artigosGerados, erros };
}

export async function runContentAutopilotJob(log: Logger): Promise<void> {
  log.info("content-autopilot/job: iniciando rodada diária");

  const activeConfigs = await db
    .select({ tenantId: contentAutopilotConfigTable.tenantId })
    .from(contentAutopilotConfigTable)
    .where(eq(contentAutopilotConfigTable.ativo, true));

  for (const { tenantId } of activeConfigs) {
    const iniciadoEm = new Date();
    let artigosGerados = 0;
    let erros: string[] = [];

    try {
      const result = await processTenant(tenantId, log);
      artigosGerados = result.artigosGerados;
      erros = result.erros;
    } catch (err) {
      erros.push(err instanceof Error ? err.message : String(err));
      log.error({ err, tenantId }, "content-autopilot/job: tenant falhou (non-fatal)");
    }

    await db.insert(contentAutopilotRunsTable).values({
      tenantId,
      iniciadoEm,
      finalizadoEm: new Date(),
      artigosGerados,
      erros,
    });
  }

  log.info({ tenants: activeConfigs.length }, "content-autopilot/job: rodada diária concluída");
}
