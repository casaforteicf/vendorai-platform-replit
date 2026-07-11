import puppeteer from "puppeteer-core";

const CHROMIUM_PATH =
  process.env["CHROMIUM_PATH"] ??
  "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium-browser";

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmtBR = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit", month: "long", year: "numeric", timeZone: "America/Sao_Paulo",
});

function money(v: number) { return fmtBRL.format(v); }
function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const PLAN_FEATURES: Record<string, string[]> = {
  "Growth Mensal": [
    "Agente SDR (prospecção e qualificação de leads)",
    "Agente Closer (fechamento e negociação)",
    "Atendimento via WhatsApp 24h/7 dias",
    "CRM com pipeline Kanban",
    "Até 3 usuários simultâneos",
    "Relatórios de performance básicos",
    "Suporte por e-mail",
  ],
  "Growth Anual": [
    "Agente SDR (prospecção e qualificação de leads)",
    "Agente Closer (fechamento e negociação)",
    "Atendimento via WhatsApp 24h/7 dias",
    "CRM com pipeline Kanban",
    "Até 3 usuários simultâneos",
    "Relatórios de performance básicos",
    "Suporte por e-mail",
    "Desconto fidelidade — contrato anual",
  ],
  "PME+ Mensal": [
    "Todos os recursos do plano Growth",
    "Agente de Follow-up automático",
    "Agente Financeiro (cobrança e inadimplência)",
    "Agente de Reativação de clientes inativos",
    "Até 10 usuários simultâneos",
    "Integrações com Instagram e Google Calendar",
    "Relatórios avançados com IA",
    "Suporte prioritário",
  ],
  "PME+ Anual": [
    "Todos os recursos do plano Growth",
    "Agente de Follow-up automático",
    "Agente Financeiro (cobrança e inadimplência)",
    "Agente de Reativação de clientes inativos",
    "Até 10 usuários simultâneos",
    "Integrações com Instagram e Google Calendar",
    "Relatórios avançados com IA",
    "Suporte prioritário",
    "Desconto fidelidade — contrato anual",
  ],
  "Enterprise Mensal": [
    "Todos os recursos do plano PME+",
    "Agentes personalizados por vertical (construção, saúde, alimentos…)",
    "Multi-canal: WhatsApp, Instagram, E-mail simultâneos",
    "Usuários ilimitados",
    "Integrações via API (ERP, sistemas externos)",
    "Análise de inteligência de mercado com IA",
    "Gerente de sucesso dedicado",
    "SLA de suporte 4h",
  ],
  "Enterprise Anual": [
    "Todos os recursos do plano PME+",
    "Agentes personalizados por vertical (construção, saúde, alimentos…)",
    "Multi-canal: WhatsApp, Instagram, E-mail simultâneos",
    "Usuários ilimitados",
    "Integrações via API (ERP, sistemas externos)",
    "Análise de inteligência de mercado com IA",
    "Gerente de sucesso dedicado",
    "SLA de suporte 4h",
    "Desconto fidelidade — contrato anual",
  ],
};

const DEFAULT_FEATURES = [
  "Atendimento automatizado via WhatsApp com IA",
  "CRM com pipeline de oportunidades",
  "Agentes de vendas inteligentes",
  "Relatórios e analytics",
  "Suporte técnico dedicado",
];

export interface QuoteComercialOptions {
  leadNome: string;
  numero: string;
  nomePlano: string;
  precoImplantacao: number;
  precoMensalidade: number;
  recorrencia?: string | null;
  empresaNome?: string;
}

function buildHtml(opts: QuoteComercialOptions): string {
  const emitidoEm = fmtBR.format(new Date());
  const validadeDate = new Date();
  validadeDate.setDate(validadeDate.getDate() + 30);
  const validadeEm = fmtBR.format(validadeDate);
  const features = PLAN_FEATURES[opts.nomePlano] ?? DEFAULT_FEATURES;
  const recLabel = opts.recorrencia === "anual" ? "/mês (anual)" : "/mês";
  const empresaNome = opts.empresaNome ?? "VendorAI";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 10pt; color: #1a1a1a; background: #fff; }

  .header {
    background: linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%);
    color: white;
    padding: 32px 40px 28px;
  }
  .header-brand { font-size: 22pt; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 4px; }
  .header-brand span { color: #93c5fd; }
  .header-tagline { font-size: 10pt; opacity: 0.75; margin-bottom: 20px; }
  .header-meta { display: flex; gap: 32px; margin-top: 16px; }
  .header-meta-item { font-size: 9pt; opacity: 0.85; }
  .header-meta-item strong { display: block; font-size: 11pt; opacity: 1; }

  .lead-section {
    background: #f0f7ff;
    border-left: 4px solid #2563eb;
    padding: 18px 40px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .lead-name { font-size: 14pt; font-weight: 700; color: #1e3a5f; }
  .lead-label { font-size: 8.5pt; color: #64748b; margin-bottom: 3px; }
  .validity-badge {
    background: #fef3c7;
    border: 1px solid #f59e0b;
    border-radius: 6px;
    padding: 8px 16px;
    text-align: center;
  }
  .validity-badge .val-num { font-size: 11pt; font-weight: 700; color: #d97706; }
  .validity-badge .val-lbl { font-size: 8pt; color: #92400e; }

  .plan-section { padding: 28px 40px 20px; }
  .section-title { font-size: 12pt; font-weight: 700; color: #1e3a5f; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 2px solid #2563eb; }

  .plan-card { border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; }
  .plan-card-header {
    background: #1e3a5f;
    color: white;
    padding: 14px 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .plan-name { font-size: 13pt; font-weight: 700; }
  .plan-badge { background: rgba(255,255,255,0.2); border-radius: 999px; padding: 3px 12px; font-size: 9pt; }

  .plan-pricing { display: flex; gap: 0; border-bottom: 1px solid #e2e8f0; }
  .pricing-item { flex: 1; padding: 18px 24px; text-align: center; }
  .pricing-item:first-child { border-right: 1px solid #e2e8f0; }
  .pricing-label { font-size: 8.5pt; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
  .pricing-value { font-size: 18pt; font-weight: 800; color: #1e3a5f; }
  .pricing-sub { font-size: 8.5pt; color: #94a3b8; margin-top: 3px; }

  .plan-features { padding: 20px 24px; }
  .features-title { font-size: 9pt; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; }
  .feature-item { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 8px; font-size: 9.5pt; color: #334155; }
  .feature-check { color: #10b981; font-weight: 700; flex-shrink: 0; margin-top: 1px; }

  .total-section {
    background: #f8fafc;
    border-top: 2px solid #e2e8f0;
    padding: 20px 40px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .total-label { font-size: 10pt; color: #64748b; }
  .total-box { text-align: right; }
  .total-impl { font-size: 10pt; color: #475569; margin-bottom: 4px; }
  .total-impl strong { color: #1e3a5f; font-size: 12pt; }
  .total-mens { font-size: 9pt; color: #64748b; }
  .total-mens strong { color: #2563eb; font-size: 10pt; }

  .footer {
    padding: 16px 40px;
    border-top: 1px solid #e2e8f0;
    display: flex;
    justify-content: space-between;
    font-size: 8.5pt;
    color: #94a3b8;
  }
  .footer-contact { font-size: 8.5pt; color: #64748b; }
  .footer-contact strong { color: #1e3a5f; }

  .terms-section { padding: 16px 40px 0; }
  .terms-text { font-size: 8pt; color: #94a3b8; line-height: 1.6; }
</style>
</head>
<body>

<div class="header">
  <div class="header-brand">Vendor<span>AI</span></div>
  <div class="header-tagline">Plataforma de CRM com IA para vendas no WhatsApp</div>
  <div class="header-meta">
    <div class="header-meta-item">
      Nº do Orçamento<strong>${esc(opts.numero)}</strong>
    </div>
    <div class="header-meta-item">
      Emitido em<strong>${esc(emitidoEm)}</strong>
    </div>
    <div class="header-meta-item">
      Validade<strong>${esc(validadeEm)}</strong>
    </div>
  </div>
</div>

<div class="lead-section">
  <div>
    <div class="lead-label">Proposta elaborada para</div>
    <div class="lead-name">${esc(opts.leadNome)}</div>
  </div>
  <div class="validity-badge">
    <div class="val-num">30 dias</div>
    <div class="val-lbl">validade desta proposta</div>
  </div>
</div>

<div class="plan-section">
  <div class="section-title">Plano Proposto</div>
  <div class="plan-card">
    <div class="plan-card-header">
      <div class="plan-name">${esc(opts.nomePlano)}</div>
      <div class="plan-badge">VendorAI</div>
    </div>

    <div class="plan-pricing">
      <div class="pricing-item">
        <div class="pricing-label">Implantação (taxa única)</div>
        <div class="pricing-value">${esc(money(opts.precoImplantacao))}</div>
        <div class="pricing-sub">pago uma única vez</div>
      </div>
      <div class="pricing-item">
        <div class="pricing-label">Mensalidade</div>
        <div class="pricing-value">${esc(money(opts.precoMensalidade))}</div>
        <div class="pricing-sub">${esc(recLabel)}</div>
      </div>
    </div>

    <div class="plan-features">
      <div class="features-title">O que está incluído neste plano</div>
      ${features.map((f) => `
      <div class="feature-item">
        <span class="feature-check">✓</span>
        <span>${esc(f)}</span>
      </div>`).join("")}
    </div>
  </div>
</div>

<div class="total-section">
  <div class="total-label">Resumo do investimento</div>
  <div class="total-box">
    <div class="total-impl">Implantação: <strong>${esc(money(opts.precoImplantacao))}</strong></div>
    <div class="total-mens">Mensalidade recorrente: <strong>${esc(money(opts.precoMensalidade))}${esc(recLabel)}</strong></div>
  </div>
</div>

<div class="terms-section">
  <div class="terms-text">
    Este orçamento tem validade de 30 dias a partir da data de emissão. Os valores podem ser revisados após esse prazo.
    O início da implantação ocorre após confirmação do pagamento da taxa de implantação.
    A mensalidade é cobrada a partir do primeiro mês de uso, após a ativação da plataforma.
  </div>
</div>

<div class="footer">
  <div class="footer-contact">
    <strong>${esc(empresaNome)}</strong> · appvendorai.com · contato@appvendorai.com
  </div>
  <div>Gerado automaticamente · ${esc(emitidoEm)}</div>
</div>

</body>
</html>`;
}

export async function generateQuoteComercialPdf(opts: QuoteComercialOptions): Promise<Buffer> {
  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.setContent(buildHtml(opts), { waitUntil: "domcontentloaded", timeout: 30000 });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
