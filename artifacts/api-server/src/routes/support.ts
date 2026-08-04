import { Router } from "express";
import { db, bugReportsTable, relatosTecnicosTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { getOpenAIForTenant } from "../lib/agent-engine.js";
import { z } from "zod/v4";

const router = Router();

const SUPPORT_SYSTEM_PROMPT = `Você é o assistente de suporte do Vendor.ai — um CRM com IA para vendas e atendimento.

## Sua função
Responder dúvidas de uso, configuração e integrações do Vendor.ai. Quando o usuário descrever um problema ou bug, você os ajuda a documentar e registrar um chamado.

## Sobre o Vendor.ai
- CRM multitenante com agentes de IA (SDR, Closer, Reativação, Onboarding, CS)
- Integrações: WhatsApp (Meta Cloud API), Instagram DMs e comentários, Google Agenda
- Módulos: Pipeline de vendas, Leads, Conversas, Análise de inteligência de clientes, Agendamentos, Propostas, Campanhas, Prospecção IA, Analytics
- Verticais: Construção/Reforma (Arch), Clínica, Salão de Beleza, Varejo, Supermercado
- Planos com limites de tokens, mensagens e módulos por tenant

## Quando o usuário descrever um bug, problema ou sugestão

Colete sistematicamente:
1. **O que aconteceu** — descrição do comportamento observado
2. **Em qual tela/rota** — ex: "Tela de Leads", "/leads", "configuração de agente"
3. **O que era esperado** — o comportamento correto
4. **Mensagem de erro** (se houver) — texto exato do erro

Após coletar todas as informações, informe ao usuário que está registrando o chamado. Classifique automaticamente:
- **categoria**: "bug" (algo não funciona), "duvida" (como usar), "sugestao" (melhoria)
- **prioridade**: "critica" (sistema inutilizável), "alta" (funcionalidade importante travada), "media" (workaround existe), "baixa" (cosmético/sugestão)

Ao registrar, inclua EXATAMENTE ao final da sua resposta (nunca antes, nunca dentro do texto visível):
<!--VENDORAI_REPORT:{"titulo":"...","descricao":"...","categoria":"bug|duvida|sugestao","prioridade":"baixa|media|alta|critica","rotaAfetada":"...ou null"}-->

## Regras
- Responda SEMPRE em português brasileiro
- Seja direto, empático e conciso
- Nunca peça informações que já foram fornecidas
- Máximo 1 pergunta de cada vez para coletar informações
- Se for uma dúvida simples, responda diretamente sem burocracia de chamado
- Só registre chamado quando o usuário descrever um problema concreto ou pedir explicitamente`;

const reportMarkerRegex =
  /<!--VENDORAI_REPORT:([\s\S]*?)-->/;

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
});

const chatBodySchema = z.object({
  messages: z.array(messageSchema).min(1).max(100),
  // Gerado uma vez no front quando o widget abre, mesmo id em toda a
  // conversa — usado pra agrupar as mensagens num único relato técnico
  // em vez de criar um registro por turno.
  conversationId: z.string().uuid().optional(),
});

router.post("/support/chat", async (req, res) => {
  const parsed = chatBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Payload inválido" });
  }

  const tenantId = req.user?.tenantId ?? null;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const flush = () => { if (typeof (res as any).flush === "function") (res as any).flush(); };

  let fullResponse = "";

  try {
    try {
      const stream = anthropic.messages.stream({
        model: "claude-sonnet-4-6",
        max_tokens: 8192,
        system: SUPPORT_SYSTEM_PROMPT,
        messages: parsed.data.messages,
      });

      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          fullResponse += event.delta.text;
          const visibleChunk = event.delta.text.replace(reportMarkerRegex, "");
          if (visibleChunk) {
            res.write(`data: ${JSON.stringify({ content: visibleChunk })}\n\n`);
            flush();
          }
        }
      }
    } catch (anthropicErr) {
      // Se a Anthropic falhou (ex: billing) ANTES de mandar qualquer chunk,
      // cai pro OpenAI em vez de quebrar o chat de suporte inteiro. Se já
      // tinha mandado parte da resposta, não dá pra reiniciar sem duplicar
      // texto na tela — nesse caso sobe o erro mesmo.
      if (fullResponse !== "") throw anthropicErr;
      req.log?.warn({ err: anthropicErr }, "support: anthropic falhou, caindo pro OpenAI");

      const openai = await getOpenAIForTenant(tenantId ?? "");
      const openaiStream = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 8192,
        stream: true,
        messages: [
          { role: "system", content: SUPPORT_SYSTEM_PROMPT },
          ...parsed.data.messages,
        ],
      });

      for await (const chunk of openaiStream) {
        const delta = chunk.choices[0]?.delta?.content ?? "";
        if (!delta) continue;
        fullResponse += delta;
        const visibleChunk = delta.replace(reportMarkerRegex, "");
        if (visibleChunk) {
          res.write(`data: ${JSON.stringify({ content: visibleChunk })}\n\n`);
          flush();
        }
      }
    }

    const match = reportMarkerRegex.exec(fullResponse);
    let bugReportId: string | null = null;
    let protocolo: string | null = null;

    if (match && match[1]) {
      try {
        const reportData = JSON.parse(match[1].trim()) as {
          titulo: string;
          descricao: string;
          categoria: "bug" | "duvida" | "sugestao";
          prioridade: "baixa" | "media" | "alta" | "critica";
          rotaAfetada?: string | null;
        };

        if (tenantId) {
          const [created] = await db
            .insert(bugReportsTable)
            .values({
              tenantId,
              titulo: reportData.titulo ?? "Chamado de suporte",
              descricao: reportData.descricao ?? "",
              categoria: reportData.categoria ?? "bug",
              prioridade: reportData.prioridade ?? "media",
              rotaAfetada: reportData.rotaAfetada ?? null,
              erroTecnico: null,
              stackTrace: null,
            })
            .returning({ id: bugReportsTable.id });

          bugReportId = created?.id ?? null;
          if (bugReportId) {
            protocolo = `#${bugReportId.substring(0, 8).toUpperCase()}`;
          }
        }
      } catch {
        req.log?.warn({ err: "report_parse_failed" }, "support: failed to parse report marker");
      }
    }

    // Registro em relatos_tecnicos — TODA interação com o Suporte, não só
    // quando vira chamado formal em bug_reports. Um relato por conversa
    // (upsert por conversationId), não um por mensagem.
    try {
      if (tenantId && parsed.data.conversationId) {
        const conversationId = parsed.data.conversationId;
        const userId = req.user?.sub ?? null;
        const visibleResponse = fullResponse.replace(reportMarkerRegex, "").trim();
        const transcript =
          parsed.data.messages.map((m) => `${m.role === "user" ? "Usuário" : "Suporte"}: ${m.content}`).join("\n\n") +
          (visibleResponse ? `\n\nSuporte: ${visibleResponse}` : "");
        const primeiraMensagem = parsed.data.messages.find((m) => m.role === "user")?.content ?? "Conversa com o Suporte";
        const titulo = primeiraMensagem.length > 80 ? primeiraMensagem.slice(0, 77) + "..." : primeiraMensagem;

        const [existente] = await db.select({ id: relatosTecnicosTable.id })
          .from(relatosTecnicosTable)
          .where(and(eq(relatosTecnicosTable.conversationId, conversationId), eq(relatosTecnicosTable.tenantId, tenantId)));

        if (existente) {
          await db.update(relatosTecnicosTable)
            .set({ transcriptRelevante: transcript })
            .where(eq(relatosTecnicosTable.id, existente.id));
        } else {
          await db.insert(relatosTecnicosTable).values({
            tenantId,
            conversationId,
            usuarioId: userId,
            titulo,
            descricaoProblema: titulo,
            transcriptRelevante: transcript,
            status: "pendente_revisao",
          });
        }
      }
    } catch (err) {
      req.log?.warn({ err }, "support: falha ao registrar relato técnico da conversa (não bloqueia)");
    }

    res.write(
      `data: ${JSON.stringify({ done: true, bugReportId, protocolo })}\n\n`,
    );
    res.end();
  } catch (err) {
    req.log?.error({ err }, "support: claude stream error");
    res.write(`data: ${JSON.stringify({ error: "Erro ao processar resposta" })}\n\n`);
    res.end();
  }

  return;
});

export default router;
