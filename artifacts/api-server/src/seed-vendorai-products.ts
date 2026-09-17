/**
 * Seeds the canonical VendorAI commercial catalog used by sales/checkout.
 *
 * Commercial model (set/2026):
 * - CRM Free: complete CRM, permanent, 1 user.
 * - CRM Pro + independently purchasable modules for product-led expansion.
 * - Growth: all standard/applicable modules for the tenant segment, unlimited users.
 * - Growth prepaid: 5 free days/month + blocks of 5 days for R$399.
 * - Growth continuous promotional lifecycle stays in commercialOffer/access lifecycle
 *   (5 initial free days, R$497, R$990, then regular R$1.490/month).
 * - Usage-intensive functions are measured through Vendor Credits/quotas; this seed
 *   does not enable quota blocking.
 *
 * Run: pnpm --filter @workspace/api-server exec tsx src/seed-vendorai-products.ts
 */
import { db, produtosCatalogoTable, propostaTemplatesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const PRODUCTS = [
  { sku: "vendor-crm-free", nome: "Vendor CRM Free", precoBase: "0.00", precoMensalidade: "0.00", productType: "saas_plan" as const, recorrencia: "mensal", descricao: "CRM completo para 1 usuário. Módulos premium podem ser ativados separadamente." },
  { sku: "vendor-crm-monthly", nome: "Vendor CRM Pro", precoBase: "49.90", precoMensalidade: "49.90", productType: "saas_plan" as const, recorrencia: "mensal", descricao: "CRM completo para operação em equipe, com franquia maior de assistências de IA." },
  { sku: "vendor-growth-monthly", nome: "VendorAI Growth", precoBase: "1490.00", precoMensalidade: "1490.00", productType: "saas_plan" as const, recorrencia: "mensal", descricao: "Ecossistema VendorAI completo para o segmento, usuários ilimitados e franquias Growth. Valor regular de catálogo." },
  { sku: "vendor-growth-5days", nome: "VendorAI Growth +5 dias", precoBase: "399.00", precoMensalidade: null, productType: "saas_addon" as const, recorrencia: null, descricao: "Bloco pré-pago de 5 dias de acesso Growth. O benefício gratuito de 5 dias/mês é controlado pela licença de acesso." },

  { sku: "vendor-agenda-monthly", nome: "Vendor Agenda", precoBase: "19.90", precoMensalidade: "19.90", productType: "saas_addon" as const, recorrencia: "mensal", descricao: "Agenda, reuniões, lembretes e integrações de calendário." },
  { sku: "vendor-reputation-monthly", nome: "Vendor Reputation", precoBase: "79.00", precoMensalidade: "79.00", productType: "saas_addon" as const, recorrencia: "mensal", descricao: "Reputação, avaliações e relacionamento pós-entrega." },
  { sku: "vendor-propostas-orcamentos-monthly", nome: "Vendor Propostas & Catálogo", precoBase: "99.00", precoMensalidade: "99.00", productType: "saas_addon" as const, recorrencia: "mensal", descricao: "Catálogo, propostas, orçamentos, aprovação, contratos, fechamento e comissões." },
  { sku: "vendor-knowledge-ai-monthly", nome: "Vendor Knowledge AI", precoBase: "99.00", precoMensalidade: "99.00", productType: "saas_addon" as const, recorrencia: "mensal", descricao: "Base de conhecimento e contexto estruturado para IA e equipe." },
  { sku: "vendor-creative-studio-monthly", nome: "Vendor Creative Studio", precoBase: "139.00", precoMensalidade: "139.00", productType: "saas_addon" as const, recorrencia: "mensal", descricao: "Criação visual por IA com imagens, peças e mídia criativa." },
  { sku: "vendor-jarvis-monthly", nome: "Vendor JARVIS", precoBase: "149.00", precoMensalidade: "149.00", productType: "saas_addon" as const, recorrencia: "mensal", descricao: "Inteligência executiva, análises, alertas e próxima melhor ação." },
  { sku: "vendor-automations-monthly", nome: "Vendor Automations", precoBase: "149.00", precoMensalidade: "149.00", productType: "saas_addon" as const, recorrencia: "mensal", descricao: "Fluxos e automações operacionais conectados aos dados do negócio." },
  { sku: "vendor-bi-analytics-monthly", nome: "Vendor BI & Analytics", precoBase: "149.00", precoMensalidade: "149.00", productType: "saas_addon" as const, recorrencia: "mensal", descricao: "Indicadores, relatórios e análises de performance da operação." },
  { sku: "vendor-omnichannel-monthly", nome: "Vendor Omnichannel", precoBase: "199.00", precoMensalidade: "199.00", productType: "saas_addon" as const, recorrencia: "mensal", descricao: "Centraliza conversas e canais comerciais em uma única operação." },
  { sku: "vendor-content-planner-monthly", nome: "Vendor Content Planner", precoBase: "199.00", precoMensalidade: "199.00", productType: "saas_addon" as const, recorrencia: "mensal", descricao: "Planejamento editorial, calendário e estratégia de conteúdo." },
  { sku: "vendor-ads-monthly", nome: "Vendor Ads", precoBase: "199.00", precoMensalidade: "199.00", productType: "saas_addon" as const, recorrencia: "mensal", descricao: "Planejamento e criação de campanhas. Investimento em mídia não está incluído na licença." },
  { sku: "vendor-financeiro-erp-monthly", nome: "Vendor Gestão", precoBase: "299.00", precoMensalidade: "299.00", productType: "saas_addon" as const, recorrencia: "mensal", descricao: "ERP, financeiro, contas a pagar/receber, estoque, compras e fornecedores." },
  { sku: "vendor-marketplace-praca-monthly", nome: "Praça.ai", precoBase: "299.00", precoMensalidade: "299.00", productType: "saas_addon" as const, recorrencia: "mensal", descricao: "Marketplace, pedidos, pagamentos, reputação, entregas e operação logística. Taxas transacionais são separadas." },
  { sku: "vendor-app-builder-monthly", nome: "Vendor App Builder", precoBase: "299.00", precoMensalidade: "299.00", productType: "saas_addon" as const, recorrencia: "mensal", descricao: "Criação e publicação de experiências de app conectadas ao VendorAI." },
  { sku: "vendor-content-studio-monthly", nome: "Vendor Content Studio", precoBase: "399.00", precoMensalidade: "399.00", productType: "saas_addon" as const, recorrencia: "mensal", descricao: "Produção de posts, copies, roteiros, legendas e outras peças de conteúdo por IA." },
  { sku: "vendor-prospector-monthly", nome: "Vendor Prospector", precoBase: "399.00", precoMensalidade: "399.00", productType: "saas_addon" as const, recorrencia: "mensal", descricao: "Busca, enriquecimento e prospecção ativa de novas oportunidades." },
  { sku: "vendor-ai-team-10-monthly", nome: "Vendor AI Team — 10 agentes", precoBase: "499.00", precoMensalidade: "499.00", productType: "saas_addon" as const, recorrencia: "mensal", descricao: "Equipe de agentes para SDR, closer, follow-up, recepção, agendamento, financeiro, cobrança e pós-venda." },
  { sku: "vendor-revenue-scout-monthly", nome: "Vendor Revenue Scout", precoBase: "499.00", precoMensalidade: "499.00", productType: "saas_addon" as const, recorrencia: "mensal", descricao: "Oportunidades, churn, comportamento e inteligência de receita sobre a base." },
  { sku: "vendor-sites-autopilot-monthly", nome: "Vendor Sites & Autopilot", precoBase: "499.00", precoMensalidade: "499.00", productType: "saas_addon" as const, recorrencia: "mensal", descricao: "Sites, landing pages, SEO, blog, conteúdo e Content Autopilot em uma oferta integrada." },

  { sku: "vendor-implementation-cash", nome: "Implantação VendorAI", precoBase: "1890.00", precoMensalidade: null, productType: "service" as const, recorrencia: null, descricao: "Implantação humana opcional: configuração, integrações, parametrização e treinamento. O onboarding padrão é autoguiado." },
  { sku: "vendor-custom-app-cash", nome: "App Personalizado VendorAI", precoBase: "4990.00", precoMensalidade: null, productType: "service" as const, recorrencia: null, descricao: "Projeto personalizado de app conectado ao ecossistema VendorAI." },
] as const;

const RETIRED_SKUS = [
  "PLAN-GROWTH-M", "PLAN-GROWTH-A", "PLAN-PMEMAIS-M", "PLAN-PMEMAIS-A", "PLAN-ENT-M", "PLAN-ENT-A",
  "SETUP-GROWTH", "SETUP-PMEMAIS", "SETUP-ENT",
  "USER-ADD-GROWTH", "USER-ADD-PMEMAIS", "USER-ADD-ENT",
  "ERP-ADDON-M", "AI-CREDITS-25", "AI-CREDITS-50", "AI-CREDITS-100",
  "vendor-pme-completo",
];

const TEMPLATES = [
  {
    slug: "growth_com_implantacao",
    name: "VendorAI Growth + Implantação Assistida",
    planSlug: "growth",
    cycle: "monthly",
    itens: [
      {
        nome: "Implantação VendorAI",
        quantidade: 1,
        valorUnitario: 1890,
        sku: "vendor-implementation-cash",
        descricao: "Implantação humana opcional: configuração, integrações, parametrização e treinamento — cobrança única",
      },
      {
        nome: "VendorAI Growth",
        quantidade: 1,
        valorUnitario: 497,
        sku: "vendor-growth-monthly",
        descricao: "5 dias iniciais grátis; R$497 pelos primeiros 30 dias pagos; R$990/mês pelos 5 meses seguintes; depois R$1.490/mês. Usuários ilimitados e franquias Growth.",
      },
    ],
  },
];

const RETIRED_TEMPLATE_SLUGS = [
  "assinatura_com_suporte",
  "growth_monthly", "growth_annual", "pme_plus_monthly", "pme_plus_annual", "enterprise_monthly", "enterprise_annual",
];

async function seed() {
  console.log("Retiring obsolete VendorAI commercial SKUs...");
  for (const sku of RETIRED_SKUS) {
    await db.update(produtosCatalogoTable).set({ ativo: false, updatedAt: new Date() }).where(eq(produtosCatalogoTable.sku, sku));
  }

  console.log("Seeding canonical VendorAI products...");
  for (const product of PRODUCTS) {
    const [existing] = await db.select({ id: produtosCatalogoTable.id })
      .from(produtosCatalogoTable)
      .where(eq(produtosCatalogoTable.sku, product.sku))
      .limit(1);

    const values = {
      nome: product.nome,
      descricao: product.descricao,
      precoBase: product.precoBase,
      precoMensalidade: product.precoMensalidade,
      productType: product.productType,
      unidade: "un",
      recorrencia: product.recorrencia,
      ativo: true,
      updatedAt: new Date(),
    };

    if (existing) {
      await db.update(produtosCatalogoTable).set(values).where(eq(produtosCatalogoTable.id, existing.id));
      console.log(`  updated: ${product.sku}`);
    } else {
      await db.insert(produtosCatalogoTable).values({
        ...values,
        sku: product.sku,
        tenantId: null as unknown as string,
      });
      console.log(`  created: ${product.sku}`);
    }
  }

  for (const slug of RETIRED_TEMPLATE_SLUGS) {
    await db.update(propostaTemplatesTable).set({ isActive: false, updatedAt: new Date() }).where(eq(propostaTemplatesTable.slug, slug));
  }

  for (const template of TEMPLATES) {
    const [existing] = await db.select({ id: propostaTemplatesTable.id })
      .from(propostaTemplatesTable)
      .where(eq(propostaTemplatesTable.slug, template.slug))
      .limit(1);
    if (existing) {
      await db.update(propostaTemplatesTable).set({
        name: template.name,
        planSlug: template.planSlug,
        cycle: template.cycle,
        itens: template.itens,
        isActive: true,
        updatedAt: new Date(),
      }).where(eq(propostaTemplatesTable.id, existing.id));
    } else {
      await db.insert(propostaTemplatesTable).values({ ...template, isActive: true });
    }
  }

  console.log("VendorAI commercial catalog ready: CRM Free, modules, Growth and services.");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
