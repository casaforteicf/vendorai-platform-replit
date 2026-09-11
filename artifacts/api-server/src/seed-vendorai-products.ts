/**
 * Seeds VendorAI platform products (SKUs) and quote templates.
 * These are system-level products (tenantId = null) used by VendorAI's own sales team.
 *
 * Modelo comercial único (set/2026): existe somente o Growth.
 * - modo por períodos: 5 dias grátis por mês + blocos de 5 dias por R$399,00
 * - assinatura contínua: 5 dias iniciais grátis, R$497 pelos primeiros 30 dias
 *   pagos, R$990/mês nos 5 meses seguintes e R$1.490/mês depois
 * - sem limite de usuários
 * - onboarding padrão autoguiado por agente
 * - implantação humana opcional por R$1.890
 *
 * A assinatura e os passes são controlados pelo lifecycle/accessLicenseCore;
 * este catálogo mantém somente serviços/add-ons cobrados separadamente.
 *
 * Run: pnpm --filter @workspace/api-server exec tsx src/seed-vendorai-products.ts
 */
import { db, produtosCatalogoTable, propostaTemplatesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const SERVICOS_CATEGORY_ID = "5c966c52-dda2-4034-84f0-43f6199932cc"; // "Serviços"

const PRODUCTS = [
  {
    sku: "SETUP-SUPORTE",
    nome: "Implantação VendorAI",
    precoBase: "1890.00",
    productType: "service" as const,
    unidade: "un",
    descricao: "Implantação assistida opcional. O onboarding padrão do Growth é autoguiado pelo agente sem custo adicional.",
  },
];

// SKUs de modelos antigos por tier/add-on que não fazem parte do Growth atual.
const RETIRED_SKUS = [
  "PLAN-GROWTH-M", "PLAN-GROWTH-A", "PLAN-PMEMAIS-M", "PLAN-PMEMAIS-A", "PLAN-ENT-M", "PLAN-ENT-A",
  "SETUP-GROWTH", "SETUP-PMEMAIS", "SETUP-ENT",
  "USER-ADD-GROWTH", "USER-ADD-PMEMAIS", "USER-ADD-ENT",
  "ERP-ADDON-M", "AI-CREDITS-25", "AI-CREDITS-50", "AI-CREDITS-100",
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
        sku: "SETUP-SUPORTE",
        descricao: "Implantação humana opcional: configuração, integrações, parametrização e treinamento — cobrança única",
      },
      {
        nome: "VendorAI Growth",
        quantidade: 1,
        valorUnitario: 497,
        sku: "GROWTH-VENDORAI",
        descricao: "5 dias iniciais grátis; R$497 pelos primeiros 30 dias pagos; R$990/mês pelos 5 meses seguintes; depois R$1.490/mês. Sem limite de usuários.",
      },
    ],
  },
];

const RETIRED_TEMPLATE_SLUGS = [
  "assinatura_com_suporte",
  "growth_monthly", "growth_annual", "pme_plus_monthly", "pme_plus_annual", "enterprise_monthly", "enterprise_annual",
];

async function seed() {
  console.log("Retiring old tiered-plan SKUs...");
  for (const sku of RETIRED_SKUS) {
    await db.update(produtosCatalogoTable).set({ ativo: false, updatedAt: new Date() }).where(eq(produtosCatalogoTable.sku, sku));
  }

  console.log("Seeding VendorAI platform products...");
  for (const p of PRODUCTS) {
    const [existing] = await db
      .select({ id: produtosCatalogoTable.id })
      .from(produtosCatalogoTable)
      .where(eq(produtosCatalogoTable.sku, p.sku))
      .limit(1);

    if (existing) {
      await db
        .update(produtosCatalogoTable)
        .set({
          nome: p.nome,
          descricao: p.descricao,
          precoBase: p.precoBase,
          productType: p.productType,
          unidade: p.unidade,
          ativo: true,
          categoriaId: SERVICOS_CATEGORY_ID,
          updatedAt: new Date(),
        })
        .where(eq(produtosCatalogoTable.sku, p.sku));
      console.log(`  updated: ${p.sku}`);
    } else {
      await db.insert(produtosCatalogoTable).values({
        sku: p.sku,
        nome: p.nome,
        descricao: p.descricao,
        precoBase: p.precoBase,
        productType: p.productType,
        unidade: p.unidade,
        tenantId: null as unknown as string,
        categoriaId: SERVICOS_CATEGORY_ID,
        ativo: true,
      });
      console.log(`  created: ${p.sku}`);
    }
  }

  console.log("\nRetiring old quote templates...");
  for (const slug of RETIRED_TEMPLATE_SLUGS) {
    await db.update(propostaTemplatesTable).set({ isActive: false, updatedAt: new Date() }).where(eq(propostaTemplatesTable.slug, slug));
  }

  console.log("Seeding Growth quote template...");
  for (const t of TEMPLATES) {
    const [existing] = await db
      .select({ id: propostaTemplatesTable.id })
      .from(propostaTemplatesTable)
      .where(eq(propostaTemplatesTable.slug, t.slug))
      .limit(1);

    if (existing) {
      await db
        .update(propostaTemplatesTable)
        .set({ name: t.name, planSlug: t.planSlug, cycle: t.cycle, itens: t.itens, isActive: true, updatedAt: new Date() })
        .where(eq(propostaTemplatesTable.slug, t.slug));
      console.log(`  template updated: ${t.slug}`);
    } else {
      await db.insert(propostaTemplatesTable).values({
        slug: t.slug,
        name: t.name,
        planSlug: t.planSlug,
        cycle: t.cycle,
        itens: t.itens,
        isActive: true,
      });
      console.log(`  template created: ${t.slug}`);
    }
  }

  console.log("\nVendorAI Growth products + templates seeded.");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
