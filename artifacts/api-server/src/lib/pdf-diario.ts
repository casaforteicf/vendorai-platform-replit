import puppeteer from "puppeteer-core";
import http from "http";
import https from "https";

// ─── Chromium path (from nix store) ──────────────────────────────────────────
const CHROMIUM_PATH =
  process.env["CHROMIUM_PATH"] ??
  "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium-browser";

// ─── Date helpers (no date-fns) ───────────────────────────────────────────────

const fmtBR = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo",
});
const fmtLong = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric", month: "long", year: "numeric", timeZone: "America/Sao_Paulo",
});
const fmtWeekday = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long", timeZone: "America/Sao_Paulo",
});

function parseLocalDate(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y!, m! - 1, day!, 12, 0, 0);
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return fmtBR.format(parseLocalDate(d));
}
function fmtDateLong(d: string) {
  const dt = parseLocalDate(d);
  return `${fmtWeekday.format(dt)}, ${fmtLong.format(dt)}`;
}

// ─── Image fetch as base64 data URI ──────────────────────────────────────────

async function fetchBase64(url: string): Promise<string | null> {
  const port = process.env["PORT"] ?? "8080";
  const full = url.startsWith("http") ? url : `http://127.0.0.1:${port}${url}`;
  const mod = full.startsWith("https") ? https : http;

  return new Promise((resolve) => {
    const req = mod.get(full, { timeout: 8000 }, (res) => {
      if (!res.statusCode || res.statusCode >= 400) { resolve(null); return; }
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        const mime = res.headers["content-type"] ?? "image/jpeg";
        resolve(`data:${mime};base64,${Buffer.concat(chunks).toString("base64")}`);
      });
      res.on("error", () => resolve(null));
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DiarioEntry {
  id: string;
  data: string;
  conteudo: string;
  responsavelNome?: string | null;
  climaTempo?: string | null;
  maoDeObra?: number | null;
  observacoes?: string | null;
  status: string;
  fotos?: Array<{ url: string; caption?: string; uploadedAt: string }> | null;
  resumoIA?: string | null;
}

export interface PdfRelatorioDiarioOptions {
  tenantName: string;
  obraNome: string;
  obraEndereco?: string | null;
  dataInicio: string;
  dataFim: string;
  entradas: DiarioEntry[];
}

// ─── HTML template ────────────────────────────────────────────────────────────

async function buildHtml(opts: PdfRelatorioDiarioOptions): Promise<string> {
  const { tenantName, obraNome, obraEndereco, dataInicio, dataFim, entradas } = opts;

  // Fetch all photo URLs up front (max 4 per entry for performance)
  const imageMap = new Map<string, string>();
  const allFotos = entradas.flatMap((e) => (e.fotos ?? []).slice(0, 4));
  await Promise.all(
    allFotos.map(async (f) => {
      const b64 = await fetchBase64(f.url);
      if (b64) imageMap.set(f.url, b64);
    }),
  );

  const ocorrencias = entradas.filter((e) => e.observacoes && e.status !== "aprovado");
  const totalFuncionarios = entradas.reduce((s, e) => s + (e.maoDeObra ?? 0), 0);
  const totalDias = entradas.length;

  // ── Entry HTML ──
  function renderFotos(fotos: DiarioEntry["fotos"]) {
    if (!fotos?.length) return "";
    const imgs = fotos.slice(0, 4).map((f) => {
      const src = imageMap.get(f.url) ?? f.url;
      return `<div class="foto-cell"><img src="${src}" alt="${escHtml(f.caption ?? "")}" />${f.caption ? `<p class="foto-caption">${escHtml(f.caption)}</p>` : ""}</div>`;
    }).join("");
    return `<div class="fotos-grid">${imgs}</div>`;
  }

  function renderEntrada(e: DiarioEntry) {
    return `
    <div class="entry ${e.status === "aprovado" ? "approved" : ""}">
      <div class="entry-header">
        <div class="entry-date">${fmtDateLong(e.data)}</div>
        <div class="entry-meta">
          ${e.responsavelNome ? `<span class="meta-chip">👤 ${escHtml(e.responsavelNome)}</span>` : ""}
          ${e.climaTempo ? `<span class="meta-chip">🌤 ${escHtml(e.climaTempo)}</span>` : ""}
          ${e.maoDeObra != null ? `<span class="meta-chip">👷 ${e.maoDeObra} trabalhadores</span>` : ""}
          <span class="meta-chip status-${e.status}">${e.status === "aprovado" ? "✓ Aprovado" : "Em andamento"}</span>
        </div>
      </div>
      <div class="entry-body">
        <h4>Atividades realizadas</h4>
        <p class="conteudo">${escHtml(e.conteudo).replace(/\n/g, "<br>")}</p>
        ${e.observacoes ? `<div class="obs-box"><strong>⚠ Observações:</strong><br>${escHtml(e.observacoes).replace(/\n/g, "<br>")}</div>` : ""}
        ${e.resumoIA ? `<div class="resumo-ia-box"><span class="resumo-ia-label">✨ Resumo IA</span><p>${escHtml(e.resumoIA).replace(/\n/g, "<br>")}</p></div>` : ""}
        ${renderFotos(e.fotos)}
      </div>
    </div>`;
  }

  function renderOcorrencias() {
    if (!ocorrencias.length) return "";
    return `
    <div class="section ocorrencias-section">
      <h2 class="section-title">⚠ Ocorrências do Período</h2>
      ${ocorrencias.map((oc) => `
        <div class="ocorrencia-item">
          <div class="oc-date">${fmtDate(oc.data)} — ${oc.responsavelNome ? escHtml(oc.responsavelNome) : ""}</div>
          <p>${escHtml(oc.observacoes ?? "").replace(/\n/g, "<br>")}</p>
        </div>
      `).join("")}
    </div>`;
  }

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11pt; color: #1a1a1a; background: #fff; }

  /* ── Header ── */
  .report-header {
    background: linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%);
    color: white;
    padding: 28px 36px 24px;
    border-bottom: 4px solid #f59e0b;
  }
  .report-header h1 { font-size: 20pt; font-weight: 700; margin-bottom: 4px; }
  .report-header .subtitle { font-size: 12pt; opacity: 0.85; margin-bottom: 12px; }
  .header-meta { display: flex; gap: 24px; flex-wrap: wrap; margin-top: 12px; }
  .header-meta-item { font-size: 10pt; opacity: 0.9; }
  .header-meta-item strong { opacity: 1; }
  .company-name { font-size: 11pt; font-weight: 600; opacity: 0.7; margin-bottom: 6px; letter-spacing: 0.5px; text-transform: uppercase; }

  /* ── Summary cards ── */
  .summary { display: flex; gap: 16px; padding: 20px 36px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
  .summary-card { flex: 1; background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; text-align: center; }
  .summary-card .num { font-size: 22pt; font-weight: 700; color: #2563eb; }
  .summary-card .lbl { font-size: 9pt; color: #64748b; margin-top: 2px; }

  /* ── Sections ── */
  .section { padding: 24px 36px; }
  .section + .section { border-top: 1px solid #e2e8f0; }
  .section-title { font-size: 13pt; font-weight: 700; color: #1e3a5f; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 2px solid #2563eb; }

  /* ── Entry ── */
  .entry { margin-bottom: 24px; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; page-break-inside: avoid; }
  .entry.approved { border-left: 4px solid #10b981; }
  .entry-header {
    background: #f1f5f9;
    padding: 10px 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .entry-date { font-size: 11pt; font-weight: 700; color: #1e3a5f; text-transform: capitalize; }
  .entry-meta { display: flex; gap: 8px; flex-wrap: wrap; }
  .meta-chip {
    font-size: 9pt;
    padding: 2px 8px;
    background: white;
    border: 1px solid #cbd5e1;
    border-radius: 999px;
    color: #475569;
    white-space: nowrap;
  }
  .status-aprovado { border-color: #10b981; color: #065f46; background: #d1fae5; }
  .entry-body { padding: 14px 16px; }
  .entry-body h4 { font-size: 10pt; font-weight: 600; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
  .conteudo { font-size: 10.5pt; line-height: 1.6; color: #374151; margin-bottom: 12px; }
  .obs-box {
    background: #fffbeb;
    border: 1px solid #fde68a;
    border-left: 4px solid #f59e0b;
    border-radius: 6px;
    padding: 10px 12px;
    font-size: 10pt;
    color: #78350f;
    margin-bottom: 12px;
    line-height: 1.5;
  }

  .resumo-ia-box {
    background: #f0f9ff;
    border: 1px solid #bae6fd;
    border-left: 4px solid #0ea5e9;
    border-radius: 6px;
    padding: 10px 12px;
    font-size: 10pt;
    color: #0c4a6e;
    margin-bottom: 12px;
    line-height: 1.5;
  }
  .resumo-ia-label { font-weight: 700; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 4px; color: #0284c7; }

  /* ── Photo grid ── */
  .fotos-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 12px; }
  .foto-cell { border-radius: 6px; overflow: hidden; }
  .foto-cell img { width: 100%; height: 120px; object-fit: cover; display: block; border-radius: 4px; }
  .foto-caption { font-size: 8pt; color: #64748b; text-align: center; padding: 3px 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  /* ── Ocorrências ── */
  .ocorrencias-section { background: #fffbeb; }
  .ocorrencias-section .section-title { color: #92400e; border-bottom-color: #f59e0b; }
  .ocorrencia-item { background: white; border: 1px solid #fde68a; border-left: 4px solid #f59e0b; border-radius: 6px; padding: 12px 14px; margin-bottom: 12px; }
  .oc-date { font-size: 9.5pt; font-weight: 600; color: #92400e; margin-bottom: 6px; }

  /* ── Footer ── */
  .report-footer {
    margin-top: 32px;
    padding: 16px 36px;
    background: #f8fafc;
    border-top: 1px solid #e2e8f0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 9pt;
    color: #94a3b8;
  }

  @media print {
    .entry { page-break-inside: avoid; }
    .section { page-break-inside: avoid; }
  }
</style>
</head>
<body>

<!-- Header -->
<div class="report-header">
  <div class="company-name">${escHtml(tenantName)}</div>
  <h1>📋 Diário de Obra</h1>
  <div class="subtitle">${escHtml(obraNome)}</div>
  <div class="header-meta">
    ${obraEndereco ? `<div class="header-meta-item">📍 <strong>${escHtml(obraEndereco)}</strong></div>` : ""}
    <div class="header-meta-item">📅 Período: <strong>${fmtDate(dataInicio)} a ${fmtDate(dataFim)}</strong></div>
    <div class="header-meta-item">🗓 Emitido em: <strong>${fmtBR.format(new Date())}</strong></div>
  </div>
</div>

<!-- Summary -->
<div class="summary">
  <div class="summary-card">
    <div class="num">${totalDias}</div>
    <div class="lbl">Dias registrados</div>
  </div>
  <div class="summary-card">
    <div class="num">${totalFuncionarios}</div>
    <div class="lbl">Total trabalhadores·dia</div>
  </div>
  <div class="summary-card">
    <div class="num">${allFotos.length}</div>
    <div class="lbl">Fotos registradas</div>
  </div>
  <div class="summary-card">
    <div class="num">${ocorrencias.length}</div>
    <div class="lbl">Ocorrências</div>
  </div>
</div>

<!-- Entries -->
<div class="section">
  <h2 class="section-title">Registro Diário</h2>
  ${entradas.length ? entradas.map(renderEntrada).join("") : "<p style='color:#94a3b8;text-align:center;padding:24px'>Nenhuma entrada no período selecionado.</p>"}
</div>

${renderOcorrencias()}

<!-- Footer -->
<div class="report-footer">
  <span>${escHtml(tenantName)} — Diário de Obra: ${escHtml(obraNome)}</span>
  <span>Período: ${fmtDate(dataInicio)} a ${fmtDate(dataFim)}</span>
</div>

</body>
</html>`;
}

function escHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function gerarRelatorioDiarioPdf(opts: PdfRelatorioDiarioOptions): Promise<Buffer> {
  const html = await buildHtml(opts);

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
