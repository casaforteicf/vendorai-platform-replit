import puppeteer from "puppeteer-core";

const CHROMIUM_PATH =
  process.env["CHROMIUM_PATH"] ??
  "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium-browser";

// ─── Formatters ───────────────────────────────────────────────────────────────

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmtBR = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo",
});

function money(v: number) { return fmtBRL.format(v); }
function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  const [y, m, day] = d.split("-").map(Number);
  return fmtBR.format(new Date(y!, m! - 1, day!, 12, 0, 0));
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DreLancamento {
  tipo: string;
  fornecedor?: string | null;
  valor: string | number;
  status: string;
  dataEmissao?: string | null;
  dataVencimento?: string | null;
  descricao?: string | null;
}

export interface PdfDreOptions {
  tenantName: string;
  obraNome: string;
  obraEndereco?: string | null;
  orcamentoTotal?: string | number | null;
  lancamentos: DreLancamento[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TIPO_LABEL: Record<string, string> = {
  material: "Material",
  mao_de_obra: "Mão de Obra",
  equipamento: "Equipamento",
  servico: "Serviço",
  imposto: "Imposto / Taxa",
  outros: "Outros",
};

const STATUS_LABEL: Record<string, string> = {
  pago: "Pago",
  pendente: "Pendente",
  cancelado: "Cancelado",
  em_analise: "Em análise",
};

// ─── HTML template ────────────────────────────────────────────────────────────

function buildHtml(opts: PdfDreOptions): string {
  const lancamentos = opts.lancamentos.filter((l) => l.status !== "cancelado");
  const totalGasto = lancamentos.reduce((s, l) => s + (Number(l.valor) || 0), 0);
  const totalPago = lancamentos
    .filter((l) => l.status === "pago")
    .reduce((s, l) => s + (Number(l.valor) || 0), 0);
  const totalPendente = lancamentos
    .filter((l) => l.status === "pendente")
    .reduce((s, l) => s + (Number(l.valor) || 0), 0);
  const orcamentoTotal = opts.orcamentoTotal ? Number(opts.orcamentoTotal) : null;
  const saldo = orcamentoTotal != null ? orcamentoTotal - totalGasto : null;
  const saldoPct = orcamentoTotal && orcamentoTotal > 0
    ? ((totalGasto / orcamentoTotal) * 100).toFixed(1)
    : null;

  // Group by tipo
  const byTipo: Record<string, number> = {};
  for (const l of lancamentos) {
    byTipo[l.tipo] = (byTipo[l.tipo] ?? 0) + (Number(l.valor) || 0);
  }
  const tiposOrdenados = Object.entries(byTipo).sort((a, b) => b[1] - a[1]);

  function renderTipoRows() {
    return tiposOrdenados.map(([tipo, val], i) => {
      const pct = totalGasto > 0 ? ((val / totalGasto) * 100).toFixed(1) : "0.0";
      const barW = totalGasto > 0 ? Math.round((val / totalGasto) * 100) : 0;
      return `
      <tr class="${i % 2 === 0 ? "row-even" : "row-odd"}">
        <td>${esc(TIPO_LABEL[tipo] ?? tipo)}</td>
        <td class="td-right">${money(val)}</td>
        <td class="td-center">${pct}%</td>
        <td style="width:160px;padding:6px 10px;">
          <div style="background:#e2e8f0;border-radius:4px;height:10px;overflow:hidden;">
            <div style="background:#2563eb;height:100%;width:${barW}%;border-radius:4px;"></div>
          </div>
        </td>
      </tr>`;
    }).join("");
  }

  function renderLancamentos() {
    const ativos = opts.lancamentos
      .filter((l) => l.status !== "cancelado")
      .sort((a, b) => (a.dataEmissao ?? "").localeCompare(b.dataEmissao ?? ""));
    if (!ativos.length) return `<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:20px">Nenhum lançamento registrado.</td></tr>`;
    return ativos.map((l, i) => {
      const statusCls = l.status === "pago" ? "status-pago" : "status-pendente";
      return `
      <tr class="${i % 2 === 0 ? "row-even" : "row-odd"}">
        <td>${fmtDate(l.dataEmissao)}</td>
        <td>${esc(TIPO_LABEL[l.tipo] ?? l.tipo)}</td>
        <td>${l.fornecedor ? esc(l.fornecedor) : "—"}</td>
        <td>${l.descricao ? esc(l.descricao) : "—"}</td>
        <td class="td-right" style="font-weight:600">${money(Number(l.valor) || 0)}</td>
        <td class="td-center"><span class="status-chip ${statusCls}">${STATUS_LABEL[l.status] ?? l.status}</span></td>
      </tr>`;
    }).join("");
  }

  const emitidoEm = fmtBR.format(new Date());

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

  .kpi-strip { display: flex; gap: 14px; padding: 18px 36px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
  .kpi-card { flex: 1; background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; }
  .kpi-card .kpi-label { font-size: 8.5pt; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
  .kpi-card .kpi-val { font-size: 14pt; font-weight: 700; color: #1e3a5f; }
  .kpi-card.kpi-danger .kpi-val { color: #dc2626; }
  .kpi-card.kpi-success .kpi-val { color: #16a34a; }
  .kpi-card.kpi-warn .kpi-val { color: #d97706; }
  .kpi-sub { font-size: 8.5pt; color: #64748b; margin-top: 3px; }

  .section { padding: 20px 36px; }
  .section + .section { border-top: 1px solid #e2e8f0; }
  .section-title { font-size: 12pt; font-weight: 700; color: #1e3a5f; margin-bottom: 14px; padding-bottom: 7px; border-bottom: 2px solid #2563eb; }

  table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
  th {
    background: #1e3a5f; color: white; text-align: left;
    padding: 8px 10px; font-size: 9pt; font-weight: 600;
  }
  th.th-right { text-align: right; }
  th.th-center { text-align: center; }
  td { padding: 6px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
  .row-even { background: #fff; }
  .row-odd { background: #f9fafb; }
  .td-right { text-align: right; }
  .td-center { text-align: center; }

  .status-chip { display: inline-block; font-size: 8.5pt; padding: 2px 8px; border-radius: 999px; font-weight: 600; }
  .status-pago { background: #d1fae5; color: #065f46; border: 1px solid #a7f3d0; }
  .status-pendente { background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }

  .row-total-table td { background: #1e3a5f; color: white; font-weight: 700; padding: 9px 10px; font-size: 10pt; }
  .row-total-table td.td-right { text-align: right; }

  .saldo-box {
    margin: 16px 0 0;
    padding: 14px 16px;
    border-radius: 8px;
    border: 2px solid;
    font-size: 10.5pt;
    font-weight: 600;
    display: flex;
    justify-content: space-between;
  }
  .saldo-positivo { background: #f0fdf4; border-color: #86efac; color: #15803d; }
  .saldo-negativo { background: #fef2f2; border-color: #fca5a5; color: #b91c1c; }
  .saldo-neutro { background: #f8fafc; border-color: #cbd5e1; color: #475569; }

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
    tr { page-break-inside: avoid; }
    .section { page-break-inside: avoid; }
  }
</style>
</head>
<body>

<div class="report-header">
  <div class="company-name">${esc(opts.tenantName)}</div>
  <h1>📈 DRE de Obra — Resultado Financeiro</h1>
  <div class="subtitle">${esc(opts.obraNome)}</div>
  <div class="header-meta">
    ${opts.obraEndereco ? `<div class="header-meta-item">📍 <strong>${esc(opts.obraEndereco)}</strong></div>` : ""}
    <div class="header-meta-item">🗓 Emitido em: <strong>${emitidoEm}</strong></div>
  </div>
</div>

<!-- KPIs -->
<div class="kpi-strip">
  <div class="kpi-card">
    <div class="kpi-label">Total Gasto</div>
    <div class="kpi-val">${money(totalGasto)}</div>
    ${saldoPct != null ? `<div class="kpi-sub">${saldoPct}% do orçamento</div>` : ""}
  </div>
  <div class="kpi-card kpi-success">
    <div class="kpi-label">Total Pago</div>
    <div class="kpi-val">${money(totalPago)}</div>
    <div class="kpi-sub">${lancamentos.filter(l => l.status === "pago").length} lançamentos</div>
  </div>
  <div class="kpi-card kpi-warn">
    <div class="kpi-label">A Pagar</div>
    <div class="kpi-val">${money(totalPendente)}</div>
    <div class="kpi-sub">${lancamentos.filter(l => l.status === "pendente").length} pendentes</div>
  </div>
  ${orcamentoTotal != null ? `
  <div class="kpi-card">
    <div class="kpi-label">Orçamento Total</div>
    <div class="kpi-val">${money(orcamentoTotal)}</div>
  </div>` : ""}
</div>

${orcamentoTotal != null ? `
<!-- Saldo vs Orçamento -->
<div class="section" style="padding-top:16px;padding-bottom:8px;">
  <div class="saldo-box ${saldo! >= 0 ? "saldo-positivo" : "saldo-negativo"}">
    <span>${saldo! >= 0 ? "✅ Saldo dentro do orçamento" : "⚠ Orçamento excedido"}</span>
    <span>${money(Math.abs(saldo!))} ${saldo! >= 0 ? "de sobra" : "acima do previsto"}</span>
  </div>
</div>` : ""}

<!-- Breakdown por tipo -->
<div class="section">
  <h2 class="section-title">Composição de Gastos por Categoria</h2>
  <table>
    <thead>
      <tr>
        <th>Categoria</th>
        <th class="th-right">Total</th>
        <th class="th-center">% do total</th>
        <th>Distribuição</th>
      </tr>
    </thead>
    <tbody>
      ${renderTipoRows()}
      <tr class="row-total-table">
        <td>TOTAL</td>
        <td class="td-right">${money(totalGasto)}</td>
        <td class="td-center">100%</td>
        <td></td>
      </tr>
    </tbody>
  </table>
</div>

<!-- Lançamentos detalhados -->
<div class="section">
  <h2 class="section-title">Lançamentos Detalhados</h2>
  <table>
    <thead>
      <tr>
        <th>Data</th>
        <th>Tipo</th>
        <th>Fornecedor</th>
        <th>Descrição</th>
        <th class="th-right">Valor</th>
        <th class="th-center">Status</th>
      </tr>
    </thead>
    <tbody>
      ${renderLancamentos()}
    </tbody>
  </table>
</div>

<div class="report-footer">
  <span>${esc(opts.tenantName)} — DRE: ${esc(opts.obraNome)}</span>
  <span>Emitido em ${emitidoEm}</span>
</div>

</body>
</html>`;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function gerarDrePdf(opts: PdfDreOptions): Promise<Buffer> {
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
