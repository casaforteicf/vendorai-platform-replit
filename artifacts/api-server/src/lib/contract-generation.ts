import { logger } from "./logger.js";

export interface ContractData {
  dealTitulo: string;
  dealValor: string;
  clienteNome: string;
  clienteEmail: string;
  clienteTelefone: string;
  clienteDocumento?: string;
  clienteEmpresa?: string;
  tenantNome: string;
  dataHoje: string;
  produtosServicos: string;
  partnerName?: string;
  partnerEmail?: string;
  pedidosHtml?: string;
}

// ─── Default HTML template ────────────────────────────────────────────────────

function buildContractHtml(data: ContractData, isThreeParty: boolean): string {
  const partes = isThreeParty
    ? `<p><strong>CONTRATADA:</strong> ${data.tenantNome}, representada por seu representante legal.</p>
       <p><strong>PARCEIRO:</strong> ${data.partnerName ?? "Parceiro"}, ${data.partnerEmail ? `e-mail: ${data.partnerEmail}` : ""}.</p>
       <p><strong>CONTRATANTE:</strong> ${data.clienteNome}, ${data.clienteDocumento ? `CPF/CNPJ: ${data.clienteDocumento},` : ""} e-mail: ${data.clienteEmail}, telefone: ${data.clienteTelefone}.</p>`
    : `<p><strong>CONTRATADA:</strong> ${data.tenantNome}, representada por seu representante legal.</p>
       <p><strong>CONTRATANTE:</strong> ${data.clienteNome}, ${data.clienteDocumento ? `CPF/CNPJ: ${data.clienteDocumento},` : ""} e-mail: ${data.clienteEmail}, telefone: ${data.clienteTelefone}.</p>`;

  const pedidosSection = data.pedidosHtml
    ? `<h2>1. Objeto / Pedidos</h2>
       <p>O presente contrato abrange os seguintes serviços/produtos:</p>
       ${data.pedidosHtml}`
    : `<h2>1. Objeto</h2>
       <p>O presente contrato tem como objeto a prestação dos seguintes serviços/produtos:</p>
       <p><strong>${data.produtosServicos}</strong></p>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Contrato ${data.dealTitulo}</title>
<style>
  body { font-family: Arial, sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 40px; color: #333; }
  h1 { text-align: center; font-size: 22px; margin-bottom: 8px; }
  h2 { font-size: 16px; margin-top: 24px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  .header { text-align: center; margin-bottom: 32px; }
  .partes { background: #f8f9fa; padding: 16px; border-radius: 8px; margin: 16px 0; }
  .partes p { margin: 6px 0; }
  .valor { font-size: 18px; font-weight: bold; color: #2563eb; }
  .data { text-align: right; margin-top: 40px; font-size: 14px; color: #666; }
  .assinaturas { margin-top: 60px; display: flex; justify-content: space-between; gap: 24px; }
  .assinatura { flex: 1; text-align: center; border-top: 1px solid #333; padding-top: 8px; }
</style>
</head>
<body>
  <div class="header">
    <h1>CONTRATO DE PRESTAÇÃO DE SERVIÇOS</h1>
    <p style="font-size:14px;color:#666;">Ref: ${data.dealTitulo}</p>
  </div>

  <div class="partes">
    ${partes}
  </div>

  ${pedidosSection}

  <h2>2. Valor</h2>
  <p class="valor">${data.dealValor}</p>
  <p>Valor total do negócio, conforme proposta aceita.</p>

  <h2>3. Prazo e Vigência</h2>
  <p>O contrato entra em vigor na data de assinatura e terá vigência conforme especificado na proposta comercial.</p>

  <h2>4. Assinatura Eletrônica</h2>
  <p>As partes declaram que este contrato será assinado eletronicamente via ZapSign, conforme Lei 14.063/2020.</p>

  <div class="data">
    <p>${data.dataHoje}</p>
  </div>

  <div class="assinaturas">
    <div class="assinatura">
      <p><strong>Contratada</strong><br/>${data.tenantNome}</p>
    </div>
    ${isThreeParty ? `<div class="assinatura"><p><strong>Parceiro</strong><br/>${data.partnerName ?? ""}</p></div>` : ""}
    <div class="assinatura">
      <p><strong>Contratante</strong><br/>${data.clienteNome}</p>
    </div>
  </div>
</body>
</html>`;
}

// ─── Custom template: variable interpolation ──────────────────────────────────

export function interpolateTemplate(templateHtml: string, data: ContractData): string {
  const vars: Record<string, string> = {
    cliente_nome: data.clienteNome,
    cliente_email: data.clienteEmail,
    cliente_telefone: data.clienteTelefone,
    cliente_cpf_cnpj: data.clienteDocumento ?? "",
    cliente_empresa: data.clienteEmpresa ?? "",
    deal_titulo: data.dealTitulo,
    deal_valor: data.dealValor,
    empresa_nome: data.tenantNome,
    data_hoje: data.dataHoje,
    produtos_servicos: data.produtosServicos,
    parceiro_nome: data.partnerName ?? "",
    parceiro_email: data.partnerEmail ?? "",
    pedidos_lista: data.pedidosHtml ?? "",
  };

  return templateHtml.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    return key in vars ? vars[key] : `{{${key}}}`;
  });
}

// ─── PDF renderer (shared) ────────────────────────────────────────────────────

async function renderHtmlToPdf(html: string): Promise<Buffer> {
  try {
    const puppeteer = (await import("puppeteer-core")).default;
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH ?? "/usr/bin/chromium",
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "20px", bottom: "20px", left: "20px", right: "20px" },
    });
    await browser.close();
    return Buffer.from(pdf);
  } catch (err) {
    logger.warn({ err }, "contract-generation: puppeteer failed, falling back to HTML buffer");
    return Buffer.from(html, "utf-8");
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function generateContractPDF(data: ContractData, isThreeParty: boolean): Promise<Buffer> {
  const html = buildContractHtml(data, isThreeParty);
  return renderHtmlToPdf(html);
}

export async function generateContractFromTemplate(templateHtml: string, data: ContractData): Promise<Buffer> {
  const html = interpolateTemplate(templateHtml, data);
  return renderHtmlToPdf(html);
}

export const CONTRACT_VARIABLES = [
  { variable: "{{cliente_nome}}", label: "Nome do cliente" },
  { variable: "{{cliente_email}}", label: "E-mail do cliente" },
  { variable: "{{cliente_telefone}}", label: "Telefone do cliente" },
  { variable: "{{cliente_cpf_cnpj}}", label: "CPF/CNPJ do cliente" },
  { variable: "{{cliente_empresa}}", label: "Empresa do cliente" },
  { variable: "{{deal_titulo}}", label: "Título do negócio" },
  { variable: "{{deal_valor}}", label: "Valor total (formatado)" },
  { variable: "{{empresa_nome}}", label: "Nome da sua empresa" },
  { variable: "{{data_hoje}}", label: "Data de hoje" },
  { variable: "{{produtos_servicos}}", label: "Produtos/serviços (resumo)" },
  { variable: "{{pedidos_lista}}", label: "Tabela de pedidos selecionados" },
  { variable: "{{parceiro_nome}}", label: "Nome do parceiro (se houver)" },
];
