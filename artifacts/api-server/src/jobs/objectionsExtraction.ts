/**
 * Cmd 22 — Fase 5: Memória de Objeções
 *
 * Daily cron job that:
 * 1. Scans SDR conversations from last 24h
 * 2. Extracts and normalizes objections via GPT-4o-mini
 * 3. Increments frequency per segment
 * 4. Updates winning responses based on conversion rate
 */
import { and, desc, gte, eq, sql } from "drizzle-orm";
import type { Logger } from "pino";
import {
  db,
  messagesTable,
  conversationsTable,
  leadsTable,
  prospectingObjectionsTable,
  tenantsTable,
} from "@workspace/db";
import { callOpenAI } from "../lib/ai-gateway.js";

interface ExtractedObjection {
  objecao: string;
  contexto: string;
  segmento: string;
  desfecho: "converteu" | "nao_converteu" | "indeterminado";
}

export async function runObjectionsExtraction(log: Logger): Promise<void> {
  log.info("objections-extraction: starting");

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Load all active tenants that use the prospector
  const tenants = await db
    .select({ id: tenantsTable.id, slug: tenantsTable.slug })
    .from(tenantsTable)
    .where(eq(tenantsTable.status, "active"));

  let totalExtracted = 0;

  for (const tenant of tenants) {
    try {
      // Get SDR conversations with messages from last 24h
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
          // Get the conversation messages
          const msgs = await db
            .select({ role: messagesTable.direcao, content: messagesTable.conteudo })
            .from(messagesTable)
            .where(eq(messagesTable.conversationId, conv.id))
            .orderBy(desc(messagesTable.createdAt))
            .limit(20);

          if (msgs.length < 3) continue;
          if (!conv.leadId) continue;

          // Get lead segment
          const [lead] = await db
            .select({ mercadoSegmento: leadsTable.mercadoSegmento, status: leadsTable.status })
            .from(leadsTable)
            .where(eq(leadsTable.id, conv.leadId))
            .limit(1);

          const segmento = lead?.mercadoSegmento?.toLowerCase().replace(/\s+/g, "_") ?? "geral";
          const desfecho: "converteu" | "nao_converteu" | "indeterminado" =
            lead?.status === "qualificado" || lead?.status === "cliente"
              ? "converteu"
              : lead?.status === "perdido"
                ? "nao_converteu"
                : "indeterminado";

          const conversation = msgs
            .reverse()
            .map((m) => `${m.role === "entrada" ? "LEAD" : "SDR"}: ${m.content}`)
            .join("\n");

          // Extract objections via AI
          const response = await callOpenAI(
            tenant.id,
            "intelligence_analysis",
            [
              {
                role: "user",
                content: `Analise esta conversa de vendas e extraia APENAS objeções claras levantadas pelo lead.
Uma objeção é uma resistência explícita à compra/contato (ex: "Já temos sistema", "Não temos orçamento agora", "Não tenho interesse").
Não inclua perguntas ou curiosidades como objeções.

Conversa:
${conversation}

Retorne JSON: { "objecoes": [{ "objecao": "texto normalizado", "contexto": "trecho relevante" }] }
Se não houver objeções, retorne: { "objecoes": [] }
Retorne APENAS JSON.`,
              },
            ],
            { model: "gpt-4o-mini", responseFormat: { type: "json_object" }, temperature: 0.1 },
          );

          const parsed = JSON.parse(response.content ?? "{}") as {
            objecoes: Array<{ objecao: string; contexto: string }>;
          };

          for (const obj of parsed.objecoes ?? []) {
            if (!obj.objecao) continue;

            // Check if this objection already exists for this segment
            const [existing] = await db
              .select()
              .from(prospectingObjectionsTable)
              .where(
                and(
                  eq(prospectingObjectionsTable.segmento, segmento),
                  sql`lower(${prospectingObjectionsTable.objecao}) = lower(${obj.objecao})`,
                ),
              )
              .limit(1);

            if (existing) {
              await db
                .update(prospectingObjectionsTable)
                .set({
                  frequencia: existing.frequencia + 1,
                  updatedAt: new Date(),
                })
                .where(eq(prospectingObjectionsTable.id, existing.id));
            } else {
              await db.insert(prospectingObjectionsTable).values({
                segmento,
                objecao: obj.objecao,
                frequencia: 1,
                respostas: [],
              });
            }
            totalExtracted++;
          }

          // Update conversion rate for existing winning responses
          if (desfecho !== "indeterminado") {
            const objections = await db
              .select()
              .from(prospectingObjectionsTable)
              .where(eq(prospectingObjectionsTable.segmento, segmento));

            for (const objRow of objections) {
              const respostas = (objRow.respostas ?? []) as Array<{
                texto: string;
                usos: number;
                conversoes: number;
              }>;
              if (respostas.length === 0) continue;

              // Find best response by conversion rate
              const sorted = respostas
                .filter((r) => r.usos > 0)
                .sort((a, b) => b.conversoes / b.usos - a.conversoes / a.usos);

              if (sorted.length === 0) continue;
              const taxaConversao = sorted[0]!.usos > 0
                ? (sorted[0]!.conversoes / sorted[0]!.usos) * 100
                : null;

              if (taxaConversao !== null) {
                await db
                  .update(prospectingObjectionsTable)
                  .set({
                    taxaConversao: String(taxaConversao.toFixed(2)),
                    updatedAt: new Date(),
                  })
                  .where(eq(prospectingObjectionsTable.id, objRow.id));
              }
            }
          }
        } catch (err) {
          log.error({ err, convId: conv.id, tenantId: tenant.id }, "objections-extraction: conversation failed (non-fatal)");
        }
      }
    } catch (err) {
      log.error({ err, tenantId: tenant.id }, "objections-extraction: tenant failed (non-fatal)");
    }
  }

  log.info({ totalExtracted }, "objections-extraction: complete");
}
