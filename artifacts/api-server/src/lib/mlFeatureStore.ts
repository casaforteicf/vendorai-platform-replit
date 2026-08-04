import { db, leadsTable, mlFeatureSnapshotsTable } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import type { Logger } from "pino";

/**
 * Feature store — captura o estado do lead num momento-chave da jornada
 * (mudança de status, test-drive realizado, proposta enviada etc). Melhor
 * esforço: nunca deve derrubar o fluxo principal que a chamou, por isso
 * engole qualquer erro (só loga se um logger for passado).
 *
 * As features aqui são propositalmente genéricas/cross-vertical — dá pra
 * complementar com um objeto `featuresExtras` específico do chamador (ex:
 * veículos manda testDriveFeito, obras manda etapaAtual).
 */
export async function captureLeadFeatureSnapshot(
  tenantId: string,
  leadId: string,
  eventoTipo: string,
  featuresExtras?: Record<string, unknown>,
  log?: Logger,
): Promise<void> {
  try {
    const [lead] = await db.select().from(leadsTable).where(eq(leadsTable.id, leadId));
    if (!lead) return;

    const diasDesdeEntrada = Math.floor((Date.now() - lead.createdAt.getTime()) / (1000 * 60 * 60 * 24));

    const features: Record<string, unknown> = {
      status: lead.status,
      diasDesdeEntrada,
      intentScore: lead.intentScore ?? null,
      propensityScore: lead.propensityScore ?? null,
      mercadoSegmento: lead.mercadoSegmento ?? null,
      source: lead.source,
      tipoPessoa: lead.tipoPessoa,
      temVendedorAtribuido: !!lead.assignedTo,
      urgencia: lead.urgencia ?? null,
      orcamento: lead.orcamento ?? null,
      ...featuresExtras,
    };

    await db.insert(mlFeatureSnapshotsTable).values({
      tenantId,
      leadId,
      eventoTipo,
      features,
    });
  } catch (err) {
    log?.warn({ err, tenantId, leadId, eventoTipo }, "ml-feature-store: falha ao capturar snapshot (não bloqueia)");
  }
}

/**
 * Quando um lead/negócio finalmente resolve (ganho ou perdido), retroage
 * o rótulo em todos os snapshots pendentes desse lead — só a partir daí
 * eles viram exemplos de treino utilizáveis.
 */
export async function backfillResultadoSnapshots(
  tenantId: string,
  leadId: string,
  resultado: "ganho" | "perdido",
  log?: Logger,
): Promise<void> {
  try {
    await db.update(mlFeatureSnapshotsTable)
      .set({ resultado, resultadoRegistradoEm: new Date() })
      .where(
        and(
          eq(mlFeatureSnapshotsTable.tenantId, tenantId),
          eq(mlFeatureSnapshotsTable.leadId, leadId),
          isNull(mlFeatureSnapshotsTable.resultado),
        ),
      );
  } catch (err) {
    log?.warn({ err, tenantId, leadId, resultado }, "ml-feature-store: falha ao retroagir resultado (não bloqueia)");
  }
}
