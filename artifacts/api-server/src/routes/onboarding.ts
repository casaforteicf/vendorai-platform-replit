import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { z } from "zod/v4";
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

const router: IRouter = Router();

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
});

type WizardData = z.infer<typeof onboardingCompleteSchema>;

function buildContextHeader(data: WizardData): string {
  const lines: string[] = [
    `Você representa a ${data.nomeFantasia}, empresa do segmento ${data.vertical}.`,
  ];
  if (data.publicoAlvo) lines.push(`Público-alvo: ${data.publicoAlvo}.`);
  if (data.diferenciais) lines.push(`Diferencial: ${data.diferenciais}.`);
  if (data.canaisVenda?.length)
    lines.push(`Canais de atendimento: ${data.canaisVenda.join(", ")}.`);
  return lines.join(" ");
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

    // ── 1. Save business profile + mark tenant setup complete ────────────────
    const profileUpdate = {
      nomeFantasia: data.nomeFantasia,
      vertical: data.vertical,
      logoUrl: data.logoUrl ?? null,
      produtos: data.produtos ?? null,
      diferenciais: data.diferenciais ?? null,
      publicoAlvo: data.publicoAlvo ?? null,
      concorrentes: data.concorrentes ?? null,
      canaisVenda: data.canaisVenda ?? null,
      discoveryCompletedAt: now,
      discoveryData: {
        nomeFantasia: data.nomeFantasia,
        vertical: data.vertical,
        diferenciais: data.diferenciais,
        publicoAlvo: data.publicoAlvo,
        concorrentes: data.concorrentes,
        canaisVenda: data.canaisVenda,
      },
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

    const [tenant] = await db
      .update(tenantsTable)
      .set({ setupCompletedAt: now, updatedAt: now })
      .where(eq(tenantsTable.id, tenantId))
      .returning({ setupCompletedAt: tenantsTable.setupCompletedAt });

    req.log.info({ tenantId }, "Onboarding: profile saved, setup marked complete");

    // ── 2. Bloco 3: Auto-config IA ──────────────────────────────────────────
    const promptsApplied: string[] = [];
    let funilCriado = false;

    // Find matching segment template by vertical name
    const [template] = await db
      .select()
      .from(segmentTemplatesTable)
      .where(
        and(
          eq(segmentTemplatesTable.nome, data.vertical),
          eq(segmentTemplatesTable.ativo, true)
        )
      );

    if (template) {
      const promptsSugeridos = (template.promptsSugeridos ?? {}) as Record<
        string,
        string
      >;
      const contextHeader = buildContextHeader(data);

      // Apply prompts enriched with business context
      const [existingConfig] = await db
        .select()
        .from(agentConfigsTable)
        .where(eq(agentConfigsTable.tenantId, tenantId));

      if (existingConfig) {
        const currentAgents: AgentsMap =
          (existingConfig.agents as AgentsMap) ?? {};
        const updatedAgents: AgentsMap = { ...currentAgents };

        for (const agentKey of AGENT_TYPES) {
          const suggestedPrompt = promptsSugeridos[agentKey];
          const existing = currentAgents[agentKey];
          if (suggestedPrompt && !existing?.prompt) {
            updatedAgents[agentKey] = {
              enabled: existing?.enabled ?? false,
              prompt: `${contextHeader}\n\n${suggestedPrompt}`,
            };
            promptsApplied.push(agentKey);
          }
        }

        if (promptsApplied.length > 0) {
          await db
            .update(agentConfigsTable)
            .set({ agents: updatedAgents, updatedAt: now })
            .where(eq(agentConfigsTable.id, existingConfig.id));
        }
      } else {
        const agents: AgentsMap = {};
        for (const agentKey of AGENT_TYPES) {
          const suggestedPrompt = promptsSugeridos[agentKey];
          if (suggestedPrompt) {
            agents[agentKey] = {
              enabled: false,
              prompt: `${contextHeader}\n\n${suggestedPrompt}`,
            };
            promptsApplied.push(agentKey);
          }
        }
        await db.insert(agentConfigsTable).values({ tenantId, agents });
      }

      // Create default funnel if none exists
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

      req.log.info(
        { tenantId, promptsApplied, funilCriado },
        "Onboarding: AI auto-config applied from segment template"
      );
    } else {
      req.log.info(
        { tenantId, vertical: data.vertical },
        "Onboarding: no matching segment template found, skipping AI auto-config"
      );
    }

    // ── 3. Populate Knowledge Base ──────────────────────────────────────────
    const kbArticles: Array<{
      tenantId: string;
      titulo: string;
      conteudo: string;
      categoria: string;
      tags: string[];
    }> = [];

    // Article 1: About the business (always)
    kbArticles.push({
      tenantId,
      titulo: `Sobre a ${data.nomeFantasia}`,
      categoria: "empresa",
      tags: ["empresa", "identidade", data.vertical],
      conteudo: buildAboutContent(data),
    });

    // Article 2: Products/services (if any filled)
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

    // Article 3: Commercial strategy (if any data provided)
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
