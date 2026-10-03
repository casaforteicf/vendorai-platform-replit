import { Router } from "express";
import multer from "multer";
import { db, bugReportsTable, relatosTecnicosTable, tenantsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { getOpenAIForTenant } from "../lib/agent-engine.js";
import { loadJarvisOperationalContext } from "../services/jarvis-operational-context.js";
import { buildJarvisCapabilityContext, JARVIS_UNIVERSAL_PROFILE } from "../services/jarvis-capability-profile.js";
import { executeJarvisProvider } from "../services/jarvis-provider-registry.js";
import { interpretJarvisUpload } from "../services/jarvis-document-provider.js";
import { loadJarvisRequestContext } from "../services/jarvis-request-context.js";
import { z } from "zod/v4";

const router = Router();
const jarvisUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
});

const SUPPORT_SYSTEM_PROMPT = `Você é o JARVIS, o Agente Mestre do VendorAI — um CRM com IA para vendas, atendimento, marketing e gestão.

## Sua função
Ser a camada única de interação do usuário com o VendorAI. Responda dúvidas de uso, configuração e integrações, use o contexto real da tela e, quando houver estado operacional do tenant, interprete prioridades, mudanças, riscos, oportunidades e aprovações pendentes. Quando o usuário descrever um problema ou bug, ajude a diagnosticar, documentar e registrar um chamado.

## Sobre o VendorAI
- CRM multitenante com agentes de IA (SDR, Closer, Reativação, Onboarding, CS e demais agentes especializados)
- Integrações: WhatsApp (Meta Cloud API), Instagram DMs e comentários, Google Agenda
- Módulos: Pipeline de vendas, Leads, Conversas, Análise de inteligência de clientes, Agendamentos, Propostas, Campanhas, Prospecção IA, Analytics
- Verticais: Construção/Reforma (Arch), Clínica, Salão de Beleza, Varejo, Supermercado e demais segmentos configurados por tenant
- Planos com limites de tokens, mensagens e módulos por tenant

## Contexto da interface
Quando receber um bloco "Contexto atual do VendorAI", trate rota e título como evidência confiável sobre a tela em que o usuário está.
- Se o usuário disser "aqui", "esta tela", "isso", "esse campo" ou equivalentes, use esse contexto antes de pedir esclarecimentos.
- Não invente registro, cliente, campanha, proposta ou campo que não tenha sido enviado no contexto.
- Se a rota for suficiente para responder, não pergunte novamente em qual tela o usuário está.

## Estado operacional do tenant
Quando receber um bloco "Estado operacional real do tenant", ele vem de dados persistidos e tenant-scoped do VendorAI.
- Use Casos Vendor para responder "o que mudou?", "o que é prioridade?", riscos, oportunidades e recomendações.
- Use aprovações pendentes somente para informar o que está aguardando decisão.
- Diferencie fato, detecção e hipótese. Ausência de dados não prova ausência de risco/oportunidade.
- Nunca invente impacto financeiro, confiança, resultado ou execução que não esteja presente nos dados.
- O contexto é somente leitura: não afirme que aprovou, enviou, publicou, alterou ou executou algo sem uma rota de ação realmente ter sido chamada e concluída.

## Quando o usuário descrever um bug, problema ou sugestão
Colete sistematicamente:
1. O que aconteceu
2. Em qual tela/rota
3. O que era esperado
4. Mensagem de erro, se houver

Após coletar as informações, classifique automaticamente categoria, prioridade e abrangência da mudança.

## Classificação de abrangência
- tenant: preferência, regra, nomenclatura, automação ou processo exclusivo daquela empresa.
- vertical: necessidade reutilizável por empresas da mesma vertical/segmento.
- global_opcional: recurso útil de forma ampla, mas que deve poder ser ativado/configurado por tenant.
- global: comportamento estrutural essencial da plataforma e seguro como padrão geral.
- bug: defeito que deve ser investigado no nível real em que ocorre; não trate automaticamente como personalização.
Quando houver dúvida, escolha o menor escopo reutilizável e explique o motivo. Nunca promova uma solicitação de tenant diretamente para global só porque foi solicitada uma vez.

Ao registrar, inclua EXATAMENTE ao final da sua resposta:
<!--VENDORAI_REPORT:{"titulo":"...","descricao":"...","categoria":"bug|duvida|sugestao","prioridade":"baixa|media|alta|critica","rotaAfetada":"...ou null","escopoSugerido":"tenant|vertical|global_opcional|global|bug","motivoEscopo":"..."}-->

## Regras
- Responda sempre em português brasileiro
- Seja direto e conciso
- Nunca peça informações já fornecidas
- Máximo 1 pergunta por vez
- Use o marcador somente quando houver problema, sugestão ou necessidade de acompanhamento humano`;

const DEV_AGENT_SYSTEM_PROMPT = `Você é o Dev IA residente da plataforma VendorAI e atua exclusivamente para o Super Admin como engenheiro de software responsável pela plataforma.

## Missão
Receber bugs, melhorias, novas funções, auditorias e dúvidas técnicas em linguagem natural e transformar cada pedido em diagnóstico técnico claro, seguro e rastreável.

## Regras permanentes
- Responda sempre em português brasileiro.
- Preserve arquitetura e fluxos existentes.
- Não crie módulos paralelos sem necessidade.
- Antes de propor alteração, diagnostique causa provável, impacto e menor correção segura.
- Quando o usuário disser "esta tela", "aqui" ou "isso", use a rota enviada no contexto.
- Diferencie explicitamente: diagnóstico, mudança proposta, risco, testes necessários e evidência de conclusão.
- Nunca afirme que código foi alterado, testado, publicado ou validado se isso não tiver acontecido de fato.
- Mudanças destrutivas, financeiras, autenticação, exclusão de dados, migrações críticas, permissões globais, segredos, infraestrutura ou rollback exigem aprovação explícita do Super Admin.
- Nunca revele chaves, tokens, secrets ou credenciais.
- Nunca instrua alteração direta da main; prefira branch, PR, testes e validação.
- Priorize mudanças pequenas, reversíveis e observáveis.

## Formato preferencial
Quando houver um problema técnico, organize a resposta em:
1. Diagnóstico
2. Causa provável
3. Correção mínima
4. Risco
5. Validação necessária

Você não é o assistente de suporte ao cliente. Você é o agente de engenharia da plataforma.`;

const reportMarkerRegex = /<!--VENDORAI_REPORT:([\s\S]*?)-->/;

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
});

const contextSchema = z.object({
  route: z.string().min(1).max(500).optional(),
  title: z.string().min(1).max(500).optional(),
}).optional();

const attachmentSchema = z.object({
  name: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(160),
  content: z.string().min(1).max(16000),
});

const chatBodySchema = z.object({
  messages: z.array(messageSchema).min(1).max(100),
  conversationId: z.string().uuid().optional(),
  context: contextSchema,
  attachments: z.array(attachmentSchema).max(3).optional(),
});

const externalSupportSchema = z.object({
  channel: z.enum(["whatsapp", "instagram", "email", "form", "other"]),
  text: z.string().trim().min(2).max(12000),
  senderPhone: z.string().trim().max(80).optional().nullable(),
  senderEmail: z.string().email().optional().nullable(),
  senderName: z.string().trim().max(180).optional().nullable(),
  sourceMessageId: z.string().trim().max(220).optional().nullable(),
  provider: z.string().trim().max(120).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
});

const devGithubTaskSchema = z.object({
  requestId: z.string().uuid(),
  title: z.string().min(3).max(120),
  request: z.string().min(3).max(8000),
  diagnosis: z.string().min(1).max(16000),
  route: z.string().min(1).max(500),
});

function buildJarvisSystemPrompt(
  context?: { route?: string; title?: string },
  operationalContext = "",
  capabilityContext = "",
  requestContext = "",
) {
  const route = context?.route?.trim();
  const title = context?.title?.trim();

  const contextLines = [
    route || title ? "" : null,
    route || title ? "## Contexto atual do VendorAI" : null,
    route ? `- Rota atual: ${route}` : null,
    title ? `- Título atual: ${title}` : null,
    route || title
      ? "Use esse contexto apenas para compreender a interface atual. Não o trate como autorização para ações sensíveis."
      : null,
  ].filter(Boolean).join("\n");

  return [SUPPORT_SYSTEM_PROMPT, JARVIS_UNIVERSAL_PROFILE, requestContext, capabilityContext, contextLines, operationalContext]
    .filter(Boolean)
    .join("\n");
}

function normalizePhone(value: string | null | undefined) {
  return String(value ?? "").replace(/\D/g, "");
}

async function resolveExternalSupportTenant(input: {
  senderPhone?: string | null;
  senderEmail?: string | null;
}) {
  const phone = normalizePhone(input.senderPhone);
  const email = String(input.senderEmail ?? "").trim().toLowerCase();

  const rows = await db
    .select({
      userId: usersTable.id,
      userName: usersTable.name,
      userEmail: usersTable.email,
      userPhone: usersTable.telefone,
      tenantId: usersTable.tenantId,
      platformRole: usersTable.platformRole,
      active: usersTable.active,
      tenantName: tenantsTable.name,
      tenantSlug: tenantsTable.slug,
      vertical: tenantsTable.vertical,
      verticalSecundaria: tenantsTable.verticalSecundaria,
      planId: tenantsTable.planId,
    })
    .from(usersTable)
    .innerJoin(tenantsTable, eq(usersTable.tenantId, tenantsTable.id));

  const matches = rows.filter((row) => {
    if (!row.active) return false;
    const emailMatch = email && row.userEmail.trim().toLowerCase() === email;
    const rowPhone = normalizePhone(row.userPhone);
    const phoneMatch = phone && rowPhone && (
      rowPhone === phone ||
      (Math.min(rowPhone.length, phone.length) >= 10 && (rowPhone.endsWith(phone) || phone.endsWith(rowPhone)))
    );
    return Boolean(emailMatch || phoneMatch);
  });

  const uniqueTenants = new Map<string, typeof matches[number]>();
  for (const match of matches) {
    if (!uniqueTenants.has(match.tenantId)) uniqueTenants.set(match.tenantId, match);
  }
  return [...uniqueTenants.values()];
}

async function classifyExternalSupportRequest(tenantId: string, text: string) {
  const fallback = {
    categoria: "sugestao" as const,
    prioridade: "media" as const,
    titulo: text.length > 100 ? text.slice(0, 97) + "..." : text,
    descricao: text,
    escopoSugerido: "tenant" as const,
    motivoEscopo: "Solicitação externa classificada de forma conservadora até análise técnica.",
    precisaAcompanhamento: true,
  };

  try {
    const openai = await getOpenAIForTenant(tenantId);
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 700,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "Você classifica solicitações de suporte de usuários do VendorAI.",
            "Retorne JSON com: categoria (duvida|bug|sugestao), prioridade (baixa|media|alta|critica), titulo, descricao, escopoSugerido (tenant|vertical|global_opcional|global|bug), motivoEscopo, precisaAcompanhamento (boolean).",
            "Regras: dúvida simples não precisa acompanhamento técnico; bug e melhoria precisam.",
            "Preferência/regra específica da empresa => tenant. Processo comum ao segmento => vertical. Recurso amplo configurável => global_opcional. Comportamento estrutural essencial => global. Defeito => bug.",
            "Nunca promova para global apenas porque um único tenant pediu. Em dúvida, escolha o menor escopo reutilizável."
          ].join("\n"),
        },
        { role: "user", content: text },
      ],
    });
    const raw = JSON.parse(response.choices[0]?.message?.content ?? "{}") as Record<string, unknown>;
    const categoria = ["duvida", "bug", "sugestao"].includes(String(raw.categoria)) ? String(raw.categoria) : fallback.categoria;
    const prioridade = ["baixa", "media", "alta", "critica"].includes(String(raw.prioridade)) ? String(raw.prioridade) : fallback.prioridade;
    const escopo = ["tenant", "vertical", "global_opcional", "global", "bug"].includes(String(raw.escopoSugerido)) ? String(raw.escopoSugerido) : fallback.escopoSugerido;
    return {
      categoria: categoria as "duvida" | "bug" | "sugestao",
      prioridade: prioridade as "baixa" | "media" | "alta" | "critica",
      titulo: String(raw.titulo ?? fallback.titulo).slice(0, 255),
      descricao: String(raw.descricao ?? text).slice(0, 12000),
      escopoSugerido: escopo as "tenant" | "vertical" | "global_opcional" | "global" | "bug",
      motivoEscopo: String(raw.motivoEscopo ?? fallback.motivoEscopo).slice(0, 4000),
      precisaAcompanhamento: raw.precisaAcompanhamento !== false && categoria !== "duvida",
    };
  } catch {
    return fallback;
  }
}

function setSseHeaders(res: any) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
}

function flushSse(res: any) {
  if (typeof res.flush === "function") res.flush();
}

router.post("/support/dev/chat", async (req, res) => {
  if (req.user?.platformRole !== "super_admin") {
    return res.status(403).json({ error: "Somente Super Admin pode usar o Dev IA." });
  }

  const parsed = chatBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Payload inválido" });

  setSseHeaders(res);
  let fullResponse = "";

  try {
    try {
      const stream = anthropic.messages.stream({
        model: "claude-sonnet-4-6",
        max_tokens: 8192,
        system: DEV_AGENT_SYSTEM_PROMPT,
        messages: parsed.data.messages,
      });

      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          fullResponse += event.delta.text;
          res.write(`data: ${JSON.stringify({ content: event.delta.text })}\n\n`);
          flushSse(res);
        }
      }
    } catch (anthropicErr) {
      if (fullResponse) throw anthropicErr;
      req.log?.warn({ err: anthropicErr }, "dev-ia: anthropic falhou, caindo para OpenAI");

      const openai = await getOpenAIForTenant("");
      const stream = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 8192,
        stream: true,
        messages: [
          { role: "system", content: DEV_AGENT_SYSTEM_PROMPT },
          ...parsed.data.messages,
        ],
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content ?? "";
        if (!delta) continue;
        fullResponse += delta;
        res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
        flushSse(res);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true, status: "diagnosticado" })}\n\n`);
    res.end();
  } catch (err) {
    req.log?.error({ err }, "dev-ia: chat stream error");
    res.write(`data: ${JSON.stringify({ error: "Erro ao processar resposta do Dev IA" })}\n\n`);
    res.end();
  }

  return;
});

router.post("/support/dev/github-task", async (req, res) => {
  if (req.user?.platformRole !== "super_admin") {
    return res.status(403).json({ error: "Somente Super Admin pode criar tarefas técnicas." });
  }

  const parsed = devGithubTaskSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Payload inválido" });

  const token = process.env["GITHUB_DEV_TOKEN"] ?? process.env["GITHUB_PERSONAL_ACCESS_TOKEN"] ?? process.env["GITHUB_TOKEN"];
  const repository = process.env["GITHUB_DEV_REPOSITORY"] ?? "casaforteicf/vendorai-platform-replit";
  if (!token) {
    return res.status(503).json({ error: "Integração GitHub do Dev IA ainda não configurada no backend.", code: "GITHUB_DEV_TOKEN_MISSING" });
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
      req.log?.warn({ status: gh.status, message: data.message }, "dev-ia: GitHub issue creation failed");
      return res.status(502).json({ error: data.message ?? "Falha ao criar tarefa no GitHub" });
    }

    return res.status(201).json({ success: true, issueNumber: data.number, issueUrl: data.html_url, repository, status: "github_task_created" });
  } catch (err) {
    req.log?.error({ err }, "dev-ia: GitHub task request failed");
    return res.status(502).json({ error: "Não foi possível conectar ao GitHub." });
  }
});

router.post("/support/external/intake", async (req, res) => {
  const expectedSecret = process.env["SUPPORT_EXTERNAL_INGEST_SECRET"];
  const providedSecret = req.headers["x-vendorai-support-secret"];
  if (!expectedSecret || typeof providedSecret !== "string" || providedSecret !== expectedSecret) {
    return res.status(401).json({ error: "Canal de suporte externo não autorizado." });
  }

  const parsed = externalSupportSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: "Payload de suporte externo inválido." });

  const matches = await resolveExternalSupportTenant(parsed.data);
  if (matches.length === 0) {
    return res.status(202).json({
      status: "tenant_unresolved",
      needsTenantConfirmation: true,
      instruction: "Não foi possível identificar o tenant pelo remetente. Confirme a empresa antes de criar uma demanda.",
    });
  }
  if (matches.length > 1) {
    return res.status(202).json({
      status: "tenant_ambiguous",
      needsTenantConfirmation: true,
      tenantOptions: matches.map((item) => ({ tenantId: item.tenantId, tenantName: item.tenantName })),
      instruction: "O remetente está associado a mais de um tenant. Confirme qual empresa está solicitando antes de continuar.",
    });
  }

  const requester = matches[0];
  const classification = await classifyExternalSupportRequest(requester.tenantId, parsed.data.text);
  const snapshot = {
    tenantId: requester.tenantId,
    tenantName: requester.tenantName,
    tenantSlug: requester.tenantSlug,
    vertical: requester.vertical ?? null,
    verticalSecundaria: requester.verticalSecundaria ?? null,
    planId: requester.planId ?? null,
    userId: requester.userId,
    userName: requester.userName,
    platformRole: requester.platformRole,
    sourceChannel: parsed.data.channel,
    provider: parsed.data.provider ?? null,
    capturedAt: new Date().toISOString(),
  };

  if (!classification.precisaAcompanhamento) {
    return res.json({
      status: "answered_without_technical_demand",
      tenantId: requester.tenantId,
      tenantName: requester.tenantName,
      category: classification.categoria,
      suggestedReply: "A solicitação foi identificada como dúvida operacional e pode ser respondida pelo Agente de Suporte sem abrir melhoria técnica.",
    });
  }

  const [saved] = await db.insert(bugReportsTable).values({
    tenantId: requester.tenantId,
    titulo: classification.titulo,
    descricao: classification.descricao,
    categoria: classification.categoria,
    prioridade: classification.prioridade,
    status: "aberto",
    changeScope: classification.escopoSugerido,
    scopeReason: classification.motivoEscopo,
    tenantContextSnapshot: snapshot,
    sourceChannel: parsed.data.channel,
    sourceSender: parsed.data.senderEmail ?? parsed.data.senderPhone ?? parsed.data.senderName ?? null,
    sourceMessageId: parsed.data.sourceMessageId ?? null,
    respostaSuporte: "Solicitação recebida por canal externo, tenant identificado e encaminhada para análise técnica.",
  } as any).returning();

  return res.status(201).json({
    status: "technical_demand_created",
    bugReportId: saved?.id ?? null,
    protocol: saved?.id ? "#" + saved.id.substring(0, 8).toUpperCase() : null,
    tenantId: requester.tenantId,
    tenantName: requester.tenantName,
    category: classification.categoria,
    priority: classification.prioridade,
    changeScope: classification.escopoSugerido,
    scopeReason: classification.motivoEscopo,
  });
});

router.post("/support/file/interpret", jarvisUpload.single("file"), async (req, res) => {
  const tenantId = req.user?.tenantId ?? null;
  if (!tenantId) return res.status(403).json({ error: "Tenant não identificado." });
  if (!req.file) return res.status(400).json({ error: "Arquivo não enviado." });

  try {
    const content = await interpretJarvisUpload({
      tenantId,
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      fileName: req.file.originalname,
    });
    return res.json({
      name: req.file.originalname,
      mimeType: req.file.mimetype || "application/octet-stream",
      content,
    });
  } catch (err) {
    req.log?.warn({ err, fileName: req.file.originalname }, "jarvis: falha ao interpretar anexo");
    return res.status(415).json({
      error: err instanceof Error ? err.message : "Não foi possível interpretar o arquivo.",
    });
  }
});

router.post("/support/chat", async (req, res) => {
  const parsed = chatBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Payload inválido" });

  const tenantId = req.user?.tenantId ?? null;
  let operationalContext = "";
  let requestContext = "";
  let tenantSnapshot: Record<string, unknown> | null = null;
  if (tenantId) {
    try {
      const [tenantRows, loadedOperationalContext, loadedRequestContext] = await Promise.all([
        db.select({
          id: tenantsTable.id,
          name: tenantsTable.name,
          slug: tenantsTable.slug,
          vertical: tenantsTable.vertical,
          verticalSecundaria: tenantsTable.verticalSecundaria,
          planId: tenantsTable.planId,
        }).from(tenantsTable).where(eq(tenantsTable.id, tenantId)).limit(1),
        loadJarvisOperationalContext(tenantId),
        loadJarvisRequestContext({
          tenantId,
          userId: req.user?.sub ?? null,
          route: parsed.data.context?.route ?? null,
        }),
      ]);
      operationalContext = loadedOperationalContext;
      requestContext = loadedRequestContext;
      const tenant = tenantRows[0] ?? null;
      tenantSnapshot = {
        tenantId,
        tenantName: tenant?.name ?? null,
        tenantSlug: tenant?.slug ?? null,
        vertical: tenant?.vertical ?? null,
        verticalSecundaria: tenant?.verticalSecundaria ?? null,
        planId: tenant?.planId ?? null,
        userId: req.user?.sub ?? null,
        platformRole: req.user?.platformRole ?? null,
        route: parsed.data.context?.route ?? null,
        title: parsed.data.context?.title ?? null,
        capturedAt: new Date().toISOString(),
      };
    } catch (err) {
      req.log?.warn({ err, tenantId }, "jarvis: falha ao carregar contexto interno (não bloqueia chat)");
    }
  }

  const lastUserText = [...parsed.data.messages].reverse().find((message) => message.role === "user")?.content ?? "";
  let providerContext = "";
  try {
    const providerExecution = await executeJarvisProvider(lastUserText);
    providerContext = providerExecution.context;
    if (providerExecution.status !== "not_applicable") {
      req.log?.info(
        { provider: providerExecution.provider, status: providerExecution.status, family: providerExecution.family },
        "jarvis: provider executado",
      );
    }
  } catch (err) {
    req.log?.warn({ err }, "jarvis: falha no provider externo (não bloqueia chat)");
    providerContext = "## Providers reais\nA consulta externa necessária falhou. Não invente dados atuais; informe a indisponibilidade quando ela for relevante para a resposta.";
  }

  const attachmentContext = parsed.data.attachments?.length
    ? [
        "## Anexos interpretados nesta solicitação",
        "Use somente o conteúdo abaixo como evidência dos arquivos enviados. Se algo estiver ilegível ou ausente, diga isso explicitamente.",
        ...parsed.data.attachments.map((attachment) => `### ${attachment.name} (${attachment.mimeType})\n${attachment.content}`),
      ].join("\n")
    : "";

  const capabilityContext = [
    buildJarvisCapabilityContext(lastUserText),
    providerContext,
    attachmentContext,
  ].filter(Boolean).join("\n");
  const jarvisSystemPrompt = buildJarvisSystemPrompt(parsed.data.context, operationalContext, capabilityContext, requestContext);
  setSseHeaders(res);
  let fullResponse = "";

  try {
    try {
      const stream = anthropic.messages.stream({
        model: "claude-sonnet-4-6",
        max_tokens: 8192,
        system: jarvisSystemPrompt,
        messages: parsed.data.messages,
      });

      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          fullResponse += event.delta.text;
          const visibleChunk = event.delta.text.replace(reportMarkerRegex, "");
          if (visibleChunk) {
            res.write(`data: ${JSON.stringify({ content: visibleChunk })}\n\n`);
            flushSse(res);
          }
        }
      }
    } catch (anthropicErr) {
      if (fullResponse) throw anthropicErr;
      req.log?.warn({ err: anthropicErr }, "support: anthropic falhou, caindo pro OpenAI");

      const openai = await getOpenAIForTenant(tenantId ?? "");
      const stream = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 8192,
        stream: true,
        messages: [{ role: "system", content: jarvisSystemPrompt }, ...parsed.data.messages],
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content ?? "";
        if (!delta) continue;
        fullResponse += delta;
        const visibleChunk = delta.replace(reportMarkerRegex, "");
        if (visibleChunk) {
          res.write(`data: ${JSON.stringify({ content: visibleChunk })}\n\n`);
          flushSse(res);
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
        const primeiraMensagem = parsed.data.messages.find((m) => m.role === "user")?.content ?? "Conversa com o JARVIS";
        const tituloPadrao = primeiraMensagem.length > 80 ? primeiraMensagem.slice(0, 77) + "..." : primeiraMensagem;
        let reportData: {
          titulo: string;
          descricao: string;
          categoria: "bug" | "duvida" | "sugestao";
          prioridade: "baixa" | "media" | "alta" | "critica";
          rotaAfetada?: string | null;
          escopoSugerido?: "tenant" | "vertical" | "global_opcional" | "global" | "bug";
          motivoEscopo?: string | null;
        } = {
          titulo: tituloPadrao,
          descricao: primeiraMensagem,
          categoria: "duvida",
          prioridade: "baixa",
          rotaAfetada: parsed.data.context?.route ?? null,
          escopoSugerido: "tenant",
          motivoEscopo: "Escopo conservador até a solicitação ser classificada.",
        };

        if (match?.[1]) {
          reportData = { ...reportData, ...JSON.parse(match[1].trim()) };
          reportData.rotaAfetada = reportData.rotaAfetada ?? parsed.data.context?.route ?? null;
          atendimentoStatus = "aberto";
          resolvidoPor = null;
        }

        const conversationId = parsed.data.conversationId ?? null;
        const [existing] = conversationId
          ? await db.select().from(bugReportsTable).where(and(eq(bugReportsTable.tenantId, tenantId), eq(bugReportsTable.conversationId, conversationId))).limit(1)
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
          rotaAfetada: reportData.rotaAfetada ?? parsed.data.context?.route ?? null,
          changeScope: reportData.escopoSugerido ?? (reportData.categoria === "bug" ? "bug" : "tenant"),
          scopeReason: reportData.motivoEscopo ?? null,
          tenantContextSnapshot: tenantSnapshot,
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
          [saved] = await db.update(bugReportsTable).set(values as any).where(eq(bugReportsTable.id, existing.id)).returning();
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
        const contextLine = parsed.data.context?.route ? `\n\nContexto da tela: ${parsed.data.context.route}${parsed.data.context.title ? ` — ${parsed.data.context.title}` : ""}` : "";
        const transcript = parsed.data.messages.map((m) => `${m.role === "user" ? "Usuário" : "JARVIS"}: ${m.content}`).join("\n\n") + (visibleResponse ? `\n\nJARVIS: ${visibleResponse}` : "") + contextLine;
        const primeiraMensagem = parsed.data.messages.find((m) => m.role === "user")?.content ?? "Conversa com o JARVIS";
        const titulo = primeiraMensagem.length > 80 ? primeiraMensagem.slice(0, 77) + "..." : primeiraMensagem;

        const [existente] = await db.select({ id: relatosTecnicosTable.id }).from(relatosTecnicosTable).where(and(eq(relatosTecnicosTable.conversationId, conversationId), eq(relatosTecnicosTable.tenantId, tenantId)));

        if (existente) {
          await db.update(relatosTecnicosTable).set({ transcriptRelevante: transcript }).where(eq(relatosTecnicosTable.id, existente.id));
        } else {
          await db.insert(relatosTecnicosTable).values({ tenantId, conversationId, usuarioId: userId, titulo, descricaoProblema: titulo, transcriptRelevante: transcript, status: "pendente_revisao" });
        }
      }
    } catch (err) {
      req.log?.warn({ err }, "support: falha ao registrar relato técnico da conversa (não bloqueia)");
    }

    res.write(`data: ${JSON.stringify({ done: true, bugReportId, protocolo, status: atendimentoStatus, resolvidoPor })}\n\n`);
    res.end();
  } catch (err) {
    req.log?.error({ err }, "support: chat stream error");
    res.write(`data: ${JSON.stringify({ error: "Erro ao processar resposta" })}\n\n`);
    res.end();
  }

  return;
});

export default router;
