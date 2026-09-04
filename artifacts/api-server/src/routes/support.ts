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
- Se for uma dúvida simples, responda diretamente; o sistema registrará o atendimento como resolvido pelo agente
- Use o marcador somente quando houver problema, sugestão ou necessidade de acompanhamento humano`;

const reportMarkerRegex = /<!--VENDORAI_REPORT:([\s\S]*?)-->/;

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
});

const chatBodySchema = z.object({
  messages: z.array(messageSchema).min(1).max(100),
  conversationId: z.string().uuid().optional(),
});

const devGithubTaskSchema = z.object({
  requestId: z.string().uuid(),
  title: z.string().min(3).max(120),
  request: z.string().min(3).max(8000),
  diagnosis: z.string().min(1).max(16000),
  route: z.string().min(1).max(500),
});

router.post("/support/dev/github-task", async (req, res) => {
  if (req.user?.platformRole !== "super_admin") {
    return res.status(403).json({ error: "Somente Super Admin pode criar tarefas técnicas." });
  }

  const parsed = devGithubTaskSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Payload inválido" });

  const token =
    process.env["GITHUB_DEV_TOKEN"] ??
    process.env["GITHUB_PERSONAL_ACCESS_TOKEN"] ??
    process.env["GITHUB_TOKEN"];
  const repository = process.env["GITHUB_DEV_REPOSITORY"] ?? "casaforteicf/vendorai-platform-replit";
  if (!token) {
    return res.status(503).json({
      error: "Integração GitHub do Dev IA ainda não configurada no backend.",
      code: "GITHUB_DEV_TOKEN_MISSING",
    });
  }

  const { requestId, title, request, diagnosis, route } = parsed.data;
  const body = [
    "## Pedido do Super Admin",
    request,
    "",
    "## Contexto",
    `- Rota: \`${route}\``,
    `- Dev IA requestId: \`${requestId}\``,
    "- Origem: Dev IA residente do VendorAI",
    "",
    "## Diagnóstico do Dev IA",
    diagnosis,
    "",
    "## Regras de execução",
    "- preservar o fluxo existente e evitar módulo paralelo;",
    "- fazer a menor alteração possível;",
    "- criar branch/PR, nunca alterar `main` diretamente;",
    "- executar testes aplicáveis;",
    "- não marcar como concluído sem evidência de teste/deploy;",
    "- mudanças destrutivas, autenticação, financeiro, banco crítico, permissões globais ou infraestrutura exigem aprovação explícita do Super Admin.",
  ].join("\n");

  try {
    const gh = await fetch(`https://api.github.com/repos/${repository}/issues`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "VendorAI-Dev-Agent/1.0",
      },
      body: JSON.stringify({ title: `[Dev IA] ${title}`, body }),
    });

    const data = await gh.json() as { number?: number; html_url?: string; message?: string };
    if (!gh.ok || !data.number || !data.html_url) {
      req.log?.warn({ status: gh.status, data }, "dev-ia: GitHub issue creation failed");
      return res.status(502).json({ error: data.message ?? "Falha ao criar tarefa no GitHub" });
    }

    return res.status(201).json({
      success: true,
      issueNumber: data.number,
      issueUrl: data.html_url,
      repository,
      status: "github_task_created",
    });
  } catch (err) {
    req.log?.error({ err }, "dev-ia: GitHub task request failed");
    return res.status(502).json({ error: "Não foi possível conectar ao GitHub." });
  }
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
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          fullResponse += event.delta.text;
          const visibleChunk = event.delta.text.replace(reportMarkerRegex, "");
          if (visibleChunk) {
            res.write(`data: ${JSON.stringify({ content: visibleChunk })}\n\n`);
            flush();
          }
        }
      }
    } catch (anthropicErr) {
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
    const visibleResponse = fullResponse.replace(reportMarkerRegex, "").trim();
    let bugReportId: string | null = null;
    let protocolo: string | null = null;
    let atendimentoStatus: "aberto" | "em_analise" | "resolvido" = "resolvido";
    let resolvidoPor: "agente" | "humano" | null = "agente";

    try {
      if (tenantId) {
        const primeiraMensagem = parsed.data.messages.find((m) => m.role === "user")?.content ?? "Conversa com o Suporte";
        const tituloPadrao = primeiraMensagem.length > 80 ? primeiraMensagem.slice(0, 77) + "..." : primeiraMensagem;
        let reportData: {
          titulo: string;
          descricao: string;
          categoria: "bug" | "duvida" | "sugestao";
          prioridade: "baixa" | "media" | "alta" | "critica";
          rotaAfetada?: string | null;
        } = {
          titulo: tituloPadrao,
          descricao: primeiraMensagem,
          categoria: "duvida",
          prioridade: "baixa",
          rotaAfetada: null,
        };

        if (match?.[1]) {
          reportData = { ...reportData, ...JSON.parse(match[1].trim()) };
          atendimentoStatus = "aberto";
          resolvidoPor = null;
        }

        const conversationId = parsed.data.conversationId ?? null;
        const [existing] = conversationId
          ? await db.select().from(bugReportsTable).where(and(
              eq(bugReportsTable.tenantId, tenantId),
              eq(bugReportsTable.conversationId, conversationId),
            )).limit(1)
          : [];

        if (existing && existing.status !== "resolvido" && !match) {
          atendimentoStatus = existing.status;
          resolvidoPor = existing.resolvidoPor as "agente" | "humano" | null;
        }

        const values = {
          tenantId,
          conversationId,
          titulo: reportData.titulo || tituloPadrao,
          descricao: reportData.descricao || primeiraMensagem,
          categoria: reportData.categoria || "duvida",
          prioridade: reportData.prioridade || "baixa",
          rotaAfetada: reportData.rotaAfetada ?? null,
          erroTecnico: null,
          stackTrace: null,
          status: atendimentoStatus,
          respostaSuporte: visibleResponse || null,
          resolvidoPor,
          resolvidoAt: atendimentoStatus === "resolvido" ? new Date() : null,
          updatedAt: new Date(),
        } as const;

        let saved;
        if (existing) {
          [saved] = await db.update(bugReportsTable)
            .set(values as any)
            .where(eq(bugReportsTable.id, existing.id))
            .returning();
        } else {
          [saved] = await db.insert(bugReportsTable).values(values as any).returning();
        }

        bugReportId = saved?.id ?? null;
        atendimentoStatus = saved?.status ?? atendimentoStatus;
        resolvidoPor = (saved?.resolvidoPor as "agente" | "humano" | null) ?? resolvidoPor;
        if (bugReportId) protocolo = `#${bugReportId.substring(0, 8).toUpperCase()}`;
      }
    } catch (err) {
      req.log?.warn({ err }, "support: falha ao registrar atendimento");
    }

    try {
      if (tenantId && parsed.data.conversationId) {
        const conversationId = parsed.data.conversationId;
        const userId = req.user?.sub ?? null;
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

    res.write(`data: ${JSON.stringify({ done: true, bugReportId, protocolo, status: atendimentoStatus, resolvidoPor })}\n\n`);
    res.end();
  } catch (err) {
    req.log?.error({ err }, "support: claude stream error");
    res.write(`data: ${JSON.stringify({ error: "Erro ao processar resposta" })}\n\n`);
    res.end();
  }

  return;
});

export default router;
