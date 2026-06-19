import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { z } from "zod/v4";
import multer from "multer";
import {
  db,
  tenantsTable,
  businessProfilesTable,
  agentConfigsTable,
  funisTable,
  knowledgeBaseTable,
  segmentTemplatesTable,
  AGENT_TYPES,
  type AgentsMap,
} from "@workspace/db";
import { requireSameTenanOrSuperAdmin } from "../middlewares/auth.js";
import { extractBusinessDataFromDocuments } from "../lib/document-extraction.js";
import { generateSubdomainSlug } from "../lib/subdomain.js";

const router: IRouter = Router();

// ── Multer: in-memory, max 10 MB/file, 3 files ──────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// ── Zod schemas ──────────────────────────────────────────────────────────────
const productSchema = z.object({
  nome: z.string().min(1),
  descricao: z.string().optional(),
  preco: z.number().nonnegative().optional(),
});

const onboardingCompleteSchema = z.object({
  nomeFantasia: z.string().min(1),
  vertical: z.string().min(1),
  logoUrl: z.string().optional(),
  produtos: z.array(productSchema).optional(),
  diferenciais: z.string().optional(),
  publicoAlvo: z.string().optional(),
  concorrentes: z.array(z.string()).optional(),
  canaisVenda: z.array(z.string()).optional(),
  discoveryData: z.record(z.string(), z.unknown()).optional(),
});

type WizardData = z.infer<typeof onboardingCompleteSchema>;

// ── Agent behavioral templates (function-specific, combined with tenant context) ──
type AgentName = "sdr" | "closer" | "followup" | "reactivation" | "scheduler" | "service" | "onboarding";

const AGENT_BEHAVIOR_TEMPLATES: Record<AgentName, string> = {
  sdr: `Você é um SDR (Sales Development Representative) da empresa mencionada no contexto abaixo.

SUA FUNÇÃO: Fazer a qualificação inicial de leads de forma consultiva.

COMPORTAMENTO:
- Apresente-se de forma calorosa e profissional representando a empresa
- Faça perguntas abertas para descobrir a necessidade e momento do lead (BANT: Budget, Authority, Need, Timeline)
- Identifique a dor principal antes de mencionar qualquer produto
- NÃO force a venda — seu objetivo é qualificar e marcar o próximo passo (reunião, demo, conversa com closer)
- Evite monólogos: faça uma pergunta de cada vez e espere a resposta
- Se o lead não estiver pronto agora, mantenha a porta aberta e agende um follow-up`,

  closer: `Você é um Closer especializado da empresa mencionada no contexto abaixo.

SUA FUNÇÃO: Conduzir leads qualificados ao fechamento com confiança e empatia.

COMPORTAMENTO:
- Retome o contexto da conversa anterior (necessidade identificada pelo SDR) antes de avançar
- Apresente a solução diretamente conectada à dor do lead — use os produtos e diferenciais da empresa
- Lide com objeções de forma empática mas firme: ouça, valide, responda com evidências
- Crie progressão natural: não pule para proposta sem confirmar que o lead entendeu o valor
- Peça o fechamento de forma clara quando o momento estiver certo — não deixe em aberto
- Se o lead hesitar, ofereça um próximo passo menor (garantia, teste, reunião de proposta)`,

  followup: `Você é o agente de Follow-up da empresa mencionada no contexto abaixo.

SUA FUNÇÃO: Reengajar leads que pararam de responder, sem ser insistente.

COMPORTAMENTO:
- Tom leve, descontraído e sem pressão — você está checando, não cobrando
- Mencione algo de valor (novidade, conteúdo, benefício) antes de pedir qualquer coisa
- Pergunte se surgiu alguma dúvida ou mudança de situação desde o último contato
- Nunca mencione quantas vezes já tentou contato — trate como se fosse natural
- Máximo 3-4 tentativas em sequência; se não responder, mova para reativação ou encerre com elegância
- Mantenha mensagens curtas — 2 a 3 frases no máximo`,

  reactivation: `Você é o agente de Reativação da empresa mencionada no contexto abaixo.

SUA FUNÇÃO: Trazer de volta clientes ou leads inativos há mais tempo.

COMPORTAMENTO:
- Reconheça o tempo sem contato de forma natural e sem constrangimento ("Faz um tempinho que não conversamos...")
- Se houver histórico de compra, use-o para personalizar ("Da última vez você tinha interesse em X...")
- Apresente uma novidade, melhoria ou benefício exclusivo relevante ao perfil do cliente
- Crie curiosidade em vez de culpa — o tom é de surpresa positiva, não de cobrança
- Ofereça um benefício de retorno quando apropriado (condição especial, acesso antecipado, bônus)
- Seja breve: o objetivo é reabrir a conversa, não fechar na primeira mensagem`,

  scheduler: `Você é o agente de Agendamento da empresa mencionada no contexto abaixo.

SUA FUNÇÃO: Confirmar e organizar compromissos de forma ágil e sem fricção.

COMPORTAMENTO:
- Seja objetivo e direto — o lead já tem interesse, você só precisa confirmar o horário
- Ofereça 2 ou 3 opções de horário em vez de perguntar quando o lead está disponível (reduz ida e volta)
- Confirme todos os detalhes relevantes: data, hora, formato (presencial/videochamada/ligação), link se necessário
- Envie um resumo da confirmação ao final ("Confirmado! [Data] às [Hora]. Vejo você lá!")
- Para reagendamentos: seja ágil, não demonstre impaciência, ofereça novas opções imediatamente
- Lembre o compromisso 24h antes se o fluxo permitir`,

  service: `Você é o agente de Atendimento e Suporte da empresa mencionada no contexto abaixo.

SUA FUNÇÃO: Resolver problemas e garantir a satisfação do cliente no pós-venda.

COMPORTAMENTO:
- Demonstre empatia genuína ANTES de resolver qualquer problema ("Entendo sua situação, vou te ajudar")
- Entenda o problema completamente antes de oferecer solução — faça perguntas de diagnóstico se necessário
- Comunique prazos, etapas e expectativas com clareza e honestidade
- Nunca prometa o que não pode cumprir — subestime prazos e supere expectativas
- Escale para um humano quando a situação exigir — faça a transição sem deixar o cliente sem resposta
- Finalize verificando se o problema foi resolvido completamente antes de encerrar`,

  onboarding: `Você é o agente de Onboarding de novos clientes da empresa mencionada no contexto abaixo.

SUA FUNÇÃO: Garantir que novos clientes tenham sucesso e engajamento desde o primeiro dia.

COMPORTAMENTO:
- Receba o cliente com entusiasmo genuíno e faça-o sentir que fez a escolha certa
- Guie passo a passo de forma simples — evite jargões e assuma que o cliente é iniciante
- Antecipe dúvidas comuns e explique antes que o cliente precise perguntar
- Comemore marcos e progressos — validação positiva aumenta engajamento
- Defina expectativas claras para os primeiros dias/semanas de uso
- Conecte o cliente com o suporte ou especialista adequado quando necessário`,
};

// ── Build rich tenant context block from wizard data ─────────────────────────
function buildTenantContext(data: WizardData): string {
  const lines: string[] = ["## CONTEXTO DO NEGÓCIO"];

  lines.push(`Empresa: ${data.nomeFantasia}`);
  lines.push(`Segmento: ${data.vertical}`);

  if (data.publicoAlvo) lines.push(`Público-alvo: ${data.publicoAlvo}`);

  const extra = data.discoveryData ?? {};

  // Structured audience segments (richer than publicoAlvo free text)
  if (Array.isArray(extra["audienceSegments"]) && (extra["audienceSegments"] as unknown[]).length > 0) {
    type Seg = { nome: string; descricao?: string; dores?: string; motivacoes?: string };
    const segs = extra["audienceSegments"] as Seg[];
    const segLines = segs.map((s) => {
      const parts: string[] = [`• ${s.nome}`];
      if (s.descricao) parts.push(`Perfil: ${s.descricao}`);
      if (s.dores) parts.push(`Dores: ${s.dores}`);
      if (s.motivacoes) parts.push(`Motivações: ${s.motivacoes}`);
      return parts.join(" | ");
    }).join("\n");
    lines.push(`Segmentos de audiência:\n${segLines}`);
  }

  if (data.diferenciais) lines.push(`Diferencial competitivo: ${data.diferenciais}`);

  const produtosValidos = (data.produtos ?? []).filter((p) => p.nome.trim());
  if (produtosValidos.length > 0) {
    const lista = produtosValidos
      .map((p) => {
        let s = p.nome;
        if (p.descricao) s += ` — ${p.descricao}`;
        if (p.preco != null) s += ` (R$ ${p.preco})`;
        return `• ${s}`;
      })
      .join("\n");
    lines.push(`Produtos e serviços:\n${lista}`);
  }

  if (data.concorrentes?.length)
    lines.push(`Concorrentes: ${data.concorrentes.join(", ")}`);
  if (data.canaisVenda?.length)
    lines.push(`Canais de atendimento: ${data.canaisVenda.join(", ")}`);

  if (extra["missao"]) lines.push(`Missão: ${extra["missao"]}`);
  if (extra["visao"]) lines.push(`Visão: ${extra["visao"]}`);
  if (Array.isArray(extra["valores"]) && extra["valores"].length > 0)
    lines.push(`Valores: ${(extra["valores"] as string[]).join(", ")}`);
  if (extra["historia"]) lines.push(`História: ${extra["historia"]}`);

  return lines.join("\n");
}

// ── Assemble final prompt: behavior + context + optional segment tip ───────────
function buildAgentPrompt(
  agentKey: AgentName,
  data: WizardData,
  segmentTip?: string
): string {
  const behavior = AGENT_BEHAVIOR_TEMPLATES[agentKey];
  const context = buildTenantContext(data);

  const parts = [behavior, "", context];

  if (segmentTip) {
    parts.push("", "## INSTRUÇÕES ESPECÍFICAS DO SEGMENTO", segmentTip);
  }

  return parts.join("\n");
}

function buildAboutContent(data: WizardData): string {
  const parts: string[] = [
    `**${data.nomeFantasia}** é uma empresa do segmento **${data.vertical}**.`,
  ];
  if (data.publicoAlvo) parts.push(`\n**Público-alvo:** ${data.publicoAlvo}`);
  if (data.diferenciais)
    parts.push(`\n**Diferencial competitivo:** ${data.diferenciais}`);
  if (data.canaisVenda?.length)
    parts.push(`\n**Canais de atendimento:** ${data.canaisVenda.join(", ")}`);

  // Include document-extracted institutional data
  const extra = data.discoveryData ?? {};
  if (extra["missao"]) parts.push(`\n**Missão:** ${extra["missao"]}`);
  if (extra["visao"]) parts.push(`\n**Visão:** ${extra["visao"]}`);
  if (Array.isArray(extra["valores"]) && extra["valores"].length > 0)
    parts.push(`\n**Valores:** ${(extra["valores"] as string[]).join(", ")}`);
  if (extra["historia"]) parts.push(`\n\n${extra["historia"]}`);
  if (data.logoUrl) parts.push(`\n**Logo:** ${data.logoUrl}`);

  return parts.join("\n").trim();
}

function buildProductsContent(data: WizardData): string {
  const produtos = data.produtos ?? [];
  const lines = [`Principais produtos e serviços da **${data.nomeFantasia}**:\n`];
  for (const p of produtos) {
    let line = `- **${p.nome}**`;
    if (p.descricao) line += `: ${p.descricao}`;
    if (p.preco != null) line += ` (R$ ${p.preco.toFixed(2)})`;
    lines.push(line);
  }
  return lines.join("\n").trim();
}

function buildStrategyContent(data: WizardData): string {
  const parts: string[] = [];
  if (data.diferenciais)
    parts.push(`**Diferencial competitivo:** ${data.diferenciais}`);
  if (data.publicoAlvo)
    parts.push(`**Público-alvo ideal:** ${data.publicoAlvo}`);
  if (data.concorrentes?.length) {
    parts.push(
      `**Principais concorrentes:**\n${data.concorrentes.map((c) => `- ${c}`).join("\n")}`
    );
  }
  if (data.canaisVenda?.length)
    parts.push(`**Canais de venda:** ${data.canaisVenda.join(", ")}`);
  return parts.join("\n\n").trim();
}

// ── POST /tenants/:tenantId/onboarding/analyze-documents ─────────────────────
router.post(
  "/tenants/:tenantId/onboarding/analyze-documents",
  requireSameTenanOrSuperAdmin(),
  upload.array("files", 3),
  async (req, res) => {
    const tenantId = String(req.params["tenantId"]);
    const files = (req.files as Express.Multer.File[]) ?? [];

    if (files.length === 0) {
      res.status(422).json({ error: "Nenhum arquivo enviado" });
      return;
    }

    const result = await extractBusinessDataFromDocuments(
      files.map((f) => ({
        buffer: f.buffer,
        mimeType: f.mimetype,
        originalName: f.originalname,
      }))
    );

    req.log.info(
      { tenantId, filesCount: files.length, confianca: result.confianca },
      "Onboarding: documents analyzed"
    );

    res.json(result);
  }
);

// ── POST /tenants/:tenantId/onboarding/complete ──────────────────────────────
router.post(
  "/tenants/:tenantId/onboarding/complete",
  requireSameTenanOrSuperAdmin(),
  async (req, res) => {
    const tenantId = String(req.params["tenantId"]);

    const parsed = onboardingCompleteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: parsed.error.message });
      return;
    }

    const data = parsed.data;
    const now = new Date();

    // ── 1. Save business profile + mark tenant setup complete ──────────────
    const mergedDiscoveryData = {
      nomeFantasia: data.nomeFantasia,
      vertical: data.vertical,
      diferenciais: data.diferenciais,
      publicoAlvo: data.publicoAlvo,
      concorrentes: data.concorrentes,
      canaisVenda: data.canaisVenda,
      ...(data.discoveryData ?? {}),
    };

    // Extract dedicated-column fields from discoveryData if provided
    const dd = data.discoveryData ?? {};
    const cnpjVal = typeof dd["cnpj"] === "string" ? dd["cnpj"] : null;
    const telefoneVal = typeof dd["telefone"] === "string" ? dd["telefone"] : null;
    const emailVal = typeof dd["email"] === "string" ? dd["email"] : null;
    const enderecoVal = typeof dd["endereco"] === "string" ? dd["endereco"] : null;

    const profileUpdate = {
      nomeFantasia: data.nomeFantasia,
      vertical: data.vertical,
      logoUrl: data.logoUrl ?? null,
      produtos: data.produtos ?? null,
      diferenciais: data.diferenciais ?? null,
      publicoAlvo: data.publicoAlvo ?? null,
      concorrentes: data.concorrentes ?? null,
      canaisVenda: data.canaisVenda ?? null,
      cnpj: cnpjVal,
      telefone: telefoneVal,
      email: emailVal,
      endereco: enderecoVal,
      discoveryCompletedAt: now,
      discoveryData: mergedDiscoveryData,
      updatedAt: now,
    };

    const [existing] = await db
      .select({ id: businessProfilesTable.id })
      .from(businessProfilesTable)
      .where(eq(businessProfilesTable.tenantId, tenantId));

    if (existing) {
      await db
        .update(businessProfilesTable)
        .set(profileUpdate)
        .where(eq(businessProfilesTable.tenantId, tenantId));
    } else {
      await db.insert(businessProfilesTable).values({
        tenantId,
        razaoSocial: data.nomeFantasia,
        ...profileUpdate,
      });
    }

    // Generate subdomain slug from nomeFantasia
    const [tenantBefore] = await db
      .select({ subdomainSlug: tenantsTable.subdomainSlug })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, tenantId));

    const subdomainSlug = tenantBefore?.subdomainSlug
      ?? (await generateSubdomainSlug(data.nomeFantasia));

    const [tenant] = await db
      .update(tenantsTable)
      .set({ setupCompletedAt: now, subdomainSlug, updatedAt: now })
      .where(eq(tenantsTable.id, tenantId))
      .returning({ setupCompletedAt: tenantsTable.setupCompletedAt, subdomainSlug: tenantsTable.subdomainSlug });

    req.log.info({ tenantId, subdomainSlug }, "Onboarding: profile saved, setup marked complete, subdomain assigned");

    // ── 2. Auto-config IA via segment template ─────────────────────────────
    const promptsApplied: string[] = [];
    let funilCriado = false;

    const [template] = await db
      .select()
      .from(segmentTemplatesTable)
      .where(
        and(
          eq(segmentTemplatesTable.nome, data.vertical),
          eq(segmentTemplatesTable.ativo, true)
        )
      );

    // Segment template: used for funil + optional segment-specific prompt tips
    const segmentTips: Record<string, string> = template
      ? ((template.promptsSugeridos ?? {}) as Record<string, string>)
      : {};

    // Apply behavioral prompts to ALL 7 agent types (always, regardless of segment template)
    const [existingConfig] = await db
      .select()
      .from(agentConfigsTable)
      .where(eq(agentConfigsTable.tenantId, tenantId));

    const agentNames: AgentName[] = [
      "sdr", "closer", "followup", "reactivation", "scheduler", "service", "onboarding",
    ];

    // Respect agentesAtivos from discoveryData to set enabled flags
    const agentesAtivos = Array.isArray(dd["agentesAtivos"])
      ? (dd["agentesAtivos"] as string[])
      : [];

    if (existingConfig) {
      const currentAgents: AgentsMap = (existingConfig.agents as AgentsMap) ?? {};
      const updatedAgents: AgentsMap = { ...currentAgents };

      for (const agentKey of agentNames) {
        const existing = currentAgents[agentKey];
        if (!existing?.prompt) {
          updatedAgents[agentKey] = {
            enabled: agentesAtivos.includes(agentKey) ? true : (existing?.enabled ?? false),
            prompt: buildAgentPrompt(agentKey, data, segmentTips[agentKey]),
          };
          promptsApplied.push(agentKey);
        } else if (agentesAtivos.includes(agentKey) && !existing.enabled) {
          // User explicitly activated this agent — enable even if prompt already set
          updatedAgents[agentKey] = { ...existing, enabled: true };
        }
      }

      const enabledChanged = (Object.keys(updatedAgents) as AgentName[]).some(
        (k) => updatedAgents[k]?.enabled !== currentAgents[k]?.enabled
      );
      if (promptsApplied.length > 0 || enabledChanged) {
        await db
          .update(agentConfigsTable)
          .set({ agents: updatedAgents, updatedAt: now })
          .where(eq(agentConfigsTable.id, existingConfig.id));
      }
    } else {
      const agents: AgentsMap = {};
      for (const agentKey of agentNames) {
        agents[agentKey] = {
          enabled: agentesAtivos.includes(agentKey),
          prompt: buildAgentPrompt(agentKey, data, segmentTips[agentKey]),
        };
        promptsApplied.push(agentKey);
      }
      await db.insert(agentConfigsTable).values({ tenantId, agents });
    }

    if (template) {
      const funilPadrao = (template.funilPadrao ?? []) as string[];
      if (funilPadrao.length > 0) {
        const existingFunils = await db
          .select({ id: funisTable.id })
          .from(funisTable)
          .where(eq(funisTable.tenantId, tenantId));

        if (existingFunils.length === 0) {
          await db.insert(funisTable).values({
            tenantId,
            nome: `Funil — ${template.nome}`,
            etapas: funilPadrao,
          });
          funilCriado = true;
        }
      }
    }

    req.log.info(
      { tenantId, promptsApplied, funilCriado },
      "Onboarding: AI auto-config applied"
    );

    // ── 3. Populate Knowledge Base ─────────────────────────────────────────
    const kbArticles: Array<{
      tenantId: string;
      titulo: string;
      conteudo: string;
      categoria: string;
      tags: string[];
    }> = [];

    kbArticles.push({
      tenantId,
      titulo: `Sobre a ${data.nomeFantasia}`,
      categoria: "empresa",
      tags: ["empresa", "identidade", data.vertical],
      conteudo: buildAboutContent(data),
    });

    const produtosValidos = (data.produtos ?? []).filter((p) => p.nome.trim());
    if (produtosValidos.length > 0) {
      kbArticles.push({
        tenantId,
        titulo: "Produtos e Serviços",
        categoria: "produtos",
        tags: ["produtos", "servicos", "catalogo"],
        conteudo: buildProductsContent({ ...data, produtos: produtosValidos }),
      });
    }

    const hasStrategyData =
      data.diferenciais ||
      data.publicoAlvo ||
      (data.concorrentes?.length ?? 0) > 0;

    if (hasStrategyData) {
      kbArticles.push({
        tenantId,
        titulo: "Estratégia Comercial",
        categoria: "estrategia",
        tags: ["estrategia", "mercado", "concorrentes", "diferenciais"],
        conteudo: buildStrategyContent(data),
      });
    }

    if (kbArticles.length > 0) {
      await db.insert(knowledgeBaseTable).values(kbArticles);
    }

    req.log.info(
      { tenantId, kbArtigosGerados: kbArticles.length },
      "Onboarding: knowledge base populated"
    );

    res.json({
      setupCompletedAt: tenant.setupCompletedAt!.toISOString(),
      promptsApplied,
      funilCriado,
      kbArtigosGerados: kbArticles.length,
    });
  }
);

export default router;
