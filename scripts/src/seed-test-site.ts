import { db } from "@workspace/db";
import { tenantsTable, siteConfigTable, generatedSitesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const SLUG = "vendorai-demo";
const TENANT_NAME = "VendorAI Demo";

const DEMO_HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>VendorAI Demo — Site de Teste</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;color:#1e293b}
  .hero{background:linear-gradient(135deg,#1e3a5f 0%,#3b82f6 100%);color:#fff;padding:80px 24px;text-align:center}
  .hero h1{font-size:2.5rem;font-weight:800;margin-bottom:16px}
  .hero p{font-size:1.2rem;opacity:.9;max-width:560px;margin:0 auto 32px}
  .btn{display:inline-block;background:#fff;color:#1e3a5f;font-weight:700;padding:14px 32px;border-radius:8px;text-decoration:none;font-size:1rem}
  .section{padding:64px 24px;max-width:900px;margin:0 auto;text-align:center}
  .section h2{font-size:1.8rem;font-weight:700;margin-bottom:16px;color:#1e3a5f}
  .section p{color:#64748b;font-size:1rem;line-height:1.7}
  .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:24px;margin-top:40px}
  .card{background:#fff;border-radius:12px;padding:28px;box-shadow:0 2px 8px rgba(0,0,0,.08);text-align:left}
  .card .emoji{font-size:2rem;margin-bottom:12px}
  .card h3{font-size:1rem;font-weight:700;margin-bottom:8px;color:#1e3a5f}
  .card p{font-size:.875rem;color:#64748b;line-height:1.6}
  .cta-section{background:#1e3a5f;color:#fff;padding:64px 24px;text-align:center}
  .cta-section h2{font-size:2rem;font-weight:800;margin-bottom:16px}
  .cta-section p{font-size:1rem;opacity:.85;margin-bottom:32px}
  .btn-wpp{display:inline-block;background:#25d366;color:#fff;font-weight:700;padding:16px 36px;border-radius:8px;text-decoration:none;font-size:1rem}
  footer{text-align:center;padding:24px;color:#94a3b8;font-size:.875rem}
  .badge{display:inline-block;background:#dbeafe;color:#1e40af;font-size:.75rem;font-weight:600;padding:4px 10px;border-radius:20px;margin-bottom:12px}
</style>
</head>
<body>

<div class="hero">
  <div class="badge">✅ Site de Teste — VendorAI</div>
  <h1>Transforme suas vendas com IA</h1>
  <p>CRM inteligente com automação de WhatsApp, análise de leads e gerador de sites para o seu negócio crescer.</p>
  <a href="https://wa.me/5511999999999" class="btn">Falar com especialista</a>
</div>

<div class="section">
  <h2>Por que escolher a VendorAI?</h2>
  <p>Plataforma completa de CRM com inteligência artificial para automatizar conversas, qualificar leads e fechar mais negócios.</p>
  <div class="cards">
    <div class="card">
      <div class="emoji">🤖</div>
      <h3>IA no WhatsApp</h3>
      <p>Agentes autônomos que conversam com seus clientes 24h, qualificam e encaminham para o vendedor certo.</p>
    </div>
    <div class="card">
      <div class="emoji">📊</div>
      <h3>CRM Completo</h3>
      <p>Pipeline de vendas, histórico de conversas, análise de performance e relatórios em tempo real.</p>
    </div>
    <div class="card">
      <div class="emoji">🌐</div>
      <h3>Gerador de Sites</h3>
      <p>Crie o site do seu negócio em minutos com IA — sem precisar de programador ou designer.</p>
    </div>
    <div class="card">
      <div class="emoji">🎯</div>
      <h3>Prospecção Ativa</h3>
      <p>Encontre novos clientes potenciais no Google Maps e LinkedIn automaticamente.</p>
    </div>
  </div>
</div>

<div class="cta-section">
  <h2>Comece agora mesmo</h2>
  <p>Site de demonstração do módulo Gerador de Sites com IA da plataforma VendorAI.</p>
  <a href="https://wa.me/5511999999999" class="btn-wpp">💬 Falar pelo WhatsApp</a>
</div>

<footer>
  © 2025 VendorAI — Site gerado automaticamente para testes de subdomínio
</footer>

</body>
</html>`;

async function main() {
  console.log(`🌱 Seed: tenant de teste "${SLUG}"`);

  // 1. Upsert tenant
  let [tenant] = await db
    .select({ id: tenantsTable.id, slug: tenantsTable.slug })
    .from(tenantsTable)
    .where(eq(tenantsTable.slug, SLUG));

  if (!tenant) {
    const [created] = await db
      .insert(tenantsTable)
      .values({
        name: TENANT_NAME,
        slug: SLUG,
        status: "active",
        provisioningMethod: "trial",
      })
      .returning({ id: tenantsTable.id, slug: tenantsTable.slug });
    tenant = created;
    console.log(`  ✅ Tenant criado: ${tenant.id}`);
  } else {
    console.log(`  ℹ️  Tenant já existe: ${tenant.id}`);
  }

  // 2. Upsert site_config (ativo = true)
  const [existingConfig] = await db
    .select({ id: siteConfigTable.id })
    .from(siteConfigTable)
    .where(eq(siteConfigTable.tenantId, tenant.id));

  if (!existingConfig) {
    await db.insert(siteConfigTable).values({
      tenantId: tenant.id,
      tipo: "landing_page",
      template: "padrao",
      tagline: "CRM com IA para fechar mais vendas",
      sobreEmpresa: "Plataforma de CRM com inteligência artificial",
      whatsappContato: "+5511999999999",
      ativo: true,
      status: "published",
    });
    console.log(`  ✅ site_config criado (ativo=true)`);
  } else {
    await db
      .update(siteConfigTable)
      .set({ ativo: true, status: "published" })
      .where(eq(siteConfigTable.tenantId, tenant.id));
    console.log(`  ✅ site_config atualizado (ativo=true)`);
  }

  // 3. Insert generated_sites with published HTML
  const [existingSite] = await db
    .select({ id: generatedSitesTable.id })
    .from(generatedSitesTable)
    .where(eq(generatedSitesTable.tenantId, tenant.id));

  if (!existingSite) {
    await db.insert(generatedSitesTable).values({
      tenantId: tenant.id,
      name: "Site Demo",
      siteType: "landing",
      config: {
        type: "landing",
        name: TENANT_NAME,
        sector: "SaaS / Tecnologia",
        desc: "Plataforma de CRM com IA para automação de vendas",
        tone: "profissional",
        color: "#1e3a5f",
        whatsapp: "+5511999999999",
      },
      html: DEMO_HTML,
      published: true,
    });
    console.log(`  ✅ generated_sites criado (published=true)`);
  } else {
    await db
      .update(generatedSitesTable)
      .set({ html: DEMO_HTML, published: true })
      .where(eq(generatedSitesTable.tenantId, tenant.id));
    console.log(`  ✅ generated_sites atualizado (published=true)`);
  }

  console.log(`\n✅ Pronto! Teste em:`);
  console.log(`   /api/public/${SLUG}/site`);
  console.log(`   /api/public/${SLUG}/site-html`);
  console.log(`   https://${SLUG}.appvendorai.com  (após DNS)`);
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Erro:", err);
  process.exit(1);
});
