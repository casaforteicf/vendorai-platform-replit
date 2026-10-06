import { Router, type IRouter } from "express";
import { eq, and, count } from "drizzle-orm";
import { z } from "zod/v4";
import multer from "multer";
import {
  db,
  tenantsTable,
  businessProfilesTable,
  agentConfigsTable,
  leadsTable,
  funisTable,
  knowledgeBaseTable,
  segmentTemplatesTable,
  onboardingProgressTable,
  plansTable,
  agendasTable,
  whatsappConnectionsTable,
  instagramConnectionsTable,
  AGENT_TYPES,
  type AgentsMap,
  brandProgramsTable,
  generatedSitesTable,
  tenantDomainsTable,
  searchConsoleConnectionsTable,
  socialConnectionsTable,
} from "@workspace/db";
import { buildAuthUrl } from "../lib/google-calendar.js";
import { authenticate, requireSameTenanOrSuperAdmin } from "../middlewares/auth.js";
import { objectStorageClient } from "../lib/objectStorage.js";
import { extractBusinessDataFromDocuments } from "../lib/document-extraction.js";
import { generateSubdomainSlug } from "../lib/subdomain.js";
import { encrypt } from "../lib/crypto.js";
import { getGoogleAdsConnectionByTenantId } from "../services/google-ads-oauth.js";
import { callOpenAI } from "../lib/ai-gateway.js";
import { getActiveCatalogCount } from "../lib/catalog-readiness.js";
import { ensureTenantProposalBuilderTemplate } from "../lib/proposal-builder.js";

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
      })),
      tenantId
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

    res.setHeader("Deprecation", "true");
    res.setHeader("Link", '</api/onboarding>; rel="successor-version"');
    res.setHeader(
      "Warning",
      '299 VendorAI "Endpoint legado; use o fluxo /onboarding/step/*"',
    );
    req.log.warn(
      { tenantId, userId: req.user?.sub, route: req.originalUrl },
      "Legacy onboarding completion endpoint used",
    );

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
    try {
      const proposalBuilder = await ensureTenantProposalBuilderTemplate({
        tenantId,
        log: req.log,
      });
      req.log.info(
        {
          tenantId,
          templateId: proposalBuilder.activeTemplateId,
          created: proposalBuilder.created,
        },
        "Onboarding: proposal builder template ready",
      );
    } catch (err) {
      // O modelo de proposta melhora a implantação, mas não deve bloquear o onboarding.
      req.log.warn({ err, tenantId }, "Onboarding: failed to prepare proposal builder template");
    }

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

    // BUG CORRIGIDO (auditoria): tenants.vertical nunca era setado por
    // nenhum fluxo real de onboarding — só um endpoint separado
    // (segment-templates/:id/apply) que o frontend nunca chama. Isso
    // deixava tenant novo bloqueado (403) de qualquer módulo com gate de
    // vertical (ex: construcao.ts, financeiro_obra.ts) desde o primeiro
    // dia, sem caminho nenhum de correção visível pro usuário.
    await db
      .update(tenantsTable)
      .set({ vertical: data.vertical, updatedAt: now })
      .where(eq(tenantsTable.id, tenantId));

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
      await db.insert(agentConfigsTable).values({ tenantId, agents, setupCompletedAt: new Date(), autonomyEnabledAt: new Date() });
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

    let kbArtigosGerados = 0;
    if (kbArticles.length > 0) {
      const existingArticles = await db
        .select({ titulo: knowledgeBaseTable.titulo, categoria: knowledgeBaseTable.categoria })
        .from(knowledgeBaseTable)
        .where(eq(knowledgeBaseTable.tenantId, tenantId));

      const articleKey = (titulo: string, categoria: string) =>
        `${categoria.trim().toLowerCase()}::${titulo.trim().toLowerCase()}`;
      const existingKeys = new Set(
        existingArticles.map((article) => articleKey(article.titulo, article.categoria)),
      );
      const newArticles = kbArticles.filter(
        (article) => !existingKeys.has(articleKey(article.titulo, article.categoria)),
      );

      if (newArticles.length > 0) {
        await db.insert(knowledgeBaseTable).values(newArticles);
        kbArtigosGerados = newArticles.length;
      }
    }

    req.log.info(
      { tenantId, kbArtigosGerados, kbArtigosIgnorados: kbArticles.length - kbArtigosGerados },
      "Onboarding: knowledge base populated without duplicates"
    );

    res.json({
      setupCompletedAt: tenant.setupCompletedAt!.toISOString(),
      promptsApplied,
      funilCriado,
      kbArtigosGerados,
      kbArtigosIgnorados: kbArticles.length - kbArtigosGerados,
    });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Onboarding wizard (steps 1 & 2)  — rotas sem :tenantId, auth via JWT
// ─────────────────────────────────────────────────────────────────────────────

const uploadLogo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      cb(new Error("Apenas imagens são aceitas"));
      return;
    }
    cb(null, true);
  },
});

const step1Schema = z.object({
  nomeEmpresa: z.string().min(1, "nomeEmpresa obrigatório"),
  segmento: z.string().min(1, "segmento obrigatório"),
  site: z.string().optional(),
  descricao: z.string().optional(),
  corPrimaria: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

const step2Schema = z.object({
  metaPhoneNumberId: z.string().min(1),
  metaAccessToken:   z.string().min(1),
  metaWabaId:        z.string().optional(),
  numeroWhatsapp:    z.string().min(1),
});

// ── GET /onboarding ───────────────────────────────────────────────────────────
router.get("/onboarding", authenticate, async (req, res) => {
  const tenantId = req.user!.tenantId;
  if (!tenantId) { res.status(403).json({ error: "Tenant não identificado" }); return; }

  const [existing] = await db
    .select()
    .from(onboardingProgressTable)
    .where(eq(onboardingProgressTable.tenantId, tenantId));

  if (existing) {
    res.json(existing);
    return;
  }

  const [created] = await db
    .insert(onboardingProgressTable)
    .values({ tenantId })
    .returning();

  res.status(201).json(created);
});

// ── PATCH /onboarding/step/1 ──────────────────────────────────────────────────
router.patch("/onboarding/step/1", authenticate, async (req, res) => {
  const tenantId = req.user!.tenantId;
  if (!tenantId) { res.status(403).json({ error: "Tenant não identificado" }); return; }

  const parsed = step1Schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const { nomeEmpresa, segmento, site, descricao, corPrimaria } = parsed.data;
  const now = new Date();

  // Segmentos que pertencem a um programa de marca (white-label) — quem se
  // cadastra escolhendo esse segmento já nasce com a marca do programa,
  // sem precisar de nenhuma configuração manual depois. Só "arqdor" por
  // enquanto; se o próprio cadastro já mandou uma cor (corPrimaria acima),
  // essa escolha do usuário tem prioridade sobre o padrão do programa.
  const SEGMENTO_TO_PROGRAM: Record<string, string> = {
    "Arquitetura & Design": "arqdor",
  };
  const programaMarca = SEGMENTO_TO_PROGRAM[segmento] ?? null;
  let brandDefaults: { logoUrl?: string; corPrimaria?: string; whiteLabelCompleto?: boolean } = {};
  if (programaMarca && !corPrimaria) {
    const [program] = await db.select().from(brandProgramsTable).where(eq(brandProgramsTable.id, programaMarca));
    if (program) {
      // Não sobrescreve um logo que o próprio usuário já subiu nesse
      // mesmo passo (via POST /onboarding/step/1/logo, que roda antes
      // desse PATCH quando ele escolhe um arquivo).
      const [currentTenant] = await db.select({ logoUrl: tenantsTable.logoUrl }).from(tenantsTable).where(eq(tenantsTable.id, tenantId));
      brandDefaults = {
        ...(program.logoUrl && !currentTenant?.logoUrl ? { logoUrl: program.logoUrl } : {}),
        ...(program.corPrimaria ? { corPrimaria: program.corPrimaria } : {}),
        whiteLabelCompleto: program.whiteLabelCompleto,
      };
    }
  }

  await db
    .update(tenantsTable)
    .set({
      nomeEmpresa,
      segmento,
      // BUG CORRIGIDO (auditoria): tenants.vertical nunca era setado em
      // NENHUM fluxo real de onboarding (o handler /onboarding/complete
      // que setava isso não é chamado pelo frontend — código morto). Sem
      // isso, tenant novo ficava bloqueado (403) de qualquer módulo com
      // gate de vertical (construcao.ts, financeiro_obra.ts) desde o
      // primeiro dia, sem nenhum caminho de correção visível.
      vertical: segmento,
      site: site ?? null,
      descricao: descricao ?? null,
      corPrimaria: corPrimaria ?? undefined,
      ...(programaMarca ? { programaMarca } : {}),
      ...brandDefaults,
      updatedAt: now,
    })
    .where(eq(tenantsTable.id, tenantId));

  const [existing] = await db
    .select({ stepAtual: onboardingProgressTable.stepAtual })
    .from(onboardingProgressTable)
    .where(eq(onboardingProgressTable.tenantId, tenantId));

  const nextStep = Math.max(existing?.stepAtual ?? 1, 2);

  const [progress] = await db
    .insert(onboardingProgressTable)
    .values({
      tenantId,
      step1Completo: true,
      stepAtual: nextStep,
      dadosStep1: parsed.data as Record<string, unknown>,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: onboardingProgressTable.tenantId,
      set: {
        step1Completo: true,
        stepAtual: nextStep,
        dadosStep1: parsed.data as Record<string, unknown>,
        updatedAt: now,
      },
    })
    .returning();

  req.log.info({ tenantId }, "Onboarding step 1 saved");
  res.json(progress);
});

// ── POST /onboarding/step/1/logo ──────────────────────────────────────────────
router.post(
  "/onboarding/step/1/logo",
  authenticate,
  uploadLogo.single("logo"),
  async (req, res) => {
    const tenantId = req.user!.tenantId;
    if (!tenantId) { res.status(403).json({ error: "Tenant não identificado" }); return; }

    const file = req.file;
    if (!file) {
      res.status(422).json({ error: "Campo 'logo' obrigatório" });
      return;
    }

    const privateDir = process.env["PRIVATE_OBJECT_DIR"];
    if (!privateDir) {
      res.status(500).json({ error: "Object storage não configurado" });
      return;
    }

    const ext = file.originalname.split(".").pop()?.toLowerCase() ?? "png";
    const objectPath = `${privateDir}/logos/${tenantId}/logo.${ext}`;
    const parts = objectPath.replace(/^\//, "").split("/");
    const bucketName = parts[0];
    const objectName = parts.slice(1).join("/");

    const bucket = objectStorageClient.bucket(bucketName!);
    const gcsFile = bucket.file(objectName!);
    await gcsFile.save(file.buffer, { contentType: file.mimetype, resumable: false });

    const logoUrl = `/api/storage/objects/logos/${tenantId}/logo.${ext}`;

    await db
      .update(tenantsTable)
      .set({ logoUrl, updatedAt: new Date() })
      .where(eq(tenantsTable.id, tenantId));

    req.log.info({ tenantId, logoUrl }, "Onboarding: logo uploaded");
    res.json({ logoUrl });
  }
);

// ── PATCH /onboarding/step/2 ──────────────────────────────────────────────────
router.patch("/onboarding/step/2", authenticate, async (req, res) => {
  const tenantId = req.user!.tenantId;
  if (!tenantId) { res.status(403).json({ error: "Tenant não identificado" }); return; }

  const parsed = step2Schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const { metaPhoneNumberId, metaAccessToken, metaWabaId, numeroWhatsapp } = parsed.data;

  const now = new Date();

  // Save Meta credentials to agent_configs (upsert by tenantId)
  const [existingConfig] = await db
    .select({ id: agentConfigsTable.id })
    .from(agentConfigsTable)
    .where(eq(agentConfigsTable.tenantId, tenantId));

  if (existingConfig) {
    await db
      .update(agentConfigsTable)
      .set({ metaPhoneNumberId, metaAccessToken, metaWabaId: metaWabaId ?? null, updatedAt: now })
      .where(eq(agentConfigsTable.id, existingConfig.id));
  } else {
    await db
      .insert(agentConfigsTable)
      .values({ tenantId, metaPhoneNumberId, metaAccessToken, metaWabaId: metaWabaId ?? null });
  }

  // Save phone to business profile
  const [existingProfile] = await db
    .select({ id: businessProfilesTable.id })
    .from(businessProfilesTable)
    .where(eq(businessProfilesTable.tenantId, tenantId));

  if (existingProfile) {
    await db
      .update(businessProfilesTable)
      .set({ telefone: numeroWhatsapp, updatedAt: now })
      .where(eq(businessProfilesTable.id, existingProfile.id));
  } else {
    await db
      .insert(businessProfilesTable)
      .values({ tenantId, razaoSocial: "", telefone: numeroWhatsapp });
  }

  const [existingProgress] = await db
    .select({ stepAtual: onboardingProgressTable.stepAtual })
    .from(onboardingProgressTable)
    .where(eq(onboardingProgressTable.tenantId, tenantId));

  const nextStep = Math.max(existingProgress?.stepAtual ?? 2, 3);

  const [progress] = await db
    .insert(onboardingProgressTable)
    .values({
      tenantId,
      step2Completo: true,
      stepAtual: nextStep,
      dadosStep2: { metaPhoneNumberId, metaWabaId, numeroWhatsapp } as Record<string, unknown>,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: onboardingProgressTable.tenantId,
      set: {
        step2Completo: true,
        stepAtual: nextStep,
        dadosStep2: { metaPhoneNumberId, metaWabaId, numeroWhatsapp } as Record<string, unknown>,
        updatedAt: now,
      },
    })
    .returning();

  req.log.info({ tenantId, metaPhoneNumberId }, "Onboarding step 2 saved (Meta)");
  res.json(progress);
});

// ── PATCH /onboarding/step/3 ──────────────────────────────────────────────────
router.patch("/onboarding/step/3", authenticate, async (req, res) => {
  const tenantId = req.user!.tenantId;
  if (!tenantId) { res.status(403).json({ error: "Tenant não identificado" }); return; }

  const step3Schema = z.object({
    agentKey: z.enum(AGENT_TYPES),
    nomePerfil: z.string().optional(),
    tom: z.string().optional(),
  });

  const parsed = step3Schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const { agentKey, nomePerfil, tom } = parsed.data;
  const now = new Date();

  const [existingConfig] = await db
    .select()
    .from(agentConfigsTable)
    .where(eq(agentConfigsTable.tenantId, tenantId));

  if (existingConfig) {
    const currentAgents: AgentsMap = (existingConfig.agents as AgentsMap) ?? {};
    const currentEntry = currentAgents[agentKey] ?? {};
    const updatedEntry = {
      ...currentEntry,
      enabled: true,
      ...(nomePerfil !== undefined ? { nomePerfil } : {}),
      ...(tom !== undefined ? { tom } : {}),
    };
    await db
      .update(agentConfigsTable)
      .set({
        agents: { ...currentAgents, [agentKey]: updatedEntry },
        setupCompletedAt: existingConfig.setupCompletedAt ?? now,
        autonomyEnabledAt: existingConfig.autonomyEnabledAt ?? now,
        updatedAt: now,
      })
      .where(eq(agentConfigsTable.id, existingConfig.id));
  } else {
    const newEntry = {
      enabled: true,
      ...(nomePerfil !== undefined ? { nomePerfil } : {}),
      ...(tom !== undefined ? { tom } : {}),
    };
    await db.insert(agentConfigsTable).values({
      tenantId,
      agents: { [agentKey]: newEntry } as AgentsMap,
      // setupCompletedAt/autonomyEnabledAt na criação -- ver comentário
      // em agent_configs.ts (rota POST /agent-configs).
      setupCompletedAt: now,
      autonomyEnabledAt: now,
    });
  }

  const [existingProgress] = await db
    .select({ stepAtual: onboardingProgressTable.stepAtual })
    .from(onboardingProgressTable)
    .where(eq(onboardingProgressTable.tenantId, tenantId));

  const nextStep = Math.max(existingProgress?.stepAtual ?? 3, 4);

  const [progress] = await db
    .insert(onboardingProgressTable)
    .values({
      tenantId,
      step3Completo: true,
      stepAtual: nextStep,
      dadosStep3: { agentKey, nomePerfil, tom } as Record<string, unknown>,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: onboardingProgressTable.tenantId,
      set: {
        step3Completo: true,
        stepAtual: nextStep,
        dadosStep3: { agentKey, nomePerfil, tom } as Record<string, unknown>,
        updatedAt: now,
      },
    })
    .returning();

  req.log.info({ tenantId, agentKey }, "Onboarding step 3 saved");
  res.json(progress);
});

// ── PATCH /onboarding/step/4 ──────────────────────────────────────────────────
router.patch("/onboarding/step/4", authenticate, async (req, res) => {
  const tenantId = req.user!.tenantId;
  if (!tenantId) { res.status(403).json({ error: "Tenant não identificado" }); return; }

  const step4Schema = z.object({
    planoId: z.string().min(1).optional(),
    ciclo: z.enum(["mensal", "anual"]).optional(),
  });

  const parsed = step4Schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [tenant] = await db
    .select({
      planId: tenantsTable.planId,
      billingCycle: tenantsTable.billingCycle,
      planStartedAt: tenantsTable.planStartedAt,
    })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId));

  if (!tenant) {
    res.status(404).json({ error: "Tenant não encontrado" });
    return;
  }

  // The plan is assigned by the platform administrator when the tenant is
  // created. Onboarding must never let the tenant replace that assignment.
  // Older/imported tenants may have no plan or reference a removed plan.
  // Repair those references with the free Start plan to avoid a lockout.
  let planoId = tenant?.planId ?? null;
  const billingCycle: "monthly" | "annual" =
    tenant.billingCycle === "annual" ? "annual" : "monthly";
  const ciclo = billingCycle === "annual" ? "anual" : "mensal";
  const now = new Date();

  // Look up the plan
  let [plan] = planoId
    ? await db.select().from(plansTable).where(eq(plansTable.id, planoId)).limit(1)
    : [];
  let planRepaired = false;

  if (!plan) {
    [plan] = await db
      .select()
      .from(plansTable)
      .where(and(eq(plansTable.slug, "start"), eq(plansTable.isActive, true)))
      .limit(1);

    if (!plan) {
      res.status(409).json({
        error: "Plano inicial indisponível. Solicite ao administrador a configuração do plano Start.",
      });
      return;
    }

    req.log.warn(
      { tenantId, previousPlanId: planoId, replacementPlanId: plan.id },
      "Onboarding repaired invalid tenant plan reference",
    );
    planoId = plan.id;
    planRepaired = true;
  }

  const priceCents = billingCycle === "annual"
    ? (plan.monthlyPriceAnnualCents ?? plan.monthlyPriceCents ?? 0)
    : (plan.monthlyPriceCents ?? 0);

  // Try to create Asaas charge if configured
  let asaasChargeId: string | null = null;
  let invoiceUrl: string | null = null;

  const { isAsaasConfigured, createOrGetCustomer, createCharge } = await import("../lib/asaas.js");

  if (parsed.data.planoId && (await isAsaasConfigured()) && priceCents > 0) {
    try {
      // Get tenant admin user for customer data
      const { usersTable } = await import("@workspace/db");
      const [adminUser] = await db
        .select({ name: usersTable.name, email: usersTable.email })
        .from(usersTable)
        .where(and(eq(usersTable.tenantId, tenantId), eq(usersTable.platformRole, "tenant_admin")))
        .limit(1);

      const customer = await createOrGetCustomer({
        name: adminUser?.name ?? plan.name,
        email: adminUser?.email ?? `tenant-${tenantId}@vendorai.app`,
      });

      const dueDate = new Date(now);
      dueDate.setDate(dueDate.getDate() + 3);
      const dueDateStr = dueDate.toISOString().split("T")[0]!;

      const charge = await createCharge({
        customer: customer.id,
        billingType: "PIX",
        value: priceCents / 100,
        dueDate: dueDateStr,
        description: `VendorAI — ${plan.name} (${ciclo})`,
        externalReference: `tenant:${tenantId}:plan:${planoId}`,
      });

      asaasChargeId = charge.id;
      invoiceUrl = charge.invoiceUrl;
    } catch (err) {
      req.log.warn({ err, tenantId, planoId }, "Onboarding step 4: Asaas charge failed (non-fatal)");
    }
  }

  // Update tenant plan + mark onboarding complete
  await db
    .update(tenantsTable)
    .set({
      planId: planoId,
      billingCycle,
      planStartedAt: tenant.planStartedAt ?? now,
      onboardingConcluido: true,
      setupCompletedAt: now,
      updatedAt: now,
    })
    .where(eq(tenantsTable.id, tenantId));

  // Complete onboarding progress
  await db
    .insert(onboardingProgressTable)
    .values({
      tenantId,
      step4Completo: true,
      stepAtual: 4,
      concluido: true,
      concluidoEm: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: onboardingProgressTable.tenantId,
      set: {
        step4Completo: true,
        stepAtual: 4,
        concluido: true,
        concluidoEm: now,
        updatedAt: now,
      },
    });

  req.log.info({ tenantId, planoId, billingCycle, asaasChargeId }, "Onboarding step 4 complete");
  res.json({ success: true, redirectTo: "/dashboard", asaasChargeId, invoiceUrl, planRepaired });
});

// ── GET /onboarding/whatsapp/test ─────────────────────────────────────────────
router.get("/onboarding/whatsapp/test", authenticate, async (req, res) => {
  const tenantId = req.user!.tenantId;
  if (!tenantId) { res.status(403).json({ error: "Tenant não identificado" }); return; }

  const [config] = await db
    .select({
      metaPhoneNumberId: agentConfigsTable.metaPhoneNumberId,
      metaAccessToken: agentConfigsTable.metaAccessToken,
    })
    .from(agentConfigsTable)
    .where(eq(agentConfigsTable.tenantId, tenantId));

  if (!config?.metaPhoneNumberId || !config?.metaAccessToken) {
    res.json({ conectado: false, erro: "Meta Cloud API não configurada" });
    return;
  }

  try {
    const metaRes = await fetch(
      `https://graph.facebook.com/v20.0/${config.metaPhoneNumberId}`,
      {
        headers: { Authorization: `Bearer ${config.metaAccessToken}` },
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!metaRes.ok) {
      res.json({ conectado: false, erro: `Meta Cloud API HTTP ${metaRes.status}` });
      return;
    }

    const data = await metaRes.json() as Record<string, unknown>;
    const numero = typeof data["display_phone_number"] === "string" ? data["display_phone_number"] : undefined;

    res.json({ conectado: true, numero });
  } catch (err) {
    req.log.warn({ err }, "Onboarding whatsapp test failed");
    res.json({ conectado: false, erro: "Timeout ou erro de rede" });
  }
});

// ── POST /onboarding/assistant ────────────────────────────────────────────────
// Agente de Implantação: usa o mesmo comportamento do agente onboarding e o
// status REAL do tenant para orientar a próxima ação. Não cria dados nem marca
// etapas como concluídas — apenas acompanha e explica o setup.
router.post("/onboarding/assistant", authenticate, async (req, res) => {
  const tenantId = req.user!.tenantId;
  if (!tenantId) return res.status(403).json({ error: "Tenant não identificado" });

  const parsed = z.object({ message: z.string().trim().min(1).max(2000) }).safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: "Mensagem inválida" });

  const [[tenant], [profile], [config], [leadCountRow], catalogCount] = await Promise.all([
    db.select({
      name: tenantsTable.name,
      isDemo: tenantsTable.isDemo,
      setupCompletedAt: tenantsTable.setupCompletedAt,
      onboardingConcluido: tenantsTable.onboardingConcluido,
    }).from(tenantsTable).where(eq(tenantsTable.id, tenantId)).limit(1),
    db.select({ id: businessProfilesTable.id })
      .from(businessProfilesTable).where(eq(businessProfilesTable.tenantId, tenantId)).limit(1),
    db.select({
      setupCompletedAt: agentConfigsTable.setupCompletedAt,
      autonomyEnabledAt: agentConfigsTable.autonomyEnabledAt,
      metaPhoneNumberId: agentConfigsTable.metaPhoneNumberId,
      metaAccessToken: agentConfigsTable.metaAccessToken,
      evolutionConnected: agentConfigsTable.evolutionConnected,
      instagramPageId: agentConfigsTable.instagramPageId,
      instagramPageAccessToken: agentConfigsTable.instagramPageAccessToken,
      webhookSecret: agentConfigsTable.webhookSecret,
    }).from(agentConfigsTable).where(eq(agentConfigsTable.tenantId, tenantId)).limit(1),
    db.select({ value: count() }).from(leadsTable).where(eq(leadsTable.tenantId, tenantId)),
    getActiveCatalogCount(tenantId),
  ]);

  if (!tenant) return res.status(404).json({ error: "Tenant não encontrado" });

  const productsConfigured = catalogCount > 0;
  const whatsappConnected = config?.evolutionConnected === true;
  const steps = [
    { key: "onboarding", label: "Concluir o onboarding inicial", done: !!(tenant.setupCompletedAt || tenant.onboardingConcluido), href: "/onboarding" },
    { key: "perfil", label: "Configurar o perfil da empresa", done: !!profile, href: "/configuracoes" },
    { key: "produtos", label: "Cadastrar produtos ou serviços", done: productsConfigured, href: "/catalogo" },
    { key: "agentes", label: "Configurar os agentes de IA", done: !!config?.setupCompletedAt, href: "/configuracoes" },
    { key: "whatsapp", label: "Conectar o WhatsApp", done: whatsappConnected, href: "/onboarding/integracoes" },
    { key: "webhook", label: "Ativar o webhook de entrada", done: !!config?.webhookSecret, href: "/configuracoes" },
    { key: "instagram", label: "Conectar o Instagram", done: !!(config?.instagramPageId && config?.instagramPageAccessToken), href: "/onboarding/integracoes" },
    { key: "lead", label: "Cadastrar o primeiro lead real", done: Number(leadCountRow?.value ?? 0) > 0, href: "/leads" },
    { key: "autonomia", label: "Habilitar a autonomia dos agentes", done: !!config?.autonomyEnabledAt, href: "/configuracoes" },
  ];
  const nextAction = steps.find((step) => !step.done) ?? null;
  const completed = steps.filter((step) => step.done).length;

  const statusText = steps.map((step) => `${step.done ? "✓" : "○"} ${step.label}`).join("\n");
  const systemPrompt = `${AGENT_BEHAVIOR_TEMPLATES.onboarding}

` +
    `Você também é o Agente de Implantação do VendorAI. Sua missão é acompanhar a configuração do sistema com base EXCLUSIVAMENTE no status real fornecido. ` +
    `Nunca diga que uma etapa está concluída se ela estiver marcada como pendente. Não invente integrações ou dados. ` +
    `Responda em português do Brasil, de forma curta, prática e acolhedora. Quando fizer sentido, indique UMA próxima ação concreta e explique onde clicar. ` +
    `Se o cliente perguntar sobre algo fora da implantação, responda brevemente e traga o foco de volta para a ativação da plataforma.`;

  try {
    const result = await callOpenAI(
      tenantId,
      "agent_onboarding",
      [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `EMPRESA: ${tenant.name}\nTIPO: ${tenant.isDemo ? "Demo/Trial" : "Cliente ativo"}\nPROGRESSO: ${completed}/${steps.length}\n\nSTATUS REAL:\n${statusText}\n\nPRÓXIMA AÇÃO CALCULADA: ${nextAction?.label ?? "Implantação concluída"}\n\nPERGUNTA DO CLIENTE: ${parsed.data.message}`,
        },
      ],
      { temperature: 0.3, maxTokens: 450, log: req.log },
    );

    return res.json({
      resposta: result.content,
      progress: { completed, total: steps.length },
      nextAction: nextAction ? { key: nextAction.key, label: nextAction.label, href: nextAction.href } : null,
    });
  } catch (error) {
    req.log.warn({ error, tenantId }, "onboarding assistant failed");
    return res.status(502).json({ error: error instanceof Error ? error.message : "Não foi possível consultar o Agente de Implantação." });
  }
});

// ── GET /onboarding/integracoes ────────────────────────────────────────────────
router.get("/onboarding/integracoes", authenticate, async (req, res) => {
  const tenantId = req.user!.tenantId;
  if (!tenantId) { return res.status(403).json({ error: "Tenant não identificado" }); }

  const [tenant] = await db
    .select({ step: tenantsTable.integracoesStep, concluido: tenantsTable.integracoesConcluido })
    .from(tenantsTable).where(eq(tenantsTable.id, tenantId));

  const [waConn] = await db
    .select({ displayPhoneNumber: whatsappConnectionsTable.displayPhoneNumber, status: whatsappConnectionsTable.status })
    .from(whatsappConnectionsTable)
    .where(and(
      eq(whatsappConnectionsTable.tenantId, tenantId),
      eq(whatsappConnectionsTable.provider, "evolution"),
      eq(whatsappConnectionsTable.status, "active"),
    ));

  const [evolutionConn] = await db
    .select({ connected: agentConfigsTable.evolutionConnected, phone: agentConfigsTable.evolutionPhone })
    .from(agentConfigsTable)
    .where(eq(agentConfigsTable.tenantId, tenantId));

  const [igConn] = await db
    .select({ username: instagramConnectionsTable.username })
    .from(instagramConnectionsTable)
    .where(eq(instagramConnectionsTable.tenantId, tenantId));

  const [gcAgenda] = await db
    .select({ id: agendasTable.id, googleCalendarId: agendasTable.googleCalendarId })
    .from(agendasTable)
    .where(and(eq(agendasTable.tenantId, tenantId)));

  const googleAdsConn = await getGoogleAdsConnectionByTenantId(tenantId);
  const [publishedSite] = await db.select({ id: generatedSitesTable.id }).from(generatedSitesTable).where(and(eq(generatedSitesTable.tenantId, tenantId), eq(generatedSitesTable.published, true))).limit(1);
  const [domain] = await db.select({ domain: tenantDomainsTable.domain, status: tenantDomainsTable.status }).from(tenantDomainsTable).where(eq(tenantDomainsTable.tenantId, tenantId)).limit(1);
  const [searchConsole] = await db.select({ status: searchConsoleConnectionsTable.status, verified: searchConsoleConnectionsTable.verified }).from(searchConsoleConnectionsTable).where(eq(searchConsoleConnectionsTable.tenantId, tenantId)).limit(1);
  const socialConnections = await db.select({ provider: socialConnectionsTable.provider, status: socialConnectionsTable.status }).from(socialConnectionsTable).where(eq(socialConnectionsTable.tenantId, tenantId));

  const [tenantData] = await db
    .select({ asaasApiKey: tenantsTable.asaasApiKey, zapsignApiKey: tenantsTable.zapsignApiKey, googleAdsConversionId: tenantsTable.googleAdsConversionId, ga4MeasurementId: tenantsTable.ga4MeasurementId, gtmContainerId: tenantsTable.gtmContainerId, metaPixelId: tenantsTable.metaPixelId, linkedinInsightTagId: tenantsTable.linkedinInsightTagId, tiktokPixelId: tenantsTable.tiktokPixelId })
    .from(tenantsTable).where(eq(tenantsTable.id, tenantId));

  return res.json({
    step: tenant?.step ?? 0,
    concluido: tenant?.concluido ?? false,
    whatsapp: {
      connected: waConn?.status === "active" || evolutionConn?.connected === true,
      phone: waConn?.displayPhoneNumber ?? evolutionConn?.phone ?? null,
    },
    googleCalendar: {
      connected: !!(gcAgenda?.googleCalendarId),
      agendaId: gcAgenda?.id ?? null,
    },
    instagram: {
      connected: !!igConn?.username,
      username: igConn?.username ?? null,
    },
    googleAds: {
      connected: !!googleAdsConn && googleAdsConn.status !== "disconnected" && !googleAdsConn.disconnectedAt,
      pendingAccountSelection: googleAdsConn?.status === "pending_account_selection",
      customerId: googleAdsConn?.customerId ?? null,
      descriptiveName: googleAdsConn?.descriptiveName ?? null,
    },
    asaas: { connected: !!tenantData?.asaasApiKey },
    zapsign: { connected: !!tenantData?.zapsignApiKey },
    site: { published: !!publishedSite },
    domain: { configured: !!domain, active: domain?.status === "active", name: domain?.domain ?? null, status: domain?.status ?? null },
    searchConsole: { connected: !!searchConsole && searchConsole.status !== "disconnected", verified: searchConsole?.verified === true },
    tracking: {
      googleAds: !!tenantData?.googleAdsConversionId,
      googleAdsConversionId: tenantData?.googleAdsConversionId ?? null,
      ga4: /^G-[A-Z0-9]+$/i.test(tenantData?.ga4MeasurementId ?? ""),
      ga4MeasurementId: tenantData?.ga4MeasurementId ?? null,
      gtm: /^GTM-[A-Z0-9]+$/i.test(tenantData?.gtmContainerId ?? ""),
      gtmContainerId: tenantData?.gtmContainerId ?? null,
      metaPixel: /^\d+$/.test(tenantData?.metaPixelId ?? ""),
      metaPixelId: tenantData?.metaPixelId ?? null,
      linkedinInsightTag: /^\d+$/.test(tenantData?.linkedinInsightTagId ?? ""),
      linkedinInsightTagId: tenantData?.linkedinInsightTagId ?? null,
      tiktokPixel: /^[A-Za-z0-9_-]+$/.test(tenantData?.tiktokPixelId ?? ""),
      tiktokPixelId: tenantData?.tiktokPixelId ?? null,
    },
    social: { linkedin: socialConnections.some((connection) => connection.provider === "linkedin" && connection.status === "active"), tiktok: socialConnections.some((connection) => connection.provider === "tiktok" && connection.status === "active") },
  });
});


// ── PUT /onboarding/integracoes/tracking ──────────────────────────────────────
router.put("/onboarding/integracoes/tracking", authenticate, async (req, res) => {
  const tenantId = req.user!.tenantId;
  if (!tenantId) return res.status(403).json({ error: "Tenant não identificado" });

  const parsed = z.object({
    googleAdsConversionId: z.string().trim().max(40).nullable().optional(),
    ga4MeasurementId: z.string().trim().max(40).nullable().optional(),
    gtmContainerId: z.string().trim().max(40).nullable().optional(),
    metaPixelId: z.string().trim().max(40).nullable().optional(),
    linkedinInsightTagId: z.string().trim().max(40).nullable().optional(),
    tiktokPixelId: z.string().trim().max(80).nullable().optional(),
  }).safeParse(req.body ?? {});

  if (!parsed.success) return res.status(422).json({ error: "Dados de tracking inválidos", issues: parsed.error.issues });

  const normalize = (value: string | null | undefined) => value?.trim() || null;
  const values = {
    googleAdsConversionId: normalize(parsed.data.googleAdsConversionId),
    ga4MeasurementId: normalize(parsed.data.ga4MeasurementId),
    gtmContainerId: normalize(parsed.data.gtmContainerId),
    metaPixelId: normalize(parsed.data.metaPixelId),
    linkedinInsightTagId: normalize(parsed.data.linkedinInsightTagId),
    tiktokPixelId: normalize(parsed.data.tiktokPixelId),
  };

  const errors: Record<string, string> = {};
  if (values.googleAdsConversionId && !/^AW-\d+$/.test(values.googleAdsConversionId)) errors.googleAdsConversionId = "Use o formato AW-XXXXXXXXX.";
  if (values.ga4MeasurementId && !/^G-[A-Z0-9]+$/i.test(values.ga4MeasurementId)) errors.ga4MeasurementId = "Use o formato G-XXXXXXXXXX.";
  if (values.gtmContainerId && !/^GTM-[A-Z0-9]+$/i.test(values.gtmContainerId)) errors.gtmContainerId = "Use o formato GTM-XXXXXXX.";
  if (values.metaPixelId && !/^\d+$/.test(values.metaPixelId)) errors.metaPixelId = "O Meta Pixel deve conter apenas números.";
  if (values.linkedinInsightTagId && !/^\d+$/.test(values.linkedinInsightTagId)) errors.linkedinInsightTagId = "O Partner ID do LinkedIn deve conter apenas números.";
  if (values.tiktokPixelId && !/^[A-Za-z0-9_-]+$/.test(values.tiktokPixelId)) errors.tiktokPixelId = "Pixel TikTok inválido.";

  if (Object.keys(errors).length) return res.status(422).json({ error: "Formato inválido", fields: errors });

  await db.update(tenantsTable).set({ ...values, updatedAt: new Date() }).where(eq(tenantsTable.id, tenantId));

  return res.json({
    success: true,
    tracking: {
      googleAds: Boolean(values.googleAdsConversionId),
      ga4: Boolean(values.ga4MeasurementId),
      gtm: Boolean(values.gtmContainerId),
      metaPixel: Boolean(values.metaPixelId),
      linkedinInsightTag: Boolean(values.linkedinInsightTagId),
      tiktokPixel: Boolean(values.tiktokPixelId),
    },
  });
});

// ── PATCH /onboarding/integracoes/step ─────────────────────────────────────────
router.patch("/onboarding/integracoes/step", authenticate, async (req, res) => {
  const tenantId = req.user!.tenantId;
  if (!tenantId) { return res.status(403).json({ error: "Tenant não identificado" }); }
  const { step } = z.object({ step: z.number().int().min(0).max(6) }).parse(req.body);
  await db.update(tenantsTable).set({ integracoesStep: step }).where(eq(tenantsTable.id, tenantId));
  return res.json({ ok: true });
});

// ── POST /onboarding/integracoes/complete ──────────────────────────────────────
router.post("/onboarding/integracoes/complete", authenticate, async (req, res) => {
  const tenantId = req.user!.tenantId;
  if (!tenantId) { return res.status(403).json({ error: "Tenant não identificado" }); }
  await db.update(tenantsTable)
    .set({ integracoesConcluido: true })
    .where(eq(tenantsTable.id, tenantId));

  // Melhor esforço, não bloqueia a resposta: compila o briefing da empresa
  // e já deixa todos os agentes com contexto do negócio configurado, sem
  // depender do tenant visitar a aba Agentes manualmente depois.
  import("../lib/agentBriefingCompiler.js")
    .then(({ compileAgentBusinessBriefing }) => compileAgentBusinessBriefing(tenantId, undefined, req.log))
    .catch((err) => req.log.warn({ err, tenantId }, "onboarding: auto-compile de briefing dos agentes falhou"));

  return res.json({ ok: true, redirectTo: "/dashboard" });
});

// ── POST /onboarding/integracoes/validate-asaas ────────────────────────────────
router.post("/onboarding/integracoes/validate-asaas", authenticate, async (req, res) => {
  const tenantId = req.user!.tenantId;
  if (!tenantId) { return res.status(403).json({ error: "Tenant não identificado" }); }
  const { apiKey } = z.object({ apiKey: z.string().min(1) }).parse(req.body);

  try {
    const r = await fetch("https://api.asaas.com/api/v3/myAccount", {
      headers: { access_token: apiKey },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) { return res.json({ valid: false, error: `Asaas retornou HTTP ${r.status}` }); }
    const data = await r.json() as { name?: string };
    await db.update(tenantsTable).set({ asaasApiKey: encrypt(apiKey) }).where(eq(tenantsTable.id, tenantId));
    return res.json({ valid: true, name: data.name });
  } catch {
    return res.json({ valid: false, error: "Timeout ou chave inválida" });
  }
});

// ── POST /onboarding/integracoes/validate-zapsign ──────────────────────────────
router.post("/onboarding/integracoes/validate-zapsign", authenticate, async (req, res) => {
  const tenantId = req.user!.tenantId;
  if (!tenantId) { return res.status(403).json({ error: "Tenant não identificado" }); }
  const { apiKey } = z.object({ apiKey: z.string().min(1) }).parse(req.body);

  try {
    const r = await fetch("https://api.zapsign.com.br/api/v1/users/me/", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) { return res.json({ valid: false, error: `ZapSign retornou HTTP ${r.status}` }); }
    const data = await r.json() as { name?: string; email?: string };
    await db.update(tenantsTable).set({ zapsignApiKey: apiKey }).where(eq(tenantsTable.id, tenantId));
    return res.json({ valid: true, name: data.name ?? data.email });
  } catch {
    return res.json({ valid: false, error: "Timeout ou chave inválida" });
  }
});

// ── GET /onboarding/integracoes/google-url ─────────────────────────────────────
router.get("/onboarding/integracoes/google-url", authenticate, async (req, res) => {
  const tenantId = req.user!.tenantId;
  if (!tenantId) { return res.status(403).json({ error: "Tenant não identificado" }); }
  if (!process.env["GOOGLE_CLIENT_ID"]) {
    return res.status(503).json({ error: "Google Calendar não configurado" });
  }

  let [agenda] = await db
    .select({ id: agendasTable.id })
    .from(agendasTable)
    .where(eq(agendasTable.tenantId, tenantId))
    .limit(1);

  if (!agenda) {
    const [created] = await db.insert(agendasTable).values({
      tenantId,
      nome: "Agenda Principal",
    }).returning({ id: agendasTable.id });
    agenda = created!;
  }

  const url = buildAuthUrl(agenda.id, "/onboarding/integracoes");
  return res.json({ url });
});

export default router;
