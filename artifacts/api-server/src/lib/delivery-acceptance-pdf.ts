import puppeteer from "puppeteer-core";

const CHROMIUM_PATH = process.env["CHROMIUM_PATH"] ?? "/usr/bin/chromium";

export type DeliveryAcceptancePdfItem = {
  name: string;
  quantity?: number | null;
  installation: string;
  functionality: string;
  interiorFinish: string;
  exteriorFinish: string;
  status: string;
  observation?: string | null;
};

export type DeliveryAcceptancePdfInput = {
  code: string;
  title: string;
  client: string;
  order?: string | null;
  address?: string | null;
  receiverName: string;
  receiverDocument?: string | null;
  receiverRole: "cliente" | "delegado";
  acceptanceType: "sem_ressalvas" | "com_ressalvas";
  observations?: string | null;
  items: DeliveryAcceptancePdfItem[];
  clientSignatureDataUrl: string;
  companySignatureDataUrl: string;
  companySignerName: string;
  signedAt: Date;
};

function esc(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function label(value: string) {
  const labels: Record<string, string> = {
    conforme: "Conforme",
    nao_conforme: "Não conforme",
    nao_se_aplica: "Não se aplica",
    sem_ressalvas: "Sem ressalvas",
    com_ressalvas: "Com ressalvas",
    cliente: "Cliente",
    delegado: "Pessoa autorizada",
  };
  return labels[value] ?? value;
}

function buildHtml(input: DeliveryAcceptancePdfInput) {
  const rows = input.items.map((item, index) => `
    <tr>
      <td>${index + 1}</td>
      <td><strong>${esc(item.name)}</strong><br><small>Qtd.: ${esc(item.quantity ?? 1)}</small></td>
      <td>${esc(label(item.installation))}</td>
      <td>${esc(label(item.functionality))}</td>
      <td>${esc(label(item.interiorFinish))}</td>
      <td>${esc(label(item.exteriorFinish))}</td>
      <td>${esc(label(item.status))}</td>
      <td>${esc(item.observation || "—")}</td>
    </tr>`).join("");

  const date = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo",
  }).format(input.signedAt);

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    body { font-family: Arial, sans-serif; color:#111827; font-size:10px; }
    h1 { font-size:20px; margin:0 0 4px; } h2 { font-size:13px; margin:16px 0 6px; }
    .muted { color:#6b7280; } .grid { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; }
    .box { border:1px solid #d1d5db; border-radius:8px; padding:8px; }
    table { width:100%; border-collapse:collapse; margin-top:8px; }
    th,td { border:1px solid #d1d5db; padding:5px; vertical-align:top; }
    th { background:#f3f4f6; font-size:9px; }
    .signatures { display:grid; grid-template-columns:1fr 1fr; gap:24px; margin-top:18px; }
    .signature { border-top:1px solid #111827; padding-top:6px; text-align:center; }
    .signature img { height:64px; max-width:240px; object-fit:contain; display:block; margin:0 auto 4px; }
    .accept { margin-top:14px; padding:10px; border:1px solid #9ca3af; border-radius:8px; }
  </style></head><body>
  <h1>Termo de Entrega, Vistoria e Aceite</h1>
  <div class="muted">Documento: ${esc(input.code)} · Gerado em ${esc(date)}</div>
  <div class="grid" style="margin-top:10px">
    <div class="box"><b>Cliente</b><br>${esc(input.client)}</div>
    <div class="box"><b>Pedido / Obra</b><br>${esc(input.order || input.title)}</div>
    <div class="box"><b>Recebedor</b><br>${esc(input.receiverName)}<br>${esc(label(input.receiverRole))}</div>
    <div class="box"><b>Documento</b><br>${esc(input.receiverDocument || "Não informado")}</div>
  </div>
  ${input.address ? `<div class="box" style="margin-top:8px"><b>Endereço</b><br>${esc(input.address)}</div>` : ""}
  <h2>Itens vistoriados</h2>
  <table><thead><tr>
    <th>#</th><th>Item</th><th>Instalação</th><th>Funcionalidade</th>
    <th>Acab. interno</th><th>Acab. externo</th><th>Situação</th><th>Observação</th>
  </tr></thead><tbody>${rows}</tbody></table>
  <div class="accept">
    <b>Aceite: ${esc(label(input.acceptanceType))}</b><br>
    Declaro que acompanhei a vistoria dos produtos/serviços relacionados neste documento,
    recebi as orientações necessárias de utilização, conservação e manutenção, bem como o
    respectivo Manual de Uso e Manutenção. Eventuais ressalvas ou pendências estão registradas neste termo.
    ${input.observations ? `<br><br><b>Observações gerais:</b> ${esc(input.observations)}` : ""}
  </div>
  <div class="signatures">
    <div class="signature"><img src="${esc(input.clientSignatureDataUrl)}"><b>${esc(input.receiverName)}</b><br>Cliente / recebedor</div>
    <div class="signature"><img src="${esc(input.companySignatureDataUrl)}"><b>${esc(input.companySignerName)}</b><br>Responsável pela empresa</div>
  </div>
  </body></html>`;
}

export async function generateDeliveryAcceptancePdf(input: DeliveryAcceptancePdfInput): Promise<Buffer> {
  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.setContent(buildHtml(input), { waitUntil: "load" });
    const pdf = await page.pdf({ format: "A4", landscape: true, printBackground: true });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}