/**
 * Seeds VendorAI platform products (SKUs) and quote templates.
 * These are system-level products (tenantId = null) used by VendorAI's own sales team.
 * Run: pnpm --filter @workspace/api-server exec tsx src/seed-vendorai-products.ts
 */
import { db, produtosCatalogoTable, propostaTemplatesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const PRODUCTS = [
  // ── SaaS Plans ─────────────────────────────────────────────────────────────
  { sku: "PLAN-GROWTH-M",  nome: "Growth Mensal",          precoBase: "1490.00",  productType: "saas_plan"  as const, unidade: "mês"  },
  { sku: "PLAN-GROWTH-A",  nome: "Growth Anual",           precoBase: "14280.00", productType: "saas_plan"  as const, unidade: "ano"  },
  { sku: "PLAN-PMEMAIS-M", nome: "PME+ Mensal",            precoBase: "1890.00",  productType: "saas_plan"  as const, unidade: "mês"  },
  { sku: "PLAN-PMEMAIS-A", nome: "PME+ Anual",             precoBase: "17880.00", productType: "saas_plan"  as const, unidade: "ano"  },
  { sku: "PLAN-ENT-M",     nome: "Enterprise Mensal",      precoBase: "2490.00",  productType: "saas_plan"  as const, unidade: "mês"  },
  { sku: "PLAN-ENT-A",     nome: "Enterprise Anual",       precoBase: "23880.00", productType: "saas_plan"  as const, unidade: "ano"  },
  // ── Implantação (one-time services) ────────────────────────────────────────
  { sku: "SETUP-GROWTH",   nome: "Implantação Growth",     precoBase: "4900.00",  productType: "service"    as const, unidade: "un"   },
  { sku: "SETUP-PMEMAIS",  nome: "Implantação PME+",       precoBase: "6900.00",  productType: "service"    as const, unidade: "un"   },
  { sku: "SETUP-ENT",      nome: "Implantação Enterprise", precoBase: "8900.00",  productType: "service"    as const, unidade: "un"   },
  // ── Usuário extra ──────────────────────────────────────────────────────────
  { sku: "USER-ADD-GROWTH",   nome: "Usuário extra Growth",    precoBase: "89.00",   productType: "saas_addon" as const, unidade: "mês" },
  { sku: "USER-ADD-PMEMAIS",  nome: "Usuário extra PME+",      precoBase: "84.00",   productType: "saas_addon" as const, unidade: "mês" },
  { sku: "USER-ADD-ENT",      nome: "Usuário extra Enterprise", precoBase: "79.00",  productType: "saas_addon" as const, unidade: "mês" },
  // ── Add-ons de produto ─────────────────────────────────────────────────────
  { sku: "ERP-ADDON-M",       nome: "Gestão ERP",               precoBase: "299.00",  productType: "saas_addon" as const, unidade: "mês" },
  // ── Créditos IA ────────────────────────────────────────────────────────────
  { sku: "AI-CREDITS-25",  nome: "Créditos IA R$25",  precoBase: "25.00",  productType: "saas_addon" as const, unidade: "un" },
  { sku: "AI-CREDITS-50",  nome: "Créditos IA R$50",  precoBase: "50.00",  productType: "saas_addon" as const, unidade: "un" },
  { sku: "AI-CREDITS-100", nome: "Créditos IA R$100", precoBase: "100.00", productType: "saas_addon" as const, unidade: "un" },
];

const TEMPLATES = [
  {
    slug: "growth_monthly",
    name: "Growth — Mensal",
    planSlug: "growth",
    cycle: "monthly",
    itens: [
      { nome: "Implantação Growth", quantidade: 1, valorUnitario: 4900, sku: "SETUP-GROWTH", descricao: "Configuração inicial, integração de canais e treinamento da equipe" },
      { nome: "Growth Mensal",      quantidade: 1, valorUnitario: 1490, sku: "PLAN-GROWTH-M", descricao: "Assinatura mensal — até 8 usuários, 5 agentes de IA, WhatsApp + Instagram" },
    ],
  },
  {
    slug: "growth_annual",
    name: "Growth — Anual",
    planSlug: "growth",
    cycle: "annual",
    itens: [
      { nome: "Implantação Growth", quantidade: 1, valorUnitario: 4900,  sku: "SETUP-GROWTH",  descricao: "Configuração inicial, integração de canais e treinamento da equipe" },
      { nome: "Growth Anual",       quantidade: 1, valorUnitario: 14280, sku: "PLAN-GROWTH-A",  descricao: "Assinatura anual (12× R$1.190) — todos os benefícios do plano anual" },
    ],
  },
  {
    slug: "pme_plus_monthly",
    name: "PME+ — Mensal",
    planSlug: "pme_plus",
    cycle: "monthly",
    itens: [
      { nome: "Implantação PME+", quantidade: 1, valorUnitario: 6900, sku: "SETUP-PMEMAIS", descricao: "Setup completo + 7 agentes configurados + Google Calendar" },
      { nome: "PME+ Mensal",      quantidade: 1, valorUnitario: 1890, sku: "PLAN-PMEMAIS-M", descricao: "Assinatura mensal — até 15 usuários, 7 agentes de IA, Prospector Alpha" },
    ],
  },
  {
    slug: "pme_plus_annual",
    name: "PME+ — Anual",
    planSlug: "pme_plus",
    cycle: "annual",
    itens: [
      { nome: "Implantação PME+", quantidade: 1, valorUnitario: 6900,  sku: "SETUP-PMEMAIS", descricao: "Setup completo + 7 agentes configurados + Google Calendar" },
      { nome: "PME+ Anual",       quantidade: 1, valorUnitario: 17880, sku: "PLAN-PMEMAIS-A", descricao: "Assinatura anual (12× R$1.490) + Prospector Alpha incluso" },
    ],
  },
  {
    slug: "enterprise_monthly",
    name: "Enterprise — Mensal",
    planSlug: "enterprise",
    cycle: "monthly",
    itens: [
      { nome: "Implantação Enterprise", quantidade: 1, valorUnitario: 8900, sku: "SETUP-ENT",     descricao: "Implantação premium + consultoria 1h + SLA dedicado" },
      { nome: "Enterprise Mensal",      quantidade: 1, valorUnitario: 2490, sku: "PLAN-ENT-M", descricao: "Assinatura mensal — até 20 usuários, 16 módulos, BYOK, Portal parceiros" },
    ],
  },
  {
    slug: "enterprise_annual",
    name: "Enterprise — Anual",
    planSlug: "enterprise",
    cycle: "annual",
    itens: [
      { nome: "Implantação Enterprise", quantidade: 1, valorUnitario: 8900,  sku: "SETUP-ENT",     descricao: "Implantação premium + consultoria 1h + SLA dedicado" },
      { nome: "Enterprise Anual",       quantidade: 1, valorUnitario: 23880, sku: "PLAN-ENT-A", descricao: "Assinatura anual (12× R$1.990) + todos os benefícios Enterprise" },
    ],
  },
];

async function seed() {
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
        .set({ nome: p.nome, precoBase: p.precoBase, productType: p.productType, unidade: p.unidade, updatedAt: new Date() })
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
        ativo: true,
      });
      console.log(`  created: ${p.sku}`);
    }
  }

  console.log("\nSeeding quote templates...");

  for (const t of TEMPLATES) {
    const [existing] = await db
      .select({ id: propostaTemplatesTable.id })
      .from(propostaTemplatesTable)
      .where(eq(propostaTemplatesTable.slug, t.slug))
      .limit(1);

    if (existing) {
      await db
        .update(propostaTemplatesTable)
        .set({ name: t.name, planSlug: t.planSlug, cycle: t.cycle, itens: t.itens, updatedAt: new Date() })
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
