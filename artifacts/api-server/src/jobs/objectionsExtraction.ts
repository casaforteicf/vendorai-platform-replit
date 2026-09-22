/**
 * Tenant-safe sales objection learning.
 *
 * Daily job that:
 * 1. Scans recent conversations per tenant.
 * 2. Extracts explicit objections and pairs them with the response actually used.
 * 3. Persists one deduplicated event per objection message.
 * 4. Updates tenant-scoped objection frequency, advances and break rate.
 *
 * Legacy prospecting_objections rows with tenant_id = NULL are intentionally ignored.
 */
import { and, desc, gte, eq, sql } from "drizzle-orm";
import type { Logger } from "pino";
import {
  db,
  messagesTable,
  conversationsTable,
  leadsTable,
  prospectingObjectionsTable,
  salesObjectionEventsTable,
  tenantsTable,
} from "@workspace/db";
import { callOpenAI } from "../lib/ai-gateway.js";
import {
  calculateBreakRate,
  markResponseConversion,
  mergeResponseStats,
  normalizeObjectionLabel,
  outcomeBreaksObjection,
  resolveEventOutcome,
  type ObjectionResponseStat,
} from "../lib/closer-objection-learning.js";

type InferredOutcome = "advanced" | "no_change" | "unknown";

interface ExtractedObjection {
  objecao: string;
  contexto?: string;
  categoria?: string;
  mensagem_indice: number;
  resposta_indice?: number | null;
  gatilho_usado?: string | null;
  desfecho?: InferredOutcome;
  confianca?: number;
}

function clampConfidence(value: unknown): string | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.min(1, parsed)).toFixed(4);
}

function shouldResolve(outcome: string): boolean {
  return outcome !== "pending" && outcome !== "unknown";
}

export async function runObjectionsExtraction(log: Logger): Promise<void> {
  log.info("objections-extraction: starting tenant-safe learning");

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const tenants = await db
    .select({ id: tenantsTable.id, slug: tenantsTable.slug })
    .from(tenantsTable)
    .where(eq(tenantsTable.status, "active"));

  let totalExtracted = 0;
  let totalUpdated = 0;

  for (const tenant of tenants) {
    try {
      const convs = await db
        .select({
          id: conversationsTable.id,
          leadId: conversationsTable.leadId,
        })
        .from(conversationsTable)
        .where(
          and(
            eq(conversationsTable.tenantId, tenant.id),
            gte(conversationsTable.updatedAt, since),
          ),
        )
        .limit(50);

      if (convs.length === 0) continue;

      for (const conv of convs) {
        try {
          if (!conv.leadId) continue;

          const recentDesc = await db
            .select({
              id: messagesTable.id,
              role: messagesTable.direcao,
              content: messagesTable.conteudo,
              enviadoPor: messagesTable.enviadoPor,
              agentName: messagesTable.agentName,
              createdAt: messagesTable.createdAt,
            })
            .from(messagesTable)
            .where(
              and(
                eq(messagesTable.tenantId, tenant.id),
                eq(messagesTable.conversationId, conv.id),
              ),
            )
            .orderBy(desc(messagesTable.createdAt))
            .limit(40);

          if (recentDesc.length < 2) continue;
          const msgs = [...recentDesc].reverse();

          const [lead] = await db
            .select({
              mercadoSegmento: leadsTable.mercadoSegmento,
              status: leadsTable.status,
            })
            .from(leadsTable)
            .where(
              and(
                eq(leadsTable.tenantId, tenant.id),
                eq(leadsTable.id, conv.leadId),
              ),
            )
            .limit(1);

          if (!lead) continue;

          const segmento =
            lead.mercadoSegmento?.toLocaleLowerCase("pt-BR").replace(/\s+/g, "_") ??
            "geral";

          const conversation = msgs
            .map((m, index) => {
              const sender =
                m.role === "entrada"
                  ? "LEAD"
                  : m.agentName?.trim()
                    ? m.agentName.toLocaleUpperCase("pt-BR")
                    : m.enviadoPor === "humano"
                      ? "HUMANO"
                      : "VENDA";
              return `[${index + 1}] ${sender}: ${m.content}`;
            })
            .join("\n");

          const response = await callOpenAI(
            tenant.id,
            "intelligence_analysis",
            [
              {
                role: "user",
                content: `Analise a conversa de vendas abaixo e extraia APENAS objeções explícitas do lead.
Uma objeção é resistência à compra, proposta, preço, fornecedor, timing, confiança, necessidade ou decisão.
Não classifique perguntas neutras ou curiosidades como objeção.

Para cada objeção:
- informe a frase normalizada;
- categoria curta (preco, timing, decisor, concorrencia, confianca, necessidade, risco, material, outro);
- mensagem_indice: número da mensagem do LEAD onde a objeção aparece;
- resposta_indice: número da primeira resposta comercial diretamente relacionada, ou null;
- gatilho_usado: um entre escassez, urgencia, prova_social, autoridade, reciprocidade, compromisso, afeicao, contraste, ancoragem, novidade, garantia, historia, nenhum;
- desfecho:
  * advanced = depois da resposta o lead claramente avançou (pediu proposta, reunião, documentos, detalhes de fechamento ou aceitou próximo passo);
  * no_change = a resistência permaneceu ou a conversa seguiu sem avanço;
  * unknown = não há evidência suficiente;
- confianca entre 0 e 1.

Se houver dúvida, use unknown. Seja conservador.

Conversa:
${conversation}

Retorne APENAS JSON neste formato:
{
  "objecoes": [
    {
      "objecao": "texto normalizado",
      "contexto": "trecho curto",
      "categoria": "preco",
      "mensagem_indice": 3,
      "resposta_indice": 4,
      "gatilho_usado": "ancoragem",
      "desfecho": "advanced",
      "confianca": 0.92
    }
  ]
}
Se não houver objeções, retorne { "objecoes": [] }.`,
              },
            ],
            {
              model: "gpt-4o-mini",
              responseFormat: { type: "json_object" },
              temperature: 0.1,
            },
          );

          const parsed = JSON.parse(response.content ?? "{}") as {
            objecoes?: ExtractedObjection[];
          };

          for (const obj of parsed.objecoes ?? []) {
            const normalizedObjection = normalizeObjectionLabel(obj.objecao ?? "");
            if (!normalizedObjection) continue;

            const objectionIndex = Math.trunc(Number(obj.mensagem_indice)) - 1;
            if (
              !Number.isInteger(objectionIndex) ||
              objectionIndex < 0 ||
              objectionIndex >= msgs.length
            ) {
              continue;
            }

            const objectionMessage = msgs[objectionIndex];
            if (!objectionMessage || objectionMessage.role !== "entrada") continue;

            let responseIndex =
              obj.resposta_indice == null
                ? -1
                : Math.trunc(Number(obj.resposta_indice)) - 1;

            if (
              responseIndex <= objectionIndex ||
              responseIndex >= msgs.length ||
              msgs[responseIndex]?.role !== "saida"
            ) {
              responseIndex = msgs.findIndex(
                (message, index) => index > objectionIndex && message.role === "saida",
              );
            }

            const responseMessage =
              responseIndex > objectionIndex ? msgs[responseIndex] : undefined;

            const inferredOutcome: InferredOutcome =
              obj.desfecho === "advanced" || obj.desfecho === "no_change"
                ? obj.desfecho
                : "unknown";

            const outcome = resolveEventOutcome({
              leadStatus: lead.status,
              inferredOutcome,
            });
            const brokeObjection = outcomeBreaksObjection(outcome);

            const [existingEvent] = await db
              .select({
                id: salesObjectionEventsTable.id,
                objectionId: salesObjectionEventsTable.objectionId,
                responseText: salesObjectionEventsTable.responseText,
                outcome: salesObjectionEventsTable.outcome,
                brokeObjection: salesObjectionEventsTable.brokeObjection,
              })
              .from(salesObjectionEventsTable)
              .where(
                and(
                  eq(salesObjectionEventsTable.tenantId, tenant.id),
                  eq(salesObjectionEventsTable.conversationId, conv.id),
                  eq(
                    salesObjectionEventsTable.objectionMessageId,
                    objectionMessage.id,
                  ),
                ),
              )
              .limit(1);

            if (existingEvent) {
              if (
                existingEvent.outcome !== outcome ||
                existingEvent.brokeObjection !== brokeObjection
              ) {
                await db
                  .update(salesObjectionEventsTable)
                  .set({
                    outcome,
                    brokeObjection,
                    resolvedAt: shouldResolve(outcome) ? new Date() : null,
                    updatedAt: new Date(),
                  })
                  .where(
                    and(
                      eq(salesObjectionEventsTable.id, existingEvent.id),
                      eq(salesObjectionEventsTable.tenantId, tenant.id),
                    ),
                  );

                if (
                  !existingEvent.brokeObjection &&
                  brokeObjection &&
                  existingEvent.objectionId &&
                  existingEvent.responseText
                ) {
                  const [aggregate] = await db
                    .select({
                      id: prospectingObjectionsTable.id,
                      respostas: prospectingObjectionsTable.respostas,
                    })
                    .from(prospectingObjectionsTable)
                    .where(
                      and(
                        eq(prospectingObjectionsTable.tenantId, tenant.id),
                        eq(
                          prospectingObjectionsTable.id,
                          existingEvent.objectionId,
                        ),
                      ),
                    )
                    .limit(1);

                  if (aggregate) {
                    await db
                      .update(prospectingObjectionsTable)
                      .set({
                        respostas: markResponseConversion(
                          (aggregate.respostas ?? []) as ObjectionResponseStat[],
                          existingEvent.responseText,
                        ),
                        updatedAt: new Date(),
                      })
                      .where(
                        and(
                          eq(prospectingObjectionsTable.id, aggregate.id),
                          eq(prospectingObjectionsTable.tenantId, tenant.id),
                        ),
                      );
                  }
                }
                totalUpdated++;
              }
              continue;
            }

            let [aggregate] = await db
              .select()
              .from(prospectingObjectionsTable)
              .where(
                and(
                  eq(prospectingObjectionsTable.tenantId, tenant.id),
                  eq(prospectingObjectionsTable.segmento, segmento),
                  sql`lower(${prospectingObjectionsTable.objecao}) = lower(${normalizedObjection})`,
                ),
              )
              .limit(1);

            if (!aggregate) {
              const [created] = await db
                .insert(prospectingObjectionsTable)
                .values({
                  tenantId: tenant.id,
                  segmento,
                  objecao: normalizedObjection,
                  frequencia: 0,
                  avancos: 0,
                  respostas: [],
                })
                .returning();

              aggregate = created;
            }

            if (!aggregate) continue;

            const inserted = await db
              .insert(salesObjectionEventsTable)
              .values({
                tenantId: tenant.id,
                leadId: conv.leadId,
                conversationId: conv.id,
                objectionId: aggregate.id,
                objectionMessageId: objectionMessage.id,
                responseMessageId: responseMessage?.id ?? null,
                rawObjection: objectionMessage.content,
                normalizedObjection,
                category: obj.categoria?.trim().toLocaleLowerCase("pt-BR") || "outro",
                segmento,
                responseText: responseMessage?.content ?? null,
                responderType: responseMessage?.enviadoPor ?? null,
                agentName: responseMessage?.agentName ?? null,
                triggerUsed: obj.gatilho_usado?.trim() || null,
                dealStage: lead.status,
                outcome,
                brokeObjection,
                confidence: clampConfidence(obj.confianca),
                metadata: {
                  contexto: obj.contexto ?? null,
                  extractedBy: "gpt-4o-mini",
                },
                resolvedAt: shouldResolve(outcome) ? new Date() : null,
              })
              .onConflictDoNothing()
              .returning({ id: salesObjectionEventsTable.id });

            if (inserted.length === 0) continue;

            if (responseMessage?.content) {
              const respostas = mergeResponseStats(
                (aggregate.respostas ?? []) as ObjectionResponseStat[],
                responseMessage.content,
                brokeObjection,
              );

              await db
                .update(prospectingObjectionsTable)
                .set({
                  respostas,
                  updatedAt: new Date(),
                })
                .where(
                  and(
                    eq(prospectingObjectionsTable.id, aggregate.id),
                    eq(prospectingObjectionsTable.tenantId, tenant.id),
                  ),
                );
            }

            totalExtracted++;
          }
        } catch (err) {
          log.error(
            { err, convId: conv.id, tenantId: tenant.id },
            "objections-extraction: conversation failed (non-fatal)",
          );
        }
      }

      // Recalculate metrics from the immutable event ledger so retries and
      // delayed lead outcomes cannot inflate frequency/advance counters.
      await db.execute(sql`
        UPDATE prospecting_objections po
        SET
          frequencia = metrics.total,
          avancos = metrics.advances,
          taxa_quebra = metrics.break_rate,
          taxa_conversao = metrics.break_rate,
          updated_at = now()
        FROM (
          SELECT
            objection_id,
            count(*)::integer AS total,
            count(*) FILTER (WHERE broke_objection = true)::integer AS advances,
            round(
              100.0 * count(*) FILTER (WHERE broke_objection = true)
              / NULLIF(count(*), 0),
              2
            ) AS break_rate
          FROM sales_objection_events
          WHERE tenant_id = ${tenant.id}
            AND objection_id IS NOT NULL
          GROUP BY objection_id
        ) metrics
        WHERE po.id = metrics.objection_id
          AND po.tenant_id = ${tenant.id}
      `);
    } catch (err) {
      log.error(
        { err, tenantId: tenant.id },
        "objections-extraction: tenant failed (non-fatal)",
      );
    }
  }

  log.info(
    { totalExtracted, totalUpdated },
    "objections-extraction: tenant-safe learning complete",
  );
}
