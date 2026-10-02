import puppeteer from "puppeteer-core";

const CHROMIUM_PATH =
  process.env["CHROMIUM_PATH"] ??
  "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium-browser";

function esc(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? esc(value)
    : date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export type InstallationAcceptanceSnapshot = {
  hash: string;
  acceptedAt: string;
  tenantName: string;
  cardCode: string;
  cardTitle: string;
  customerName: string;
  orderTitle: string;
  receiverName: string;
  receiverDocument?: string | null;
  receiverRelationship?: string | null;
  customerSignatureUrl: string;
  companySignatureUrl: string;
  responsibleName?: string | null;
  visitNumber: number;
  documents?: string[];
  items: Array<{
    productName: string;
    quantity: number;
    unitIndex?: number | null;
    location?: string | null;
    status: string;
    observation?: string | null;
    attributes?: Record<string, unknown>;
  }>;
};

export async function generateInstallationAcceptancePdf(snapshot: InstallationAcceptanceSnapshot): Promise<Buffer> {
  const rows = snapshot.items.map((item) => {
    const attrs = Object.entries(item.attributes ?? {})
      .slice(0, 8)
      .map(([key, value]) => `<span><strong>${esc(key.replace(/_/g, " "))}:</strong> ${esc(typeof value === "object" ? JSON.stringify(value) : value)}</span>`)
      .join(" · ");
    return `<tr>
      <td>${esc(item.productName)}${item.unitIndex ? ` <small>(unidade ${item.unitIndex})</small>` : ""}</td>
      <td>${esc(item.quantity)}</td>
      <td>${esc(item.location || "—")}</td>
      <td>${esc(item.status)}</td>
      <td>${attrs || "—"}${item.observation ? `<div class="obs">${esc(item.observation)}</div>` : ""}</td>
    </tr>`;
  }).join("");

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111827;margin:0;font-size:11px}
    header{padding:28px 34px;background:#f8fafc;border-bottom:3px solid #111827}
    h1{font-size:20px;margin:0 0 6px}.muted{color:#64748b}.section{padding:18px 34px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 20px}.field{padding:8px 0;border-bottom:1px solid #e5e7eb}
    table{width:100%;border-collapse:collapse;margin-top:12px}th{background:#111827;color:#fff;text-align:left;padding:8px}
    td{padding:8px;border-bottom:1px solid #e5e7eb;vertical-align:top}.obs{margin-top:4px;color:#475569}
    .signatures{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:28px}.signature{border-top:1px solid #111827;padding-top:8px}
    .signature img{max-width:190px;max-height:75px;display:block;margin:0 0 8px}.hash{font-family:monospace;font-size:8px;word-break:break-all;color:#64748b;margin-top:24px}
    footer{padding:14px 34px;border-top:1px solid #e5e7eb;color:#64748b;font-size:9px}
  </style></head><body>
  <header><h1>Termo de Instalação e Aceite</h1><div class="muted">${esc(snapshot.tenantName)} · ${esc(snapshot.cardCode)}</div></header>
  <section class="section">
    <div class="grid">
      <div class="field"><strong>Cliente</strong><br>${esc(snapshot.customerName)}</div>
      <div class="field"><strong>Pedido</strong><br>${esc(snapshot.orderTitle)}</div>
      <div class="field"><strong>Processo</strong><br>${esc(snapshot.cardTitle)}</div>
      <div class="field"><strong>Visita</strong><br>${esc(snapshot.visitNumber)}</div>
      <div class="field"><strong>Recebedor</strong><br>${esc(snapshot.receiverName)}</div>
      <div class="field"><strong>Documento / vínculo</strong><br>${esc(snapshot.receiverDocument || "—")} · ${esc(snapshot.receiverRelationship || "—")}</div>
      <div class="field"><strong>Responsável da empresa</strong><br>${esc(snapshot.responsibleName || "—")}</div>
      <div class="field"><strong>Aceite registrado em</strong><br>${fmtDate(snapshot.acceptedAt)}</div>
    </div>
    <h2 style="font-size:14px;margin:22px 0 0">Itens conferidos</h2>
    <table><thead><tr><th>Item</th><th>Qtd.</th><th>Local</th><th>Status</th><th>Dados/observações</th></tr></thead><tbody>${rows}</tbody></table>
    ${snapshot.documents?.length ? `<h2 style="font-size:14px;margin:22px 0 8px">Manuais e garantias aplicáveis</h2><ul>${snapshot.documents.map((url) => `<li style="margin-bottom:4px">${esc(url)}</li>`).join("")}</ul>` : ""}
    <div class="signatures">
      <div class="signature"><img src="${esc(snapshot.customerSignatureUrl)}"><strong>${esc(snapshot.receiverName)}</strong><br><span class="muted">Cliente / representante</span></div>
      <div class="signature"><img src="${esc(snapshot.companySignatureUrl)}"><strong>${esc(snapshot.responsibleName || snapshot.tenantName)}</strong><br><span class="muted">Empresa / instalador responsável</span></div>
    </div>
    <p class="hash"><strong>Integridade do aceite:</strong> ${esc(snapshot.hash)}</p>
  </section>
  <footer>Documento gerado a partir do registro imutável de aceite do Vendor.ai. Alterações posteriores no processo não modificam este snapshot.</footer>
  </body></html>`;

  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({ format: "A4", printBackground: true, margin: { top: "10mm", right: "8mm", bottom: "10mm", left: "8mm" } });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}