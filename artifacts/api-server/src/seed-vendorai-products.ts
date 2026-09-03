/**
 * Seeds VendorAI platform products (SKUs) and quote templates.
 * These are system-level products (tenantId = null) used by VendorAI's own sales team.
 *
 * Modelo de negócio único (a partir de set/2026): não existem mais planos
 * Growth/PME+/Enterprise separados. Existe UM produto pago via catálogo —
 * a implantação/suporte avulsa. A assinatura em si (5 dias grátis →
 * R$497/mês 60 dias → R$990/mês 6 meses → R$1.490/mês normal) e o passe
 * avulso de 5 dias (R$399,99) são controlados por accessLicenseCore.ts,
 * não por linhas de catálogo — não precisam de SKU aqui.
 *
 * Run: pnpm --filter @workspace/api-server exec tsx src/seed-vendorai-products.ts
 */
import { db, produtosCatalogoTable, propostaTemplatesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const SERVICOS_CATEGORY_ID = "5c966c52-dda2-4034-84f0-43f6199932cc"; // "Serviços"

const PRODUCTS = [
  { sku: "SETUP-SUPORTE", nome: "Implantação e Suporte", precoBase: "1890.00", productType: "service" as const, unidade: "un" },
];

// SKUs de um modelo antigo (planos por tier) que não existe mais — mantidos
// aqui só pra garantir que ficam desativados mesmo se o seed rodar de novo
// em algum ambiente que ainda os tenha.
const RETIRED_SKUS = [
  "PLAN-GROWTH-M", "PLAN-GROWTH-A", "PLAN-PMEMAIS-M", "PLAN-PMEMAIS-A", "PLAN-ENT-M", "PLAN-ENT-A",
  "SETUP-GROWTH", "SETUP-PMEMAIS", "SETUP-ENT",
  "USER-ADD-GROWTH", "USER-ADD-PMEMAIS", "USER-ADD-ENT",
  "ERP-ADDON-M", "AI-CREDITS-25", "AI-CREDITS-50", "AI-CREDITS-100",
];

const TEMPLATES = [
  {
    slug: "assinatura_com_suporte",
    name: "Vendor.ai — Assinatura + Implantação",
    planSlug: "assinatura",
    cycle: "monthly",
    itens: [
      { nome: "Implantação e Suporte", quantidade: 1, valorUnitario: 1890, sku: "SETUP-SUPORTE", descricao: "Configuração inicial, integração de canais e treinamento da equipe — cobrança única" },
      { nome: "Assinatura Vendor.ai", quantidade: 1, valorUnitario: 497, sku: "ASSINATURA-VENDORAI", descricao: "R$497/mês nos primeiros 60 dias, R$990/mês nos 6 meses seguintes, depois R$1.490/mês" },
    ],
  },
];

const RETIRED_TEMPLATE_SLUGS = [
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
        .set({ nome: p.nome, precoBase: p.precoBase, productType: p.productType, unidade: p.unidade, ativo: true, categoriaId: SERVICOS_CATEGORY_ID, updatedAt: new Date() })
        .where(eq(produtosCatalogoTable.sku, p.sku));
      console.log(`  updated: ${p.sku}`);
    } else {
      await db.insert(produtosCatalogoTable).values({
        sku: p.sku,
        nome: p.nome,
        precoBase: p.precoBase,
        productType: p.productType,
        unidade: p.unidade,
        tenantId: null as unknown as string, // platform product
        categoriaId: SERVICOS_CATEGORY_ID,
        ativo: true,
      });
      console.log(`  created: ${p.sku}`);
    }
  }

  console.log("\nRetiring old tiered-plan quote templates...");
  for (const slug of RETIRED_TEMPLATE_SLUGS) {
    await db.update(propostaTemplatesTable).set({ isActive: false, updatedAt: new Date() }).where(eq(propostaTemplatesTable.slug, slug));
  }

  console.log("Seeding quote templates...");
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

  console.log("\nVendorAI products + templates seeded.");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
