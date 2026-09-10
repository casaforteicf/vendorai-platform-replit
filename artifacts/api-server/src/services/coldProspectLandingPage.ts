import { and, eq } from "drizzle-orm";
import { db, generatedSitesTable } from "@workspace/db";
import type { ColdEvidence } from "../lib/coldProspectQuality.js";

export interface ColdProspectLandingPageInput {
  tenantId: string;
  leadId: string;
  companyName: string;
  city?: string | null;
  niche: string;
  segment: string;
  logoUrl?: string | null;
  websiteUrl?: string | null;
  evidence: ColdEvidence[];
  modules: string[];
  fitScore: number;
  painScore: number;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 42);
}

function moduleLabel(value: string): string {
  const labels: Record<string, string> = {
    crm: "CRM e pipeline",
    sdr: "SDR com IA",
    follow_up: "Follow-up automático",
    agendamento: "Agendamento inteligente",
    whatsapp: "WhatsApp integrado",
    marketing: "Marketing e campanhas",
    revenue_scout: "Revenue Scout",
    jarvis: "JARVIS",
  };
  return labels[value] ?? value.replaceAll("_", " ");
}

function buildHtml(input: ColdProspectLandingPageInput): string {
  const company = escapeHtml(input.companyName);
  const city = input.city ? escapeHtml(input.city) : "";
  const niche = escapeHtml(input.niche.replaceAll("_", " "));
  const logo = input.logoUrl
    ? `<img src="${escapeHtml(input.logoUrl)}" alt="${company}" style="max-height:54px;max-width:180px;object-fit:contain" />`
    : "";
  const evidenceCards = input.evidence.slice(0, 6).map((item) => `
    <article class="card">
      <div class="eyebrow">Evidência pública</div>
      <h3>${escapeHtml(item.label)}</h3>
      <p>${escapeHtml(item.value)}</p>
      <small>Fonte: ${escapeHtml(item.source)} · confiança ${escapeHtml(item.confidence)}</small>
    </article>`).join("");
  const moduleCards = input.modules.map((item) => `<li>${escapeHtml(moduleLabel(item))}</li>`).join("");

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Análise comercial — ${company}</title>
<meta name="description" content="Análise externa de oportunidades comerciais preparada para ${company}." />
<style>
:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#101828;background:#f7f8fa}*{box-sizing:border-box}body{margin:0}.wrap{max-width:1080px;margin:auto;padding:28px 20px 64px}.top{display:flex;justify-content:space-between;align-items:center;gap:20px;margin-bottom:48px}.brand{font-weight:800;letter-spacing:-.02em}.hero{background:#fff;border:1px solid #e4e7ec;border-radius:24px;padding:40px;box-shadow:0 12px 40px rgba(16,24,40,.06)}.eyebrow{font-size:12px;text-transform:uppercase;letter-spacing:.12em;color:#667085;font-weight:700}.hero h1{font-size:clamp(32px,5vw,58px);line-height:1.02;letter-spacing:-.045em;margin:14px 0}.hero p{font-size:18px;line-height:1.6;color:#475467;max-width:780px}.pill{display:inline-flex;padding:8px 12px;border-radius:999px;background:#f2f4f7;font-size:13px;margin-right:8px;margin-top:8px}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-top:22px}.card{background:#fff;border:1px solid #e4e7ec;border-radius:18px;padding:20px}.card h3{font-size:17px;margin:8px 0}.card p{font-size:15px;margin:0 0 10px;color:#344054}.card small{font-size:11px;color:#98a2b3}.section{margin-top:48px}.section h2{font-size:30px;letter-spacing:-.03em}.section>p{color:#667085;line-height:1.6;max-width:760px}.modules{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding:0;list-style:none}.modules li{background:#fff;border:1px solid #e4e7ec;border-radius:14px;padding:16px}.cta{margin-top:48px;background:#101828;color:#fff;border-radius:24px;padding:36px}.cta h2{font-size:32px;margin-top:0}.cta p{color:#d0d5dd;max-width:720px}.cta a{display:inline-block;margin-top:10px;background:#fff;color:#101828;text-decoration:none;font-weight:700;padding:14px 20px;border-radius:12px}.note{margin-top:28px;font-size:12px;color:#667085;line-height:1.6}.score{display:flex;gap:12px;flex-wrap:wrap;margin-top:18px}.score div{border:1px solid #e4e7ec;border-radius:14px;padding:12px 16px;background:#fff}.score strong{font-size:22px;display:block}@media(max-width:760px){.grid{grid-template-columns:1fr}.modules{grid-template-columns:1fr}.hero{padding:26px}.top{margin-bottom:28px}}
</style>
</head>
<body>
<main class="wrap">
  <header class="top"><div class="brand">VendorAI</div>${logo}</header>
  <section class="hero">
    <div class="eyebrow">Diagnóstico comercial externo</div>
    <h1>Preparamos uma análise da ${company}</h1>
    <p>Usamos apenas sinais empresariais e digitais publicamente observáveis para identificar oportunidades que podem merecer atenção. Onde não existe evidência externa suficiente, não fazemos afirmações sobre a operação interna.</p>
    ${city ? `<span class="pill">${city}</span>` : ""}<span class="pill">${niche}</span>
    <div class="score"><div><strong>${input.fitScore}</strong><span>Fit do perfil</span></div><div><strong>${input.painScore}</strong><span>Potencial de oportunidade</span></div></div>
  </section>

  <section class="section">
    <div class="eyebrow">O que encontramos</div>
    <h2>Sinais públicos usados nesta análise</h2>
    <p>Esses pontos são evidências externas, não diagnóstico da operação interna da empresa.</p>
    <div class="grid">${evidenceCards}</div>
  </section>

  <section class="section">
    <div class="eyebrow">Demonstração aplicada</div>
    <h2>Como o VendorAI poderia trabalhar na ${company}</h2>
    <p>A configuração abaixo é uma simulação comercial baseada no perfil público encontrado. Ela pode ser ajustada à realidade da empresa em uma demonstração.</p>
    <ul class="modules">${moduleCards}</ul>
  </section>

  <section class="cta">
    <div class="eyebrow" style="color:#98a2b3">Próximo passo</div>
    <h2>Quer ver uma demonstração usando o cenário da ${company}?</h2>
    <p>Podemos transformar esta análise externa em uma demonstração do fluxo comercial, atendimento, follow-up e marketing da empresa.</p>
    <a href="https://appvendorai.com" data-vendorai-cta="demo">Quero ver minha empresa funcionando no VendorAI</a>
  </section>

  <p class="note">Análise produzida a partir de dados empresariais/publicamente acessíveis. Scores são indicadores internos de priorização do VendorAI e não representam auditoria, diagnóstico clínico ou afirmação de resultado financeiro. Dados não verificáveis externamente são tratados como desconhecidos.</p>
</main>
</body>
</html>`;
}

export async function ensureColdProspectLandingPage(input: ColdProspectLandingPageInput) {
  const base = `diagnostico-${slugify(input.companyName) || "empresa"}`;
  const siteSlug = `${base}-${input.leadId.replace(/[^a-zA-Z0-9]/g, "").slice(-8).toLowerCase()}`;

  const [existing] = await db
    .select({ id: generatedSitesTable.id, siteSlug: generatedSitesTable.siteSlug, published: generatedSitesTable.published })
    .from(generatedSitesTable)
    .where(and(eq(generatedSitesTable.tenantId, input.tenantId), eq(generatedSitesTable.siteSlug, siteSlug)))
    .limit(1);

  if (existing) {
    return {
      id: existing.id,
      siteSlug: existing.siteSlug ?? siteSlug,
      publicUrl: `https://${existing.siteSlug ?? siteSlug}.appvendorai.com`,
      published: existing.published,
      reused: true,
    };
  }

  const [created] = await db
    .insert(generatedSitesTable)
    .values({
      tenantId: input.tenantId,
      name: `Diagnóstico — ${input.companyName}`,
      siteType: "landing",
      siteSlug,
      config: {
        type: "landing",
        name: `Diagnóstico — ${input.companyName}`,
        sector: input.segment,
        desc: `Diagnóstico externo personalizado para ${input.companyName}`,
        pain: "Oportunidades identificadas apenas a partir de evidências públicas",
        tone: "profissional",
        cta: "Quero ver minha empresa funcionando no VendorAI",
        color: "#101828",
        logoUrl: input.logoUrl ?? undefined,
        nicheId: `cold-prospect:${input.niche}`,
        nicheName: input.niche,
        campaignName: "Prospecção Inteligente",
        marketingContext: {
          leadId: input.leadId,
          prospectingMode: "cold",
          fitScore: input.fitScore,
          painScore: input.painScore,
          evidence: input.evidence,
          modules: input.modules,
          websiteUrl: input.websiteUrl ?? null,
          policy: "facts_only",
        },
      },
      html: buildHtml(input),
      published: true,
      seoScore: 80,
      seoChecklist: {
        tituloOk: true,
        metaDescriptionOk: true,
        headersOk: true,
        tamanhoMinimoOk: true,
        legibilidadeOk: true,
        imagensAltOk: true,
      },
      analisadoEm: new Date(),
    })
    .returning({ id: generatedSitesTable.id, siteSlug: generatedSitesTable.siteSlug });

  const resolvedSlug = created?.siteSlug ?? siteSlug;
  return {
    id: created?.id ?? null,
    siteSlug: resolvedSlug,
    publicUrl: `https://${resolvedSlug}.appvendorai.com`,
    published: true,
    reused: false,
  };
}
