import { and, asc, desc, eq, isNull, lte } from "drizzle-orm";
import {
  db,
  prospectInteractionsTable,
  prospectsTable,
  prospectorConfigTable,
} from "@workspace/db";
import type { Logger } from "pino";
import { callOpenAI } from "../lib/ai-gateway.js";
import { sendProspectOutreach } from "../services/prospect-outreach.js";
import { resolveColdProspectingConfig } from "../services/cold-prospecting-config.js";

function chooseChannel(
  prospect: typeof prospectsTable.$inferSelect,
  allowed: string[],
): "whatsapp" | "email" | null {
  if (prospect.phone && allowed.includes("whatsapp")) return "whatsapp";
  if (prospect.email && allowed.includes("email")) return "email";
  return null;
}

async function draftProspectMessage(input: {
  tenantId: string;
  prospect: typeof prospectsTable.$inferSelect;
  channel: "whatsapp" | "email";
  history: Array<typeof prospectInteractionsTable.$inferSelect>;
}) {
  const p = input.prospect;
  const recent = input.history.slice(-8).map((h) =>
    `${h.direction === "inbound" ? "PROSPECT" : h.direction === "outbound" ? "VENDI" : "SISTEMA"}: ${h.content ?? h.reason ?? ""}`
  ).join("\n");

  const ai = await callOpenAI(input.tenantId, "agent_service", [
    {
      role: "system",
      content: `Você é o Vendi em PROSPECÇÃO FRIA B2B.
Escreva UMA mensagem curta, natural e contextual para o próximo passo.
Regras:
- Primeiro contato com recepção/gatekeeper busca o responsável; não faz pitch.
- Não despeje funcionalidades.
- Só mencione dor confirmada como fato; hipóteses devem virar pergunta.
- Não invente nome, cargo, cliente, resultado, preço ou capacidade.
- Se já houver responsável, investigue o processo antes de vender.
- Se houver dor confirmada, conecte brevemente a solução ao problema.
- Se houver interesse em reunião mas sem horário, peça uma janela/horário.
- Respeite "não contatar".
- WhatsApp: máximo 4 frases curtas.
- E-mail: assunto separado na primeira linha como "ASSUNTO: ...", depois corpo.
Responda somente o texto final.`,
    },
    {
      role: "user",
      content: [
        `Empresa: ${p.displayName ?? "não identificada"}`,
        `Segmento: ${p.segment ?? "não informado"}`,
        `Estado: ${p.currentState ?? ""}`,
        `Objetivo: ${p.currentObjective ?? ""}`,
        `Próxima ação: ${p.nextBestAction ?? ""}`,
        `Motivo: ${p.nextBestActionReason ?? ""}`,
        `Gancho autorizado: ${p.primaryHook ?? "diagnostico"}`,
        p.qualification?.confirmedPains?.length ? `Dores confirmadas: ${p.qualification.confirmedPains.join("; ")}` : "Dores confirmadas: nenhuma",
        p.qualification?.inferredPains?.length ? `Hipóteses: ${p.qualification.inferredPains.join("; ")}` : "",
        recent ? `Histórico recente:\n${recent}` : "Sem histórico anterior.",
      ].filter(Boolean).join("\n"),
    },
  ], { maxTokens: 350 });

  const raw = ai.content.trim();
  if (input.channel === "email" && raw.startsWith("ASSUNTO:")) {
    const [first, ...rest] = raw.split("\n");
    return { subject: first!.replace(/^ASSUNTO:\s*/i, "").trim(), content: rest.join("\n").trim() };
  }
  return { subject: input.channel === "email" ? "Contato" : null, content: raw };
}

export async function runColdProspectFollowup(log: Logger) {
  const tenantRows = await db.selectDistinct({ tenantId: prospectorConfigTable.tenantId })
    .from(prospectorConfigTable)
    .where(eq(prospectorConfigTable.coldProspectingMode, "autonomous"));

  const summary = { tenants: tenantRows.length, checked: 0, sent: 0, closedNoContact: 0, skipped: 0, failed: 0 };
  const now = new Date();

  for (const row of tenantRows) {
    const runtime = await resolveColdProspectingConfig(row.tenantId);
    const due = await db.select().from(prospectsTable).where(and(
      eq(prospectsTable.tenantId, row.tenantId),
      isNull(prospectsTable.convertedAt),
      lte(prospectsTable.nextActionAt, now),
    )).orderBy(asc(prospectsTable.nextActionAt)).limit(100);

    for (const prospect of due) {
      summary.checked++;
      try {
        if (["nao_contatar","sem_aderencia","reuniao_agendada","qualificado"].includes(prospect.stage)) {
          summary.skipped++;
          continue;
        }

        const history = await db.select().from(prospectInteractionsTable).where(and(
          eq(prospectInteractionsTable.tenantId, row.tenantId),
          eq(prospectInteractionsTable.prospectId, prospect.id),
        )).orderBy(asc(prospectInteractionsTable.occurredAt));

        const outbound = history.filter((h) => h.direction === "outbound" && h.status !== "failed" && h.status !== "skipped");
        const inbound = history.filter((h) => h.direction === "inbound");
        const lastOutbound = outbound.at(-1);
        const lastInbound = inbound.at(-1);
        const repliedAfterLastOutbound = Boolean(
          lastInbound && (!lastOutbound || lastInbound.occurredAt > lastOutbound.occurredAt),
        );

        if (!repliedAfterLastOutbound && outbound.length >= 5) {
          await db.update(prospectsTable).set({
            stage: "sem_contato",
            currentState: "Cadência encerrada sem resposta",
            currentObjective: "Preservar histórico e evitar excesso de contato",
            nextBestAction: "Aguardar novo sinal ou reclassificação para aquecimento",
            nextBestActionReason: "Limite da cadência fria atingido sem resposta.",
            nextActionAt: null,
            updatedAt: now,
          }).where(eq(prospectsTable.id, prospect.id));
          summary.closedNoContact++;
          continue;
        }

        const channel = chooseChannel(prospect, runtime.allowedChannels);
        if (!channel) {
          await db.update(prospectsTable).set({
            stage: "sem_contato",
            currentState: "Sem canal permitido disponível",
            currentObjective: "Encontrar canal válido",
            nextBestAction: "Enriquecer telefone ou e-mail antes de nova tentativa",
            nextBestActionReason: "Nenhum canal permitido possui dado de contato.",
            nextActionAt: null,
            updatedAt: now,
          }).where(eq(prospectsTable.id, prospect.id));
          summary.skipped++;
          continue;
        }

        const draft = await draftProspectMessage({ tenantId: row.tenantId, prospect, channel, history });
        if (!draft.content) {
          summary.skipped++;
          continue;
        }

        await sendProspectOutreach({
          tenantId: row.tenantId,
          prospectId: prospect.id,
          channel,
          content: draft.content,
          subject: draft.subject,
          autonomous: true,
          objective: prospect.currentObjective,
          reason: prospect.nextBestActionReason,
          log,
        });

        const attempt = outbound.length + 1;
        const days = attempt <= 1 ? 2 : attempt === 2 ? 3 : attempt === 3 ? 4 : 5;
        await db.update(prospectsTable).set({
          nextActionAt: new Date(now.getTime() + days * 24 * 60 * 60 * 1000),
          updatedAt: new Date(),
        }).where(eq(prospectsTable.id, prospect.id));
        summary.sent++;
      } catch (error) {
        const code = error instanceof Error ? error.message : "unknown";
        if (["outside_contact_window","contact_limit_reached","channel_not_allowed"].includes(code)) {
          summary.skipped++;
          continue;
        }
        summary.failed++;
        log.warn({ error, tenantId: row.tenantId, prospectId: prospect.id }, "cold-prospect-followup: prospect failed");
      }
    }
  }

  log.info(summary, "cold-prospect-followup: complete");
  return summary;
}
