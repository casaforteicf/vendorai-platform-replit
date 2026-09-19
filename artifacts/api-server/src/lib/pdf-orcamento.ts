import puppeteer from "puppeteer-core";

const CHROMIUM_PATH =
  process.env["CHROMIUM_PATH"] ??
  "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium-browser";

// ─── Formatters ───────────────────────────────────────────────────────────────

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmtBR = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo",
});
const fmtNum = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

function money(v: number) { return fmtBRL.format(v); }
function num(v: number) { return fmtNum.format(v); }
function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OrcamentoItem {
  nome: string;
  unidade: string;
  quantidade: string | number;
  custoUnitario: string | number;
  bdi?: string | number | null;
}

export interface OrcamentoEtapa {
  nome: string;
  ordem?: number;
  itens: OrcamentoItem[];
}

export interface PdfOrcamentoOptions {
  tenantName: string;
  obraNome: string;
  obraEndereco?: string | null;
  orcamentoVersao?: number;
  orcamentoTitulo?: string | null;
  orcamentoStatus?: string;
  bdiGlobal: string | number;
  modoPrecificacao?: string | null;
  custosIndiretosPct?: string | number | null;
  administracaoPct?: string | number | null;
  riscoPct?: string | number | null;
  financeiroPct?: string | number | null;
  impostosPct?: string | number | null;
  comissaoPct?: string | number | null;
  margemPct?: string | number | null;
  descontoPct?: string | number | null;
  areaReferencia?: string | number | null;
  etapas: OrcamentoEtapa[];
}

// ─── Calculations ─────────────────────────────────────────────────────────────

function calcItem(item: OrcamentoItem, bdiGlobal: number, detailed = false): number {
  const qty = Number(item.quantidade) || 0;
  const cost = Number(item.custoUnitario) || 0;
  const direct = qty * cost;
  if (detailed) return direct;
  const bdi = item.bdi != null ? Number(item.bdi) : bdiGlobal;
  return direct * (1 + bdi / 100);
}

function calcEtapa(etapa: OrcamentoEtapa, bdiGlobal: number, detailed = false): number {
  return etapa.itens.reduce((s, i) => s + calcItem(i, bdiGlobal, detailed), 0);
}

function calcDetailedPrice(directCost: number, opts: PdfOrcamentoOptions) {
  const n = (value: string | number | null | undefined) => Number(value ?? 0) || 0;
  const operational =
    n(opts.custosIndiretosPct) +
    n(opts.administracaoPct) +
    n(opts.riscoPct) +
    n(opts.financeiroPct);
  const enterpriseCost = directCost * (1 + operational / 100);
  const salesPct = n(opts.impostosPct) + n(opts.comissaoPct) + n(opts.margemPct);
  if (salesPct >= 100) return { enterpriseCost, salePrice: 0 };
  const tablePrice = enterpriseCost / Math.max(0.0001, 1 - salesPct / 100);
  const salePrice = tablePrice * (1 - Math.min(100, n(opts.descontoPct)) / 100);
  return { enterpriseCost, salePrice };
}

// ─── HTML template ────────────────────────────────────────────────────────────

function buildHtml(opts: PdfOrcamentoOptions): string {
  const bdiGlobal = Number(opts.bdiGlobal) || 0;
  const detailed = opts.modoPrecificacao === "detalhada";
  const directOrBdiTotal = opts.etapas.reduce((s, e) => s + calcEtapa(e, bdiGlobal, detailed), 0);
  const detailedPrice = calcDetailedPrice(directOrBdiTotal, opts);
  const totalGeral = detailed ? detailedPrice.salePrice : directOrBdiTotal;

  const statusLabel: Record<string, string> = {
    rascunho: "Rascunho",
    aprovado: "Aprovado",
    em_revisao: "Em revisão",
  };

  function renderItems(etapa: OrcamentoEtapa) {
    return etapa.itens.map((item, i) => {
      const bdiItem = item.bdi != null ? Number(item.bdi) : bdiGlobal;
      const total = calcItem(item, bdiGlobal, detailed);
      return `
      <tr class="${i % 2 === 0 ? "row-even" : "row-odd"}">
        <td class="td-nome">${esc(item.nome)}</td>
        <td class="td-center">${esc(item.unidade)}</td>
        <td class="td-right">${num(Number(item.quantidade) || 0)}</td>
        <td class="td-right">${money(Number(item.custoUnitario) || 0)}</td>
        <td class="td-center">${detailed ? "—" : `${num(bdiItem)}%`}</td>
        <td class="td-right td-total">${money(total)}</td>
      </tr>`;
    }).join("");
  }

  function renderEtapas() {
    return opts.etapas.map((etapa) => {
      const etapaTotal = calcEtapa(etapa, bdiGlobal, detailed);
      const baseTotal = detailed ? directOrBdiTotal : totalGeral;
      const pct = baseTotal > 0 ? ((etapaTotal / baseTotal) * 100).toFixed(1) : "0.0";
      return `
      <tr class="row-etapa">
        <td colspan="5" class="td-etapa-nome">📐 ${esc(etapa.nome)}</td>
        <td class="td-right td-etapa-total">${money(etapaTotal)} <span class="pct">(${pct}%)</span></td>
      </tr>
      ${renderItems(etapa)}
      <tr class="row-subtotal">
        <td colspan="5" class="td-subtotal-label">Subtotal — ${esc(etapa.nome)}</td>
        <td class="td-right td-subtotal-value">${money(etapaTotal)}</td>
      </tr>`;
    }).join("");
  }

  const emitidoEm = fmtBR.format(new Date());
  const titulo = opts.orcamentoTitulo
    ? esc(opts.orcamentoTitulo)
    : `Orçamento v${opts.orcamentoVersao ?? 1}`;
  const status = statusLabel[opts.orcamentoStatus ?? ""] ?? (opts.orcamentoStatus ?? "");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 10pt; color: #1a1a1a; background: #fff; }

  .report-header {
    background: linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%);
    color: white;
    padding: 28px 36px 24px;
    border-bottom: 4px solid #f59e0b;
  }
  .report-header h1 { font-size: 19pt; font-weight: 700; margin-bottom: 4px; }
  .report-header .subtitle { font-size: 11.5pt; opacity: 0.85; margin-bottom: 10px; }
  .header-meta { display: flex; gap: 24px; flex-wrap: wrap; margin-top: 10px; }
  .header-meta-item { font-size: 9.5pt; opacity: 0.9; }
  .header-meta-item strong { opacity: 1; }
  .company-name { font-size: 10pt; font-weight: 600; opacity: 0.7; margin-bottom: 5px; letter-spacing: 0.5px; text-transform: uppercase; }
  .badge {
    display: inline-block;
    font-size: 9pt;
    padding: 2px 10px;
    border-radius: 999px;
    background: rgba(255,255,255,0.2);
    border: 1px solid rgba(255,255,255,0.4);
    margin-left: 10px;
    vertical-align: middle;
  }

  .summary { display: flex; gap: 14px; padding: 18px 36px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
  .summary-card { flex: 1; background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; text-align: center; }
  .summary-card .num { font-size: 15pt; font-weight: 700; color: #2563eb; }
  .summary-card .lbl { font-size: 8.5pt; color: #64748b; margin-top: 2px; }

  .section { padding: 20px 36px; }
  .section-title { font-size: 12pt; font-weight: 700; color: #1e3a5f; margin-bottom: 14px; padding-bottom: 7px; border-bottom: 2px solid #2563eb; }

  table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
  th {
    background: #1e3a5f; color: white; text-align: left;
    padding: 8px 10px; font-size: 9pt; font-weight: 600;
  }
  th.th-right { text-align: right; }
  th.th-center { text-align: center; }
  td { padding: 6px 10px; border-bottom: 1px solid #f1f5f9; }
  .row-even { background: #fff; }
  .row-odd { background: #f9fafb; }
  .td-right { text-align: right; }
  .td-center { text-align: center; }
  .td-nome { max-width: 220px; }
  .td-total { font-weight: 600; color: #1e3a5f; }

  .row-etapa td { background: #eff6ff; font-weight: 700; color: #1e40af; border-top: 2px solid #bfdbfe; border-bottom: 1px solid #bfdbfe; padding: 8px 10px; page-break-before: auto; }
  .td-etapa-nome { font-size: 10pt; }
  .td-etapa-total { text-align: right; font-size: 10pt; }
  .pct { font-size: 8.5pt; font-weight: 400; color: #6b7280; }

  .row-subtotal td { background: #f0f9ff; font-weight: 600; border-top: 1px solid #bae6fd; border-bottom: 2px solid #bae6fd; padding: 7px 10px; }
  .td-subtotal-label { color: #0369a1; font-size: 9.5pt; }
  .td-subtotal-value { text-align: right; color: #0369a1; font-size: 10pt; }

  .row-total td { background: #1e3a5f; color: white; font-weight: 700; font-size: 11pt; padding: 10px 12px; }
  .row-total .td-right { text-align: right; }

  .bdi-note { font-size: 9pt; color: #64748b; margin-top: 10px; font-style: italic; }

  .report-footer {
    margin-top: 24px;
    padding: 14px 36px;
    background: #f8fafc;
    border-top: 1px solid #e2e8f0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 8.5pt;
    color: #94a3b8;
  }

  @media print {
    .row-etapa { page-break-before: auto; }
    tr { page-break-inside: avoid; }
  }
</style>
</head>
<body>

<div class="report-header">
  <div class="company-name">${esc(opts.tenantName)}</div>
  <h1>📊 Orçamento de Obra <span class="badge">${esc(status)}</span></h1>
  <div class="subtitle">${esc(opts.obraNome)} — ${titulo}</div>
  <div class="header-meta">
    ${opts.obraEndereco ? `<div class="header-meta-item">📍 <strong>${esc(opts.obraEndereco)}</strong></div>` : ""}
    <div class="header-meta-item">📋 Precificação: <strong>${detailed ? "Detalhada" : `BDI ${num(bdiGlobal)}%`}</strong></div>
    <div class="header-meta-item">🗓 Emitido em: <strong>${emitidoEm}</strong></div>
  </div>
</div>

<div class="summary">
  <div class="summary-card">
    <div class="num">${opts.etapas.length}</div>
    <div class="lbl">Etapas</div>
  </div>
  <div class="summary-card">
    <div class="num">${opts.etapas.reduce((s, e) => s + e.itens.length, 0)}</div>
    <div class="lbl">Itens</div>
  </div>
  <div class="summary-card">
    <div class="num" style="font-size:12pt">${money(totalGeral)}</div>
    <div class="lbl">${detailed ? "Preço de venda" : "Total com BDI"}</div>
  </div>
</div>

<div class="section">
  <h2 class="section-title">Composição do Orçamento</h2>
  <table>
    <thead>
      <tr>
        <th>Item / Serviço</th>
        <th class="th-center">Un.</th>
        <th class="th-right">Qtd.</th>
        <th class="th-right">Custo Unit.</th>
        <th class="th-center">${detailed ? "BDI" : "BDI %"}</th>
        <th class="th-right">Total</th>
      </tr>
    </thead>
    <tbody>
      ${renderEtapas()}
      <tr class="row-total">
        <td colspan="5">TOTAL GERAL</td>
        <td class="td-right">${money(totalGeral)}</td>
      </tr>
    </tbody>
  </table>
  <p class="bdi-note">${detailed
    ? `* Custo direto: ${money(directOrBdiTotal)} · custo empresarial: ${money(detailedPrice.enterpriseCost)} · impostos ${num(Number(opts.impostosPct ?? 0))}% · comissão ${num(Number(opts.comissaoPct ?? 0))}% · margem definida ${num(Number(opts.margemPct ?? 0))}% · desconto ${num(Number(opts.descontoPct ?? 0))}%.`
    : `* BDI (Benefícios e Despesas Indiretas) de ${num(bdiGlobal)}% aplicado sobre o custo direto. Itens com BDI individual sobrescrevem o global.`
  }</p>
</div>

<div class="report-footer">
  <span>${esc(opts.tenantName)} — Orçamento: ${esc(opts.obraNome)}</span>
  <span>Total: ${money(totalGeral)} · Emitido em ${emitidoEm}</span>
</div>

</body>
</html>`;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function gerarOrcamentoPdf(opts: PdfOrcamentoOptions): Promise<Buffer> {
  const html = buildHtml(opts);

  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-zygote",
      "--single-process",
    ],
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 30000 });
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
