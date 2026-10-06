import puppeteer from "puppeteer-core";

const CHROMIUM_PATH = process.env["CHROMIUM_PATH"] ?? "/usr/bin/chromium";

export type SupportOrderTimelineEntry = {
  at: string;
  userName?: string | null;
  text: string;
  visibility?: "interno" | "cliente";
  kind?: string | null;
};

export type SupportOrderPdfInput = {
  code: string;
  title: string;
  client: string;
  order?: string | null;
  responsible?: string | null;
  stage: string;
  openedAt?: Date | null;
  closedAt?: Date | null;
  problem: string;
  diagnosis?: string | null;
  service?: string | null;
  materials?: string[];
  situation?: string | null;
  recommendations?: string | null;
  observations?: string | null;
  timeline?: SupportOrderTimelineEntry[];
  attachments?: Array<{ name: string; description?: string | null; mimeType?: string | null }>;
  final: boolean;
};

function esc(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(value?: Date | string | null) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

function label(value?: string | null) {
  const labels: Record<string, string> = {
    chamado_cliente: "Chamado cliente",
    agendamento_assistencia: "Agendamento assistência",
    execucao_assistencia: "Execução da assistência",
    relatorio_assistencia: "Relatório da assistência",
    feedback_cliente: "Feedback cliente",
    fechamento_assistencia: "Fechamento assistência",
    resolvido: "Resolvido",
    parcial: "Parcial",
    nao_resolvido: "Não resolvido",
    aguardando_peca: "Aguardando peça",
    aguardando_retorno: "Aguardando retorno",
  };
  return value ? (labels[value] ?? value.replaceAll("_", " ")) : "—";
}

function buildHtml(input: SupportOrderPdfInput) {
  const timeline = (input.timeline ?? []).map((entry) => `
    <div class="timeline-item">
      <div class="timeline-meta">${esc(formatDate(entry.at))} · ${esc(entry.userName || "Equipe")} · ${entry.visibility === "cliente" ? "Compartilhado com cliente" : "Registro interno"}</div>
      <div>${esc(entry.text)}</div>
    </div>`).join("");

  const attachments = (input.attachments ?? []).map((item) => `
    <li><strong>${esc(item.name)}</strong>${item.description ? ` — ${esc(item.description)}` : ""}${item.mimeType ? ` <span class="muted">(${esc(item.mimeType)})</span>` : ""}</li>
  `).join("");

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
  <style>
    @page { size:A4; margin:14mm; }
    body { font-family:Arial,sans-serif; color:#111827; font-size:11px; line-height:1.4; }
    h1 { font-size:21px; margin:0; } h2 { font-size:13px; margin:18px 0 7px; }
    .header { display:flex; justify-content:space-between; gap:16px; align-items:flex-start; }
    .status { border:1px solid #9ca3af; border-radius:999px; padding:5px 9px; font-weight:700; }
    .muted { color:#6b7280; } .grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:12px; }
    .box { border:1px solid #d1d5db; border-radius:8px; padding:9px; }
    .section { border:1px solid #e5e7eb; border-radius:8px; padding:10px; white-space:pre-wrap; }
    .timeline-item { border-left:3px solid #d1d5db; padding:2px 0 8px 10px; margin-bottom:7px; }
    .timeline-meta { color:#6b7280; font-size:9px; margin-bottom:2px; }
    ul { margin:6px 0 0; padding-left:18px; }
    .footer { margin-top:24px; padding-top:8px; border-top:1px solid #e5e7eb; color:#6b7280; font-size:9px; }
  </style></head><body>
    <div class="header">
      <div><h1>ORDEM DE SERVIÇO</h1><div class="muted">Documento ${esc(input.code)} · ${input.final ? "FINAL" : "EM ANDAMENTO"}</div></div>
      <div class="status">${esc(label(input.stage))}</div>
    </div>
    <div class="grid">
      <div class="box"><b>Cliente</b><br>${esc(input.client)}</div>
      <div class="box"><b>Pedido / negócio</b><br>${esc(input.order || "—")}</div>
      <div class="box"><b>Responsável</b><br>${esc(input.responsible || "—")}</div>
      <div class="box"><b>Período</b><br>Abertura: ${esc(formatDate(input.openedAt))}<br>Conclusão: ${esc(formatDate(input.closedAt))}</div>
    </div>

    <h2>Relato / problema</h2><div class="section">${esc(input.problem || "Não informado")}</div>
    <h2>Diagnóstico</h2><div class="section">${esc(input.diagnosis || "Não informado")}</div>
    <h2>Serviço executado</h2><div class="section">${esc(input.service || "Não informado")}</div>
    <h2>Materiais / peças</h2><div class="section">${input.materials?.length ? input.materials.map((m) => "• " + esc(m)).join("<br>") : "Nenhum material informado"}</div>
    <h2>Situação</h2><div class="section"><b>${esc(label(input.situation))}</b>${input.recommendations ? `<br><br><b>Recomendações:</b> ${esc(input.recommendations)}` : ""}${input.observations ? `<br><br><b>Observações:</b> ${esc(input.observations)}` : ""}</div>

    <h2>Acompanhamento da execução</h2>
    <div class="section">${timeline || "Sem movimentações registradas."}</div>

    <h2>Anexos / evidências</h2>
    <div class="section">${attachments ? `<ul>${attachments}</ul>` : "Sem anexos registrados."}</div>

    <div class="footer">Documento gerado pelo Vendor.ai. A versão digital preserva a trilha completa de auditoria, anexos e movimentações.</div>
  </body></html>`;
}

export async function generateSupportOrderPdf(input: SupportOrderPdfInput): Promise<Buffer> {
  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.setContent(buildHtml(input), { waitUntil: "load" });
    const pdf = await page.pdf({ format: "A4", printBackground: true });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
